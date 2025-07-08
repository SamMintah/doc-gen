import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpMethod, Endpoint, HeaderSpec } from '@/models/types';

/**
 * Configuration options for HTTP client
 */
interface HttpClientConfig {
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  debug?: boolean;
}

/**
 * Rate limiter to control request frequency
 */
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.requests.push(now);
  }
}

/**
 * HTTP client with built-in rate limiting, retries, and error handling
 */
export class HttpClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private config: HttpClientConfig;

  constructor(config: HttpClientConfig = {}) {
    this.config = {
      timeout: 10000,
      maxRetries: 3,
      retryDelay: 1000,
      rateLimit: { maxRequests: 10, windowMs: 1000 },
      debug: false,
      ...config,
    };

    this.rateLimiter = new RateLimiter(
      this.config.rateLimit!.maxRequests,
      this.config.rateLimit!.windowMs
    );

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'API-Doc-Generator/1.0.0',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        if (this.config.debug) {
          console.log(`[HTTP] ${config.method?.toUpperCase()} ${config.url}`);
          if (config.data) {
            console.log('[HTTP] Request body:', config.data);
          }
        }
        return config;
      },
      (error) => {
        if (this.config.debug) {
          console.error('[HTTP] Request error:', error.message);
        }
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        if (this.config.debug) {
          console.log(`[HTTP] ${response.status} ${response.config.url}`);
        }
        return response;
      },
      (error) => {
        if (this.config.debug) {
          const status = error.response?.status || 'No response';
          console.error(`[HTTP] ${status} ${error.config?.url} - ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make an HTTP request with rate limiting and retry logic
   */
  async makeRequest<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    await this.rateLimiter.waitIfNeeded();

    let lastError: any;
    const maxRetries = this.config.maxRetries!;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.request<T>(config);
      } catch (error: any) {
        lastError = error;

        // Don't retry on client errors (4xx) except for rate limiting
        if (error.response?.status >= 400 && error.response?.status < 500) {
          if (error.response.status === 429) {
            // Rate limited, wait and retry
            const retryAfter = error.response.headers['retry-after'];
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.config.retryDelay! * (attempt + 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          // Other 4xx errors shouldn't be retried
          break;
        }

        // Retry on network errors and 5xx errors
        if (attempt < maxRetries) {
          const delay = this.config.retryDelay! * Math.pow(2, attempt); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw this.createMeaningfulError(lastError);
  }

  private createMeaningfulError(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const url = error.config?.url || 'unknown';
      
      switch (status) {
        case 401:
          return new Error(`Authentication failed for ${url}. Please check your credentials.`);
        case 403:
          return new Error(`Access forbidden for ${url}. You may not have permission to access this resource.`);
        case 404:
          return new Error(`Resource not found at ${url}. The endpoint may not exist.`);
        case 429:
          return new Error(`Rate limit exceeded for ${url}. Please try again later.`);
        case 500:
          return new Error(`Server error at ${url}. The API may be experiencing issues.`);
        default:
          return new Error(`HTTP ${status} error for ${url}: ${error.response.data?.message || error.message}`);
      }
    } else if (error.request) {
      return new Error(`Network error: Unable to reach the API. Please check your internet connection and the API URL.`);
    } else {
      return new Error(`Request configuration error: ${error.message}`);
    }
  }
}

/**
 * Test if an endpoint is accessible and return basic information
 */
export async function testEndpoint(
  client: HttpClient,
  method: HttpMethod,
  path: string,
  headers?: HeaderSpec[]
): Promise<{
  accessible: boolean;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  error?: string;
}> {
  try {
    const requestHeaders: Record<string, string> = {};
    
    if (headers) {
      headers.forEach(header => {
        requestHeaders[header.name] = header.value;
      });
    }

    const response = await client.makeRequest({
      method: method.toLowerCase() as any,
      url: path,
      headers: requestHeaders,
      validateStatus: () => true, // Don't throw on any status code
    });

    return {
      accessible: true,
      statusCode: response.status,
      responseHeaders: response.headers,
      responseBody: response.data,
    };
  } catch (error: any) {
    return {
      accessible: false,
      error: error.message,
    };
  }
}

/**
 * Discover endpoints by checking common API documentation paths
 */
export async function discoverEndpoints(client: HttpClient): Promise<{
  openApiSpec?: any;
  swaggerSpec?: any;
  endpoints?: string[];
  discoveryMethod?: string;
}> {
  const commonPaths = [
    '/swagger.json',
    '/swagger/v1/swagger.json',
    '/api-docs',
    '/api/docs',
    '/docs/swagger.json',
    '/v1/swagger.json',
    '/v2/swagger.json',
    '/openapi.json',
    '/api/openapi.json',
    '/.well-known/openapi',
  ];

  // Try to find OpenAPI/Swagger documentation
  for (const path of commonPaths) {
    try {
      const response = await client.makeRequest({
        method: 'get',
        url: path,
        timeout: 5000,
      });

      if (response.data && typeof response.data === 'object') {
        // Check if it's an OpenAPI/Swagger spec
        if (response.data.openapi || response.data.swagger) {
          return {
            openApiSpec: response.data.openapi ? response.data : undefined,
            swaggerSpec: response.data.swagger ? response.data : undefined,
            discoveryMethod: `Found specification at ${path}`,
          };
        }
      }
    } catch (error) {
      // Continue to next path
      continue;
    }
  }

  // Try OPTIONS request on root to discover supported methods
  try {
    const response = await client.makeRequest({
      method: 'options',
      url: '/',
      timeout: 5000,
    });

    const allowHeader = response.headers['allow'];
    if (allowHeader) {
      const methods = allowHeader.split(',').map(m => m.trim());
      return {
        endpoints: ['/'],
        discoveryMethod: `OPTIONS request revealed supported methods: ${methods.join(', ')}`,
      };
    }
  } catch (error) {
    // Continue with other discovery methods
  }

  // Try common REST endpoints
  const commonEndpoints = [
    '/api',
    '/api/v1',
    '/api/v2',
    '/v1',
    '/v2',
    '/health',
    '/status',
    '/ping',
  ];

  const discoveredEndpoints: string[] = [];

  for (const endpoint of commonEndpoints) {
    try {
      const result = await testEndpoint(client, HttpMethod.GET, endpoint);
      if (result.accessible && result.statusCode && result.statusCode < 500) {
        discoveredEndpoints.push(endpoint);
      }
    } catch (error) {
      // Continue to next endpoint
      continue;
    }
  }

  if (discoveredEndpoints.length > 0) {
    return {
      endpoints: discoveredEndpoints,
      discoveryMethod: `Discovered ${discoveredEndpoints.length} accessible endpoints through common path testing`,
    };
  }

  return {
    discoveryMethod: 'No endpoints discovered through automatic detection',
  };
}

/**
 * Extract endpoints from OpenAPI/Swagger specification
 */
export function extractEndpointsFromSpec(spec: any): Endpoint[] {
  const endpoints: Endpoint[] = [];

  if (!spec.paths) {
    return endpoints;
  }

  Object.entries(spec.paths).forEach(([path, pathItem]: [string, any]) => {
    Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
      if (!['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
        return;
      }

      const endpoint: Endpoint = {
        method: method.toUpperCase() as HttpMethod,
        path,
        description: operation.summary || operation.description,
        tags: operation.tags,
        deprecated: operation.deprecated,
      };

      // Extract parameters
      if (operation.parameters) {
        endpoint.parameters = {
          path: operation.parameters
            .filter((p: any) => p.in === 'path')
            .map((p: any) => ({
              name: p.name,
              type: p.schema?.type || p.type || 'string',
              required: p.required || false,
              description: p.description,
            })),
          query: operation.parameters
            .filter((p: any) => p.in === 'query')
            .map((p: any) => ({
              name: p.name,
              type: p.schema?.type || p.type || 'string',
              required: p.required || false,
              description: p.description,
            })),
        };
      }

      // Extract request body
      if (operation.requestBody) {
        const content = operation.requestBody.content;
        const contentType = Object.keys(content)[0];
        if (contentType && content[contentType]) {
          endpoint.requestSchema = {
            contentType,
            schema: content[contentType].schema,
            example: content[contentType].example,
          };
        }
      }

      // Extract responses
      if (operation.responses) {
        endpoint.responseSchema = Object.entries(operation.responses).map(([statusCode, response]: [string, any]) => ({
          statusCode: parseInt(statusCode),
          contentType: response.content ? Object.keys(response.content)[0] : 'application/json',
          schema: response.content ? Object.values(response.content)[0]?.schema : undefined,
          example: response.content ? Object.values(response.content)[0]?.example : undefined,
        }));
      }

      endpoints.push(endpoint);
    });
  });

  return endpoints;
}

/**
 * Create a default HTTP client instance
 */
export function createHttpClient(config?: HttpClientConfig): HttpClient {
  return new HttpClient(config);
}

/**
 * Utility function to make a simple HTTP request
 */
export async function makeRequest<T = any>(
  url: string,
  config?: AxiosRequestConfig & { client?: HttpClient }
): Promise<AxiosResponse<T>> {
  const client = config?.client || createHttpClient();
  const { client: _, ...requestConfig } = config || {};
  
  return client.makeRequest<T>({
    url,
    ...requestConfig,
  });
}