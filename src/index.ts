// Main exports for programmatic use of the doc-gen package
export { generateDocumentation } from './core/app.js';
export type { 
  ProgressCallback, 
  GenerationResult,
  AppError,
  ConfigurationError,
  ScanningError,
  AIProcessingError,
  OutputError
} from './core/app.js';

// Configuration exports
export { ConfigBuilder } from './models/config.js';
export type { Config, CliArgs } from './models/config.js';
export { ScanMode, ApiType } from './models/config.js';
export type { ErrorHandlingConfig } from './models/config.js';

// Type exports from models/types.ts (if available)
export type { 
  AuthType, 
  SecurityConfig, 
  ValidationConfig, 
  PrivacyLevel, 
  ValidationLevel 
} from './models/types.js';

// LLM provider exports
export { LLMProvider } from './llm/interfaces.js';

// Utility functions for external use
export { 
  formatDuration, 
  formatTokenUsage, 
  getGenerationSummary,
  validateDependencies,
  getHealthStatus
} from './core/app.js';

// Re-export commonly used types for API specifications
export type { ApiSpec } from './models/types.js';