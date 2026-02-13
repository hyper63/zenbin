# AGENTS.md

Coding agent instructions for the ZenBin codebase - a headless HTML sandbox for publishing and serving HTML documents via API.

## Build/Test Commands

```bash
npm run dev          # Development server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm run start        # Run production server from dist/
npm test             # Run all tests with Vitest
npm test -- src/test/api.test.ts       # Run a single test file
npm test -- -t "should create a page"  # Run tests matching pattern
npm test -- --watch  # Run tests in watch mode
npx tsc --noEmit     # Type check without emitting
```

Note: No lint command is configured. Use TypeScript for type checking.

## Code Style

### Imports
- Use relative imports with `.js` extensions (ESM requirement):
  ```typescript
  import { config } from './config.js';
  import { savePage, getPage } from '../storage/db.js';
  ```
- Named exports preferred over default exports
- Group imports: external packages first, then internal modules

### Types
- Interfaces use PascalCase: `Page`, `ValidationError`, `SaveResult`
- Type definitions in same file as usage, or in relevant module
- TypeScript strict mode is enabled - avoid `any`, use `unknown` with type guards
- Use `as const` for immutable config objects

### Naming Conventions
- Files: camelCase (e.g., `rateLimit.ts`, `validation.ts`)
- Variables/functions: camelCase (e.g., `validateId`, `rateLimitStore`)
- Interfaces/types: PascalCase (e.g., `PageAuth`, `ProxyRequest`)
- Constants: camelCase for runtime, SCREAMING_SNAKE_CASE for true constants
- Route handlers: named after their purpose (e.g., `pages`, `render`, `proxy`)

### Error Handling
- Return `{ error: string }` JSON with appropriate HTTP status codes
- Validation functions return `ValidationError | null`:
  ```typescript
  export function validateId(id: string): ValidationError | null {
    if (!id) return { field: 'id', message: 'Page ID is required' };
    return null;
  }
  ```
- Use HTTP status codes: 400 (bad request), 404 (not found), 409 (conflict), 429 (rate limit), 500 (server error)
- Global error handler in index.ts logs and returns 500 for unhandled errors

### Formatting
- No explicit formatting config - follow existing patterns
- Async arrow functions for route handlers: `pages.post('/:id', async (c) => { ... })`
- Early returns for validation failures
- Destructure imports at use site when only one function needed

## Project Structure

```
src/
├── index.ts           # App entry, middleware setup, routes, server start
├── config.ts          # Centralized config with env var fallbacks
├── routes/
│   ├── pages.ts       # POST /v1/pages/:id - create pages
│   ├── render.ts      # GET /p/:id, /p/:id/raw - render pages
│   ├── proxy.ts       # POST /api/proxy - proxy external requests
│   ├── agent.ts       # GET /api/agent - agent instructions
│   └── landing.ts     # GET / - landing page
├── middleware/
│   ├── rateLimit.ts        # General rate limiting
│   ├── proxyRateLimit.ts   # Stricter rate limiting for proxy
│   └── authRateLimit.ts    # Rate limiting for auth attempts
├── storage/
│   └── db.ts          # LMDB database layer (	Page, PageAuth, savePage, getPage, deletePage)
├── utils/
│   ├── validation.ts  # Input validation (validateId, validatePageBody, etc.)
│   ├── auth.ts        # Password hashing, token generation
│   ├── etag.ts        # ETag generation
│   └── ssrf.ts        # SSRF protection for proxy
└── test/
    ├── setup.ts       # Test setup utilities
    ├── api.test.ts    # API endpoint tests
    ├── auth.test.ts   # Auth tests
    └── proxy.test.ts  # Proxy tests
```

## Key Patterns

### Framework: Hono
- Lightweight web framework with Express-like API
- Route groups via `app.route('/path', router)`
- Middleware via `app.use('*', middlewareFn)` or `app.use('/path', middlewareFn)`
- Context object `c` for request/response: `c.req.json()`, `c.json()`, `c.header()`

### Database: LMDB
- Key-value store via `lmdb` package
- `open<Page, string>({ path, compression: true })`
- `db.get(id)`, `db.put(id, page)`, `db.remove(id)`
- Initialize at startup via `initDatabase()`, close on shutdown

### Configuration
- Centralized in `config.ts` with `process.env` fallbacks
- Export both config object and constants: `export const ID_PATTERN = /^[A-Za-z0-9._-]+$/;`
- Environment-driven for deployment flexibility

### Request/Response Pattern
```typescript
// Parse body
let body: CreatePageBody;
try {
  body = await c.req.json<CreatePageBody>();
} catch {
  return c.json({ error: 'Invalid JSON body' }, 400);
}

// Validate
const validationError = validatePageBody(body);
if (validationError) {
  return c.json({ error: validationError.message }, 400);
}

// Process and respond
c.header('ETag', page.etag);
return c.json(response, 201);
```

### Test Patterns
- Use Vitest with `describe`, `it`, `expect`, `beforeAll`, `afterAll`, `beforeEach`
- Create isolated test database in `./data/test-*.lmdb`
- Generate unique IDs per test with timestamp: `const uniqueId = (base) => \`${base}-${Date.now()}\``
- Clean up test database in `afterAll`

## Important Notes

- **ESM modules**: All local imports MUST use `.js` extension (TypeNode quirk)
- **Tests excluded from build**: `tsconfig.json` excludes `src/test`
- **Graceful shutdown**: Server handles SIGINT/SIGTERM to close database
- **Rate limiting**: In-memory store (use Redis for production)
- **Security**: CSP headers on rendered pages, SSRF protection for proxy