package com.diplomaticimpact.access;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class AccessErrorsTest {
  @Test void unexpectedErrorsExposeAReferenceButNoSensitiveMessage() {
    var response = new AccessErrors().unexpected(new IllegalStateException("secret-token-and-student-feedback"));
    assertEquals(500, response.getStatusCode().value());
    String body = response.getBody().toString();
    assertTrue(body.contains("Reference:"));
    assertFalse(body.contains("secret-token"));
  }
}
