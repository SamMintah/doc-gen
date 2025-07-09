import OpenAI from 'openai';
import { 
  LLMClient, 
  LLMResponse, 
  TokenUsage, 
  LLMClientError, 
  LLMRateLimitError, 
  LLMAuthenticationError, 
  LLMServerError,
  LLMProvider 
} from '../interfaces.js';

/**
 * OpenAI model mappings
 */
export const OpenAIModels = {
  GPT_4: 'gpt-4',
  GPT_4_TURBO: 'gpt-4-turbo-preview',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
} as const;

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
 * OpenAI provider configuration
 */
export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  debug?: boolean;
  verbose?: boolean;
}

/**
 * OpenAI provider implementation of the LLMClient interface
 */
export class OpenAIProvider implements LLMClient {
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

  constructor(private config: OpenAIConfig) {
    this.validateApiKey();
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout || 60000,
    });

    // Configure rate limiting based on OpenAI's limits
    this.rateLimitConfig = {
      requestsPerMinute: 3500, // Conservative limit for GPT-4
      tokensPerMinute: 40000, // Conservative token limit
      maxRetries: this.config.maxRetries || 3,
      retryDelay: 1000, // 1 second base delay
    };
  }

  /**
   * Validate the OpenAI API key format and environment
   */
  private validateApiKey(): void {
    const apiKey = this.config.apiKey;
    
    if (!apiKey) {
      throw new LLMAuthenticationError(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or provide --openai-key argument.',
        LLMProvider.OPENAI
      );
    }

    if (!apiKey.startsWith('sk-')) {
      throw new LLMAuthenticationError(
        'Invalid OpenAI API key format. API keys should start with "sk-".',
        LLMProvider.OPENAI
      );
    }

    if (apiKey.length < 20) {
      throw new LLMAuthenticationError(
        'OpenAI API key appears to be too short. Please check your API key.',
        LLMProvider.OPENAI
      );
    }
  }

  /**
   * Generate documentation text from endpoint data
   */
  async generateDocumentation(
    prompt: string,
    systemPrompt?: string,
    preferredModel?: string
  ): Promise<LLMResponse> {
    return this.executeWithRetry(async () => {
      const model = await this.selectModel(preferredModel || OpenAIModels.GPT_4);
      
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
        temperature: this.config.temperature || 0.3, // Lower temperature for more consistent documentation
        max_tokens: this.config.maxTokens || 4000, // Reasonable limit for documentation
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
      });

      const choice = completion.choices[0];
      if (!choice?.message?.content) {
        throw new LLMClientError('No content received from OpenAI API', undefined, LLMProvider.OPENAI);
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
    preferredModel?: string
  ): Promise<LLMResponse[]> {
    const results: LLMResponse[] = [];
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
  private async selectModel(preferredModel: string): Promise<string> {
    const fallbackOrder = [
      OpenAIModels.GPT_4_TURBO,
      OpenAIModels.GPT_4,
      OpenAIModels.GPT_3_5_TURBO,
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

    throw new LLMClientError('No available OpenAI models found', undefined, LLMProvider.OPENAI);
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
        throw new LLMClientError(`Model ${model} not found`, undefined, LLMProvider.OPENAI);
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
    if (error instanceof LLMClientError) {
      return error;
    }

    if (error?.status === 401 || error?.status === 403) {
      return new LLMAuthenticationError(
        'Invalid OpenAI API key or insufficient permissions',
        LLMProvider.OPENAI
      );
    }

    if (error?.status === 429) {
      const retryAfter = error?.headers?.['retry-after'];
      return new LLMRateLimitError(
        'OpenAI API rate limit exceeded',
        retryAfter ? parseInt(retryAfter, 10) : undefined,
        LLMProvider.OPENAI
      );
    }

    if (error?.status === 400) {
      return new LLMClientError(
        `Invalid request: ${error?.message || 'Bad request'}`,
        'BAD_REQUEST',
        LLMProvider.OPENAI
      );
    }

    if (error?.status >= 500) {
      return new LLMServerError(
        `OpenAI API server error: ${error?.message || 'Internal server error'}`,
        error?.status,
        LLMProvider.OPENAI
      );
    }

    return new LLMClientError(
      `OpenAI API error: ${error?.message || 'Unknown error'}`,
      undefined,
      LLMProvider.OPENAI
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
        model: OpenAIModels.GPT_3_5_TURBO,
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