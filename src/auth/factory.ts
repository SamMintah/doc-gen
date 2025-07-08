import { IAuthStrategy } from '@/interfaces/auth';
import { AuthInfo, AuthType } from '@/models/types';
import { NoAuth, BearerTokenAuth, ApiKeyAuth, BasicAuth } from './strategies';

/**
 * Configuration for creating authentication strategies
 */
export interface AuthConfig {
  type: AuthType;
  token?: string;
  apiKey?: string;
  headerName?: string;
  username?: string;
  password?: string;
}

/**
 * Error thrown when authentication configuration is invalid
 */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

/**
 * Factory function to create appropriate authentication strategy instances
 * 
 * @param config - Authentication configuration object
 * @returns IAuthStrategy implementation based on the configuration
 * @throws AuthConfigError when required credentials are missing or invalid
 */
export function createAuthStrategy(config: AuthConfig): IAuthStrategy {
  switch (config.type) {
    case AuthType.NONE:
      return new NoAuth();

    case AuthType.BEARER:
      if (!config.token || config.token.trim().length === 0) {
        throw new AuthConfigError('Bearer token is required for bearer authentication');
      }
      return new BearerTokenAuth(config.token);

    case AuthType.API_KEY:
      if (!config.apiKey || config.apiKey.trim().length === 0) {
        throw new AuthConfigError('API key is required for API key authentication');
      }
      // Use provided header name or default to 'X-API-Key'
      const headerName = config.headerName || 'X-API-Key';
      return new ApiKeyAuth(config.apiKey, headerName);

    case AuthType.BASIC:
      if (!config.username || config.username.trim().length === 0) {
        throw new AuthConfigError('Username is required for basic authentication');
      }
      if (!config.password || config.password.trim().length === 0) {
        throw new AuthConfigError('Password is required for basic authentication');
      }
      return new BasicAuth(config.username, config.password);

    default:
      throw new AuthConfigError(`Unsupported authentication type: ${config.type}`);
  }
}

/**
 * Factory function to create authentication strategy from AuthInfo object
 * 
 * @param authInfo - AuthInfo object containing authentication details
 * @returns IAuthStrategy implementation based on the AuthInfo
 * @throws AuthConfigError when required credentials are missing or invalid
 */
export function createAuthStrategyFromAuthInfo(authInfo: AuthInfo): IAuthStrategy {
  const config: AuthConfig = {
    type: authInfo.type,
    token: authInfo.credentials?.token,
    apiKey: authInfo.credentials?.apiKey,
    headerName: authInfo.credentials?.headerName,
    username: authInfo.credentials?.username,
    password: authInfo.credentials?.password,
  };

  return createAuthStrategy(config);
}

/**
 * Utility function to validate authentication configuration without creating the strategy
 * 
 * @param config - Authentication configuration to validate
 * @returns true if configuration is valid, false otherwise
 */
export function validateAuthConfig(config: AuthConfig): boolean {
  try {
    createAuthStrategy(config);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get a list of supported authentication types
 * 
 * @returns Array of supported AuthType values
 */
export function getSupportedAuthTypes(): AuthType[] {
  return Object.values(AuthType);
}

/**
 * Get human-readable descriptions for all supported authentication types
 * 
 * @returns Record mapping AuthType to description string
 */
export function getAuthTypeDescriptions(): Record<AuthType, string> {
  return {
    [AuthType.NONE]: 'No authentication required',
    [AuthType.BEARER]: 'Bearer token authentication (Authorization: Bearer <token>)',
    [AuthType.API_KEY]: 'API key authentication via custom header',
    [AuthType.BASIC]: 'Basic authentication with username and password',
  };
}