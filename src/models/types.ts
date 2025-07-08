/**
 * HTTP methods supported by the API documentation generator
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

/**
 * Authentication types supported by the API documentation generator
 */
export enum AuthType {
  NONE = 'none',
  BEARER = 'bearer',
  API_KEY = 'apiKey',
  BASIC = 'basic',
}

/**
 * Privacy levels for data sanitization and PII detection
 */
export enum PrivacyLevel {
  STRICT = 'strict',
  MODERATE = 'moderate',
  PERMISSIVE = 'permissive',
}

/**
 * Validation levels for content and schema validation
 */
export enum ValidationLevel {
  STRICT = 'strict',
  MODERATE = 'moderate',
  LENIENT = 'lenient',
  DISABLED = 'disabled',
}

/**
 * Interface for API header specifications
 */
export interface HeaderSpec {
  name: string;
  value: string;
  required: boolean;
  description?: string;
}

/**
 * Interface for authentication information
 */
export interface AuthInfo {
  type: AuthType;
  credentials?: {
    token?: string;
    apiKey?: string;
    username?: string;
    password?: string;
    headerName?: string; // For API key authentication
  };
  description?: string;
}

/**
 * Interface for security configuration settings
 */
export interface SecurityConfig {
  apiKeyEncryption: {
    enabled: boolean;
    algorithm?: string;
    keyDerivation?: {
      iterations: number;
      saltLength: number;
    };
  };
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;
    burstCapacity: number;
    backoffStrategy: 'exponential' | 'linear' | 'fixed';
    maxRetries: number;
  };
  privacy: {
    level: PrivacyLevel;
    detectPII: boolean;
    sanitizeData: boolean;
    customPatterns?: string[];
    redactionChar: string;
  };
}

/**
 * Interface for validation configuration settings
 */
export interface ValidationConfig {
  content: {
    enabled: boolean;
    level: ValidationLevel;
    minQualityScore: number;
    requiredSections: string[];
    checkCompleteness: boolean;
    validateFormat: boolean;
  };
  schema: {
    enabled: boolean;
    level: ValidationLevel;
    strictTypeChecking: boolean;
    allowAdditionalProperties: boolean;
    validateExamples: boolean;
  };
  fallback: {
    enabled: boolean;
    useTemplates: boolean;
    templateDirectory?: string;
    gracefulDegradation: boolean;
    fallbackQualityThreshold: number;
  };
}

/**
 * Interface for tracking documentation quality metrics
 */
export interface QualityMetrics {
  overallScore: number; // 0-100
  completeness: {
    score: number;
    missingFields: string[];
    hasDescription: boolean;
    hasExamples: boolean;
    hasErrorHandling: boolean;
  };
  clarity: {
    score: number;
    readabilityIndex: number;
    hasCodeExamples: boolean;
    usesConsistentTerminology: boolean;
  };
  accuracy: {
    score: number;
    schemaValidation: boolean;
    exampleValidation: boolean;
    typeConsistency: boolean;
  };
  lastUpdated: Date;
  validatedBy?: string;
}

/**
 * Interface representing a single API endpoint
 */
export interface Endpoint {
  method: HttpMethod;
  path: string;
  description?: string;
  headers?: HeaderSpec[];
  auth?: AuthInfo;
  requestSchema?: {
    contentType?: string;
    schema?: any; // JSON schema or example object
    example?: any;
  };
  responseSchema?: {
    statusCode?: number;
    contentType?: string;
    schema?: any; // JSON schema or example object
    example?: any;
  }[];
  parameters?: {
    path?: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
    query?: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
  };
  tags?: string[];
  deprecated?: boolean;
  // New fields for security, validation, and quality tracking
  security?: {
    requiresAuth: boolean;
    sensitiveData: boolean;
    rateLimited: boolean;
    privacyLevel: PrivacyLevel;
    securityNotes?: string[];
  };
  validation?: {
    schemaValidated: boolean;
    contentValidated: boolean;
    validationLevel: ValidationLevel;
    validationErrors?: string[];
    lastValidated?: Date;
  };
  quality?: QualityMetrics;
  metadata?: {
    discoveredAt: Date;
    lastModified: Date;
    source: string;
    confidence: number; // 0-1 confidence in endpoint accuracy
    aiGenerated: boolean;
    fallbackUsed: boolean;
  };
}

/**
 * Type representing a complete API specification as an array of endpoints
 */
export type ApiSpec = Endpoint[];
