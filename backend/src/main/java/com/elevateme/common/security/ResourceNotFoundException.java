package com.elevateme.common.security;

/** Cross-student out-of-scope read: mapped to 404 to avoid enumeration (spec §11). */
public class ResourceNotFoundException extends RuntimeException {
  public ResourceNotFoundException(String message) {
    super(message);
  }
}
