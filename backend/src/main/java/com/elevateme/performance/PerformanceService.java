package com.elevateme.performance;

import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ScopeGuard;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Phase 4 released-only reads (/me/reports, /me/performance, /me/insights).
 * Every method takes authenticatedSubject + studentId and enforces the Phase 1c
 * scoping pattern via {@link ScopeGuard} (self / admin / teacher-linked).
 *
 * <ul>
 *   <li>Only released non-voided, chronological by session starts_at + evaluation ID
 *       (NOT release time). Same-day sessions stay separate; never average sessions
 *       into programs.</li>
 *   <li>Time filter on session starts_at (last4w = today Colombo + preceding 27d,
 *       store UTC display Asia/Colombo, custom inclusive local =&gt; half-open UTC).</li>
 *   <li>Insights: deterministic per docs/INSIGHTS.md (strongest/weakest mean rank 2+,
 *       most improved latest-earliest, decline latest-prev, low &lt;30 strictly latest,
 *       best exceeds-prev tie matched, stable). Order low,decline,best,improved,strengths.
 *       Top5 + Expand (all + top5 flag). Based-on scope label + evidence window.
 *       &lt;2 evals =&gt; baseline + low only, no trends.</li>
 * </ul>
 */
@Service
public class PerformanceService {
  private final AuthContext auth;
  private final PerformanceRepository repo;
  private final ScopeGuard guard;
  private final InsightsService insights;

  public PerformanceService(AuthContext auth, PerformanceRepository repo, ScopeGuard guard) {
    this(auth, repo, guard, new InsightsService());
  }

  public PerformanceService(
      AuthContext auth, PerformanceRepository repo, ScopeGuard guard, InsightsService insights) {
    this.auth = auth;
    this.repo = repo;
    this.guard = guard;
    this.insights = insights == null ? new InsightsService() : insights;
  }

  /** Resolve caller's own student id from subject (profiles lookup). */
  public String ownStudentId(String authenticatedSubject) {
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    return caller == null ? authenticatedSubject : caller.id();
  }

  // ------------------------------------------------------------------
  // /me/summary (released-only aggregates, chronological starts_at + ID)
  // ------------------------------------------------------------------

  static final String STARTER_MESSAGE = "Your first report will start your progress record";
  static final String SINGLE_RESULT_MESSAGE = "Starting point recorded";

  /**
   * Phase 4 summary: released-only non-voided sheets, chronological by session starts_at ASC +
   * evaluation ID ASC tie-break (NOT release time).
   *
   * <ul>
   *   <li>programsAttended = distinct program IDs with &gt;=1 ATTENDED session (attendance only,
   *       never registration alone, never evaluation count).</li>
   *   <li>personalBest (/100) = max normalized; baseline = first chronological; gain = best -
   *       baseline, min 0.</li>
   *   <li>Zero sheets =&gt; nulls + starter message. One sheet =&gt; gain 0 + "Starting point
   *       recorded".</li>
   *   <li>Never averages sessions; correction/void recalcs from scratch (caller re-queries).</li>
   * </ul>
   */
  public Map<String, Object> getSummary(
      String authenticatedSubject, String studentId, String requestId) {
    int programsAttended =
        repo.countDistinctProgramsAttendedByStudent(authenticatedSubject, studentId, requestId);
    List<Integer> totals =
        repo.findReleasedTotalsChronologicalByStudent(authenticatedSubject, studentId, requestId);
    // Pure math (unit-testable via PerformanceMath): released totals already chronological.
    List<Integer> normalized = PerformanceMath.normalizedHistory(totals);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("programsAttended", programsAttended);
    if (normalized.isEmpty()) {
      out.put("personalBest", null);
      out.put("baseline", null);
      out.put("pointsGained", null);
      out.put("gain", null);
      out.put("message", STARTER_MESSAGE);
      out.put("sampleSize", 0);
      return out;
    }
    Integer baseline = PerformanceMath.baseline(totals);
    Integer best = PerformanceMath.best(totals);
    Integer gain = PerformanceMath.gain(totals);
    out.put("personalBest", best);
    out.put("baseline", baseline);
    out.put("pointsGained", gain);
    out.put("gain", gain);
    out.put("sampleSize", normalized.size());
    out.put("message", normalized.size() == 1 ? SINGLE_RESULT_MESSAGE : null);
    return out;
  }

  public List<Map<String, Object>> getMyReports(
      String authenticatedSubject, String studentId, String requestId) {
    return repo.findReleasedReportsForStudent(authenticatedSubject, studentId, requestId);
  }

  public Map<String, Object> getReportById(
      String authenticatedSubject, String studentId, String reportId, String requestId) {
    return repo.findReleasedReportById(authenticatedSubject, studentId, reportId, requestId);
  }

  /** Single report with print-friendly flag (print does not change marks, only metadata). */
  public Map<String, Object> getReportById(
      String authenticatedSubject, String studentId, String reportId, String requestId,
      boolean print) {
    Map<String, Object> report = getReportById(authenticatedSubject, studentId, reportId, requestId);
    if (print) {
      Map<String, Object> out = new LinkedHashMap<>(report);
      out.put("printFriendly", true);
      return out;
    }
    return report;
  }

  // ------------------------------------------------------------------
  // /me/performance
  // ------------------------------------------------------------------

  /**
   * Released rows chronological + scope sampleSize. Filters: criterion, period
   * (last4w|3m|all|custom), from/to (custom YYYY-MM-DD Colombo inclusive),
   * program, subtype, session.
   */
  public Map<String, Object> getPerformance(
      String authenticatedSubject, String studentId,
      String criterion, String period, String from, String to,
      String program, String subtype, String session,
      Instant now, String requestId) {
    String normCriterion = normalizeCriterion(criterion);
    TimeWindow.Window window = TimeWindow.resolve(period, from, to, now);
    PerformanceRepository.Filters filters =
        new PerformanceRepository.Filters(normCriterion, window, blankToNull(program),
            blankToNull(subtype), blankToNull(session));
    List<Map<String, Object>> rows = repo.findPerformanceRows(authenticatedSubject, studentId, filters, requestId);
    Map<String, Object> scope = new LinkedHashMap<>();
    scope.put("sampleSize", rows.size());
    scope.put("period", period == null || period.isBlank() ? "all" : period);
    scope.put("scopeLabel", TimeWindow.scopeLabel(period, from, to));
    if (normCriterion != null) {
      scope.put("criterion", normCriterion);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("rows", rows);
    out.put("scope", scope);
    return out;
  }

  // ------------------------------------------------------------------
  // /me/insights
  // ------------------------------------------------------------------

  /** Deterministic insights for the same filtered scope (Top5 + Expand, all + flag). */
  public Map<String, Object> getInsights(
      String authenticatedSubject, String studentId,
      String criterion, String period, String from, String to,
      String program, String subtype, String session,
      Instant now, String requestId) {
    String normCriterion = normalizeCriterion(criterion);
    TimeWindow.Window window = TimeWindow.resolve(period, from, to, now);
    PerformanceRepository.Filters filters =
        new PerformanceRepository.Filters(normCriterion, window, blankToNull(program),
            blankToNull(subtype), blankToNull(session));
    List<InsightsService.EvalPoint> points =
        repo.findInsightPoints(authenticatedSubject, studentId, filters, requestId);
    String scopeLabel = TimeWindow.scopeLabel(period, from, to);
    List<InsightsService.Insight> all = insights.buildInsights(points, scopeLabel);

    // Criterion filter narrows to that criterion (baseline always kept for context).
    if (normCriterion != null && InsightsService.CRITERION_KEYS.contains(normCriterion)) {
      List<InsightsService.Insight> narrowed = new ArrayList<>();
      for (InsightsService.Insight in : all) {
        if ("baseline".equals(in.type()) || normCriterion.equals(in.criterionKey())) {
          narrowed.add(in);
        }
      }
      // Re-apply Top5 flags on the narrowed view (display-only; storage keeps all).
      all = InsightsService.withTop5(narrowed);
    }

    List<Map<String, Object>> insightMaps = new ArrayList<>(all.size());
    List<Map<String, Object>> top5Maps = new ArrayList<>();
    for (InsightsService.Insight in : all) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("type", in.type());
      m.put("criterionKey", in.criterionKey());
      m.put("criterion", in.criterionKey());
      m.put("criterionLabel", in.criterionLabel());
      m.put("label", in.criterionLabel());
      m.put("message", in.message());
      m.put("basedOn", in.basedOn());
      m.put("evidence", in.evidence());
      m.put("inTop5", in.inTop5());
      insightMaps.add(m);
      if (in.inTop5()) {
        top5Maps.add(m);
      }
    }
    String evidenceWindow =
        points.isEmpty() ? "no evaluations"
            : points.size() == 1 ? "1 evaluation" : points.size() + " evaluations";
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("insights", insightMaps);
    out.put("top5", top5Maps);
    out.put("all", insightMaps);
    out.put("total", insightMaps.size());
    out.put("hasMore", insightMaps.size() > top5Maps.size());
    out.put("scopeLabel", scopeLabel);
    out.put("scope", scopeLabel);
    out.put("evidenceWindow", evidenceWindow);
    out.put("sampleSize", points.size());
    return out;
  }

  // ------------------------------------------------------------------
  // Helpers (validation: 422 via IllegalArgumentException)
  // ------------------------------------------------------------------

  /**
   * Normalize criterion param: blank/Overall Points -&gt; null (no narrow);
   * 10 frozen keys -&gt; key; else 422.
   */
  static String normalizeCriterion(String criterion) {
    if (criterion == null || criterion.isBlank()) {
      return null;
    }
    String c = criterion.trim();
    if (c.equalsIgnoreCase("Overall Points")
        || c.equalsIgnoreCase("overall_points")
        || c.equalsIgnoreCase("overall")
        || c.equalsIgnoreCase("all")) {
      return null;
    }
    String lower = c.toLowerCase();
    if (InsightsService.CRITERION_KEYS.contains(lower)) {
      return lower;
    }
    // Accept exact keys case-insensitively; anything else is 422.
    throw new IllegalArgumentException(
        "criterion must be one of preparation|clarity|confidence|focus|critical_analysis|sound|"
            + "audience_addressing|counter_arguments|wit|overall_performance|Overall Points (got "
            + criterion + ")");
  }

  private static String blankToNull(String v) {
    return v == null || v.isBlank() ? null : v.trim();
  }

  public String currentSubject() {
    return auth.currentSubject();
  }
}
