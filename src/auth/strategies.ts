import { IAuthStrategy, RequestConfig } from '@/interfaces/auth';
import { AuthInfo, AuthType } from '@/models/types';

/**
 * No authentication strategy - performs no authentication
 */
export class NoAuth implements IAuthStrategy {
  applyAuth(config: RequestConfig): RequestConfig {
    // No authentication to apply
    return config;
  }

  async validate(): Promise<boolean> {
    // No auth always validates successfully
    return true;
  }

  getAuthInfo(): AuthInfo {
    return {
      type: AuthType.NONE,
      description: 'No authentication required'
    };
  }

  getDescription(): string {
    return 'No Authentication';
  }
}

/**
 * Bearer token authentication strategy
 */
export class BearerTokenAuth implements IAuthStrategy {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  applyAuth(config: RequestConfig): RequestConfig {
    return {
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${this.token}`
      }
    };
  }

  async validate(): Promise<boolean> {
    // Basic validation - check if token exists and is not empty
    return Boolean(this.token && this.token.trim().length > 0);
  }

  getAuthInfo(): AuthInfo {
    return {
      type: AuthType.BEARER,
      credentials: {
        token: this.token
      },
      description: 'Bearer token authentication'
    };
  }

  getDescription(): string {
    return 'Bearer Token';
  }
}

/**
 * API Key authentication strategy
 */
export class ApiKeyAuth implements IAuthStrategy {
  private apiKey: string;
  private headerName: string;

  constructor(apiKey: string, headerName: string = 'X-API-Key') {
    this.apiKey = apiKey;
    this.headerName = headerName;
  }

  applyAuth(config: RequestConfig): RequestConfig {
    return {
      ...config,
      headers: {
        ...config.headers,
        [this.headerName]: this.apiKey
      }
    };
  }

  async validate(): Promise<boolean> {
    // Basic validation - check if API key exists and is not empty
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getAuthInfo(): AuthInfo {
    return {
      type: AuthType.API_KEY,
      credentials: {
        apiKey: this.apiKey,
        headerName: this.headerName
      },
      description: `API key authentication via ${this.headerName} header`
    };
  }

  getDescription(): string {
    return `API Key (${this.headerName})`;
  }
}

/**
 * Basic authentication strategy
 */
export class BasicAuth implements IAuthStrategy {
  private username: string;
  private password: string;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  applyAuth(config: RequestConfig): RequestConfig {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    
    return {
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Basic ${credentials}`
      }
    };
  }

  async validate(): Promise<boolean> {
    // Basic validation - check if both username and password exist and are not empty
    return Boolean(
      this.username && 
      this.username.trim().length > 0 && 
      this.password && 
      this.password.trim().length > 0
    );
  }

  getAuthInfo(): AuthInfo {
    return {
      type: AuthType.BASIC,
      credentials: {
        username: this.username,
        password: this.password
      },
      description: 'Basic authentication with username and password'
    };
  }

  getDescription(): string {
    return 'Basic Authentication';
  }
}