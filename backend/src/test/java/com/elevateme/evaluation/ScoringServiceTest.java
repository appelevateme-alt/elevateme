package com.elevateme.evaluation;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Covers: tenx100 =&gt; 1000/100, tenx0 =&gt; 0/100, 600/830/760 =&gt; 60,83,76 best83 gain23,
 * 101/-1/fractional/missing fail 422 (IllegalArgumentException mapped to 422 by
 * GlobalExceptionHandler).
 */
class ScoringServiceTest {

  private final ScoringService scoring = new ScoringService();

  private static List<Integer> n(int count, int value) {
    List<Integer> out = new ArrayList<>();
    for (int i = 0; i < count; i++) {
      out.add(value);
    }
    return out;
  }

  @Test
  void tenx100_gives1000and100() {
    List<Integer> scores = n(10, 100);
    assertEquals(1000, scoring.total(scores));
    assertEquals(100.0, scoring.average(scores));
  }

  @Test
  void tenx0_gives0() {
    List<Integer> scores = n(10, 0);
    assertEquals(0, scoring.total(scores));
    assertEquals(0.0, scoring.average(scores));
  }

  @Test
  void totals600_830_760_give60_83_76_best83_gain23() {
    List<Integer> chronologicalTotals = List.of(600, 830, 760);
    assertEquals(60, ScoringService.averageOfTotal(chronologicalTotals.get(0)));
    assertEquals(83, ScoringService.averageOfTotal(chronologicalTotals.get(1)));
    assertEquals(76, ScoringService.averageOfTotal(chronologicalTotals.get(2)));
    assertEquals(83, ScoringService.bestAverage(chronologicalTotals));
    // baseline = first chronological (60); best 83 → gain 23
    assertEquals(23, ScoringService.gain(chronologicalTotals));
  }

  @Test
  void outOfRange101_fails() {
    List<Integer> scores = n(10, 50);
    scores.set(0, 101);
    assertThrows(IllegalArgumentException.class, () -> scoring.total(scores));
  }

  @Test
  void negative1_fails() {
    List<Integer> scores = n(10, 50);
    scores.set(3, -1);
    assertThrows(IllegalArgumentException.class, () -> scoring.validateForSubmit(scores));
  }

  @Test
  void fractional_fails() {
    // Simulates a fractional JSON number deserialized as Double: must be rejected.
    List<Object> raw = new ArrayList<>(Collections.nCopies(9, 50));
    raw.add(50.5);
    assertThrows(IllegalArgumentException.class, () -> scoring.validateRaw(raw));
  }

  @Test
  void missing_fails() {
    assertThrows(IllegalArgumentException.class, () -> scoring.validateForSubmit(n(9, 50)));
    List<Integer> withNull = new ArrayList<>(n(10, 50));
    withNull.set(5, null); // blank != zero
    assertThrows(IllegalArgumentException.class, () -> scoring.validateForSubmit(withNull));
  }
}
