package com.diplomaticimpact.access;

import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/evaluation-access")
public class AccessController {
  private final AccessService service;private final AccessIdentity auth;private final boolean secure;
  AccessController(AccessService service,AccessIdentity auth,@Value("${access.public-url}") String url){this.service=service;this.auth=auth;secure=url.startsWith("https://");}
  @PostMapping("/activate") ResponseEntity<?> activate(@Valid @RequestBody AccessRequests.Activate input){
    var s=service.activate(input.token());
    var cookie=ResponseCookie.from("em_evaluator",s.token()).httpOnly(true).secure(secure).sameSite("Strict").path("/api/evaluation-access").maxAge(Math.max(0,Duration.between(Instant.now(),s.expiresAt()).toSeconds())).build();
    return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE,cookie.toString()).body(Map.of("expiresAt",s.expiresAt()));
  }
  @PostMapping("/logout") ResponseEntity<?> logout(@CookieValue(value="em_evaluator",required=false) String token){service.logout(token);return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE,ResponseCookie.from("em_evaluator","").httpOnly(true).secure(secure).sameSite("Strict").path("/api/evaluation-access").maxAge(0).build().toString()).build();}
  @GetMapping("/workspace") Object workspace(@CookieValue(value="em_evaluator",required=false) String token){return service.workspace(token);}
  @GetMapping("/sheets/{id}") Object sheet(@CookieValue(value="em_evaluator",required=false) String token,@PathVariable UUID id){return service.guestSheet(token,id);}
  @PutMapping("/sheets/{id}") Object save(@CookieValue(value="em_evaluator",required=false) String token,@PathVariable UUID id,@Valid @RequestBody AccessRequests.Save input){return service.save(token,id,input,false);}
  @PostMapping("/sheets/{id}/submit") Object submit(@CookieValue(value="em_evaluator",required=false) String token,@PathVariable UUID id,@Valid @RequestBody AccessRequests.Save input){return service.save(token,id,input,true);}
    @GetMapping("/admin/sessions") Object sessions(HttpServletRequest r){return service.catalog(auth.staff(r));}
  @GetMapping("/admin/sessions/{id}/students") Object students(HttpServletRequest r,@PathVariable UUID id){return service.students(auth.staff(r),id);}
  @GetMapping("/admin/invitations") Object invitations(HttpServletRequest r){return service.invitations(auth.staff(r));}
  @PostMapping("/admin/invitations") Object invite(HttpServletRequest r,@Valid @RequestBody AccessRequests.Invite input){return service.invite(auth.staff(r),input);}
  @PostMapping("/admin/invitations/{id}/revoke") Object revoke(HttpServletRequest r,@PathVariable UUID id){service.revoke(auth.staff(r),id);return Map.of("ok",true);}
  @PostMapping("/admin/invitations/{id}/replace") Object replace(HttpServletRequest r,@PathVariable UUID id){return service.replace(auth.staff(r),id);}
  @GetMapping("/admin/reviews") Object reviews(HttpServletRequest r){return service.queue(auth.staff(r));}
  @GetMapping("/admin/reviews/{id}") Object review(HttpServletRequest r,@PathVariable UUID id){return service.detail(auth.staff(r),id);}
  @PostMapping("/admin/reviews/{id}") Object decision(HttpServletRequest r,@PathVariable UUID id,@Valid @RequestBody AccessRequests.Review input){service.review(auth.staff(r),id,input);return Map.of("ok",true);}
  @GetMapping("/notifications") Object notices(HttpServletRequest r){return service.notifications(auth.user(r));}
  @PostMapping("/notifications/{id}/read") Object read(HttpServletRequest r,@PathVariable UUID id){service.read(auth.user(r),id);return Map.of("ok",true);}
  @PostMapping("/admin/sheets/{id}/exclude") Object exclude(HttpServletRequest r,@PathVariable UUID id,@Valid @RequestBody AccessRequests.Exclude input){service.exclude(auth.staff(r),id,input.reason());return Map.of("ok",true);}
  @PostMapping("/admin/sessions/{id}/release") Object release(HttpServletRequest r,@PathVariable UUID id){return service.release(auth.staff(r),id);}
  @GetMapping("/admin/delivery") Object delivery(HttpServletRequest r){auth.admin(r);return service.delivery();}
  
}
