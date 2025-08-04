#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ConfigBuilder } from '../models/config.js';
import { CliArgs, ConfigValidationError, ScanMode, ApiType } from '../models/config';
import { generateDocumentation, getGenerationSummary, getHealthStatus, formatDuration } from '../core/app';

// Load environment variables from .env file
dotenv.config();

// Package information
const packageInfo = {
  name: 'api-doc-generator',
  version: '1.0.0',
  description: 'AI-powered CLI tool for generating comprehensive API documentation from live APIs and code'
};

/**
 * Main CLI program setup and execution
 */
async function main(): Promise<void> {
  const program = new Command();

  // Configure the CLI program
  program
    .name(packageInfo.name)
    .description(packageInfo.description)
    .version(packageInfo.version, '-v, --version', 'display version number')
    .helpOption('-h, --help', 'display help for command');

  // Define command-line options
  program
    .option(
      '-m, --mode <mode>',
      'scanning mode: "code" for static code analysis or "live" for live API scanning',
      'live'
    )
    .option(
      '-u, --url <url>',
      'base URL of the API to scan (required for live mode)'
    )
    .option(
      '-t, --token <token>',
      'authentication token for API access'
    )
    .option(
      '--type <type>',
      'API type: "rest" for REST APIs or "graphql" for GraphQL APIs',
      'rest'
    )
    .option(
      '-o, --out <file>',
      'output file path for generated documentation',
      './api-docs.md'
    )
    .option(
      '--provider <provider>',
      'LLM provider: "openai", "anthropic", "gemini", "cohere", or "huggingface"',
      'openai'
    )
    .option(
      '--api-key <key>',
      'API key for the selected LLM provider (can also be set via environment variable, e.g., OPENAI_API_KEY for OpenAI)'
    )
    .option(
      '--model <model>',
      'specific model to use (provider-dependent, e.g., "gpt-4", "claude-3-opus", "gemini-1.5-flash-latest")'
    )
    .option(
      '--auth-type <type>',
      'authentication type: "none", "bearer", "apiKey", or "basic"',
      'none'
    )
    .option(
      '--auth-header-name <name>',
      'custom header name for API key authentication (e.g., "X-API-Key")'
    )
    .option(
      '--seed-endpoints <endpoints>',
      'comma-separated list of seed endpoints to start scanning from'
    )
    .option(
      '--max-depth <depth>',
      'maximum depth for endpoint discovery',
      parseInt,
      3
    )
    .option(
      '--timeout <ms>',
      'request timeout in milliseconds',
      parseInt,
      30000
    )
    .option(
      '--rate-limit <rps>',
      'rate limit in requests per second',
      parseInt,
      10
    )
    .option(
      '--title <title>',
      'documentation title',
      'API Documentation'
    )
    .option(
      '--description <description>',
      'documentation description',
      'Generated API documentation'
    )
    .option(
      '--api-version <version>',
      'API version to include in documentation',
      '1.0.0'
    )
    .option(
      '--verbose',
      'enable verbose logging',
      false
    )
    .option(
      '--debug',
      'enable debug mode with detailed error information',
      false
    )
    .option(
      '--health-check',
      'perform health check and exit',
      false
    );

  // Add examples to help text
  program.addHelpText('after', `

${chalk.bold('Examples:')}
  ${chalk.cyan('# Generate docs for a REST API with bearer token (OpenAI)')}
  $ api-doc-generator --mode live --url https://api.example.com --token your-token --type rest --api-key sk-...

  ${chalk.cyan('# Generate docs using Anthropic Claude')}
  $ api-doc-generator --url https://api.example.com --provider anthropic --api-key sk-ant-... --model claude-3-opus

  ${chalk.cyan('# Generate docs using Google Gemini')}
  $ api-doc-generator --url https://api.example.com --provider gemini --api-key your-key --model gemini-1.5-flash-latest

  ${chalk.cyan('# Generate docs for a GraphQL API')}
  $ api-doc-generator --mode live --url https://api.example.com/graphql --type graphql --provider openai --api-key sk-...

  ${chalk.cyan('# Generate docs with custom output file and title')}
  $ api-doc-generator --url https://api.example.com --out ./docs/api.md --title "My API Docs" --api-key sk-...

  ${chalk.cyan('# Generate docs with API key authentication')}
  $ api-doc-generator --url https://api.example.com --auth-type apiKey --auth-header-name X-API-Key --token your-api-key --api-key sk-...

  ${chalk.cyan('# Perform health check')}
  $ api-doc-generator --health-check

${chalk.bold('Environment Variables:')}
  ${chalk.yellow('OPENAI_API_KEY')}       API key for OpenAI (alternative to --api-key with --provider openai)
  ${chalk.yellow('ANTHROPIC_API_KEY')}    API key for Anthropic (alternative to --api-key with --provider anthropic)
  ${chalk.yellow('GEMINI_API_KEY')}       API key for Google Gemini (alternative to --api-key with --provider gemini)
  ${chalk.yellow('COHERE_API_KEY')}       API key for Cohere (alternative to --api-key with --provider cohere)
  ${chalk.yellow('HUGGINGFACE_API_KEY')}  API key for Hugging Face (alternative to --api-key with --provider huggingface)
  ${chalk.yellow('DEBUG')}                Enable debug mode (alternative to --debug)

${chalk.bold('Supported LLM Providers:')}
  ${chalk.green('openai')}       OpenAI GPT models (gpt-4, gpt-3.5-turbo, etc.)
  ${chalk.green('anthropic')}    Anthropic Claude models (claude-3-opus, claude-3-sonnet, etc.)
  ${chalk.green('gemini')}       Google Gemini models (gemini-1.5-flash-latest, gemini-pro-vision, etc.)
  ${chalk.green('cohere')}       Cohere models (command, command-light, etc.)
  ${chalk.green('huggingface')}  Hugging Face models (various open-source models)

${chalk.bold('Supported Authentication Types:')}
  ${chalk.green('none')}      No authentication
  ${chalk.green('bearer')}    Bearer token authentication (Authorization: Bearer <token>)
  ${chalk.green('apiKey')}    API key authentication (custom header)
  ${chalk.green('basic')}     Basic authentication (Authorization: Basic <credentials>)

${chalk.bold('Supported API Types:')}
  ${chalk.green('rest')}      REST APIs with automatic endpoint discovery
  ${chalk.green('graphql')}   GraphQL APIs with introspection support
`);

  // Set up the main action handler
  program.action(async (options) => {
    try {
      // Handle health check
      if (options.healthCheck) {
        await performHealthCheck(options);
        return;
      }

      // Show startup banner
      if (!options.verbose && !options.debug) {
        console.log(chalk.blue.bold(`\n🚀 ${packageInfo.name} v${packageInfo.version}`));
        console.log(chalk.gray(packageInfo.description));
        console.log();
      }

      // Parse and validate CLI arguments
      const cliArgs = parseCliArguments(options);
      
      // Build configuration
      const config = ConfigBuilder.fromCliArgs(cliArgs);

      // Perform health check if in verbose mode
      if (options.verbose) {
        console.log(chalk.blue('🔍 Performing health check...'));
        const health = await getHealthStatus(config);
        displayHealthStatus(health);
        
        if (health.status === 'unhealthy') {
          console.log(chalk.red('\n❌ Health check failed. Please resolve the issues above before proceeding.'));
          process.exit(1);
        }
        console.log();
      }

      // Start documentation generation
      const startTime = Date.now();
      let lastProgress = 0;

      const result = await generateDocumentation(config, (step, progress, total) => {
        if (options.verbose || progress - lastProgress >= 10 || progress === total) {
          const percentage = Math.round((progress / total) * 100);
          const progressBar = createProgressBar(progress, total);
          
          if (options.verbose) {
            console.log(chalk.blue(`[${percentage}%] ${step}`));
          } else {
            process.stdout.write(`\r${progressBar} ${percentage}% - ${step}`);
            if (progress === total) {
              process.stdout.write('\n');
            }
          }
          lastProgress = progress;
        }
      });

      // Display results
      displayResults(result, options.verbose);

      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);

    } catch (error) {
      handleError(error, options.debug);
      process.exit(1);
    }
  });

  // Parse command line arguments
  await program.parseAsync(process.argv);
}

/**
 * Parse CLI options into CliArgs format
 */
function parseCliArguments(options: any): CliArgs {
  // Get API key from option or environment variable based on provider
  let apiKey: string | undefined;
  if (options.apiKey) {
    apiKey = options.apiKey;
  } else if (options.provider === 'openai' && process.env.OPENAI_API_KEY) {
    apiKey = process.env.OPENAI_API_KEY;
  } else if (options.provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
  } else if (options.provider === 'gemini' && process.env.GEMINI_API_KEY) {
    apiKey = process.env.GEMINI_API_KEY;
  } else if (options.provider === 'cohere' && process.env.COHERE_API_KEY) {
    apiKey = process.env.COHERE_API_KEY;
  } else if (options.provider === 'huggingface' && process.env.HUGGINGFACE_API_KEY) {
    apiKey = process.env.HUGGINGFACE_API_KEY;
  }
  
  // Get debug mode from option or environment variable
  const debug = options.debug || process.env.DEBUG === 'true';

  return {
    mode: options.mode,
    url: options.url,
    token: options.token,
    type: options.type,
    out: options.out,
    provider: options.provider,
    apiKey,
    model: options.model,
    authType: options.authType,
    authHeaderName: options.authHeaderName,
    seedEndpoints: options.seedEndpoints,
    maxDepth: options.maxDepth,
    timeout: options.timeout,
    rateLimit: options.rateLimit,
    title: options.title,
    description: options.description,
    version: options.apiVersion,
    verbose: options.verbose,
    debug,
  };
}

/**
 * Perform health check and display results
 */
async function performHealthCheck(options: any): Promise<void> {
  console.log(chalk.blue.bold('🏥 Health Check'));
  console.log(chalk.gray('Checking system health and configuration...\n'));

  try {
    // Create minimal config for health check
    const cliArgs = parseCliArguments(options);
    const config = ConfigBuilder.fromCliArgs({
      ...cliArgs,
      mode: cliArgs.mode || 'live',
      type: cliArgs.type || 'rest',
      out: cliArgs.out || './test-output.md',
      provider: cliArgs.provider || 'openai',
      apiKey: cliArgs.apiKey || 'sk-test', 
    });

    const health = await getHealthStatus(config);
    displayHealthStatus(health);

    const statusIcon = health.status === 'healthy' ? '✅' : 
                      health.status === 'degraded' ? '⚠️' : '❌';
    const statusColor = health.status === 'healthy' ? chalk.green : 
                       health.status === 'degraded' ? chalk.yellow : chalk.red;

    console.log(`\n${statusIcon} Overall Status: ${statusColor(health.status.toUpperCase())}`);
    
    if (health.status !== 'healthy') {
      console.log(chalk.yellow('\nRecommendations:'));
      health.checks
        .filter(check => check.status === 'fail')
        .forEach(check => {
          console.log(chalk.yellow(`• Fix ${check.name}: ${check.message || 'Unknown issue'}`));
        });
    }

    process.exit(health.status === 'unhealthy' ? 1 : 0);
  } catch (error) {
    console.log(chalk.red('❌ Health check failed:'));
    handleError(error, options.debug);
    process.exit(1);
  }
}

/**
 * Display health status results
 */
function displayHealthStatus(health: any): void {
  health.checks.forEach((check: any) => {
    const icon = check.status === 'pass' ? '✅' : '❌';
    const color = check.status === 'pass' ? chalk.green : chalk.red;
    const message = check.message ? ` (${check.message})` : '';
    console.log(`${icon} ${color(check.name)}${message}`);
  });
}

/**
 * Create a simple progress bar
 */
function createProgressBar(current: number, total: number, width: number = 20): string {
  const percentage = current / total;
  const filled = Math.round(width * percentage);
  const empty = width - filled;
  
  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);
  
  return chalk.blue(`[${filledBar}${emptyBar}]`);
}

/**
 * Display generation results
 */
function displayResults(result: any, verbose: boolean): void {
  console.log();
  
  if (result.success) {
    console.log(chalk.green.bold('✅ Documentation generation completed successfully!'));
    console.log();
    console.log(chalk.bold('📊 Summary:'));
    console.log(`   ${chalk.cyan('Endpoints processed:')} ${result.endpointsProcessed}`);
    console.log(`   ${chalk.cyan('Tokens used:')} ${result.tokensUsed.toLocaleString()}`);
    console.log(`   ${chalk.cyan('Duration:')} ${formatDuration(result.duration)}`);
    console.log(`   ${chalk.cyan('Output file:')} ${result.outputFile}`);
    
    if (verbose) {
      console.log();
      console.log(getGenerationSummary(result));
    }
  } else {
    console.log(chalk.red.bold('❌ Documentation generation failed'));
    console.log();
    console.log(chalk.bold('📊 Summary:'));
    console.log(`   ${chalk.cyan('Duration:')} ${formatDuration(result.duration)}`);
    if (result.endpointsProcessed > 0) {
      console.log(`   ${chalk.cyan('Endpoints processed:')} ${result.endpointsProcessed}`);
    }
    if (result.tokensUsed > 0) {
      console.log(`   ${chalk.cyan('Tokens used:')} ${result.tokensUsed.toLocaleString()}`);
    }
    console.log(`   ${chalk.red('Error:')} ${result.error}`);
  }
}

/**
 * Handle and display errors appropriately
 */
function handleError(error: unknown, debug: boolean = false): void {
  console.log(); // Add spacing

  if (error instanceof ConfigValidationError) {
    console.log(chalk.red.bold('❌ Configuration Error'));
    console.log(chalk.red(error.message));
    console.log();
    console.log(chalk.yellow('💡 Tip: Use --help to see all available options and examples'));
    console.log(chalk.yellow('💡 Make sure you have provided the correct API key for your selected LLM provider'));
  } else if (error instanceof Error) {
    console.log(chalk.red.bold('❌ Error'));
    console.log(chalk.red(error.message));
    
    if (debug) {
      console.log();
      console.log(chalk.gray('Debug information:'));
      console.log(chalk.gray(error.stack || 'No stack trace available'));
    }
  } else {
    console.log(chalk.red.bold('❌ Unknown Error'));
    console.log(chalk.red('An unexpected error occurred'));
    
    if (debug) {
      console.log();
      console.log(chalk.gray('Debug information:'));
      console.log(chalk.gray(JSON.stringify(error, null, 2)));
    }
  }

  console.log();
  console.log(chalk.gray('For more help, visit: https://github.com/traycerai/api-doc-generator'));
}

/**
 * Handle uncaught exceptions and unhandled rejections
 */
process.on('uncaughtException', (error) => {
  console.log(chalk.red.bold('\n❌ Uncaught Exception'));
  console.log(chalk.red(error.message));
  console.log(chalk.gray('\nThe application will now exit.'));
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(chalk.red.bold('\n❌ Unhandled Promise Rejection'));
  console.log(chalk.red(reason instanceof Error ? reason.message : String(reason)));
  console.log(chalk.gray('\nThe application will now exit.'));
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n⚠️  Process interrupted by user'));
  console.log(chalk.gray('Cleaning up and exiting...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n\n⚠️  Process terminated'));
  console.log(chalk.gray('Cleaning up and exiting...'));
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  handleError(error, process.env.DEBUG === 'true');
  process.exit(1);
});

export { main };
