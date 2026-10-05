package com.diplomaticimpact.access;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class AccessPolicyTest {
  @Test
  void generatedTokensAreUrlSafeAndHashDeterministically() {
    String token = AccessPolicy.token();
    assertEquals(43, token.length());
    assertTrue(token.matches("[A-Za-z0-9_-]{43}"));
    assertEquals(AccessPolicy.hash(token), AccessPolicy.hash(token));
    assertNotEquals(AccessPolicy.hash(token), AccessPolicy.hash(AccessPolicy.token()));
  }

  @Test
  void incompleteScoresAreAllowedOnlyForDrafts() {
    Map<String, Integer> partial = new HashMap<>();
    partial.put("clarity", 82);
    assertDoesNotThrow(() -> AccessPolicy.scores(partial, false));
    assertThrows(ResponseStatusException.class, () -> AccessPolicy.scores(partial, true));
  }

  @Test
  void scoresRejectUnknownCriteriaAndOutOfRangeValues() {
    Map<String, Integer> invalid = new HashMap<>();
    invalid.put("untrusted-field", 50);
    assertThrows(ResponseStatusException.class, () -> AccessPolicy.scores(invalid, false));
    invalid.clear();
    invalid.put("clarity", 101);
    assertThrows(ResponseStatusException.class, () -> AccessPolicy.scores(invalid, false));
  }
}
