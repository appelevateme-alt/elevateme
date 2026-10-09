package com.diplomaticimpact.access;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class AccessServiceTest {
  @Test void logoutInvalidatesTheStoredSession() {
    var repo = mock(AccessRepository.class);
    var service = new AccessService(repo, "https://example.test");
    String token = AccessPolicy.token();
    service.logout(token);
    verify(repo).endSession(AccessPolicy.hash(token));
  }

  @Test void logoutWithoutAValidCookieIsIdempotent() {
    var repo = mock(AccessRepository.class);
    var service = new AccessService(repo, "https://example.test");
    service.logout(null);
    service.logout("invalid");
    verifyNoInteractions(repo);
  }

  @Test void staleReviewCannotApproveAnotherRevision() {
    var repo = mock(AccessRepository.class);
    var service = new AccessService(repo, "https://example.test");
    UUID sheet = UUID.randomUUID(), current = UUID.randomUUID();
    when(repo.sheet(sheet)).thenReturn(Map.of("state", "SUBMITTED", "current_revision_id", current));
    var decision = new AccessRequests.Review(UUID.randomUUID(), "APPROVED", "", "");
    var error = assertThrows(ResponseStatusException.class,
        () -> service.review(UUID.randomUUID(), sheet, decision));
    assertEquals(409, error.getStatusCode().value());
    verify(repo, never()).review(any(), any(), any());
  }
}
