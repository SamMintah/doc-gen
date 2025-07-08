import { Config } from '../models/config.js';
import { ApiSpec } from '../models/types.js';
import { createScanner } from '../scanners/factory.js';
import { AIService } from '../ai/service.js';
import { MarkdownGenerator } from '../generators/markdown.js';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';

/**
 * Progress callback for tracking documentation generation steps
 */
export type ProgressCallback = (step: string, progress: number, total: number) => void;

/**
 * Result of documentation generation
 */
export interface GenerationResult {
  success: boolean;
  outputFile: string;
  endpointsProcessed: number;
  tokensUsed: number;
  duration: number;
  error?: string;
}

/**
 * Application error types
 */
export class AppError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class ScanningError extends AppError {
  constructor(message: string) {
    super(message, 'SCANNING_ERROR');
    this.name = 'ScanningError';
  }
}

export class AIProcessingError extends AppError {
  constructor(message: string) {
    super(message, 'AI_PROCESSING_ERROR');
    this.name = 'AIProcessingError';
  }
}

export class OutputError extends AppError {
  constructor(message: string) {
    super(message, 'OUTPUT_ERROR');
    this.name = 'OutputError';
  }
}

/**
 * Main application orchestration function that coordinates the entire documentation generation process
 * 
 * @param config - Configuration object containing all settings and options
 * @param progressCallback - Optional callback for progress updates
 * @returns Promise resolving to generation result
 */
export async function generateDocumentation(
  config: Config,
  progressCallback?: ProgressCallback
): Promise<GenerationResult> {
  const startTime = Date.now();
  let apiSpec: ApiSpec = [];
  let tokensUsed = 0;

  try {
    // Validate configuration
    progressCallback?.('Validating configuration...', 0, 100);
    await validateConfiguration(config);

    // Step 1: Create and configure scanner (10% progress)
    progressCallback?.('Initializing scanner...', 10, 100);
    const scanner = await createScannerWithValidation(config);

    // Step 2: Scan API to get specification (30% progress)
    progressCallback?.('Scanning API endpoints...', 20, 100);
    apiSpec = await scanApiWithErrorHandling(scanner, config);
    
    if (apiSpec.length === 0) {
      throw new ScanningError('No API endpoints were discovered. Please check your configuration and ensure the API is accessible.');
    }

    progressCallback?.(`Found ${apiSpec.length} endpoints`, 30, 100);

    // Step 3: Initialize AI service (40% progress)
    progressCallback?.('Initializing AI service...', 40, 100);
    const aiService = await initializeAIService(config);

    // Step 4: Generate enhanced documentation with AI (70% progress)
    progressCallback?.('Generating AI-enhanced documentation...', 50, 100);
    const enhancedApiSpec = await generateAIDocumentation(
      aiService,
      apiSpec,
      (current, total, message) => {
        const aiProgress = 50 + Math.floor((current / total) * 20); // 50-70% range
        progressCallback?.(message, aiProgress, 100);
      }
    );

    tokensUsed = aiService.getTokenUsage().totalTokens;

    // Step 5: Generate Markdown output (80% progress)
    progressCallback?.('Generating Markdown documentation...', 80, 100);
    const markdownContent = await generateMarkdownOutput(enhancedApiSpec, config);

    // Step 6: Write output file (90% progress)
    progressCallback?.('Writing output file...', 90, 100);
    await writeOutputFile(markdownContent, config.outputFile);

    // Complete (100% progress)
    const duration = Date.now() - startTime;
    progressCallback?.('Documentation generation complete!', 100, 100);

    return {
      success: true,
      outputFile: config.outputFile,
      endpointsProcessed: apiSpec.length,
      tokensUsed,
      duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Log error details if debug mode is enabled
    if (config.debug) {
      console.error('[App] Error details:', error);
    }

    return {
      success: false,
      outputFile: config.outputFile,
      endpointsProcessed: apiSpec.length,
      tokensUsed,
      duration,
      error: errorMessage,
    };
  }
}

/**
 * Validates the configuration object and ensures all required settings are present
 */
async function validateConfiguration(config: Config): Promise<void> {
  if (!config) {
    throw new ConfigurationError('Configuration object is required');
  }

  // Validate required fields
  if (!config.mode) {
    throw new ConfigurationError('Scanning mode is required');
  }

  if (!config.apiType) {
    throw new ConfigurationError('API type is required');
  }

  if (!config.outputFile) {
    throw new ConfigurationError('Output file path is required');
  }

  if (!config.openaiApiKey) {
    throw new ConfigurationError('OpenAI API key is required');
  }

  // Validate mode-specific requirements
  if (config.mode === 'live' && !config.url) {
    throw new ConfigurationError('URL is required for live scanning mode');
  }

  // Validate output file path
  try {
    const outputDir = dirname(config.outputFile);
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    throw new ConfigurationError(`Cannot create output directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Validate OpenAI API key format
  if (!config.openaiApiKey.startsWith('sk-')) {
    throw new ConfigurationError('OpenAI API key appears to be invalid (should start with "sk-")');
  }
}

/**
 * Creates and validates the scanner instance
 */
async function createScannerWithValidation(config: Config) {
  try {
    const scanner = createScanner(config);
    
    // Additional validation could be added here
    // For example, testing connectivity for live scanners
    
    return scanner;
  } catch (error) {
    if (error instanceof Error && error.name === 'ScannerCreationError') {
      throw new ConfigurationError(`Scanner creation failed: ${error.message}`);
    }
    throw new ConfigurationError(`Failed to create scanner: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Scans the API with proper error handling and retries
 */
async function scanApiWithErrorHandling(scanner: any, config: Config): Promise<ApiSpec> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (config.verbose && attempt > 1) {
        console.log(`[App] Scanning attempt ${attempt}/${maxRetries}`);
      }

      const apiSpec = await scanner.scan();
      
      if (!Array.isArray(apiSpec)) {
        throw new ScanningError('Scanner returned invalid API specification (not an array)');
      }

      return apiSpec;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown scanning error');
      
      if (config.verbose) {
        console.warn(`[App] Scanning attempt ${attempt} failed:`, lastError.message);
      }

      // Don't retry on configuration errors
      if (error instanceof Error && (
        error.message.includes('authentication') ||
        error.message.includes('unauthorized') ||
        error.message.includes('forbidden') ||
        error.message.includes('not found')
      )) {
        break;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new ScanningError(`API scanning failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Initializes and validates the AI service
 */
async function initializeAIService(config: Config): Promise<AIService> {
  try {
    const aiService = new AIService(config);
    
    // Validate AI service connection
    const isValid = await aiService.validateService();
    if (!isValid) {
      throw new AIProcessingError('Failed to connect to OpenAI API. Please check your API key and internet connection.');
    }

    return aiService;
  } catch (error) {
    if (error instanceof AIProcessingError) {
      throw error;
    }
    throw new AIProcessingError(`AI service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates AI-enhanced documentation with progress tracking
 */
async function generateAIDocumentation(
  aiService: AIService,
  apiSpec: ApiSpec,
  progressCallback?: (current: number, total: number, message: string) => void
): Promise<any> {
  try {
    // Check if we're approaching token limits before starting
    if (aiService.isApproachingTokenLimit()) {
      console.warn('[App] Warning: Approaching OpenAI token limits. Consider processing fewer endpoints or using a different model.');
    }

    const enhancedApiSpec = await aiService.generateDocumentation(
      apiSpec,
      progressCallback
    );

    if (!enhancedApiSpec || enhancedApiSpec.length === 0) {
      throw new AIProcessingError('AI service returned empty or invalid enhanced specification');
    }

    return enhancedApiSpec;
  } catch (error) {
    // Handle specific AI errors
    if (error instanceof Error) {
      if (error.message.includes('token')) {
        throw new AIProcessingError(`Token limit exceeded: ${error.message}. Consider reducing the number of endpoints or using a different model.`);
      }
      if (error.message.includes('rate limit')) {
        throw new AIProcessingError(`Rate limit exceeded: ${error.message}. Please wait and try again later.`);
      }
      if (error.message.includes('API key')) {
        throw new AIProcessingError(`API key error: ${error.message}. Please check your OpenAI API key.`);
      }
    }

    throw new AIProcessingError(`AI documentation generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates Markdown output from enhanced API specification
 */
async function generateMarkdownOutput(enhancedApiSpec: any, config: Config): Promise<string> {
  try {
    const markdownGenerator = new MarkdownGenerator({
      title: config.title || 'API Documentation',
      version: config.version || '1.0.0',
      baseUrl: config.url,
    });

    const markdownContent = markdownGenerator.generate(enhancedApiSpec);

    if (!markdownContent || markdownContent.trim().length === 0) {
      throw new OutputError('Generated Markdown content is empty');
    }

    return markdownContent;
  } catch (error) {
    throw new OutputError(`Markdown generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Writes the generated content to the output file
 */
async function writeOutputFile(content: string, outputPath: string): Promise<void> {
  try {
    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });

    // Write the file
    await writeFile(outputPath, content, 'utf8');

    // Verify the file was written correctly
    const stats = await import('fs/promises').then(fs => fs.stat(outputPath));
    if (stats.size === 0) {
      throw new OutputError('Output file was created but is empty');
    }
  } catch (error) {
    if (error instanceof OutputError) {
      throw error;
    }
    throw new OutputError(`Failed to write output file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Utility function to format duration in human-readable format
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  return `${seconds}s`;
}

/**
 * Utility function to format token usage
 */
export function formatTokenUsage(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`;
  }
  
  const kTokens = (tokens / 1000).toFixed(1);
  return `${kTokens}k tokens`;
}

/**
 * Get a summary of the generation process for logging/reporting
 */
export function getGenerationSummary(result: GenerationResult): string {
  const duration = formatDuration(result.duration);
  const tokens = formatTokenUsage(result.tokensUsed);
  
  if (result.success) {
    return `✅ Successfully generated documentation for ${result.endpointsProcessed} endpoints in ${duration} using ${tokens}. Output: ${result.outputFile}`;
  } else {
    return `❌ Documentation generation failed after ${duration}. Error: ${result.error}`;
  }
}

/**
 * Validate that all required dependencies are available
 */
export async function validateDependencies(): Promise<{ valid: boolean; missing: string[] }> {
  const missing: string[] = [];

  // Check for required modules
  try {
    await import('../scanners/factory.js');
  } catch {
    missing.push('Scanner factory');
  }

  try {
    await import('../ai/service.js');
  } catch {
    missing.push('AI service');
  }

  try {
    await import('../generators/markdown.js');
  } catch {
    missing.push('Markdown generator');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get application health status
 */
export async function getHealthStatus(config: Config): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{ name: string; status: 'pass' | 'fail'; message?: string }>;
}> {
  const checks: Array<{ name: string; status: 'pass' | 'fail'; message?: string }> = [];

  // Check dependencies
  const deps = await validateDependencies();
  checks.push({
    name: 'Dependencies',
    status: deps.valid ? 'pass' : 'fail',
    message: deps.valid ? undefined : `Missing: ${deps.missing.join(', ')}`,
  });

  // Check OpenAI API key
  checks.push({
    name: 'OpenAI API Key',
    status: config.openaiApiKey && config.openaiApiKey.startsWith('sk-') ? 'pass' : 'fail',
    message: !config.openaiApiKey ? 'Not provided' : !config.openaiApiKey.startsWith('sk-') ? 'Invalid format' : undefined,
  });

  // Check output directory
  try {
    const outputDir = dirname(config.outputFile);
    await mkdir(outputDir, { recursive: true });
    checks.push({ name: 'Output Directory', status: 'pass' });
  } catch (error) {
    checks.push({
      name: 'Output Directory',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Determine overall status
  const failedChecks = checks.filter(check => check.status === 'fail');
  let status: 'healthy' | 'degraded' | 'unhealthy';
  
  if (failedChecks.length === 0) {
    status = 'healthy';
  } else if (failedChecks.length === 1) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return { status, checks };
}