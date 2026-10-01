package com.elevateme.identity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.stereotype.Component;

/**
 * Minimal Supabase Storage client using the service_role key server-side only.
 *
 * <p>Security notes:
 * <ul>
 *   <li>Service key is sent ONLY as {@code apikey} + {@code Authorization: Bearer} headers to the
 *       configured storage endpoint. It is never serialized, never logged, never returned.</li>
 *   <li>Signed URL tokens (query strings) are treated as credentials: never logged.</li>
 *   <li>Bucket is always the private bucket ({@code profile-photos-private}); no public URLs.</li>
 * </ul>
 */
@Component
public class SupabaseStorageClient {

  private final PhotoStorageProperties props;
  private final HttpClient http;
  private final ObjectMapper mapper;

  public SupabaseStorageClient(PhotoStorageProperties props) {
    this(props, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(), new ObjectMapper());
  }

  SupabaseStorageClient(PhotoStorageProperties props, HttpClient http, ObjectMapper mapper) {
    this.props = props;
    this.http = http;
    this.mapper = mapper;
  }

  /** Object metadata from a HEAD request. */
  public record HeadResult(boolean exists, String contentType, long sizeBytes) {}

  /**
   * Mints a short-lived signed UPLOAD URL (60s) for a private path.
   * POST {endpoint}/object/upload/sign/{bucket}/{path}
   */
  public String createSignedUploadUrl(String path, String contentType) {
    try {
      String url = props.getEndpoint() + "/object/upload/sign/" + props.getBucketPrivate() + "/" + path;
      String body = "{\"contentType\":" + mapper.writeValueAsString(contentType) + "}";
      HttpRequest req =
          HttpRequest.newBuilder(URI.create(url))
              .timeout(Duration.ofSeconds(10))
              .header("apikey", props.getSecretKey())
              .header("Authorization", "Bearer " + props.getSecretKey())
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(body))
              .build();
      HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
      if (res.statusCode() != 200 && res.statusCode() != 201) {
        throw new IllegalStateException("Storage upload-sign failed: " + res.statusCode());
      }
      JsonNode node = mapper.readTree(res.body());
      String signedPath = textOf(node, "url", "signedUrl", "signedURL", "path");
      String token = textOf(node, "token");
      if (signedPath != null && !signedPath.isBlank()) {
        if (signedPath.startsWith("http")) {
          return token == null || token.isBlank() ? signedPath : signedPath + "?token=" + token;
        }
        String normalized = signedPath.startsWith("/") ? signedPath : "/" + signedPath;
        return token == null || token.isBlank()
            ? props.getEndpoint() + normalized
            : props.getEndpoint() + normalized + "?token=" + token;
      }
      // Fallback: Supabase upload-sign token flow.
      if (token != null && !token.isBlank()) {
        return props.getEndpoint()
            + "/object/upload/sign/"
            + props.getBucketPrivate()
            + "/"
            + path
            + "?token="
            + token;
      }
      throw new IllegalStateException("Storage upload-sign returned no URL");
    } catch (PhotoValidationException | PhotoForbiddenException e) {
      throw e;
    } catch (Exception e) {
      throw new IllegalStateException("Storage upload-sign failed", e);
    }
  }

  /** HEADs a private object to confirm existence + MIME/size. */
  public HeadResult headObject(String path) {
    try {
      String url = props.getEndpoint() + "/object/" + props.getBucketPrivate() + "/" + path;
      HttpRequest req =
          HttpRequest.newBuilder(URI.create(url))
              .timeout(Duration.ofSeconds(10))
              .header("apikey", props.getSecretKey())
              .header("Authorization", "Bearer " + props.getSecretKey())
              .method("HEAD", HttpRequest.BodyPublishers.noBody())
              .build();
      HttpResponse<Void> res = http.send(req, HttpResponse.BodyHandlers.discarding());
      if (res.statusCode() == 404) {
        return new HeadResult(false, null, -1);
      }
      if (res.statusCode() != 200) {
        throw new IllegalStateException("Storage HEAD failed: " + res.statusCode());
      }
      String ct = res.headers().firstValue("content-type").orElse("application/octet-stream");
      long len = res.headers().firstValueAsLong("content-length").orElse(-1L);
      return new HeadResult(true, ct, len);
    } catch (Exception e) {
      throw new IllegalStateException("Storage HEAD failed", e);
    }
  }

  /** Fetches the first {@code n} bytes (Range) for magic-byte validation. */
  public byte[] fetchHeadBytes(String path, int n) {
    try {
      String url = props.getEndpoint() + "/object/" + props.getBucketPrivate() + "/" + path;
      HttpRequest req =
          HttpRequest.newBuilder(URI.create(url))
              .timeout(Duration.ofSeconds(10))
              .header("apikey", props.getSecretKey())
              .header("Authorization", "Bearer " + props.getSecretKey())
              .header("Range", "bytes=0-" + (n - 1))
              .GET()
              .build();
      HttpResponse<byte[]> res = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
      if (res.statusCode() != 200 && res.statusCode() != 206) {
        throw new IllegalStateException("Storage range GET failed: " + res.statusCode());
      }
      return res.body();
    } catch (Exception e) {
      throw new IllegalStateException("Storage range GET failed", e);
    }
  }

  /**
   * Mints a short-lived signed READ URL (default 300s).
   * POST {endpoint}/object/sign/{bucket}/{path} {"expiresIn":300}
   */
  public String createSignedReadUrl(String path, int expiresInSeconds) {
    try {
      String url = props.getEndpoint() + "/object/sign/" + props.getBucketPrivate() + "/" + path;
      String body = "{\"expiresIn\":" + expiresInSeconds + "}";
      HttpRequest req =
          HttpRequest.newBuilder(URI.create(url))
              .timeout(Duration.ofSeconds(10))
              .header("apikey", props.getSecretKey())
              .header("Authorization", "Bearer " + props.getSecretKey())
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(body))
              .build();
      HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
      if (res.statusCode() != 200 && res.statusCode() != 201) {
        throw new IllegalStateException("Storage sign failed: " + res.statusCode());
      }
      JsonNode node = mapper.readTree(res.body());
      String signed = textOf(node, "signedURL", "signedUrl", "url");
      if (signed == null || signed.isBlank()) {
        throw new IllegalStateException("Storage sign returned no URL");
      }
      if (signed.startsWith("http")) {
        return signed;
      }
      return props.getEndpoint() + (signed.startsWith("/") ? signed : "/" + signed);
    } catch (Exception e) {
      throw new IllegalStateException("Storage sign failed", e);
    }
  }

  private static String textOf(JsonNode node, String... keys) {
    for (String k : keys) {
      if (node.has(k) && node.get(k).isTextual()) {
        return node.get(k).asText();
      }
    }
    return null;
  }
}
