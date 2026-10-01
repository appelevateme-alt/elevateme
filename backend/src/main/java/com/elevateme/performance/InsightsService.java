package com.elevateme.performance;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Phase 4 deterministic insights engine (pure, unit-testable) + legacy classifiers.
 *
 * <p>Frozen rules (docs/INSIGHTS.md + docs/SCORING.md):
 * <ul>
 *   <li>Released evaluations only; draft/unreleased never generates alerts or trends.</li>
 *   <li>Low-score alert strictly {@code < 30} flags; exactly {@code 30} does NOT alert.
 *       {@code 0} alerts when the sheet is complete+released (blank != zero; zero is real).</li>
 *   <li>Tie = matched (no false rank change; tied criteria share the path, never double-count).</li>
 *   <li>Trend minimum: {@code 2+} released evals for any decline/improvement/best/strengths/stable.
 *       Single eval -&gt; baseline + low only, no trends.</li>
 *   <li>Display order (fixed): {@code low, decline, best, improvement, strengths}
 *       (stable/baseline trail for completeness, never ahead).</li>
 *   <li>List cap: Top 5 + Expand (first 5 shown, full list behind Expand; storage keeps all).
 *       API returns all + top5 flag.</li>
 *   <li>Attribution: every insight shows {@code Based on <label>} with criterion label
 *       from SCORING.md (Sound NOT Vocal Delivery).</li>
 *   <li>Strongest/weakest via mean rank (2+ evals, ties share); most improved via
 *       latest-earliest delta; decline via latest-prev &lt;= -7; best via exceeds-prev
 *       (tie matched); stable via tie/matched.</li>
 * </ul>
 *
 * <p>Thresholds: STRICT_ALERT below 30; DECLINE delta &lt;= -7; IMPROVEMENT delta &gt;= +16.
 */
@Service
public class InsightsService {

  public static final int STRICT_ALERT_BELOW = 30;
  public static final int DECLINE_DELTA_AT_MOST = -7;
  public static final int IMPROVEMENT_DELTA_AT_LEAST = 16;
  /** Spec §6 resolve threshold: 30+ resolves (30 resolves, 29 stays active). */
  public static final int RESOLVE_AT_OR_ABOVE = 30;

  public static final List<String> CRITERION_KEYS =
      List.of(
          "preparation",
          "clarity",
          "confidence",
          "focus",
          "critical_analysis",
          "sound",
          "audience_addressing",
          "counter_arguments",
          "wit",
          "overall_performance");

  public static final Map<String, String> CRITERION_LABELS =
      Map.ofEntries(
          Map.entry("preparation", "Preparation"),
          Map.entry("clarity", "Clarity"),
          Map.entry("confidence", "Confidence"),
          Map.entry("focus", "Focus"),
          Map.entry("critical_analysis", "Critical Analysis"),
          Map.entry("sound", "Sound"),
          Map.entry("audience_addressing", "Audience Addressing"),
          Map.entry("counter_arguments", "Counter Arguments"),
          Map.entry("wit", "Wit"),
          Map.entry("overall_performance", "Overall Performance"));

  public enum Trend {
    DECLINE,
    IMPROVEMENT,
    MATCHED
  }

  /** Chronological evaluation point (released only, 10 scores, starts_at for ordering). */
  public record EvalPoint(String evaluationId, Instant startsAt, Map<String, Integer> scores) {}

  /**
   * Deterministic insight. {@code type} is one of
   * low|decline|best|improved|strengths|stable|baseline.
   */
  public record Insight(
      String type,
      String criterionKey,
      String criterionLabel,
      String message,
      String basedOn,
      Map<String, Object> evidence,
      boolean inTop5) {}

  /** Strict alert iff score &lt; 30 (29 flags, 30 does not). */
  public boolean isStrictAlert(int score) {
    return score < STRICT_ALERT_BELOW;
  }

  /** delta = latestAvg - previousAvg. */
  public Trend classifyDelta(int delta) {
    if (delta <= DECLINE_DELTA_AT_MOST) {
      return Trend.DECLINE;
    }
    if (delta >= IMPROVEMENT_DELTA_AT_LEAST) {
      return Trend.IMPROVEMENT;
    }
    return Trend.MATCHED;
  }

  public Trend classify(int previousAvg, int latestAvg) {
    return classifyDelta(latestAvg - previousAvg);
  }

  public static String labelFor(String criterionKey) {
    return CRITERION_LABELS.getOrDefault(criterionKey, criterionKey);
  }

  /**
   * Build deterministic insights from chronological released points (already sorted
   * starts_at + evaluationId). Returns ALL ordered insights with top5 flags set
   * (first 5 inTop5=true). {@code scopeLabel} is e.g. "last 4 weeks" / "all time"
   * for Based-on attribution; {@code evidenceWindow} describes the sample.
   */
  public List<Insight> buildInsights(List<EvalPoint> chronological, String scopeLabel) {
    List<EvalPoint> points =
        chronological == null ? List.of() : chronological.stream().filter(p -> p != null).toList();
    String scope = scopeLabel == null || scopeLabel.isBlank() ? "all time" : scopeLabel;
    String window = evidenceWindow(points);

    List<Insight> ordered = new ArrayList<>();
    if (points.isEmpty()) {
      return ordered;
    }

    // Baseline insight always (starting point / progress record anchor).
    Map<String, Object> baseEvidence = new HashMap<>();
    baseEvidence.put("sampleSize", points.size());
    baseEvidence.put("window", window);
    baseEvidence.put("scope", scope);
    String baseMsg =
        points.size() == 1
            ? "Starting point recorded. Based on all-round performance."
            : "Baseline established from your first report. Based on all-round performance.";
    ordered.add(
        new Insight("baseline", "overall_performance", labelFor("overall_performance"),
            baseMsg, "Based on " + labelFor("overall_performance"),
            baseEvidence, false));

    // Low notices apply even with a single eval (no trend minimum for low).
    EvalPoint latest = points.get(points.size() - 1);
    List<Insight> lows = new ArrayList<>();
    for (String key : CRITERION_KEYS) {
      Integer v = latest.scores() == null ? null : latest.scores().get(key);
      if (v != null && isStrictAlert(v)) {
        Map<String, Object> ev = new HashMap<>();
        ev.put("latest", v);
        ev.put("evaluationId", latest.evaluationId());
        ev.put("window", window);
        ev.put("scope", scope);
        ev.put("sampleSize", points.size());
        String label = labelFor(key);
        lows.add(
            new Insight("low", key, label,
                "Needs attention in " + label + " (latest " + v + "). Based on " + label + ".",
                "Based on " + label, ev, false));
      }
    }
    lows.sort(Comparator.comparingInt(i -> (Integer) i.evidence().get("latest")));
    // Insert lows right after baseline to preserve low-first display order.
    ordered.addAll(1, lows);

    if (points.size() < 2) {
      // <2 evals => baseline + low notices only, no trends.
      return withTop5(ordered);
    }

    EvalPoint earliest = points.get(0);
    EvalPoint prev = points.get(points.size() - 2);

    List<Insight> declines = new ArrayList<>();
    List<Insight> bests = new ArrayList<>();
    List<Insight> improved = new ArrayList<>();
    List<Insight> stables = new ArrayList<>();

    // Per-criterion means for strongest/weakest (2+ evals, ties share).
    Map<String, Double> means = new HashMap<>();
    for (String key : CRITERION_KEYS) {
      double sum = 0;
      int n = 0;
      int max = Integer.MIN_VALUE;
      for (EvalPoint p : points) {
        Integer v = p.scores() == null ? null : p.scores().get(key);
        if (v != null) {
          sum += v;
          n++;
          max = Math.max(max, v);
        }
      }
      if (n > 0) {
        means.put(key, sum / n);
      }
    }

    for (String key : CRITERION_KEYS) {
      Integer latestV = latest.scores() == null ? null : latest.scores().get(key);
      Integer prevV = prev.scores() == null ? null : prev.scores().get(key);
      Integer earliestV = earliest.scores() == null ? null : earliest.scores().get(key);
      if (latestV == null || prevV == null || earliestV == null) {
        continue;
      }
      String label = labelFor(key);
      int deltaPrev = latestV - prevV;
      int deltaEarliest = latestV - earliestV;
      Trend trend = classifyDelta(deltaPrev);

      Map<String, Object> base = new HashMap<>();
      base.put("latest", latestV);
      base.put("previous", prevV);
      base.put("earliest", earliestV);
      base.put("deltaPrev", deltaPrev);
      base.put("deltaEarliest", deltaEarliest);
      base.put("evaluationId", latest.evaluationId());
      base.put("window", window);
      base.put("scope", scope);
      base.put("sampleSize", points.size());

      if (trend == Trend.DECLINE) {
        declines.add(
            new Insight("decline", key, label,
                "Decline in " + label + " (latest " + latestV + ", previous " + prevV
                    + ", change " + deltaPrev + "). Based on " + label + ".",
                "Based on " + label, new HashMap<>(base), false));
      }
      // Best: exceeds prev (tie matched -> no best). Also requires personal best (max).
      int maxSoFar = Integer.MIN_VALUE;
      for (EvalPoint p : points) {
        Integer v = p.scores() == null ? null : p.scores().get(key);
        if (v != null) {
          maxSoFar = Math.max(maxSoFar, v);
        }
      }
      if (latestV > prevV && latestV == maxSoFar) {
        bests.add(
            new Insight("best", key, label,
                "Personal best in " + label + " (latest " + latestV + ", previous " + prevV
                    + "). Based on " + label + ".",
                "Based on " + label, new HashMap<>(base), false));
      }
      // Most improved: latest-earliest delta >= 16.
      if (deltaEarliest >= IMPROVEMENT_DELTA_AT_LEAST) {
        improved.add(
            new Insight("improved", key, label,
                "Most improved in " + label + " (latest " + latestV + ", earliest " + earliestV
                    + ", gain +" + deltaEarliest + "). Based on " + label + ".",
                "Based on " + label, new HashMap<>(base), false));
      }
      // Stable: exact tie (matched) -> no false rank change.
      if (deltaPrev == 0) {
        stables.add(
            new Insight("stable", key, label,
                "Stable in " + label + " (matched at " + latestV + "). Based on " + label + ".",
                "Based on " + label, new HashMap<>(base), false));
      }
    }

    declines.sort(Comparator.comparingInt(i -> (Integer) i.evidence().get("deltaPrev")));
    bests.sort((a, b) -> Integer.compare(
        (Integer) b.evidence().get("deltaPrev"), (Integer) a.evidence().get("deltaPrev")));
    improved.sort((a, b) -> Integer.compare(
        (Integer) b.evidence().get("deltaEarliest"), (Integer) a.evidence().get("deltaEarliest")));

    // Strengths: strongest by mean (highest mean). Ties share (all top-tied included).
    List<Insight> strengths = new ArrayList<>();
    if (!means.isEmpty()) {
      double top = means.values().stream().mapToDouble(d -> d).max().orElse(Double.NaN);
      List<String> tiedTop = new ArrayList<>();
      for (String key : CRITERION_KEYS) {
        Double m = means.get(key);
        if (m != null && Double.compare(m, top) == 0) {
          tiedTop.add(key);
        }
      }
      // Deterministic: criterion order for ties (never double-count same eval twice).
      for (String key : tiedTop) {
        String label = labelFor(key);
        Map<String, Object> ev = new HashMap<>();
        ev.put("mean", means.get(key));
        ev.put("window", window);
        ev.put("scope", scope);
        ev.put("sampleSize", points.size());
        strengths.add(
            new Insight("strengths", key, label,
                "Strength in " + label + " (average " + String.format("%.1f", means.get(key))
                    + "). Based on " + label + ".",
                "Based on " + label, ev, false));
      }
    }

    // Fixed display order: low, decline, best, improved, strengths (then stable, baseline).
    // Baseline + lows already in `ordered` (baseline first, lows next). Append the rest.
    ordered.addAll(declines);
    ordered.addAll(bests);
    ordered.addAll(improved);
    ordered.addAll(strengths);
    ordered.addAll(stables);
    // Baseline is already first; keep it there (do not duplicate).
    return withTop5(ordered);
  }

  private static String evidenceWindow(List<EvalPoint> points) {
    if (points == null || points.isEmpty()) {
      return "no evaluations";
    }
    if (points.size() == 1) {
      return "1 evaluation";
    }
    return points.size() + " evaluations";
  }

  /** Apply Top5+Expand flags: first 5 inTop5=true, rest false (storage keeps all). */
  public static List<Insight> withTop5(List<Insight> ordered) {
    List<Insight> out = new ArrayList<>(ordered.size());
    for (int i = 0; i < ordered.size(); i++) {
      Insight in = ordered.get(i);
      out.add(
          new Insight(in.type(), in.criterionKey(), in.criterionLabel(), in.message(),
              in.basedOn(), in.evidence(), i < 5));
    }
    return out;
  }

  /** Top5 view (first 5) for display; full list lives behind Expand. */
  public static List<Insight> top5(List<Insight> ordered) {
    if (ordered == null) {
      return List.of();
    }
    return ordered.stream().limit(5).toList();
  }

  /** Fixed display order rank: low, decline, best, improved, strengths, stable, baseline. */
  public static int orderRank(String type) {
    return switch (type == null ? "" : type) {
      case "low" -> 0;
      case "decline" -> 1;
      case "best" -> 2;
      case "improved", "improvement" -> 3;
      case "strengths", "strength", "strongest" -> 4;
      case "stable", "matched" -> 5;
      default -> 6;
    };
  }
}
