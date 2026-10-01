package com.elevateme.identity;

import com.elevateme.common.security.ResourceNotFoundException;

/**
 * Thrown when the signup trigger has not created a profile row for the verified subject.
 *
 * <p>Extends {@link ResourceNotFoundException} so it maps to canonical 404 {@code NOT_FOUND}.
 * Never auto-create from browser metadata: the client must route to signup/pending-approval.
 */
public class ProfileNotFoundException extends ResourceNotFoundException {
  public ProfileNotFoundException(String subject) {
    super("Profile not found for authenticated subject (signup must create it)");
  }
}
