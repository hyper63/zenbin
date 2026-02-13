# ZenBin

A headless HTML sandbox — publish and serve HTML documents via a simple API.

## Overview

ZenBin is a lightweight web service that lets you publish HTML documents to unique IDs and view them at predictable URLs. It's optimized for fast sharing, demos, prototypes, and lightweight hosting of single-page HTML documents.

## Features

- **Simple API** — Store HTML by ID with a single POST request
- **Markdown support** — Store markdown source alongside HTML, retrieve via `/md` endpoint or content negotiation
- **Instant rendering** — View pages at `/p/{id}` in any browser
- **Raw access** — Fetch original HTML at `/p/{id}/raw`
- **Markdown endpoint** — Fetch markdown source at `/p/{id}/md`
- **Proxy endpoint** — Make external API calls from hosted pages (CORS bypass)
- **Safe by default** — Sandboxed rendering with restrictive security headers
- **ETag caching** — Efficient caching with `If-None-Match` support
- **Rate limiting** — Built-in abuse protection
- **Fast storage** — LMDB for high-performance reads/writes
- **Page authentication** — Optional password protection or secret URL tokens

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build and run in production
npm run build
npm start
```

The server starts at `http://localhost:3000` by default.

## API Reference

### Create or Replace a Page

```bash
POST /v1/pages/{id}
Content-Type: application/json
```

**Request body:**
```json
{
  "html": "<!doctype html><html><body>Hello World</body></html>",
  "markdown": "# Hello World\n\nThis is the markdown source.",
  "title": "My Page",
  "encoding": "utf-8",
  "markdown_encoding": "utf-8",
  "content_type": "text/html; charset=utf-8"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `html` | No* | HTML content (string). *At least one of `html` or `markdown` is required. |
| `markdown` | No* | Markdown source content (string). *At least one of `html` or `markdown` is required. |
| `title` | No | Page title (metadata) |
| `encoding` | No | `utf-8` (default) or `base64` for the `html` field |
| `markdown_encoding` | No | `utf-8` (default) or `base64` for the `markdown` field |
| `content_type` | No | Content-Type header (default: `text/html; charset=utf-8`) |
| `auth` | No | Authentication settings (see [Page Authentication](#page-authentication)) |

**Response:**
```json
{
  "id": "my-page",
  "url": "http://localhost:3000/p/my-page",
  "raw_url": "http://localhost:3000/p/my-page/raw",
  "markdown_url": "http://localhost:3000/p/my-page/md",
  "etag": "\"abc123...\""
}
```

- Returns `201 Created` for new pages
- Returns `200 OK` when replacing existing pages
- `markdown_url` is only included when `markdown` is provided

### View a Page

```bash
GET /p/{id}
```

Returns the HTML page with security headers applied. Supports `If-None-Match` for caching (returns `304 Not Modified` if unchanged).

### Fetch Raw HTML

```bash
GET /p/{id}/raw
```

Returns the raw HTML as `text/plain` with a `Content-Disposition` header for downloading.

### Fetch Markdown Source

```bash
GET /p/{id}/md
```

Returns the markdown source as `text/markdown`. Returns `404` if the page has no markdown content.

Alternatively, request markdown via content negotiation:

```bash
GET /p/{id}
Accept: text/markdown
```

### Markdown-Only Pages

If a page is created with only markdown (no HTML), `GET /p/{id}` automatically returns the markdown content with `Content-Type: text/markdown`.

### Health Check

```bash
GET /health
```

Returns `{"status": "ok", "timestamp": "..."}`.

### Agent Instructions

```bash
GET /api/agent
```

Returns markdown instructions for AI agents on how to use the API.

### Proxy External Requests

```bash
POST /api/proxy
Content-Type: application/json
```

Allows ZenBin-hosted pages to make external HTTP requests through the server, bypassing CORS restrictions.

**Request body:**
```json
{
  "url": "https://api.example.com/data",
  "method": "GET",
  "auth": {
    "type": "bearer",
    "credentials": "your-token"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | Target URL (http/https only) |
| `method` | No | HTTP method (default: `GET`) |
| `body` | No | Request body to forward (JSON) |
| `timeout` | No | Timeout in ms (max: 30000) |
| `contentType` | No | Content-Type for outgoing request |
| `accept` | No | Accept header for outgoing request |
| `auth` | No | Authentication config (see below) |

**Authentication types:**

| Type | Usage | Result Header |
|------|-------|---------------|
| `bearer` | `{ type: "bearer", credentials: "token" }` | `Authorization: Bearer token` |
| `basic` | `{ type: "basic", credentials: "base64" }` | `Authorization: Basic base64` |
| `api-key` | `{ type: "api-key", credentials: "key", headerName: "X-API-Key" }` | `X-API-Key: key` |

**Response:**
```json
{
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": { ... }
}
```

**Security:** Only requests originating from ZenBin-hosted pages are allowed. SSRF protection blocks private IPs and internal endpoints.

## Examples

### Simple page

```bash
curl -X POST http://localhost:3000/v1/pages/hello \
  -H "Content-Type: application/json" \
  -d '{"html":"<h1>Hello World</h1>"}'
```

### Styled page

```bash
curl -X POST http://localhost:3000/v1/pages/demo \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><style>body{font-family:sans-serif;padding:2rem}</style></head><body><h1>Demo</h1><p>This is a demo page.</p></body></html>",
    "title": "Demo Page"
  }'
```

### Base64 encoded content

```bash
# Encode your HTML
HTML_BASE64=$(echo -n '<h1>Encoded</h1>' | base64)

curl -X POST http://localhost:3000/v1/pages/encoded \
  -H "Content-Type: application/json" \
  -d "{\"encoding\":\"base64\",\"html\":\"$HTML_BASE64\"}"
```

### Page with HTML and Markdown

```bash
curl -X POST http://localhost:3000/v1/pages/article \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><style>body{font-family:system-ui;max-width:700px;margin:0 auto;padding:2rem}</style></head><body><h1>My Article</h1><p>Content here.</p></body></html>",
    "markdown": "# My Article\n\nContent here.",
    "title": "My Article"
  }'
```

Response includes markdown URL:
```json
{
  "id": "article",
  "url": "http://localhost:3000/p/article",
  "raw_url": "http://localhost:3000/p/article/raw",
  "markdown_url": "http://localhost:3000/p/article/md",
  "etag": "\"...\""
}
```

### Markdown-only page

```bash
curl -X POST http://localhost:3000/v1/pages/notes \
  -H "Content-Type: application/json" \
  -d '{
    "markdown": "# Notes\n\n- Item 1\n- Item 2\n- Item 3"
  }'
```

## Page Authentication

Pages are public by default. You can optionally protect pages with password authentication, secret URL tokens, or both.

### Password Protection

Add HTTP Basic Auth to require a password when viewing the page:

```bash
curl -X POST http://localhost:3000/v1/pages/secret \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Secret Page</h1>",
    "auth": { "password": "mypassword123" }
  }'
```

Browsers will automatically prompt for the password. With curl:

```bash
curl -u ":mypassword123" http://localhost:3000/p/secret
```

### URL Token (Secret Links)

Generate a secret shareable URL that grants access without a password:

```bash
curl -X POST http://localhost:3000/v1/pages/shared \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Shared Page</h1>",
    "auth": { "urlToken": true }
  }'
```

Response includes secret URLs:

```json
{
  "id": "shared",
  "url": "http://localhost:3000/p/shared",
  "secret_url": "http://localhost:3000/p/shared?token=abc123...",
  "secret_raw_url": "http://localhost:3000/p/shared/raw?token=abc123..."
}
```

If the page has markdown, the response also includes `secret_markdown_url`:

```json
{
  "secret_markdown_url": "http://localhost:3000/p/shared/md?token=abc123..."
}
```

**Note:** The token is only returned once at creation and cannot be retrieved later.

### Both Methods

Use both password and URL token for maximum flexibility:

```bash
curl -X POST http://localhost:3000/v1/pages/dual \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Dual Auth</h1>",
    "auth": { "password": "mypassword123", "urlToken": true }
  }'
```

### Brute-Force Protection

Protected pages have built-in brute-force protection:
- After 5 failed attempts within 15 minutes, the page is locked for 15 minutes
- Returns `429 Too Many Requests` with a `Retry-After` header when locked

## Configuration

Configure via environment variables or `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `BASE_URL` | `http://localhost:3000` | Base URL for generated links |
| `LMDB_PATH` | `./data/zenbin.lmdb` | Database path |
| `MAX_PAYLOAD_SIZE` | `524288` | Max HTML size in bytes (512KB) |
| `MAX_ID_LENGTH` | `128` | Max page ID length |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `PROXY_TIMEOUT_MS` | `30000` | Max timeout for proxy requests |
| `PROXY_MAX_REQUEST_SIZE` | `5242880` | Max proxy request body (5MB) |
| `PROXY_MAX_RESPONSE_SIZE` | `5242880` | Max proxy response size (5MB) |
| `PROXY_ALLOWED_DOMAINS` | `` | Comma-separated domain allowlist (empty = all) |
| `PROXY_RATE_LIMIT_MAX` | `5` | Max proxy requests per window |
| `PROXY_RATE_LIMIT_WINDOW_MS` | `60000` | Proxy rate limit window (ms) |
| `PROXY_MAX_REDIRECTS` | `3` | Max redirects to follow |
| `AUTH_BCRYPT_ROUNDS` | `10` | bcrypt cost factor for password hashing |
| `AUTH_TOKEN_LENGTH` | `32` | URL token length in bytes (64 hex chars) |
| `AUTH_MIN_PASSWORD_LENGTH` | `8` | Minimum password length |
| `AUTH_MAX_FAILED_ATTEMPTS` | `5` | Max failed auth attempts before lockout |
| `AUTH_FAILED_ATTEMPT_WINDOW_MS` | `900000` | Failed attempt tracking window (15 min) |
| `AUTH_LOCKOUT_DURATION_MS` | `900000` | Lockout duration after max failures (15 min) |

## Page ID Rules

Page IDs must:
- Contain only letters, numbers, dots, underscores, and hyphens (`A-Za-z0-9._-`)
- Be 128 characters or less (configurable)

Valid examples: `my-page`, `demo.v2`, `user_123`, `Report-2024.01`

## Security

Pages are served with restrictive security headers:

- `Content-Security-Policy` — Restricts external resources
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-site`
- `X-Frame-Options: DENY`

## Deploy to Render

ZenBin includes a `render.yaml` Blueprint for easy deployment to [Render.com](https://render.com).

### One-Click Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/twilson63/zenbin)

### Manual Setup

1. Fork or clone this repository
2. Create a new **Blueprint** in Render Dashboard
3. Connect your repository
4. Set the `BASE_URL` environment variable to your Render URL (e.g., `https://zenbin.onrender.com`)
5. Deploy

### What's Included

The Blueprint configures:
- **Web Service** — Node.js runtime on the Starter plan
- **Persistent Disk** — 1GB mounted at `/var/data` for LMDB storage
- **Health Check** — Monitors `/health` endpoint
- **Environment Variables** — Pre-configured for production

### Limitations

Due to Render's persistent disk constraints:
- **Single instance only** — Services with attached disks cannot scale horizontally
- **No zero-downtime deploys** — Brief downtime during redeploys (a few seconds)

For multi-instance deployments, consider replacing LMDB with Render Postgres or Redis.

## Development

```bash
# Run with hot reload
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## License

MIT
