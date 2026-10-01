package com.elevateme.common.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.DefaultJWKSetCache;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.proc.BadJOSEException;
import com.nimbusds.jose.proc.JWSKeySelector;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.util.DefaultResourceRetriever;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.net.MalformedURLException;
import java.net.URI;
import java.text.ParseException;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Verifies Supabase JWTs: signature via JWKS (RS256/ES256), then issuer, audience, expiry/nbf.
 *
 * <ul>
 *   <li>JWKS fetched from {@code ${app.supabase.jwks-url}}, keys cached 10 minutes.</li>
 *   <li>Issuer must equal {@code ${app.supabase.issuer}}.</li>
 *   <li>Audience passes when it contains {@code ${app.supabase.audience}} OR {@code authenticated}.</li>
 *   <li>Expiry + not-before enforced with 60s clock skew.</li>
 *   <li>Returns the verified subject + email. No service-role bypass, no mocks.</li>
 * </ul>
 *
 * <p>{@link #verifyClaims(JWTClaimsSet, String, String, Date)} is pure and unit-testable
 * (no network, no JWKS).
 */
@Component
public class JwtVerifier {

  /** Clock skew tolerance for exp/nbf checks (Supabase/PostgREST convention). */
  public static final long CLOCK_SKEW_SECONDS = 60;

  /** Fallback audience accepted even when the configured audience differs. */
  public static final String AUTHENTICATED_AUDIENCE = "authenticated";

  private final ConfigurableJWTProcessor<SecurityContext> processor;
  private final String expectedIssuer;
  private final String expectedAudience;

  public JwtVerifier(
      @Value("${app.supabase.jwks-url}") String jwksUrl,
      @Value("${app.supabase.issuer}") String issuer,
      @Value("${app.supabase.audience:authenticated}") String audience)
      throws MalformedURLException {
    final java.net.URL url;
    try {
      url = URI.create(jwksUrl).toURL();
    } catch (IllegalArgumentException e) {
      // URI.create rejects illegal characters (e.g. spaces) with IllegalArgumentException;
      // surface as MalformedURLException so callers/tests see a single failure type.
      throw new MalformedURLException("Invalid JWKS URL: " + e.getMessage());
    }
    var retriever = new DefaultResourceRetriever(2000, 2000, 512 * 1024);
    var cache = new DefaultJWKSetCache(10, 10, TimeUnit.MINUTES);
    JWKSource<SecurityContext> jwkSource = new RemoteJWKSet<>(url, retriever, cache);
    JWSKeySelector<SecurityContext> keySelector =
        new JWSVerificationKeySelector<>(Set.of(JWSAlgorithm.RS256, JWSAlgorithm.ES256), jwkSource);
    DefaultJWTProcessor<SecurityContext> p = new DefaultJWTProcessor<>();
    p.setJWSKeySelector(keySelector);
    // Signature is enforced by the processor; iss/aud/exp/nbf are enforced explicitly
    // in verifyClaims() below so the rules (skew, aud fallback) stay unit-testable.
    p.setJWTClaimsSetVerifier((claims, ctx) -> {});
    this.processor = p;
    this.expectedIssuer = issuer;
    this.expectedAudience = audience;
  }

  /** Verified identity extracted from a token: subject (sub) + email claim (may be null). */
  public record VerifiedPrincipal(String subject, String email) {}

  /**
   * Verifies a compact JWT: signature via JWKS, then {@link #verifyClaims}.
   *
   * @throws ParseException on malformed/blank tokens (before any network fetch)
   * @throws BadJOSEException on signature/issuer/audience/expiry/subject failure
   * @throws JOSEException on JOSE processing failure
   */
  public VerifiedPrincipal verify(String token) throws ParseException, BadJOSEException, JOSEException {
    if (token == null || token.isBlank()) {
      throw new ParseException("Missing bearer token", 0);
    }
    JWTClaimsSet claims = processor.process(token, null);
    return verifyClaims(claims, expectedIssuer, expectedAudience, new Date());
  }

  /** Pure claim checks with explicit clock — no network. Used by {@link #verify} and tests. */
  public static VerifiedPrincipal verifyClaims(
      JWTClaimsSet claims, String expectedIssuer, String expectedAudience, Date now)
      throws BadJOSEException {
    if (claims == null) {
      throw new BadJOSEException("Missing claims");
    }
    long skewMs = CLOCK_SKEW_SECONDS * 1000L;
    long nowMs = now.getTime();

    Date exp = claims.getExpirationTime();
    if (exp == null || nowMs > exp.getTime() + skewMs) {
      throw new BadJOSEException("Expired token");
    }
    Date nbf = claims.getNotBeforeTime();
    if (nbf != null && nowMs + skewMs < nbf.getTime()) {
      throw new BadJOSEException("Token not yet valid");
    }
    if (expectedIssuer != null && !expectedIssuer.isBlank()
        && !expectedIssuer.equals(claims.getIssuer())) {
      throw new BadJOSEException("Invalid issuer");
    }
    if (expectedAudience != null && !expectedAudience.isBlank()) {
      List<String> aud = claims.getAudience();
      if (aud == null
          || (!aud.contains(expectedAudience) && !aud.contains(AUTHENTICATED_AUDIENCE))) {
        throw new BadJOSEException("Invalid audience");
      }
    }
    String sub = claims.getSubject();
    if (sub == null || sub.isBlank()) {
      throw new BadJOSEException("Missing subject");
    }
    String email = null;
    try {
      email = claims.getStringClaim("email");
    } catch (ParseException e) {
      throw new BadJOSEException("Invalid email claim");
    }
    return new VerifiedPrincipal(sub, email);
  }
}
