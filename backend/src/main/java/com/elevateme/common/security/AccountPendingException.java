package com.elevateme.common.security;

/**
 * Staff account awaiting approval: mapped to 403 with code ACCOUNT_PENDING.
 * Frontend redirects to /account/pending without fetching roster data.
 */
public class AccountPendingException extends RuntimeException {
  public AccountPendingException(String message) {
    super(message);
  }
}
