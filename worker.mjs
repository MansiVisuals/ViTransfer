#!/usr/bin/env node

/**
 * Worker Entry Point
 * 
 * This script starts the video processing worker with proper
 * TypeScript path resolution for the @/ alias.
 */

// Register tsx for TypeScript support with path mapping
import { register } from 'tsx/esm/api'

const unregister = register({
  tsconfig: './tsconfig.json'
})

// Import and run the worker
await import('./src/worker/index.ts')
