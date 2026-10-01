package com.elevateme.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Binds {@code app.storage.*} from application.yml.
 *
 * <p>Server-side only: {@code secret-key} is the Supabase service_role key and MUST never leave
 * the backend (never serialized, never logged, never sent to the client). Signed URLs are minted
 * server-side with short expiries (upload 60s, read 300s).
 */
@Component
public class PhotoStorageProperties {

  private final String endpoint;
  private final String bucketPrivate;
  private final String secretKey;

  public PhotoStorageProperties(
      @Value("${app.storage.endpoint:https://example.supabase.co/storage/v1}") String endpoint,
      @Value("${app.storage.bucket-private:profile-photos-private}") String bucketPrivate,
      @Value("${app.storage.secret-key:dummy}") String secretKey) {
    this.endpoint = stripTrailingSlash(endpoint);
    this.bucketPrivate = bucketPrivate;
    this.secretKey = secretKey;
  }

  public String getEndpoint() {
    return endpoint;
  }

  public String getBucketPrivate() {
    return bucketPrivate;
  }

  /** Service-role key. Keep server-side only. */
  public String getSecretKey() {
    return secretKey;
  }

  private static String stripTrailingSlash(String v) {
    if (v == null) {
      return "";
    }
    return v.endsWith("/") ? v.substring(0, v.length() - 1) : v;
  }
}
