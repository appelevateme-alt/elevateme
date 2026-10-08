package com.diplomaticimpact.access;

import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** At-least-once SMTP delivery. Database event dedupe does not claim exactly-once SMTP. */
@Component
class AccessMailWorker {
  private final AccessRepository repo; private final JavaMailSender mail;
  private final boolean enabled;private final String from;private final String base;
  AccessMailWorker(AccessRepository repo,JavaMailSender mail,@Value("${access.mail-enabled:false}") boolean enabled,
      @Value("${access.mail-from:}") String from,@Value("${access.public-url}") String base){this.repo=repo;this.mail=mail;this.enabled=enabled;this.from=from;this.base=base;}
  @Scheduled(fixedDelayString="${access.mail-poll-ms:30000}")
  @Transactional public void sendNext(){
    if(!enabled)return;
    var row=repo.nextMail();if(row==null)return;
    boolean success=false;
    try{
      if(from.isBlank())throw new IllegalStateException("Sender required");
      var message=new SimpleMailMessage();message.setFrom(from);message.setTo(row.get("email").toString());
      message.setSubject("ElevateMe update");message.setText(row.get("message")+"\n\n"+base+row.get("destination"));mail.send(message);success=true;
    }catch(Exception ignored){ /* Provider details may contain PII; expose only a safe failure state. */ }
    repo.mailResult(UUID.fromString(row.get("id").toString()),success);
  }
}
