/**
 * Core abstraction interfaces for LLM providers
 * Provides a unified interface for different LLM providers (OpenAI, Anthropic, Gemini, etc.)
 */

/**
 * Supported LLM providers
 */
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GEMINI = 'gemini',
  COHERE = 'cohere',
  HUGGINGFACE = 'huggingface',
}

/**
 * Token usage tracking interface
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * LLM response interface
 */
export interface LLMResponse {
  content: string;
  tokensUsed: number;
  model: string;
}

/**
 * Provider-specific configuration interface
 */
export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any; // Allow provider-specific options
}

/**
 * Base LLM client error class
 */
export class LLMClientError extends Error {
  constructor(message: string, public readonly code?: string, public readonly provider?: LLMProvider) {
    super(message);
    this.name = 'LLMClientError';
  }
}

/**
 * Rate limit error for LLM providers
 */
export class LLMRateLimitError extends LLMClientError {
  constructor(
    message: string, 
    public readonly retryAfter?: number, 
    provider?: LLMProvider
  ) {
    super(message, 'RATE_LIMIT', provider);
    this.name = 'LLMRateLimitError';
  }
}

/**
 * Authentication error for LLM providers
 */
export class LLMAuthenticationError extends LLMClientError {
  constructor(message: string, provider?: LLMProvider) {
    super(message, 'AUTHENTICATION', provider);
    this.name = 'LLMAuthenticationError';
  }
}

/**
 * Server error for LLM providers
 */
export class LLMServerError extends LLMClientError {
  constructor(message: string, public readonly status?: number, provider?: LLMProvider) {
    super(message, 'SERVER_ERROR', provider);
    this.name = 'LLMServerError';
  }
}

/**
 * Core LLM client interface that all providers must implement
 */
export interface LLMClient {
  /**
   * Generate documentation text from a prompt
   * @param prompt The user prompt for documentation generation
   * @param systemPrompt Optional system prompt to guide the model
   * @param preferredModel Optional model to use (provider-specific)
   * @returns Promise resolving to LLM response with generated content
   */
  generateDocumentation(
    prompt: string,
    systemPrompt?: string,
    preferredModel?: string
  ): Promise<LLMResponse>;

  /**
   * Generate multiple documentation pieces with batching
   * @param prompts Array of prompt objects with user and optional system prompts
   * @param preferredModel Optional model to use for all requests
   * @returns Promise resolving to array of LLM responses
   */
  generateBatch(
    prompts: Array<{ prompt: string; systemPrompt?: string }>,
    preferredModel?: string
  ): Promise<LLMResponse[]>;

  /**
   * Validate that the client is properly configured and can connect
   * @returns Promise resolving to true if connection is valid, false otherwise
   */
  validateConnection(): Promise<boolean>;

  /**
   * Get current token usage statistics
   * @returns Current token usage data
   */
  getTokenUsage(): TokenUsage;

  /**
   * Reset token usage statistics to zero
   */
  resetTokenUsage(): void;

  /**
   * Estimate token count for a given text string
   * @param text The text to estimate tokens for
   * @returns Estimated number of tokens
   */
  estimateTokenCount(text: string): number;

  /**
   * Check if the client is approaching token limits
   * @returns True if approaching limits, false otherwise
   */
  isApproachingTokenLimit(): boolean;
}