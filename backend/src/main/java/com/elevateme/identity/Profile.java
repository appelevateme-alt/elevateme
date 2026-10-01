package com.elevateme.identity;

import java.util.List;

/**
 * Canonical profile row, always loaded scoped by verified {@code supabase_subject}.
 *
 * <p>Column mapping against Flyway V1 ({@code app.profiles}):
 * <ul>
 *   <li>{@code displayName} ↔ {@code full_name}</li>
 *   <li>{@code photoKey} ↔ {@code avatar_url} (private path/key, never a public bucket URL)</li>
 *   <li>{@code parentViewPreference} ↔ {@code parent_view_mode} ({@code ALL}/{@code SINGLE})</li>
 *   <li>{@code roles} is the single V1 {@code role} column exposed as a one-element list
 *       for API compatibility with the legacy {@code roles[]} vocabulary.</li>
 * </ul>
 */
public record Profile(
    String id,
    String supabaseSubject,
    String email,
    String displayName,
    String elevateMeId,
    List<String> roles,
    String status,
    String instituteId,
    String parentViewPreference,
    String photoKey) {}
