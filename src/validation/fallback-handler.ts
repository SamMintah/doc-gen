import { Endpoint, ApiSpec, HttpMethod, PrivacyLevel, ValidationLevel } from '../models/types.js';
import { Logger } from '../utils/logger.js';

/**
 * Interface for fallback template definitions
 */
export interface FallbackTemplate {
  id: string;
  name: string;
  description: string;
  httpMethods: HttpMethod[];
  pathPatterns: RegExp[];
  tags?: string[];
  template: {
    title: string;
    description: string;
    parameters?: {
      path?: string;
      query?: string;
      body?: string;
    };
    responses?: {
      success: string;
      error: string;
    };
    examples?: {
      request?: string;
      response?: string;
    };
    notes?: string[];
  };
  quality: {
    completeness: number; // 0-100
    accuracy: number; // 0-100
    usability: number; // 0-100
  };
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    version: string;
    author?: string;
  };
}

/**
 * Interface for template selection criteria
 */
export interface TemplateSelector {
  httpMethod?: HttpMethod;
  pathPattern?: string;
  tags?: string[];
  hasAuth?: boolean;
  hasRequestBody?: boolean;
  hasFileUpload?: boolean;
  isDeprecated?: boolean;
  priority?: number; // Higher number = higher priority
}

/**
 * Interface for fallback configuration options
 */
export interface FallbackOptions {
  enableTemplates: boolean;
  enableBasicFallback: boolean;
  templateDirectory?: string;
  customTemplates?: FallbackTemplate[];
  qualityThreshold: number; // Minimum quality score to use template
  progressiveFallback: boolean; // Enable AI → template → basic progression
  includeMetadata: boolean;
  privacyLevel: PrivacyLevel;
  validationLevel: ValidationLevel;
  maxTemplateAge?: number; // Maximum age in days for templates
}

/**
 * Enum for fallback strategies
 */
export enum FallbackStrategy {
  AI_ONLY = 'ai_only',
  TEMPLATE_PREFERRED = 'template_preferred',
  BASIC_FALLBACK = 'basic_fallback',
  PROGRESSIVE = 'progressive'
}

/**
 * Interface for fallback result
 */
export interface FallbackResult {
  endpoint: Endpoint;
  strategy: FallbackStrategy;
  template?: FallbackTemplate;
  quality: {
    score: number;
    confidence: number;
    completeness: number;
  };
  metadata: {
    generatedAt: Date;
    fallbackReason: string;
    templateUsed?: string;
    manualRefinementNeeded: boolean;
  };
}

/**
 * Fallback handler for generating documentation when AI services are unavailable
 */
export class FallbackHandler {
  private logger: Logger;
  private templates: Map<string, FallbackTemplate>;
  private options: FallbackOptions;

  constructor(options: FallbackOptions, logger?: Logger) {
    this.logger = logger || new Logger();
    this.options = options;
    this.templates = new Map();
    this.initializeDefaultTemplates();
    
    if (options.customTemplates) {
      this.loadCustomTemplates(options.customTemplates);
    }
  }

  /**
   * Generate fallback documentation for an endpoint
   */
  public async generateFallbackDocumentation(
    endpoint: Endpoint,
    aiError?: Error
  ): Promise<FallbackResult> {
    this.logger.debug(`Generating fallback documentation for ${endpoint.method} ${endpoint.path}`);

    const fallbackReason = aiError ? `AI service error: ${aiError.message}` : 'AI service unavailable';
    
    if (this.options.progressiveFallback) {
      return this.executeProgressiveFallback(endpoint, fallbackReason);
    }

    if (this.options.enableTemplates) {
      const template = this.getTemplateForEndpoint(endpoint);
      if (template && this.isTemplateQualityAcceptable(template)) {
        return this.generateFromTemplate(endpoint, template, fallbackReason);
      }
    }

    if (this.options.enableBasicFallback) {
      return this.generateBasicFallback(endpoint, fallbackReason);
    }

    throw new Error('No fallback strategy available');
  }

  /**
   * Get the most appropriate template for an endpoint
   */
  public getTemplateForEndpoint(endpoint: Endpoint): FallbackTemplate | null {
    const candidates: Array<{ template: FallbackTemplate; score: number }> = [];

    for (const template of this.templates.values()) {
      const score = this.calculateTemplateScore(endpoint, template);
      if (score > 0) {
        candidates.push({ template, score });
      }
    }

    if (candidates.length === 0) {
      this.logger.debug(`No suitable template found for ${endpoint.method} ${endpoint.path}`);
      return null;
    }

    // Sort by score (descending) and return the best match
    candidates.sort((a, b) => b.score - a.score);
    const bestMatch = candidates[0];

    this.logger.debug(
      `Selected template '${bestMatch.template.name}' with score ${bestMatch.score} for ${endpoint.method} ${endpoint.path}`
    );

    return bestMatch.template;
  }

  /**
   * Create a basic description for an endpoint without templates
   */
  public createBasicDescription(endpoint: Endpoint): string {
    const method = endpoint.method.toUpperCase();
    const path = endpoint.path;
    
    // Extract resource name from path
    const pathSegments = path.split('/').filter(segment => segment && !segment.startsWith(':'));
    const resource = pathSegments[pathSegments.length - 1] || 'resource';
    
    // Generate basic description based on HTTP method
    let description = '';
    switch (endpoint.method) {
      case HttpMethod.GET:
        if (path.includes(':id') || path.includes('{id}')) {
          description = `Retrieve a specific ${resource} by ID`;
        } else {
          description = `Retrieve a list of ${resource}s`;
        }
        break;
      case HttpMethod.POST:
        description = `Create a new ${resource}`;
        break;
      case HttpMethod.PUT:
        description = `Update an existing ${resource}`;
        break;
      case HttpMethod.PATCH:
        description = `Partially update an existing ${resource}`;
        break;
      case HttpMethod.DELETE:
        description = `Delete a ${resource}`;
        break;
      case HttpMethod.HEAD:
        description = `Check if ${resource} exists`;
        break;
      case HttpMethod.OPTIONS:
        description = `Get available options for ${resource}`;
        break;
      default:
        description = `Perform ${method} operation on ${resource}`;
    }

    return description;
  }

  /**
   * Handle AI service failure and determine fallback strategy
   */
  public async handleAIServiceFailure(
    endpoints: Endpoint[],
    error: Error
  ): Promise<FallbackResult[]> {
    this.logger.warn(`AI service failure detected: ${error.message}`);
    this.logger.info(`Falling back to alternative documentation generation for ${endpoints.length} endpoints`);

    const results: FallbackResult[] = [];
    
    for (const endpoint of endpoints) {
      try {
        const result = await this.generateFallbackDocumentation(endpoint, error);
        results.push(result);
      } catch (fallbackError) {
        this.logger.error(
          `Failed to generate fallback documentation for ${endpoint.method} ${endpoint.path}`,
          fallbackError as Error
        );
        
        // Create minimal fallback result
        results.push({
          endpoint: {
            ...endpoint,
            description: this.createBasicDescription(endpoint),
            metadata: {
              ...endpoint.metadata,
              aiGenerated: false,
              fallbackUsed: true,
              confidence: 0.3
            }
          },
          strategy: FallbackStrategy.BASIC_FALLBACK,
          quality: {
            score: 30,
            confidence: 0.3,
            completeness: 0.4
          },
          metadata: {
            generatedAt: new Date(),
            fallbackReason: `Fallback generation failed: ${(fallbackError as Error).message}`,
            manualRefinementNeeded: true
          }
        });
      }
    }

    return results;
  }

  /**
   * Execute progressive fallback strategy
   */
  private async executeProgressiveFallback(
    endpoint: Endpoint,
    fallbackReason: string
  ): Promise<FallbackResult> {
    // Try template-based fallback first
    if (this.options.enableTemplates) {
      const template = this.getTemplateForEndpoint(endpoint);
      if (template && this.isTemplateQualityAcceptable(template)) {
        this.logger.debug(`Using template fallback for ${endpoint.method} ${endpoint.path}`);
        return this.generateFromTemplate(endpoint, template, fallbackReason);
      }
    }

    // Fall back to basic generation
    if (this.options.enableBasicFallback) {
      this.logger.debug(`Using basic fallback for ${endpoint.method} ${endpoint.path}`);
      return this.generateBasicFallback(endpoint, fallbackReason);
    }

    throw new Error('No fallback strategy succeeded');
  }

  /**
   * Generate documentation from a template
   */
  private generateFromTemplate(
    endpoint: Endpoint,
    template: FallbackTemplate,
    fallbackReason: string
  ): FallbackResult {
    const description = this.populateTemplate(endpoint, template);
    
    const enhancedEndpoint: Endpoint = {
      ...endpoint,
      description,
      metadata: {
        ...endpoint.metadata,
        aiGenerated: false,
        fallbackUsed: true,
        confidence: template.quality.accuracy / 100
      },
      quality: {
        overallScore: template.quality.completeness,
        completeness: {
          score: template.quality.completeness,
          missingFields: [],
          hasDescription: true,
          hasExamples: !!template.template.examples,
          hasErrorHandling: !!template.template.responses?.error
        },
        clarity: {
          score: template.quality.usability,
          readabilityIndex: 0.7,
          hasCodeExamples: !!template.template.examples,
          usesConsistentTerminology: true
        },
        accuracy: {
          score: template.quality.accuracy,
          schemaValidation: false,
          exampleValidation: false,
          typeConsistency: true
        },
        lastUpdated: new Date()
      }
    };

    return {
      endpoint: enhancedEndpoint,
      strategy: FallbackStrategy.TEMPLATE_PREFERRED,
      template,
      quality: {
        score: template.quality.completeness,
        confidence: template.quality.accuracy / 100,
        completeness: template.quality.completeness / 100
      },
      metadata: {
        generatedAt: new Date(),
        fallbackReason,
        templateUsed: template.id,
        manualRefinementNeeded: template.quality.completeness < 80
      }
    };
  }

  /**
   * Generate basic fallback documentation
   */
  private generateBasicFallback(
    endpoint: Endpoint,
    fallbackReason: string
  ): FallbackResult {
    const description = this.createBasicDescription(endpoint);
    
    const enhancedEndpoint: Endpoint = {
      ...endpoint,
      description,
      metadata: {
        ...endpoint.metadata,
        aiGenerated: false,
        fallbackUsed: true,
        confidence: 0.4
      },
      quality: {
        overallScore: 40,
        completeness: {
          score: 30,
          missingFields: ['examples', 'detailed_description', 'error_handling'],
          hasDescription: true,
          hasExamples: false,
          hasErrorHandling: false
        },
        clarity: {
          score: 50,
          readabilityIndex: 0.6,
          hasCodeExamples: false,
          usesConsistentTerminology: true
        },
        accuracy: {
          score: 60,
          schemaValidation: false,
          exampleValidation: false,
          typeConsistency: true
        },
        lastUpdated: new Date()
      }
    };

    return {
      endpoint: enhancedEndpoint,
      strategy: FallbackStrategy.BASIC_FALLBACK,
      quality: {
        score: 40,
        confidence: 0.4,
        completeness: 0.3
      },
      metadata: {
        generatedAt: new Date(),
        fallbackReason,
        manualRefinementNeeded: true
      }
    };
  }

  /**
   * Calculate template matching score for an endpoint
   */
  private calculateTemplateScore(endpoint: Endpoint, template: FallbackTemplate): number {
    let score = 0;

    // HTTP method match (high weight)
    if (template.httpMethods.includes(endpoint.method)) {
      score += 40;
    }

    // Path pattern match (high weight)
    for (const pattern of template.pathPatterns) {
      if (pattern.test(endpoint.path)) {
        score += 30;
        break;
      }
    }

    // Tags match (medium weight)
    if (template.tags && endpoint.tags) {
      const commonTags = template.tags.filter(tag => endpoint.tags!.includes(tag));
      score += commonTags.length * 5;
    }

    // Authentication match (low weight)
    if (template.template.description.toLowerCase().includes('auth') && endpoint.auth) {
      score += 10;
    }

    // Template quality (medium weight)
    score += template.quality.completeness * 0.2;

    // Template age penalty
    if (this.options.maxTemplateAge) {
      const ageInDays = (Date.now() - template.metadata.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays > this.options.maxTemplateAge) {
        score *= 0.8; // 20% penalty for old templates
      }
    }

    return Math.max(0, score);
  }

  /**
   * Check if template quality meets the threshold
   */
  private isTemplateQualityAcceptable(template: FallbackTemplate): boolean {
    return template.quality.completeness >= this.options.qualityThreshold;
  }

  /**
   * Populate template with endpoint-specific data
   */
  private populateTemplate(endpoint: Endpoint, template: FallbackTemplate): string {
    let description = template.template.description;
    
    // Extract resource name from path
    const pathSegments = endpoint.path.split('/').filter(segment => segment && !segment.startsWith(':'));
    const resource = pathSegments[pathSegments.length - 1] || 'resource';
    
    // Replace placeholders
    description = description
      .replace(/\{resource\}/g, resource)
      .replace(/\{method\}/g, endpoint.method.toUpperCase())
      .replace(/\{path\}/g, endpoint.path);

    // Add template-specific content
    if (template.template.notes && template.template.notes.length > 0) {
      description += '\n\n**Notes:**\n' + template.template.notes.map(note => `- ${note}`).join('\n');
    }

    return description;
  }

  /**
   * Load custom templates
   */
  private loadCustomTemplates(customTemplates: FallbackTemplate[]): void {
    for (const template of customTemplates) {
      this.templates.set(template.id, template);
      this.logger.debug(`Loaded custom template: ${template.name}`);
    }
  }

  /**
   * Initialize default templates for common endpoint patterns
   */
  private initializeDefaultTemplates(): void {
    const defaultTemplates: FallbackTemplate[] = [
      // CRUD Operations
      {
        id: 'crud-get-list',
        name: 'Get Resource List',
        description: 'Template for GET endpoints that return a list of resources',
        httpMethods: [HttpMethod.GET],
        pathPatterns: [/^\/[^\/]+\/?$/, /^\/api\/v?\d*\/[^\/]+\/?$/],
        template: {
          title: 'Get {resource} List',
          description: 'Retrieve a list of {resource}s. This endpoint supports pagination and filtering.',
          parameters: {
            query: 'Supports pagination (page, limit) and filtering parameters'
          },
          responses: {
            success: 'Returns an array of {resource} objects',
            error: 'Returns error details if the request fails'
          },
          examples: {
            request: 'GET {path}?page=1&limit=10',
            response: '{"data": [], "pagination": {"page": 1, "limit": 10, "total": 0}}'
          },
          notes: ['This endpoint may require authentication', 'Results are paginated by default']
        },
        quality: { completeness: 75, accuracy: 80, usability: 85 },
        metadata: { createdAt: new Date(), lastUpdated: new Date(), version: '1.0' }
      },
      {
        id: 'crud-get-single',
        name: 'Get Single Resource',
        description: 'Template for GET endpoints that return a single resource by ID',
        httpMethods: [HttpMethod.GET],
        pathPatterns: [/\/\{?:?id\}?$/, /\/\{?:?\w+Id\}?$/],
        template: {
          title: 'Get {resource} by ID',
          description: 'Retrieve a specific {resource} by its unique identifier.',
          parameters: {
            path: 'id (required): The unique identifier of the {resource}'
          },
          responses: {
            success: 'Returns the {resource} object',
            error: 'Returns 404 if {resource} not found, or other error details'
          },
          examples: {
            request: 'GET {path}',
            response: '{"id": "123", "name": "Example {resource}"}'
          }
        },
        quality: { completeness: 80, accuracy: 85, usability: 90 },
        metadata: { createdAt: new Date(), lastUpdated: new Date(), version: '1.0' }
      },
      {
        id: 'crud-post-create',
        name: 'Create Resource',
        description: 'Template for POST endpoints that create new resources',
        httpMethods: [HttpMethod.POST],
        pathPatterns: [/^\/[^\/]+\/?$/, /^\/api\/v?\d*\/[^\/]+\/?$/],
        template: {
          title: 'Create {resource}',
          description: 'Create a new {resource} with the provided data.',
          parameters: {
            body: 'JSON object containing {resource} data'
          },
          responses: {
            success: 'Returns the created {resource} object with assigned ID',
            error: 'Returns validation errors or other error details'
          },
          examples: {
            request: 'POST {path}\n{"name": "New {resource}"}',
            response: '{"id": "123", "name": "New {resource}", "createdAt": "2023-01-01T00:00:00Z"}'
          },
          notes: ['Request body must be valid JSON', 'Authentication may be required']
        },
        quality: { completeness: 85, accuracy: 80, usability: 85 },
        metadata: { createdAt: new Date(), lastUpdated: new Date(), version: '1.0' }
      },
      {
        id: 'crud-put-update',
        name: 'Update Resource',
        description: 'Template for PUT endpoints that update existing resources',
        httpMethods: [HttpMethod.PUT],
        pathPatterns: [/\/\{?:?id\}?$/, /\/\{?:?\w+Id\}?$/],
        template: {
          title: 'Update {resource}',
          description: 'Update an existing {resource} with new data. This replaces the entire resource.',
          parameters: {
            path: 'id (required): The unique identifier of the {resource}',
            body: 'JSON object containing updated {resource} data'
          },
          responses: {
            success: 'Returns the updated {resource} object',
            error: 'Returns 404 if {resource} not found, validation errors, or other error details'
          },
          examples: {
            request: 'PUT {path}\n{"name": "Updated {resource}"}',
            response: '{"id": "123", "name": "Updated {resource}", "updatedAt": "2023-01-01T00:00:00Z"}'
          }
        },
        quality: { completeness: 80, accuracy: 85, usability: 85 },
        metadata: { createdAt: new Date(), lastUpdated: new Date(), version: '1.0' }
      },
      {
        id: 'crud-delete',
        name: 'Delete Resource',
        description: 'Template for DELETE endpoints that remove resources',
        httpMethods: [HttpMethod.DELETE],
        pathPatterns: [/\/\{?:?id\}?$/, /\/\{?:?\w+Id\}?$/],
        template: {
          title: 'Delete {resource}',
          description: 'Delete a {resource} by its unique identifier.',
          parameters: {
            path: 'id (required): The unique identifier of the {resource} to delete'
          },
          responses: {
            success: 'Returns confirmation of deletion',
            error: 'Returns 404 if {resource} not found, or other error details'
          },
          examples: {
            request: 'DELETE {path}',
            response: '{"message": "{resource} deleted successfully"}'
          },
          notes: ['This operation cannot be undone', 'Authentication is typically required']
        },
        quality: { completeness: 75, accuracy: 90, usability: 80 },
        metadata: { createdAt: new Date(), lastUpdated: new Date(), version: '1.0' }
      },
      // Authentication
      {
        id: 'auth-login',
        name: 'User Login',
        description: 'Template for authentication/login endpoints',
        httpMethods: [HttpMethod.POST],
        pathPatterns: [/\/login$/, /\/auth$/, /\/signin$/, /\/authenticate$/],
        tags: ['auth', 'authentication'],
        template: {
          title: 'User Authentication',
          description: 'Authenticate a user and receive an access token.',
          parameters: {
            body: 'JSON object containing user credentials (username/email and password)'
          },
          responses: {
            success: 'Returns access token and user information',
            error: 'Returns authentication error details'
          },
          examples: {
            request: 'POST {path}\n{"email": "user@example.com", "password": "password123"}',
            response: '{"token": "jwt-token", "user": {"id": "123", "email": "user@example.com"}}'
          },
          notes: ['Credentials are validated against the user database', 'Token should be included in subsequent requests']
        },
        quality: { completeness: 85, accuracy: 90, usability: 90 },
        metadata: { createdAt: new Date(), lastUpdated: new Date(), version: '1.0' }
      },
      // File Upload
      {
        id: 'file-upload',
        name: 'File Upload',
        description: 'Template for file upload endpoints',
        httpMethods: [HttpMethod.POST],
        pathPatterns: [/\/upload$/, /\/files$/, /\/media$/],
        template: {
          title: 'Upload File',
          description: 'Upload a file to the server.',
          parameters: {
            body: 'Multipart form data containing the file and optional metadata'
          },
          responses: {
            success: 'Returns file information including URL and metadata',
            error: 'Returns upload error details'
          },
          examples: {
            request: 'POST {path}\nContent-Type: multipart/form-data\nfile: [binary data]',
            response: '{"id": "file123", "url": "/files/file123.jpg", "size": 1024, "type": "image/jpeg"}'
          },
          notes: ['File size limits may apply', 'Supported file types may be restricted']
        },
        quality: { completeness: 80, accuracy: 85, usability: 85 },
        metadata: { createdAt: new Date(), lastUpdated: new Date(), version: '1.0' }
      }
    ];

    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }

    this.logger.debug(`Initialized ${defaultTemplates.length} default templates`);
  }

  /**
   * Get all available templates
   */
  public getAvailableTemplates(): FallbackTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Add a new template
   */
  public addTemplate(template: FallbackTemplate): void {
    this.templates.set(template.id, template);
    this.logger.debug(`Added template: ${template.name}`);
  }

  /**
   * Remove a template
   */
  public removeTemplate(templateId: string): boolean {
    const removed = this.templates.delete(templateId);
    if (removed) {
      this.logger.debug(`Removed template: ${templateId}`);
    }
    return removed;
  }

  /**
   * Update fallback options
   */
  public updateOptions(newOptions: Partial<FallbackOptions>): void {
    this.options = { ...this.options, ...newOptions };
    this.logger.debug('Updated fallback options');
  }

  /**
   * Get current fallback options
   */
  public getOptions(): FallbackOptions {
    return { ...this.options };
  }
}