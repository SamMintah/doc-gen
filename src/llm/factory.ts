import { 
  LLMClient, 
  LLMProvider, 
  LLMClientError, 
  LLMAuthenticationError 
} from './interfaces.js';
import { Config } from '../models/config.js';
import { OpenAIProvider, OpenAIConfig } from './providers/openai.js';
import { GeminiProvider, GeminiConfig } from './providers/gemini.js';
import { AnthropicProvider, AnthropicConfig } from './providers/anthropic.js';

/**
 * Default models for each provider
 */
const DEFAULT_MODELS = {
  [LLMProvider.OPENAI]: 'gpt-4-turbo-preview',
  [LLMProvider.ANTHROPIC]: 'claude-3-sonnet-20240229',
  [LLMProvider.GEMINI]: 'gemini-pro',
  [LLMProvider.COHERE]: 'command-r-plus',
  [LLMProvider.HUGGINGFACE]: 'meta-llama/Llama-2-70b-chat-hf',
} as const;

/**
 * Factory class for creating LLM client instances
 * Implements the Factory Pattern to abstract provider instantiation
 */
export class LLMFactory {
  /**
   * Create an LLM client instance based on the provided configuration
   * @param config Configuration object containing provider and credentials
   * @returns Configured LLM client instance
   * @throws {LLMClientError} When provider is unsupported or configuration is invalid
   * @throws {LLMAuthenticationError} When API key is missing or invalid
   */
  static create(config: Config): LLMClient {
    // Validate basic configuration
    if (!config.provider) {
      throw new LLMClientError(
        'LLM provider is required in configuration',
        'MISSING_PROVIDER'
      );
    }

    if (!config.providerConfig) {
      throw new LLMClientError(
        'Provider configuration is required',
        'MISSING_PROVIDER_CONFIG'
      );
    }

    // Validate API key presence
    const apiKey = config.providerConfig.apiKey;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new LLMAuthenticationError(
        `API key is required for ${config.provider} provider`,
        config.provider
      );
    }

    // Get default model if not specified
    const model = config.model || config.providerConfig.model || DEFAULT_MODELS[config.provider];

    // Create provider-specific configuration
    const providerConfig = {
      ...config.providerConfig,
      model,
      debug: config.debug,
      verbose: config.verbose,
    };

    // Instantiate the appropriate provider
    switch (config.provider) {
      case LLMProvider.OPENAI:
        return LLMFactory.createOpenAIProvider(providerConfig);

      case LLMProvider.ANTHROPIC:
        return LLMFactory.createAnthropicProvider(providerConfig);

      case LLMProvider.GEMINI:
        return LLMFactory.createGeminiProvider(providerConfig);

      default:
        throw new LLMClientError(
          `Unsupported LLM provider: ${config.provider}. Supported providers: ${Object.values(LLMProvider).join(', ')}`,
          'UNSUPPORTED_PROVIDER'
        );
    }
  }

  /**
   * Create OpenAI provider instance
   * @param config Provider-specific configuration
   * @returns OpenAI provider instance
   */
  private static createOpenAIProvider(config: Record<string, any>): LLMClient {
    // Validate OpenAI-specific API key format
    const openaiConfig: OpenAIConfig = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
      temperature: config.temperature || 0.3,
      maxTokens: config.maxTokens || 4000,
      debug: config.debug || false,
      verbose: config.verbose || false,
    };
    return new OpenAIProvider(openaiConfig);
  }

  /**
   * Create Anthropic provider instance
   * @param config Provider-specific configuration
   * @returns Anthropic provider instance
   */
  private static createAnthropicProvider(config: Record<string, any>): LLMClient {
    const anthropicConfig: AnthropicConfig = {
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      debug: config.debug,
      verbose: config.verbose,
    };
    return new AnthropicProvider(anthropicConfig);
  }

  /**
   * Create Gemini provider instance
   * @param config Provider-specific configuration
   * @returns Gemini provider instance
   */
  private static createGeminiProvider(config: Record<string, any>): LLMClient {
    const geminiConfig: GeminiConfig = {
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      debug: config.debug,
      verbose: config.verbose,
    };
    return new GeminiProvider(geminiConfig);
  }

  /**
   * Get the default model for a given provider
   * @param provider The LLM provider
   * @returns Default model name for the provider
   */
  static getDefaultModel(provider: LLMProvider): string {
    return DEFAULT_MODELS[provider];
  }

  /**
   * Get list of supported providers
   * @returns Array of supported provider names
   */
  static getSupportedProviders(): LLMProvider[] {
    return Object.values(LLMProvider);
  }

  /**
   * Check if a provider is supported (has implementation)
   * @param provider The provider to check
   * @returns True if provider is implemented, false otherwise
   */
  static isProviderImplemented(provider: LLMProvider): boolean {
    return provider === LLMProvider.OPENAI || provider === LLMProvider.ANTHROPIC || provider === LLMProvider.GEMINI;
  }

  /**
   * Validate provider configuration without creating an instance
   * @param config Configuration to validate
   * @returns True if configuration is valid
   * @throws {LLMClientError} When configuration is invalid
   */
  static validateConfig(config: Config): boolean {
    // Check provider is supported
    if (!Object.values(LLMProvider).includes(config.provider)) {
      throw new LLMClientError(
        `Unsupported provider: ${config.provider}`,
        'UNSUPPORTED_PROVIDER'
      );
    }

    // Check provider is implemented
    if (!LLMFactory.isProviderImplemented(config.provider)) {
      throw new LLMClientError(
        `Provider ${config.provider} is not yet implemented`,
        'NOT_IMPLEMENTED',
        config.provider
      );
    }

    // Check provider configuration exists
    if (!config.providerConfig) {
      throw new LLMClientError(
        'Provider configuration is required',
        'MISSING_PROVIDER_CONFIG'
      );
    }

    // Check API key exists
    const apiKey = config.providerConfig.apiKey;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new LLMAuthenticationError(
        `API key is required for ${config.provider} provider`,
        config.provider
      );
    }

    // Provider-specific validation
    switch (config.provider) {
      case LLMProvider.OPENAI:
        if (!apiKey.startsWith('sk-')) {
          throw new LLMAuthenticationError(
            'Invalid OpenAI API key format. API keys should start with "sk-"',
            LLMProvider.OPENAI
          );
        }
        if (apiKey.length < 20) {
          throw new LLMAuthenticationError(
            'OpenAI API key appears to be too short',
            LLMProvider.OPENAI
          );
        }
        break;

      case LLMProvider.ANTHROPIC:
        if (!apiKey.startsWith('sk-ant-')) {
          console.warn('Anthropic API key should typically start with "sk-ant-"');
        }
        break;

      case LLMProvider.GEMINI:
        if (apiKey.length !== 39) {
          console.warn('Google API key should typically be 39 characters long');
        }
        break;

      // Add validation for other providers as they are implemented
    }

    return true;
  }
}