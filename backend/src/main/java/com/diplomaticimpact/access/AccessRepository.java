package com.diplomaticimpact.access;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** SQL adapter for the deployed public schema and private review aggregate. */
@Repository
public class AccessRepository {
  private final JdbcTemplate db; private final ObjectMapper json;
  public AccessRepository(JdbcTemplate db,ObjectMapper json) { this.db=db; this.json=json; }
  private List<Map<String,Object>> rows(String sql,Object...args) { return db.queryForList(sql,args); }
  private Map<String,Object> one(String sql,Object...args) {
    var rows=rows(sql,args); if(rows.isEmpty()) throw AccessPolicy.error(404,"Record not found."); return rows.getFirst();
  }
  String encode(Object value) { try {return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException(e);} }
  Map<String,Object> decode(Object value) { try{return json.readValue(value.toString(),new TypeReference<Map<String,Object>>(){});}catch(Exception e){throw new IllegalStateException("Invalid stored data",e);} }
  static UUID uuid(Map<String,Object> row,String key) { return UUID.fromString(row.get(key).toString()); }
  static Instant instant(Object value) {
    if (value instanceof Timestamp timestamp) return timestamp.toInstant();
    if (value instanceof java.time.OffsetDateTime offset) return offset.toInstant();
    if (value instanceof java.time.LocalDateTime local) return local.toInstant(java.time.ZoneOffset.UTC);
    return Instant.parse(value.toString());
  }
  boolean admin(UUID id) { return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=? AND status='Approved' AND 'admin'=ANY(roles))",Boolean.class,id)); }
  boolean activeUser(UUID id) { return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=? AND status='Approved' AND (roles && ARRAY['admin','student','parent']))",Boolean.class,id)); }
  void lockSession(UUID id) {
    // Serialize invitation/release work without requiring UPDATE rights on the
    // public sessions table. The transaction-scoped lock is released on commit
    // or rollback; the regular SELECT also verifies that the session exists.
    rows("SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))",id.toString());
    one("SELECT id FROM public.sessions WHERE id=?",id);
  }
  List<Map<String,Object>> catalog() { return rows("SELECT s.id,s.title,s.program_id,p.title AS program_title,s.date FROM public.sessions s JOIN public.programs p ON p.id=s.program_id ORDER BY s.date DESC NULLS LAST,s.id"); }
  List<Map<String,Object>> students(UUID session) {
    return rows("SELECT DISTINCT p.id,p.full_name,p.elevate_me_id,sh.id AS sheet_id,sh.state,sh.excluded_reason FROM public.registrations r JOIN public.profiles p ON p.id=r.student_id JOIN public.sessions s ON s.program_id=r.program_id LEFT JOIN evaluator_private.sheets sh ON sh.session_id=s.id AND sh.student_id=p.id WHERE s.id=? AND r.status='Confirmed' AND (r.session_id IS NULL OR r.session_id=s.id) ORDER BY p.full_name,p.id",session);
  }
  List<Map<String,Object>> invitations() { return rows("SELECT i.id,i.session_id,i.evaluator_name,i.evaluator_email,i.organisation,i.evaluator_title,i.created_at,i.expires_at,i.consumed_at,i.revoked_at,s.title AS session_title,(SELECT count(*) FROM evaluator_private.sheets sh WHERE sh.invitation_id=i.id) AS assigned_count,CASE WHEN i.revoked_at IS NOT NULL THEN 'REVOKED' WHEN i.expires_at<=clock_timestamp() THEN 'EXPIRED' WHEN i.consumed_at IS NOT NULL THEN 'ACTIVATED' ELSE 'AWAITING_ACTIVATION' END AS status FROM evaluator_private.invitations i JOIN public.sessions s ON s.id=i.session_id ORDER BY i.created_at DESC LIMIT 500"); }
  Map<String,Object> invitation(UUID id) { return one("SELECT * FROM evaluator_private.invitations WHERE id=? FOR UPDATE",id); }
  UUID insertInvite(UUID admin,AccessRequests.Invite input,String hash,UUID replaces) {
    UUID id=AccessPolicy.id();
    db.update("INSERT INTO evaluator_private.invitations(id,session_id,evaluator_name,evaluator_email,organisation,evaluator_title,token_hash,created_by,replaces_id) VALUES (?,?,?,?,?,?,?,?,?)",id,input.sessionId(),input.name().trim(),input.email().trim(),Objects.toString(input.organisation(),""),Objects.toString(input.title(),""),hash,admin,replaces);
    return id;
  }
  boolean hasSheet(UUID session,UUID student) {return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM evaluator_private.sheets WHERE session_id=? AND student_id=?)",Boolean.class,session,student));}
  void assign(UUID invite,UUID session,UUID student) {db.update("INSERT INTO evaluator_private.sheets(id,session_id,student_id,invitation_id) VALUES (?,?,?,?)",AccessPolicy.id(),session,student,invite);}
  void replace(UUID old,UUID replacement) {db.update("UPDATE evaluator_private.sheets SET invitation_id=?,version=version+1 WHERE invitation_id=?",replacement,old);}
  List<UUID> assignedStudents(UUID invitation) {return db.query("SELECT student_id FROM evaluator_private.sheets WHERE invitation_id=?",(r,n)->r.getObject(1,UUID.class),invitation);}
  void revoke(UUID id) {db.update("UPDATE evaluator_private.invitations SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=?",id);}
  Map<String,Object> consume(String hash) {
    var result=rows("UPDATE evaluator_private.invitations SET consumed_at=clock_timestamp() WHERE token_hash=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp() RETURNING id,expires_at",hash);
    if(result.isEmpty()) throw AccessPolicy.error(401,"This link has been used, revoked or expired. Ask DI for a replacement."); return result.getFirst();
  }
  void session(UUID invitation,String hash,Object expires) {db.update("INSERT INTO evaluator_private.sessions(id,invitation_id,token_hash,expires_at) VALUES (?,?,?,?)",AccessPolicy.id(),invitation,hash,expires);}
  void endSession(String hash) {db.update("UPDATE evaluator_private.sessions SET expires_at=LEAST(expires_at,clock_timestamp()) WHERE token_hash=?",hash);}
  Map<String,Object> guest(String hash) {
    var result=rows("SELECT i.* FROM evaluator_private.sessions gs JOIN evaluator_private.invitations i ON i.id=gs.invitation_id WHERE gs.token_hash=? FOR UPDATE OF i",hash);
    if(result.isEmpty()) throw AccessPolicy.error(401,"Access expired or unavailable. Ask DI for a replacement.");
    Map<String,Object> i=result.getFirst();
    if(!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM evaluator_private.invitations i JOIN evaluator_private.sessions gs ON gs.invitation_id=i.id WHERE i.id=? AND gs.token_hash=? AND i.revoked_at IS NULL AND i.expires_at>clock_timestamp() AND gs.expires_at>clock_timestamp())",Boolean.class,i.get("id"),hash)))
      throw AccessPolicy.error(401,"Access expired or revoked. Your saved work remains with DI.");
    return i;
  }
  List<Map<String,Object>> roster(UUID invite) {return rows("SELECT sh.id,sh.state,sh.version,p.full_name,p.elevate_me_id FROM evaluator_private.sheets sh JOIN public.profiles p ON p.id=sh.student_id WHERE sh.invitation_id=? AND sh.excluded_reason IS NULL ORDER BY p.full_name,sh.id",invite);}
  Map<String,Object> sheet(UUID id) {return one("SELECT sh.*,p.full_name,p.elevate_me_id,s.title AS session_title,s.program_id,pr.title AS program_title FROM evaluator_private.sheets sh JOIN public.profiles p ON p.id=sh.student_id JOIN public.sessions s ON s.id=sh.session_id JOIN public.programs pr ON pr.id=s.program_id WHERE sh.id=? FOR UPDATE OF sh",id);}
  void save(UUID id,AccessRequests.Save input) {db.update("UPDATE evaluator_private.sheets SET scores=?::jsonb,feedback=?,version=version+1 WHERE id=?",encode(input.scores()),input.feedback(),id);}
  UUID submit(UUID id,UUID invitation,Map<String,Object> identity) {
    UUID revision=AccessPolicy.id();
    db.update("INSERT INTO evaluator_private.revisions(id,sheet_id,invitation_id,evaluator_snapshot,scores,feedback) SELECT ?,id,?,?::jsonb,scores,feedback FROM evaluator_private.sheets WHERE id=?",revision,invitation,encode(identity),id);
    db.update("UPDATE evaluator_private.sheets SET state='SUBMITTED',current_revision_id=?,change_request='',version=version+1 WHERE id=?",revision,id);return revision;
  }
  List<Map<String,Object>> queue() {return rows("SELECT sh.id,sh.session_id,sh.state,sh.version,sh.excluded_reason,sh.current_revision_id,p.full_name,s.title AS session_title,i.evaluator_name FROM evaluator_private.sheets sh JOIN public.profiles p ON p.id=sh.student_id JOIN public.sessions s ON s.id=sh.session_id JOIN evaluator_private.invitations i ON i.id=sh.invitation_id ORDER BY s.date DESC NULLS LAST,p.full_name LIMIT 1000");}
  Map<String,Object> revision(UUID id) {var r=one("SELECT * FROM evaluator_private.revisions WHERE id=?",id);r.put("scores",decode(r.get("scores")));r.put("evaluator_snapshot",decode(r.get("evaluator_snapshot")));return r;}
  List<Map<String,Object>> history(UUID sheet) {var result=rows("SELECT r.id,r.submitted_at,r.evaluator_snapshot,v.decision,v.admin_id,v.internal_note,v.evaluator_message,v.created_at AS reviewed_at FROM evaluator_private.revisions r LEFT JOIN evaluator_private.reviews v ON v.revision_id=r.id WHERE r.sheet_id=? ORDER BY r.submitted_at DESC",sheet);result.forEach(r->r.put("evaluator_snapshot",decode(r.get("evaluator_snapshot"))));return result;}
  void review(UUID sheet,UUID admin,AccessRequests.Review input) {
    db.update("INSERT INTO evaluator_private.reviews(id,revision_id,admin_id,decision,internal_note,evaluator_message) VALUES (?,?,?,?,?,?)",AccessPolicy.id(),input.revisionId(),admin,input.decision(),input.internalNote(),input.message());
    db.update("UPDATE evaluator_private.sheets SET state=?,change_request=?,version=version+1 WHERE id=?",input.decision(),input.message(),sheet);
  }
  void exclude(UUID sheet,String reason) {db.update("UPDATE evaluator_private.sheets SET excluded_reason=?,version=version+1 WHERE id=?",reason,sheet);}
  List<Map<String,Object>> lockSheets(UUID session) {return rows("SELECT * FROM evaluator_private.sheets WHERE session_id=? ORDER BY id FOR UPDATE",session);}
  List<Map<String,Object>> outstanding(UUID session) {
    return rows("SELECT DISTINCT p.id,p.full_name FROM public.registrations reg JOIN public.sessions s ON s.program_id=reg.program_id JOIN public.profiles p ON p.id=reg.student_id LEFT JOIN evaluator_private.sheets sh ON sh.session_id=s.id AND sh.student_id=p.id WHERE s.id=? AND reg.status='Confirmed' AND (reg.session_id IS NULL OR reg.session_id=s.id) AND (sh.id IS NULL OR (sh.excluded_reason IS NULL AND sh.state NOT IN ('APPROVED','RELEASED'))) ORDER BY p.full_name",session);
  }
  boolean approved(UUID revision) {return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM evaluator_private.reviews WHERE revision_id=? AND decision='APPROVED')",Boolean.class,revision));}
  void publish(Map<String,Object> sheet,Map<String,Object> revision) {
    UUID id=uuid(sheet,"id");
    db.update("INSERT INTO public.evaluations(id,slug,student_id,session_id,program_id,state,released,released_at,remarks) SELECT ?,?, ?,s.id,s.program_id,'Locked',true,clock_timestamp(),? FROM public.sessions s WHERE s.id=? ON CONFLICT(id) DO UPDATE SET state='Locked',released=true,released_at=clock_timestamp(),remarks=EXCLUDED.remarks,evaluator_id=NULL,recommendation_for_di=NULL",
        id,"access-"+id,sheet.get("student_id"),revision.get("feedback"),sheet.get("session_id"));
    @SuppressWarnings("unchecked") Map<String,Object> scores=(Map<String,Object>)revision.get("scores");
    scores.forEach((key,value)->db.update("INSERT INTO public.evaluation_scores(evaluation_id,criterion_key,score) VALUES (?,?,?) ON CONFLICT(evaluation_id,criterion_key) DO UPDATE SET score=EXCLUDED.score",id,key,value));
    db.update("UPDATE evaluator_private.sheets SET state='RELEASED',released_revision_id=current_revision_id,version=version+1 WHERE id=?",id);
  }
  void audit(String actor,String action,UUID id) {db.update("INSERT INTO evaluator_private.audit(actor,action,entity_id) VALUES (?,?,?)",actor,action,id);}
  List<UUID> admins() {return db.query("SELECT id FROM public.profiles WHERE status='Approved' AND 'admin'=ANY(roles)",(r,n)->r.getObject(1,UUID.class));}
  List<UUID> linkedParents(UUID student) {return db.query("SELECT parent_id FROM public.parent_links WHERE student_id=? AND status IN ('Approved','Verified')",(r,n)->r.getObject(1,UUID.class),student);}
  void notify(UUID recipient,String key,String message,String destination) {
    UUID id=AccessPolicy.id(); int n=db.update("INSERT INTO evaluator_private.notifications(id,recipient_id,event_key,message,destination) VALUES (?,?,?,?,?) ON CONFLICT(recipient_id,event_key) DO NOTHING",id,recipient,key,message,destination);
    if(n==1) db.update("INSERT INTO evaluator_private.mail_outbox(id) VALUES (?)",id);
  }
  List<Map<String,Object>> notifications(UUID user) {return rows("SELECT id,message,destination,read_at,created_at FROM evaluator_private.notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 100",user);}
  void read(UUID user,UUID id) {db.update("UPDATE evaluator_private.notifications SET read_at=clock_timestamp() WHERE id=? AND recipient_id=?",id,user);}
  List<Map<String,Object>> delivery() {return rows("SELECT o.id,o.attempts,o.sent_at,o.last_error,o.next_attempt_at,n.message,n.created_at FROM evaluator_private.mail_outbox o JOIN evaluator_private.notifications n ON n.id=o.id ORDER BY n.created_at DESC LIMIT 100");}
  Map<String,Object> nextMail() {var r=rows("SELECT o.id,n.message,n.destination,p.email FROM evaluator_private.mail_outbox o JOIN evaluator_private.notifications n ON n.id=o.id JOIN public.profiles p ON p.id=n.recipient_id WHERE o.sent_at IS NULL AND o.attempts<5 AND o.next_attempt_at<=clock_timestamp() ORDER BY n.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED");return r.isEmpty()?null:r.getFirst();}
  void mailResult(UUID id,boolean success) {db.update("UPDATE evaluator_private.mail_outbox SET attempts=attempts+1,sent_at=CASE WHEN ? THEN clock_timestamp() ELSE NULL END,last_error=CASE WHEN ? THEN NULL ELSE 'Delivery failed; check server mail configuration' END,next_attempt_at=clock_timestamp()+interval '5 minutes' WHERE id=?",success,success,id);}
}
