import { Endpoint, HttpMethod, AuthType } from '@/models/types';

/**
 * System prompt that establishes the AI's role and guidelines for documentation generation
 */
export const SYSTEM_PROMPT = `You are an expert technical writer specializing in API documentation. Your task is to generate clear, comprehensive, and developer-friendly documentation for API endpoints.

Guidelines:
- Write for software developers who need to integrate with the API
- Use a professional but approachable tone
- Be concise yet thorough
- Include practical examples that developers can copy and use
- Explain complex concepts in simple terms
- Focus on what developers need to know to successfully use the endpoint
- Always include error handling information when available
- Use consistent formatting and structure

Your documentation should help developers quickly understand:
1. What the endpoint does
2. How to authenticate (if required)
3. What parameters are needed
4. What the response looks like
5. Common error scenarios and how to handle them
6. Practical usage examples`;

/**
 * Template for generating documentation for REST API endpoints
 */
export function buildRestEndpointPrompt(endpoint: Endpoint): string {
  const methodDescription = getMethodDescription(endpoint.method);
  const authSection = endpoint.auth ? buildAuthSection(endpoint.auth) : '';
  const parametersSection = endpoint.parameters ? buildParametersSection(endpoint.parameters) : '';
  const requestSection = endpoint.requestSchema ? buildRequestSection(endpoint.requestSchema) : '';
  const responseSection = endpoint.responseSchema ? buildResponseSection(endpoint.responseSchema) : '';

  return `Generate comprehensive documentation for this REST API endpoint:

**Endpoint Details:**
- Method: ${endpoint.method}
- Path: ${endpoint.path}
- Description: ${endpoint.description || 'No description provided'}
${endpoint.tags ? `- Tags: ${endpoint.tags.join(', ')}` : ''}
${endpoint.deprecated ? '- Status: DEPRECATED' : ''}

${authSection}
${parametersSection}
${requestSection}
${responseSection}

**Requirements:**
1. Write a clear, engaging description of what this endpoint does (${methodDescription})
2. Explain the purpose and use cases for this endpoint
3. Document all parameters with types, requirements, and examples
4. Provide realistic request and response examples
5. Include common error scenarios and status codes
6. Add any important notes about rate limiting, pagination, or special behavior
7. Format the output as clean, readable documentation

Please generate documentation that follows these sections:
- Overview and purpose
- Authentication (if required)
- Parameters
- Request format and examples
- Response format and examples
- Error handling
- Usage notes and best practices`;
}

/**
 * Template for generating documentation for GraphQL endpoints
 */
export function buildGraphQLPrompt(endpoint: Endpoint): string {
  const operationType = endpoint.method === HttpMethod.POST ? 'mutation' : 'query';
  const authSection = endpoint.auth ? buildAuthSection(endpoint.auth) : '';
  const requestSection = endpoint.requestSchema ? buildGraphQLRequestSection(endpoint.requestSchema) : '';
  const responseSection = endpoint.responseSchema ? buildResponseSection(endpoint.responseSchema) : '';

  return `Generate comprehensive documentation for this GraphQL ${operationType}:

**Operation Details:**
- Type: ${operationType}
- Name: ${endpoint.path.replace('/', '')}
- Description: ${endpoint.description || 'No description provided'}
${endpoint.tags ? `- Tags: ${endpoint.tags.join(', ')}` : ''}

${authSection}
${requestSection}
${responseSection}

**Requirements:**
1. Write a clear description of what this GraphQL ${operationType} accomplishes
2. Explain the business logic and use cases
3. Document all input arguments with types and descriptions
4. Show the GraphQL query/mutation syntax with proper formatting
5. Provide realistic examples with variables
6. Document the response structure and available fields
7. Include error handling for GraphQL-specific errors
8. Add notes about any special directives or fragments

Please generate documentation that follows these sections:
- Overview and purpose
- Authentication (if required)
- Arguments and input types
- GraphQL syntax and examples
- Response structure
- Error handling
- Usage examples with variables`;
}

/**
 * Template for batch processing multiple endpoints
 */
export function buildBatchPrompt(endpoints: Endpoint[]): string {
  const endpointSummaries = endpoints.map((endpoint, index) => 
    `${index + 1}. ${endpoint.method} ${endpoint.path} - ${endpoint.description || 'No description'}`
  ).join('\n');

  return `Generate documentation for the following ${endpoints.length} API endpoints. For each endpoint, provide comprehensive documentation following the same structure and quality standards.

**Endpoints to document:**
${endpointSummaries}

**For each endpoint, include:**
1. Clear overview and purpose
2. Authentication requirements
3. Parameter documentation
4. Request/response examples
5. Error handling
6. Usage notes

Please maintain consistency in tone, formatting, and level of detail across all endpoints. Number each endpoint clearly and use consistent section headers.`;
}

/**
 * Helper function to get method-specific descriptions
 */
function getMethodDescription(method: HttpMethod): string {
  const descriptions = {
    [HttpMethod.GET]: 'retrieves data from the server',
    [HttpMethod.POST]: 'creates new resources or submits data',
    [HttpMethod.PUT]: 'updates or replaces existing resources',
    [HttpMethod.PATCH]: 'partially updates existing resources',
    [HttpMethod.DELETE]: 'removes resources from the server',
    [HttpMethod.HEAD]: 'retrieves headers without response body',
    [HttpMethod.OPTIONS]: 'returns allowed methods and CORS information',
  };
  return descriptions[method] || 'performs an operation';
}

/**
 * Helper function to build authentication section
 */
function buildAuthSection(auth: any): string {
  if (!auth || auth.type === AuthType.NONE) {
    return '**Authentication:** None required\n';
  }

  let authDescription = '**Authentication Required:**\n';
  
  switch (auth.type) {
    case AuthType.BEARER:
      authDescription += `- Type: Bearer Token
- Header: Authorization: Bearer <token>
- Description: ${auth.description || 'Requires a valid bearer token'}`;
      break;
    case AuthType.API_KEY:
      const headerName = auth.credentials?.headerName || 'X-API-Key';
      authDescription += `- Type: API Key
- Header: ${headerName}: <api_key>
- Description: ${auth.description || 'Requires a valid API key'}`;
      break;
    case AuthType.BASIC:
      authDescription += `- Type: Basic Authentication
- Header: Authorization: Basic <base64(username:password)>
- Description: ${auth.description || 'Requires username and password'}`;
      break;
    default:
      authDescription += `- Type: ${auth.type}
- Description: ${auth.description || 'Authentication required'}`;
  }
  
  return authDescription + '\n\n';
}

/**
 * Helper function to build parameters section
 */
function buildParametersSection(parameters: any): string {
  let section = '**Parameters:**\n';
  
  if (parameters.path && parameters.path.length > 0) {
    section += '- Path Parameters:\n';
    parameters.path.forEach((param: any) => {
      section += `  - ${param.name} (${param.type}): ${param.description || 'No description'} ${param.required ? '[Required]' : '[Optional]'}\n`;
    });
  }
  
  if (parameters.query && parameters.query.length > 0) {
    section += '- Query Parameters:\n';
    parameters.query.forEach((param: any) => {
      section += `  - ${param.name} (${param.type}): ${param.description || 'No description'} ${param.required ? '[Required]' : '[Optional]'}\n`;
    });
  }
  
  return section + '\n';
}

/**
 * Helper function to build request section for REST endpoints
 */
function buildRequestSection(requestSchema: any): string {
  let section = '**Request Format:**\n';
  section += `- Content-Type: ${requestSchema.contentType || 'application/json'}\n`;
  
  if (requestSchema.schema) {
    section += '- Schema:\n```json\n' + JSON.stringify(requestSchema.schema, null, 2) + '\n```\n';
  }
  
  if (requestSchema.example) {
    section += '- Example:\n```json\n' + JSON.stringify(requestSchema.example, null, 2) + '\n```\n';
  }
  
  return section + '\n';
}

/**
 * Helper function to build request section for GraphQL endpoints
 */
function buildGraphQLRequestSection(requestSchema: any): string {
  let section = '**GraphQL Request:**\n';
  
  if (requestSchema.schema) {
    section += '- Query/Mutation:\n```graphql\n' + requestSchema.schema + '\n```\n';
  }
  
  if (requestSchema.example) {
    section += '- Variables Example:\n```json\n' + JSON.stringify(requestSchema.example, null, 2) + '\n```\n';
  }
  
  return section + '\n';
}

/**
 * Helper function to build response section
 */
function buildResponseSection(responseSchemas: any[]): string {
  let section = '**Response Format:**\n';
  
  responseSchemas.forEach((response, index) => {
    if (responseSchemas.length > 1) {
      section += `Response ${index + 1} (Status: ${response.statusCode || 200}):\n`;
    }
    
    section += `- Status Code: ${response.statusCode || 200}\n`;
    section += `- Content-Type: ${response.contentType || 'application/json'}\n`;
    
    if (response.schema) {
      section += '- Schema:\n```json\n' + JSON.stringify(response.schema, null, 2) + '\n```\n';
    }
    
    if (response.example) {
      section += '- Example:\n```json\n' + JSON.stringify(response.example, null, 2) + '\n```\n';
    }
    
    section += '\n';
  });
  
  return section;
}

/**
 * Template for generating error handling documentation
 */
export function buildErrorHandlingPrompt(): string {
  return `Generate a comprehensive error handling section that covers:

1. **Common HTTP Status Codes:**
   - 400 Bad Request: Invalid parameters or malformed request
   - 401 Unauthorized: Authentication required or invalid credentials
   - 403 Forbidden: Insufficient permissions
   - 404 Not Found: Resource does not exist
   - 429 Too Many Requests: Rate limit exceeded
   - 500 Internal Server Error: Server-side error

2. **Error Response Format:**
   - Standard error response structure
   - Error codes and messages
   - Debugging information (when available)

3. **Best Practices:**
   - How to handle different error scenarios
   - Retry strategies for transient errors
   - Logging and monitoring recommendations

Please provide practical examples and actionable guidance for developers.`;
}

/**
 * Template for generating usage examples and best practices
 */
export function buildUsageExamplesPrompt(endpoint: Endpoint): string {
  return `Generate practical usage examples and best practices for the ${endpoint.method} ${endpoint.path} endpoint:

1. **Code Examples:**
   - cURL command examples
   - JavaScript/Node.js examples
   - Python examples
   - Any language-specific considerations

2. **Best Practices:**
   - Performance optimization tips
   - Security considerations
   - Rate limiting guidance
   - Caching strategies (if applicable)

3. **Common Use Cases:**
   - Typical integration scenarios
   - Workflow examples
   - Edge cases to consider

4. **Troubleshooting:**
   - Common issues and solutions
   - Debugging tips
   - Support resources

Focus on real-world, copy-paste ready examples that developers can immediately use in their applications.`;
}

/**
 * Template for generating API overview documentation
 */
export function buildApiOverviewPrompt(endpoints: Endpoint[]): string {
  const totalEndpoints = endpoints.length;
  const methodCounts = endpoints.reduce((acc, endpoint) => {
    acc[endpoint.method] = (acc[endpoint.method] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const authTypes = [...new Set(endpoints.map(e => e.auth?.type || AuthType.NONE))];
  
  return `Generate an API overview document for this API with ${totalEndpoints} endpoints:

**API Statistics:**
- Total Endpoints: ${totalEndpoints}
- Methods: ${Object.entries(methodCounts).map(([method, count]) => `${method} (${count})`).join(', ')}
- Authentication Types: ${authTypes.join(', ')}

**Requirements:**
1. Write an engaging introduction to the API
2. Explain the overall purpose and capabilities
3. Provide getting started guidance
4. Document authentication methods
5. Include rate limiting information
6. Add base URL and versioning information
7. Provide SDKs and client library information (if available)
8. Include support and contact information

**Structure the overview as:**
- Introduction and purpose
- Getting started guide
- Authentication overview
- Rate limits and quotas
- Base URLs and environments
- SDKs and tools
- Support and resources

Make it welcoming and helpful for developers who are new to the API.`;
}