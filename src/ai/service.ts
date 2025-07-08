import { ApiSpec, Endpoint } from '../models/types.js';
import { Config } from '../models/config.js';
import { OpenAIClient, OpenAIModel, OpenAIResponse } from './client.js';
import {
  SYSTEM_PROMPT,
  buildRestEndpointPrompt,
  buildGraphQLPrompt,
  buildBatchPrompt,
  buildApiOverviewPrompt,
} from './prompts.js';

/**
 * Enhanced endpoint with AI-generated documentation
 */
export interface EnhancedEndpoint extends Endpoint {
  aiGenerated?: {
    description: string;
    examples: string;
    errorHandling: string;
    bestPractices: string;
    generatedAt: Date;
    model: string;
    tokensUsed: number;
  };
}

/**
 * Enhanced API specification with AI-generated content
 */
export type EnhancedApiSpec = EnhancedEndpoint[];

/**
 * Progress callback for tracking documentation generation
 */
export type ProgressCallback = (current: number, total: number, message: string) => void;

/**
 * Batch processing configuration
 */
interface BatchConfig {
  maxBatchSize: number;
  maxTokensPerBatch: number;
  parallelBatches: number;
  delayBetweenBatches: number;
}

/**
 * AI service error types
 */
export class AIServiceError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export class TokenLimitError extends AIServiceError {
  constructor(message: string, public readonly tokensRequired: number) {
    super(message, 'TOKEN_LIMIT');
    this.name = 'TokenLimitError';
  }
}

/**
 * Main AI service for orchestrating documentation generation
 */
export class AIService {
  private openaiClient: OpenAIClient;
  private batchConfig: BatchConfig;

  constructor(private config: Config) {
    this.openaiClient = new OpenAIClient(config);
    
    // Configure batching based on model and token limits
    this.batchConfig = {
      maxBatchSize: 5, // Process 5 endpoints at once
      maxTokensPerBatch: 15000, // Conservative token limit per batch
      parallelBatches: 2, // Run 2 batches in parallel
      delayBetweenBatches: 1000, // 1 second delay between batches
    };
  }

  /**
   * Generate enhanced documentation for an entire API specification
   */
  async generateDocumentation(
    apiSpec: ApiSpec,
    progressCallback?: ProgressCallback
  ): Promise<EnhancedApiSpec> {
    if (!apiSpec || apiSpec.length === 0) {
      throw new AIServiceError('API specification is empty or invalid');
    }

    // Validate OpenAI connection before starting
    const isConnected = await this.openaiClient.validateConnection();
    if (!isConnected) {
      throw new AIServiceError('Unable to connect to OpenAI API. Please check your API key and connection.');
    }

    progressCallback?.(0, apiSpec.length, 'Starting documentation generation...');

    try {
      // Estimate total tokens needed
      const estimatedTokens = this.estimateTotalTokens(apiSpec);
      if (this.config.verbose) {
        console.log(`[AIService] Estimated tokens needed: ${estimatedTokens}`);
      }

      // Process endpoints in optimized batches
      const enhancedEndpoints = await this.processEndpointsInBatches(
        apiSpec,
        progressCallback
      );

      // Generate API overview if requested
      if (this.config.generateOverview) {
        progressCallback?.(apiSpec.length, apiSpec.length + 1, 'Generating API overview...');
        await this.generateApiOverview(enhancedEndpoints);
      }

      progressCallback?.(apiSpec.length, apiSpec.length, 'Documentation generation complete!');

      if (this.config.verbose) {
        const tokenUsage = this.openaiClient.getTokenUsage();
        console.log(`[AIService] Total tokens used: ${tokenUsage.totalTokens}`);
        console.log(`[AIService] Generated documentation for ${enhancedEndpoints.length} endpoints`);
      }

      return enhancedEndpoints;
    } catch (error) {
      if (error instanceof AIServiceError) {
        throw error;
      }
      throw new AIServiceError(`Documentation generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate documentation for a single endpoint
   */
  async generateEndpointDocumentation(endpoint: Endpoint): Promise<EnhancedEndpoint> {
    try {
      const prompt = this.buildPromptForEndpoint(endpoint);
      const response = await this.openaiClient.generateDocumentation(
        prompt,
        SYSTEM_PROMPT,
        this.getPreferredModel()
      );

      return this.enhanceEndpointWithAI(endpoint, response);
    } catch (error) {
      if (this.config.verbose) {
        console.error(`[AIService] Failed to generate documentation for ${endpoint.method} ${endpoint.path}:`, error);
      }
      
      // Return the original endpoint with error information
      return {
        ...endpoint,
        aiGenerated: {
          description: `Error generating documentation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          examples: '',
          errorHandling: '',
          bestPractices: '',
          generatedAt: new Date(),
          model: 'error',
          tokensUsed: 0,
        },
      };
    }
  }

  /**
   * Process endpoints in optimized batches
   */
  private async processEndpointsInBatches(
    apiSpec: ApiSpec,
    progressCallback?: ProgressCallback
  ): Promise<EnhancedEndpoint[]> {
    const batches = this.createOptimizedBatches(apiSpec);
    const results: EnhancedEndpoint[] = [];
    let processedCount = 0;

    if (this.config.verbose) {
      console.log(`[AIService] Processing ${apiSpec.length} endpoints in ${batches.length} batches`);
    }

    // Process batches with controlled parallelism
    for (let i = 0; i < batches.length; i += this.batchConfig.parallelBatches) {
      const parallelBatches = batches.slice(i, i + this.batchConfig.parallelBatches);
      
      const batchPromises = parallelBatches.map(async (batch, batchIndex) => {
        const actualBatchIndex = i + batchIndex;
        progressCallback?.(
          processedCount,
          apiSpec.length,
          `Processing batch ${actualBatchIndex + 1}/${batches.length} (${batch.length} endpoints)...`
        );

        const batchResults = await this.processBatch(batch);
        processedCount += batch.length;
        
        progressCallback?.(
          processedCount,
          apiSpec.length,
          `Completed batch ${actualBatchIndex + 1}/${batches.length}`
        );

        return batchResults;
      });

      const parallelResults = await Promise.all(batchPromises);
      results.push(...parallelResults.flat());

      // Add delay between parallel batch groups
      if (i + this.batchConfig.parallelBatches < batches.length) {
        await this.delay(this.batchConfig.delayBetweenBatches);
      }
    }

    return results;
  }

  /**
   * Process a single batch of endpoints
   */
  private async processBatch(endpoints: Endpoint[]): Promise<EnhancedEndpoint[]> {
    if (endpoints.length === 1) {
      // Single endpoint - use individual processing for better quality
      return [await this.generateEndpointDocumentation(endpoints[0])];
    }

    try {
      // Multiple endpoints - use batch processing for efficiency
      const prompts = endpoints.map(endpoint => ({
        prompt: this.buildPromptForEndpoint(endpoint),
        systemPrompt: SYSTEM_PROMPT,
      }));

      const responses = await this.openaiClient.generateBatch(
        prompts,
        this.getPreferredModel()
      );

      return endpoints.map((endpoint, index) => 
        this.enhanceEndpointWithAI(endpoint, responses[index])
      );
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[AIService] Batch processing failed, falling back to individual processing:`, error);
      }

      // Fallback to individual processing
      const results: EnhancedEndpoint[] = [];
      for (const endpoint of endpoints) {
        results.push(await this.generateEndpointDocumentation(endpoint));
      }
      return results;
    }
  }

  /**
   * Create optimized batches based on token limits and complexity
   */
  private createOptimizedBatches(apiSpec: ApiSpec): Endpoint[][] {
    const batches: Endpoint[][] = [];
    let currentBatch: Endpoint[] = [];
    let currentBatchTokens = 0;

    for (const endpoint of apiSpec) {
      const endpointTokens = this.estimateEndpointTokens(endpoint);
      
      // Check if adding this endpoint would exceed batch limits
      if (
        currentBatch.length >= this.batchConfig.maxBatchSize ||
        currentBatchTokens + endpointTokens > this.batchConfig.maxTokensPerBatch
      ) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentBatchTokens = 0;
        }
      }

      currentBatch.push(endpoint);
      currentBatchTokens += endpointTokens;
    }

    // Add the last batch if it has endpoints
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Build the appropriate prompt for an endpoint
   */
  private buildPromptForEndpoint(endpoint: Endpoint): string {
    // Determine if this is a GraphQL endpoint
    const isGraphQL = this.isGraphQLEndpoint(endpoint);
    
    if (isGraphQL) {
      return buildGraphQLPrompt(endpoint);
    } else {
      return buildRestEndpointPrompt(endpoint);
    }
  }

  /**
   * Determine if an endpoint is GraphQL based on various indicators
   */
  private isGraphQLEndpoint(endpoint: Endpoint): boolean {
    // Check for GraphQL indicators
    const path = endpoint.path.toLowerCase();
    const hasGraphQLPath = path.includes('graphql') || path.includes('/graph');
    const hasGraphQLSchema = endpoint.requestSchema?.schema && 
      typeof endpoint.requestSchema.schema === 'string' &&
      (endpoint.requestSchema.schema.includes('query') || endpoint.requestSchema.schema.includes('mutation'));
    
    return hasGraphQLPath || hasGraphQLSchema || this.config.type === 'graphql';
  }

  /**
   * Enhance an endpoint with AI-generated content
   */
  private enhanceEndpointWithAI(endpoint: Endpoint, response: OpenAIResponse): EnhancedEndpoint {
    // Parse the AI response to extract different sections
    const sections = this.parseAIResponse(response.content);

    return {
      ...endpoint,
      aiGenerated: {
        description: sections.description || response.content,
        examples: sections.examples || '',
        errorHandling: sections.errorHandling || '',
        bestPractices: sections.bestPractices || '',
        generatedAt: new Date(),
        model: response.model,
        tokensUsed: response.tokensUsed,
      },
    };
  }

  /**
   * Parse AI response into structured sections
   */
  private parseAIResponse(content: string): {
    description: string;
    examples: string;
    errorHandling: string;
    bestPractices: string;
  } {
    const sections = {
      description: '',
      examples: '',
      errorHandling: '',
      bestPractices: '',
    };

    // Simple parsing based on common section headers
    const lines = content.split('\n');
    let currentSection = 'description';
    let currentContent: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim();
      
      // Detect section headers
      if (lowerLine.includes('example') && (lowerLine.includes('#') || lowerLine.includes('**'))) {
        if (currentContent.length > 0) {
          sections[currentSection as keyof typeof sections] = currentContent.join('\n').trim();
        }
        currentSection = 'examples';
        currentContent = [];
      } else if (lowerLine.includes('error') && (lowerLine.includes('#') || lowerLine.includes('**'))) {
        if (currentContent.length > 0) {
          sections[currentSection as keyof typeof sections] = currentContent.join('\n').trim();
        }
        currentSection = 'errorHandling';
        currentContent = [];
      } else if ((lowerLine.includes('best practice') || lowerLine.includes('usage note')) && 
                 (lowerLine.includes('#') || lowerLine.includes('**'))) {
        if (currentContent.length > 0) {
          sections[currentSection as keyof typeof sections] = currentContent.join('\n').trim();
        }
        currentSection = 'bestPractices';
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // Add the last section
    if (currentContent.length > 0) {
      sections[currentSection as keyof typeof sections] = currentContent.join('\n').trim();
    }

    // If no specific sections were found, put everything in description
    if (!sections.examples && !sections.errorHandling && !sections.bestPractices) {
      sections.description = content.trim();
    }

    return sections;
  }

  /**
   * Generate API overview documentation
   */
  private async generateApiOverview(enhancedEndpoints: EnhancedEndpoint[]): Promise<string> {
    try {
      const prompt = buildApiOverviewPrompt(enhancedEndpoints);
      const response = await this.openaiClient.generateDocumentation(
        prompt,
        SYSTEM_PROMPT,
        this.getPreferredModel()
      );

      if (this.config.verbose) {
        console.log(`[AIService] Generated API overview (${response.tokensUsed} tokens)`);
      }

      return response.content;
    } catch (error) {
      if (this.config.verbose) {
        console.error('[AIService] Failed to generate API overview:', error);
      }
      return 'API Overview generation failed.';
    }
  }

  /**
   * Estimate token count for an endpoint
   */
  private estimateEndpointTokens(endpoint: Endpoint): number {
    const prompt = this.buildPromptForEndpoint(endpoint);
    const systemPromptTokens = this.openaiClient.estimateTokenCount(SYSTEM_PROMPT);
    const userPromptTokens = this.openaiClient.estimateTokenCount(prompt);
    const expectedResponseTokens = 1000; // Estimated response size
    
    return systemPromptTokens + userPromptTokens + expectedResponseTokens;
  }

  /**
   * Estimate total tokens needed for the entire API spec
   */
  private estimateTotalTokens(apiSpec: ApiSpec): number {
    return apiSpec.reduce((total, endpoint) => {
      return total + this.estimateEndpointTokens(endpoint);
    }, 0);
  }

  /**
   * Get the preferred OpenAI model based on configuration
   */
  private getPreferredModel(): OpenAIModel {
    if (this.config.model) {
      switch (this.config.model.toLowerCase()) {
        case 'gpt-4':
          return OpenAIModel.GPT_4;
        case 'gpt-4-turbo':
          return OpenAIModel.GPT_4_TURBO;
        case 'gpt-3.5-turbo':
          return OpenAIModel.GPT_3_5_TURBO;
        default:
          if (this.config.verbose) {
            console.warn(`[AIService] Unknown model ${this.config.model}, using GPT-4`);
          }
          return OpenAIModel.GPT_4;
      }
    }

    // Default to GPT-4 for best quality
    return OpenAIModel.GPT_4;
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
  getTokenUsage() {
    return this.openaiClient.getTokenUsage();
  }

  /**
   * Reset token usage statistics
   */
  resetTokenUsage(): void {
    this.openaiClient.resetTokenUsage();
  }

  /**
   * Check if the service is approaching token limits
   */
  isApproachingTokenLimit(): boolean {
    return this.openaiClient.isApproachingTokenLimit();
  }

  /**
   * Validate that the AI service is properly configured and ready
   */
  async validateService(): Promise<boolean> {
    try {
      return await this.openaiClient.validateConnection();
    } catch (error) {
      if (this.config.debug) {
        console.error('[AIService] Service validation failed:', error);
      }
      return false;
    }
  }

  /**
   * Update batch configuration for performance tuning
   */
  updateBatchConfig(config: Partial<BatchConfig>): void {
    this.batchConfig = { ...this.batchConfig, ...config };
    
    if (this.config.verbose) {
      console.log('[AIService] Updated batch configuration:', this.batchConfig);
    }
  }

  /**
   * Get current batch configuration
   */
  getBatchConfig(): BatchConfig {
    return { ...this.batchConfig };
  }
}