/**
 * Intelligent retry mechanisms with exponential backoff, circuit breaker pattern, and failure classification.
 * Provides comprehensive retry strategies for different operation types with monitoring and statistics.
 */

import { DocGenError, ErrorCategory, ErrorCode, NetworkError, AIServiceError, RateLimitError } from './error-types';
import { Logger } from '../utils/logger';

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation, requests allowed
  OPEN = 'open',         // Circuit is open, requests blocked
  HALF_OPEN = 'half_open' // Testing if service has recovered
}

/**
 * Operation types for different retry strategies
 */
export enum OperationType {
  AI_CALL = 'ai_call',
  HTTP_REQUEST = 'http_request',
  FILE_OPERATION = 'file_operation',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication'
}

/**
 * Retry configuration interface
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitterFactor: number;
  timeout: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
  circuitBreakerHalfOpenMaxCalls: number;
  retryableErrorCodes: ErrorCode[];
  retryableHttpStatusCodes: number[];
  operationType: OperationType;
}

/**
 * Circuit breaker state information
 */
export interface CircuitBreakerState {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  halfOpenAttempts: number;
  totalRequests: number;
  successfulRequests: number;
}

/**
 * Retry attempt result
 */
export interface RetryAttempt {
  attemptNumber: number;
  timestamp: Date;
  delay: number;
  error?: Error;
  success: boolean;
  duration: number;
}

/**
 * Retry result with statistics
 */
export interface RetryResult<T = any> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: RetryAttempt[];
  totalDuration: number;
  circuitBreakerTriggered: boolean;
  finalAttemptNumber: number;
}

/**
 * Retry statistics for monitoring
 */
export interface RetryStatistics {
  operationType: OperationType;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalRetries: number;
  averageAttempts: number;
  averageDuration: number;
  circuitBreakerActivations: number;
  lastUpdated: Date;
}

/**
 * Default retry configurations for different operation types
 */
const DEFAULT_RETRY_CONFIGS: Record<OperationType, RetryConfig> = {
  [OperationType.AI_CALL]: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    exponentialBase: 2,
    jitterFactor: 0.1,
    timeout: 60000,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000,
    circuitBreakerHalfOpenMaxCalls: 3,
    retryableErrorCodes: [
      ErrorCode.AI_SERVICE_UNAVAILABLE,
      ErrorCode.AI_SERVICE_QUOTA_EXCEEDED,
      ErrorCode.NETWORK_TIMEOUT,
      ErrorCode.NETWORK_CONNECTION_FAILED
    ],
    retryableHttpStatusCodes: [429, 500, 502, 503, 504],
    operationType: OperationType.AI_CALL
  },
  [OperationType.HTTP_REQUEST]: {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 10000,
    exponentialBase: 2,
    jitterFactor: 0.1,
    timeout: 30000,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 10,
    circuitBreakerTimeout: 30000,
    circuitBreakerHalfOpenMaxCalls: 5,
    retryableErrorCodes: [
      ErrorCode.NETWORK_TIMEOUT,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      ErrorCode.NETWORK_UNREACHABLE
    ],
    retryableHttpStatusCodes: [408, 429, 500, 502, 503, 504],
    operationType: OperationType.HTTP_REQUEST
  },
  [OperationType.FILE_OPERATION]: {
    maxAttempts: 2,
    baseDelay: 100,
    maxDelay: 1000,
    exponentialBase: 2,
    jitterFactor: 0.05,
    timeout: 10000,
    enableCircuitBreaker: false,
    circuitBreakerThreshold: 0,
    circuitBreakerTimeout: 0,
    circuitBreakerHalfOpenMaxCalls: 0,
    retryableErrorCodes: [],
    retryableHttpStatusCodes: [],
    operationType: OperationType.FILE_OPERATION
  },
  [OperationType.VALIDATION]: {
    maxAttempts: 1,
    baseDelay: 0,
    maxDelay: 0,
    exponentialBase: 1,
    jitterFactor: 0,
    timeout: 5000,
    enableCircuitBreaker: false,
    circuitBreakerThreshold: 0,
    circuitBreakerTimeout: 0,
    circuitBreakerHalfOpenMaxCalls: 0,
    retryableErrorCodes: [],
    retryableHttpStatusCodes: [],
    operationType: OperationType.VALIDATION
  },
  [OperationType.AUTHENTICATION]: {
    maxAttempts: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    exponentialBase: 2,
    jitterFactor: 0.1,
    timeout: 15000,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 3,
    circuitBreakerTimeout: 300000, // 5 minutes
    circuitBreakerHalfOpenMaxCalls: 1,
    retryableErrorCodes: [
      ErrorCode.AUTH_TOKEN_EXPIRED,
      ErrorCode.NETWORK_TIMEOUT,
      ErrorCode.NETWORK_CONNECTION_FAILED
    ],
    retryableHttpStatusCodes: [401, 429, 500, 502, 503, 504],
    operationType: OperationType.AUTHENTICATION
  }
};

/**
 * Intelligent retry strategy with circuit breaker pattern
 */
export class RetryStrategy {
  private config: RetryConfig;
  private circuitBreaker: CircuitBreakerState;
  private statistics: RetryStatistics;
  private logger: Logger;

  constructor(operationType: OperationType, customConfig?: Partial<RetryConfig>, logger?: Logger) {
    this.config = {
      ...DEFAULT_RETRY_CONFIGS[operationType],
      ...customConfig,
      operationType
    };

    this.circuitBreaker = {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      halfOpenAttempts: 0,
      totalRequests: 0,
      successfulRequests: 0
    };

    this.statistics = {
      operationType,
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalRetries: 0,
      averageAttempts: 0,
      averageDuration: 0,
      circuitBreakerActivations: 0,
      lastUpdated: new Date()
    };

    this.logger = logger || new Logger();
  }

  /**
   * Determine if an error should be retried
   */
  public shouldRetry(error: Error, attemptNumber: number): boolean {
    // Check if we've exceeded max attempts
    if (attemptNumber >= this.config.maxAttempts) {
      this.logger.debug(`Max attempts (${this.config.maxAttempts}) reached for ${this.config.operationType}`);
      return false;
    }

    // Check circuit breaker state
    if (this.config.enableCircuitBreaker && this.circuitBreaker.state === CircuitBreakerState.OPEN) {
      this.logger.debug(`Circuit breaker is open for ${this.config.operationType}`);
      return false;
    }

    // Check if error is retryable
    if (error instanceof DocGenError) {
      // Check if error code is retryable
      if (this.config.retryableErrorCodes.includes(error.code)) {
        this.logger.debug(`Error code ${error.code} is retryable for ${this.config.operationType}`);
        return true;
      }

      // Check if error has built-in retry logic
      if (error.isRetryable()) {
        this.logger.debug(`Error ${error.constructor.name} is marked as retryable`);
        return true;
      }

      // Special handling for rate limit errors
      if (error instanceof RateLimitError) {
        this.logger.debug(`Rate limit error detected, will retry after delay`);
        return true;
      }
    }

    // Check HTTP status codes for network errors
    if (error instanceof NetworkError && error.statusCode) {
      if (this.config.retryableHttpStatusCodes.includes(error.statusCode)) {
        this.logger.debug(`HTTP status ${error.statusCode} is retryable for ${this.config.operationType}`);
        return true;
      }
    }

    // Check for specific error patterns
    if (this.isTransientError(error)) {
      this.logger.debug(`Transient error detected: ${error.message}`);
      return true;
    }

    this.logger.debug(`Error not retryable: ${error.message}`);
    return false;
  }

  /**
   * Calculate delay for next retry attempt with exponential backoff and jitter
   */
  public calculateDelay(attemptNumber: number, error?: Error): number {
    // Handle rate limit errors with specific retry-after
    if (error instanceof RateLimitError && error.getRetryDelay) {
      const rateLimitDelay = error.getRetryDelay();
      this.logger.debug(`Using rate limit delay: ${rateLimitDelay}ms`);
      return rateLimitDelay;
    }

    // Calculate exponential backoff
    const exponentialDelay = this.config.baseDelay * Math.pow(this.config.exponentialBase, attemptNumber - 1);

    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
    const delayWithJitter = exponentialDelay + jitter;

    // Cap at maximum delay
    const finalDelay = Math.min(delayWithJitter, this.config.maxDelay);

    this.logger.debug(`Calculated retry delay: ${finalDelay}ms for attempt ${attemptNumber}`);
    return finalDelay;
  }

  /**
   * Execute operation with retry logic
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: Error | undefined;
    let circuitBreakerTriggered = false;

    this.statistics.totalOperations++;
    this.circuitBreaker.totalRequests++;

    // Check circuit breaker before starting
    if (this.config.enableCircuitBreaker && !this.isCircuitBreakerAllowingRequests()) {
      circuitBreakerTriggered = true;
      const error = new Error(`Circuit breaker is open for ${this.config.operationType}`);
      this.updateStatistics(false, 0, Date.now() - startTime);
      return {
        success: false,
        error,
        attempts: [],
        totalDuration: Date.now() - startTime,
        circuitBreakerTriggered,
        finalAttemptNumber: 0
      };
    }

    for (let attemptNumber = 1; attemptNumber <= this.config.maxAttempts; attemptNumber++) {
      const attemptStartTime = Date.now();
      
      try {
        this.logger.debug(`Attempt ${attemptNumber}/${this.config.maxAttempts} for ${context || this.config.operationType}`);

        // Execute operation with timeout
        const result = await this.executeWithTimeout(operation, this.config.timeout);

        // Record successful attempt
        const attempt: RetryAttempt = {
          attemptNumber,
          timestamp: new Date(),
          delay: 0,
          success: true,
          duration: Date.now() - attemptStartTime
        };
        attempts.push(attempt);

        // Update circuit breaker on success
        this.onOperationSuccess();

        // Update statistics
        this.updateStatistics(true, attemptNumber, Date.now() - startTime);

        this.logger.debug(`Operation succeeded on attempt ${attemptNumber}`);
        return {
          success: true,
          result,
          attempts,
          totalDuration: Date.now() - startTime,
          circuitBreakerTriggered,
          finalAttemptNumber: attemptNumber
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Record failed attempt
        const attempt: RetryAttempt = {
          attemptNumber,
          timestamp: new Date(),
          delay: 0,
          error: lastError,
          success: false,
          duration: Date.now() - attemptStartTime
        };
        attempts.push(attempt);

        this.logger.debug(`Attempt ${attemptNumber} failed: ${lastError.message}`);

        // Update circuit breaker on failure
        this.onOperationFailure();

        // Check if we should retry
        if (!this.shouldRetry(lastError, attemptNumber)) {
          break;
        }

        // Calculate and apply delay before next attempt
        if (attemptNumber < this.config.maxAttempts) {
          const delay = this.calculateDelay(attemptNumber, lastError);
          attempt.delay = delay;

          if (delay > 0) {
            this.logger.debug(`Waiting ${delay}ms before retry`);
            await this.sleep(delay);
          }
        }
      }
    }

    // All attempts failed
    this.updateStatistics(false, attempts.length, Date.now() - startTime);

    this.logger.debug(`All retry attempts failed for ${context || this.config.operationType}`);
    return {
      success: false,
      error: lastError,
      attempts,
      totalDuration: Date.now() - startTime,
      circuitBreakerTriggered,
      finalAttemptNumber: attempts.length
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  public resetCircuitBreaker(): void {
    this.logger.debug(`Resetting circuit breaker for ${this.config.operationType}`);
    this.circuitBreaker = {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      halfOpenAttempts: 0,
      totalRequests: this.circuitBreaker.totalRequests,
      successfulRequests: this.circuitBreaker.successfulRequests
    };
  }

  /**
   * Get current circuit breaker state
   */
  public getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  /**
   * Get retry statistics
   */
  public getStatistics(): RetryStatistics {
    return { ...this.statistics };
  }

  /**
   * Update retry configuration
   */
  public updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.debug(`Updated retry config for ${this.config.operationType}`);
  }

  /**
   * Check if circuit breaker allows requests
   */
  private isCircuitBreakerAllowingRequests(): boolean {
    if (!this.config.enableCircuitBreaker) {
      return true;
    }

    const now = Date.now();

    switch (this.circuitBreaker.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if timeout has passed
        if (this.circuitBreaker.nextAttemptTime && now >= this.circuitBreaker.nextAttemptTime.getTime()) {
          this.circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
          this.circuitBreaker.halfOpenAttempts = 0;
          this.logger.debug(`Circuit breaker transitioning to half-open for ${this.config.operationType}`);
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return this.circuitBreaker.halfOpenAttempts < this.config.circuitBreakerHalfOpenMaxCalls;

      default:
        return false;
    }
  }

  /**
   * Handle successful operation for circuit breaker
   */
  private onOperationSuccess(): void {
    if (!this.config.enableCircuitBreaker) {
      return;
    }

    this.circuitBreaker.successfulRequests++;

    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreaker.halfOpenAttempts++;
      
      // If enough successful calls in half-open, close the circuit
      if (this.circuitBreaker.halfOpenAttempts >= this.config.circuitBreakerHalfOpenMaxCalls) {
        this.circuitBreaker.state = CircuitBreakerState.CLOSED;
        this.circuitBreaker.failureCount = 0;
        this.logger.debug(`Circuit breaker closed after successful half-open attempts for ${this.config.operationType}`);
      }
    } else if (this.circuitBreaker.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * Handle failed operation for circuit breaker
   */
  private onOperationFailure(): void {
    if (!this.config.enableCircuitBreaker) {
      return;
    }

    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = new Date();

    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      // Failure in half-open state opens the circuit immediately
      this.openCircuitBreaker();
    } else if (this.circuitBreaker.state === CircuitBreakerState.CLOSED) {
      // Check if failure threshold is reached
      if (this.circuitBreaker.failureCount >= this.config.circuitBreakerThreshold) {
        this.openCircuitBreaker();
      }
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuitBreaker(): void {
    this.circuitBreaker.state = CircuitBreakerState.OPEN;
    this.circuitBreaker.nextAttemptTime = new Date(Date.now() + this.config.circuitBreakerTimeout);
    this.statistics.circuitBreakerActivations++;
    
    this.logger.warn(`Circuit breaker opened for ${this.config.operationType} due to ${this.circuitBreaker.failureCount} failures`);
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      operation()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is transient (temporary)
   */
  private isTransientError(error: Error): boolean {
    const transientPatterns = [
      /timeout/i,
      /connection.*reset/i,
      /connection.*refused/i,
      /temporary.*failure/i,
      /service.*unavailable/i,
      /too.*many.*requests/i,
      /rate.*limit/i,
      /quota.*exceeded/i,
      /throttle/i
    ];

    const message = error.message.toLowerCase();
    return transientPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Update retry statistics
   */
  private updateStatistics(success: boolean, attempts: number, duration: number): void {
    if (success) {
      this.statistics.successfulOperations++;
    } else {
      this.statistics.failedOperations++;
    }

    this.statistics.totalRetries += Math.max(0, attempts - 1);
    
    // Update averages
    const totalOps = this.statistics.totalOperations;
    this.statistics.averageAttempts = (this.statistics.averageAttempts * (totalOps - 1) + attempts) / totalOps;
    this.statistics.averageDuration = (this.statistics.averageDuration * (totalOps - 1) + duration) / totalOps;
    
    this.statistics.lastUpdated = new Date();
  }
}

/**
 * Factory for creating retry strategies
 */
export class RetryStrategyFactory {
  private static strategies = new Map<string, RetryStrategy>();

  /**
   * Get or create retry strategy for operation type
   */
  static getStrategy(
    operationType: OperationType,
    customConfig?: Partial<RetryConfig>,
    logger?: Logger
  ): RetryStrategy {
    const key = `${operationType}_${JSON.stringify(customConfig || {})}`;
    
    if (!this.strategies.has(key)) {
      this.strategies.set(key, new RetryStrategy(operationType, customConfig, logger));
    }

    return this.strategies.get(key)!;
  }

  /**
   * Clear all cached strategies
   */
  static clearCache(): void {
    this.strategies.clear();
  }

  /**
   * Get statistics for all strategies
   */
  static getAllStatistics(): Record<string, RetryStatistics> {
    const stats: Record<string, RetryStatistics> = {};
    
    this.strategies.forEach((strategy, key) => {
      stats[key] = strategy.getStatistics();
    });

    return stats;
  }
}

/**
 * Utility functions for retry operations
 */
export class RetryUtils {
  /**
   * Create a retryable version of any async function
   */
  static retryable<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    operationType: OperationType,
    config?: Partial<RetryConfig>
  ): (...args: T) => Promise<R> {
    const strategy = RetryStrategyFactory.getStrategy(operationType, config);

    return async (...args: T): Promise<R> => {
      const result = await strategy.executeWithRetry(() => fn(...args));
      
      if (result.success) {
        return result.result!;
      } else {
        throw result.error || new Error('Operation failed after retries');
      }
    };
  }

  /**
   * Retry a specific operation with custom configuration
   */
  static async retry<T>(
    operation: () => Promise<T>,
    operationType: OperationType,
    config?: Partial<RetryConfig>,
    context?: string
  ): Promise<T> {
    const strategy = new RetryStrategy(operationType, config);
    const result = await strategy.executeWithRetry(operation, context);

    if (result.success) {
      return result.result!;
    } else {
      throw result.error || new Error('Operation failed after retries');
    }
  }

  /**
   * Check if an error should be retried for a specific operation type
   */
  static shouldRetryError(error: Error, operationType: OperationType): boolean {
    const strategy = RetryStrategyFactory.getStrategy(operationType);
    return strategy.shouldRetry(error, 1);
  }

  /**
   * Get default configuration for operation type
   */
  static getDefaultConfig(operationType: OperationType): RetryConfig {
    return { ...DEFAULT_RETRY_CONFIGS[operationType] };
  }
}

// Export default configurations for external use
export { DEFAULT_RETRY_CONFIGS };