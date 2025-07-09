import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  outDir: 'dist/cli',
  // Externalize Node.js built-in modules to prevent bundling issues
  external: [
    // Node.js built-in modules
    'path',
    'fs',
    'http',
    'https',
    'os',
    'crypto',
    'stream',
    'zlib',
    'events',
    'util',
    'url',
    'buffer',
    'net',
    'tls',
    'dns',
    'assert',
    'constants',
    'domain',
    'querystring',
    'string_decoder',
    'timers',
    'tty',
    'v8',
    'vm',
    'worker_threads',
    'child_process',
    'cluster',
    'dgram',
    'readline',
    'repl',
    'sys',
    'wasi',
    // HTTP-related dependencies that use dynamic requires
    'agentkeepalive',
    'axios',
    'node-fetch',
    // LLM SDK dependencies that may contain CommonJS require calls
    '@anthropic-ai/sdk',
    '@google/generative-ai',
    'openai',
    // Form data dependencies used by SDKs
    'form-data',
    'formdata-node',
    '@types/node',
    // Additional Node.js ecosystem packages used by modern HTTP clients
    'undici',
    'whatwg-url',
    'abort-controller',
  ],
  // Ensure the output is executable
  shims: false, // Disable tsup shims for Node.js built-ins
  dts: true, // Generate declaration files
  splitting: true, // Split output into chunks
  sourcemap: true, // Generate sourcemaps
  // Post-build hook to make the CLI executable
  onSuccess: 'chmod +x dist/cli/index.js',
});
