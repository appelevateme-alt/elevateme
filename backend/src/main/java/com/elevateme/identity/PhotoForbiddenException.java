package com.elevateme.identity;

/** 403 for cross-account photo path access. Never leak whether the target object exists. */
public class PhotoForbiddenException extends RuntimeException {
  public PhotoForbiddenException(String message) {
    super(message);
  }
}
