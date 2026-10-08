package com.diplomaticimpact.access;

import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.diplomaticimpact.access.AccessPolicy.*;
import static com.diplomaticimpact.access.AccessRepository.uuid;

/** Use cases; all guest mutations revalidate access in the same transaction as writes. */
@Service
public class AccessService {
  private final AccessRepository repo; private final String publicUrl;
  public AccessService(AccessRepository repo,@Value("${access.public-url}") String publicUrl) {this.repo=repo;this.publicUrl=publicUrl.replaceAll("/$","");}
  public record Activation(String token,Instant expiresAt) {}
  @Transactional public Map<String,Object> invite(UUID admin,AccessRequests.Invite input) {
    repo.lockSession(input.sessionId());
    Set<UUID> allowed=new HashSet<>(); repo.students(input.sessionId()).forEach(s->allowed.add(uuid(s,"id")));
    Set<UUID> selected=new HashSet<>(input.studentIds());
    if(selected.contains(null)||!allowed.containsAll(selected)) throw error(422,"Select confirmed students in this session.");
    for(UUID student:selected) if(repo.hasSheet(input.sessionId(),student)) throw error(409,"A selected student already has an evaluator. Replace their existing invitation instead.");
    String token=token(); UUID id=repo.insertInvite(admin,input,hash(token),null);
    selected.forEach(student->repo.assign(id,input.sessionId(),student)); repo.audit(admin.toString(),"INVITATION_CREATED",id);
    return link(id,token);
  }
  private Map<String,Object> link(UUID id,String token) {return Map.of("id",id,"url",publicUrl+"/evaluate/invite#t="+token,"expiresAt",repo.invitation(id).get("expires_at"));}
  @Transactional public Map<String,Object> replace(UUID admin,UUID id) {
    var previous=repo.invitation(id); List<UUID> students=repo.assignedStudents(id);
    if(students.isEmpty()) throw error(409,"This invitation no longer has assignments.");
    var input=new AccessRequests.Invite(uuid(previous,"session_id"),previous.get("evaluator_name").toString(),previous.get("evaluator_email").toString(),previous.get("organisation").toString(),previous.get("evaluator_title").toString(),students);
    String token=token(); UUID next=repo.insertInvite(admin,input,hash(token),id);
    repo.revoke(id);repo.replace(id,next);repo.audit(admin.toString(),"INVITATION_REPLACED",id);return link(next,token);
  }
  @Transactional public void revoke(UUID admin,UUID id) {repo.invitation(id);repo.revoke(id);repo.audit(admin.toString(),"INVITATION_REVOKED",id);}
  @Transactional public Activation activate(String token) {
    var invite=repo.consume(hash(token));String session=token(); repo.session(uuid(invite,"id"),hash(session),invite.get("expires_at"));
    repo.audit("invitation:"+invite.get("id"),"INVITATION_ACTIVATED",uuid(invite,"id"));return new Activation(session,AccessRepository.instant(invite.get("expires_at")));
  }
  private Map<String,Object> identity(Map<String,Object> i) {return Map.of("name",i.get("evaluator_name"),"email",i.get("evaluator_email"),"organisation",i.get("organisation"),"title",i.get("evaluator_title"));}
  @Transactional public Map<String,Object> workspace(String token) {
    var i=repo.guest(hash(token));return Map.of("identity",identity(i),"expiresAt",i.get("expires_at"),"serverTime",Instant.now(),"students",repo.roster(uuid(i,"id")));
  }
  private Map<String,Object> assigned(Map<String,Object> i,UUID id) {
    var sheet=repo.sheet(id);
    if(!uuid(i,"id").equals(uuid(sheet,"invitation_id")) || sheet.get("excluded_reason")!=null) throw error(404,"Student not assigned to this invitation.");return sheet;
  }
  private Map<String,Object> studentPreview(Map<String,Object> sheet,Map<String,Object> revision) {
    return Map.of("id",sheet.get("id"),"studentName",sheet.get("full_name"),"programName",sheet.get("program_title"),"sessionName",sheet.get("session_title"),"scores",revision.get("scores"),"feedback",revision.get("feedback"));
  }
  private Map<String,Object> guestView(Map<String,Object> sheet) {
    var out=new LinkedHashMap<String,Object>();for(String k:List.of("id","full_name","elevate_me_id","state","version","feedback","change_request","session_title","program_title"))out.put(k,sheet.get(k));
    out.put("scores",repo.decode(sheet.get("scores")));return out;
  }
  @Transactional public Map<String,Object> guestSheet(String token,UUID id) {return guestView(assigned(repo.guest(hash(token)),id));}
  @Transactional public Map<String,Object> save(String token,UUID id,AccessRequests.Save input,boolean submit) {
    var i=repo.guest(hash(token));var sheet=assigned(i,id);
    if(!Set.of("DRAFT","CHANGES_REQUESTED").contains(sheet.get("state"))) throw error(409,"Submitted reports are read-only until DI requests changes.");
    if(((Number)sheet.get("version")).intValue()!=input.version()) throw error(409,"This sheet changed. Reload before saving; your unsaved input is still visible.");
    scores(input.scores(),submit);repo.save(id,input);
    if(submit){
      UUID revision=repo.submit(id,uuid(i,"id"),identity(i));repo.audit("invitation:"+i.get("id"),"EVALUATION_SUBMITTED",revision);
      for(UUID admin:repo.admins())repo.notify(admin,"submitted:"+revision,"An evaluation is ready for DI review.","/admin/evaluations/"+id);
    }
    return guestView(repo.sheet(id));
  }
  @Transactional public Map<String,Object> detail(UUID id) {
    var sh=repo.sheet(id);var out=new LinkedHashMap<>(guestView(sh));out.put("history",repo.history(id));
    if(sh.get("current_revision_id")!=null){var revision=repo.revision(uuid(sh,"current_revision_id"));out.put("revision",revision);out.put("studentPreview",studentPreview(sh,revision));}
    return out;
  }
  @Transactional public void review(UUID admin,UUID id,AccessRequests.Review input) {
    var sh=repo.sheet(id);
    if(!"SUBMITTED".equals(sh.get("state")) || !input.revisionId().equals(sh.get("current_revision_id")))throw error(409,"The submitted revision changed or was already reviewed. Reload this report.");
    if("CHANGES_REQUESTED".equals(input.decision())&&input.message().isBlank())throw error(422,"Explain the changes the evaluator should make.");
    repo.review(id,admin,input);repo.audit(admin.toString(),input.decision(),input.revisionId());
  }
  @Transactional public void exclude(UUID admin,UUID id,String reason) {
    var sh=repo.sheet(id);if(sh.get("released_revision_id")!=null)throw error(409,"A published report cannot be excluded.");
    repo.exclude(id,reason.trim());repo.audit(admin.toString(),"EVALUATION_EXCLUDED",id);
  }
  @Transactional public Map<String,Object> release(UUID admin,UUID session) {
    repo.lockSession(session);var sheets=repo.lockSheets(session);var outstanding=repo.outstanding(session);
    if(!outstanding.isEmpty())throw error(409,"Release blocked: "+outstanding.size()+" student(s) still need an approved report or documented exclusion.");
    int count=0;
    for(var sh:sheets){
      if(sh.get("excluded_reason")!=null||"RELEASED".equals(sh.get("state")))continue;
      if(!"APPROVED".equals(sh.get("state"))||!repo.approved(uuid(sh,"current_revision_id")))throw error(409,"Every included report must be approved before release.");
      var revision=repo.revision(uuid(sh,"current_revision_id")); repo.publish(sh,revision);
      repo.audit(admin.toString(),"REPORT_RELEASED",uuid(revision,"id"));
      var releaseKey="released:"+revision.get("id");
      repo.notify(uuid(sh,"student_id"),releaseKey,"Your DI evaluation report is ready.","/student/performance/"+sh.get("id"));
      for(UUID parent:repo.linkedParents(uuid(sh,"student_id")))
        repo.notify(parent,releaseKey,"A DI evaluation report is ready for your linked student.","/parent/performance");
      count++;
    }
    return Map.of("released",count,"alreadyReleased",count==0);
  }
  public List<Map<String,Object>> catalog(){return repo.catalog();}
  public List<Map<String,Object>> students(UUID id){return repo.students(id);}
  public List<Map<String,Object>> invitations(){return repo.invitations();}
  public List<Map<String,Object>> queue(){return repo.queue();}
  public List<Map<String,Object>> notifications(UUID user){return repo.notifications(user);}
  public void read(UUID user,UUID id){repo.read(user,id);}
  public List<Map<String,Object>> delivery(){return repo.delivery();}
}
