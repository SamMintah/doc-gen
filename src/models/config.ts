import { AuthType, SecurityConfig, ValidationConfig, PrivacyLevel, ValidationLevel } from './types.js';

/**
 * Scanning modes supported by the API documentation generator
 */
export enum ScanMode {
  CODE = 'code',
  LIVE = 'live',
}

/**
 * API types supported by the documentation generator
 */
export enum ApiType {
  REST = 'rest',
  GRAPHQL = 'graphql',
}

/**
 * Error handling configuration interface
 */
export interface ErrorHandlingConfig {
  retryStrategy: {
    enabled: boolean;
    maxRetries: number;
    baseDelay: number; // milliseconds
    maxDelay: number; // milliseconds
    backoffMultiplier: number;
    jitterEnabled: boolean;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number; // milliseconds
    monitoringPeriod: number; // milliseconds
  };
  timeout: {
    aiServiceTimeout: number; // milliseconds
    httpRequestTimeout: number; // milliseconds
    overallOperationTimeout: number; // milliseconds
  };
  errorReporting: {
    enabled: boolean;
    includeStackTrace: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
  };
}

/**
 * Configuration interface representing all CLI options and settings
 */
export interface Config {
  // Core scanning configuration
  mode: ScanMode;
  url?: string;
  token?: string;
  apiType: ApiType;
  
  // Output configuration
  outputFile: string;
  
  // AI configuration
  openaiApiKey: string;
  
  // Authentication configuration
  authType?: AuthType;
  authHeaderName?: string; // For API key authentication
  
  // Optional scanning configuration
  seedEndpoints?: string[]; // Endpoints to start scanning from
  maxDepth?: number; // Maximum depth for endpoint discovery
  timeout?: number; // Request timeout in milliseconds
  rateLimit?: number; // Requests per second limit
  
  // Optional output configuration
  title?: string; // Documentation title
  description?: string; // Documentation description
  version?: string; // API version
  
  // Debug and logging
  verbose?: boolean;
  debug?: boolean;

  // New configuration sections
  securityConfig?: SecurityConfig;
  validationConfig?: ValidationConfig;
  errorHandlingConfig?: ErrorHandlingConfig;
}

/**
 * Raw CLI arguments interface
 */
export interface CliArgs {
  mode?: string;
  url?: string;
  token?: string;
  type?: string;
  out?: string;
  openaiKey?: string;
  authType?: string;
  authHeaderName?: string;
  seedEndpoints?: string;
  maxDepth?: number;
  timeout?: number;
  rateLimit?: number;
  title?: string;
  description?: string;
  version?: string;
  verbose?: boolean;
  debug?: boolean;
  // New CLI arguments for advanced configuration
  enableSecurity?: boolean;
  privacyLevel?: string;
  validationLevel?: string;
  enableRetries?: boolean;
  maxRetries?: number;
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Builder class for creating and validating configuration objects
 */
export class ConfigBuilder {
  private config: Partial<Config> = {};

  /**
   * Set the scanning mode
   */
  setMode(mode: string): ConfigBuilder {
    if (!Object.values(ScanMode).includes(mode as ScanMode)) {
      throw new ConfigValidationError(
        `Invalid mode: ${mode}. Must be one of: ${Object.values(ScanMode).join(', ')}`
      );
    }
    this.config.mode = mode as ScanMode;
    return this;
  }

  /**
   * Set the API URL
   */
  setUrl(url: string): ConfigBuilder {
    if (!this.isValidUrl(url)) {
      throw new ConfigValidationError(`Invalid URL: ${url}`);
    }
    this.config.url = url;
    return this;
  }

  /**
   * Set the authentication token
   */
  setToken(token: string): ConfigBuilder {
    this.config.token = token;
    return this;
  }

  /**
   * Set the API type
   */
  setApiType(type: string): ConfigBuilder {
    if (!Object.values(ApiType).includes(type as ApiType)) {
      throw new ConfigValidationError(
        `Invalid API type: ${type}. Must be one of: ${Object.values(ApiType).join(', ')}`
      );
    }
    this.config.apiType = type as ApiType;
    return this;
  }

  /**
   * Set the output file path
   */
  setOutputFile(outputFile: string): ConfigBuilder {
    if (!outputFile || outputFile.trim() === '') {
      throw new ConfigValidationError('Output file path cannot be empty');
    }
    this.config.outputFile = outputFile;
    return this;
  }

  /**
   * Set the OpenAI API key
   */
  setOpenAiApiKey(apiKey: string): ConfigBuilder {
    if (!apiKey || apiKey.trim() === '') {
      throw new ConfigValidationError('OpenAI API key cannot be empty');
    }
    this.config.openaiApiKey = apiKey;
    return this;
  }

  /**
   * Set the authentication type
   */
  setAuthType(authType: string): ConfigBuilder {
    if (!Object.values(AuthType).includes(authType as AuthType)) {
      throw new ConfigValidationError(
        `Invalid auth type: ${authType}. Must be one of: ${Object.values(AuthType).join(', ')}`
      );
    }
    this.config.authType = authType as AuthType;
    return this;
  }

  /**
   * Set the authentication header name (for API key auth)
   */
  setAuthHeaderName(headerName: string): ConfigBuilder {
    this.config.authHeaderName = headerName;
    return this;
  }

  /**
   * Set seed endpoints for scanning
   */
  setSeedEndpoints(endpoints: string[]): ConfigBuilder {
    this.config.seedEndpoints = endpoints;
    return this;
  }

  /**
   * Set maximum scanning depth
   */
  setMaxDepth(depth: number): ConfigBuilder {
    if (depth < 1) {
      throw new ConfigValidationError('Max depth must be at least 1');
    }
    this.config.maxDepth = depth;
    return this;
  }

  /**
   * Set request timeout
   */
  setTimeout(timeout: number): ConfigBuilder {
    if (timeout < 1000) {
      throw new ConfigValidationError('Timeout must be at least 1000ms');
    }
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Set rate limit
   */
  setRateLimit(rateLimit: number): ConfigBuilder {
    if (rateLimit < 1) {
      throw new ConfigValidationError('Rate limit must be at least 1 request per second');
    }
    this.config.rateLimit = rateLimit;
    return this;
  }

  /**
   * Set documentation title
   */
  setTitle(title: string): ConfigBuilder {
    this.config.title = title;
    return this;
  }

  /**
   * Set documentation description
   */
  setDescription(description: string): ConfigBuilder {
    this.config.description = description;
    return this;
  }

  /**
   * Set API version
   */
  setVersion(version: string): ConfigBuilder {
    this.config.version = version;
    return this;
  }

  /**
   * Set verbose logging
   */
  setVerbose(verbose: boolean): ConfigBuilder {
    this.config.verbose = verbose;
    return this;
  }

  /**
   * Set debug mode
   */
  setDebug(debug: boolean): ConfigBuilder {
    this.config.debug = debug;
    return this;
  }

  /**
   * Set security configuration
   */
  setSecurityConfig(securityConfig: Partial<SecurityConfig>): ConfigBuilder {
    this.config.securityConfig = {
      ...this.getDefaultSecurityConfig(),
      ...securityConfig
    };
    return this;
  }

  /**
   * Set validation configuration
   */
  setValidationConfig(validationConfig: Partial<ValidationConfig>): ConfigBuilder {
    this.config.validationConfig = {
      ...this.getDefaultValidationConfig(),
      ...validationConfig
    };
    return this;
  }

  /**
   * Set error handling configuration
   */
  setErrorHandlingConfig(errorHandlingConfig: Partial<ErrorHandlingConfig>): ConfigBuilder {
    this.config.errorHandlingConfig = {
      ...this.getDefaultErrorHandlingConfig(),
      ...errorHandlingConfig
    };
    return this;
  }

  /**
   * Enable or disable API key encryption
   */
  setApiKeyEncryption(enabled: boolean): ConfigBuilder {
    if (!this.config.securityConfig) {
      this.config.securityConfig = this.getDefaultSecurityConfig();
    }
    this.config.securityConfig.apiKeyEncryption.enabled = enabled;
    return this;
  }

  /**
   * Set privacy level
   */
  setPrivacyLevel(level: PrivacyLevel): ConfigBuilder {
    if (!this.config.securityConfig) {
      this.config.securityConfig = this.getDefaultSecurityConfig();
    }
    this.config.securityConfig.privacy.level = level;
    return this;
  }

  /**
   * Set validation level
   */
  setValidationLevel(level: ValidationLevel): ConfigBuilder {
    if (!this.config.validationConfig) {
      this.config.validationConfig = this.getDefaultValidationConfig();
    }
    this.config.validationConfig.content.level = level;
    this.config.validationConfig.schema.level = level;
    return this;
  }

  /**
   * Enable or disable retry mechanism
   */
  setRetryEnabled(enabled: boolean): ConfigBuilder {
    if (!this.config.errorHandlingConfig) {
      this.config.errorHandlingConfig = this.getDefaultErrorHandlingConfig();
    }
    this.config.errorHandlingConfig.retryStrategy.enabled = enabled;
    return this;
  }

  /**
   * Set maximum number of retries
   */
  setMaxRetries(maxRetries: number): ConfigBuilder {
    if (maxRetries < 0) {
      throw new ConfigValidationError('Max retries must be non-negative');
    }
    if (!this.config.errorHandlingConfig) {
      this.config.errorHandlingConfig = this.getDefaultErrorHandlingConfig();
    }
    this.config.errorHandlingConfig.retryStrategy.maxRetries = maxRetries;
    return this;
  }

  /**
   * Set rate limiting configuration
   */
  setRateLimitingConfig(requestsPerMinute: number, burstCapacity?: number): ConfigBuilder {
    if (requestsPerMinute < 1) {
      throw new ConfigValidationError('Requests per minute must be at least 1');
    }
    if (!this.config.securityConfig) {
      this.config.securityConfig = this.getDefaultSecurityConfig();
    }
    this.config.securityConfig.rateLimiting.requestsPerMinute = requestsPerMinute;
    if (burstCapacity !== undefined) {
      this.config.securityConfig.rateLimiting.burstCapacity = burstCapacity;
    }
    return this;
  }

  /**
   * Build configuration from CLI arguments
   */
  static fromCliArgs(args: CliArgs): Config {
    const builder = new ConfigBuilder();

    // Required fields
    if (args.mode) {
      builder.setMode(args.mode);
    }

    if (args.type) {
      builder.setApiType(args.type);
    }

    if (args.out) {
      builder.setOutputFile(args.out);
    }

    if (args.openaiKey) {
      builder.setOpenAiApiKey(args.openaiKey);
    }

    // Optional fields
    if (args.url) {
      builder.setUrl(args.url);
    }

    if (args.token) {
      builder.setToken(args.token);
    }

    if (args.authType) {
      builder.setAuthType(args.authType);
    }

    if (args.authHeaderName) {
      builder.setAuthHeaderName(args.authHeaderName);
    }

    if (args.seedEndpoints) {
      const endpoints = args.seedEndpoints.split(',').map(e => e.trim());
      builder.setSeedEndpoints(endpoints);
    }

    if (args.maxDepth !== undefined) {
      builder.setMaxDepth(args.maxDepth);
    }

    if (args.timeout !== undefined) {
      builder.setTimeout(args.timeout);
    }

    if (args.rateLimit !== undefined) {
      builder.setRateLimit(args.rateLimit);
    }

    if (args.title) {
      builder.setTitle(args.title);
    }

    if (args.description) {
      builder.setDescription(args.description);
    }

    if (args.version) {
      builder.setVersion(args.version);
    }

    if (args.verbose !== undefined) {
      builder.setVerbose(args.verbose);
    }

    if (args.debug !== undefined) {
      builder.setDebug(args.debug);
    }

    // New configuration options
    if (args.enableSecurity !== undefined) {
      builder.setApiKeyEncryption(args.enableSecurity);
    }

    if (args.privacyLevel) {
      const level = args.privacyLevel as PrivacyLevel;
      if (Object.values(PrivacyLevel).includes(level)) {
        builder.setPrivacyLevel(level);
      }
    }

    if (args.validationLevel) {
      const level = args.validationLevel as ValidationLevel;
      if (Object.values(ValidationLevel).includes(level)) {
        builder.setValidationLevel(level);
      }
    }

    if (args.enableRetries !== undefined) {
      builder.setRetryEnabled(args.enableRetries);
    }

    if (args.maxRetries !== undefined) {
      builder.setMaxRetries(args.maxRetries);
    }

    return builder.build();
  }

  /**
   * Build and validate the configuration
   */
  build(): Config {
    this.validate();
    return this.config as Config;
  }

  /**
   * Validate the current configuration
   */
  private validate(): void {
    // Check required fields
    if (!this.config.mode) {
      throw new ConfigValidationError('Mode is required');
    }

    if (!this.config.apiType) {
      throw new ConfigValidationError('API type is required');
    }

    if (!this.config.outputFile) {
      throw new ConfigValidationError('Output file is required');
    }

    if (!this.config.openaiApiKey) {
      throw new ConfigValidationError('OpenAI API key is required');
    }

    // Mode-specific validation
    if (this.config.mode === ScanMode.LIVE) {
      if (!this.config.url) {
        throw new ConfigValidationError('URL is required for live mode');
      }
    }

    // Auth-specific validation
    if (this.config.authType === AuthType.API_KEY && !this.config.authHeaderName) {
      throw new ConfigValidationError('Auth header name is required for API key authentication');
    }

    if (this.config.authType === AuthType.BEARER && !this.config.token) {
      throw new ConfigValidationError('Token is required for bearer authentication');
    }

    if (this.config.authType === AuthType.BASIC && !this.config.token) {
      throw new ConfigValidationError('Token is required for basic authentication');
    }

    // Security configuration validation
    if (this.config.securityConfig) {
      this.validateSecurityConfig(this.config.securityConfig);
    }

    // Validation configuration validation
    if (this.config.validationConfig) {
      this.validateValidationConfig(this.config.validationConfig);
    }

    // Error handling configuration validation
    if (this.config.errorHandlingConfig) {
      this.validateErrorHandlingConfig(this.config.errorHandlingConfig);
    }

    // Set defaults
    this.setDefaults();
  }

  /**
   * Validate security configuration
   */
  private validateSecurityConfig(securityConfig: SecurityConfig): void {
    if (securityConfig.rateLimiting.enabled) {
      if (securityConfig.rateLimiting.requestsPerMinute < 1) {
        throw new ConfigValidationError('Rate limiting requests per minute must be at least 1');
      }
      if (securityConfig.rateLimiting.burstCapacity < 1) {
        throw new ConfigValidationError('Rate limiting burst capacity must be at least 1');
      }
      if (securityConfig.rateLimiting.maxRetries < 0) {
        throw new ConfigValidationError('Rate limiting max retries must be non-negative');
      }
    }

    if (securityConfig.apiKeyEncryption.enabled) {
      if (securityConfig.apiKeyEncryption.keyDerivation) {
        if (securityConfig.apiKeyEncryption.keyDerivation.iterations < 1000) {
          throw new ConfigValidationError('Key derivation iterations must be at least 1000 for security');
        }
        if (securityConfig.apiKeyEncryption.keyDerivation.saltLength < 16) {
          throw new ConfigValidationError('Salt length must be at least 16 bytes for security');
        }
      }
    }
  }

  /**
   * Validate validation configuration
   */
  private validateValidationConfig(validationConfig: ValidationConfig): void {
    if (validationConfig.content.enabled) {
      if (validationConfig.content.minQualityScore < 0 || validationConfig.content.minQualityScore > 100) {
        throw new ConfigValidationError('Content validation quality score must be between 0 and 100');
      }
    }

    if (validationConfig.fallback.enabled) {
      if (validationConfig.fallback.fallbackQualityThreshold < 0 || validationConfig.fallback.fallbackQualityThreshold > 100) {
        throw new ConfigValidationError('Fallback quality threshold must be between 0 and 100');
      }
    }
  }

  /**
   * Validate error handling configuration
   */
  private validateErrorHandlingConfig(errorHandlingConfig: ErrorHandlingConfig): void {
    if (errorHandlingConfig.retryStrategy.enabled) {
      if (errorHandlingConfig.retryStrategy.maxRetries < 0) {
        throw new ConfigValidationError('Max retries must be non-negative');
      }
      if (errorHandlingConfig.retryStrategy.baseDelay < 100) {
        throw new ConfigValidationError('Base delay must be at least 100ms');
      }
      if (errorHandlingConfig.retryStrategy.maxDelay < errorHandlingConfig.retryStrategy.baseDelay) {
        throw new ConfigValidationError('Max delay must be greater than or equal to base delay');
      }
      if (errorHandlingConfig.retryStrategy.backoffMultiplier < 1) {
        throw new ConfigValidationError('Backoff multiplier must be at least 1');
      }
    }

    if (errorHandlingConfig.circuitBreaker.enabled) {
      if (errorHandlingConfig.circuitBreaker.failureThreshold < 1) {
        throw new ConfigValidationError('Circuit breaker failure threshold must be at least 1');
      }
      if (errorHandlingConfig.circuitBreaker.resetTimeout < 1000) {
        throw new ConfigValidationError('Circuit breaker reset timeout must be at least 1000ms');
      }
    }

    if (errorHandlingConfig.timeout.aiServiceTimeout < 1000) {
      throw new ConfigValidationError('AI service timeout must be at least 1000ms');
    }
    if (errorHandlingConfig.timeout.httpRequestTimeout < 1000) {
      throw new ConfigValidationError('HTTP request timeout must be at least 1000ms');
    }
    if (errorHandlingConfig.timeout.overallOperationTimeout < 5000) {
      throw new ConfigValidationError('Overall operation timeout must be at least 5000ms');
    }
  }

  /**
   * Set default values for optional configuration
   */
  private setDefaults(): void {
    if (this.config.maxDepth === undefined) {
      this.config.maxDepth = 3;
    }

    if (this.config.timeout === undefined) {
      this.config.timeout = 30000; // 30 seconds
    }

    if (this.config.rateLimit === undefined) {
      this.config.rateLimit = 10; // 10 requests per second
    }

    if (this.config.verbose === undefined) {
      this.config.verbose = false;
    }

    if (this.config.debug === undefined) {
      this.config.debug = false;
    }

    if (!this.config.title) {
      this.config.title = 'API Documentation';
    }

    if (!this.config.description) {
      this.config.description = 'Generated API documentation';
    }

    if (!this.config.version) {
      this.config.version = '1.0.0';
    }

    if (this.config.authType === undefined) {
      this.config.authType = AuthType.NONE;
    }

    // Set defaults for new configuration sections
    if (!this.config.securityConfig) {
      this.config.securityConfig = this.getDefaultSecurityConfig();
    }

    if (!this.config.validationConfig) {
      this.config.validationConfig = this.getDefaultValidationConfig();
    }

    if (!this.config.errorHandlingConfig) {
      this.config.errorHandlingConfig = this.getDefaultErrorHandlingConfig();
    }
  }

  /**
   * Get default security configuration
   */
  private getDefaultSecurityConfig(): SecurityConfig {
    return {
      apiKeyEncryption: {
        enabled: false,
        algorithm: 'aes-256-gcm',
        keyDerivation: {
          iterations: 100000,
          saltLength: 32
        }
      },
      rateLimiting: {
        enabled: true,
        requestsPerMinute: 60,
        burstCapacity: 10,
        backoffStrategy: 'exponential',
        maxRetries: 3
      },
      privacy: {
        level: PrivacyLevel.MODERATE,
        detectPII: true,
        sanitizeData: true,
        redactionChar: '*'
      }
    };
  }

  /**
   * Get default validation configuration
   */
  private getDefaultValidationConfig(): ValidationConfig {
    return {
      content: {
        enabled: true,
        level: ValidationLevel.MODERATE,
        minQualityScore: 70,
        requiredSections: ['description', 'parameters', 'responses'],
        checkCompleteness: true,
        validateFormat: true
      },
      schema: {
        enabled: true,
        level: ValidationLevel.MODERATE,
        strictTypeChecking: false,
        allowAdditionalProperties: true,
        validateExamples: true
      },
      fallback: {
        enabled: true,
        useTemplates: true,
        gracefulDegradation: true,
        fallbackQualityThreshold: 50
      }
    };
  }

  /**
   * Get default error handling configuration
   */
  private getDefaultErrorHandlingConfig(): ErrorHandlingConfig {
    return {
      retryStrategy: {
        enabled: true,
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitterEnabled: true
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 10000
      },
      timeout: {
        aiServiceTimeout: 30000,
        httpRequestTimeout: 10000,
        overallOperationTimeout: 300000
      },
      errorReporting: {
        enabled: true,
        includeStackTrace: false,
        logLevel: 'error'
      }
    };
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
export { SecurityConfig };

