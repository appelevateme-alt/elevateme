package com.diplomaticimpact.access;

import java.util.Map;
import java.util.UUID;
import java.sql.SQLException;
import org.slf4j.LoggerFactory;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;

@RestControllerAdvice
class AccessErrors {
  @ExceptionHandler(ResponseStatusException.class) ResponseEntity<?> expected(ResponseStatusException e){return ResponseEntity.status(e.getStatusCode()).body(Map.of("message",e.getReason()==null?"Request unavailable":e.getReason()));}
  @ExceptionHandler({MethodArgumentNotValidException.class,HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class}) ResponseEntity<?> invalid(Exception e){return ResponseEntity.unprocessableEntity().body(Map.of("message","Check the required fields and whole-number scores."));}
  @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<?> conflict(Exception e){return ResponseEntity.status(409).body(Map.of("message","This record changed or is already assigned. Refresh and try again."));}
  @ExceptionHandler(Exception.class) ResponseEntity<?> unexpected(Exception e){
    String reference=UUID.randomUUID().toString();
    String sqlState="none";
    for(Throwable cause=e;cause!=null;cause=cause.getCause()) {
      if(cause instanceof SQLException sql){sqlState=sql.getSQLState();break;}
    }
    // Do not log SQL, parameters, cookies, tokens, feedback or exception messages.
    LoggerFactory.getLogger(AccessErrors.class).error("Access failure reference={} type={} sqlState={}",reference,e.getClass().getSimpleName(),sqlState);
    return ResponseEntity.internalServerError().body(Map.of("message","The request could not be completed. Your last saved work is preserved. Reference: "+reference));
  }
  @Bean Jackson2ObjectMapperBuilderCustomizer strictIntegers(){return b->b.featuresToDisable(com.fasterxml.jackson.databind.DeserializationFeature.ACCEPT_FLOAT_AS_INT);}
}
