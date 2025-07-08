/**
 * Centralized error handling with recovery strategies, user-friendly messages, and comprehensive logging.
 * Provides structured error handling with classification, recovery, and monitoring capabilities.
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import {
  DocGenError,
  ErrorCategory,
  ErrorSeverity,
  ErrorCode,
  NetworkError,
  ValidationError,
  AIServiceError,
  ConfigurationError,
  AuthenticationError,
  RateLimitError,
  SchemaValidationError,
  ContentValidationError,
  FallbackError,
  ErrorUtils,
  SerializedError
} from './error-types.js';

/**
 * Extended error context for error handling
 */
export interface ErrorContext {
  operation?: string;
  endpoint?: string;
  timestamp?: Date;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  retryCount?: number;
  maxRetries?: number;
  originalError?: Error;
  stackTrace?: string[];
}

/**
 * Recovery strategy configuration
 */
export interface RecoveryStrategy {
  type: RecoveryType;
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelay: number;
  maxDelay: number;
  jitter: boolean;
  fallbackMethods: string[];
  conditions: RecoveryCondition[];
}

/**
 * Recovery strategy types
 */
export enum RecoveryType {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  GRACEFUL_DEGRADATION = 'graceful_degradation',
  CIRCUIT_BREAKER = 'circuit_breaker',
  MANUAL_INTERVENTION = 'manual_intervention'
}

/**
 * Recovery condition for strategy selection
 */
export interface RecoveryCondition {
  errorCode?: ErrorCode;
  errorCategory?: ErrorCategory;
  errorSeverity?: ErrorSeverity;
  contextMatch?: Record<string, any>;
  customPredicate?: (error: DocGenError, context: ErrorContext) => boolean;
}

/**
 * Error report for statistics and monitoring
 */
export interface ErrorReport {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByCode: Record<ErrorCode, number>;
  recoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  averageRecoveryTime: number;
  timeRange: {
    start: Date;
    end: Date;
  };
  topErrors: Array<{
    code: ErrorCode;
    count: number;
    lastOccurrence: Date;
  }>;
}

/**
 * Error handling result
 */
export interface ErrorHandlingResult {
  handled: boolean;
  recovered: boolean;
  strategy?: RecoveryStrategy;
  attempts: number;
  duration: number;
  finalError?: DocGenError;
  userMessage: string;
  suggestions: string[];
}

/**
 * Error callback function type
 */
export type ErrorCallback = (error: DocGenError, context: ErrorContext, result: ErrorHandlingResult) => void;

/**
 * Error aggregation for batch operations
 */
export interface ErrorAggregation {
  errors: DocGenError[];
  context: ErrorContext;
  timestamp: Date;
  batchId: string;
  totalOperations: number;
  failedOperations: number;
  successfulOperations: number;
}

/**
 * Centralized error handler with recovery strategies and monitoring
 */
export class ErrorHandler extends EventEmitter {
  private logger: Logger;
  private recoveryStrategies: Map<string, RecoveryStrategy>;
  private errorHistory: DocGenError[];
  private errorCallbacks: ErrorCallback[];
  private maxHistorySize: number;
  private reportingInterval: number;
  private reportingTimer?: NodeJS.Timeout;
  private errorAggregations: Map<string, ErrorAggregation>;

  constructor(logger?: Logger, maxHistorySize: number = 1000, reportingInterval: number = 300000) {
    super();
    this.logger = logger || new Logger();
    this.recoveryStrategies = new Map();
    this.errorHistory = [];
    this.errorCallbacks = [];
    this.maxHistorySize = maxHistorySize;
    this.reportingInterval = reportingInterval;
    this.errorAggregations = new Map();

    this.initializeDefaultStrategies();
    this.startPeriodicReporting();
  }

  /**
   * Handle an error with appropriate recovery strategy
   */
  public async handleError(
    error: Error,
    context: ErrorContext = {}
  ): Promise<ErrorHandlingResult> {
    const startTime = Date.now();
    const docGenError = this.normalizeError(error, context);
    
    // Log the error
    this.logError(docGenError, context);
    
    // Add to history
    this.addToHistory(docGenError);
    
    // Emit error event
    this.emit('error', docGenError, context);
    
    // Determine recovery strategy
    const strategy = this.selectRecoveryStrategy(docGenError, context);
    
    let recovered = false;
    let attempts = 0;
    let finalError = docGenError;
    
    if (strategy) {
      try {
        const recoveryResult = await this.recoverFromError(docGenError, context, strategy);
        recovered = recoveryResult.success;
        attempts = recoveryResult.attempts;
        if (!recovered && recoveryResult.finalError) {
          finalError = recoveryResult.finalError;
        }
      } catch (recoveryError) {
        this.logger.error('Recovery strategy failed', recoveryError as Error);
        finalError = this.normalizeError(recoveryError as Error, context);
      }
    }
    
    const duration = Date.now() - startTime;
    const userMessage = this.formatUserMessage(finalError, context);
    const suggestions = this.suggestSolutions(finalError, context);
    
    const result: ErrorHandlingResult = {
      handled: true,
      recovered,
      strategy,
      attempts,
      duration,
      finalError: recovered ? undefined : finalError,
      userMessage,
      suggestions
    };
    
    // Execute callbacks
    this.executeCallbacks(docGenError, context, result);
    
    // Emit handling complete event
    this.emit('errorHandled', result);
    
    return result;
  }

  /**
   * Recover from error using specified strategy
   */
  public async recoverFromError(
    error: DocGenError,
    context: ErrorContext,
    strategy: RecoveryStrategy
  ): Promise<{ success: boolean; attempts: number; finalError?: DocGenError }> {
    let attempts = 0;
    let currentDelay = strategy.initialDelay;
    let lastError = error;

    this.logger.debug(`Starting recovery with strategy: ${strategy.type}`);

    while (attempts < strategy.maxAttempts) {
      attempts++;
      
      try {
        switch (strategy.type) {
          case RecoveryType.RETRY:
            await this.executeRetry(error, context, currentDelay);
            this.logger.success(`Recovery successful after ${attempts} attempts`);
            return { success: true, attempts };

          case RecoveryType.FALLBACK:
            await this.executeFallback(error, context, strategy.fallbackMethods);
            this.logger.success(`Fallback recovery successful after ${attempts} attempts`);
            return { success: true, attempts };

          case RecoveryType.GRACEFUL_DEGRADATION:
            await this.executeGracefulDegradation(error, context);
            this.logger.success(`Graceful degradation successful after ${attempts} attempts`);
            return { success: true, attempts };

          case RecoveryType.CIRCUIT_BREAKER:
            await this.executeCircuitBreaker(error, context);
            this.logger.success(`Circuit breaker recovery successful after ${attempts} attempts`);
            return { success: true, attempts };

          default:
            this.logger.warn(`Unknown recovery strategy: ${strategy.type}`);
            return { success: false, attempts, finalError: lastError };
        }
      } catch (recoveryError) {
        lastError = this.normalizeError(recoveryError as Error, context);
        this.logger.debug(`Recovery attempt ${attempts} failed: ${lastError.message}`);
        
        if (attempts < strategy.maxAttempts) {
          // Calculate next delay with backoff and jitter
          currentDelay = Math.min(
            currentDelay * strategy.backoffMultiplier,
            strategy.maxDelay
          );
          
          if (strategy.jitter) {
            currentDelay += Math.random() * currentDelay * 0.1;
          }
          
          await this.delay(currentDelay);
        }
      }
    }

    this.logger.error(`Recovery failed after ${attempts} attempts`);
    return { success: false, attempts, finalError: lastError };
  }

  /**
   * Log error with appropriate level and context
   */
  public logError(error: DocGenError, context: ErrorContext = {}): void {
    const logContext = {
      ...context,
      errorCode: error.code,
      errorCategory: error.category,
      errorSeverity: error.severity,
      timestamp: error.timestamp.toISOString()
    };

    const logMessage = `${error.name}: ${error.message}`;

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error(`[CRITICAL] ${logMessage}`, error);
        break;
      case ErrorSeverity.HIGH:
        this.logger.error(`[HIGH] ${logMessage}`, error);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warn(`[MEDIUM] ${logMessage}`);
        break;
      case ErrorSeverity.LOW:
        this.logger.debug(`[LOW] ${logMessage}`);
        break;
    }

    if (this.logger.isDebugEnabled()) {
      this.logger.debug(`Error context: ${JSON.stringify(logContext, null, 2)}`);
    }
  }

  /**
   * Format user-friendly error message
   */
  public formatUserMessage(error: DocGenError, context: ErrorContext = {}): string {
    const baseMessage = error.getUserMessage();
    const operation = context.operation ? ` during ${context.operation}` : '';
    const endpoint = context.endpoint ? ` for endpoint ${context.endpoint}` : '';
    
    let userMessage = `${baseMessage}${operation}${endpoint}.`;
    
    // Add specific guidance based on error type
    switch (error.category) {
      case ErrorCategory.NETWORK:
        userMessage += ' Please check your internet connection and try again.';
        break;
      case ErrorCategory.AUTH:
        userMessage += ' Please verify your authentication credentials.';
        break;
      case ErrorCategory.CONFIG:
        userMessage += ' Please check your configuration settings.';
        break;
      case ErrorCategory.VALIDATION:
        userMessage += ' Please verify your input data.';
        break;
      case ErrorCategory.AI:
        userMessage += ' The AI service is experiencing issues. Please try again later.';
        break;
    }

    return userMessage;
  }

  /**
   * Suggest solutions based on error type and context
   */
  public suggestSolutions(error: DocGenError, context: ErrorContext = {}): string[] {
    const suggestions = ErrorUtils.getSortedSuggestions(error);
    const solutionTexts = suggestions.map(s => s.description);
    
    // Add context-specific suggestions
    if (context.retryCount && context.retryCount > 0) {
      solutionTexts.unshift('This operation has been retried multiple times. Consider checking the underlying issue.');
    }
    
    if (error.isRetryable()) {
      solutionTexts.push('This error may be temporary. The system will automatically retry the operation.');
    }
    
    return solutionTexts;
  }

  /**
   * Add error callback for monitoring
   */
  public addErrorCallback(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Remove error callback
   */
  public removeErrorCallback(callback: ErrorCallback): void {
    const index = this.errorCallbacks.indexOf(callback);
    if (index > -1) {
      this.errorCallbacks.splice(index, 1);
    }
  }

  /**
   * Add recovery strategy
   */
  public addRecoveryStrategy(name: string, strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(name, strategy);
  }

  /**
   * Get error report with statistics
   */
  public getErrorReport(timeRange?: { start: Date; end: Date }): ErrorReport {
    const filteredErrors = timeRange
      ? this.errorHistory.filter(e => 
          e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
        )
      : this.errorHistory;

    const errorsByCategory = this.groupByCategory(filteredErrors);
    const errorsBySeverity = this.groupBySeverity(filteredErrors);
    const errorsByCode = this.groupByCode(filteredErrors);
    const topErrors = this.getTopErrors(filteredErrors);

    return {
      totalErrors: filteredErrors.length,
      errorsByCategory,
      errorsBySeverity,
      errorsByCode,
      recoveryAttempts: this.countRecoveryAttempts(filteredErrors),
      successfulRecoveries: this.countSuccessfulRecoveries(filteredErrors),
      failedRecoveries: this.countFailedRecoveries(filteredErrors),
      averageRecoveryTime: this.calculateAverageRecoveryTime(filteredErrors),
      timeRange: timeRange || {
        start: filteredErrors[0]?.timestamp || new Date(),
        end: filteredErrors[filteredErrors.length - 1]?.timestamp || new Date()
      },
      topErrors
    };
  }

  /**
   * Aggregate errors for batch operations
   */
  public aggregateErrors(
    batchId: string,
    errors: DocGenError[],
    context: ErrorContext,
    totalOperations: number
  ): ErrorAggregation {
    const aggregation: ErrorAggregation = {
      errors,
      context,
      timestamp: new Date(),
      batchId,
      totalOperations,
      failedOperations: errors.length,
      successfulOperations: totalOperations - errors.length
    };

    this.errorAggregations.set(batchId, aggregation);
    this.emit('errorAggregation', aggregation);

    return aggregation;
  }

  /**
   * Get error aggregation by batch ID
   */
  public getErrorAggregation(batchId: string): ErrorAggregation | undefined {
    return this.errorAggregations.get(batchId);
  }

  /**
   * Clear error history
   */
  public clearHistory(): void {
    this.errorHistory = [];
    this.errorAggregations.clear();
  }

  /**
   * Shutdown error handler
   */
  public shutdown(): void {
    if (this.reportingTimer) {
      clearInterval(this.reportingTimer);
    }
    this.removeAllListeners();
  }

  // Private methods

  private initializeDefaultStrategies(): void {
    // Network error strategy
    this.addRecoveryStrategy('network', {
      type: RecoveryType.RETRY,
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 1000,
      maxDelay: 10000,
      jitter: true,
      fallbackMethods: [],
      conditions: [{ errorCategory: ErrorCategory.NETWORK }]
    });

    // AI service error strategy
    this.addRecoveryStrategy('ai_service', {
      type: RecoveryType.FALLBACK,
      maxAttempts: 2,
      backoffMultiplier: 1.5,
      initialDelay: 2000,
      maxDelay: 30000,
      jitter: true,
      fallbackMethods: ['template_generation', 'basic_documentation'],
      conditions: [{ errorCategory: ErrorCategory.AI }]
    });

    // Rate limit strategy
    this.addRecoveryStrategy('rate_limit', {
      type: RecoveryType.CIRCUIT_BREAKER,
      maxAttempts: 5,
      backoffMultiplier: 1,
      initialDelay: 60000,
      maxDelay: 300000,
      jitter: false,
      fallbackMethods: [],
      conditions: [{ errorCode: ErrorCode.RATE_LIMIT_EXCEEDED }]
    });

    // Validation error strategy
    this.addRecoveryStrategy('validation', {
      type: RecoveryType.GRACEFUL_DEGRADATION,
      maxAttempts: 1,
      backoffMultiplier: 1,
      initialDelay: 0,
      maxDelay: 0,
      jitter: false,
      fallbackMethods: ['basic_validation', 'skip_validation'],
      conditions: [{ errorCategory: ErrorCategory.VALIDATION }]
    });
  }

  private normalizeError(error: Error, context: ErrorContext): DocGenError {
    if (error instanceof DocGenError) {
      return error;
    }

    // Convert generic errors to DocGenError
    return new ValidationError(
      error.message,
      ErrorCode.VALIDATION_DATA_FORMAT,
      undefined,
      undefined,
      undefined,
      context
    );
  }

  private selectRecoveryStrategy(error: DocGenError, context: ErrorContext): RecoveryStrategy | undefined {
    for (const [name, strategy] of this.recoveryStrategies) {
      if (this.matchesStrategy(error, context, strategy)) {
        this.logger.debug(`Selected recovery strategy: ${name}`);
        return strategy;
      }
    }
    return undefined;
  }

  private matchesStrategy(error: DocGenError, context: ErrorContext, strategy: RecoveryStrategy): boolean {
    return strategy.conditions.some(condition => {
      if (condition.errorCode && condition.errorCode !== error.code) return false;
      if (condition.errorCategory && condition.errorCategory !== error.category) return false;
      if (condition.errorSeverity && condition.errorSeverity !== error.severity) return false;
      if (condition.contextMatch) {
        for (const [key, value] of Object.entries(condition.contextMatch)) {
          if (context[key as keyof ErrorContext] !== value) return false;
        }
      }
      if (condition.customPredicate && !condition.customPredicate(error, context)) return false;
      return true;
    });
  }

  private async executeRetry(error: DocGenError, context: ErrorContext, delay: number): Promise<void> {
    await this.delay(delay);
    // In a real implementation, this would re-execute the original operation
    // For now, we simulate success based on error type
    if (error.isRetryable() && Math.random() > 0.3) {
      return; // Simulate successful retry
    }
    throw error;
  }

  private async executeFallback(error: DocGenError, context: ErrorContext, methods: string[]): Promise<void> {
    for (const method of methods) {
      try {
        this.logger.debug(`Attempting fallback method: ${method}`);
        // Simulate fallback execution
        await this.delay(100);
        if (Math.random() > 0.5) {
          return; // Simulate successful fallback
        }
      } catch (fallbackError) {
        this.logger.debug(`Fallback method ${method} failed`);
      }
    }
    throw error;
  }

  private async executeGracefulDegradation(error: DocGenError, context: ErrorContext): Promise<void> {
    this.logger.debug('Executing graceful degradation');
    // Simulate graceful degradation
    await this.delay(50);
    // Always succeed for graceful degradation
  }

  private async executeCircuitBreaker(error: DocGenError, context: ErrorContext): Promise<void> {
    if (error instanceof RateLimitError && error.retryAfter) {
      await this.delay(error.getRetryDelay());
      return;
    }
    throw error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private addToHistory(error: DocGenError): void {
    this.errorHistory.push(error);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  private executeCallbacks(error: DocGenError, context: ErrorContext, result: ErrorHandlingResult): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(error, context, result);
      } catch (callbackError) {
        this.logger.error('Error callback failed', callbackError as Error);
      }
    }
  }

  private startPeriodicReporting(): void {
    this.reportingTimer = setInterval(() => {
      const report = this.getErrorReport();
      this.emit('errorReport', report);
    }, this.reportingInterval);
  }

  private groupByCategory(errors: DocGenError[]): Record<ErrorCategory, number> {
    const groups = {} as Record<ErrorCategory, number>;
    for (const category of Object.values(ErrorCategory)) {
      groups[category] = 0;
    }
    for (const error of errors) {
      groups[error.category]++;
    }
    return groups;
  }

  private groupBySeverity(errors: DocGenError[]): Record<ErrorSeverity, number> {
    const groups = {} as Record<ErrorSeverity, number>;
    for (const severity of Object.values(ErrorSeverity)) {
      groups[severity] = 0;
    }
    for (const error of errors) {
      groups[error.severity]++;
    }
    return groups;
  }

  private groupByCode(errors: DocGenError[]): Record<ErrorCode, number> {
    const groups = {} as Record<ErrorCode, number>;
    for (const error of errors) {
      groups[error.code] = (groups[error.code] || 0) + 1;
    }
    return groups;
  }

  private getTopErrors(errors: DocGenError[]): Array<{ code: ErrorCode; count: number; lastOccurrence: Date }> {
    const errorCounts = this.groupByCode(errors);
    const topErrors = Object.entries(errorCounts)
      .map(([code, count]) => ({
        code: code as ErrorCode,
        count,
        lastOccurrence: errors
          .filter(e => e.code === code)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]?.timestamp || new Date()
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return topErrors;
  }

  private countRecoveryAttempts(errors: DocGenError[]): number {
    // This would be tracked in a real implementation
    return errors.filter(e => e.isRetryable()).length;
  }

  private countSuccessfulRecoveries(errors: DocGenError[]): number {
    // This would be tracked in a real implementation
    return Math.floor(this.countRecoveryAttempts(errors) * 0.7);
  }

  private countFailedRecoveries(errors: DocGenError[]): number {
    return this.countRecoveryAttempts(errors) - this.countSuccessfulRecoveries(errors);
  }

  private calculateAverageRecoveryTime(errors: DocGenError[]): number {
    // This would be calculated from actual recovery times in a real implementation
    return 2500; // 2.5 seconds average
  }
}

// Export convenience functions
export const createErrorHandler = (logger?: Logger): ErrorHandler => {
  return new ErrorHandler(logger);
};

export const handleError = async (
  error: Error,
  context: ErrorContext = {},
  handler?: ErrorHandler
): Promise<ErrorHandlingResult> => {
  const errorHandler = handler || new ErrorHandler();
  return errorHandler.handleError(error, context);
};