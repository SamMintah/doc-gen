# API Documentation Generator

[![npm version](https://badge.fury.io/js/api-doc-generator.svg)](https://badge.fury.io/js/api-doc-generator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A powerful CLI tool that automatically generates comprehensive API documentation using AI. Supports multiple scanning modes including live API discovery, code analysis, and GraphQL introspection. Outputs beautiful, developer-friendly documentation in Slate-compatible Markdown format.

## ✨ Features

- 🔍 **Multiple Scanning Modes**: Live API discovery, code analysis, and GraphQL introspection
- 🤖 **Multi-Provider AI Support**: Works with OpenAI GPT-4, Anthropic Claude, Google Gemini, and more
- 🔐 **Authentication Support**: Bearer tokens, API keys, basic auth, and more
- 📝 **Slate-Compatible Output**: Generates beautiful Markdown documentation ready for Slate
- 🚀 **Easy to Use**: Simple CLI interface with sensible defaults
- 🔧 **Extensible**: Modular architecture for adding new scanners, output formats, and LLM providers

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g api-doc-generator

# Or use with npx
npx api-doc-generator --help
```

### Basic Usage

```bash
# Generate docs for a live REST API (using OpenAI)
api-doc-generator --mode live --type rest --url https://api.example.com --token your-api-token --provider openai --openai-key your-openai-key

# Scan a GraphQL API (using Anthropic Claude)
api-doc-generator --mode live --type graphql --url https://api.example.com/graphql --token your-token --provider anthropic --anthropic-key your-anthropic-key

# Analyze code for API endpoints (coming soon)
api-doc-generator --mode code --path ./src/routes --provider gemini --gemini-key your-gemini-key
```

## 📋 Prerequisites

- Node.js 18+ 
- API key for at least one supported LLM provider (OpenAI, Anthropic, Google Gemini, etc.)

## 🛠️ Installation

### Global Installation

```bash
npm install -g api-doc-generator
```

### Local Installation

```bash
npm install api-doc-generator
```

### From Source

```bash
git clone https://github.com/traycerai/api-doc-generator.git
cd api-doc-generator
npm install
npm run build
npm link
```

## 📖 Usage

### Environment Setup

Create a `.env` file or set environment variables for your preferred LLM provider:

```bash
# OpenAI (default provider)
export OPENAI_API_KEY=your-openai-api-key

# Anthropic Claude
export ANTHROPIC_API_KEY=your-anthropic-api-key

# Google Gemini
export GEMINI_API_KEY=your-gemini-api-key

# You can set multiple providers and switch between them
```

### CLI Options

```bash
api-doc-generator [options]

Options:
  -m, --mode <mode>        Scanning mode: 'live' or 'code' (default: 'live')
  -t, --type <type>        API type: 'rest' or 'graphql' (default: 'rest')
  -u, --url <url>          Base URL for live API scanning
  --token <token>          Authentication token
  --auth-type <type>       Authentication type: 'bearer', 'apikey', 'basic', 'none' (default: 'bearer')
  --api-key-header <name>  Header name for API key authentication (default: 'X-API-Key')
  -o, --out <file>         Output file path (default: 'api-docs.md')
  --provider <provider>    LLM provider: 'openai', 'anthropic', 'gemini' (default: 'openai')
  --model <model>          Model to use (provider-specific, e.g., 'gpt-4', 'claude-3-opus')
  --openai-key <key>       OpenAI API key (or use OPENAI_API_KEY env var)
  --anthropic-key <key>    Anthropic API key (or use ANTHROPIC_API_KEY env var)
  --gemini-key <key>       Google Gemini API key (or use GEMINI_API_KEY env var)
  -p, --path <path>        Path to code directory (for code mode)
  --endpoints <endpoints>  Comma-separated list of seed endpoints to test
  --timeout <ms>           Request timeout in milliseconds (default: 5000)
  --rate-limit <ms>        Rate limit between requests (default: 100)
  -v, --verbose            Enable verbose logging
  -h, --help               Display help information
  --version                Display version information
```

## 🔧 Configuration

### LLM Provider Configuration

#### OpenAI (Default)
```bash
# Using environment variable
export OPENAI_API_KEY=sk-your-openai-api-key

# Using CLI option
api-doc-generator --provider openai --openai-key sk-your-openai-api-key --model gpt-4
```

**Supported Models**: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`

#### Anthropic Claude
```bash
# Using environment variable
export ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key

# Using CLI option
api-doc-generator --provider anthropic --anthropic-key sk-ant-your-anthropic-api-key --model claude-3-opus
```

**Supported Models**: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`

#### Google Gemini
```bash
# Using environment variable
export GEMINI_API_KEY=your-gemini-api-key

# Using CLI option
api-doc-generator --provider gemini --gemini-key your-gemini-api-key --model gemini-1.5-flash-latest
```

**Supported Models**: `gemini-1.5-flash-latest`, `gemini-pro-vision`

### API Authentication Methods

#### Bearer Token
```bash
api-doc-generator --url https://api.example.com --token your-bearer-token --auth-type bearer --provider openai --openai-key your-key
```

#### API Key
```bash
api-doc-generator --url https://api.example.com --token your-api-key --auth-type apikey --api-key-header "X-API-Key" --provider anthropic --anthropic-key your-key
```

#### Basic Authentication
```bash
api-doc-generator --url https://api.example.com --token "username:password" --auth-type basic --provider gemini --gemini-key your-key
```

#### No Authentication
```bash
api-doc-generator --url https://api.example.com --auth-type none --provider openai --openai-key your-key
```

### Configuration File

Create a `api-doc-generator.config.json` file in your project root:

```json
{
  "mode": "live",
  "type": "rest",
  "url": "https://api.example.com",
  "authType": "bearer",
  "token": "your-token",
  "out": "docs/api.md",
  "provider": "openai",
  "model": "gpt-4",
  "providerConfig": {
    "temperature": 0.1,
    "maxTokens": 4000
  },
  "timeout": 10000,
  "rateLimit": 200,
  "endpoints": [
    "/api/users",
    "/api/posts",
    "/api/comments"
  ]
}
```

#### Multi-Provider Configuration
```json
{
  "provider": "anthropic",
  "model": "claude-3-opus",
  "providerConfig": {
    "maxTokens": 4000,
    "temperature": 0.1
  },
  "fallbackProvider": "openai",
  "fallbackModel": "gpt-4"
}
```

## 📚 Examples

### REST API Documentation with OpenAI

Generate documentation for a REST API using OpenAI GPT-4:

```bash
api-doc-generator \
  --mode live \
  --type rest \
  --url https://jsonplaceholder.typicode.com \
  --auth-type none \
  --provider openai \
  --openai-key sk-your-openai-key \
  --model gpt-4 \
  --out jsonplaceholder-docs.md \
  --endpoints "/posts,/users,/comments"
```

### GraphQL API Documentation with Anthropic Claude

Generate documentation for a GraphQL API using Anthropic Claude:

```bash
api-doc-generator \
  --mode live \
  --type graphql \
  --url https://api.github.com/graphql \
  --token ghp_your_github_token \
  --auth-type bearer \
  --provider anthropic \
  --anthropic-key sk-ant-your-anthropic-key \
  --model claude-3-opus \
  --out github-api-docs.md
```

### Private API with Google Gemini

```bash
api-doc-generator \
  --mode live \
  --type rest \
  --url https://api.yourcompany.com \
  --token your-api-key \
  --auth-type apikey \
  --api-key-header "X-Company-API-Key" \
  --provider gemini \
  --gemini-key your-gemini-key \
  --model gemini-1.5-flash-latest \
  --out company-api-docs.md \
  --verbose
```

### Using Environment Variables

```bash
# Set your preferred provider
export ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Run without specifying keys in CLI
api-doc-generator \
  --mode live \
  --type rest \
  --url https://api.example.com \
  --provider anthropic \
  --model claude-3-sonnet \
  --out api-docs.md
```

### Code Analysis (Coming Soon)

```bash
api-doc-generator \
  --mode code \
  --path ./src/routes \
  --provider openai \
  --model gpt-4 \
  --out api-docs.md
```

## 📄 Output Format

The tool generates Slate-compatible Markdown with the following structure:

```markdown
---
title: API Documentation
language_tabs:
  - shell: cURL
  - javascript: JavaScript
  - python: Python
toc_footers:
  - Generated by API Documentation Generator
---

# API Documentation

## Authentication

Information about authentication methods...

## Endpoints

### GET /api/users

Retrieve a list of users...

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number for pagination |
| limit | integer | No | Number of items per page |

#### Example Request

```shell
curl "https://api.example.com/api/users?page=1&limit=10" \
  -H "Authorization: Bearer your-token"
```

#### Example Response

```json
{
  "users": [...],
  "pagination": {...}
}
```
```

## 🔍 Scanning Modes

### Live API Scanning

The tool discovers endpoints through multiple strategies:

1. **OpenAPI/Swagger Detection**: Checks common paths like `/swagger.json`, `/api-docs`
2. **OPTIONS Requests**: Discovers supported HTTP methods
3. **Seed Endpoints**: Tests provided endpoint paths
4. **Link Discovery**: Follows HATEOAS links in responses

### GraphQL Introspection

Uses GraphQL introspection queries to discover:

- Available queries, mutations, and subscriptions
- Field definitions and types
- Arguments and return types
- Documentation strings

### Code Analysis (Coming Soon)

Analyzes source code to find:

- Route definitions
- Controller methods
- Request/response schemas
- Middleware and authentication

## 🔄 Migration Guide

### Upgrading from OpenAI-Only Version

If you're upgrading from a previous version that only supported OpenAI, here's what you need to know:

#### Backward Compatibility
The tool maintains full backward compatibility. Existing commands will continue to work:

```bash
# This still works (defaults to OpenAI provider)
api-doc-generator --url https://api.example.com --openai-key your-key
```

#### New Provider Options
To use new providers, simply add the `--provider` option:

```bash
# Old way (still works)
api-doc-generator --url https://api.example.com --openai-key your-key --openai-model gpt-4

# New way with explicit provider
api-doc-generator --url https://api.example.com --provider openai --openai-key your-key --model gpt-4

# Using Anthropic
api-doc-generator --url https://api.example.com --provider anthropic --anthropic-key your-key --model claude-3-opus
```

#### Configuration File Updates
Update your `api-doc-generator.config.json`:

```json
{
  // Old format (still supported)
  "openaiModel": "gpt-4",
  
  // New format (recommended)
  "provider": "openai",
  "model": "gpt-4"
}
```

#### Environment Variables
Old environment variables are still supported, but you can now use provider-specific ones:

```bash
# Old (still works)
export OPENAI_API_KEY=your-key

# New options
export ANTHROPIC_API_KEY=your-anthropic-key
export GEMINI_API_KEY=your-gemini-key
```

## 🏗️ Provider Architecture

### Adding New LLM Providers

The tool uses a modular provider architecture that makes it easy to add new LLM providers. Here's how it works:

#### Core Interfaces

All providers implement the `LLMClient` interface:

```typescript
interface LLMClient {
  generateDocumentation(prompt: string, context?: any): Promise<LLMResponse>;
  generateBatch(prompts: string[]): Promise<LLMResponse[]>;
  validateConnection(): Promise<boolean>;
  getTokenUsage(): TokenUsage;
  resetTokenUsage(): void;
  estimateTokenCount(text: string): number;
  isApproachingTokenLimit(): boolean;
}
```

#### Provider Implementation

Each provider is implemented in `src/llm/providers/`:

```
src/llm/providers/
├── openai.ts      # OpenAI GPT implementation
├── anthropic.ts   # Anthropic Claude implementation
├── gemini.ts      # Google Gemini implementation
└── base.ts        # Base provider class
```

#### Factory Pattern

The `LLMFactory` creates provider instances based on configuration:

```typescript
const client = LLMFactory.create(config);
```

#### Adding a New Provider

1. **Create Provider Class**: Implement `LLMClient` interface
2. **Add to Factory**: Register in `LLMFactory.create()`
3. **Update CLI**: Add new CLI options for the provider
4. **Add Configuration**: Update config interfaces
5. **Write Tests**: Add comprehensive test coverage

Example provider structure:

```typescript
export class CustomProvider implements LLMClient {
  constructor(private config: CustomProviderConfig) {}
  
  async generateDocumentation(prompt: string): Promise<LLMResponse> {
    // Implementation
  }
  
  // ... other interface methods
}
```

## 🐛 Troubleshooting

### Common Issues

#### LLM API Key Not Found
```
Error: API key not provided for provider 'openai'
```
**Solution**: Set the appropriate environment variable or use the provider-specific CLI option:
- OpenAI: `OPENAI_API_KEY` or `--openai-key`
- Anthropic: `ANTHROPIC_API_KEY` or `--anthropic-key`
- Gemini: `GEMINI_API_KEY` or `--gemini-key`

#### Provider Not Supported
```
Error: Unsupported provider 'custom-provider'
```
**Solution**: Check the list of supported providers: `openai`, `anthropic`, `gemini`. Make sure you're using the correct provider name.

#### Model Not Available
```
Error: Model 'gpt-5' not available for provider 'openai'
```
**Solution**: Check the supported models for your provider and ensure you have access to the specified model.

#### Authentication Failed
```
Error: Authentication failed (401)
```
**Solution**: Verify your API key and authentication type. Check if the API requires specific headers.

#### Rate Limiting
```
Error: Too many requests (429)
```
**Solution**: Increase the rate limit delay with `--rate-limit 1000` (1 second between requests).

#### GraphQL Introspection Disabled
```
Error: GraphQL introspection is disabled
```
**Solution**: Contact the API provider or use seed endpoints with `--endpoints` option.

#### Provider-Specific Issues

**OpenAI**: Ensure your API key starts with `sk-` and you have sufficient credits.

**Anthropic**: Make sure your API key starts with `sk-ant-` and you have access to the Claude API.

**Gemini**: Verify your API key is valid and you have enabled the Generative AI API in Google Cloud Console.

### Debug Mode

Enable verbose logging to see detailed information about provider selection and API calls:

```bash
api-doc-generator --verbose --provider anthropic --url https://api.example.com
```

### Provider Comparison

| Feature | OpenAI GPT-4 | Anthropic Claude | Google Gemini |
|---------|--------------|------------------|---------------|
| Context Length | 128k tokens | 200k tokens | 1M tokens |
| Code Understanding | Excellent | Excellent | Very Good |
| API Documentation | Excellent | Excellent | Good |
| Rate Limits | Moderate | Generous | Generous |
| Cost | $$$ | $$ | $ |
| Availability | Global | Limited regions | Limited regions |

### Network Issues

If you're behind a corporate firewall:

```bash
# Set proxy
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Increase timeout
api-doc-generator --timeout 30000 --url https://api.example.com
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/traycerai/api-doc-generator.git
cd api-doc-generator

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build the project
npm run build
```

### Project Structure

```
src/
├── cli/           # CLI interface and argument parsing
├── core/          # Main application logic
├── models/        # TypeScript interfaces and types
├── interfaces/    # Abstract interfaces
├── scanners/      # API scanning implementations
├── auth/          # Authentication strategies
├── llm/           # LLM provider abstraction
│   ├── interfaces.ts    # Core LLM interfaces
│   ├── factory.ts       # Provider factory
│   └── providers/       # Provider implementations
│       ├── openai.ts    # OpenAI provider
│       ├── anthropic.ts # Anthropic provider
│       └── gemini.ts    # Google Gemini provider
├── generators/    # Output format generators
└── utils/         # Shared utilities
```

### Adding New Features

1. **New Scanner**: Implement the `IScanner` interface in `src/scanners/`
2. **New Auth Method**: Implement the `IAuthStrategy` interface in `src/auth/`
3. **New Output Format**: Create a new generator in `src/generators/`
4. **New LLM Provider**: Implement the `LLMClient` interface in `src/llm/providers/`

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [OpenAI](https://openai.com/) for providing the GPT-4 API
- [Anthropic](https://www.anthropic.com/) for the Claude API
- [Google](https://ai.google.dev/) for the Gemini API
- [Slate](https://github.com/slatedocs/slate) for the documentation format inspiration
- The open-source community for the amazing tools and libraries
