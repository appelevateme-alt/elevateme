package com.elevateme.identity;

/** 422 validation failure for the photo flow. Mapped by {@link com.elevateme.common.web.GlobalExceptionHandler}. */
public class PhotoValidationException extends IllegalArgumentException {
  private final String field;

  public PhotoValidationException(String message, String field) {
    super(message);
    this.field = field;
  }

  public PhotoValidationException(String message) {
    this(message, "photo");
  }

  public String getField() {
    return field;
  }
}
