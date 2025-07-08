/**
 * Custom error types for the documentation generation tool
 * Provides comprehensive error handling with categorization, severity levels, and recovery suggestions
 */

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  NETWORK = 'network',
  VALIDATION = 'validation',
  AI = 'ai',
  CONFIG = 'config',
  AUTH = 'auth'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Specific error codes for different error types
 */
export enum ErrorCode {
  // Network errors (1000-1999)
  NETWORK_CONNECTION_FAILED = 1001,
  NETWORK_TIMEOUT = 1002,
  NETWORK_DNS_RESOLUTION = 1003,
  NETWORK_SSL_ERROR = 1004,
  NETWORK_PROXY_ERROR = 1005,
  NETWORK_UNREACHABLE = 1006,

  // Validation errors (2000-2999)
  VALIDATION_SCHEMA_INVALID = 2001,
  VALIDATION_DATA_FORMAT = 2002,
  VALIDATION_REQUIRED_FIELD = 2003,
  VALIDATION_TYPE_MISMATCH = 2004,
  VALIDATION_CONSTRAINT_VIOLATION = 2005,
  VALIDATION_ENUM_VALUE = 2006,

  // AI service errors (3000-3999)
  AI_SERVICE_UNAVAILABLE = 3001,
  AI_SERVICE_QUOTA_EXCEEDED = 3002,
  AI_SERVICE_INVALID_RESPONSE = 3003,
  AI_SERVICE_MODEL_ERROR = 3004,
  AI_SERVICE_CONTENT_FILTERED = 3005,
  AI_SERVICE_TOKEN_LIMIT = 3006,

  // Configuration errors (4000-4999)
  CONFIG_MISSING_REQUIRED = 4001,
  CONFIG_INVALID_FORMAT = 4002,
  CONFIG_FILE_NOT_FOUND = 4003,
  CONFIG_PARSE_ERROR = 4004,
  CONFIG_VALIDATION_FAILED = 4005,
  CONFIG_INCOMPATIBLE_VERSION = 4006,

  // Authentication errors (5000-5999)
  AUTH_INVALID_CREDENTIALS = 5001,
  AUTH_TOKEN_EXPIRED = 5002,
  AUTH_INSUFFICIENT_PERMISSIONS = 5003,
  AUTH_API_KEY_INVALID = 5004,
  AUTH_RATE_LIMITED = 5005,
  AUTH_ACCOUNT_SUSPENDED = 5006,

  // Rate limit errors (6000-6999)
  RATE_LIMIT_EXCEEDED = 6001,
  RATE_LIMIT_QUOTA_EXHAUSTED = 6002,
  RATE_LIMIT_BURST_EXCEEDED = 6003,
  RATE_LIMIT_DAILY_LIMIT = 6004,
  RATE_LIMIT_CONCURRENT_REQUESTS = 6005,

  // Schema validation errors (7000-7999)
  SCHEMA_VALIDATION_FAILED = 7001,
  SCHEMA_MISSING_PROPERTIES = 7002,
  SCHEMA_ADDITIONAL_PROPERTIES = 7003,
  SCHEMA_TYPE_VALIDATION = 7004,
  SCHEMA_FORMAT_VALIDATION = 7005,
  SCHEMA_DEPENDENCY_FAILED = 7006,

  // Content validation errors (8000-8999)
  CONTENT_VALIDATION_QUALITY = 8001,
  CONTENT_VALIDATION_COMPLETENESS = 8002,
  CONTENT_VALIDATION_FORMAT = 8003,
  CONTENT_VALIDATION_CONSISTENCY = 8004,
  CONTENT_VALIDATION_ACCURACY = 8005,
  CONTENT_VALIDATION_STRUCTURE = 8006,

  // Fallback errors (9000-9999)
  FALLBACK_TEMPLATE_NOT_FOUND = 9001,
  FALLBACK_GENERATION_FAILED = 9002,
  FALLBACK_INVALID_TEMPLATE = 9003,
  FALLBACK_CONTEXT_INSUFFICIENT = 9004,
  FALLBACK_ALL_STRATEGIES_FAILED = 9005
}

/**
 * Context information for errors
 */
export interface ErrorContext {
  operation?: string;
  endpoint?: string;
  method?: string;
  timestamp?: Date;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * Suggested actions for error recovery
 */
export interface ErrorSuggestion {
  action: string;
  description: string;
  priority: number;
  automated?: boolean;
}

/**
 * Serialized error format for logging and debugging
 */
export interface SerializedError {
  name: string;
  message: string;
  code: ErrorCode;
  category: ErrorCategory;
  severity: ErrorSeverity;
  suggestions: ErrorSuggestion[];
  context?: ErrorContext;
  stack?: string;
  timestamp: string;
  originalError?: any;
}

/**
 * Base error class for all documentation generation errors
 */
export abstract class DocGenError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly suggestions: ErrorSuggestion[];
  public readonly context?: ErrorContext;
  public readonly timestamp: Date;
  public readonly originalError?: Error;

  constructor(
    message: string,
    code: ErrorCode,
    category: ErrorCategory,
    severity: ErrorSeverity,
    suggestions: ErrorSuggestion[] = [],
    context?: ErrorContext,
    originalError?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.severity = severity;
    this.suggestions = suggestions;
    this.context = context;
    this.timestamp = new Date();
    this.originalError = originalError;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging and debugging
   */
  public serialize(): SerializedError {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      suggestions: this.suggestions,
      context: this.context,
      stack: this.stack,
      timestamp: this.timestamp.toISOString(),
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }

  /**
   * Get user-friendly error message
   */
  public getUserMessage(): string {
    return this.message;
  }

  /**
   * Get primary suggestion for error recovery
   */
  public getPrimarySuggestion(): ErrorSuggestion | undefined {
    return this.suggestions.sort((a, b) => a.priority - b.priority)[0];
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends DocGenError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NETWORK_CONNECTION_FAILED,
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'check_connection',
        description: 'Verify your internet connection is stable',
        priority: 1
      },
      {
        action: 'retry_request',
        description: 'Retry the request after a brief delay',
        priority: 2,
        automated: true
      },
      {
        action: 'check_proxy',
        description: 'Verify proxy settings if using a corporate network',
        priority: 3
      }
    ];

    super(message, code, ErrorCategory.NETWORK, ErrorSeverity.HIGH, suggestions, context, originalError);
  }
}

/**
 * Validation-related errors
 */
export class ValidationError extends DocGenError {
  public readonly field?: string;
  public readonly value?: any;
  public readonly expectedType?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.VALIDATION_SCHEMA_INVALID,
    field?: string,
    value?: any,
    expectedType?: string,
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'check_input_format',
        description: 'Verify the input data format matches the expected schema',
        priority: 1
      },
      {
        action: 'validate_required_fields',
        description: 'Ensure all required fields are provided',
        priority: 2
      },
      {
        action: 'check_data_types',
        description: 'Verify data types match the expected format',
        priority: 3
      }
    ];

    super(message, code, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, suggestions, context, originalError);
    this.field = field;
    this.value = value;
    this.expectedType = expectedType;
  }
}

/**
 * AI service-related errors
 */
export class AIServiceError extends DocGenError {
  public readonly provider?: string;
  public readonly model?: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AI_SERVICE_UNAVAILABLE,
    provider?: string,
    model?: string,
    requestId?: string,
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'retry_with_backoff',
        description: 'Retry the request with exponential backoff',
        priority: 1,
        automated: true
      },
      {
        action: 'check_api_status',
        description: 'Check the AI service status page for outages',
        priority: 2
      },
      {
        action: 'use_fallback_model',
        description: 'Try using an alternative AI model or provider',
        priority: 3,
        automated: true
      }
    ];

    super(message, code, ErrorCategory.AI, ErrorSeverity.HIGH, suggestions, context, originalError);
    this.provider = provider;
    this.model = model;
    this.requestId = requestId;
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends DocGenError {
  public readonly configPath?: string;
  public readonly configKey?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONFIG_MISSING_REQUIRED,
    configPath?: string,
    configKey?: string,
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'check_config_file',
        description: 'Verify the configuration file exists and is readable',
        priority: 1
      },
      {
        action: 'validate_config_format',
        description: 'Ensure the configuration file format is valid JSON/YAML',
        priority: 2
      },
      {
        action: 'set_required_values',
        description: 'Provide all required configuration values',
        priority: 3
      }
    ];

    super(message, code, ErrorCategory.CONFIG, ErrorSeverity.CRITICAL, suggestions, context, originalError);
    this.configPath = configPath;
    this.configKey = configKey;
  }
}

/**
 * Authentication-related errors
 */
export class AuthenticationError extends DocGenError {
  public readonly authType?: string;
  public readonly endpoint?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AUTH_INVALID_CREDENTIALS,
    authType?: string,
    endpoint?: string,
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'check_credentials',
        description: 'Verify your API credentials are correct and active',
        priority: 1
      },
      {
        action: 'refresh_token',
        description: 'Refresh your authentication token if expired',
        priority: 2,
        automated: true
      },
      {
        action: 'check_permissions',
        description: 'Ensure your account has the required permissions',
        priority: 3
      }
    ];

    super(message, code, ErrorCategory.AUTH, ErrorSeverity.HIGH, suggestions, context, originalError);
    this.authType = authType;
    this.endpoint = endpoint;
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends DocGenError {
  public readonly retryAfter?: number;
  public readonly limit?: number;
  public readonly remaining?: number;
  public readonly resetTime?: Date;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.RATE_LIMIT_EXCEEDED,
    retryAfter?: number,
    limit?: number,
    remaining?: number,
    resetTime?: Date,
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'wait_and_retry',
        description: `Wait ${retryAfter || 60} seconds before retrying`,
        priority: 1,
        automated: true
      },
      {
        action: 'reduce_request_rate',
        description: 'Reduce the frequency of API requests',
        priority: 2
      },
      {
        action: 'upgrade_plan',
        description: 'Consider upgrading your API plan for higher limits',
        priority: 3
      }
    ];

    super(message, code, ErrorCategory.AUTH, ErrorSeverity.MEDIUM, suggestions, context, originalError);
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.resetTime = resetTime;
  }
}

/**
 * Schema validation errors
 */
export class SchemaValidationError extends DocGenError {
  public readonly schemaPath?: string;
  public readonly invalidValue?: any;
  public readonly expectedSchema?: any;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SCHEMA_VALIDATION_FAILED,
    schemaPath?: string,
    invalidValue?: any,
    expectedSchema?: any,
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'fix_schema_violations',
        description: 'Correct the data to match the expected schema',
        priority: 1
      },
      {
        action: 'update_schema',
        description: 'Update the schema if the data format has changed',
        priority: 2
      },
      {
        action: 'validate_input_data',
        description: 'Ensure input data is properly formatted before processing',
        priority: 3
      }
    ];

    super(message, code, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, suggestions, context, originalError);
    this.schemaPath = schemaPath;
    this.invalidValue = invalidValue;
    this.expectedSchema = expectedSchema;
  }
}

/**
 * Content validation errors
 */
export class ContentValidationError extends DocGenError {
  public readonly qualityScore?: number;
  public readonly missingElements?: string[];
  public readonly validationRules?: string[];

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONTENT_VALIDATION_QUALITY,
    qualityScore?: number,
    missingElements?: string[],
    validationRules?: string[],
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'improve_content_quality',
        description: 'Enhance the content to meet quality standards',
        priority: 1
      },
      {
        action: 'add_missing_elements',
        description: 'Include all required documentation elements',
        priority: 2
      },
      {
        action: 'regenerate_content',
        description: 'Regenerate the content with improved prompts',
        priority: 3,
        automated: true
      }
    ];

    super(message, code, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, suggestions, context, originalError);
    this.qualityScore = qualityScore;
    this.missingElements = missingElements;
    this.validationRules = validationRules;
  }
}

/**
 * Fallback mechanism errors
 */
export class FallbackError extends DocGenError {
  public readonly attemptedStrategies?: string[];
  public readonly availableTemplates?: string[];

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.FALLBACK_TEMPLATE_NOT_FOUND,
    attemptedStrategies?: string[],
    availableTemplates?: string[],
    context?: ErrorContext,
    originalError?: Error
  ) {
    const suggestions: ErrorSuggestion[] = [
      {
        action: 'create_custom_template',
        description: 'Create a custom template for this endpoint type',
        priority: 1
      },
      {
        action: 'use_basic_template',
        description: 'Fall back to a basic documentation template',
        priority: 2,
        automated: true
      },
      {
        action: 'manual_documentation',
        description: 'Create documentation manually for this endpoint',
        priority: 3
      }
    ];

    super(message, code, ErrorCategory.VALIDATION, ErrorSeverity.LOW, suggestions, context, originalError);
    this.attemptedStrategies = attemptedStrategies;
    this.availableTemplates = availableTemplates;
  }
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  /**
   * Create an error from a serialized error object
   */
  static fromSerialized(serialized: SerializedError): DocGenError {
    const context = serialized.context;
    const originalError = serialized.originalError ? new Error(serialized.originalError.message) : undefined;

    switch (serialized.category) {
      case ErrorCategory.NETWORK:
        return new NetworkError(serialized.message, serialized.code, context, originalError);
      case ErrorCategory.VALIDATION:
        return new ValidationError(serialized.message, serialized.code, undefined, undefined, undefined, context, originalError);
      case ErrorCategory.AI:
        return new AIServiceError(serialized.message, serialized.code, undefined, undefined, undefined, context, originalError);
      case ErrorCategory.CONFIG:
        return new ConfigurationError(serialized.message, serialized.code, undefined, undefined, context, originalError);
      case ErrorCategory.AUTH:
        if (serialized.code >= 6000 && serialized.code < 7000) {
          return new RateLimitError(serialized.message, serialized.code, undefined, undefined, undefined, undefined, context, originalError);
        }
        return new AuthenticationError(serialized.message, serialized.code, undefined, undefined, context, originalError);
      default:
        return new ValidationError(serialized.message, serialized.code, undefined, undefined, undefined, context, originalError);
    }
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(error: DocGenError): boolean {
    const retryableCodes = [
      ErrorCode.NETWORK_TIMEOUT,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      ErrorCode.AI_SERVICE_UNAVAILABLE,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      ErrorCode.AUTH_TOKEN_EXPIRED
    ];
    return retryableCodes.includes(error.code);
  }

  /**
   * Get retry delay for an error
   */
  static getRetryDelay(error: DocGenError, attempt: number): number {
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max)
    return Math.min(1000 * Math.pow(2, attempt - 1), 16000);
  }

  /**
   * Check if an error is critical
   */
  static isCritical(error: DocGenError): boolean {
    return error.severity === ErrorSeverity.CRITICAL;
  }
}