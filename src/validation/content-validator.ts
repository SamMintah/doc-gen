import { Endpoint, ApiSpec, QualityMetrics, ValidationLevel } from '../models/types.js';
import { Logger } from '../utils/logger.js';

/**
 * Interface for validation results
 */
export interface ValidationResult {
  isValid: boolean;
  score: number; // 0-100
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  qualityMetrics: QualityMetrics;
}

/**
 * Interface for validation errors
 */
export interface ValidationError {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  field?: string;
  suggestion?: string;
}

/**
 * Interface for validation warnings
 */
export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

/**
 * Interface for quality scoring
 */
export interface QualityScore {
  overall: number; // 0-100
  completeness: number;
  clarity: number;
  accuracy: number;
  consistency: number;
  format: number;
}

/**
 * Interface for validation rules
 */
export interface ValidationRule {
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  weight: number; // 0-1, used for scoring
  validator: (endpoint: Endpoint, context?: ValidationContext) => ValidationRuleResult;
}

/**
 * Interface for validation rule results
 */
export interface ValidationRuleResult {
  passed: boolean;
  score: number; // 0-100
  message?: string;
  suggestion?: string;
}

/**
 * Interface for validation context
 */
export interface ValidationContext {
  apiSpec: ApiSpec;
  validationLevel: ValidationLevel;
  customRules?: ValidationRule[];
  thresholds: ValidationThresholds;
}

/**
 * Interface for validation thresholds
 */
export interface ValidationThresholds {
  minOverallScore: number;
  minCompletenessScore: number;
  minClarityScore: number;
  minAccuracyScore: number;
  minConsistencyScore: number;
  minFormatScore: number;
  requiredSections: string[];
  maxDescriptionLength?: number;
  minDescriptionLength?: number;
}

/**
 * Content validator for AI-generated documentation
 */
export class ContentValidator {
  private logger: Logger;
  private defaultRules: ValidationRule[];
  private defaultThresholds: ValidationThresholds;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger();
    this.initializeDefaultRules();
    this.initializeDefaultThresholds();
  }

  /**
   * Validate documentation for a single endpoint
   */
  public validateDocumentation(
    endpoint: Endpoint,
    context?: Partial<ValidationContext>
  ): ValidationResult {
    const validationContext = this.buildValidationContext(endpoint, context);
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Run all validation rules
    const ruleResults = this.runValidationRules(endpoint, validationContext);
    
    // Collect errors and warnings
    ruleResults.forEach((result, rule) => {
      if (!result.passed) {
        if (rule.severity === 'critical' || rule.severity === 'high') {
          errors.push({
            code: `RULE_${rule.name.toUpperCase()}`,
            message: result.message || `Failed validation rule: ${rule.name}`,
            severity: rule.severity,
            suggestion: result.suggestion
          });
        } else {
          warnings.push({
            code: `RULE_${rule.name.toUpperCase()}`,
            message: result.message || `Warning for rule: ${rule.name}`,
            suggestion: result.suggestion
          });
        }
      }
      
      if (result.suggestion) {
        suggestions.push(result.suggestion);
      }
    });

    // Calculate quality scores
    const qualityScore = this.scoreQuality(endpoint, ruleResults, validationContext);
    
    // Build quality metrics
    const qualityMetrics = this.buildQualityMetrics(endpoint, qualityScore, ruleResults);

    // Determine overall validation result
    const isValid = errors.length === 0 && 
                   qualityScore.overall >= validationContext.thresholds.minOverallScore;

    return {
      isValid,
      score: qualityScore.overall,
      errors,
      warnings,
      suggestions: [...new Set(suggestions)], // Remove duplicates
      qualityMetrics
    };
  }

  /**
   * Check completeness of endpoint documentation
   */
  public checkCompleteness(endpoint: Endpoint): {
    score: number;
    missingFields: string[];
    hasDescription: boolean;
    hasExamples: boolean;
    hasErrorHandling: boolean;
  } {
    const missingFields: string[] = [];
    let score = 100;
    const deductionPerField = 10;

    // Check required fields
    if (!endpoint.description || endpoint.description.trim().length === 0) {
      missingFields.push('description');
      score -= deductionPerField;
    }

    if (!endpoint.requestSchema?.example && !endpoint.requestSchema?.schema) {
      missingFields.push('request_example');
      score -= deductionPerField;
    }

    if (!endpoint.responseSchema || endpoint.responseSchema.length === 0) {
      missingFields.push('response_schema');
      score -= deductionPerField;
    }

    if (!endpoint.parameters?.path && !endpoint.parameters?.query) {
      missingFields.push('parameters');
      score -= deductionPerField;
    }

    // Check for error handling documentation
    const hasErrorHandling = endpoint.responseSchema?.some(
      response => response.statusCode && response.statusCode >= 400
    ) || false;

    if (!hasErrorHandling) {
      missingFields.push('error_handling');
      score -= deductionPerField;
    }

    const hasDescription = !!endpoint.description && endpoint.description.trim().length > 0;
    const hasExamples = !!(endpoint.requestSchema?.example || endpoint.responseSchema?.some(r => r.example));

    return {
      score: Math.max(0, score),
      missingFields,
      hasDescription,
      hasExamples,
      hasErrorHandling
    };
  }

  /**
   * Validate format of documentation content
   */
  public validateFormat(endpoint: Endpoint): {
    score: number;
    errors: string[];
    hasValidMarkdown: boolean;
    hasValidCodeBlocks: boolean;
    hasConsistentFormatting: boolean;
  } {
    const errors: string[] = [];
    let score = 100;
    const deductionPerError = 15;

    // Validate markdown format in description
    const hasValidMarkdown = this.validateMarkdownFormat(endpoint.description || '');
    if (!hasValidMarkdown) {
      errors.push('Invalid markdown format in description');
      score -= deductionPerError;
    }

    // Validate code blocks in examples
    const hasValidCodeBlocks = this.validateCodeBlocks(endpoint);
    if (!hasValidCodeBlocks) {
      errors.push('Invalid or missing code block formatting');
      score -= deductionPerError;
    }

    // Check consistent formatting
    const hasConsistentFormatting = this.checkConsistentFormatting(endpoint);
    if (!hasConsistentFormatting) {
      errors.push('Inconsistent formatting detected');
      score -= deductionPerError;
    }

    return {
      score: Math.max(0, score),
      errors,
      hasValidMarkdown,
      hasValidCodeBlocks,
      hasConsistentFormatting
    };
  }

  /**
   * Score the quality of endpoint documentation
   */
  public scoreQuality(
    endpoint: Endpoint,
    ruleResults?: Map<ValidationRule, ValidationRuleResult>,
    context?: ValidationContext
  ): QualityScore {
    const completeness = this.checkCompleteness(endpoint);
    const format = this.validateFormat(endpoint);
    const clarity = this.scoreClarityMetrics(endpoint);
    const accuracy = this.scoreAccuracyMetrics(endpoint);
    const consistency = this.scoreConsistencyMetrics(endpoint, context?.apiSpec);

    // Calculate weighted overall score
    const weights = {
      completeness: 0.3,
      clarity: 0.25,
      accuracy: 0.2,
      consistency: 0.15,
      format: 0.1
    };

    const overall = Math.round(
      completeness.score * weights.completeness +
      clarity * weights.clarity +
      accuracy * weights.accuracy +
      consistency * weights.consistency +
      format.score * weights.format
    );

    return {
      overall,
      completeness: completeness.score,
      clarity,
      accuracy,
      consistency,
      format: format.score
    };
  }

  /**
   * Suggest improvements for endpoint documentation
   */
  public suggestImprovements(endpoint: Endpoint, validationResult?: ValidationResult): string[] {
    const suggestions: string[] = [];

    // Use existing validation result if provided
    if (validationResult) {
      return validationResult.suggestions;
    }

    const completeness = this.checkCompleteness(endpoint);
    const format = this.validateFormat(endpoint);

    // Completeness suggestions
    if (completeness.missingFields.includes('description')) {
      suggestions.push('Add a clear, descriptive summary of what this endpoint does');
    }

    if (completeness.missingFields.includes('request_example')) {
      suggestions.push('Include a complete request example with sample data');
    }

    if (completeness.missingFields.includes('response_schema')) {
      suggestions.push('Document the response structure with examples');
    }

    if (completeness.missingFields.includes('parameters')) {
      suggestions.push('Document all path and query parameters with types and descriptions');
    }

    if (completeness.missingFields.includes('error_handling')) {
      suggestions.push('Document error responses and status codes');
    }

    // Format suggestions
    if (format.errors.length > 0) {
      suggestions.push('Fix markdown formatting issues in the documentation');
    }

    // Clarity suggestions
    if (endpoint.description && endpoint.description.length < 20) {
      suggestions.push('Expand the description to be more detailed and helpful');
    }

    if (endpoint.description && endpoint.description.length > 500) {
      suggestions.push('Consider breaking down the description into smaller, more digestible sections');
    }

    // Authentication suggestions
    if (!endpoint.auth || endpoint.auth.type === 'none') {
      suggestions.push('Specify authentication requirements if any');
    }

    return suggestions;
  }

  /**
   * Initialize default validation rules
   */
  private initializeDefaultRules(): void {
    this.defaultRules = [
      {
        name: 'has_description',
        description: 'Endpoint must have a description',
        severity: 'high',
        enabled: true,
        weight: 0.2,
        validator: (endpoint) => ({
          passed: !!(endpoint.description && endpoint.description.trim().length > 0),
          score: endpoint.description && endpoint.description.trim().length > 0 ? 100 : 0,
          message: 'Endpoint is missing a description',
          suggestion: 'Add a clear description explaining what this endpoint does'
        })
      },
      {
        name: 'has_examples',
        description: 'Endpoint should have request/response examples',
        severity: 'medium',
        enabled: true,
        weight: 0.15,
        validator: (endpoint) => {
          const hasRequestExample = !!(endpoint.requestSchema?.example);
          const hasResponseExample = !!(endpoint.responseSchema?.some(r => r.example));
          const hasExamples = hasRequestExample || hasResponseExample;
          
          return {
            passed: hasExamples,
            score: hasExamples ? 100 : 0,
            message: 'Endpoint is missing examples',
            suggestion: 'Add request and response examples to help users understand the API'
          };
        }
      },
      {
        name: 'has_parameters_documented',
        description: 'All parameters should be documented',
        severity: 'medium',
        enabled: true,
        weight: 0.15,
        validator: (endpoint) => {
          const hasPathParams = endpoint.parameters?.path && endpoint.parameters.path.length > 0;
          const hasQueryParams = endpoint.parameters?.query && endpoint.parameters.query.length > 0;
          const hasParams = hasPathParams || hasQueryParams;
          
          if (!hasParams) {
            return { passed: true, score: 100 }; // No parameters to document
          }

          const allParamsHaveDescriptions = [
            ...(endpoint.parameters?.path || []),
            ...(endpoint.parameters?.query || [])
          ].every(param => param.description && param.description.trim().length > 0);

          return {
            passed: allParamsHaveDescriptions,
            score: allParamsHaveDescriptions ? 100 : 50,
            message: 'Some parameters are missing descriptions',
            suggestion: 'Add descriptions for all parameters explaining their purpose and format'
          };
        }
      },
      {
        name: 'has_error_responses',
        description: 'Endpoint should document error responses',
        severity: 'medium',
        enabled: true,
        weight: 0.1,
        validator: (endpoint) => {
          const hasErrorResponses = endpoint.responseSchema?.some(
            response => response.statusCode && response.statusCode >= 400
          ) || false;

          return {
            passed: hasErrorResponses,
            score: hasErrorResponses ? 100 : 0,
            message: 'Endpoint is missing error response documentation',
            suggestion: 'Document common error responses (400, 401, 404, 500) with examples'
          };
        }
      },
      {
        name: 'description_quality',
        description: 'Description should be clear and informative',
        severity: 'low',
        enabled: true,
        weight: 0.1,
        validator: (endpoint) => {
          if (!endpoint.description) {
            return { passed: false, score: 0 };
          }

          const description = endpoint.description.trim();
          const minLength = 10;
          const maxLength = 500;
          const hasGoodLength = description.length >= minLength && description.length <= maxLength;
          const hasActionWords = /\b(get|create|update|delete|fetch|retrieve|add|remove|list)\b/i.test(description);

          const score = hasGoodLength && hasActionWords ? 100 : 50;

          return {
            passed: score >= 75,
            score,
            message: 'Description could be more informative',
            suggestion: 'Use clear action words and provide sufficient detail about the endpoint\'s purpose'
          };
        }
      },
      {
        name: 'consistent_naming',
        description: 'Endpoint should follow consistent naming conventions',
        severity: 'low',
        enabled: true,
        weight: 0.05,
        validator: (endpoint) => {
          const path = endpoint.path;
          const hasConsistentCase = path === path.toLowerCase();
          const hasProperStructure = /^\/[a-z0-9\-_\/{}]*$/i.test(path);

          const passed = hasConsistentCase && hasProperStructure;

          return {
            passed,
            score: passed ? 100 : 75,
            message: 'Endpoint path should follow consistent naming conventions',
            suggestion: 'Use lowercase letters, hyphens, and underscores in API paths'
          };
        }
      }
    ];
  }

  /**
   * Initialize default validation thresholds
   */
  private initializeDefaultThresholds(): void {
    this.defaultThresholds = {
      minOverallScore: 70,
      minCompletenessScore: 60,
      minClarityScore: 60,
      minAccuracyScore: 70,
      minConsistencyScore: 50,
      minFormatScore: 80,
      requiredSections: ['description'],
      minDescriptionLength: 10,
      maxDescriptionLength: 500
    };
  }

  /**
   * Build validation context with defaults
   */
  private buildValidationContext(
    endpoint: Endpoint,
    context?: Partial<ValidationContext>
  ): ValidationContext {
    return {
      apiSpec: context?.apiSpec || [endpoint],
      validationLevel: context?.validationLevel || ValidationLevel.MODERATE,
      customRules: context?.customRules || [],
      thresholds: { ...this.defaultThresholds, ...context?.thresholds }
    };
  }

  /**
   * Run all validation rules against an endpoint
   */
  private runValidationRules(
    endpoint: Endpoint,
    context: ValidationContext
  ): Map<ValidationRule, ValidationRuleResult> {
    const results = new Map<ValidationRule, ValidationRuleResult>();
    const allRules = [...this.defaultRules, ...context.customRules];

    // Filter rules based on validation level
    const enabledRules = allRules.filter(rule => {
      if (!rule.enabled) return false;
      
      switch (context.validationLevel) {
        case ValidationLevel.STRICT:
          return true;
        case ValidationLevel.MODERATE:
          return rule.severity !== 'low';
        case ValidationLevel.LENIENT:
          return rule.severity === 'high' || rule.severity === 'critical';
        case ValidationLevel.DISABLED:
          return false;
        default:
          return true;
      }
    });

    // Run each rule
    enabledRules.forEach(rule => {
      try {
        const result = rule.validator(endpoint, context);
        results.set(rule, result);
      } catch (error) {
        this.logger.warn(`Validation rule '${rule.name}' failed to execute: ${error}`);
        results.set(rule, {
          passed: false,
          score: 0,
          message: `Rule execution failed: ${error}`,
          suggestion: 'Check the validation rule implementation'
        });
      }
    });

    return results;
  }

  /**
   * Build quality metrics from validation results
   */
  private buildQualityMetrics(
    endpoint: Endpoint,
    qualityScore: QualityScore,
    ruleResults: Map<ValidationRule, ValidationRuleResult>
  ): QualityMetrics {
    const completeness = this.checkCompleteness(endpoint);
    const format = this.validateFormat(endpoint);

    return {
      overallScore: qualityScore.overall,
      completeness: {
        score: completeness.score,
        missingFields: completeness.missingFields,
        hasDescription: completeness.hasDescription,
        hasExamples: completeness.hasExamples,
        hasErrorHandling: completeness.hasErrorHandling
      },
      clarity: {
        score: qualityScore.clarity,
        readabilityIndex: this.calculateReadabilityIndex(endpoint.description || ''),
        hasCodeExamples: !!(endpoint.requestSchema?.example || endpoint.responseSchema?.some(r => r.example)),
        usesConsistentTerminology: this.checkTerminologyConsistency(endpoint)
      },
      accuracy: {
        score: qualityScore.accuracy,
        schemaValidation: this.validateSchemaAccuracy(endpoint),
        exampleValidation: this.validateExampleAccuracy(endpoint),
        typeConsistency: this.checkTypeConsistency(endpoint)
      },
      lastUpdated: new Date(),
      validatedBy: 'ContentValidator'
    };
  }

  /**
   * Validate markdown format
   */
  private validateMarkdownFormat(text: string): boolean {
    if (!text) return true;

    // Check for basic markdown syntax issues
    const hasUnmatchedCodeBlocks = (text.match(/```/g) || []).length % 2 !== 0;
    const hasUnmatchedInlineCode = (text.match(/`/g) || []).length % 2 !== 0;
    
    return !hasUnmatchedCodeBlocks && !hasUnmatchedInlineCode;
  }

  /**
   * Validate code blocks in endpoint examples
   */
  private validateCodeBlocks(endpoint: Endpoint): boolean {
    const examples = [
      endpoint.requestSchema?.example,
      ...(endpoint.responseSchema?.map(r => r.example) || [])
    ].filter(Boolean);

    if (examples.length === 0) return true;

    // Check if examples are properly formatted JSON
    return examples.every(example => {
      if (typeof example === 'string') {
        try {
          JSON.parse(example);
          return true;
        } catch {
          return false;
        }
      }
      return true; // Non-string examples are considered valid
    });
  }

  /**
   * Check consistent formatting across endpoint
   */
  private checkConsistentFormatting(endpoint: Endpoint): boolean {
    // Check parameter naming consistency
    const allParams = [
      ...(endpoint.parameters?.path || []),
      ...(endpoint.parameters?.query || [])
    ];

    if (allParams.length === 0) return true;

    // Check if all parameter names follow the same case convention
    const hasConsistentCase = allParams.every(param => {
      const name = param.name;
      return name === name.toLowerCase() || name === name.toUpperCase();
    });

    return hasConsistentCase;
  }

  /**
   * Score clarity metrics
   */
  private scoreClarityMetrics(endpoint: Endpoint): number {
    let score = 100;

    if (!endpoint.description) return 0;

    const description = endpoint.description.trim();
    
    // Check description length
    if (description.length < 10) score -= 30;
    if (description.length > 500) score -= 20;

    // Check for action words
    const hasActionWords = /\b(get|create|update|delete|fetch|retrieve|add|remove|list|search|filter)\b/i.test(description);
    if (!hasActionWords) score -= 20;

    // Check for technical jargon without explanation
    const hasUnexplainedJargon = /\b(API|REST|HTTP|JSON|XML|CRUD)\b/.test(description) && 
                                description.length < 50;
    if (hasUnexplainedJargon) score -= 15;

    return Math.max(0, score);
  }

  /**
   * Score accuracy metrics
   */
  private scoreAccuracyMetrics(endpoint: Endpoint): number {
    let score = 100;

    // Check if HTTP method matches typical CRUD operations
    const methodPathConsistency = this.checkMethodPathConsistency(endpoint);
    if (!methodPathConsistency) score -= 20;

    // Check if response schemas are realistic
    const hasRealisticResponses = this.checkRealisticResponses(endpoint);
    if (!hasRealisticResponses) score -= 15;

    // Check parameter types
    const hasValidParameterTypes = this.checkParameterTypes(endpoint);
    if (!hasValidParameterTypes) score -= 15;

    return Math.max(0, score);
  }

  /**
   * Score consistency metrics
   */
  private scoreConsistencyMetrics(endpoint: Endpoint, apiSpec?: ApiSpec): number {
    if (!apiSpec || apiSpec.length <= 1) return 100;

    let score = 100;

    // Check naming consistency across endpoints
    const namingConsistency = this.checkNamingConsistency(endpoint, apiSpec);
    if (!namingConsistency) score -= 25;

    // Check response format consistency
    const responseConsistency = this.checkResponseConsistency(endpoint, apiSpec);
    if (!responseConsistency) score -= 25;

    return Math.max(0, score);
  }

  /**
   * Calculate readability index for text
   */
  private calculateReadabilityIndex(text: string): number {
    if (!text) return 0;

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);

    if (sentences.length === 0 || words.length === 0) return 0;

    // Simplified Flesch Reading Ease formula
    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;
    
    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    
    // Convert to 0-100 scale where higher is better
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Count syllables in a word (simplified)
   */
  private countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    
    const vowels = word.match(/[aeiouy]+/g);
    let count = vowels ? vowels.length : 1;
    
    if (word.endsWith('e')) count--;
    if (word.endsWith('le') && word.length > 2) count++;
    
    return Math.max(1, count);
  }

  /**
   * Check terminology consistency
   */
  private checkTerminologyConsistency(endpoint: Endpoint): boolean {
    if (!endpoint.description) return true;

    // Check for consistent use of technical terms
    const description = endpoint.description.toLowerCase();
    const inconsistentTerms = [
      ['id', 'identifier'],
      ['user', 'account'],
      ['delete', 'remove'],
      ['create', 'add']
    ];

    return !inconsistentTerms.some(([term1, term2]) => 
      description.includes(term1) && description.includes(term2)
    );
  }

  /**
   * Validate schema accuracy
   */
  private validateSchemaAccuracy(endpoint: Endpoint): boolean {
    // Check if request and response schemas are properly defined
    const hasValidRequestSchema = !endpoint.requestSchema || 
      (endpoint.requestSchema.schema || endpoint.requestSchema.example);
    
    const hasValidResponseSchema = !endpoint.responseSchema || 
      endpoint.responseSchema.every(response => response.schema || response.example);

    return hasValidRequestSchema && hasValidResponseSchema;
  }

  /**
   * Validate example accuracy
   */
  private validateExampleAccuracy(endpoint: Endpoint): boolean {
    // Check if examples match their schemas (basic validation)
    if (endpoint.requestSchema?.example && endpoint.requestSchema?.schema) {
      // Basic type checking would go here
    }

    if (endpoint.responseSchema) {
      return endpoint.responseSchema.every(response => {
        if (response.example && response.schema) {
          // Basic type checking would go here
        }
        return true;
      });
    }

    return true;
  }

  /**
   * Check type consistency
   */
  private checkTypeConsistency(endpoint: Endpoint): boolean {
    // Check if parameter types are consistent and valid
    const allParams = [
      ...(endpoint.parameters?.path || []),
      ...(endpoint.parameters?.query || [])
    ];

    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    
    return allParams.every(param => 
      !param.type || validTypes.includes(param.type.toLowerCase())
    );
  }

  /**
   * Check method-path consistency
   */
  private checkMethodPathConsistency(endpoint: Endpoint): boolean {
    const method = endpoint.method.toLowerCase();
    const path = endpoint.path.toLowerCase();

    // Basic CRUD consistency checks
    if (method === 'get' && path.includes('create')) return false;
    if (method === 'post' && path.includes('delete')) return false;
    if (method === 'delete' && path.includes('create')) return false;

    return true;
  }

  /**
   * Check realistic responses
   */
  private checkRealisticResponses(endpoint: Endpoint): boolean {
    if (!endpoint.responseSchema) return true;

    return endpoint.responseSchema.every(response => {
      // Check if status codes are realistic
      if (response.statusCode) {
        return response.statusCode >= 100 && response.statusCode < 600;
      }
      return true;
    });
  }

  /**
   * Check parameter types
   */
  private checkParameterTypes(endpoint: Endpoint): boolean {
    const allParams = [
      ...(endpoint.parameters?.path || []),
      ...(endpoint.parameters?.query || [])
    ];

    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    
    return allParams.every(param => 
      !param.type || validTypes.includes(param.type.toLowerCase())
    );
  }

  /**
   * Check naming consistency across API
   */
  private checkNamingConsistency(endpoint: Endpoint, apiSpec: ApiSpec): boolean {
    // Check if this endpoint follows the same naming patterns as others
    const otherEndpoints = apiSpec.filter(e => e.path !== endpoint.path);
    
    if (otherEndpoints.length === 0) return true;

    // Check path segment consistency
    const thisSegments = endpoint.path.split('/').filter(s => s.length > 0);
    const otherSegments = otherEndpoints.flatMap(e => 
      e.path.split('/').filter(s => s.length > 0)
    );

    // Basic check for consistent casing
    const thisCase = thisSegments.every(s => s === s.toLowerCase());
    const otherCase = otherSegments.every(s => s === s.toLowerCase());

    return thisCase === otherCase;
  }

  /**
   * Check response format consistency
   */
  private checkResponseConsistency(endpoint: Endpoint, apiSpec: ApiSpec): boolean {
    // Check if response formats are consistent across similar endpoints
    const otherEndpoints = apiSpec.filter(e => 
      e.path !== endpoint.path && e.method === endpoint.method
    );

    if (otherEndpoints.length === 0) return true;

    // Basic consistency check for content types
    const thisContentTypes = endpoint.responseSchema?.map(r => r.contentType).filter(Boolean) || [];
    const otherContentTypes = otherEndpoints.flatMap(e => 
      e.responseSchema?.map(r => r.contentType).filter(Boolean) || []
    );

    if (thisContentTypes.length === 0 || otherContentTypes.length === 0) return true;

    // Check if at least one content type is shared
    return thisContentTypes.some(ct => otherContentTypes.includes(ct));
  }
}