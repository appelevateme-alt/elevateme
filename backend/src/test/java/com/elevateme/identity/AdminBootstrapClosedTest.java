package com.elevateme.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.web.GlobalExceptionHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * TEMPORARY admin bootstrap is closed: no public endpoint can grant {@code admin}.
 *
 * <p>Backend grep note: no {@code requested_role=admin} auto-approve path exists in
 * {@code backend/src} (the legacy backdoor lived in the Supabase SQL trigger +
 * frontend signup option, both out of backend scope). This test pins the backend side:
 * the PATCH DTO cannot bind privilege fields, the controller rejects them with 403,
 * and the update SQL never touches role/status/elevate_me_id.
 */
@ExtendWith(MockitoExtension.class)
class AdminBootstrapClosedTest {

  @Mock ProfileRepository repo;
  @Mock AuthContext auth;

  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void patchDtoCannotBindPrivilegeFields() {
    Set<String> fields =
        Arrays.stream(ProfileDtos.PatchProfileRequest.class.getRecordComponents())
            .map(c -> c.getName().toLowerCase())
            .collect(Collectors.toSet());
    assertFalse(fields.contains("roles"));
    assertFalse(fields.contains("role"));
    assertFalse(fields.contains("status"));
    assertFalse(fields.contains("elevatemeid"));
    assertFalse(fields.contains("requested_role"));
    assertFalse(fields.contains("requestedrole"));
    // Allowlist is exactly these four.
    assertEquals(Set.of("displayname", "photokey", "parentviewpreference", "emailpreferences"), fields);
  }

  @Test
  void patchWithRolesIs403_viaPublicEndpoint() throws Exception {
    var service = mock(ProfileService.class);
    var controller = new MeController(service);
    var raw = mapper.readTree("{\"displayName\":\"Hacker\",\"roles\":[\"admin\"]}");

    var denied = assertThrows(AccessDeniedException.class, () -> controller.patchMe(raw));
    assertNotNull(denied);

    // Canonical 403 body.
    var res = new GlobalExceptionHandler().handleDenied(denied, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());
    assertEquals("FORBIDDEN", res.getBody().code());

    // Service (DB write) never reached.
    verify(service, never()).patchMe(any(), any(), any(), any());
  }

  @Test
  void patchWithRequestedRoleAdminIs403() throws Exception {
    var service = mock(ProfileService.class);
    var controller = new MeController(service);
    var raw = mapper.readTree("{\"displayName\":\"Hacker\",\"requested_role\":\"admin\"}");

    assertThrows(AccessDeniedException.class, () -> controller.patchMe(raw));
    verify(service, never()).patchMe(any(), any(), any(), any());
  }

  @Test
  void patchWithStatusOrElevateMeIdIs403() throws Exception {
    var service = mock(ProfileService.class);
    var controller = new MeController(service);

    assertThrows(
        AccessDeniedException.class,
        () -> controller.patchMe(mapper.readTree("{\"status\":\"Approved\"}")));
    assertThrows(
        AccessDeniedException.class,
        () -> controller.patchMe(mapper.readTree("{\"elevateMeId\":\"EM-00001\"}")));
    verify(service, never()).patchMe(any(), any(), any(), any());
  }

  @Test
  void legitimatePatchKeepsRole_neverElevates() throws Exception {
    var before =
        new Profile(
            "p1", "sub-1", "u@x.test", "U", null,
            List.of("student"), "PendingReview", null, "ALL", null);
    when(repo.findBySupabaseSubject("sub-1")).thenReturn(Optional.of(before));
    when(auth.currentSubject()).thenReturn("sub-1");
    // Fallback only (row email present); lenient to keep strict-stubs green.
    lenient().when(auth.currentEmail()).thenReturn("u@x.test");
    var service = new ProfileService(repo, auth);

    var controller = new MeController(service);
    var raw = mapper.readTree("{\"displayName\":\"New Name\"}");
    var res = controller.patchMe(raw);

    assertEquals(List.of("student"), res.getBody().roles());
    assertEquals("PendingReview", res.getBody().status());
    assertNull(res.getBody().elevateMeId());
  }

  @Test
  void updateSqlNeverTouchesPrivilegeColumns() {
    String sql = ProfileRepository.UPDATE_SELF_SQL.toLowerCase();
    assertFalse(sql.contains("role"));
    assertFalse(sql.contains("status"));
    assertFalse(sql.contains("elevate_me_id"));
    assertFalse(sql.contains("elevate_me_seq"));
  }
}
