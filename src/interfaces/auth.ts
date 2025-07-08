import { AuthInfo } from '@/models/types';

/**
 * Interface for HTTP request configuration that can be modified by auth strategies
 */
export interface RequestConfig {
  headers: Record<string, string>;
  url?: string;
  params?: Record<string, any>;
}

/**
 * Interface for authentication strategy implementations
 * 
 * This interface defines the contract that all authentication strategies must implement.
 * It allows the system to handle various authentication schemes in a pluggable manner.
 */
export interface IAuthStrategy {
  /**
   * Apply authentication to an HTTP request configuration
   * 
   * @param config - The request configuration to modify
   * @returns The modified request configuration with authentication applied
   */
  applyAuth(config: RequestConfig): RequestConfig;

  /**
   * Validate that the authentication credentials are properly configured
   * 
   * @returns Promise that resolves to true if credentials are valid, false otherwise
   */
  validate(): Promise<boolean>;

  /**
   * Get the authentication information associated with this strategy
   * 
   * @returns AuthInfo object describing the authentication method and credentials
   */
  getAuthInfo(): AuthInfo;

  /**
   * Get a human-readable description of the authentication method
   * 
   * @returns String description of the auth method (e.g., "Bearer Token", "API Key")
   */
  getDescription(): string;
}