# Feature: Custom Subdomains

## Overview

Allow users to publish pages under their own subdomain:
- Current: `zenbin.io/p/my-page`
- New: `my-app.zenbin.io` or `username.zenbin.io`

## User Experience

```
# User creates/configures their subdomain
POST /v1/domains/set
{
  "subdomain": "my-app"
}

# Now they can publish to it
POST /v1/pages/landing
Host: my-app.zenbin.io
{
  "html": "<h1>Welcome</h1>"
}

# Result
→ https://my-app.zenbin.io/         (their landing page)
→ https://my-app.zenbin.io/about    (nested page)
```

## Benefits

1. **Professional URLs** - `my-app.zenbin.io` vs `zenbin.io/p/my-app`
2. **Nested Pages** - Root `/` + nested pages like `/docs`, `/about`
3. **Multi-page Apps** - Upload multiple pages under one subdomain
4. **Branding** - Better for sharing and demos
5. **Portfolio Apps** - Multiple pages = full app experience

## Architecture

### DNS Configuration
```
*.zenbin.io    CNAME    zenbin.io
```
- Wildcard DNS routes all subdomains to main server
- Server inspects `Host` header to determine subdomain

### Routing Logic

```typescript
// Request comes in
const host = request.headers.get('host')
// host = "my-app.zenbin.io"

// Extract subdomain
const subdomain = host.split('.')[0]
// subdomain = "my-app"

// Route based on presence of subdomain
if (subdomain && subdomain !== 'www' && subdomain !== 'zenbin') {
  // Subdomain request → serve from subdomain's pages
  return serveSubdomainPage(subdomain, path)
} else {
  // Main domain → landing page or /p/{id}
  return serveMainDomain(path)
}
```

### Storage Schema

```typescript
interface Subdomain {
  name: string;           // "my-app"
  owner_id?: string;     // Future: user accounts
  created_at: string;
  pages: {
    '/': Page;           // Root page
    '/about'?: Page;    // Optional nested pages
    '/docs'?: Page;
    // etc.
  }
}
```

### New Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/subdomains/{name}` | Claim a subdomain |
| `GET /v1/subdomains` | List available subdomains |
| `POST /v1/pages/{path}?subdomain={name}` | Publish to subdomain |
| `GET /v1/subdomains/{name}/pages` | List pages in subdomain |

### Considerations

1. **Subdomain Collision** - First-come-first-served? Or require auth?
2. **Reserved Names** - `www`, `api`, `mail`, `admin`, etc.
3. **Rate Limiting** - Prevent subdomain squatting
4. **Cleanup** - TTL for unused subdomains?
5. **SSL Certs** - Wildcard cert covers `*.zenbin.io`

## Implementation Phases

### Phase 1: Basic Subdomain Routing
- [ ] Wildcard DNS configuration (if not already)
- [ ] Middleware to extract subdomain from Host header
- [ ] Route subdomain requests to dedicated page storage
- [ ] Subdomain landing page (root `/`)
- [ ] Fallback for non-existent subdomains

### Phase 2: Subdomain Claiming
- [ ] `POST /v1/subdomains/{name}` - Claim subdomain
- [ ] Reserved subdomain list
- [ ] Subdomain validation (alphanumeric, length limits)
- [ ] Storage for subdomain-to-pages mapping

### Phase 3: Multi-page Support
- [ ] Nested paths under subdomain: `/about`, `/docs`
- [ ] Page listing endpoint
- [ ] Default routing (path `"/"` → root page)

### Phase 4: Advanced Features (Future)
- [ ] User accounts (optional auth)
- [ ] Custom domains (`my-app.com` → zenbin)
- [ ] Analytics per subdomain
- [ ] Sitemap generation

## Questions to Resolve

1. **Auth Requirement?** 
   - Option A: Anonymous claiming (first-come-first-served)
   - Option B: Require API key or simple token
   - Recommendation: Start with Option A, add auth later if abuse

2. **Expiration?**
   - Option A: Never expire (permanent)
   - Option B: TTL cleanup (e.g., 30 days unused)
   - Recommendation: Permanent for MVP, TTL for abuse prevention

3. **Path-based vs Subdomain-only?**
   - Keep `/p/{id}` for backwards compatibility
   - Subdomains are opt-in for users who want it

## Related

- OnHyper already supports custom subdomains
- Could leverage OnHyper infrastructure for this
- May need coordination with OnHyper for cert management

## Priority

**Medium** - Nice-to-have feature that significantly improves UX for professional use cases. Should implement after core stability is proven.