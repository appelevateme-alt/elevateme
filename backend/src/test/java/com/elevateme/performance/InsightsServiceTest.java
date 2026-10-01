package com.elevateme.performance;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/**
 * Covers: 29 flags strict alert while 30 does not; decline delta 7; improvement delta 16;
 * tie matched. Thresholds: alert iff score &lt; 30; DECLINE iff delta &lt;= -7;
 * IMPROVEMENT iff delta &gt;= +16; else MATCHED.
 */
class InsightsServiceTest {

  private final InsightsService insights = new InsightsService();

  @Test
  void strictAlert_29flags_30not() {
    assertTrue(insights.isStrictAlert(29));
    assertFalse(insights.isStrictAlert(30));
    assertFalse(insights.isStrictAlert(85));
  }

  @Test
  void decline7_flagged() {
    assertEquals(InsightsService.Trend.DECLINE, insights.classifyDelta(-7));
    assertEquals(InsightsService.Trend.DECLINE, insights.classify(80, 73));
  }

  @Test
  void improvement16_flagged() {
    assertEquals(InsightsService.Trend.IMPROVEMENT, insights.classifyDelta(16));
    assertEquals(InsightsService.Trend.IMPROVEMENT, insights.classify(60, 76));
  }

  @Test
  void tie_matched() {
    assertEquals(InsightsService.Trend.MATCHED, insights.classifyDelta(0));
    assertEquals(InsightsService.Trend.MATCHED, insights.classify(70, 70));
    // Near-threshold stability is also matched (not decline/improvement).
    assertEquals(InsightsService.Trend.MATCHED, insights.classifyDelta(-6));
    assertEquals(InsightsService.Trend.MATCHED, insights.classifyDelta(15));
  }
}
