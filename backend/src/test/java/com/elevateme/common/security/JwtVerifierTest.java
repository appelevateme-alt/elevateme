package com.elevateme.common.security;

import static org.junit.jupiter.api.Assertions.*;

import com.nimbusds.jose.proc.BadJOSEException;
import com.nimbusds.jwt.JWTClaimsSet;
import java.net.MalformedURLException;
import java.util.Date;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Phase 1a: real JWT claim verification — pure unit tests (no DB, no network).
 *
 * <p>Token-parse failures throw before any JWKS fetch, so the malformed/garbage/empty/null
 * tests never contact the network. Claim-rule tests use the pure
 * {@link JwtVerifier#verifyClaims} overload with hand-built claims.
 */
class JwtVerifierTest {

  private static final String ISS = "https://example.invalid/auth/v1";
  private static final String AUD = "authenticated";

  private static JwtVerifier verifier() throws MalformedURLException {
    // Dummy JWKS URL: never fetched because malformed tokens fail at parse time.
    return new JwtVerifier(
        "https://example.invalid/auth/v1/.well-known/jwks.json", ISS, AUD);
  }

  private static JWTClaimsSet claims(
      String sub, String iss, List<String> aud, Date exp, Date nbf, String email) {
    var b =
        new JWTClaimsSet.Builder()
            .subject(sub)
            .issuer(iss)
            .audience(aud)
            .expirationTime(exp)
            .notBeforeTime(nbf);
    if (email != null) {
      b.claim("email", email);
    }
    return b.build();
  }

  private static Date secondsFromNow(long seconds) {
    return new Date(System.currentTimeMillis() + seconds * 1000L);
  }

  private JWTClaimsSet validClaims() {
    return claims(
        "subject-123", ISS, List.of(AUD), secondsFromNow(3600), secondsFromNow(-60), "a@x.test");
  }

  @Test
  void malformedJwksUrl_throws() {
    assertThrows(MalformedURLException.class, () -> new JwtVerifier("ht!tp:// bad url", "iss", "aud"));
  }

  @Test
  void garbageToken_throwsWithoutNetwork() throws Exception {
    JwtVerifier v = verifier();
    assertThrows(Exception.class, () -> v.verify("not-a-jwt"));
  }

  @Test
  void emptyToken_throwsWithoutNetwork() throws Exception {
    JwtVerifier v = verifier();
    assertThrows(Exception.class, () -> v.verify(""));
  }

  @Test
  void nullToken_throwsWithoutNetwork() throws Exception {
    JwtVerifier v = verifier();
    assertThrows(Exception.class, () -> v.verify(null));
  }

  @Test
  void validClaims_pass() throws Exception {
    var out = JwtVerifier.verifyClaims(validClaims(), ISS, AUD, new Date());
    assertEquals("subject-123", out.subject());
    assertEquals("a@x.test", out.email());
  }

  @Test
  void expiredFails() {
    var c = claims("s", ISS, List.of(AUD), secondsFromNow(-3600), null, null);
    assertThrows(BadJOSEException.class, () -> JwtVerifier.verifyClaims(c, ISS, AUD, new Date()));
  }

  @Test
  void expiredWithinSkewPasses() throws Exception {
    // 30s past expiry is inside the 60s clock-skew window.
    var c = claims("s", ISS, List.of(AUD), secondsFromNow(-30), null, null);
    assertDoesNotThrow(() -> JwtVerifier.verifyClaims(c, ISS, AUD, new Date()));
  }

  @Test
  void wrongIssuerFails() {
    var c = claims("s", "https://evil.invalid/auth/v1", List.of(AUD), secondsFromNow(60), null, null);
    assertThrows(BadJOSEException.class, () -> JwtVerifier.verifyClaims(c, ISS, AUD, new Date()));
  }

  @Test
  void wrongAudienceFails() {
    var c = claims("s", ISS, List.of("someone-else"), secondsFromNow(60), null, null);
    assertThrows(BadJOSEException.class, () -> JwtVerifier.verifyClaims(c, ISS, AUD, new Date()));
  }

  @Test
  void authenticatedFallbackAudiencePasses() throws Exception {
    // Configured audience differs but aud==authenticated is accepted (Supabase convention).
    var c = claims("s", ISS, List.of("authenticated"), secondsFromNow(60), null, null);
    assertDoesNotThrow(() -> JwtVerifier.verifyClaims(c, ISS, "my-custom-aud", new Date()));
  }

  @Test
  void missingSubjectFails() {
    var c = claims(null, ISS, List.of(AUD), secondsFromNow(60), null, null);
    assertThrows(BadJOSEException.class, () -> JwtVerifier.verifyClaims(c, ISS, AUD, new Date()));
  }

  @Test
  void notBeforeFutureFails() {
    var c = claims("s", ISS, List.of(AUD), secondsFromNow(3600), secondsFromNow(300), null);
    assertThrows(BadJOSEException.class, () -> JwtVerifier.verifyClaims(c, ISS, AUD, new Date()));
  }
}
