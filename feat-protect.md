# Feature: Page Authentication

## Overview

Add optional authentication to ZenBin pages supporting:
- **Password protection** (HTTP Basic Auth with browser prompt)
- **URL tokens** (secret shareable links)
- **Brute-force protection** (rate limiting failed auth attempts)

Default behavior remains unchanged - pages without auth are public.

---

## Dependencies

Add `bcrypt` for secure password hashing:

```json
"bcrypt": "^5.1.1",
"@types/bcrypt": "^5.0.2"  // devDependency
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add bcrypt dependency |
| `src/config.ts` | Modify | Add auth configuration |
| `src/storage/db.ts` | Modify | Add `PageAuth` interface to `Page` |
| `src/utils/auth.ts` | **Create** | Password hashing, token generation, verification |
| `src/utils/validation.ts` | Modify | Add auth field validation |
| `src/middleware/authRateLimit.ts` | **Create** | Per-page brute-force protection |
| `src/routes/pages.ts` | Modify | Handle auth in page creation |
| `src/routes/render.ts` | Modify | Check auth before serving pages |
| `src/routes/agent.ts` | Modify | Document auth in agent instructions |
| `src/test/auth.test.ts` | **Create** | Auth feature tests |

---

## Detailed Implementation

### 1. `src/config.ts` - Add auth config

```typescript
auth: {
  bcryptRounds: 10,
  tokenLength: 32,                      // 32 bytes = 64 hex chars
  minPasswordLength: 8,
  maxFailedAttempts: 5,
  failedAttemptWindow: 15 * 60 * 1000,  // 15 minutes
  lockoutDuration: 15 * 60 * 1000,      // 15 minutes
}
```

### 2. `src/storage/db.ts` - Update Page interface

```typescript
export interface PageAuth {
  passwordHash?: string;   // bcrypt hash
  urlTokenHash?: string;   // SHA-256 hash (hex)
}

export interface Page {
  id: string;
  html: string;
  encoding: 'utf-8' | 'base64';
  content_type: string;
  title?: string;
  etag: string;
  created_at: string;
  updated_at: string;
  auth?: PageAuth;         // NEW - undefined = public page
}
```

### 3. `src/utils/auth.ts` - New file

```typescript
// Functions to implement:
hashPassword(password: string): Promise<string>
verifyPassword(password: string, hash: string): Promise<boolean>
generateUrlToken(): { token: string; hash: string }
verifyUrlToken(token: string, hash: string): boolean
parseBasicAuth(header: string): { username: string; password: string } | null
```

### 4. `src/utils/validation.ts` - Add auth validation

```typescript
// Add to validatePageBody():
// - auth.password: optional string, min 8 chars if provided
// - auth.urlToken: optional boolean
// - At least one must be provided if auth object exists
```

### 5. `src/middleware/authRateLimit.ts` - New file

```typescript
// Track failed auth attempts per page ID
// Structure: Map<pageId, { attempts: number, firstAttempt: number, lockedUntil?: number }>
// 
// Functions:
// - checkAuthRateLimit(pageId): { allowed: boolean, retryAfter?: number }
// - recordFailedAttempt(pageId): void
// - resetAttempts(pageId): void
// - Cleanup interval (similar to existing rate limiters)
```

### 6. `src/routes/pages.ts` - Handle auth creation

```typescript
// In POST /:id handler:
// 1. Validate auth fields if present
// 2. If auth.password provided: hash with bcrypt, store hash
// 3. If auth.urlToken: true: generate token, store hash, include in response
// 4. Return secret_url and secret_raw_url if token generated
```

### 7. `src/routes/render.ts` - Check auth on render

```typescript
// New helper: verifyPageAuth(c: Context, page: Page): Promise<AuthResult>
// Returns: { success: true } | { success: false, response: Response }
//
// Logic:
// 1. If no page.auth → return success (public page)
// 2. Check auth rate limit → if locked, return 429 with Retry-After
// 3. Check ?token query param → if valid, return success
// 4. Check Authorization header:
//    - If missing → return 401 with WWW-Authenticate: Basic realm="ZenBin"
//    - If invalid → record failed attempt, return 401
//    - If valid → reset attempts, return success
```

**Response headers for 401:**
```
WWW-Authenticate: Basic realm="ZenBin"
```

**Response headers for 429:**
```
Retry-After: <seconds>
```

### 8. `src/routes/agent.ts` - Update documentation

Add section explaining:
- How to create password-protected pages
- How to create pages with URL tokens
- How to access protected pages
- Example requests/responses

### 9. `src/test/auth.test.ts` - New test file

**Test cases:**
- Create page with password only
- Create page with URL token only
- Create page with both password and URL token
- Password validation (min 8 chars)
- Access protected page without auth → 401 + WWW-Authenticate header
- Access protected page with wrong password → 401
- Access protected page with correct password → 200
- Access protected page with valid URL token → 200
- Access protected page with invalid URL token → 401
- Brute-force protection triggers after 5 failures → 429
- Lockout expires after 15 minutes
- Raw endpoint requires same auth
- ETag caching works with auth (304 response)
- Public pages still work without auth

---

## Example Usage

**Create password-protected page:**
```bash
curl -X POST https://zenbin.io/v1/pages/secret-doc \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Secret</h1>",
    "auth": { "password": "mypassword123" }
  }'
```

**Create page with URL token:**
```bash
curl -X POST https://zenbin.io/v1/pages/shared-doc \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Shared</h1>",
    "auth": { "urlToken": true }
  }'

# Response includes:
# "secret_url": "https://zenbin.io/p/shared-doc?token=abc123..."
```

**Create page with both:**
```bash
curl -X POST https://zenbin.io/v1/pages/dual-auth \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Dual Auth</h1>",
    "auth": { "password": "mypassword123", "urlToken": true }
  }'
```

**Access password-protected page:**
```bash
# Browser will prompt for password automatically
# Or via curl:
curl -u ":mypassword123" https://zenbin.io/p/secret-doc
```

**Access via URL token:**
```bash
curl "https://zenbin.io/p/shared-doc?token=abc123..."
```

---

## Security Details

**Password Storage:**
- Use `bcrypt` with 10 rounds (configurable)
- Never store plain text passwords

**URL Token:**
- Generate 32-byte random token using `crypto.randomBytes()`
- Store SHA-256 hash of token
- Token returned once at creation (not retrievable later)

**Brute-Force Protection:**
- Track failed attempts per page ID
- After 5 failures in 15 minutes → block for 15 minutes
- Reset counter on successful auth
- In-memory Map (similar to existing rate limiters)

**HTTP Basic Auth:**
- Username ignored (can be anything or empty)
- Only password is validated
- Returns `WWW-Authenticate: Basic realm="ZenBin"` on 401
