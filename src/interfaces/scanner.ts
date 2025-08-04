import { ApiSpec } from '../models/types';

/**
 * Interface that all scanner implementations must implement.
 * Provides a consistent API for discovering and analyzing API endpoints
 * across different scanning strategies (live APIs, code analysis, etc.).
 */
export interface IScanner {
  /**
   * Scans the target source (live API, codebase, etc.) and returns
   * a specification of all discovered API endpoints.
   * 
   * @returns Promise that resolves to an ApiSpec containing all discovered endpoints
   * @throws Error if scanning fails or encounters unrecoverable errors
   */
  scan(): Promise<ApiSpec>;
}