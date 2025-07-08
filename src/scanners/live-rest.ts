import { IScanner } from '@/interfaces/scanner';
import { ApiSpec, Endpoint, HttpMethod, AuthType, AuthInfo, HeaderSpec } from '@/models/types';
import { Config } from '@/models/config';
import { createAuthStrategy } from '@/auth/factory';
import { HttpClient, createHttpClient, discoverEndpoints, extractEndpointsFromSpec, testEndpoint } from '@/utils/http';

/**
 * Scanner for live REST APIs that discovers endpoints through various strategies
 */
export class LiveRestScanner implements IScanner {
  private client: HttpClient;
  private config: Config;
  private authStrategy: any;
  private discoveredEndpoints: Set<string> = new Set();

  constructor(config: Config) {
    this.config = config;
    
    // Create HTTP client with configuration
    this.client = createHttpClient({
      baseURL: config.url,
      timeout: config.timeout || 30000,
      rateLimit: {
        maxRequests: config.rateLimit || 10,
        windowMs: 1000,
      },
      debug: config.debug || false,
    });

    // Create authentication strategy
    this.authStrategy = createAuthStrategy({
      type: config.authType || AuthType.NONE,
      token: config.token,
      apiKey: config.token, // Use token as API key if needed
      headerName: config.authHeaderName,
    });
  }

  /**
   * Scan the live REST API to discover endpoints and generate API specification
   */
  async scan(): Promise<ApiSpec> {
    const endpoints: Endpoint[] = [];

    try {
      // Strategy 1: Try to discover OpenAPI/Swagger documentation
      const specEndpoints = await this.discoverFromSpecification();
      endpoints.push(...specEndpoints);

      // Strategy 2: Test seed endpoints if provided
      if (this.config.seedEndpoints && this.config.seedEndpoints.length > 0) {
        const seedEndpoints = await this.scanSeedEndpoints();
        endpoints.push(...seedEndpoints);
      }

      // Strategy 3: Try common endpoint discovery if no endpoints found yet
      if (endpoints.length === 0) {
        const commonEndpoints = await this.discoverCommonEndpoints();
        endpoints.push(...commonEndpoints);
      }

      // Strategy 4: Enhance discovered endpoints with detailed information
      const enhancedEndpoints = await this.enhanceEndpoints(endpoints);

      return this.deduplicateEndpoints(enhancedEndpoints);
    } catch (error: any) {
      throw new Error(`Failed to scan live REST API: ${error.message}`);
    }
  }

  /**
   * Discover endpoints from OpenAPI/Swagger specification
   */
  private async discoverFromSpecification(): Promise<Endpoint[]> {
    try {
      const discovery = await discoverEndpoints(this.client);
      
      if (discovery.openApiSpec) {
        console.log(`Found OpenAPI specification via ${discovery.discoveryMethod}`);
        return extractEndpointsFromSpec(discovery.openApiSpec);
      }
      
      if (discovery.swaggerSpec) {
        console.log(`Found Swagger specification via ${discovery.discoveryMethod}`);
        return extractEndpointsFromSpec(discovery.swaggerSpec);
      }

      if (this.config.verbose) {
        console.log('No OpenAPI/Swagger specification found');
      }
    } catch (error: any) {
      if (this.config.verbose) {
        console.log(`Specification discovery failed: ${error.message}`);
      }
    }

    return [];
  }

  /**
   * Scan provided seed endpoints
   */
  private async scanSeedEndpoints(): Promise<Endpoint[]> {
    const endpoints: Endpoint[] = [];
    
    if (!this.config.seedEndpoints) {
      return endpoints;
    }

    console.log(`Scanning ${this.config.seedEndpoints.length} seed endpoints...`);

    for (const seedPath of this.config.seedEndpoints) {
      try {
        // Test common HTTP methods for each seed endpoint
        const methods = [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE, HttpMethod.PATCH];
        
        for (const method of methods) {
          const endpoint = await this.analyzeEndpoint(method, seedPath);
          if (endpoint) {
            endpoints.push(endpoint);
            this.discoveredEndpoints.add(`${method}:${seedPath}`);
          }
        }

        // Try to discover related endpoints through OPTIONS
        await this.discoverRelatedEndpoints(seedPath, endpoints);
      } catch (error: any) {
        if (this.config.verbose) {
          console.log(`Failed to scan seed endpoint ${seedPath}: ${error.message}`);
        }
      }
    }

    return endpoints;
  }

  /**
   * Discover common REST endpoints
   */
  private async discoverCommonEndpoints(): Promise<Endpoint[]> {
    const endpoints: Endpoint[] = [];
    const commonPaths = [
      '/',
      '/api',
      '/api/v1',
      '/api/v2',
      '/v1',
      '/v2',
      '/health',
      '/status',
      '/ping',
      '/users',
      '/user',
      '/items',
      '/products',
      '/data',
    ];

    console.log('Attempting to discover common endpoints...');

    for (const path of commonPaths) {
      try {
        const endpoint = await this.analyzeEndpoint(HttpMethod.GET, path);
        if (endpoint) {
          endpoints.push(endpoint);
          this.discoveredEndpoints.add(`GET:${path}`);
          
          // If we find a working endpoint, try other methods
          const otherMethods = [HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE];
          for (const method of otherMethods) {
            const methodEndpoint = await this.analyzeEndpoint(method, path);
            if (methodEndpoint) {
              endpoints.push(methodEndpoint);
              this.discoveredEndpoints.add(`${method}:${path}`);
            }
          }
        }
      } catch (error: any) {
        // Continue with next path
        continue;
      }
    }

    return endpoints;
  }

  /**
   * Analyze a specific endpoint to gather detailed information
   */
  private async analyzeEndpoint(method: HttpMethod, path: string): Promise<Endpoint | null> {
    try {
      // Apply authentication headers
      const headers: HeaderSpec[] = [];
      await this.authStrategy.applyAuth({ headers: headers });

      const result = await testEndpoint(this.client, method, path, headers);
      
      if (!result.accessible) {
        return null;
      }

      // Skip if status indicates method not allowed or not found
      if (result.statusCode === 404 || result.statusCode === 405) {
        return null;
      }

      const endpoint: Endpoint = {
        method,
        path,
        description: this.generateEndpointDescription(method, path, result.statusCode),
      };

      // Add authentication info if we're using auth
      if (this.config.authType && this.config.authType !== AuthType.NONE) {
        endpoint.auth = this.createAuthInfo();
      }

      // Add headers
      if (headers.length > 0) {
        endpoint.headers = headers;
      }

      // Analyze response
      if (result.responseBody !== undefined) {
        endpoint.responseSchema = [{
          statusCode: result.statusCode || 200,
          contentType: this.detectContentType(result.responseHeaders, result.responseBody),
          schema: this.analyzeResponseSchema(result.responseBody),
          example: this.createResponseExample(result.responseBody),
        }];
      }

      // For POST/PUT/PATCH, try to infer request schema
      if ([HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH].includes(method)) {
        endpoint.requestSchema = this.inferRequestSchema(path, result.responseBody);
      }

      // Extract path parameters
      endpoint.parameters = this.extractParameters(path);

      return endpoint;
    } catch (error: any) {
      if (this.config.verbose) {
        console.log(`Failed to analyze ${method} ${path}: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Discover related endpoints using OPTIONS requests
   */
  private async discoverRelatedEndpoints(basePath: string, endpoints: Endpoint[]): Promise<void> {
    try {
      const result = await testEndpoint(this.client, HttpMethod.OPTIONS, basePath);
      
      if (result.accessible && result.responseHeaders) {
        const allowHeader = result.responseHeaders['allow'] || result.responseHeaders['Allow'];
        
        if (allowHeader) {
          const allowedMethods = allowHeader.split(',').map(m => m.trim().toUpperCase());
          
          for (const methodStr of allowedMethods) {
            if (Object.values(HttpMethod).includes(methodStr as HttpMethod)) {
              const method = methodStr as HttpMethod;
              const key = `${method}:${basePath}`;
              
              if (!this.discoveredEndpoints.has(key)) {
                const endpoint = await this.analyzeEndpoint(method, basePath);
                if (endpoint) {
                  endpoints.push(endpoint);
                  this.discoveredEndpoints.add(key);
                }
              }
            }
          }
        }
      }
    } catch (error: any) {
      // OPTIONS might not be supported, continue silently
    }
  }

  /**
   * Enhance discovered endpoints with additional details
   */
  private async enhanceEndpoints(endpoints: Endpoint[]): Promise<Endpoint[]> {
    const enhanced: Endpoint[] = [];

    for (const endpoint of endpoints) {
      try {
        // Try to get more detailed information by making actual requests
        const enhancedEndpoint = await this.enhanceEndpointDetails(endpoint);
        enhanced.push(enhancedEndpoint);
      } catch (error: any) {
        // If enhancement fails, use original endpoint
        enhanced.push(endpoint);
      }
    }

    return enhanced;
  }

  /**
   * Enhance a single endpoint with additional details
   */
  private async enhanceEndpointDetails(endpoint: Endpoint): Promise<Endpoint> {
    const enhanced = { ...endpoint };

    try {
      // For GET endpoints, try to get more response examples
      if (endpoint.method === HttpMethod.GET) {
        const headers: HeaderSpec[] = [];
        await this.authStrategy.applyAuth({ headers: headers });
        
        const result = await testEndpoint(this.client, endpoint.method, endpoint.path, headers);
        
        if (result.accessible && result.responseBody) {
          // Update response schema with more detailed analysis
          enhanced.responseSchema = [{
            statusCode: result.statusCode || 200,
            contentType: this.detectContentType(result.responseHeaders, result.responseBody),
            schema: this.analyzeResponseSchema(result.responseBody),
            example: this.createResponseExample(result.responseBody),
          }];
        }
      }

      // Try to infer query parameters for GET endpoints
      if (endpoint.method === HttpMethod.GET) {
        const queryParams = this.inferQueryParameters(endpoint.path);
        if (queryParams.length > 0) {
          enhanced.parameters = enhanced.parameters || {};
          enhanced.parameters.query = queryParams;
        }
      }
    } catch (error: any) {
      // Enhancement failed, return original
    }

    return enhanced;
  }

  /**
   * Generate a descriptive name for an endpoint
   */
  private generateEndpointDescription(method: HttpMethod, path: string, statusCode?: number): string {
    const pathParts = path.split('/').filter(part => part.length > 0);
    const resource = pathParts[pathParts.length - 1] || 'root';
    
    const methodDescriptions = {
      [HttpMethod.GET]: `Get ${resource}`,
      [HttpMethod.POST]: `Create ${resource}`,
      [HttpMethod.PUT]: `Update ${resource}`,
      [HttpMethod.DELETE]: `Delete ${resource}`,
      [HttpMethod.PATCH]: `Partially update ${resource}`,
      [HttpMethod.HEAD]: `Get ${resource} headers`,
      [HttpMethod.OPTIONS]: `Get ${resource} options`,
    };

    let description = methodDescriptions[method] || `${method} ${resource}`;
    
    // Add status code context if available
    if (statusCode) {
      if (statusCode >= 200 && statusCode < 300) {
        description += ' (successful)';
      } else if (statusCode >= 400) {
        description += ` (returns ${statusCode})`;
      }
    }

    return description;
  }

  /**
   * Create authentication info based on configuration
   */
  private createAuthInfo(): AuthInfo {
    return {
      type: this.config.authType!,
      credentials: {
        token: this.config.token,
        headerName: this.config.authHeaderName,
      },
      description: this.getAuthDescription(),
    };
  }

  /**
   * Get authentication description
   */
  private getAuthDescription(): string {
    switch (this.config.authType) {
      case AuthType.BEARER:
        return 'Bearer token authentication required';
      case AuthType.API_KEY:
        return `API key required in ${this.config.authHeaderName || 'X-API-Key'} header`;
      case AuthType.BASIC:
        return 'Basic authentication required';
      default:
        return 'No authentication required';
    }
  }

  /**
   * Detect content type from headers and response body
   */
  private detectContentType(headers?: Record<string, string>, body?: any): string {
    if (headers) {
      const contentType = headers['content-type'] || headers['Content-Type'];
      if (contentType) {
        return contentType.split(';')[0]; // Remove charset info
      }
    }

    // Infer from body type
    if (typeof body === 'object') {
      return 'application/json';
    } else if (typeof body === 'string') {
      try {
        JSON.parse(body);
        return 'application/json';
      } catch {
        return 'text/plain';
      }
    }

    return 'application/json';
  }

  /**
   * Analyze response body to create a schema
   */
  private analyzeResponseSchema(body: any): any {
    if (body === null || body === undefined) {
      return { type: 'null' };
    }

    if (Array.isArray(body)) {
      return {
        type: 'array',
        items: body.length > 0 ? this.analyzeResponseSchema(body[0]) : { type: 'object' },
      };
    }

    if (typeof body === 'object') {
      const properties: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(body)) {
        properties[key] = this.analyzeResponseSchema(value);
      }

      return {
        type: 'object',
        properties,
        required: Object.keys(properties),
      };
    }

    return { type: typeof body };
  }

  /**
   * Create a response example from the actual response
   */
  private createResponseExample(body: any): any {
    if (Array.isArray(body)) {
      return body.slice(0, 2); // Limit array examples to first 2 items
    }

    if (typeof body === 'object' && body !== null) {
      const example: Record<string, any> = {};
      
      // Limit object examples to prevent huge responses
      const keys = Object.keys(body).slice(0, 10);
      for (const key of keys) {
        example[key] = body[key];
      }
      
      return example;
    }

    return body;
  }

  /**
   * Infer request schema for POST/PUT/PATCH endpoints
   */
  private inferRequestSchema(path: string, responseBody?: any): any {
    const contentType = 'application/json';
    
    // Try to infer from response body structure
    if (responseBody && typeof responseBody === 'object') {
      const schema = this.analyzeResponseSchema(responseBody);
      
      // Remove read-only fields that typically shouldn't be in requests
      if (schema.type === 'object' && schema.properties) {
        const requestProperties = { ...schema.properties };
        delete requestProperties.id;
        delete requestProperties.createdAt;
        delete requestProperties.updatedAt;
        delete requestProperties.created_at;
        delete requestProperties.updated_at;
        
        return {
          contentType,
          schema: {
            type: 'object',
            properties: requestProperties,
            required: Object.keys(requestProperties).slice(0, 3), // Assume first few fields are required
          },
          example: this.createRequestExample(requestProperties),
        };
      }
    }

    // Fallback to generic request schema
    return {
      contentType,
      schema: {
        type: 'object',
        properties: {
          data: { type: 'object' },
        },
      },
      example: { data: {} },
    };
  }

  /**
   * Create a request example from properties
   */
  private createRequestExample(properties: Record<string, any>): any {
    const example: Record<string, any> = {};
    
    for (const [key, schema] of Object.entries(properties)) {
      if (schema.type === 'string') {
        example[key] = `example_${key}`;
      } else if (schema.type === 'number') {
        example[key] = 123;
      } else if (schema.type === 'boolean') {
        example[key] = true;
      } else if (schema.type === 'array') {
        example[key] = [];
      } else {
        example[key] = {};
      }
    }
    
    return example;
  }

  /**
   * Extract path and query parameters from endpoint path
   */
  private extractParameters(path: string): Endpoint['parameters'] {
    const parameters: Endpoint['parameters'] = {};

    // Extract path parameters (e.g., /users/{id})
    const pathParams = path.match(/\{([^}]+)\}/g);
    if (pathParams) {
      parameters.path = pathParams.map(param => {
        const name = param.slice(1, -1); // Remove { and }
        return {
          name,
          type: 'string',
          required: true,
          description: `${name} parameter`,
        };
      });
    }

    return Object.keys(parameters).length > 0 ? parameters : undefined;
  }

  /**
   * Infer common query parameters for GET endpoints
   */
  private inferQueryParameters(path: string): Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }> {
    const params = [];

    // Common pagination parameters
    if (path.includes('users') || path.includes('items') || path.includes('products')) {
      params.push(
        {
          name: 'page',
          type: 'number',
          required: false,
          description: 'Page number for pagination',
        },
        {
          name: 'limit',
          type: 'number',
          required: false,
          description: 'Number of items per page',
        }
      );
    }

    // Common filter parameters
    if (path.includes('search') || path.endsWith('s')) { // Plural endpoints
      params.push({
        name: 'q',
        type: 'string',
        required: false,
        description: 'Search query',
      });
    }

    return params;
  }

  /**
   * Remove duplicate endpoints based on method and path
   */
  private deduplicateEndpoints(endpoints: Endpoint[]): ApiSpec {
    const seen = new Set<string>();
    const unique: Endpoint[] = [];

    for (const endpoint of endpoints) {
      const key = `${endpoint.method}:${endpoint.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(endpoint);
      }
    }

    return unique;
  }
}