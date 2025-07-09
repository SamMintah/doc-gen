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
import { GoogleGenerativeAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

/**
 * Gemini model mappings
 */
export const GeminiModels = {
  GEMINI_PRO: 'gemini-pro',
  GEMINI_PRO_VISION: 'gemini-pro-vision',
} as const;

/**
 * Gemini provider configuration
 */
export interface GeminiConfig {
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
 * Gemini provider implementation of the LLMClient interface
 */
export class GeminiProvider implements LLMClient {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private tokenUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor(private config: GeminiConfig) {
    this.validateApiKey();
    this.genAI = new GoogleGenerativeAI(this.config.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.config.model || GeminiModels.GEMINI_PRO,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
      generationConfig: {
        temperature: this.config.temperature || 0.3,
        maxOutputTokens: this.config.maxTokens || 4000,
      },
    });
  }

  /**
   * Validate the Gemini API key format
   */
  private validateApiKey(): void {
    const apiKey = this.config.apiKey;
    
    if (!apiKey) {
      throw new LLMAuthenticationError(
        'Gemini API key is required.',
        LLMProvider.GEMINI
      );
    }

    // Google API keys are typically 39 characters long
    if (apiKey.length !== 39) {
      if (this.config.verbose) {
        console.warn('[Gemini] Google API key should typically be 39 characters long.');
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
      const modelToUse = preferredModel || this.config.model || GeminiModels.GEMINI_PRO;
      const currentModel = this.genAI.getGenerativeModel({ model: modelToUse });

      const messages = [
        { role: 'user', parts: [{ text: prompt }] },
      ];

      if (systemPrompt) {
        // Gemini doesn't have a direct system role for chat, prepend to user prompt
        messages[0].parts.unshift({ text: systemPrompt + '\n\n' });
      }

      if (this.config.debug) {
        console.log(`[Gemini] Using model: ${modelToUse}`);
        console.log(`[Gemini] Prompt: ${JSON.stringify(messages)}`);
      }

      const result = await currentModel.generateContent({ contents: messages });
      const response = result.response;

      if (!response.text()) {
        throw new LLMClientError('No content received from Gemini API', undefined, LLMProvider.GEMINI);
      }

      const textContent = response.text();
      const usage = response.usageMetadata;

      // Update token usage
      if (usage) {
        this.tokenUsage.promptTokens += usage.promptTokenCount || 0;
        this.tokenUsage.completionTokens += usage.candidatesTokenCount || 0;
        this.tokenUsage.totalTokens += (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);
      }

      if (this.config.verbose) {
        console.log(`[Gemini] Generated ${textContent.length} characters`);
        console.log(`[Gemini] Tokens used: ${usage?.totalTokenCount || 0}`);
      }

      return {
        content: textContent,
        tokensUsed: usage?.totalTokenCount || 0,
        model: modelToUse,
      };
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  /**
   * Generate multiple documentation pieces with batching
   * Gemini API does not have a direct batching endpoint for `generateContent`.
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
          console.error('[Gemini] Batch request failed:', res.reason);
        }
        // Push a placeholder or re-throw if strict error handling is needed for batches
        results.push({
          content: `Error: ${res.reason instanceof Error ? res.reason.message : 'Unknown error'} `,
          tokensUsed: 0,
          model: preferredModel || this.config.model || GeminiModels.GEMINI_PRO,
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
      const modelToUse = this.config.model || GeminiModels.GEMINI_PRO;
      const currentModel = this.genAI.getGenerativeModel({ model: modelToUse });
      
      // Make a small request to check connectivity and API key validity
      await currentModel.generateContent({ contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] });
      return true;
    } catch (error: any) {
      if (this.config.debug) {
        console.error('[Gemini] Connection validation failed:', error);
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
    // Gemini's token counting is more complex, but for a rough estimate
    // 1 token ≈ 4 characters for English text is a common heuristic.
    // For more accuracy, one would use a specific tokenization library if available for Gemini.
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if we're approaching token limits
   * Note: Gemini's rate limits are typically per minute/day and not directly exposed via SDK for real-time checking.
   * This is a placeholder based on general LLM usage patterns.
   */
  isApproachingTokenLimit(): boolean {
    // This would ideally check against actual Gemini rate limits if exposed.
    // For now, return false or implement a heuristic if needed.
    return false; 
  }

  /**
   * Handle and transform errors from Gemini API
   */
  private handleError(error: any): Error {
    if (error instanceof LLMClientError) {
      return error;
    }

    // GoogleGenerativeAI errors often have a `code` and `details`
    if (error.code) {
      switch (error.code) {
        case 400: // Bad Request
          if (error.message.includes('API key not valid')) {
            return new LLMAuthenticationError('Invalid Gemini API key', LLMProvider.GEMINI);
          }
          return new LLMClientError(`Gemini API Bad Request: ${error.message}`, 'BAD_REQUEST', LLMProvider.GEMINI);
        case 401: // Unauthorized
        case 403: // Forbidden
          return new LLMAuthenticationError('Unauthorized or Forbidden access to Gemini API', LLMProvider.GEMINI);
        case 429: // Too Many Requests / Rate Limit Exceeded
          return new LLMRateLimitError('Gemini API rate limit exceeded', undefined, LLMProvider.GEMINI);
        case 500: // Internal Server Error
        case 503: // Service Unavailable
          return new LLMServerError(`Gemini API server error: ${error.message}`, error.code, LLMProvider.GEMINI);
        default:
          return new LLMClientError(`Gemini API error (${error.code}): ${error.message}`, String(error.code), LLMProvider.GEMINI);
      }
    }

    // Generic error handling for unexpected errors
    return new LLMClientError(
      `Unknown Gemini API error: ${error.message || 'An unexpected error occurred'} `,
      undefined,
      LLMProvider.GEMINI
    );
  }
}