import Anthropic from '@anthropic-ai/sdk';
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
 * Anthropic model mappings
 */
export const AnthropicModels = {
  CLAUDE_3_OPUS: 'claude-3-opus-20240229',
  CLAUDE_3_SONNET: 'claude-3-sonnet-20240229',
  CLAUDE_3_HAIKU: 'claude-3-haiku-20240307',
} as const;

/**
 * Anthropic provider configuration
 */
export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  debug?: boolean;
  verbose?: boolean;
}

/**
 * Anthropic provider implementation of the LLMClient interface
 */
export class AnthropicProvider implements LLMClient {
  private client: Anthropic;
  private tokenUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor(private config: AnthropicConfig) {
    this.validateApiKey();
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout || 60000,
    });
  }

  /**
   * Validate the Anthropic API key format
   */
  private validateApiKey(): void {
    const apiKey = this.config.apiKey;
    
    if (!apiKey) {
      throw new LLMAuthenticationError(
        'Anthropic API key is required.',
        LLMProvider.ANTHROPIC
      );
    }

    if (!apiKey.startsWith('sk-ant-')) {
      if (this.config.verbose) {
        console.warn('[Anthropic] Anthropic API key should typically start with "sk-ant-".');
      }
    }
  }

  /**
   * Generate documentation text from a prompt
   */
  async generateDocumentation(
    prompt: string,
    systemPrompt?: string,
    preferredModel?: string
  ): Promise<LLMResponse> {
    try {
      const modelToUse = preferredModel || this.config.model || AnthropicModels.CLAUDE_3_SONNET;

      const messages: Anthropic.Messages.MessageParam[] = [
        { role: 'user', content: prompt },
      ];

      if (this.config.debug) {
        console.log(`[Anthropic] Using model: ${modelToUse}`);
        console.log(`[Anthropic] System prompt: ${systemPrompt || 'None'}`);
        console.log(`[Anthropic] User prompt: ${prompt}`);
      }

      const response = await this.client.messages.create({
        model: modelToUse,
        max_tokens: this.config.maxTokens || 4000,
        temperature: this.config.temperature || 0.3,
        messages,
        ...(systemPrompt && { system: systemPrompt }),
      });

      if (!response.content || response.content.length === 0) {
        throw new LLMClientError('No content received from Anthropic API', undefined, LLMProvider.ANTHROPIC);
      }

      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      // Update token usage
      if (response.usage) {
        this.tokenUsage.promptTokens += response.usage.input_tokens;
        this.tokenUsage.completionTokens += response.usage.output_tokens;
        this.tokenUsage.totalTokens += response.usage.input_tokens + response.usage.output_tokens;
      }

      if (this.config.verbose) {
        console.log(`[Anthropic] Generated ${textContent.length} characters`);
        console.log(`[Anthropic] Tokens used: ${response.usage.input_tokens + response.usage.output_tokens}`);
      }

      return {
        content: textContent,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        model: modelToUse,
      };
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  /**
   * Generate multiple documentation pieces with batching
   * Anthropic API does not have a direct batching endpoint for `messages.create`.
   * We will simulate batching by running requests in parallel.
   */
  async generateBatch(
    prompts: Array<{ prompt: string; systemPrompt?: string }>,
    preferredModel?: string
  ): Promise<LLMResponse[]> {
    const results: LLMResponse[] = [];
    const batchPromises = prompts.map(({ prompt, systemPrompt }) =>
      this.generateDocumentation(prompt, systemPrompt, preferredModel)
    );

    // Execute all promises in parallel
    const batchResults = await Promise.allSettled(batchPromises);

    for (const res of batchResults) {
      if (res.status === 'fulfilled') {
        results.push(res.value);
      } else {
        // Log error for failed requests in batch, but don't re-throw to allow other batches to complete
        if (this.config.verbose) {
          console.error('[Anthropic] Batch request failed:', res.reason);
        }
        // Push a placeholder or re-throw if strict error handling is needed for batches
        results.push({
          content: `Error: ${res.reason instanceof Error ? res.reason.message : 'Unknown error'} `,
          tokensUsed: 0,
          model: preferredModel || this.config.model || AnthropicModels.CLAUDE_3_SONNET,
        });
      }
    }

    return results;
  }

  /**
   * Validate that the client is properly configured and can connect
   */
  async validateConnection(): Promise<boolean> {
    try {
      const modelToUse = this.config.model || AnthropicModels.CLAUDE_3_SONNET;
      // Make a small request to check connectivity and API key validity
      await this.client.messages.create({
        model: modelToUse,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      return true;
    } catch (error: any) {
      if (this.config.debug) {
        console.error('[Anthropic] Connection validation failed:', error);
      }
      throw this.handleError(error);
    }
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
    // Anthropic's token counting is more complex, but for a rough estimate
    // 1 token ≈ 4 characters for English text is a common heuristic.
    // For more accuracy, one would use a specific tokenization library if available for Anthropic.
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if we're approaching token limits
   * Note: Anthropic's rate limits are typically per minute/day and not directly exposed via SDK for real-time checking.
   * This is a placeholder based on general LLM usage patterns.
   */
  isApproachingTokenLimit(): boolean {
    // This would ideally check against actual Anthropic rate limits if exposed.
    // For now, return false or implement a heuristic if needed.
    return false; 
  }

  /**
   * Handle and transform errors from Anthropic API
   */
  private handleError(error: any): Error {
    if (error instanceof LLMClientError) {
      return error;
    }

    // Anthropic errors often have a `status` and `error.message`
    if (error.status) {
      switch (error.status) {
        case 401: // Unauthorized
        case 403: // Forbidden
          return new LLMAuthenticationError('Invalid Anthropic API key or insufficient permissions', LLMProvider.ANTHROPIC);
        case 429: // Too Many Requests / Rate Limit Exceeded
          return new LLMRateLimitError('Anthropic API rate limit exceeded', undefined, LLMProvider.ANTHROPIC);
        case 500: // Internal Server Error
        case 503: // Service Unavailable
          return new LLMServerError(`Anthropic API server error: ${error.message}`, error.status, LLMProvider.ANTHROPIC);
        default:
          return new LLMClientError(`Anthropic API error (${error.status}): ${error.message}`, String(error.status), LLMProvider.ANTHROPIC);
      }
    }

    // Generic error handling for unexpected errors
    return new LLMClientError(
      `Unknown Anthropic API error: ${error.message || 'An unexpected error occurred'} `,
      undefined,
      LLMProvider.ANTHROPIC
    );
  }
}
