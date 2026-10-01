package com.elevateme.identity;

import com.elevateme.common.security.AuthContext;
import org.springframework.stereotype.Service;

/**
 * Legacy identity helper kept for photo-flow work. Self profile read/update is owned by
 * {@link ProfileService} (scoped by verified subject, never auto-created from browser metadata).
 */
@Service
public class IdentityService {
  private final AuthContext auth;

  public IdentityService(AuthContext auth) {
    this.auth = auth;
  }

  public String currentSubject() {
    return auth.currentSubject();
  }
}
