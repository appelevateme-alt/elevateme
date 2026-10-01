package com.elevateme.performance;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Phase 4 time-window handling for /me/performance + /me/insights.
 *
 * <ul>
 *   <li>Store UTC, display Asia/Colombo.</li>
 *   <li>Time filter is on session starts_at (NOT release time).</li>
 *   <li>last4w = today (Colombo local) + preceding 27d (28 days inclusive, half-open UTC).</li>
 *   <li>3m = today + preceding 89d (90 days inclusive, half-open UTC).</li>
 *   <li>custom inclusive local (YYYY-MM-DD Colombo) =&gt; half-open UTC
 *       [start 00:00 Colombo, (end+1d) 00:00 Colombo).</li>
 *   <li>all = no time filter.</li>
 * </ul>
 *
 * <p>Colombo is fixed +05:30 (no DST); conversions use ZoneId Asia/Colombo explicitly.
 */
public final class TimeWindow {
  public static final ZoneId COLOMBO = ZoneId.of("Asia/Colombo");

  private TimeWindow() {}

  public record Window(Instant startInclusive, Instant endExclusive) {}

  /** Resolve period to a half-open UTC window, or null for {@code all} (no filter). */
  public static Window resolve(
      String period, String from, String to, Instant now) {
    String p = period == null || period.isBlank() ? "all" : period.trim().toLowerCase();
    Instant effectiveNow = now == null ? Instant.now() : now;
    LocalDate todayColombo = effectiveNow.atZone(COLOMBO).toLocalDate();
    return switch (p) {
      case "last4w" -> {
        LocalDate start = todayColombo.minusDays(27);
        yield halfOpenFromColomboDates(start, todayColombo);
      }
      case "3m" -> {
        LocalDate start = todayColombo.minusDays(89);
        yield halfOpenFromColomboDates(start, todayColombo);
      }
      case "custom" -> {
        if (from == null || from.isBlank() || to == null || to.isBlank()) {
          throw new IllegalArgumentException("custom period requires from and to (YYYY-MM-DD)");
        }
        LocalDate s = LocalDate.parse(from.trim());
        LocalDate e = LocalDate.parse(to.trim());
        if (e.isBefore(s)) {
          throw new IllegalArgumentException("to must be on/after from");
        }
        yield halfOpenFromColomboDates(s, e);
      }
      case "all" -> null;
      default -> throw new IllegalArgumentException(
          "period must be one of last4w|3m|all|custom (got " + period + ")");
    };
  }

  /** Inclusive Colombo dates -&gt; half-open UTC [start 00:00, (end+1d) 00:00). */
  public static Window halfOpenFromColomboDates(LocalDate startInclusive, LocalDate endInclusive) {
    Instant start = startInclusive.atStartOfDay(COLOMBO).toInstant();
    Instant end = endInclusive.plusDays(1).atStartOfDay(COLOMBO).toInstant();
    return new Window(start, end);
  }

  /** True when starts_at falls inside the window (null window = all, always true). */
  public static boolean contains(Window window, Instant startsAt) {
    if (window == null) {
      return true;
    }
    if (startsAt == null) {
      return false;
    }
    return !startsAt.isBefore(window.startInclusive()) && startsAt.isBefore(window.endExclusive());
  }

  /** Scope label for Based-on attribution (e.g. "last 4 weeks", "last 3 months", "all time"). */
  public static String scopeLabel(String period, String from, String to) {
    String p = period == null || period.isBlank() ? "all" : period.trim().toLowerCase();
    return switch (p) {
      case "last4w" -> "last 4 weeks";
      case "3m" -> "last 3 months";
      case "custom" -> "custom " + from + " to " + to;
      default -> "all time";
    };
  }
}
