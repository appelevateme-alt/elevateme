package com.elevateme.common.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * Canonical error body. Every stub controller returns 501 with this shape + requestId.
 * Validation failures return 422 with fieldErrors populated.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(String code, String message, List<FieldViolation> fieldErrors, String requestId) {
  public record FieldViolation(String field, String message) {}

  public static ApiError notImplemented(String requestId) {
    return new ApiError("NOT_IMPLEMENTED", "Not implemented (skeleton stub)", null, requestId);
  }

  public static ApiError of(String code, String message, String requestId) {
    return new ApiError(code, message, null, requestId);
  }
}
