import { Config, ScanMode, ApiType } from '@/models/config';
import { IScanner } from '@/interfaces/scanner';
import { LiveRestScanner } from './live-rest';
import { GraphQLScanner } from './graphql';

/**
 * Error thrown when scanner creation fails due to configuration issues
 */
export class ScannerCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScannerCreationError';
  }
}

/**
 * Factory function that creates the appropriate scanner instance based on configuration
 * 
 * @param config - Configuration object containing scanning mode, API type, and other settings
 * @returns IScanner implementation appropriate for the given configuration
 * @throws ScannerCreationError if configuration is invalid or unsupported
 */
export function createScanner(config: Config): IScanner {
  // Validate required configuration
  validateConfig(config);

  // Create scanner based on mode and API type
  switch (config.mode) {
    case ScanMode.LIVE:
      return createLiveScanner(config);
    
    case ScanMode.CODE:
      return createCodeScanner(config);
    
    default:
      throw new ScannerCreationError(
        `Unsupported scanning mode: ${config.mode}. ` +
        `Supported modes are: ${Object.values(ScanMode).join(', ')}`
      );
  }
}

/**
 * Creates a scanner for live API scanning
 */
function createLiveScanner(config: Config): IScanner {
  // Validate live mode requirements
  if (!config.url) {
    throw new ScannerCreationError(
      'URL is required for live API scanning. Please provide a valid API endpoint URL.'
    );
  }

  // Create scanner based on API type
  switch (config.apiType) {
    case ApiType.REST:
      return new LiveRestScanner(config);
    
    case ApiType.GRAPHQL:
      return new GraphQLScanner(config);
    
    default:
      throw new ScannerCreationError(
        `Unsupported API type for live scanning: ${config.apiType}. ` +
        `Supported types are: ${Object.values(ApiType).join(', ')}`
      );
  }
}

/**
 * Creates a scanner for code-based scanning
 */
function createCodeScanner(config: Config): IScanner {
  // Code scanning is not yet implemented
  throw new ScannerCreationError(
    'Code-based scanning is not yet implemented. ' +
    'Please use live scanning mode with --mode live.'
  );
  
  // Future implementation would look like:
  // switch (config.apiType) {
  //   case ApiType.REST:
  //     return new CodeRestScanner(config);
  //   case ApiType.GRAPHQL:
  //     return new CodeGraphQLScanner(config);
  //   default:
  //     throw new ScannerCreationError(
  //       `Unsupported API type for code scanning: ${config.apiType}`
  //     );
  // }
}

/**
 * Validates the configuration object for scanner creation
 */
function validateConfig(config: Config): void {
  if (!config) {
    throw new ScannerCreationError('Configuration object is required');
  }

  if (!config.mode) {
    throw new ScannerCreationError('Scanning mode is required');
  }

  if (!config.apiType) {
    throw new ScannerCreationError('API type is required');
  }

  // Validate mode-specific requirements
  if (config.mode === ScanMode.LIVE) {
    validateLiveConfig(config);
  } else if (config.mode === ScanMode.CODE) {
    validateCodeConfig(config);
  }
}

/**
 * Validates configuration specific to live scanning
 */
function validateLiveConfig(config: Config): void {
  if (!config.url) {
    throw new ScannerCreationError(
      'URL is required for live API scanning. ' +
      'Please provide the base URL of the API you want to scan.'
    );
  }

  // Validate URL format
  try {
    new URL(config.url);
  } catch {
    throw new ScannerCreationError(
      `Invalid URL format: ${config.url}. ` +
      'Please provide a valid HTTP or HTTPS URL.'
    );
  }

  // Validate authentication configuration if provided
  if (config.token && !config.authType) {
    throw new ScannerCreationError(
      'Authentication type is required when providing a token. ' +
      'Please specify --auth-type (bearer, apikey, or basic).'
    );
  }

  if (config.authType === 'apikey' && !config.authHeaderName) {
    throw new ScannerCreationError(
      'Header name is required for API key authentication. ' +
      'Please specify --auth-header-name (e.g., "X-API-Key").'
    );
  }

  // Validate timeout and rate limit values
  if (config.timeout !== undefined && config.timeout < 1000) {
    throw new ScannerCreationError(
      'Timeout must be at least 1000ms (1 second)'
    );
  }

  if (config.rateLimit !== undefined && config.rateLimit < 1) {
    throw new ScannerCreationError(
      'Rate limit must be at least 1 request per second'
    );
  }

  if (config.maxDepth !== undefined && config.maxDepth < 1) {
    throw new ScannerCreationError(
      'Maximum depth must be at least 1'
    );
  }
}

/**
 * Validates configuration specific to code scanning
 */
function validateCodeConfig(config: Config): void {
  // Future implementation for code scanning validation
  // This would validate things like:
  // - Source code directory path
  // - File patterns to scan
  // - Framework-specific configuration
  
  throw new ScannerCreationError(
    'Code scanning is not yet implemented. ' +
    'This feature will be available in a future version.'
  );
}

/**
 * Gets a list of supported scanner combinations
 */
export function getSupportedScanners(): Array<{
  mode: ScanMode;
  apiType: ApiType;
  description: string;
  implemented: boolean;
}> {
  return [
    {
      mode: ScanMode.LIVE,
      apiType: ApiType.REST,
      description: 'Scan live REST APIs by making HTTP requests',
      implemented: true,
    },
    {
      mode: ScanMode.LIVE,
      apiType: ApiType.GRAPHQL,
      description: 'Scan live GraphQL APIs using introspection',
      implemented: true,
    },
    {
      mode: ScanMode.CODE,
      apiType: ApiType.REST,
      description: 'Scan REST API code from source files',
      implemented: false,
    },
    {
      mode: ScanMode.CODE,
      apiType: ApiType.GRAPHQL,
      description: 'Scan GraphQL schema from source files',
      implemented: false,
    },
  ];
}

/**
 * Checks if a scanner combination is supported
 */
export function isScannerSupported(mode: ScanMode, apiType: ApiType): boolean {
  const supported = getSupportedScanners();
  return supported.some(
    scanner => 
      scanner.mode === mode && 
      scanner.apiType === apiType && 
      scanner.implemented
  );
}

/**
 * Gets a human-readable description of what scanners are available
 */
export function getScannerHelp(): string {
  const supported = getSupportedScanners();
  const implemented = supported.filter(s => s.implemented);
  const notImplemented = supported.filter(s => !s.implemented);

  let help = 'Available scanners:\n\n';
  
  implemented.forEach(scanner => {
    help += `✓ --mode ${scanner.mode} --type ${scanner.apiType}\n`;
    help += `  ${scanner.description}\n\n`;
  });

  if (notImplemented.length > 0) {
    help += 'Coming soon:\n\n';
    notImplemented.forEach(scanner => {
      help += `⏳ --mode ${scanner.mode} --type ${scanner.apiType}\n`;
      help += `  ${scanner.description}\n\n`;
    });
  }

  return help;
}