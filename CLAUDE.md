# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `middy-store`, a middleware for AWS Lambda that automatically stores and loads large payloads from storage services like Amazon S3. It helps work around AWS service payload size limits (e.g., Step Functions 256KB limit, Lambda 6MB sync/256KB async limits).

## Commands

### Development
- `pnpm build` - Build all packages using Turbo
- `pnpm test` - Run all tests  
- `pnpm test:ci` - Run tests with coverage reporting
- `pnpm lint` - Lint and format code using Biome
- `pnpm changeset:init` - Create a new changeset for releases

### Testing
- Tests use Vitest framework
- Coverage reports generated with v8 provider
- E2E tests use Testcontainers with LocalStack for AWS services

## Architecture

### Monorepo Structure
- **packages/core** - Main middleware implementation (`middyStore` function)
- **packages/store-s3** - S3 storage implementation 
- **packages/store-dynamodb** - DynamoDB storage (planned, not implemented)
- **examples/** - Usage examples including custom store implementations

### Core Components

#### StoreInterface
All storage implementations must implement:
- `canLoad(args)` - Check if store can load a reference
- `load(args)` - Load payload from storage  
- `canStore(args)` - Check if store can store a payload
- `store(args)` - Store payload and return reference

#### Middleware Flow
1. **Before handler**: Searches input for `@middy-store` references and loads payloads from storage
2. **After handler**: Checks output size against `minSize` threshold and stores large payloads

#### Key Files
- `packages/core/src/store.ts` - Main middleware implementation
- `packages/core/src/utils.ts` - Path selection, size calculation utilities
- `packages/store-s3/src/store.ts` - S3 storage implementation

### Size Management
- Uses `Sizes` constants for AWS service limits (STEP_FUNCTIONS: 262144 bytes, etc.)
- Calculates UTF-8 byte size using `Buffer.byteLength()`
- Configurable via `storingOptions.minSize`

### Payload Selection  
- Supports path-based selectors (e.g., `'a.b.0'`, `'a.b.*'` for arrays)
- Uses lodash-style path notation for nested object access
- Can store entire output or specific parts based on selector

## Development Notes

- Uses TypeScript with strict typing
- Biome for linting/formatting (configured in biome.json)
- pnpm workspace with Turbo for builds
- Husky for git hooks with lint-staged
- API Extractor for TypeScript declarations

## Testing Strategy

- Unit tests for utilities and core logic
- E2E tests for storage implementations using LocalStack
- Coverage tracking with detailed HTML reports
- Vitest workspace configuration for monorepo