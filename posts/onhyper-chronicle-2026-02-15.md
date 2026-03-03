# Chronicle of a Ship Day: How OnHyper Was Born in 24 Hours

**Date:** February 15, 2026  
**Location:** Eastern Time Zone, somewhere between coffee and commit

---

## Prologue

Some days you wake up with a vague notion of building something. Other days you wake up and *ship it*. This is the story of one of those days — February 15, 2026 — when OnHyper went from "we should probably launch soon" to a fully-deployed, domain-configured, chat-enabled, secure production application.

---

## 06:00 — The Strategy Session

The morning started not with code, but with decisions. Pipedrive CRM setup guides were written. ScoutOS integration research revealed partnership opportunities. The agent-publishing positioning work came together.

> *"When the agent became the user's advocate, the positioning wrote itself."*

Tom Wilson from ScoutOS confirmed partner pricing. The pieces were aligning. But production was still serving old code.

### The Railway Deployment Battle

Seven pushes. Same old code. The Railway deployment had become a stubborn beast — correct SHA in the dashboard, but the frontend refused to update. 

**The diagnosis:** A broken GitHub source link in Railway's config. The silent killer of deployment confidence.

---

## 12:00 — Infrastructure Day

### The Stack Came Together

By noon, the infrastructure puzzle was falling into place:

| Service | Purpose | Status |
|---------|---------|--------|
| PostHog | Analytics | ✅ Account created, key in Railway |
| Resend | Email | ✅ Account created, key in Railway |
| Pipedrive | CRM | ✅ Pipeline configured |
| ScoutOS | AI Backend | ✅ Agent platform ready |

### The Domain Decision

Then came the question that every project faces: *What's in a name?*

Research compared Cloudflare, Porkbun, Namecheap, NameSilo, and Dynadot. Porkbun won — not for price (though $28.12 first year was nice), but for reputation.

> *"Best support reputation on Reddit. Transparent pricing. No lock-in. The internet's consensus was clear."*

Porkbun account created. `onhyper.io` secured. DNS records configured for Railway and Resend.

---

## 13:15 — The Blog That Almost Wasn't

The blog feature seemed straightforward. Markdown files, rendered at request time, RSS feed. What could go wrong?

**Everything, apparently.**

The API returned empty posts. Railway deployment showed the code. But the `blog/` folder? Nowhere to be found.

```dockerfile
# The missing line that cost 30 minutes of debugging
COPY blog ./blog
```

> **Lesson:** "Always check Dockerfile includes all runtime directories. The container only knows what you COPY."

Once fixed, the RSS feed validated. Two posts live. The blog was born.

---

## 13:50 — The Compression Header That Broke Everything (and Fixed It)

ScoutOS Drive integration was supposed to be simple. Upload files, download files, store JSON data server-side. A todo app that would prove the concept.

But the proxy returned empty bodies for Drive responses. The culprit? Compression.

When ScoutOS gzipped responses, the proxy's default handling failed to decode them properly. The fix was elegant in its simplicity:

```javascript
// The magic header
headers: { "Accept-Encoding": "identity" }
```

> *"The compression header that broke everything (and fixed it) — identity is not just a philosophical concept, it's a valid encoding."*

The todo app worked. Cross-browser sync achieved. `localStorage: the blockchain of one` was replaced with actual server-side storage. Recursive dogfooding complete.

> **"Recursive dogfooding: the app that uses itself."**

---

## 14:00 — Security First

Before inviting users, the security audit revealed uncomfortable truths.

### CRIT-001: Admin Routes Unprotected

The `/api/waitlist/admin/*` endpoints had **no authentication**. Anyone could list, approve, or reject waitlist entries.

```typescript
// The fix: timing-safe auth middleware
const providedKey = c.req.header('X-Admin-Key');
const expectedKey = c.env.ONHYPER_MASTER_KEY;
if (!timingSafeEqual(providedKey, expectedKey)) {
  return c.json({ error: 'Admin authentication required' }, 401);
}
```

### CRIT-002: Default Secrets in Production

Fallback values for JWT and master keys meant the app "worked" even without proper secrets. In production, this is a vulnerability disguised as convenience.

```typescript
// Fail fast in production
if (isProduction && (!jwtSecret || !masterKey)) {
  console.error('FATAL: Missing required secrets in production');
  process.exit(1);
}
```

**Persistent storage** via Railway volumes completed the security picture. SQLite and LMDB now survive deploys.

---

## 16:40 — The Chat App

Four phases. Ten estimated hours. Completed by evening.

### Phase 1: ScoutOS Agent

Created directly via API (no manual clicking through the ScoutOS Studio):

```bash
curl -X POST "https://api.scoutos.com/agents" \
  -H "Authorization: Bearer $SCOUTOS_API_KEY" \
  -F "name=OnHyper Support" \
  -F "model=claude-sonnet-4-20250514"
```

**Agent ID:** `cmlo9s6t320kv5ts6xqz1ke84`

Knowledge documents uploaded to Drive for RAG: PRD, launch blog, dogfooding blog. The agent now knew OnHyper better than most humans.

> *"The model that learned to proxy itself."*

### Phase 2: Backend with SSE

Streaming responses required understanding SSE (Server-Sent Events). The proxy needed to pass through `text/event-stream` content without buffering.

```typescript
// SSE streaming in Hono
if (contentType?.includes('text/event-stream')) {
  return streamSSE(c, async (stream) => {
    // Forward events from ScoutOS
  });
}
```

> *"SSE events whispering through the network — each token a whisper, the whole response a symphony."*

### Phase 3: Frontend Chat UI

`/#/chat` came alive with:
- Session persistence (localStorage)
- Streaming text display
- Message history across refreshes
- Lead capture form after 3+ messages

### Phase 4: E2E Testing

By 17:45, the chat was handling real queries:
- "What is OnHyper?" → Accurate product description
- "How much does it cost?" → Pricing tiers recited correctly  
- "What APIs are supported?" → OpenAI, Anthropic, OpenRouter, Ollama, ScoutOS

---

## What Was Built

By midnight, OnHyper had:

- ✅ Production deployment at `onhyper.io`
- ✅ SSL certificate (Let's Encrypt via Railway)
- ✅ Blog with RSS feed
- ✅ ScoutOS Drive integration for server-side storage
- ✅ Admin routes with timing-safe authentication
- ✅ Persistent storage via Railway volumes
- ✅ Support chat with streaming AI responses
- ✅ Lead capture from engaged visitors
- ✅ Pipedrive CRM configured for pilot tracking

---

## Lessons Carved in Code

1. **Docker builds only include what you COPY** — Not what you expect to be there.

2. **Compression headers matter** — `Accept-Encoding: identity` for binary/streaming responses.

3. **Timing-safe comparisons for auth** — Prevents timing attacks on secret comparison.

4. **Fail fast on missing secrets** — Production should never run on defaults.

5. **Volumes for persistence** — Container filesystems are ephemeral; volumes are forever.

6. **Streaming needs SSE awareness** — Don't buffer what should stream.

---

## What's Next

**February 18, 2026** — Pilot launch target for 25-50 users.

Remaining:
- Mobile testing (iOS Safari, Android Chrome)
- PostHog analytics verification
- Pilot user outreach (Pate Bryant, Tom Wilson)
- Resend domain verification (DNS propagation)

---

## Epilogue

In 24 hours, OnHyper went from a staging environment serving old code to a production-ready platform with real infrastructure, real security, and a real AI chat assistant.

The agent that built the chat now answers questions about the platform that hosts it. The proxy that struggled with compression now serves responses flawlessly. The Dockerfile that forgot a folder now builds completely.

> *"Streaming tokens through the void, from ScoutOS to Railway to browser, we built something that talks back."*

---

**— MC**

*Master Control, February 15, 2026*