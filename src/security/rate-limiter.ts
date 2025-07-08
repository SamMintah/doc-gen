import { Logger } from '../utils/logger.js';
import { SecurityConfig } from '../models/types.js';

/**
 * Rate limiting configuration interface
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  burstCapacity: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  adaptiveEnabled: boolean;
  providerSpecific: {
    [provider: string]: {
      requestsPerMinute: number;
      burstCapacity: number;
      endpoints: {
        [endpoint: string]: {
          requestsPerMinute: number;
          burstCapacity: number;
        };
      };
    };
  };
}

/**
 * Rate limit status interface
 */
export interface RateLimitStatus {
  allowed: boolean;
  remainingTokens: number;
  resetTime: Date;
  retryAfter?: number; // milliseconds
  currentDelay: number; // milliseconds
}

/**
 * Rate limit violation event
 */
export interface RateLimitViolation {
  timestamp: Date;
  provider: string;
  endpoint: string;
  requestsAttempted: number;
  limitExceeded: number;
  retryAfter?: number;
}

/**
 * Token bucket for rate limiting
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Check if tokens are available without consuming
   */
  hasTokens(count: number = 1): boolean {
    this.refill();
    return this.tokens >= count;
  }

  /**
   * Consume tokens if available
   */
  consume(count: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    
    return false;
  }

  /**
   * Get remaining tokens
   */
  getRemainingTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Get time until next token is available
   */
  getTimeUntilNextToken(): number {
    this.refill();
    
    if (this.tokens >= 1) {
      return 0;
    }
    
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  /**
   * Get time until bucket is full
   */
  getTimeUntilFull(): number {
    this.refill();
    
    if (this.tokens >= this.capacity) {
      return 0;
    }
    
    const tokensNeeded = this.capacity - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  /**
   * Reset bucket to full capacity
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

/**
 * Adaptive rate limiter that adjusts based on API responses
 */
export class RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly logger: Logger;
  private readonly buckets: Map<string, TokenBucket> = new Map();
  private readonly violations: RateLimitViolation[] = [];
  private readonly adaptiveMultipliers: Map<string, number> = new Map();
  private readonly retryDelays: Map<string, number> = new Map();
  private readonly lastViolationTime: Map<string, number> = new Map();

  constructor(config: RateLimitConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.initializeBuckets();
  }

  /**
   * Initialize token buckets for different providers and endpoints
   */
  private initializeBuckets(): void {
    // Default bucket
    const defaultKey = 'default';
    const defaultRefillRate = this.config.requestsPerMinute / (60 * 1000); // tokens per millisecond
    this.buckets.set(defaultKey, new TokenBucket(this.config.burstCapacity, defaultRefillRate));

    // Provider-specific buckets
    for (const [provider, providerConfig] of Object.entries(this.config.providerSpecific)) {
      const providerKey = `provider:${provider}`;
      const providerRefillRate = providerConfig.requestsPerMinute / (60 * 1000);
      this.buckets.set(providerKey, new TokenBucket(providerConfig.burstCapacity, providerRefillRate));

      // Endpoint-specific buckets
      for (const [endpoint, endpointConfig] of Object.entries(providerConfig.endpoints)) {
        const endpointKey = `provider:${provider}:endpoint:${endpoint}`;
        const endpointRefillRate = endpointConfig.requestsPerMinute / (60 * 1000);
        this.buckets.set(endpointKey, new TokenBucket(endpointConfig.burstCapacity, endpointRefillRate));
      }
    }

    this.logger.debug(`Initialized ${this.buckets.size} rate limiting buckets`);
  }

  /**
   * Get the appropriate bucket key for a request
   */
  private getBucketKey(provider?: string, endpoint?: string): string {
    if (provider && endpoint && this.config.providerSpecific[provider]?.endpoints[endpoint]) {
      return `provider:${provider}:endpoint:${endpoint}`;
    }
    
    if (provider && this.config.providerSpecific[provider]) {
      return `provider:${provider}`;
    }
    
    return 'default';
  }

  /**
   * Get the adaptive multiplier for a bucket
   */
  private getAdaptiveMultiplier(bucketKey: string): number {
    if (!this.config.adaptiveEnabled) {
      return 1.0;
    }
    
    return this.adaptiveMultipliers.get(bucketKey) || 1.0;
  }

  /**
   * Update adaptive multiplier based on API response
   */
  private updateAdaptiveMultiplier(bucketKey: string, success: boolean, retryAfter?: number): void {
    if (!this.config.adaptiveEnabled) {
      return;
    }

    const currentMultiplier = this.getAdaptiveMultiplier(bucketKey);
    
    if (success) {
      // Gradually increase rate limit on success
      const newMultiplier = Math.min(1.0, currentMultiplier + 0.1);
      this.adaptiveMultipliers.set(bucketKey, newMultiplier);
      
      if (newMultiplier !== currentMultiplier) {
        this.logger.debug(`Increased adaptive multiplier for ${bucketKey} to ${newMultiplier.toFixed(2)}`);
      }
    } else {
      // Decrease rate limit on failure
      let newMultiplier: number;
      
      if (retryAfter) {
        // Use server-provided retry-after as guidance
        const suggestedDelay = retryAfter * 1000; // convert to milliseconds
        const currentDelay = this.calculateBackoffDelay(bucketKey, 1);
        newMultiplier = Math.max(0.1, currentMultiplier * (currentDelay / suggestedDelay));
      } else {
        // Standard backoff
        newMultiplier = Math.max(0.1, currentMultiplier * 0.5);
      }
      
      this.adaptiveMultipliers.set(bucketKey, newMultiplier);
      this.logger.warn(`Decreased adaptive multiplier for ${bucketKey} to ${newMultiplier.toFixed(2)} due to rate limit violation`);
    }
  }

  /**
   * Calculate backoff delay based on strategy
   */
  private calculateBackoffDelay(bucketKey: string, attempt: number): number {
    const baseDelay = this.config.baseDelay;
    const maxDelay = this.config.maxDelay;
    
    let delay: number;
    
    switch (this.config.backoffStrategy) {
      case 'linear':
        delay = baseDelay * attempt;
        break;
      case 'exponential':
        delay = baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
        break;
      case 'fixed':
      default:
        delay = baseDelay;
        break;
    }
    
    // Apply adaptive multiplier
    const adaptiveMultiplier = this.getAdaptiveMultiplier(bucketKey);
    delay = delay / adaptiveMultiplier;
    
    return Math.min(maxDelay, delay);
  }

  /**
   * Check if a request is allowed without consuming tokens
   */
  checkLimit(provider?: string, endpoint?: string): RateLimitStatus {
    const bucketKey = this.getBucketKey(provider, endpoint);
    const bucket = this.buckets.get(bucketKey);
    
    if (!bucket) {
      this.logger.error(`No bucket found for key: ${bucketKey}`);
      return {
        allowed: false,
        remainingTokens: 0,
        resetTime: new Date(Date.now() + 60000),
        currentDelay: this.config.baseDelay
      };
    }

    const hasTokens = bucket.hasTokens();
    const remainingTokens = bucket.getRemainingTokens();
    const timeUntilNextToken = bucket.getTimeUntilNextToken();
    const resetTime = new Date(Date.now() + bucket.getTimeUntilFull());
    
    // Check if we're in a retry delay period
    const currentDelay = this.retryDelays.get(bucketKey) || 0;
    const lastViolation = this.lastViolationTime.get(bucketKey) || 0;
    const timeSinceViolation = Date.now() - lastViolation;
    
    const inRetryDelay = currentDelay > 0 && timeSinceViolation < currentDelay;
    
    return {
      allowed: hasTokens && !inRetryDelay,
      remainingTokens,
      resetTime,
      retryAfter: inRetryDelay ? currentDelay - timeSinceViolation : timeUntilNextToken,
      currentDelay
    };
  }

  /**
   * Consume a token if available
   */
  consumeToken(provider?: string, endpoint?: string): RateLimitStatus {
    const bucketKey = this.getBucketKey(provider, endpoint);
    const bucket = this.buckets.get(bucketKey);
    
    if (!bucket) {
      this.logger.error(`No bucket found for key: ${bucketKey}`);
      return {
        allowed: false,
        remainingTokens: 0,
        resetTime: new Date(Date.now() + 60000),
        currentDelay: this.config.baseDelay
      };
    }

    // Check if we're in a retry delay period
    const currentDelay = this.retryDelays.get(bucketKey) || 0;
    const lastViolation = this.lastViolationTime.get(bucketKey) || 0;
    const timeSinceViolation = Date.now() - lastViolation;
    const inRetryDelay = currentDelay > 0 && timeSinceViolation < currentDelay;
    
    if (inRetryDelay) {
      this.logger.debug(`Request blocked due to retry delay for ${bucketKey}. Remaining: ${currentDelay - timeSinceViolation}ms`);
      return {
        allowed: false,
        remainingTokens: bucket.getRemainingTokens(),
        resetTime: new Date(Date.now() + bucket.getTimeUntilFull()),
        retryAfter: currentDelay - timeSinceViolation,
        currentDelay
      };
    }

    const consumed = bucket.consume();
    const remainingTokens = bucket.getRemainingTokens();
    const resetTime = new Date(Date.now() + bucket.getTimeUntilFull());
    
    if (consumed) {
      this.logger.debug(`Token consumed for ${bucketKey}. Remaining: ${remainingTokens}`);
      
      // Clear retry delay on successful consumption
      this.retryDelays.delete(bucketKey);
      
      return {
        allowed: true,
        remainingTokens,
        resetTime,
        currentDelay: 0
      };
    } else {
      // Rate limit exceeded
      this.handleRateLimitViolation(bucketKey, provider, endpoint);
      
      return {
        allowed: false,
        remainingTokens,
        resetTime,
        retryAfter: bucket.getTimeUntilNextToken(),
        currentDelay: this.retryDelays.get(bucketKey) || 0
      };
    }
  }

  /**
   * Handle rate limit violation
   */
  private handleRateLimitViolation(bucketKey: string, provider?: string, endpoint?: string): void {
    const now = Date.now();
    const violation: RateLimitViolation = {
      timestamp: new Date(now),
      provider: provider || 'unknown',
      endpoint: endpoint || 'unknown',
      requestsAttempted: 1,
      limitExceeded: 1
    };

    this.violations.push(violation);
    this.lastViolationTime.set(bucketKey, now);

    // Calculate retry delay
    const violationCount = this.getRecentViolationCount(bucketKey);
    const delay = this.calculateBackoffDelay(bucketKey, violationCount);
    this.retryDelays.set(bucketKey, delay);

    this.logger.warn(`Rate limit exceeded for ${bucketKey}. Retry after ${delay}ms. Violation count: ${violationCount}`);

    // Update adaptive multiplier
    this.updateAdaptiveMultiplier(bucketKey, false);

    // Clean up old violations
    this.cleanupOldViolations();
  }

  /**
   * Get recent violation count for a bucket
   */
  private getRecentViolationCount(bucketKey: string): number {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const [provider, endpoint] = this.parseBucketKey(bucketKey);
    
    return this.violations.filter(v => 
      v.timestamp.getTime() > fiveMinutesAgo &&
      v.provider === provider &&
      v.endpoint === endpoint
    ).length;
  }

  /**
   * Parse bucket key to extract provider and endpoint
   */
  private parseBucketKey(bucketKey: string): [string, string] {
    const parts = bucketKey.split(':');
    
    if (parts.length >= 4 && parts[0] === 'provider' && parts[2] === 'endpoint') {
      return [parts[1], parts[3]];
    } else if (parts.length >= 2 && parts[0] === 'provider') {
      return [parts[1], 'unknown'];
    }
    
    return ['unknown', 'unknown'];
  }

  /**
   * Clean up old violations (older than 1 hour)
   */
  private cleanupOldViolations(): void {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const initialLength = this.violations.length;
    
    // Remove violations older than 1 hour
    for (let i = this.violations.length - 1; i >= 0; i--) {
      if (this.violations[i].timestamp.getTime() < oneHourAgo) {
        this.violations.splice(i, 1);
      }
    }
    
    const removedCount = initialLength - this.violations.length;
    if (removedCount > 0) {
      this.logger.debug(`Cleaned up ${removedCount} old rate limit violations`);
    }
  }

  /**
   * Get remaining tokens for a specific provider/endpoint
   */
  getRemainingTokens(provider?: string, endpoint?: string): number {
    const bucketKey = this.getBucketKey(provider, endpoint);
    const bucket = this.buckets.get(bucketKey);
    
    if (!bucket) {
      this.logger.error(`No bucket found for key: ${bucketKey}`);
      return 0;
    }
    
    return bucket.getRemainingTokens();
  }

  /**
   * Get reset time for a specific provider/endpoint
   */
  getResetTime(provider?: string, endpoint?: string): Date {
    const bucketKey = this.getBucketKey(provider, endpoint);
    const bucket = this.buckets.get(bucketKey);
    
    if (!bucket) {
      this.logger.error(`No bucket found for key: ${bucketKey}`);
      return new Date(Date.now() + 60000);
    }
    
    return new Date(Date.now() + bucket.getTimeUntilFull());
  }

  /**
   * Handle API response to update adaptive rate limiting
   */
  handleApiResponse(
    statusCode: number,
    headers: Record<string, string>,
    provider?: string,
    endpoint?: string
  ): void {
    const bucketKey = this.getBucketKey(provider, endpoint);
    
    if (statusCode === 429) {
      // Rate limit exceeded
      const retryAfter = this.parseRetryAfter(headers);
      
      if (retryAfter) {
        this.retryDelays.set(bucketKey, retryAfter * 1000); // convert to milliseconds
        this.logger.warn(`API returned 429 for ${bucketKey}. Retry after ${retryAfter}s`);
      }
      
      this.updateAdaptiveMultiplier(bucketKey, false, retryAfter);
      this.handleRateLimitViolation(bucketKey, provider, endpoint);
    } else if (statusCode >= 200 && statusCode < 300) {
      // Success - update adaptive multiplier
      this.updateAdaptiveMultiplier(bucketKey, true);
    }
  }

  /**
   * Parse Retry-After header
   */
  private parseRetryAfter(headers: Record<string, string>): number | undefined {
    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    
    if (!retryAfter) {
      return undefined;
    }
    
    // Try parsing as seconds
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds;
    }
    
    // Try parsing as HTTP date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
    }
    
    return undefined;
  }

  /**
   * Reset rate limiter state
   */
  reset(provider?: string, endpoint?: string): void {
    if (provider || endpoint) {
      const bucketKey = this.getBucketKey(provider, endpoint);
      const bucket = this.buckets.get(bucketKey);
      
      if (bucket) {
        bucket.reset();
        this.retryDelays.delete(bucketKey);
        this.adaptiveMultipliers.delete(bucketKey);
        this.lastViolationTime.delete(bucketKey);
        this.logger.debug(`Reset rate limiter for ${bucketKey}`);
      }
    } else {
      // Reset all buckets
      for (const bucket of this.buckets.values()) {
        bucket.reset();
      }
      
      this.retryDelays.clear();
      this.adaptiveMultipliers.clear();
      this.lastViolationTime.clear();
      this.violations.length = 0;
      
      this.logger.debug('Reset all rate limiters');
    }
  }

  /**
   * Get rate limiting statistics
   */
  getStatistics(): {
    totalViolations: number;
    recentViolations: number;
    activeBuckets: number;
    adaptiveMultipliers: Record<string, number>;
    retryDelays: Record<string, number>;
  } {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentViolations = this.violations.filter(v => v.timestamp.getTime() > fiveMinutesAgo).length;
    
    return {
      totalViolations: this.violations.length,
      recentViolations,
      activeBuckets: this.buckets.size,
      adaptiveMultipliers: Object.fromEntries(this.adaptiveMultipliers),
      retryDelays: Object.fromEntries(this.retryDelays)
    };
  }

  /**
   * Create rate limiter from security config
   */
  static fromSecurityConfig(securityConfig: SecurityConfig, logger: Logger): RateLimiter {
    const rateLimitConfig: RateLimitConfig = {
      requestsPerMinute: securityConfig.rateLimiting.requestsPerMinute,
      burstCapacity: securityConfig.rateLimiting.burstCapacity,
      backoffStrategy: securityConfig.rateLimiting.backoffStrategy,
      maxRetries: securityConfig.rateLimiting.maxRetries,
      baseDelay: 1000, // 1 second default
      maxDelay: 60000, // 1 minute default
      backoffMultiplier: 2,
      adaptiveEnabled: true,
      providerSpecific: {
        openai: {
          requestsPerMinute: 60,
          burstCapacity: 10,
          endpoints: {
            'chat/completions': {
              requestsPerMinute: 60,
              burstCapacity: 5
            },
            'completions': {
              requestsPerMinute: 60,
              burstCapacity: 5
            }
          }
        },
        anthropic: {
          requestsPerMinute: 50,
          burstCapacity: 8,
          endpoints: {
            'messages': {
              requestsPerMinute: 50,
              burstCapacity: 4
            }
          }
        }
      }
    };
    
    return new RateLimiter(rateLimitConfig, logger);
  }
}