package com.elevateme.evaluation;

import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Pure scoring math + validation. Implemented (not stub) so ScoringServiceTest passes.
 *
 * <p>Rules encoded:
 * <ul>
 *   <li>scores INT 0-100 inclusive; null/blank fails (blank != zero)</li>
 *   <li>all 10 required on submit (size must be exactly 10)</li>
 *   <li>fractional / out-of-range / missing fail with IllegalArgumentException (mapped to 422)</li>
 *   <li>total = sum; average = total / 10.0</li>
  *   <li>baseline = first chronological total; best = max; gain = bestAvg - baselineAvg
  *       (chronological starts_at+ID ordering in the query layer, see EvaluationService)</li>
 * </ul>
 */
@Service
public class ScoringService {

  public static final int REQUIRED_ANSWERS = 10;
  public static final int MIN_SCORE = 0;
  public static final int MAX_SCORE = 100;

  /** Validates raw objects (rejects null, non-Integer incl. fractional Doubles, out-of-range). */
  public void validateRaw(List<?> scores) {
    if (scores == null) {
      throw new IllegalArgumentException("exactly 10 scores required (got null)");
    }
    if (scores.size() != REQUIRED_ANSWERS) {
      throw new IllegalArgumentException(
          "exactly 10 scores required (got " + scores.size() + ")");
    }
    for (Object o : scores) {
      if (!(o instanceof Integer v)) {
        throw new IllegalArgumentException("scores must be integers 0-100 (blank != zero)");
      }
      validateOne(v);
    }
  }

  public void validateForSubmit(List<Integer> scores) {
    validateRaw(scores);
  }

  private void validateOne(Integer v) {
    if (v == null) {
      throw new IllegalArgumentException("score is required (blank != zero)");
    }
    if (v < MIN_SCORE || v > MAX_SCORE) {
      throw new IllegalArgumentException("scores must be integers 0-100 (got " + v + ")");
    }
  }

  public int total(List<Integer> scores) {
    validateForSubmit(scores);
    return scores.stream().mapToInt(Integer::intValue).sum();
  }

  /** Average on the 0-100 scale: total / 10. */
  public double average(List<Integer> scores) {
    return total(scores) / 10.0;
  }

  public static int averageOfTotal(int total) {
    return total / 10; // integer-scale helper used in best/gain summaries
  }

  /** Best average across chronological totals; gain = bestAvg - baselineAvg (baseline = first). */
  public static int bestAverage(List<Integer> chronologicalTotals) {
    if (chronologicalTotals == null || chronologicalTotals.isEmpty()) {
      throw new IllegalArgumentException("at least one total required");
    }
    return chronologicalTotals.stream().mapToInt(t -> t / 10).max().orElseThrow();
  }

  public static int gain(List<Integer> chronologicalTotals) {
    if (chronologicalTotals == null || chronologicalTotals.isEmpty()) {
      throw new IllegalArgumentException("at least one total required");
    }
    int baselineAvg = chronologicalTotals.get(0) / 10;
    return bestAverage(chronologicalTotals) - baselineAvg;
  }
}
