import { createCipher, createDecipher, randomBytes, pbkdf2Sync, createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Config, SecurityConfig } from '../models/config.js';
import { Logger } from '../utils/logger.js';

/**
 * Supported API key providers
 */
export enum ApiProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE = 'azure'
}

/**
 * API key validation patterns for different providers
 */
const API_KEY_PATTERNS: Record<ApiProvider, RegExp> = {
  [ApiProvider.OPENAI]: /^sk-[a-zA-Z0-9]{48}$/,
  [ApiProvider.ANTHROPIC]: /^sk-ant-[a-zA-Z0-9\-_]{95,}$/,
  [ApiProvider.GOOGLE]: /^[a-zA-Z0-9\-_]{39}$/,
  [ApiProvider.AZURE]: /^[a-fA-F0-9]{32}$/
};

/**
 * Encrypted API key storage format
 */
export interface EncryptedApiKey {
  encryptedData: string;
  iv: string;
  salt: string;
  algorithm: string;
  provider: ApiProvider;
  createdAt: number;
  expiresAt?: number;
  keyId: string;
}

/**
 * API key metadata
 */
export interface ApiKeyMetadata {
  provider: ApiProvider;
  keyId: string;
  createdAt: number;
  lastUsed?: number;
  expiresAt?: number;
  isValid: boolean;
}

/**
 * Storage options for API keys
 */
export enum StorageType {
  ENVIRONMENT = 'environment',
  ENCRYPTED_FILE = 'encrypted_file',
  MEMORY = 'memory'
}

/**
 * API key validation result
 */
export interface ValidationResult {
  isValid: boolean;
  provider?: ApiProvider;
  errors: string[];
  warnings: string[];
}

/**
 * Key rotation configuration
 */
export interface KeyRotationConfig {
  enabled: boolean;
  rotationIntervalDays: number;
  warningDays: number;
  autoRotate: boolean;
}

/**
 * Secure API key manager with encryption, validation, and storage capabilities
 */
export class ApiKeyManager {
  private logger: Logger;
  private securityConfig: SecurityConfig;
  private storageDir: string;
  private memoryStore: Map<string, EncryptedApiKey> = new Map();
  private masterKey?: Buffer;

  constructor(config: Config, logger: Logger) {
    this.logger = logger;
    this.securityConfig = config.securityConfig || this.getDefaultSecurityConfig();
    this.storageDir = join(homedir(), '.doc-gen', 'keys');
    this.initializeStorage();
  }

  /**
   * Initialize secure storage directory
   */
  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 });
      this.logger.debug('Initialized secure storage directory');
    } catch (error) {
      this.logger.error('Failed to initialize secure storage', error as Error);
      throw new Error('Failed to initialize secure storage');
    }
  }

  /**
   * Generate or retrieve master key for encryption
   */
  private async getMasterKey(password?: string): Promise<Buffer> {
    if (this.masterKey) {
      return this.masterKey;
    }

    const keySource = password || process.env.DOC_GEN_MASTER_KEY || 'default-key';
    const salt = await this.getOrCreateSalt();

    this.masterKey = pbkdf2Sync(
      keySource,
      salt,
      this.securityConfig.apiKeyEncryption.keyDerivation?.iterations || 100000,
      32,
      'sha256'
    );

    return this.masterKey;
  }

  /**
   * Get or create salt for key derivation
   */
  private async getOrCreateSalt(): Promise<Buffer> {
    const saltPath = join(this.storageDir, '.salt');

    try {
      const saltData = await fs.readFile(saltPath);
      return saltData;
    } catch {
      const salt = randomBytes(this.securityConfig.apiKeyEncryption.keyDerivation?.saltLength || 32);
      await fs.writeFile(saltPath, salt, { mode: 0o600 });
      this.logger.debug('Created new salt for key derivation');
      return salt;
    }
  }

  /**
   * Encrypt an API key
   */
  public async encryptApiKey(
    apiKey: string,
    provider: ApiProvider,
    expiresAt?: number,
    password?: string
  ): Promise<EncryptedApiKey> {
    try {
      const validation = this.validateApiKey(apiKey, provider);
      if (!validation.isValid) {
        throw new Error(`Invalid API key for provider ${provider}: ${validation.errors.join(', ')}`);
      }

      const masterKey = await this.getMasterKey(password);
      const iv = randomBytes(16);
      const algorithm = this.securityConfig.apiKeyEncryption.algorithm || 'aes-256-gcm';

      const cipher = createCipher(algorithm, masterKey);
      let encrypted = cipher.update(apiKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const keyId = this.generateKeyId(provider);
      const salt = await this.getOrCreateSalt();

      const encryptedKey: EncryptedApiKey = {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        algorithm,
        provider,
        createdAt: Date.now(),
        expiresAt,
        keyId
      };

      this.logger.debug(`Encrypted API key for provider ${provider} with ID ${keyId}`);
      return encryptedKey;
    } catch (error) {
      this.logger.error('Failed to encrypt API key', error as Error);
      throw error;
    }
  }

  /**
   * Decrypt an API key
   */
  public async decryptApiKey(
    encryptedKey: EncryptedApiKey,
    password?: string
  ): Promise<string> {
    try {
      // Check if key is expired
      if (encryptedKey.expiresAt && Date.now() > encryptedKey.expiresAt) {
        throw new Error(`API key ${encryptedKey.keyId} has expired`);
      }

      const masterKey = await this.getMasterKey(password);
      const decipher = createDecipher(encryptedKey.algorithm, masterKey);

      let decrypted = decipher.update(encryptedKey.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Validate decrypted key
      const validation = this.validateApiKey(decrypted, encryptedKey.provider);
      if (!validation.isValid) {
        throw new Error('Decrypted API key failed validation');
      }

      this.logger.debug(`Decrypted API key for provider ${encryptedKey.provider}`);
      return decrypted;
    } catch (error) {
      this.logger.error('Failed to decrypt API key', error as Error);
      throw error;
    }
  }

  /**
   * Validate API key format for a specific provider
   */
  public validateApiKey(apiKey: string, provider?: ApiProvider): ValidationResult {
    const result: ValidationResult = {
      isValid: false,
      errors: [],
      warnings: []
    };

    if (!apiKey || typeof apiKey !== 'string') {
      result.errors.push('API key must be a non-empty string');
      return result;
    }

    if (apiKey.length < 10) {
      result.errors.push('API key is too short');
      return result;
    }

    if (apiKey.length > 200) {
      result.errors.push('API key is too long');
      return result;
    }

    // Check for common security issues
    if (apiKey.includes(' ')) {
      result.errors.push('API key should not contain spaces');
    }

    if (/^[a-zA-Z0-9\-_]+$/.test(apiKey) === false) {
      result.warnings.push('API key contains unusual characters');
    }

    // Provider-specific validation
    if (provider) {
      const pattern = API_KEY_PATTERNS[provider];
      if (pattern && !pattern.test(apiKey)) {
        result.errors.push(`API key does not match expected format for ${provider}`);
      } else {
        result.provider = provider;
      }
    } else {
      // Try to detect provider from key format
      for (const [providerName, pattern] of Object.entries(API_KEY_PATTERNS)) {
        if (pattern.test(apiKey)) {
          result.provider = providerName as ApiProvider;
          break;
        }
      }

      if (!result.provider) {
        result.warnings.push('Could not detect API key provider');
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Store API key securely
   */
  public async storeSecurely(
    apiKey: string,
    provider: ApiProvider,
    storageType: StorageType = StorageType.ENCRYPTED_FILE,
    options?: {
      keyId?: string;
      expiresAt?: number;
      password?: string;
    }
  ): Promise<string> {
    try {
      const encryptedKey = await this.encryptApiKey(
        apiKey,
        provider,
        options?.expiresAt,
        options?.password
      );

      const keyId = options?.keyId || encryptedKey.keyId;

      switch (storageType) {
        case StorageType.ENVIRONMENT:
          await this.storeInEnvironment(keyId, encryptedKey);
          break;
        case StorageType.ENCRYPTED_FILE:
          await this.storeInFile(keyId, encryptedKey);
          break;
        case StorageType.MEMORY:
          this.storeInMemory(keyId, encryptedKey);
          break;
        default:
          throw new Error(`Unsupported storage type: ${storageType}`);
      }

      this.logger.info(`Stored API key securely for provider ${provider} with ID ${keyId}`);
      return keyId;
    } catch (error) {
      this.logger.error('Failed to store API key securely', error as Error);
      throw error;
    }
  }

  /**
   * Retrieve API key securely
   */
  public async retrieveSecurely(
    keyId: string,
    storageType: StorageType = StorageType.ENCRYPTED_FILE,
    password?: string
  ): Promise<string> {
    try {
      let encryptedKey: EncryptedApiKey;

      switch (storageType) {
        case StorageType.ENVIRONMENT:
          encryptedKey = await this.retrieveFromEnvironment(keyId);
          break;
        case StorageType.ENCRYPTED_FILE:
          encryptedKey = await this.retrieveFromFile(keyId);
          break;
        case StorageType.MEMORY:
          encryptedKey = this.retrieveFromMemory(keyId);
          break;
        default:
          throw new Error(`Unsupported storage type: ${storageType}`);
      }

      const apiKey = await this.decryptApiKey(encryptedKey, password);
      this.logger.debug(`Retrieved API key for ID ${keyId}`);
      return apiKey;
    } catch (error) {
      this.logger.error(`Failed to retrieve API key ${keyId}`, error as Error);
      throw error;
    }
  }

  /**
   * List stored API keys metadata
   */
  public async listStoredKeys(storageType: StorageType = StorageType.ENCRYPTED_FILE): Promise<ApiKeyMetadata[]> {
    try {
      const metadata: ApiKeyMetadata[] = [];

      switch (storageType) {
        case StorageType.ENCRYPTED_FILE:
          const files = await fs.readdir(this.storageDir);
          for (const file of files) {
            if (file.endsWith('.key')) {
              try {
                const keyData = await this.retrieveFromFile(file.replace('.key', ''));
                metadata.push(this.extractMetadata(keyData));
              } catch {
                // Skip corrupted or inaccessible keys
              }
            }
          }
          break;
        case StorageType.MEMORY:
          for (const [keyId, encryptedKey] of this.memoryStore) {
            metadata.push(this.extractMetadata(encryptedKey));
          }
          break;
        case StorageType.ENVIRONMENT:
          // Environment variables are harder to enumerate
          break;
      }

      return metadata;
    } catch (error) {
      this.logger.error('Failed to list stored keys', error as Error);
      return [];
    }
  }

  /**
   * Check if API key needs rotation
   */
  public async checkKeyRotation(keyId: string, storageType: StorageType = StorageType.ENCRYPTED_FILE): Promise<{
    needsRotation: boolean;
    daysUntilExpiry?: number;
    reason?: string;
  }> {
    try {
      const metadata = await this.getKeyMetadata(keyId, storageType);
      if (!metadata) {
        return { needsRotation: true, reason: 'Key not found' };
      }

      const now = Date.now();
      const keyAge = now - metadata.createdAt;
      const keyAgeDays = keyAge / (1000 * 60 * 60 * 24);

      // Check expiration
      if (metadata.expiresAt && now > metadata.expiresAt) {
        return { needsRotation: true, reason: 'Key has expired' };
      }

      // Check rotation interval
      const rotationConfig = this.getKeyRotationConfig();
      if (rotationConfig.enabled && keyAgeDays > rotationConfig.rotationIntervalDays) {
        return { needsRotation: true, reason: 'Key rotation interval exceeded' };
      }

      // Check warning period
      if (metadata.expiresAt) {
        const daysUntilExpiry = (metadata.expiresAt - now) / (1000 * 60 * 60 * 24);
        if (daysUntilExpiry <= rotationConfig.warningDays) {
          return {
            needsRotation: false,
            daysUntilExpiry: Math.ceil(daysUntilExpiry),
            reason: 'Key expiring soon'
          };
        }
      }

      return { needsRotation: false };
    } catch (error) {
      this.logger.error(`Failed to check key rotation for ${keyId}`, error as Error);
      return { needsRotation: true, reason: 'Error checking key status' };
    }
  }

  /**
   * Rotate API key
   */
  public async rotateApiKey(
    oldKeyId: string,
    newApiKey: string,
    storageType: StorageType = StorageType.ENCRYPTED_FILE,
    password?: string
  ): Promise<string> {
    try {
      // Get old key metadata
      const oldMetadata = await this.getKeyMetadata(oldKeyId, storageType);
      if (!oldMetadata) {
        throw new Error(`Key ${oldKeyId} not found`);
      }

      // Store new key
      const newKeyId = await this.storeSecurely(
        newApiKey,
        oldMetadata.provider,
        storageType,
        { password }
      );

      // Mark old key as expired (don't delete immediately for rollback)
      await this.expireKey(oldKeyId, storageType);

      this.logger.info(`Rotated API key from ${oldKeyId} to ${newKeyId}`);
      return newKeyId;
    } catch (error) {
      this.logger.error(`Failed to rotate API key ${oldKeyId}`, error as Error);
      throw error;
    }
  }

  /**
   * Delete API key
   */
  public async deleteKey(keyId: string, storageType: StorageType = StorageType.ENCRYPTED_FILE): Promise<void> {
    try {
      switch (storageType) {
        case StorageType.ENCRYPTED_FILE:
          const filePath = join(this.storageDir, `${keyId}.key`);
          await fs.unlink(filePath);
          break;
        case StorageType.MEMORY:
          this.memoryStore.delete(keyId);
          break;
        case StorageType.ENVIRONMENT:
          // Cannot delete environment variables programmatically
          this.logger.warn(`Cannot delete environment variable for key ${keyId}`);
          break;
      }

      this.logger.info(`Deleted API key ${keyId}`);
    } catch (error) {
      this.logger.error(`Failed to delete API key ${keyId}`, error as Error);
      throw error;
    }
  }

  // Private helper methods

  private generateKeyId(provider: ApiProvider): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `${provider}_${timestamp}_${random}`;
  }

  private async storeInFile(keyId: string, encryptedKey: EncryptedApiKey): Promise<void> {
    const filePath = join(this.storageDir, `${keyId}.key`);
    const data = JSON.stringify(encryptedKey, null, 2);
    await fs.writeFile(filePath, data, { mode: 0o600 });
  }

  private async retrieveFromFile(keyId: string): Promise<EncryptedApiKey> {
    const filePath = join(this.storageDir, `${keyId}.key`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }

  private async storeInEnvironment(keyId: string, encryptedKey: EncryptedApiKey): Promise<void> {
    const envVar = `DOC_GEN_KEY_${keyId.toUpperCase()}`;
    process.env[envVar] = JSON.stringify(encryptedKey);
  }

  private async retrieveFromEnvironment(keyId: string): Promise<EncryptedApiKey> {
    const envVar = `DOC_GEN_KEY_${keyId.toUpperCase()}`;
    const data = process.env[envVar];
    if (!data) {
      throw new Error(`Environment variable ${envVar} not found`);
    }
    return JSON.parse(data);
  }

  private storeInMemory(keyId: string, encryptedKey: EncryptedApiKey): void {
    this.memoryStore.set(keyId, encryptedKey);
  }

  private retrieveFromMemory(keyId: string): EncryptedApiKey {
    const encryptedKey = this.memoryStore.get(keyId);
    if (!encryptedKey) {
      throw new Error(`Key ${keyId} not found in memory`);
    }
    return encryptedKey;
  }

  private extractMetadata(encryptedKey: EncryptedApiKey): ApiKeyMetadata {
    return {
      provider: encryptedKey.provider,
      keyId: encryptedKey.keyId,
      createdAt: encryptedKey.createdAt,
      expiresAt: encryptedKey.expiresAt !== undefined ? encryptedKey.expiresAt : undefined,
      isValid: !encryptedKey.expiresAt || Date.now() < encryptedKey.expiresAt
    };
  }

  private async getKeyMetadata(keyId: string, storageType: StorageType): Promise<ApiKeyMetadata | null> {
    try {
      let encryptedKey: EncryptedApiKey;

      switch (storageType) {
        case StorageType.ENCRYPTED_FILE:
          encryptedKey = await this.retrieveFromFile(keyId);
          break;
        case StorageType.MEMORY:
          encryptedKey = this.retrieveFromMemory(keyId);
          break;
        case StorageType.ENVIRONMENT:
          encryptedKey = await this.retrieveFromEnvironment(keyId);
          break;
        default:
          return null;
      }

      return this.extractMetadata(encryptedKey);
    } catch {
      return null;
    }
  }

  private async expireKey(keyId: string, storageType: StorageType): Promise<void> {
    try {
      let encryptedKey: EncryptedApiKey;

      switch (storageType) {
        case StorageType.ENCRYPTED_FILE:
          encryptedKey = await this.retrieveFromFile(keyId);
          encryptedKey.expiresAt = Date.now();
          await this.storeInFile(keyId, encryptedKey);
          break;
        case StorageType.MEMORY:
          encryptedKey = this.retrieveFromMemory(keyId);
          encryptedKey.expiresAt = Date.now();
          this.storeInMemory(keyId, encryptedKey);
          break;
        case StorageType.ENVIRONMENT:
          encryptedKey = await this.retrieveFromEnvironment(keyId);
          encryptedKey.expiresAt = Date.now();
          await this.storeInEnvironment(keyId, encryptedKey);
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to expire key ${keyId}`, error as Error);
    }
  }

  private getKeyRotationConfig(): KeyRotationConfig {
    return {
      enabled: true,
      rotationIntervalDays: 90,
      warningDays: 7,
      autoRotate: false
    };
  }

  private getDefaultSecurityConfig(): SecurityConfig {
    return {
      apiKeyEncryption: {
        enabled: true,
        algorithm: 'aes-256-gcm',
        keyDerivation: {
          iterations: 100000,
          saltLength: 32
        }
      },
      rateLimiting: {
        enabled: true,
        requestsPerMinute: 60,
        burstCapacity: 10,
        backoffStrategy: 'exponential',
        maxRetries: 3
      },
      privacy: {
        level: 'moderate' as any,
        detectPII: true,
        sanitizeData: true,
        redactionChar: '*'
      }
    };
  }
}
