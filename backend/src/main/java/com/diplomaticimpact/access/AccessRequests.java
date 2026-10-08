package com.diplomaticimpact.access;

import jakarta.validation.constraints.*;
import java.util.*;

public final class AccessRequests {
  private AccessRequests() {}
  public record Invite(@NotNull UUID sessionId,@NotBlank @Size(max=120) String name,
      @NotBlank @Email @Size(max=254) String email,@Size(max=160) String organisation,
      @Size(max=120) String title,@NotEmpty @Size(max=500) List<UUID> studentIds) {}
  public record Activate(@NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") String token) {}
  public record Save(@Min(1) int version,@NotNull Map<String,Integer> scores,
      @NotNull @Size(max=4000) String feedback) {}
  public record Review(@NotNull UUID revisionId,@NotNull @Pattern(regexp="APPROVED|CHANGES_REQUESTED") String decision,
      @NotNull @Size(max=4000) String internalNote,@NotNull @Size(max=2000) String message) {}
  public record Exclude(@NotBlank @Size(max=500) String reason) {}
}
