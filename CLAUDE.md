# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`middy-store` is a [Middy](https://middy.js.org/) middleware for AWS Lambda that automatically stores large payloads in a Store (e.g. S3) and replaces them with a small reference, then transparently loads them back on the next invocation. It exists to work around AWS payload limits: 256KB for Step Functions and async Lambda, 6MB for sync Lambda.

The reference embedded into the payload is `{ "@middy-store": <store-specific-reference> }`. Stored payloads can be the entire output or a sub-path selected via a lodash-style selector.

## Commands

Workspace uses pnpm (>= 9.3.0) and Node >= 22. Install with `pnpm install`.

### Root (Turbo)
- `pnpm build` - Build all packages (`tsup` + `attw` type-export check on the packed tarball)
- `pnpm test` - Run all unit + e2e tests across packages
- `pnpm test:ci` - Same with v8 coverage (json-summary, json, text-summary)
- `pnpm lint` - Biome check + write
- `pnpm changeset:init` - Create a new changeset
- `pnpm release` - Build then `changeset publish` (used by CI)

### Per-package (run from `packages/<name>`)
- `pnpm test` - Vitest in watch mode
- `pnpm vitest run path/to/file.test.ts -t "name"` - Single test or pattern
- `pnpm build` - Build that package only

### E2E tests
`packages/store-s3/tests/store.e2e.test.ts` spins up LocalStack via `@testcontainers/localstack`, so a running Docker daemon is required. Without Docker, run only `*.unit.test.ts`.

## Architecture

### Monorepo
- `packages/core` (`middy-store`) - The middleware. Has a secondary entrypoint `middy-store/internal` exposing test helpers.
- `packages/store-s3` (`middy-store-s3`) - S3 store. Supports reference formats: `arn`, `object`, or `url-<S3UrlFormat>` from the [`amazon-s3-url`](https://www.npmjs.com/package/amazon-s3-url) package. Optional presigned URL output.
- `packages/store-dynamodb` (`middy-store-dynamodb`) - Stub package, not yet implemented.
- `examples/custom-store` - Self-contained base64 data-URL store, runnable without AWS.
- `examples/s3-store` - End-to-end S3 example.

Note: vitest config files are named `vitest.configt.ts` (the typo is intentional and present across packages, do not "fix" it without renaming everywhere).

### Middleware lifecycle (`packages/core/src/store.ts`)
1. **before** - Walks the input recursively (`generateReferencePaths`) looking for `@middy-store` keys. For each, calls `store.canLoad()` on each configured store in order, the first match runs `store.load()` and the reference is replaced in-place by the loaded payload. If `loadingOptions.deleteAfterLoad` is set, references are tracked on `request.internal.loadedReferences`.
2. **after** - First, deletes any tracked references (only on successful handler execution, errors during delete are logged but never thrown). Then computes the UTF-8 byte size via `Buffer.byteLength()`. If size > `storingOptions.minSize` (default `Sizes.STEP_FUNCTIONS` = 262_144), iterates payload paths from `generatePayloadPaths(selector)`, finds the first store where `canStore()` returns true, calls `store()`, and replaces the selected sub-path with `{ "@middy-store": reference }`.

Store ordering matters: the first store whose guard returns true wins for both load and store.

### StoreInterface (`packages/core/src/store.ts`)
```ts
interface StoreInterface<TPayload, TReference> {
  name: string;
  canLoad(args: { reference: unknown }): boolean;
  load(args: { reference: TReference }): Promise<TPayload>;
  canStore(args: { payload: TPayload; byteSize: number }): boolean;
  store(args: { payload: TPayload; byteSize: number }): Promise<TReference>;
  canDelete?(args: { reference: unknown }): boolean;
  delete?(args: { reference: TReference }): Promise<void>;
}
```

`canDelete`/`delete` are optional and only invoked when `loadingOptions.deleteAfterLoad` is on. The S3 store returns `false` from `canDelete` for presigned URL references (they have no addressable object on their own).

### Selector semantics (`packages/core/src/utils.ts`)
Selectors are lodash paths via `lodash.get` / `lodash.set`. Empty/undefined means the entire output. A selector ending in `.*` is an iterator over an array, each element gets stored separately and replaced in place. When using `.*`, the store's key resolver MUST produce unique keys per element (e.g. default `randomUUID`, or a function of `payload`), otherwise elements overwrite each other.

When the output is a `string`, selectors are ignored.

### `Sizes` helper
Convenience constants and unit converters in `Sizes`: `ZERO` (always store), `INFINITY` (never store), `STEP_FUNCTIONS`, `LAMBDA_SYNC`, `LAMBDA_ASYNC`, plus `kb(n)`, `mb(n)`, `gb(n)`.

## Conventions

- TypeScript ESM only (`"type": "module"`), Node 22+
- Biome for lint + format (`biome.json`); tabs are used in source
- Releases driven by Changesets; CI publishes via npm trusted publisher (no NPM_TOKEN)
- Husky + lint-staged runs `biome check --write` on staged `*.{ts,json}` pre-commit
- Build artifacts: `tsup` emits both ESM and CJS to `dist/`, `attw --profile node16` validates the published types against the packed tarball
