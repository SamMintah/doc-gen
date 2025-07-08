import OpenAI from 'openai';
import { Config } from '../models/config.js';

/**
 * Supported OpenAI models for documentation generation
 */
export enum OpenAIModel {
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo-preview',
  GPT_3_5_TURBO = 'gpt-3.5-turbo',
}

/**
 * OpenAI API response interface
 */
export interface OpenAIResponse {
  content: string;
  tokensUsed: number;
  model: string;
}

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Token usage tracking
 */
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * OpenAI client error types
 */
export class OpenAIClientError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'OpenAIClientError';
  }
}

export class OpenAIRateLimitError extends OpenAIClientError {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message, 'RATE_LIMIT');
    this.name = 'OpenAIRateLimitError';
  }
}

export class OpenAIAuthenticationError extends OpenAIClientError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION');
    this.name = 'OpenAIAuthenticationError';
  }
}

/**
 * OpenAI client wrapper with rate limiting, error handling, and retry logic
 */
export class OpenAIClient {
  private client: OpenAI;
  private rateLimitConfig: RateLimitConfig;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private lastRequestTime = 0;
  private tokenUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor(private config: Config) {
    this.validateApiKey();
    this.client = new OpenAI({
      apiKey: this.config.openaiApiKey,
    });

    // Configure rate limiting based on OpenAI's limits
    this.rateLimitConfig = {
      requestsPerMinute: 3500, // Conservative limit for GPT-4
      tokensPerMinute: 40000, // Conservative token limit
      maxRetries: 3,
      retryDelay: 1000, // 1 second base delay
    };
  }

  /**
   * Validate the OpenAI API key format and environment
   */
  private validateApiKey(): void {
    const apiKey = this.config.openaiApiKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new OpenAIAuthenticationError(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or provide --openai-key argument.'
      );
    }

    if (!apiKey.startsWith('sk-')) {
      throw new OpenAIAuthenticationError(
        'Invalid OpenAI API key format. API keys should start with "sk-".'
      );
    }

    if (apiKey.length < 20) {
      throw new OpenAIAuthenticationError(
        'OpenAI API key appears to be too short. Please check your API key.'
      );
    }
  }

  /**
   * Generate documentation text from endpoint data
   */
  async generateDocumentation(
    prompt: string,
    systemPrompt?: string,
    preferredModel: OpenAIModel = OpenAIModel.GPT_4
  ): Promise<OpenAIResponse> {
    return this.executeWithRetry(async () => {
      const model = await this.selectModel(preferredModel);
      
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ];

      if (this.config.debug) {
        console.log(`[OpenAI] Using model: ${model}`);
        console.log(`[OpenAI] System prompt length: ${systemPrompt?.length || 0}`);
        console.log(`[OpenAI] User prompt length: ${prompt.length}`);
      }

      const completion = await this.client.chat.completions.create({
        model,
        messages,
        temperature: 0.3, // Lower temperature for more consistent documentation
        max_tokens: 4000, // Reasonable limit for documentation
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
      });

      const choice = completion.choices[0];
      if (!choice?.message?.content) {
        throw new OpenAIClientError('No content received from OpenAI API');
      }

      // Track token usage
      if (completion.usage) {
        this.tokenUsage.promptTokens += completion.usage.prompt_tokens;
        this.tokenUsage.completionTokens += completion.usage.completion_tokens;
        this.tokenUsage.totalTokens += completion.usage.total_tokens;
      }

      if (this.config.verbose) {
        console.log(`[OpenAI] Generated ${choice.message.content.length} characters`);
        console.log(`[OpenAI] Tokens used: ${completion.usage?.total_tokens || 0}`);
      }

      return {
        content: choice.message.content,
        tokensUsed: completion.usage?.total_tokens || 0,
        model,
      };
    });
  }

  /**
   * Generate multiple documentation pieces with batching
   */
  async generateBatch(
    prompts: Array<{ prompt: string; systemPrompt?: string }>,
    preferredModel: OpenAIModel = OpenAIModel.GPT_4
  ): Promise<OpenAIResponse[]> {
    const results: OpenAIResponse[] = [];
    const batchSize = 5; // Process in small batches to avoid overwhelming the API

    for (let i = 0; i < prompts.length; i += batchSize) {
      const batch = prompts.slice(i, i + batchSize);
      
      if (this.config.verbose) {
        console.log(`[OpenAI] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(prompts.length / batchSize)}`);
      }

      const batchPromises = batch.map(({ prompt, systemPrompt }) =>
        this.generateDocumentation(prompt, systemPrompt, preferredModel)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < prompts.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Select the best available model with fallback options
   */
  private async selectModel(preferredModel: OpenAIModel): Promise<string> {
    const fallbackOrder = [
      OpenAIModel.GPT_4_TURBO,
      OpenAIModel.GPT_4,
      OpenAIModel.GPT_3_5_TURBO,
    ];

    // Start with preferred model
    const modelsToTry = [preferredModel, ...fallbackOrder.filter(m => m !== preferredModel)];

    for (const model of modelsToTry) {
      try {
        // Test if model is available by making a minimal request
        await this.testModelAvailability(model);
        return model;
      } catch (error) {
        if (this.config.debug) {
          console.log(`[OpenAI] Model ${model} not available, trying fallback`);
        }
        continue;
      }
    }

    throw new OpenAIClientError('No available OpenAI models found');
  }

  /**
   * Test if a model is available
   */
  private async testModelAvailability(model: string): Promise<void> {
    try {
      await this.client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      });
    } catch (error: any) {
      if (error?.status === 404 || error?.code === 'model_not_found') {
        throw new OpenAIClientError(`Model ${model} not found`);
      }
      // Other errors might be temporary, so we'll consider the model available
    }
  }

  /**
   * Execute a request with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      await this.enforceRateLimit();
      return await operation();
    } catch (error: any) {
      if (retryCount >= this.rateLimitConfig.maxRetries) {
        throw this.handleError(error);
      }

      if (this.shouldRetry(error)) {
        const delay = this.calculateRetryDelay(retryCount, error);
        
        if (this.config.verbose) {
          console.log(`[OpenAI] Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.rateLimitConfig.maxRetries})`);
        }

        await this.delay(delay);
        return this.executeWithRetry(operation, retryCount + 1);
      }

      throw this.handleError(error);
    }
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 60000 / this.rateLimitConfig.requestsPerMinute; // ms between requests

    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      await this.delay(delay);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: any): boolean {
    // Retry on rate limits, temporary server errors, and network issues
    return (
      error?.status === 429 || // Rate limit
      error?.status === 500 || // Internal server error
      error?.status === 502 || // Bad gateway
      error?.status === 503 || // Service unavailable
      error?.status === 504 || // Gateway timeout
      error?.code === 'ECONNRESET' ||
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ENOTFOUND'
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number, error: any): number {
    let delay = this.rateLimitConfig.retryDelay * Math.pow(2, retryCount);

    // If it's a rate limit error, use the retry-after header if available
    if (error?.status === 429 && error?.headers?.['retry-after']) {
      const retryAfter = parseInt(error.headers['retry-after'], 10);
      if (!isNaN(retryAfter)) {
        delay = Math.max(delay, retryAfter * 1000);
      }
    }

    // Add jitter to avoid thundering herd
    delay += Math.random() * 1000;

    return Math.min(delay, 60000); // Cap at 1 minute
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: any): Error {
    if (error instanceof OpenAIClientError) {
      return error;
    }

    if (error?.status === 401 || error?.status === 403) {
      return new OpenAIAuthenticationError(
        'Invalid OpenAI API key or insufficient permissions'
      );
    }

    if (error?.status === 429) {
      const retryAfter = error?.headers?.['retry-after'];
      return new OpenAIRateLimitError(
        'OpenAI API rate limit exceeded',
        retryAfter ? parseInt(retryAfter, 10) : undefined
      );
    }

    if (error?.status === 400) {
      return new OpenAIClientError(
        `Invalid request: ${error?.message || 'Bad request'}`
      );
    }

    if (error?.status >= 500) {
      return new OpenAIClientError(
        `OpenAI API server error: ${error?.message || 'Internal server error'}`
      );
    }

    return new OpenAIClientError(
      `OpenAI API error: ${error?.message || 'Unknown error'}`
    );
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current token usage statistics
   */
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  /**
   * Reset token usage statistics
   */
  resetTokenUsage(): void {
    this.tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }

  /**
   * Estimate token count for a string (rough approximation)
   */
  estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if we're approaching token limits
   */
  isApproachingTokenLimit(): boolean {
    const tokensPerMinute = this.rateLimitConfig.tokensPerMinute;
    return this.tokenUsage.totalTokens > tokensPerMinute * 0.8; // 80% threshold
  }

  /**
   * Validate that the client is properly configured
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: OpenAIModel.GPT_3_5_TURBO,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1,
      });
      return true;
    } catch (error) {
      if (this.config.debug) {
        console.error('[OpenAI] Connection validation failed:', error);
      }
      return false;
    }
  }
}