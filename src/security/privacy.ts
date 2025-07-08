import { Endpoint, ApiSpec, PrivacyLevel } from '../models/types.js';
import { Logger } from '../utils/logger.js';

/**
 * Interface for PII detection patterns
 */
export interface PIIPattern {
  name: string;
  pattern: RegExp;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'personal' | 'financial' | 'authentication' | 'technical' | 'custom';
}

/**
 * Interface for data sanitization rules
 */
export interface SanitizationRule {
  pattern: PIIPattern;
  replacement: string | ((match: string) => string);
  preserveFormat: boolean;
  enabled: boolean;
}

/**
 * Interface for privacy configuration
 */
export interface PrivacyConfig {
  level: PrivacyLevel;
  detectPII: boolean;
  sanitizeData: boolean;
  customPatterns: PIIPattern[];
  redactionChar: string;
  preserveStructure: boolean;
  logDetections: boolean;
  strictMode: boolean;
  allowedDomains?: string[];
  exemptFields?: string[];
}

/**
 * Interface for PII detection results
 */
export interface PIIDetectionResult {
  found: boolean;
  detections: Array<{
    pattern: PIIPattern;
    matches: Array<{
      value: string;
      startIndex: number;
      endIndex: number;
      context?: string;
    }>;
  }>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

/**
 * Interface for data sanitization results
 */
export interface SanitizationResult {
  originalData: any;
  sanitizedData: any;
  detections: PIIDetectionResult;
  appliedRules: SanitizationRule[];
  preservedStructure: boolean;
  sanitizationTime: number;
}

/**
 * Interface for privacy validation results
 */
export interface PrivacyValidationResult {
  isValid: boolean;
  violations: Array<{
    field: string;
    violation: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    suggestion: string;
  }>;
  riskScore: number; // 0-100
  complianceLevel: 'compliant' | 'warning' | 'violation' | 'critical';
}

/**
 * Privacy manager for handling data sanitization and PII detection
 */
export class PrivacyManager {
  private config: PrivacyConfig;
  private logger: Logger;
  private builtInPatterns: PIIPattern[];
  private sanitizationRules: SanitizationRule[];

  constructor(config: PrivacyConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.builtInPatterns = this.initializeBuiltInPatterns();
    this.sanitizationRules = this.initializeSanitizationRules();
  }

  /**
   * Sanitize data by detecting and redacting PII
   */
  public sanitizeData(data: any): SanitizationResult {
    const startTime = Date.now();
    
    if (this.config.logDetections) {
      this.logger.debug('Starting data sanitization process');
    }

    const detections = this.detectPII(data);
    const sanitizedData = this.applySanitization(data, detections);
    const appliedRules = this.getAppliedRules(detections);

    const result: SanitizationResult = {
      originalData: this.config.preserveStructure ? this.deepClone(data) : null,
      sanitizedData,
      detections,
      appliedRules,
      preservedStructure: this.config.preserveStructure,
      sanitizationTime: Date.now() - startTime
    };

    if (this.config.logDetections && detections.found) {
      this.logger.warn(`PII detected and sanitized: ${detections.detections.length} pattern(s) found`);
    }

    return result;
  }

  /**
   * Detect PII in the provided data
   */
  public detectPII(data: any): PIIDetectionResult {
    const allPatterns = [...this.builtInPatterns, ...this.config.customPatterns];
    const activePatterns = this.getActivePatternsForLevel(allPatterns);
    
    const detections: PIIDetectionResult['detections'] = [];
    const dataString = this.convertToSearchableString(data);

    for (const pattern of activePatterns) {
      const matches = this.findMatches(dataString, pattern, data);
      if (matches.length > 0) {
        detections.push({
          pattern,
          matches
        });
      }
    }

    const riskLevel = this.calculateRiskLevel(detections);
    const recommendations = this.generateRecommendations(detections, riskLevel);

    return {
      found: detections.length > 0,
      detections,
      riskLevel,
      recommendations
    };
  }

  /**
   * Redact sensitive information from data
   */
  public redactSensitiveInfo(data: any, customPatterns?: PIIPattern[]): any {
    const patterns = customPatterns || [...this.builtInPatterns, ...this.config.customPatterns];
    const activePatterns = this.getActivePatternsForLevel(patterns);
    
    return this.redactDataRecursively(data, activePatterns);
  }

  /**
   * Validate data privacy compliance
   */
  public validateDataPrivacy(data: any): PrivacyValidationResult {
    const detections = this.detectPII(data);
    const violations: PrivacyValidationResult['violations'] = [];
    
    // Check for violations based on privacy level
    for (const detection of detections.detections) {
      for (const match of detection.matches) {
        const violation = this.assessViolation(detection.pattern, match, data);
        if (violation) {
          violations.push(violation);
        }
      }
    }

    const riskScore = this.calculatePrivacyRiskScore(violations, detections);
    const complianceLevel = this.determineComplianceLevel(riskScore, violations);

    return {
      isValid: violations.length === 0,
      violations,
      riskScore,
      complianceLevel
    };
  }

  /**
   * Sanitize endpoint data for AI processing
   */
  public sanitizeEndpoint(endpoint: Endpoint): Endpoint {
    const sanitizedEndpoint = this.deepClone(endpoint);

    // Sanitize request schema examples
    if (sanitizedEndpoint.requestSchema?.example) {
      const result = this.sanitizeData(sanitizedEndpoint.requestSchema.example);
      sanitizedEndpoint.requestSchema.example = result.sanitizedData;
    }

    // Sanitize response schema examples
    if (sanitizedEndpoint.responseSchema) {
      for (const response of sanitizedEndpoint.responseSchema) {
        if (response.example) {
          const result = this.sanitizeData(response.example);
          response.example = result.sanitizedData;
        }
      }
    }

    // Sanitize headers
    if (sanitizedEndpoint.headers) {
      for (const header of sanitizedEndpoint.headers) {
        if (header.value) {
          const result = this.sanitizeData(header.value);
          header.value = result.sanitizedData;
        }
      }
    }

    // Sanitize auth credentials
    if (sanitizedEndpoint.auth?.credentials) {
      const result = this.sanitizeData(sanitizedEndpoint.auth.credentials);
      sanitizedEndpoint.auth.credentials = result.sanitizedData;
    }

    return sanitizedEndpoint;
  }

  /**
   * Sanitize API specification for AI processing
   */
  public sanitizeApiSpec(apiSpec: ApiSpec): ApiSpec {
    return apiSpec.map(endpoint => this.sanitizeEndpoint(endpoint));
  }

  /**
   * Update privacy configuration
   */
  public updateConfig(newConfig: Partial<PrivacyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.sanitizationRules = this.initializeSanitizationRules();
  }

  /**
   * Add custom PII pattern
   */
  public addCustomPattern(pattern: PIIPattern): void {
    this.config.customPatterns.push(pattern);
  }

  /**
   * Remove custom PII pattern
   */
  public removeCustomPattern(patternName: string): boolean {
    const index = this.config.customPatterns.findIndex(p => p.name === patternName);
    if (index !== -1) {
      this.config.customPatterns.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get privacy statistics
   */
  public getPrivacyStats(): {
    totalPatterns: number;
    activePatterns: number;
    customPatterns: number;
    privacyLevel: PrivacyLevel;
  } {
    const allPatterns = [...this.builtInPatterns, ...this.config.customPatterns];
    const activePatterns = this.getActivePatternsForLevel(allPatterns);

    return {
      totalPatterns: allPatterns.length,
      activePatterns: activePatterns.length,
      customPatterns: this.config.customPatterns.length,
      privacyLevel: this.config.level
    };
  }

  /**
   * Initialize built-in PII detection patterns
   */
  private initializeBuiltInPatterns(): PIIPattern[] {
    return [
      // Email addresses
      {
        name: 'email',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        description: 'Email addresses',
        severity: 'medium',
        category: 'personal'
      },
      // Phone numbers (US format)
      {
        name: 'phone_us',
        pattern: /(\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
        description: 'US phone numbers',
        severity: 'medium',
        category: 'personal'
      },
      // Social Security Numbers
      {
        name: 'ssn',
        pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        description: 'Social Security Numbers',
        severity: 'critical',
        category: 'personal'
      },
      // Credit card numbers
      {
        name: 'credit_card',
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        description: 'Credit card numbers',
        severity: 'critical',
        category: 'financial'
      },
      // API keys (generic patterns)
      {
        name: 'api_key_generic',
        pattern: /\b[A-Za-z0-9]{32,}\b/g,
        description: 'Generic API keys',
        severity: 'high',
        category: 'authentication'
      },
      // JWT tokens
      {
        name: 'jwt_token',
        pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
        description: 'JWT tokens',
        severity: 'high',
        category: 'authentication'
      },
      // OpenAI API keys
      {
        name: 'openai_api_key',
        pattern: /sk-[A-Za-z0-9]{48}/g,
        description: 'OpenAI API keys',
        severity: 'critical',
        category: 'authentication'
      },
      // AWS access keys
      {
        name: 'aws_access_key',
        pattern: /AKIA[0-9A-Z]{16}/g,
        description: 'AWS access keys',
        severity: 'critical',
        category: 'authentication'
      },
      // GitHub tokens
      {
        name: 'github_token',
        pattern: /ghp_[A-Za-z0-9]{36}/g,
        description: 'GitHub personal access tokens',
        severity: 'high',
        category: 'authentication'
      },
      // IP addresses
      {
        name: 'ip_address',
        pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
        description: 'IP addresses',
        severity: 'low',
        category: 'technical'
      },
      // Passwords (common patterns)
      {
        name: 'password_field',
        pattern: /"password"\s*:\s*"[^"]+"/gi,
        description: 'Password fields in JSON',
        severity: 'critical',
        category: 'authentication'
      },
      // Database connection strings
      {
        name: 'db_connection',
        pattern: /(mongodb|mysql|postgresql|redis):\/\/[^\s"']+/gi,
        description: 'Database connection strings',
        severity: 'critical',
        category: 'technical'
      }
    ];
  }

  /**
   * Initialize sanitization rules based on configuration
   */
  private initializeSanitizationRules(): SanitizationRule[] {
    const allPatterns = [...this.builtInPatterns, ...this.config.customPatterns];
    
    return allPatterns.map(pattern => ({
      pattern,
      replacement: this.getReplacementForPattern(pattern),
      preserveFormat: this.shouldPreserveFormat(pattern),
      enabled: this.isPatternEnabledForLevel(pattern)
    }));
  }

  /**
   * Get replacement strategy for a pattern
   */
  private getReplacementForPattern(pattern: PIIPattern): string | ((match: string) => string) {
    switch (pattern.category) {
      case 'personal':
        return (match: string) => this.config.redactionChar.repeat(Math.min(match.length, 8));
      case 'financial':
        return (match: string) => this.config.redactionChar.repeat(12);
      case 'authentication':
        return '[REDACTED_TOKEN]';
      case 'technical':
        if (pattern.name === 'ip_address') {
          return 'XXX.XXX.XXX.XXX';
        }
        return '[REDACTED]';
      default:
        return (match: string) => this.config.redactionChar.repeat(Math.min(match.length, 10));
    }
  }

  /**
   * Determine if format should be preserved for a pattern
   */
  private shouldPreserveFormat(pattern: PIIPattern): boolean {
    return ['phone_us', 'ssn', 'credit_card', 'ip_address'].includes(pattern.name);
  }

  /**
   * Check if pattern is enabled for current privacy level
   */
  private isPatternEnabledForLevel(pattern: PIIPattern): boolean {
    switch (this.config.level) {
      case PrivacyLevel.STRICT:
        return true; // All patterns enabled
      case PrivacyLevel.MODERATE:
        return pattern.severity !== 'low';
      case PrivacyLevel.PERMISSIVE:
        return pattern.severity === 'critical' || pattern.severity === 'high';
      default:
        return false;
    }
  }

  /**
   * Get active patterns for current privacy level
   */
  private getActivePatternsForLevel(patterns: PIIPattern[]): PIIPattern[] {
    return patterns.filter(pattern => this.isPatternEnabledForLevel(pattern));
  }

  /**
   * Convert data to searchable string
   */
  private convertToSearchableString(data: any): string {
    if (typeof data === 'string') {
      return data;
    }
    
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  /**
   * Find matches for a pattern in data
   */
  private findMatches(dataString: string, pattern: PIIPattern, originalData: any): Array<{
    value: string;
    startIndex: number;
    endIndex: number;
    context?: string;
  }> {
    const matches: Array<{
      value: string;
      startIndex: number;
      endIndex: number;
      context?: string;
    }> = [];

    let match;
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    
    while ((match = regex.exec(dataString)) !== null) {
      const context = this.extractContext(dataString, match.index, 50);
      
      matches.push({
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        context
      });

      // Prevent infinite loop for global patterns
      if (!pattern.pattern.global) {
        break;
      }
    }

    return matches;
  }

  /**
   * Extract context around a match
   */
  private extractContext(text: string, index: number, contextLength: number): string {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + contextLength);
    return text.substring(start, end);
  }

  /**
   * Apply sanitization to data
   */
  private applySanitization(data: any, detections: PIIDetectionResult): any {
    if (!this.config.sanitizeData || !detections.found) {
      return data;
    }

    let sanitizedData = this.deepClone(data);
    
    // Apply sanitization recursively
    sanitizedData = this.redactDataRecursively(sanitizedData, detections.detections.map(d => d.pattern));

    return sanitizedData;
  }

  /**
   * Recursively redact data
   */
  private redactDataRecursively(data: any, patterns: PIIPattern[]): any {
    if (typeof data === 'string') {
      return this.redactString(data, patterns);
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.redactDataRecursively(item, patterns));
    }
    
    if (data && typeof data === 'object') {
      const redacted: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Check if field is exempt
        if (this.config.exemptFields?.includes(key)) {
          redacted[key] = value;
        } else {
          redacted[key] = this.redactDataRecursively(value, patterns);
        }
      }
      return redacted;
    }
    
    return data;
  }

  /**
   * Redact string using patterns
   */
  private redactString(text: string, patterns: PIIPattern[]): string {
    let redactedText = text;
    
    for (const pattern of patterns) {
      const rule = this.sanitizationRules.find(r => r.pattern.name === pattern.name);
      if (rule && rule.enabled) {
        if (typeof rule.replacement === 'function') {
          redactedText = redactedText.replace(pattern.pattern, rule.replacement);
        } else {
          redactedText = redactedText.replace(pattern.pattern, rule.replacement);
        }
      }
    }
    
    return redactedText;
  }

  /**
   * Get applied sanitization rules
   */
  private getAppliedRules(detections: PIIDetectionResult): SanitizationRule[] {
    const appliedRules: SanitizationRule[] = [];
    
    for (const detection of detections.detections) {
      const rule = this.sanitizationRules.find(r => r.pattern.name === detection.pattern.name);
      if (rule && rule.enabled) {
        appliedRules.push(rule);
      }
    }
    
    return appliedRules;
  }

  /**
   * Calculate risk level based on detections
   */
  private calculateRiskLevel(detections: PIIDetectionResult['detections']): 'low' | 'medium' | 'high' | 'critical' {
    if (detections.length === 0) {
      return 'low';
    }

    const severities = detections.map(d => d.pattern.severity);
    
    if (severities.includes('critical')) {
      return 'critical';
    }
    if (severities.includes('high')) {
      return 'high';
    }
    if (severities.includes('medium')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Generate recommendations based on detections
   */
  private generateRecommendations(detections: PIIDetectionResult['detections'], riskLevel: string): string[] {
    const recommendations: string[] = [];
    
    if (detections.length === 0) {
      return ['No PII detected. Data appears safe for AI processing.'];
    }

    recommendations.push(`${detections.length} PII pattern(s) detected with ${riskLevel} risk level.`);
    
    const categories = new Set(detections.map(d => d.pattern.category));
    
    if (categories.has('authentication')) {
      recommendations.push('Remove or redact authentication tokens before AI processing.');
    }
    
    if (categories.has('financial')) {
      recommendations.push('Financial information detected. Consider using synthetic data for examples.');
    }
    
    if (categories.has('personal')) {
      recommendations.push('Personal information found. Ensure compliance with privacy regulations.');
    }
    
    if (riskLevel === 'critical') {
      recommendations.push('CRITICAL: Highly sensitive data detected. Do not send to external AI services.');
    }
    
    return recommendations;
  }

  /**
   * Assess privacy violation
   */
  private assessViolation(pattern: PIIPattern, match: any, data: any): PrivacyValidationResult['violations'][0] | null {
    // Check if this type of data is allowed based on privacy level
    const isViolation = this.isViolationForLevel(pattern);
    
    if (!isViolation) {
      return null;
    }

    return {
      field: this.findFieldName(match.value, data) || 'unknown',
      violation: `${pattern.description} detected`,
      severity: pattern.severity,
      suggestion: this.getSuggestionForPattern(pattern)
    };
  }

  /**
   * Check if pattern constitutes a violation for current privacy level
   */
  private isViolationForLevel(pattern: PIIPattern): boolean {
    switch (this.config.level) {
      case PrivacyLevel.STRICT:
        return pattern.severity !== 'low';
      case PrivacyLevel.MODERATE:
        return pattern.severity === 'critical' || pattern.severity === 'high';
      case PrivacyLevel.PERMISSIVE:
        return pattern.severity === 'critical';
      default:
        return false;
    }
  }

  /**
   * Find field name containing the matched value
   */
  private findFieldName(value: string, data: any, path: string = ''): string | null {
    if (typeof data === 'string' && data.includes(value)) {
      return path || 'root';
    }
    
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const result = this.findFieldName(value, data[i], `${path}[${i}]`);
        if (result) return result;
      }
    }
    
    if (data && typeof data === 'object') {
      for (const [key, val] of Object.entries(data)) {
        const newPath = path ? `${path}.${key}` : key;
        const result = this.findFieldName(value, val, newPath);
        if (result) return result;
      }
    }
    
    return null;
  }

  /**
   * Get suggestion for pattern
   */
  private getSuggestionForPattern(pattern: PIIPattern): string {
    switch (pattern.category) {
      case 'authentication':
        return 'Replace with placeholder tokens or use environment variables';
      case 'financial':
        return 'Use synthetic or anonymized financial data for examples';
      case 'personal':
        return 'Replace with fictional or anonymized personal information';
      case 'technical':
        return 'Use placeholder values or sanitize technical details';
      default:
        return 'Consider removing or anonymizing this sensitive information';
    }
  }

  /**
   * Calculate privacy risk score
   */
  private calculatePrivacyRiskScore(violations: PrivacyValidationResult['violations'], detections: PIIDetectionResult): number {
    if (violations.length === 0) {
      return 0;
    }

    let score = 0;
    const weights = { low: 10, medium: 25, high: 50, critical: 100 };
    
    for (const violation of violations) {
      score += weights[violation.severity];
    }
    
    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Determine compliance level
   */
  private determineComplianceLevel(riskScore: number, violations: PrivacyValidationResult['violations']): 'compliant' | 'warning' | 'violation' | 'critical' {
    if (riskScore === 0) {
      return 'compliant';
    }
    
    const hasCritical = violations.some(v => v.severity === 'critical');
    if (hasCritical) {
      return 'critical';
    }
    
    if (riskScore >= 50) {
      return 'violation';
    }
    
    return 'warning';
  }

  /**
   * Deep clone an object
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }
    
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    
    return cloned;
  }
}

/**
 * Create a default privacy manager instance
 */
export function createPrivacyManager(config: Partial<PrivacyConfig> = {}, logger?: Logger): PrivacyManager {
  const defaultConfig: PrivacyConfig = {
    level: PrivacyLevel.MODERATE,
    detectPII: true,
    sanitizeData: true,
    customPatterns: [],
    redactionChar: '*',
    preserveStructure: false,
    logDetections: true,
    strictMode: false
  };

  const finalConfig = { ...defaultConfig, ...config };
  const finalLogger = logger || new Logger({ enableDebug: false });

  return new PrivacyManager(finalConfig, finalLogger);
}

/**
 * Utility function to quickly sanitize data with default settings
 */
export function quickSanitize(data: any, privacyLevel: PrivacyLevel = PrivacyLevel.MODERATE): any {
  const manager = createPrivacyManager({ level: privacyLevel });
  const result = manager.sanitizeData(data);
  return result.sanitizedData;
}

/**
 * Utility function to quickly detect PII with default settings
 */
export function quickDetectPII(data: any, privacyLevel: PrivacyLevel = PrivacyLevel.MODERATE): PIIDetectionResult {
  const manager = createPrivacyManager({ level: privacyLevel });
  return manager.detectPII(data);
}