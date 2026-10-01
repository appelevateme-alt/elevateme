package com.elevateme.performance;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Phase 4 pure performance math (no DB, unit-testable).
 *
 * <p>Rules (docs/SCORING.md frozen):
 * <ul>
 *   <li>Only released non-voided sheets count (LOCKED + released revision, archived_at IS NULL).
 *       Draft/unreleased never affect summary, baseline, best, gain, or insights.</li>
 *   <li>History order: chronological by session starts_at ASC, tie-break by evaluation ID ASC
 *       (NOT release time).</li>
 *   <li>Sheet total 0-1000 = sum of 10 ints; normalized 0-100 = total / 10.</li>
 *   <li>baseline = first released in history; best = max; gain = best - baseline, min 0.</li>
 *   <li>Distinct programs = count via attendance (ATTENDED) only, never via evaluation count,
 *       never via registration alone.</li>
 *   <li>Never average sessions into programs: each session stays a separate row, even same-day.</li>
 *   <li>Correction/void: recalc from scratch (accuracy over history); caller sets corrected flag.</li>
 * </ul>
 */
public final class PerformanceMath {
  private PerformanceMath() {}

  /** Minimal sheet projection for puremath (service maps JDBC rows to this). */
  public record Sheet(
      String evaluationId,
      String sessionId,
      String programId,
      Instant startsAt,
      int total,
      boolean released,
      boolean voided) {}

  /** Minimal attendance projection for distinct-program counting. */
  public record Attendance(String programId, String status) {}

  /** Released non-voided totals in chronological order (starts_at + evaluationId). */
  public static List<Integer> releasedTotalsChronological(List<Sheet> sheets) {
    if (sheets == null) {
      return List.of();
    }
    List<Sheet> released =
        sheets.stream()
            .filter(s -> s != null && s.released() && !s.voided())
            .sorted(
                Comparator.comparing(
                        PerformanceMath::startsAtOrMax, Comparator.naturalOrder())
                    .thenComparing(Sheet::evaluationId, Comparator.nullsLast(String::compareTo)))
            .toList();
    List<Integer> out = new ArrayList<>(released.size());
    for (Sheet s : released) {
      out.add(s.total());
    }
    return out;
  }

  private static Instant startsAtOrMax(Sheet s) {
    return s.startsAt() == null ? Instant.MAX : s.startsAt();
  }

  /** Normalized history (/100) from chronological totals (/1000). 600 -&gt; 60, etc. */
  public static List<Integer> normalizedHistory(List<Integer> chronologicalTotals) {
    if (chronologicalTotals == null) {
      return List.of();
    }
    List<Integer> out = new ArrayList<>(chronologicalTotals.size());
    for (int t : chronologicalTotals) {
      out.add(t / 10);
    }
    return out;
  }

  /** Exact normalized (total / 10.0) preserving one-decimal values (no rounding in stored value). */
  public static double normalizedExact(int total) {
    return total / 10.0;
  }

  public static Integer baseline(List<Integer> chronologicalTotals) {
    if (chronologicalTotals == null || chronologicalTotals.isEmpty()) {
      return null;
    }
    return chronologicalTotals.get(0) / 10;
  }

  public static Integer best(List<Integer> chronologicalTotals) {
    if (chronologicalTotals == null || chronologicalTotals.isEmpty()) {
      return null;
    }
    return chronologicalTotals.stream().mapToInt(t -> t / 10).max().orElseGet(() -> baseline(chronologicalTotals));
  }

  /** Gain = best - baseline, min 0 (baseline included in best, so naturally &gt;= 0). */
  public static Integer gain(List<Integer> chronologicalTotals) {
    if (chronologicalTotals == null || chronologicalTotals.isEmpty()) {
      return null;
    }
    int base = baseline(chronologicalTotals);
    int b = best(chronologicalTotals);
    return Math.max(0, b - base);
  }

  /**
   * Distinct programs attended: distinct program IDs with &gt;=1 ATTENDED session.
   * Registration alone never counts; evaluation count never counts.
   */
  public static int distinctProgramsAttended(List<Attendance> attendances) {
    if (attendances == null) {
      return 0;
    }
    Set<String> programs = new HashSet<>();
    for (Attendance a : attendances) {
      if (a != null
          && "ATTENDED".equals(a.status())
          && a.programId() != null
          && !a.programId().isBlank()) {
        programs.add(a.programId());
      }
    }
    return programs.size();
  }

  /** Rows stay separate per session (never averaged into programs); same-day stays separate. */
  public static int sampleSize(List<Sheet> sheets) {
    return releasedTotalsChronological(sheets).size();
  }
}
