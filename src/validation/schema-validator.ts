import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { Endpoint, ValidationLevel } from '../models/types.js';
import { Logger } from '../utils/logger.js';

/**
 * Result of schema validation operations
 */
export interface SchemaValidationResult {
  isValid: boolean;
  errors: Array<{
    path: string;
    message: string;
    value?: any;
    schema?: any;
  }>;
  warnings: string[];
  normalizedSchema?: any;
  inferredTypes?: Record<string, string>;
  compatibility?: {
    openapi: boolean;
    graphql: boolean;
    jsonSchema: boolean;
  };
}

/**
 * Options for schema inference from sample data
 */
export interface SchemaInferenceOptions {
  strictTypes: boolean;
  includeExamples: boolean;
  inferRequired: boolean;
  maxDepth: number;
  arrayItemLimit: number;
  stringFormats: boolean;
  customPatterns: Record<string, RegExp>;
  validationLevel: ValidationLevel;
}

/**
 * Pattern definitions for schema validation
 */
export interface SchemaPattern {
  name: string;
  pattern: RegExp | string;
  type: 'string' | 'number' | 'object' | 'array' | 'boolean';
  format?: string;
  description?: string;
  examples?: any[];
}

/**
 * Schema compatibility information
 */
interface SchemaCompatibility {
  openapi: {
    version: string;
    compatible: boolean;
    issues: string[];
  };
  graphql: {
    compatible: boolean;
    issues: string[];
  };
  jsonSchema: {
    version: string;
    compatible: boolean;
    issues: string[];
  };
}

/**
 * Schema validator for API endpoints with comprehensive validation capabilities
 */
export class SchemaValidator {
  private ajv: Ajv;
  private logger: Logger;
  private customPatterns: Map<string, SchemaPattern>;
  private validationCache: Map<string, SchemaValidationResult>;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger();
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      removeAdditional: false,
      useDefaults: true,
      coerceTypes: true,
    });
    
    // Add format validation
    addFormats(this.ajv);
    
    this.customPatterns = new Map();
    this.validationCache = new Map();
    
    this.initializeCustomPatterns();
    this.addCustomFormats();
  }

  /**
   * Validate the complete schema of an endpoint
   */
  async validateEndpointSchema(endpoint: Endpoint, options?: Partial<SchemaInferenceOptions>): Promise<SchemaValidationResult> {
    const cacheKey = this.generateCacheKey(endpoint, options);
    
    if (this.validationCache.has(cacheKey)) {
      this.logger.debug(`Using cached validation result for ${endpoint.method} ${endpoint.path}`);
      return this.validationCache.get(cacheKey)!;
    }

    this.logger.debug(`Validating endpoint schema: ${endpoint.method} ${endpoint.path}`);

    const result: SchemaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      compatibility: {
        openapi: true,
        graphql: true,
        jsonSchema: true,
      },
    };

    try {
      // Validate request schema
      if (endpoint.requestSchema?.schema) {
        const requestResult = await this.validateRequestSchema(
          endpoint.requestSchema.schema,
          endpoint.requestSchema.example,
          options
        );
        this.mergeValidationResults(result, requestResult, 'request');
      }

      // Validate response schemas
      if (endpoint.responseSchema && endpoint.responseSchema.length > 0) {
        for (const response of endpoint.responseSchema) {
          if (response.schema) {
            const responseResult = await this.validateResponseSchema(
              response.schema,
              response.example,
              response.statusCode,
              options
            );
            this.mergeValidationResults(result, responseResult, `response.${response.statusCode}`);
          }
        }
      }

      // Validate parameter schemas
      if (endpoint.parameters) {
        const paramResult = this.validateParameterSchemas(endpoint.parameters);
        this.mergeValidationResults(result, paramResult, 'parameters');
      }

      // Check schema compatibility
      result.compatibility = this.checkSchemaCompatibility(endpoint);

      // Cache the result
      this.validationCache.set(cacheKey, result);

      if (result.isValid) {
        this.logger.debug(`Schema validation passed for ${endpoint.method} ${endpoint.path}`);
      } else {
        this.logger.warn(`Schema validation failed for ${endpoint.method} ${endpoint.path}: ${result.errors.length} errors`);
      }

    } catch (error) {
      this.logger.error(`Error during schema validation for ${endpoint.method} ${endpoint.path}`, error as Error);
      result.isValid = false;
      result.errors.push({
        path: 'root',
        message: `Validation error: ${(error as Error).message}`,
      });
    }

    return result;
  }

  /**
   * Validate request schema
   */
  async validateRequestSchema(
    schema: any,
    example?: any,
    options?: Partial<SchemaInferenceOptions>
  ): Promise<SchemaValidationResult> {
    this.logger.debug('Validating request schema');

    const result: SchemaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Normalize the schema
      const normalizedSchema = this.normalizeSchema(schema);
      result.normalizedSchema = normalizedSchema;

      // Validate schema structure
      const structureValidation = this.validateSchemaStructure(normalizedSchema);
      if (!structureValidation.isValid) {
        result.isValid = false;
        result.errors.push(...structureValidation.errors);
      }

      // Validate example against schema if provided
      if (example && normalizedSchema) {
        const exampleValidation = this.validateDataAgainstSchema(example, normalizedSchema);
        if (!exampleValidation.isValid) {
          result.warnings.push('Request example does not match schema');
          result.errors.push(...exampleValidation.errors.map(err => ({
            ...err,
            path: `example.${err.path}`,
          })));
        }
      }

      // Infer types if no schema provided but example exists
      if (!schema && example) {
        const inferenceOptions = this.getDefaultInferenceOptions(options);
        const inferredSchema = this.inferSchemaFromData(example, inferenceOptions);
        result.normalizedSchema = inferredSchema;
        result.inferredTypes = this.extractTypeInformation(inferredSchema);
        result.warnings.push('Schema inferred from example data');
      }

    } catch (error) {
      this.logger.error('Error validating request schema', error as Error);
      result.isValid = false;
      result.errors.push({
        path: 'request',
        message: `Request schema validation error: ${(error as Error).message}`,
      });
    }

    return result;
  }

  /**
   * Validate response schema
   */
  async validateResponseSchema(
    schema: any,
    example?: any,
    statusCode?: number,
    options?: Partial<SchemaInferenceOptions>
  ): Promise<SchemaValidationResult> {
    this.logger.debug(`Validating response schema for status ${statusCode || 'unknown'}`);

    const result: SchemaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Normalize the schema
      const normalizedSchema = this.normalizeSchema(schema);
      result.normalizedSchema = normalizedSchema;

      // Validate schema structure
      const structureValidation = this.validateSchemaStructure(normalizedSchema);
      if (!structureValidation.isValid) {
        result.isValid = false;
        result.errors.push(...structureValidation.errors);
      }

      // Validate status code appropriateness
      if (statusCode) {
        const statusValidation = this.validateStatusCodeSchema(statusCode, normalizedSchema);
        if (!statusValidation.isValid) {
          result.warnings.push(...statusValidation.warnings);
        }
      }

      // Validate example against schema if provided
      if (example && normalizedSchema) {
        const exampleValidation = this.validateDataAgainstSchema(example, normalizedSchema);
        if (!exampleValidation.isValid) {
          result.warnings.push('Response example does not match schema');
          result.errors.push(...exampleValidation.errors.map(err => ({
            ...err,
            path: `example.${err.path}`,
          })));
        }
      }

      // Infer types if no schema provided but example exists
      if (!schema && example) {
        const inferenceOptions = this.getDefaultInferenceOptions(options);
        const inferredSchema = this.inferSchemaFromData(example, inferenceOptions);
        result.normalizedSchema = inferredSchema;
        result.inferredTypes = this.extractTypeInformation(inferredSchema);
        result.warnings.push('Schema inferred from example data');
      }

    } catch (error) {
      this.logger.error(`Error validating response schema for status ${statusCode}`, error as Error);
      result.isValid = false;
      result.errors.push({
        path: 'response',
        message: `Response schema validation error: ${(error as Error).message}`,
      });
    }

    return result;
  }

  /**
   * Infer schema from sample data
   */
  inferSchemaFromData(data: any, options: SchemaInferenceOptions): any {
    this.logger.debug('Inferring schema from data');

    if (data === null || data === undefined) {
      return { type: 'null' };
    }

    const type = Array.isArray(data) ? 'array' : typeof data;

    switch (type) {
      case 'string':
        return this.inferStringSchema(data, options);
      case 'number':
        return this.inferNumberSchema(data, options);
      case 'boolean':
        return { type: 'boolean', example: data };
      case 'array':
        return this.inferArraySchema(data, options);
      case 'object':
        return this.inferObjectSchema(data, options);
      default:
        return { type: 'string' };
    }
  }

  /**
   * Normalize schema to standard JSON Schema format
   */
  normalizeSchema(schema: any): any {
    if (!schema) {
      return null;
    }

    // If it's already a valid JSON Schema, return as-is
    if (schema.type || schema.$ref || schema.allOf || schema.oneOf || schema.anyOf) {
      return this.normalizeJsonSchema(schema);
    }

    // If it's an OpenAPI schema, convert it
    if (schema.openapi || schema.swagger) {
      return this.normalizeOpenApiSchema(schema);
    }

    // If it's a GraphQL type definition, convert it
    if (typeof schema === 'string' && schema.includes('type ')) {
      return this.normalizeGraphQLSchema(schema);
    }

    // If it's sample data, infer schema
    const inferenceOptions = this.getDefaultInferenceOptions();
    return this.inferSchemaFromData(schema, inferenceOptions);
  }

  /**
   * Validate parameter schemas
   */
  private validateParameterSchemas(parameters: Endpoint['parameters']): SchemaValidationResult {
    const result: SchemaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (parameters?.path) {
      for (const param of parameters.path) {
        if (!this.isValidParameterType(param.type)) {
          result.isValid = false;
          result.errors.push({
            path: `parameters.path.${param.name}`,
            message: `Invalid parameter type: ${param.type}`,
          });
        }
      }
    }

    if (parameters?.query) {
      for (const param of parameters.query) {
        if (!this.isValidParameterType(param.type)) {
          result.isValid = false;
          result.errors.push({
            path: `parameters.query.${param.name}`,
            message: `Invalid parameter type: ${param.type}`,
          });
        }
      }
    }

    return result;
  }

  /**
   * Check schema compatibility with different standards
   */
  private checkSchemaCompatibility(endpoint: Endpoint): SchemaCompatibility {
    const compatibility: SchemaCompatibility = {
      openapi: {
        version: '3.0.0',
        compatible: true,
        issues: [],
      },
      graphql: {
        compatible: true,
        issues: [],
      },
      jsonSchema: {
        version: 'draft-07',
        compatible: true,
        issues: [],
      },
    };

    // Check OpenAPI compatibility
    if (endpoint.requestSchema?.schema) {
      const openApiIssues = this.checkOpenApiCompatibility(endpoint.requestSchema.schema);
      compatibility.openapi.issues.push(...openApiIssues);
      compatibility.openapi.compatible = openApiIssues.length === 0;
    }

    // Check GraphQL compatibility
    if (endpoint.responseSchema) {
      for (const response of endpoint.responseSchema) {
        if (response.schema) {
          const graphqlIssues = this.checkGraphQLCompatibility(response.schema);
          compatibility.graphql.issues.push(...graphqlIssues);
          compatibility.graphql.compatible = graphqlIssues.length === 0;
        }
      }
    }

    return compatibility;
  }

  /**
   * Validate schema structure
   */
  private validateSchemaStructure(schema: any): SchemaValidationResult {
    const result: SchemaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!schema) {
      return result;
    }

    try {
      // Use AJV to validate the schema itself
      const validate = this.ajv.compile(schema);
      
      // Check for common schema issues
      if (schema.type === 'object' && !schema.properties && !schema.additionalProperties) {
        result.warnings.push('Object schema without properties or additionalProperties');
      }

      if (schema.type === 'array' && !schema.items) {
        result.warnings.push('Array schema without items definition');
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push({
        path: 'schema',
        message: `Invalid schema structure: ${(error as Error).message}`,
      });
    }

    return result;
  }

  /**
   * Validate data against schema using AJV
   */
  private validateDataAgainstSchema(data: any, schema: any): SchemaValidationResult {
    const result: SchemaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      const validate = this.ajv.compile(schema);
      const isValid = validate(data);

      if (!isValid && validate.errors) {
        result.isValid = false;
        result.errors = validate.errors.map(error => ({
          path: error.instancePath || 'root',
          message: error.message || 'Validation error',
          value: error.data,
          schema: error.schema,
        }));
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push({
        path: 'validation',
        message: `Data validation error: ${(error as Error).message}`,
      });
    }

    return result;
  }

  /**
   * Validate status code appropriateness
   */
  private validateStatusCodeSchema(statusCode: number, schema: any): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check if error status codes have appropriate error schemas
    if (statusCode >= 400 && statusCode < 600) {
      if (schema && schema.type === 'object' && !schema.properties?.error && !schema.properties?.message) {
        warnings.push(`Error status ${statusCode} should typically include error information in schema`);
      }
    }

    // Check if success status codes have appropriate success schemas
    if (statusCode >= 200 && statusCode < 300) {
      if (statusCode === 204 && schema) {
        warnings.push('Status 204 (No Content) should not have a response body schema');
      }
    }

    return { isValid: true, warnings };
  }

  /**
   * Infer string schema with format detection
   */
  private inferStringSchema(value: string, options: SchemaInferenceOptions): any {
    const schema: any = { type: 'string' };

    if (options.includeExamples) {
      schema.example = value;
    }

    if (options.stringFormats) {
      // Detect common string formats
      if (/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value)) {
        schema.format = 'email';
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        schema.format = 'date-time';
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        schema.format = 'date';
      } else if (/^https?:\/\//.test(value)) {
        schema.format = 'uri';
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        schema.format = 'uuid';
      }

      // Check custom patterns
      for (const [name, pattern] of this.customPatterns) {
        if (pattern.type === 'string' && new RegExp(pattern.pattern).test(value)) {
          schema.pattern = pattern.pattern;
          schema.description = pattern.description;
          break;
        }
      }
    }

    return schema;
  }

  /**
   * Infer number schema
   */
  private inferNumberSchema(value: number, options: SchemaInferenceOptions): any {
    const schema: any = {
      type: Number.isInteger(value) ? 'integer' : 'number',
    };

    if (options.includeExamples) {
      schema.example = value;
    }

    return schema;
  }

  /**
   * Infer array schema
   */
  private inferArraySchema(value: any[], options: SchemaInferenceOptions): any {
    const schema: any = { type: 'array' };

    if (value.length > 0) {
      const itemsToAnalyze = value.slice(0, options.arrayItemLimit);
      const itemSchemas = itemsToAnalyze.map(item => 
        this.inferSchemaFromData(item, { ...options, maxDepth: options.maxDepth - 1 })
      );

      // If all items have the same type, use that type
      const uniqueTypes = [...new Set(itemSchemas.map(s => s.type))];
      if (uniqueTypes.length === 1) {
        schema.items = itemSchemas[0];
      } else {
        schema.items = { oneOf: itemSchemas };
      }
    }

    if (options.includeExamples) {
      schema.example = value;
    }

    return schema;
  }

  /**
   * Infer object schema
   */
  private inferObjectSchema(value: Record<string, any>, options: SchemaInferenceOptions): any {
    if (options.maxDepth <= 0) {
      return { type: 'object' };
    }

    const schema: any = {
      type: 'object',
      properties: {},
    };

    if (options.inferRequired) {
      schema.required = Object.keys(value);
    }

    for (const [key, val] of Object.entries(value)) {
      schema.properties[key] = this.inferSchemaFromData(val, {
        ...options,
        maxDepth: options.maxDepth - 1,
      });
    }

    if (options.includeExamples) {
      schema.example = value;
    }

    return schema;
  }

  /**
   * Normalize JSON Schema
   */
  private normalizeJsonSchema(schema: any): any {
    // Already in JSON Schema format, just clean up
    const normalized = { ...schema };

    // Ensure proper type definitions
    if (!normalized.type && !normalized.$ref && !normalized.allOf && !normalized.oneOf && !normalized.anyOf) {
      normalized.type = 'object';
    }

    return normalized;
  }

  /**
   * Normalize OpenAPI schema
   */
  private normalizeOpenApiSchema(schema: any): any {
    // Convert OpenAPI schema to JSON Schema
    const normalized: any = {};

    if (schema.type) {
      normalized.type = schema.type;
    }

    if (schema.properties) {
      normalized.properties = schema.properties;
    }

    if (schema.required) {
      normalized.required = schema.required;
    }

    if (schema.items) {
      normalized.items = schema.items;
    }

    return normalized;
  }

  /**
   * Normalize GraphQL schema
   */
  private normalizeGraphQLSchema(schema: string): any {
    // Basic GraphQL to JSON Schema conversion
    // This is a simplified implementation
    const normalized: any = { type: 'object', properties: {} };

    // Parse basic GraphQL type definitions
    const typeMatch = schema.match(/type\s+(\w+)\s*{([^}]+)}/);
    if (typeMatch) {
      const fields = typeMatch[2].trim().split('\n');
      for (const field of fields) {
        const fieldMatch = field.trim().match(/(\w+):\s*(\w+)/);
        if (fieldMatch) {
          const [, fieldName, fieldType] = fieldMatch;
          normalized.properties[fieldName] = this.graphqlTypeToJsonSchema(fieldType);
        }
      }
    }

    return normalized;
  }

  /**
   * Convert GraphQL type to JSON Schema type
   */
  private graphqlTypeToJsonSchema(graphqlType: string): any {
    const type = graphqlType.replace(/[!\[\]]/g, '');
    
    switch (type) {
      case 'String':
        return { type: 'string' };
      case 'Int':
        return { type: 'integer' };
      case 'Float':
        return { type: 'number' };
      case 'Boolean':
        return { type: 'boolean' };
      case 'ID':
        return { type: 'string', format: 'uuid' };
      default:
        return { type: 'object' };
    }
  }

  /**
   * Check OpenAPI compatibility
   */
  private checkOpenApiCompatibility(schema: any): string[] {
    const issues: string[] = [];

    if (schema.type === 'object' && schema.additionalProperties === undefined) {
      issues.push('OpenAPI recommends explicitly setting additionalProperties');
    }

    return issues;
  }

  /**
   * Check GraphQL compatibility
   */
  private checkGraphQLCompatibility(schema: any): string[] {
    const issues: string[] = [];

    if (schema.type === 'object' && !schema.properties) {
      issues.push('GraphQL types require field definitions');
    }

    return issues;
  }

  /**
   * Check if parameter type is valid
   */
  private isValidParameterType(type: string): boolean {
    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    return validTypes.includes(type);
  }

  /**
   * Extract type information from schema
   */
  private extractTypeInformation(schema: any): Record<string, string> {
    const types: Record<string, string> = {};

    if (schema.type) {
      types.root = schema.type;
    }

    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        const prop = value as any;
        types[key] = prop.type || 'unknown';
      }
    }

    return types;
  }

  /**
   * Get default inference options
   */
  private getDefaultInferenceOptions(options?: Partial<SchemaInferenceOptions>): SchemaInferenceOptions {
    return {
      strictTypes: true,
      includeExamples: true,
      inferRequired: true,
      maxDepth: 5,
      arrayItemLimit: 10,
      stringFormats: true,
      customPatterns: {},
      validationLevel: ValidationLevel.MODERATE,
      ...options,
    };
  }

  /**
   * Merge validation results
   */
  private mergeValidationResults(
    target: SchemaValidationResult,
    source: SchemaValidationResult,
    prefix: string
  ): void {
    if (!source.isValid) {
      target.isValid = false;
    }

    target.errors.push(...source.errors.map(error => ({
      ...error,
      path: `${prefix}.${error.path}`,
    })));

    target.warnings.push(...source.warnings.map(warning => `${prefix}: ${warning}`));
  }

  /**
   * Generate cache key for validation results
   */
  private generateCacheKey(endpoint: Endpoint, options?: Partial<SchemaInferenceOptions>): string {
    const key = `${endpoint.method}:${endpoint.path}:${JSON.stringify(options || {})}`;
    return Buffer.from(key).toString('base64');
  }

  /**
   * Initialize custom patterns
   */
  private initializeCustomPatterns(): void {
    const patterns: SchemaPattern[] = [
      {
        name: 'apiKey',
        pattern: /^[a-zA-Z0-9_-]{20,}$/,
        type: 'string',
        description: 'API key pattern',
      },
      {
        name: 'phoneNumber',
        pattern: /^\+?[\d\s\-\(\)]{10,}$/,
        type: 'string',
        format: 'phone',
        description: 'Phone number pattern',
      },
      {
        name: 'creditCard',
        pattern: /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/,
        type: 'string',
        description: 'Credit card number pattern',
      },
    ];

    for (const pattern of patterns) {
      this.customPatterns.set(pattern.name, pattern);
    }
  }

  /**
   * Add custom formats to AJV
   */
  private addCustomFormats(): void {
    this.ajv.addFormat('phone', /^\+?[\d\s\-\(\)]{10,}$/);
    this.ajv.addFormat('creditCard', /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/);
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear();
    this.logger.debug('Schema validation cache cleared');
  }

  /**
   * Add custom pattern
   */
  addCustomPattern(pattern: SchemaPattern): void {
    this.customPatterns.set(pattern.name, pattern);
    this.logger.debug(`Added custom pattern: ${pattern.name}`);
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    cacheSize: number;
    customPatterns: number;
    totalValidations: number;
  } {
    return {
      cacheSize: this.validationCache.size,
      customPatterns: this.customPatterns.size,
      totalValidations: this.validationCache.size,
    };
  }
}