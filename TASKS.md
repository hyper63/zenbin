# Feature: Custom Subdomains

## Status: ✅ IMPLEMENTED (2026-02-26)

## Overview

Allow users to publish pages under their own subdomain:
- Current: `zenbin.io/p/my-page`
- New: `my-app.zenbin.io` or `username.zenbin.io`

## User Experience

```
# Claim a subdomain
POST /v1/subdomains/my-app

# Publish to it (use X-Subdomain header)
POST /v1/pages/index
X-Subdomain: my-app
{ "html": "<h1>Welcome</h1>" }

# Add more pages
POST /v1/pages/about
X-Subdomain: my-app
{ "html": "<h1>About</h1>" }

# Result
→ https://my-app.zenbin.io/         (index page)
→ https://my-app.zenbin.io/about    (nested page)
```

## Benefits

1. **Professional URLs** - `my-app.zenbin.io` vs `zenbin.io/p/my-app`
2. **Nested Pages** - Root `/` + nested pages like `/docs`, `/about`
3. **Multi-page Apps** - Upload multiple pages under one subdomain
4. **Branding** - Better for sharing and demos
5. **Portfolio Apps** - Multiple pages = full app experience

## Implementation Details

### Endpoints Implemented

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/subdomains/{name}` | POST | Claim a subdomain |
| `/v1/subdomains/{name}` | GET | Get subdomain info |
| `/v1/subdomains/{name}` | DELETE | Delete subdomain and all pages |
| `/v1/subdomains/{name}/pages` | GET | List pages in subdomain |
| `/v1/pages/{id}` | POST | Publish page (use `X-Subdomain` header) |

### Subdomain Rules

- 3-63 characters
- Must start with a letter
- Lowercase letters, numbers, and hyphens only
- Must end with letter or number
- Reserved names blocked (www, api, mail, etc.)

### Storage

- Pages stored with composite key: `{subdomain}:{id}`
- Subdomains stored in separate LMDB database
- Page count tracked per subdomain
- Max 100 pages per subdomain

### Backwards Compatibility

- `/p/{id}` paths still work for standalone pages
- Subdomain routes use Host header detection
- No auth required (anonymous claiming)

## Future Enhancements

1. **User accounts** - Optional auth for claiming/ownership
2. **Custom domains** - `my-app.com` → zenbin
3. **Analytics** - Per-subdomain stats
4. **Sitemap generation** - Auto-generate sitemaps
5. **Custom 404 pages** - Per-subdomain 404 customization

## Testing

- 18 subdomain-specific tests passing
- All 112 tests passing (including core API tests)
- Test coverage: claim, publish, list, delete, stats