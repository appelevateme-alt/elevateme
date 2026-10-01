package com.elevateme.identity;

/** 404 when the caller's own profile row is missing. */
public class PhotoNotFoundException extends RuntimeException {
  public PhotoNotFoundException(String message) {
    super(message);
  }
}
