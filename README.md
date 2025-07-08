# API Documentation Generator

[![npm version](https://badge.fury.io/js/api-doc-generator.svg)](https://badge.fury.io/js/api-doc-generator)
[![Build Status](https://github.com/traycerai/api-doc-generator/workflows/CI/badge.svg)](https://github.com/traycerai/api-doc-generator/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A powerful CLI tool that automatically generates comprehensive API documentation using AI. Supports multiple scanning modes including live API discovery, code analysis, and GraphQL introspection. Outputs beautiful, developer-friendly documentation in Slate-compatible Markdown format.

## ✨ Features

- 🔍 **Multiple Scanning Modes**: Live API discovery, code analysis, and GraphQL introspection
- 🤖 **AI-Powered**: Uses OpenAI GPT-4 to generate high-quality, human-readable documentation
- 🔐 **Authentication Support**: Bearer tokens, API keys, basic auth, and more
- 📝 **Slate-Compatible Output**: Generates beautiful Markdown documentation ready for Slate
- 🚀 **Easy to Use**: Simple CLI interface with sensible defaults
- 🔧 **Extensible**: Modular architecture for adding new scanners and output formats

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
# Generate docs for a live REST API
api-doc-generator --mode live --type rest --url https://api.example.com --token your-api-token

# Scan a GraphQL API
api-doc-generator --mode live --type graphql --url https://api.example.com/graphql --token your-token

# Analyze code for API endpoints (coming soon)
api-doc-generator --mode code --path ./src/routes
```

## 📋 Prerequisites

- Node.js 18+ 
- OpenAI API key (for AI-powered documentation generation)

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

Create a `.env` file or set environment variables:

```bash
export OPENAI_API_KEY=your-openai-api-key
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
  --openai-key <key>       OpenAI API key (or use OPENAI_API_KEY env var)
  --openai-model <model>   OpenAI model to use (default: 'gpt-4')
  -p, --path <path>        Path to code directory (for code mode)
  --endpoints <endpoints>  Comma-separated list of seed endpoints to test
  --timeout <ms>           Request timeout in milliseconds (default: 5000)
  --rate-limit <ms>        Rate limit between requests (default: 100)
  -v, --verbose            Enable verbose logging
  -h, --help               Display help information
  --version                Display version information
```

## 🔧 Configuration

### Authentication Methods

#### Bearer Token
```bash
api-doc-generator --url https://api.example.com --token your-bearer-token --auth-type bearer
```

#### API Key
```bash
api-doc-generator --url https://api.example.com --token your-api-key --auth-type apikey --api-key-header "X-API-Key"
```

#### Basic Authentication
```bash
api-doc-generator --url https://api.example.com --token "username:password" --auth-type basic
```

#### No Authentication
```bash
api-doc-generator --url https://api.example.com --auth-type none
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
  "openaiModel": "gpt-4",
  "timeout": 10000,
  "rateLimit": 200,
  "endpoints": [
    "/api/users",
    "/api/posts",
    "/api/comments"
  ]
}
```

## 📚 Examples

### REST API Documentation

Generate documentation for a REST API with bearer token authentication:

```bash
api-doc-generator \
  --mode live \
  --type rest \
  --url https://jsonplaceholder.typicode.com \
  --auth-type none \
  --out jsonplaceholder-docs.md \
  --endpoints "/posts,/users,/comments"
```

### GraphQL API Documentation

Generate documentation for a GraphQL API:

```bash
api-doc-generator \
  --mode live \
  --type graphql \
  --url https://api.github.com/graphql \
  --token ghp_your_github_token \
  --auth-type bearer \
  --out github-api-docs.md
```

### Private API with Custom Headers

```bash
api-doc-generator \
  --mode live \
  --type rest \
  --url https://api.yourcompany.com \
  --token your-api-key \
  --auth-type apikey \
  --api-key-header "X-Company-API-Key" \
  --out company-api-docs.md \
  --verbose
```

### Code Analysis (Coming Soon)

```bash
api-doc-generator \
  --mode code \
  --path ./src/routes \
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

## 🐛 Troubleshooting

### Common Issues

#### OpenAI API Key Not Found
```
Error: OpenAI API key not provided
```
**Solution**: Set the `OPENAI_API_KEY` environment variable or use `--openai-key` option.

#### Authentication Failed
```
Error: Authentication failed (401)
```
**Solution**: Verify your token and authentication type. Check if the API requires specific headers.

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

### Debug Mode

Enable verbose logging to see detailed information:

```bash
api-doc-generator --verbose --url https://api.example.com
```

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
├── ai/            # OpenAI integration
├── generators/    # Output format generators
└── utils/         # Shared utilities
```

### Adding New Features

1. **New Scanner**: Implement the `IScanner` interface in `src/scanners/`
2. **New Auth Method**: Implement the `IAuthStrategy` interface in `src/auth/`
3. **New Output Format**: Create a new generator in `src/generators/`

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
- [Slate](https://github.com/slatedocs/slate) for the documentation format inspiration
- The open-source community for the amazing tools and libraries
