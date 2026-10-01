package com.elevateme.performance;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Phase 4 pure performance math (no DB).
 *
 * <p>Covers spec §5.2: released-only, chronological by session starts_at + ID tie-break,
 * programsAttended = distinct ATTENDED programs, personalBest = max normalized, baseline = first,
 * gain = best - baseline (min 0). Zero => nulls + starter path; one => gain 0.
 */
class PerformanceMathTest {

  private static final Instant T1 = Instant.parse("2026-01-10T06:00:00Z");
  private static final Instant T2 = Instant.parse("2026-01-17T06:00:00Z");
  private static final Instant T3 = Instant.parse("2026-01-24T06:00:00Z");

  private static PerformanceMath.Sheet sheet(
      String evalId, String sessionId, String programId, Instant startsAt,
      int total, boolean released, boolean voided) {
    return new PerformanceMath.Sheet(evalId, sessionId, programId, startsAt, total, released, voided);
  }

  @Test
  void releasedOnly_draftUnreleasedAndVoidedExcluded() {
    var sheets = List.of(
        sheet("e1", "s1", "p1", T1, 600, true, false),
        sheet("e2", "s2", "p1", T2, 830, false, false),
        sheet("e3", "s3", "p1", T3, 900, true, true));
    assertEquals(List.of(600), PerformanceMath.releasedTotalsChronological(sheets));
  }

  @Test
  void chronologicalByStartsAtWithIdTieBreak_notReleaseTime() {
    // Same starts_at: ID order wins (e-b before e-c even if "released later").
    var sheets = List.of(
        sheet("e-c", "s3", "p1", T2, 760, true, false),
        sheet("e-a", "s1", "p1", T1, 600, true, false),
        sheet("e-b", "s2", "p1", T2, 830, true, false));
    assertEquals(List.of(600, 830, 760), PerformanceMath.releasedTotalsChronological(sheets));
  }

  @Test
  void golden600_830_760_gives60_83_76_best83_gain23() {
    List<Integer> totals = List.of(600, 830, 760);
    assertEquals(List.of(60, 83, 76), PerformanceMath.normalizedHistory(totals));
    assertEquals(60, PerformanceMath.baseline(totals));
    assertEquals(83, PerformanceMath.best(totals));
    assertEquals(23, PerformanceMath.gain(totals));
  }

  @Test
  void zeroSheets_nullsForStarterPath() {
    assertTrue(PerformanceMath.releasedTotalsChronological(List.of()).isEmpty());
    assertNull(PerformanceMath.baseline(List.of()));
    assertNull(PerformanceMath.best(List.of()));
    assertNull(PerformanceMath.gain(List.of()));
  }

  @Test
  void oneSheet_gainZero_startingPoint() {
    List<Integer> totals = List.of(700);
    assertEquals(70, PerformanceMath.baseline(totals));
    assertEquals(70, PerformanceMath.best(totals));
    assertEquals(0, PerformanceMath.gain(totals));
  }

  @Test
  void gainNeverNegative_baselineIncludedInBest() {
    // Declining history: best is still the baseline, gain floors at 0.
    List<Integer> totals = List.of(800, 600);
    assertEquals(80, PerformanceMath.baseline(totals));
    assertEquals(80, PerformanceMath.best(totals));
    assertEquals(0, PerformanceMath.gain(totals));
  }

  @Test
  void distinctProgramsAttended_countsAttendedOnly() {
    var attendance = List.of(
        new PerformanceMath.Attendance("p1", "ATTENDED"),
        new PerformanceMath.Attendance("p1", "ATTENDED"),
        new PerformanceMath.Attendance("p2", "ATTENDED"),
        new PerformanceMath.Attendance("p3", "CONFIRMED"),
        new PerformanceMath.Attendance("p4", "ABSENT"),
        new PerformanceMath.Attendance(null, "ATTENDED"),
        new PerformanceMath.Attendance("p2", "WITHDRAWN"));
    // Registration alone / evaluation count never counts — only ATTENDED programs.
    assertEquals(2, PerformanceMath.distinctProgramsAttended(attendance));
    assertEquals(0, PerformanceMath.distinctProgramsAttended(null));
    assertEquals(0, PerformanceMath.distinctProgramsAttended(List.of()));
  }

  @Test
  void sampleSize_neverAveragesSessions_sameDayStaysSeparate() {
    var sheets = List.of(
        sheet("e1", "s1", "p1", T1, 600, true, false),
        sheet("e2", "s2", "p1", T1, 650, true, false));
    // Same-day sessions stay separate rows (no program averaging).
    assertEquals(2, PerformanceMath.sampleSize(sheets));
  }

  @Test
  void normalizedExact_preservesDecimal_noRoundingInStoredValue() {
    assertEquals(83.0, PerformanceMath.normalizedExact(830));
    assertEquals(76.5, PerformanceMath.normalizedExact(765));
  }
}
