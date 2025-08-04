import { Endpoint, ApiSpec, HttpMethod, AuthType } from '../models/types';

/**
 * Generates Slate-compatible Markdown documentation from API specifications
 */
export class MarkdownGenerator {
  private apiTitle: string;
  private apiVersion: string;
  private baseUrl: string | undefined;

  constructor(options: {
    title?: string;
    version?: string;
    baseUrl?: string;
  } = {}) {
    this.apiTitle = options.title || 'API Documentation';
    this.apiVersion = options.version || '1.0.0';
    this.baseUrl = options.baseUrl;
  }

  /**
   * Generates complete Markdown documentation from an API specification
   */
  public generate(apiSpec: ApiSpec): string {
    const sections: string[] = [];

    // Add frontmatter
    sections.push(this.generateFrontmatter());

    // Add title and introduction
    sections.push(this.generateHeader());
    sections.push(this.generateIntroduction());

    // Add authentication section if any endpoints require auth
    const hasAuth = apiSpec.some(endpoint => endpoint.auth && endpoint.auth.type !== AuthType.NONE);
    if (hasAuth) {
      sections.push(this.generateAuthenticationSection(apiSpec));
    }

    // Generate documentation for each endpoint
    const endpointSections = apiSpec.map(endpoint => this.generateEndpointSection(endpoint));
    sections.push(...endpointSections);

    // Add errors section
    sections.push(this.generateErrorsSection());

    return sections.join('\n\n');
  }

  /**
   * Generates the Slate frontmatter
   */
  private generateFrontmatter(): string {
    return `---
title: ${this.apiTitle}
language_tabs:
  - shell: Shell
  - javascript: JavaScript
  - python: Python
toc_footers:
  - <a href='https://github.com/traycerai/api-doc-generator'>Documentation Powered by Gemini CLI</a>
includes: []
search: true
theme: dark
---`;
  }

  /**
   * Generates the main header section
   */
  private generateHeader(): string {
    return `# ${this.apiTitle}

Welcome to the ${this.apiTitle}! You can use our API to access various endpoints and retrieve data.

We have language bindings in Shell (curl), JavaScript, and Python! You can view code examples in the dark area to the right, and you can switch the programming language of the examples with the tabs in the top right.`;
  }

  /**
   * Generates the introduction section
   */
  private generateIntroduction(): string {
    let intro = `## Introduction

This API documentation provides comprehensive information about available endpoints, request/response formats, and authentication methods.`;

    if (this.baseUrl) {
      intro += `\n\n**Base URL:** \`${this.baseUrl}\``;
    }

    if (this.apiVersion) {
      intro += `\n\n**API Version:** \`${this.apiVersion}\``;
    }

    return intro;
  }

  /**
   * Generates the authentication section
   */
  private generateAuthenticationSection(apiSpec: ApiSpec): string {
    const authTypes = new Set(
      apiSpec
        .filter(endpoint => endpoint.auth && endpoint.auth.type !== AuthType.NONE)
        .map(endpoint => endpoint.auth!.type)
    );

    let authSection = `## Authentication

This API uses the following authentication methods:`;

    authTypes.forEach(authType => {
      switch (authType) {
        case AuthType.BEARER:
          authSection += `\n\n### Bearer Token

The API expects a bearer token to be included in all API requests to the server in a header that looks like the following:

\`Authorization: Bearer YOUR_API_TOKEN\`

\`\`\`shell
curl "https://api.example.com/endpoint" \\
  -H "Authorization: Bearer YOUR_API_TOKEN"
\`\`\`

\`\`\`javascript
const response = await fetch('https://api.example.com/endpoint', {
  headers: {
    'Authorization': 'Bearer YOUR_API_TOKEN'
  }
});
\`\`\`

\`\`\`python
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_TOKEN'
}

response = requests.get('https://api.example.com/endpoint', headers=headers)
\`\`\``;
          break;

        case AuthType.API_KEY:
          authSection += `\n\n### API Key

The API expects an API key to be included in all API requests to the server in a header:

\`\`\`shell
curl "https://api.example.com/endpoint" \\
  -H "X-API-Key: YOUR_API_KEY"
\`\`\`

\`\`\`javascript
const response = await fetch('https://api.example.com/endpoint', {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
\`\`\`

\`\`\`python
import requests

headers = {
    'X-API-Key': 'YOUR_API_KEY'
}

response = requests.get('https://api.example.com/endpoint', headers=headers)
\`\`\``;
          break;

        case AuthType.BASIC:
          authSection += `\n\n### Basic Authentication

The API uses HTTP Basic Authentication. Include your credentials in the Authorization header:

\`\`\`shell
curl "https://api.example.com/endpoint" \\
  -u "username:password"
\`\`\`

\`\`\`javascript
const response = await fetch('https://api.example.com/endpoint', {
  headers: {
    'Authorization': 'Basic ' + btoa('username:password')
  }
});
\`\`\`

\`\`\`python
import requests
from requests.auth import HTTPBasicAuth

response = requests.get('https://api.example.com/endpoint', 
                       auth=HTTPBasicAuth('username', 'password'))
\`\`\``;
          break;
      }
    });

    return authSection;
  }

  /**
   * Generates documentation for a single endpoint
   */
  private generateEndpointSection(endpoint: Endpoint): string {
    const sections: string[] = [];

    // Endpoint title
    const title = this.generateEndpointTitle(endpoint);
    sections.push(title);

    // Description
    if (endpoint.description) {
      sections.push(endpoint.description);
    }

    // HTTP Request section
    sections.push(this.generateHttpRequestSection(endpoint));

    // Parameters section
    if (endpoint.parameters) {
      sections.push(this.generateParametersSection(endpoint));
    }

    // Request body section
    if (endpoint.requestSchema) {
      sections.push(this.generateRequestBodySection(endpoint));
    }

    // Code examples
    sections.push(this.generateCodeExamples(endpoint));

    // Response section
    if (endpoint.responseSchema && endpoint.responseSchema.length > 0) {
      sections.push(this.generateResponseSection(endpoint));
    }

    return sections.join('\n\n');
  }

  /**
   * Generates the endpoint title
   */
  private generateEndpointTitle(endpoint: Endpoint): string {
    const methodName = this.getMethodDisplayName(endpoint.method);
    const pathDisplay = endpoint.path.replace(/\{([^}]+)\}/g, '<$1>');
    
    let title = `## ${methodName} ${pathDisplay}`;
    
    if (endpoint.deprecated) {
      title += ' <span class="deprecated">DEPRECATED</span>';
    }

    return title;
  }

  /**
   * Generates the HTTP request section
   */
  private generateHttpRequestSection(endpoint: Endpoint): string {
    return `### HTTP Request

\`${endpoint.method} ${endpoint.path}\``;
  }

  /**
   * Generates the parameters section
   */
  private generateParametersSection(endpoint: Endpoint): string {
    const sections: string[] = ['### Parameters'];

    if (endpoint.parameters?.path && endpoint.parameters.path.length > 0) {
      sections.push('#### Path Parameters');
      sections.push('| Parameter | Type | Required | Description |');
      sections.push('|-----------|------|----------|-------------|');
      
      endpoint.parameters.path.forEach(param => {
        const required = param.required ? 'Yes' : 'No';
        const description = param.description || '';
        sections.push(`| ${param.name} | ${param.type} | ${required} | ${description} |`);
      });
    }

    if (endpoint.parameters?.query && endpoint.parameters.query.length > 0) {
      sections.push('#### Query Parameters');
      sections.push('| Parameter | Type | Required | Description |');
      sections.push('|-----------|------|----------|-------------|');
      
      endpoint.parameters.query.forEach(param => {
        const required = param.required ? 'Yes' : 'No';
        const description = param.description || '';
        sections.push(`| ${param.name} | ${param.type} | ${required} | ${description} |`);
      });
    }

    return sections.join('\n');
  }

  /**
   * Generates the request body section
   */
  private generateRequestBodySection(endpoint: Endpoint): string {
    const sections: string[] = ['### Request Body'];

    if (endpoint.requestSchema?.contentType) {
      sections.push(`**Content-Type:** \`${endpoint.requestSchema.contentType}\``);
    }

    if (endpoint.requestSchema?.example) {
      sections.push('#### Example Request Body');
      sections.push('```json');
      sections.push(JSON.stringify(endpoint.requestSchema.example, null, 2));
      sections.push('```');
    }

    return sections.join('\n\n');
  }

  /**
   * Generates code examples for the endpoint
   */
  private generateCodeExamples(endpoint: Endpoint): string {
    const sections: string[] = [];

    // Shell/curl example
    sections.push(this.generateCurlExample(endpoint));

    // JavaScript example
    sections.push(this.generateJavaScriptExample(endpoint));

    // Python example
    sections.push(this.generatePythonExample(endpoint));

    return sections.join('\n\n');
  }

  /**
   * Generates curl example
   */
  private generateCurlExample(endpoint: Endpoint): string {
    const url = this.baseUrl ? `${this.baseUrl}${endpoint.path}` : endpoint.path;
    let curlCommand = `curl -X ${endpoint.method} "${url}"`;

    // Add authentication
    if (endpoint.auth && endpoint.auth.type !== AuthType.NONE) {
      switch (endpoint.auth.type) {
        case AuthType.BEARER:
          curlCommand += ` \\\n  -H "Authorization: Bearer YOUR_API_TOKEN"`;
          break;
        case AuthType.API_KEY:
          const headerName = endpoint.auth.credentials?.headerName || 'X-API-Key';
          curlCommand += ` \\\n  -H "${headerName}: YOUR_API_KEY"`;
          break;
        case AuthType.BASIC:
          curlCommand += ` \\\n  -u "username:password"`;
          break;
      }
    }

    // Add content type for requests with body
    if (endpoint.requestSchema && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      const contentType = endpoint.requestSchema.contentType || 'application/json';
      curlCommand += ` \\\n  -H "Content-Type: ${contentType}"`;
    }

    // Add request body
    if (endpoint.requestSchema?.example && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      const body = JSON.stringify(endpoint.requestSchema.example);
      curlCommand += ` \\\n  -d '${body}'`;
    }

    return `\`\`\`shell
${curlCommand}
\`\`\``;
  }

  /**
   * Generates JavaScript example
   */
  private generateJavaScriptExample(endpoint: Endpoint): string {
    const url = this.baseUrl ? `${this.baseUrl}${endpoint.path}` : endpoint.path;
    let jsCode = `const response = await fetch('${url}', {\n  method: '${endpoint.method}'`;

    // Add headers
    const headers: string[] = [];
    
    if (endpoint.auth && endpoint.auth.type !== AuthType.NONE) {
      switch (endpoint.auth.type) {
        case AuthType.BEARER:
          headers.push("    'Authorization': 'Bearer YOUR_API_TOKEN'");
          break;
        case AuthType.API_KEY:
          const headerName = endpoint.auth.credentials?.headerName || 'X-API-Key';
          headers.push(`    '${headerName}': 'YOUR_API_KEY'`);
          break;
        case AuthType.BASIC:
          headers.push("    'Authorization': 'Basic ' + btoa('username:password')");
          break;
      }
    }

    if (endpoint.requestSchema && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      const contentType = endpoint.requestSchema.contentType || 'application/json';
      headers.push(`    'Content-Type': '${contentType}'`);
    }

    if (headers.length > 0) {
      jsCode += `,\n  headers: {\n${headers.join(',\n')}\n  }`;
    }

    // Add body
    if (endpoint.requestSchema?.example && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      jsCode += `,\n  body: JSON.stringify(${JSON.stringify(endpoint.requestSchema.example, null, 4)})`;
    }

    jsCode += '\n});';

    return `\`\`\`javascript
${jsCode}
\`\`\``;
  }

  /**
   * Generates Python example
   */
  private generatePythonExample(endpoint: Endpoint): string {
    const url = this.baseUrl ? `${this.baseUrl}${endpoint.path}` : endpoint.path;
    let pythonCode = `import requests\n`;

    // Add auth import if needed
    if (endpoint.auth?.type === AuthType.BASIC) {
      pythonCode += `from requests.auth import HTTPBasicAuth\n`;
    }

    pythonCode += `\n`;

    // Add headers
    const headers: string[] = [];
    
    if (endpoint.auth && endpoint.auth.type !== AuthType.NONE) {
      switch (endpoint.auth.type) {
        case AuthType.BEARER:
          headers.push("    'Authorization': 'Bearer YOUR_API_TOKEN'");
          break;
        case AuthType.API_KEY:
          const headerName = endpoint.auth.credentials?.headerName || 'X-API-Key';
          headers.push(`    '${headerName}': 'YOUR_API_KEY'`);
          break;
      }
    }

    if (endpoint.requestSchema && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      const contentType = endpoint.requestSchema.contentType || 'application/json';
      headers.push(`    'Content-Type': '${contentType}'`);
    }

    if (headers.length > 0) {
      pythonCode += `headers = {\n${headers.join(',\n')}\n}\n\n`;
    }

    // Build request
    const method = endpoint.method.toLowerCase();
    pythonCode += `response = requests.${method}('${url}'`;

    if (headers.length > 0) {
      pythonCode += `, headers=headers`;
    }

    if (endpoint.auth?.type === AuthType.BASIC) {
      pythonCode += `, auth=HTTPBasicAuth('username', 'password')`;
    }

    if (endpoint.requestSchema?.example && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      pythonCode += `, json=${JSON.stringify(endpoint.requestSchema.example, null, 4)}`;
    }

    pythonCode += ')';

    return `\`\`\`python
${pythonCode}
\`\`\``;
  }

  /**
   * Generates the response section
   */
  private generateResponseSection(endpoint: Endpoint): string {
    const sections: string[] = ['### Response'];

    endpoint.responseSchema?.forEach((response, index) => {
      const statusCode = response.statusCode || 200;
      const statusText = this.getStatusText(statusCode);
      
      if (endpoint.responseSchema!.length > 1) {
        sections.push(`#### ${statusCode} ${statusText}`);
      }

      if (response.contentType) {
        sections.push(`**Content-Type:** \`${response.contentType}\``);
      }

      if (response.example) {
        sections.push('```json');
        sections.push(JSON.stringify(response.example, null, 2));
        sections.push('```');
      }
    });

    return sections.join('\n\n');
  }

  /**
   * Generates the errors section
   */
  private generateErrorsSection(): string {
    return `## Errors

The API uses conventional HTTP response codes to indicate the success or failure of an API request. In general:

- Codes in the \`2xx\` range indicate success
- Codes in the \`4xx\` range indicate an error that failed given the information provided
- Codes in the \`5xx\` range indicate an error with our servers

### HTTP Status Code Summary

| Status Code | Meaning |
|-------------|---------|
| 200 | OK - Everything worked as expected |
| 400 | Bad Request - The request was unacceptable |
| 401 | Unauthorized - No valid API key provided |
| 402 | Request Failed - The parameters were valid but the request failed |
| 403 | Forbidden - The API key doesn't have permissions to perform the request |
| 404 | Not Found - The requested resource doesn't exist |
| 409 | Conflict - The request conflicts with another request |
| 429 | Too Many Requests - Too many requests hit the API too quickly |
| 500, 502, 503, 504 | Server Errors - Something went wrong on our end |

### Error Response Format

\`\`\`json
{
  "error": {
    "type": "invalid_request_error",
    "message": "Your request is invalid.",
    "param": "email"
  }
}
\`\`\``;
  }

  /**
   * Gets display name for HTTP method
   */
  private getMethodDisplayName(method: HttpMethod): string {
    const methodNames: Record<HttpMethod, string> = {
      [HttpMethod.GET]: 'Get',
      [HttpMethod.POST]: 'Create',
      [HttpMethod.PUT]: 'Update',
      [HttpMethod.PATCH]: 'Modify',
      [HttpMethod.DELETE]: 'Delete',
      [HttpMethod.HEAD]: 'Head',
      [HttpMethod.OPTIONS]: 'Options',
    };

    return methodNames[method] || method;
  }

  /**
   * Gets status text for HTTP status code
   */
  private getStatusText(statusCode: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };

    return statusTexts[statusCode] || 'Unknown';
  }
}