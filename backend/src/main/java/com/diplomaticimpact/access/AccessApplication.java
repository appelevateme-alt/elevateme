package com.diplomaticimpact.access;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Production entry point for the deployed public-schema app. No revamp controllers scanned. */
@SpringBootApplication
@EnableScheduling
public class AccessApplication {
  public static void main(String[] args) {
    SpringApplication app = new SpringApplication(AccessApplication.class);
    app.setAdditionalProfiles("evaluator-access");
    app.run(args);
  }
}
