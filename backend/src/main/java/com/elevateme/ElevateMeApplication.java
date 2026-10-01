package com.elevateme;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling // required by OutboxWorker retry-with-backoff skeleton
public class ElevateMeApplication {
  public static void main(String[] args) {
    SpringApplication.run(ElevateMeApplication.class, args);
  }
}
