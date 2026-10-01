package com.elevateme.participation;

import com.elevateme.common.api.ApiError;
import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Exact path: POST /invitations/{id}/revoke (revocation is immediate). */
@RestController
@RequestMapping("/api/v1/invitations")
public class InvitationController {

  private final GuestService guests;
  private final AuthContext auth;

  public InvitationController(GuestService guests, AuthContext auth) {
    this.guests = guests;
    this.auth = auth;
  }

  @PostMapping("/{id}/revoke")
  public ResponseEntity<?> revoke(@PathVariable String id, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    guests.revoke(subject, id, requestId);
    return ResponseEntity.ok(java.util.Map.of("id", id, "revoked", true));
  }
}
