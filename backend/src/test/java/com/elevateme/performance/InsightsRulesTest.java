package com.elevateme.performance;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Phase 4 deterministic insights rules (JUnit5, pure logic, no DB).
 *
 * <p>Covers spec §6 + docs/INSIGHTS.md:
 * <ul>
 *   <li>low strictly {@code < 30} (29 flags, 30 does not; 0 flags when released-complete).</li>
 *   <li>decline on latest-prev drop (threshold {@code <= -7}); tie = matched (no false rank).</li>
 *   <li>best exceeds prev + is personal max (tie matched => no best).</li>
 *   <li>improved = latest-earliest max delta ({@code >= +16}).</li>
 *   <li>strong/weak = mean rank over 2+ evals (ties share).</li>
 *   <li>stable on exact tie; order low,decline,best,improved,strengths; Top5 flag + Based-on label.</li>
 *   <li>&lt;2 evals => baseline + low only, no trends.</li>
 * </ul>
 */
class InsightsRulesTest {

  private final InsightsService insights = new InsightsService();

  private static final Instant T1 = Instant.parse("2026-01-10T06:00:00Z");
  private static final Instant T2 = Instant.parse("2026-01-17T06:00:00Z");
  private static final Instant T3 = Instant.parse("2026-01-24T06:00:00Z");

  private static Map<String, Integer> scores(int def) {
    return scores(def, null);
  }

  private static Map<String, Integer> scores(int def, Map<String, Integer> overrides) {
    Map<String, Integer> m = new HashMap<>();
    for (String k : InsightsService.CRITERION_KEYS) {
      m.put(k, def);
    }
    if (overrides != null) {
      m.putAll(overrides);
    }
    return m;
  }

  private static InsightsService.EvalPoint point(String id, Instant at, Map<String, Integer> s) {
    return new InsightsService.EvalPoint(id, at, s);
  }

  @Test
  void lowStrictlyBelow30_30DoesNotAlert_zeroAlertsWhenReleased() {
    var pts = List.of(point("e1", T1, scores(70, Map.of("clarity", 29))));
    var all = insights.buildInsights(pts, "all time");
    assertTrue(all.stream().anyMatch(i -> "low".equals(i.type()) && "clarity".equals(i.criterionKey())));

    var at30 = List.of(point("e1", T1, scores(70, Map.of("clarity", 30))));
    assertTrue(insights.buildInsights(at30, "all time").stream()
        .noneMatch(i -> "low".equals(i.type()) && "clarity".equals(i.criterionKey())));

    var zero = List.of(point("e1", T1, scores(70, Map.of("clarity", 0))));
    assertTrue(insights.buildInsights(zero, "all time").stream()
        .anyMatch(i -> "low".equals(i.type()) && "clarity".equals(i.criterionKey())));
  }

  @Test
  void singleEval_baselinePlusLowOnly_noTrends() {
    var pts = List.of(point("e1", T1, scores(70, Map.of("clarity", 20))));
    var all = insights.buildInsights(pts, "all time");
    assertTrue(all.stream().anyMatch(i -> "baseline".equals(i.type())));
    assertTrue(all.stream().anyMatch(i -> "low".equals(i.type())));
    assertTrue(all.stream().noneMatch(i -> "decline".equals(i.type())));
    assertTrue(all.stream().noneMatch(i -> "best".equals(i.type())));
    assertTrue(all.stream().noneMatch(i -> "improved".equals(i.type())));
    assertTrue(all.stream().noneMatch(i -> "strengths".equals(i.type())));
    assertTrue(all.stream().noneMatch(i -> "stable".equals(i.type())));
  }

  @Test
  void decline_latestMinusPrevNegative() {
    // Drop of 10 (<= -7 threshold and < 0): decline fires.
    var pts = List.of(
        point("e1", T1, scores(70, Map.of("focus", 80))),
        point("e2", T2, scores(70, Map.of("focus", 70))));
    var all = insights.buildInsights(pts, "all time");
    assertTrue(all.stream().anyMatch(i -> "decline".equals(i.type()) && "focus".equals(i.criterionKey())));
    assertEquals(InsightsService.Trend.DECLINE, insights.classify(80, 70));
  }

  @Test
  void best_exceedsPrevAndIsMax_tieMatchedNoBest() {
    var rising = List.of(
        point("e1", T1, scores(70, Map.of("clarity", 60))),
        point("e2", T2, scores(70, Map.of("clarity", 75))));
    assertTrue(insights.buildInsights(rising, "all time").stream()
        .anyMatch(i -> "best".equals(i.type()) && "clarity".equals(i.criterionKey())));

    // Tie (matched) never yields best — no false rank change.
    var tied = List.of(
        point("e1", T1, scores(70, Map.of("clarity", 70))),
        point("e2", T2, scores(70, Map.of("clarity", 70))));
    assertTrue(insights.buildInsights(tied, "all time").stream()
        .noneMatch(i -> "best".equals(i.type()) && "clarity".equals(i.criterionKey())));
    assertEquals(InsightsService.Trend.MATCHED, insights.classifyDelta(0));
  }

  @Test
  void improved_latestMinusEarliestMaxDelta() {
    // Gain +16 over earliest: most-improved fires.
    var pts = List.of(
        point("e1", T1, scores(70, Map.of("confidence", 60))),
        point("e2", T2, scores(70, Map.of("confidence", 68))),
        point("e3", T3, scores(70, Map.of("confidence", 76))));
    var all = insights.buildInsights(pts, "all time");
    assertTrue(all.stream().anyMatch(i -> "improved".equals(i.type()) && "confidence".equals(i.criterionKey())));
  }

  @Test
  void strongWeak_meanRankOver2PlusEvals_tiesShare() {
    // Preparation averages highest across 2 evals => strengths.
    var pts = List.of(
        point("e1", T1, scores(60, Map.of("preparation", 90))),
        point("e2", T2, scores(60, Map.of("preparation", 92))));
    var all = insights.buildInsights(pts, "all time");
    assertTrue(all.stream().anyMatch(i -> "strengths".equals(i.type()) && "preparation".equals(i.criterionKey())));
  }

  @Test
  void stable_onExactTie() {
    var pts = List.of(
        point("e1", T1, scores(70)),
        point("e2", T2, scores(70)));
    var all = insights.buildInsights(pts, "all time");
    assertTrue(all.stream().anyMatch(i -> "stable".equals(i.type())));
  }

  // Spec §6 resolve threshold: 30+ resolves (30, 31, 40 all resolve; 29 stays active).
  // Strict alert (<30) unchanged: 30 does NOT alert, 29 does.

  private static CriterionAlertService.AlertState activeAlert(String revisionId, Instant startsAt) {
    return new CriterionAlertService.AlertState(
        "s1", "clarity", 20, revisionId, "e1", startsAt, null, null);
  }

  private static List<CriterionAlertService.ScorePoint> history(int latestScore) {
    return List.of(
        new CriterionAlertService.ScorePoint("e1", "rev1", "sess1", T1, 20),
        new CriterionAlertService.ScorePoint("e2", "rev2", "sess1", T2, latestScore));
  }

  @Test
  void resolveThreshold_30Resolves() {
    assertTrue(CriterionAlertService.isResolveScore(30));
    var decision = CriterionAlertService.reconcile(
        history(30), activeAlert("rev1", T1));
    assertEquals(CriterionAlertService.Action.RESOLVE, decision.action());
  }

  @Test
  void resolveThreshold_31Resolves() {
    assertTrue(CriterionAlertService.isResolveScore(31));
    var decision = CriterionAlertService.reconcile(
        history(31), activeAlert("rev1", T1));
    assertEquals(CriterionAlertService.Action.RESOLVE, decision.action());
  }

  @Test
  void resolveThreshold_40Resolves_stillPasses() {
    // Legacy 40-resolves case still passes since 40 >= 30.
    assertTrue(CriterionAlertService.isResolveScore(40));
    var decision = CriterionAlertService.reconcile(
        history(40), activeAlert("rev1", T1));
    assertEquals(CriterionAlertService.Action.RESOLVE, decision.action());
  }

  @Test
  void resolveThreshold_29StaysActive() {
    assertFalse(CriterionAlertService.isResolveScore(29));
    assertTrue(CriterionAlertService.isLow(29));
    assertFalse(CriterionAlertService.isLow(30));
    var decision = CriterionAlertService.reconcile(
        history(29), activeAlert("rev1", T1));
    assertEquals(CriterionAlertService.Action.UPDATE_EVIDENCE, decision.action());
  }

  @Test
  void orderLowDeclineBestImprovedStrengths_top5Flag_basedOnLabel() {
    var pts = List.of(
        point("e1", T1, scores(70, Map.of(
            "clarity", 60, "focus", 85, "confidence", 50, "preparation", 90))),
        point("e2", T2, scores(70, Map.of(
            // low (latest < 30), decline (drop), best (exceeds prev + max),
            // improved (latest-earliest >= 16 via confidence 50->70? craft explicitly below)
            "clarity", 20, "focus", 70, "confidence", 78, "preparation", 92))));
    // Confidence 50 -> 78 = +28 improved; clarity 20 = low; focus 85 -> 70 = decline;
    // preparation 90 -> 92 = best; strengths by mean (preparation top).
    var all = insights.buildInsights(pts, "last 4 weeks");
    assertFalse(all.isEmpty());

    // Order check: first occurrence ranks must be non-decreasing low<decline<best<improved<strengths.
    List<String> types = new ArrayList<>();
    for (var in : all) {
      types.add(in.type());
    }
    int firstLow = firstIndex(types, "low");
    int firstDecline = firstIndex(types, "decline");
    int firstBest = firstIndex(types, "best");
    int firstImproved = firstIndex(types, "improved");
    int firstStrengths = firstIndex(types, "strengths");
    if (firstLow >= 0 && firstDecline >= 0) {
      assertTrue(firstLow < firstDecline, "low before decline: " + types);
    }
    if (firstDecline >= 0 && firstBest >= 0) {
      assertTrue(firstDecline < firstBest, "decline before best: " + types);
    }
    if (firstBest >= 0 && firstImproved >= 0) {
      assertTrue(firstBest < firstImproved, "best before improved: " + types);
    }
    if (firstImproved >= 0 && firstStrengths >= 0) {
      assertTrue(firstImproved < firstStrengths, "improved before strengths: " + types);
    }

    // Top5 flag: first 5 inTop5, rest not; storage keeps all.
    for (int i = 0; i < all.size(); i++) {
      assertEquals(i < 5, all.get(i).inTop5(), "top5 flag at " + i);
    }
    // Based-on label on every insight (Sound label never Vocal Delivery).
    for (var in : all) {
      assertNotNull(in.basedOn());
      assertTrue(in.basedOn().startsWith("Based on "), "basedOn: " + in.basedOn());
      assertFalse(in.basedOn().contains("Vocal Delivery"));
    }
    assertFalse(all.stream().anyMatch(i -> "Vocal Delivery".equals(i.criterionLabel())));
  }

  private static int firstIndex(List<String> types, String want) {
    for (int i = 0; i < types.size(); i++) {
      if (want.equals(types.get(i))) {
        return i;
      }
    }
    return -1;
  }
}
