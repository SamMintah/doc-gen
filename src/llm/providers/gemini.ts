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

// Default model to use
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash-latest';

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
      model: this.config.model || DEFAULT_GEMINI_MODEL,
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

  private validateApiKey(): void {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      throw new LLMAuthenticationError(
        'Gemini API key is required.',
        LLMProvider.GEMINI
      );
    }
    if (apiKey.length !== 39) {
      if (this.config.verbose) {
        console.warn('[Gemini] Google API key should typically be 39 characters long.');
      }
    }
  }

  async generateDocumentation(
    prompt: string,
    systemPrompt?: string,
    preferredModel?: string
  ): Promise<LLMResponse> {
    try {
      const modelToUse = preferredModel || this.config.model || DEFAULT_GEMINI_MODEL;
      const currentModel = this.genAI.getGenerativeModel({ model: modelToUse });

      const messages = [
        { role: 'user', parts: [{ text: prompt }] },
      ];

      if (systemPrompt) {
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

  async generateBatch(
    prompts: Array<{ prompt: string; systemPrompt?: string }>,
    preferredModel?: string
  ): Promise<LLMResponse[]> {
    const results: LLMResponse[] = [];
    const batchPromises = prompts.map(({ prompt, systemPrompt }) =>
      this.generateDocumentation(prompt, systemPrompt, preferredModel)
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const res of batchResults) {
      if (res.status === 'fulfilled') {
        results.push(res.value);
      } else {
        if (this.config.verbose) {
          console.error('[Gemini] Batch request failed:', res.reason);
        }
        results.push({
          content: `Error: ${res.reason instanceof Error ? res.reason.message : 'Unknown error'} `,
          tokensUsed: 0,
          model: preferredModel || this.config.model || DEFAULT_GEMINI_MODEL,
        });
      }
    }

    return results;
  }

  async validateConnection(): Promise<boolean> {
    try {
      const modelToUse = this.config.model || DEFAULT_GEMINI_MODEL;
      const currentModel = this.genAI.getGenerativeModel({ model: modelToUse });
      
      await currentModel.generateContent({ contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] });
      return true;
    } catch (error: any) {
      if (this.config.debug) {
        console.error('[Gemini] Connection validation failed:', error);
      }
      throw this.handleError(error);
    }
  }

  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  resetTokenUsage(): void {
    this.tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }

  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  isApproachingTokenLimit(): boolean {
    return false; 
  }

  private handleError(error: any): Error {
    if (error instanceof LLMClientError) {
      return error;
    }

    if (error.code) {
      switch (error.code) {
        case 400:
          if (error.message.includes('API key not valid')) {
            return new LLMAuthenticationError('Invalid Gemini API key', LLMProvider.GEMINI);
          }
          return new LLMClientError(`Gemini API Bad Request: ${error.message}`, 'BAD_REQUEST', LLMProvider.GEMINI);
        case 401:
        case 403:
          return new LLMAuthenticationError('Unauthorized or Forbidden access to Gemini API', LLMProvider.GEMINI);
        case 429:
          return new LLMRateLimitError('Gemini API rate limit exceeded', undefined, LLMProvider.GEMINI);
        case 500:
        case 503:
          return new LLMServerError(`Gemini API server error: ${error.message}`, error.code, LLMProvider.GEMINI);
        default:
          return new LLMClientError(`Gemini API error (${error.code}): ${error.message}`, String(error.code), LLMProvider.GEMINI);
      }
    }

    return new LLMClientError(
      `Unknown Gemini API error: ${error.message || 'An unexpected error occurred'} `,
      undefined,
      LLMProvider.GEMINI
    );
  }
}