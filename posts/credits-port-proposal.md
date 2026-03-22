# Credits Port: Unified Wallet for Scout Live Apps

**Author:** Scout Live Team  
**Date:** 2026-03-19  
**Status:** Proposal

---

## Abstract

We propose a Credits Port for Scout Live that provides a unified wallet system across all platform apps. Users top up credits once and spend them anywhere in the ecosystem. App developers consume credits via a simple API without handling payments. The platform takes a small margin on credit purchases, creating a sustainable monetization model.

---

## Motivation

### The Problem

- **Payment friction**: Each app handles its own billing, users enter payment details repeatedly
- **No cross-app value**: Users can't use balance from App A on App B
- **Complex for developers**: Each app implements Stripe, webhooks, refunds, dispute handling
- **No platform revenue**: Scout Live provides infrastructure but doesn't capture value

### The Vision

```
User tops up $50 (500 credits)
   ↓
Scout Live Credits Port (takes 10-15% margin)
   ↓
User spends anywhere:
   - App A: LLM tool (50 credits)
   - App B: Scanner (20 credits)
   - App C: Agent (30 credits)
   ↓
Remaining: 400 credits for any app
```

**Value for Users:**
- Single sign-on, single wallet
- Top up once, spend anywhere
- Transparent usage history

**Value for App Developers:**
- No payment integration
- Instant access to paying users
- Simple `credits.consume()` API

**Value for Platform:**
- Takes margin on credit purchases
- Ecosystem lock-in (credits stay in platform)
- Cross-app discovery (try new apps with existing balance)

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      CREDITS PORT                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      WALLET                               │   │
│  │  • Balance per user                                      │   │
│  │  • Multi-currency support (credits, tokens)              │   │
│  │  • Real-time balance enforcement                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      GRANTS                               │   │
│  │  • Top-up credits (purchased via Stripe)                  │   │
│  │  • Promotional credits (free trials, rewards)             │   │
│  │  • Recurring credits (subscription bundles)               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      LEDGER                               │   │
│  │  • Immutable transaction log                              │   │
│  │  • Per-operation idempotency                              │   │
│  │  • Per-app usage breakdown                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   ENFORCEMENT                             │   │
│  │  • Check balance before consumption                       │   │
│  │  • Block on insufficient credits                           │   │
│  │  • Rate limiting per feature                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Port Interface

```typescript
// POST /ports/credits/:namespace/check
// POST /ports/credits/:namespace/consume
// POST /ports/credits/:namespace/refund
// GET  /ports/credits/:namespace/balance
// GET  /ports/credits/:namespace/history

// Core types
interface CreditsPort {
  // Wallet management
  getBalance(customerId: string): Promise<WalletBalance>;
  getHistory(customerId: string, options?: HistoryOptions): Promise<Transaction[]>;
  
  // Credit consumption (for apps)
  check(customerId: string, amount: number, featureId?: string): Promise<CheckResult>;
  consume(request: ConsumeRequest): Promise<ConsumeResult>;
  refund(transactionId: string, reason?: string): Promise<RefundResult>;
  
  // Grants management (for platform)
  grant(request: GrantRequest): Promise<GrantResult>;
  expireExpiredGrants(): Promise<ExpirationResult>;
}

interface WalletBalance {
  customerId: string;
  currency: string;              // "credits" | "tokens"
  available: number;             // Usable balance
  pending: number;               // Reserved for in-flight operations
  total: number;                 // Available + pending
  grants: Grant[];               // Active grants with expiry
}

interface ConsumeRequest {
  customerId: string;
  amount: number;
  featureId: string;             // What feature consumed credits
  appId: string;                  // Which app
  idempotencyKey: string;         // Required for idempotency
  metadata?: Record<string, any>; // App-specific data
}

interface ConsumeResult {
  success: boolean;
  transactionId: string;
  previousBalance: number;
  newBalance: number;
  creditsConsumed: number;
}

interface CheckResult {
  hasAccess: boolean;             // Can proceed with operation?
  balance: number;                // Current balance
  required: number;               // Credits required
  shortfall?: number;             // Credits needed (if hasAccess is false)
}

interface Grant {
  id: string;
  customerId: string;
  amount: number;
  remaining: number;              // Credits left in this grant
  source: 'topup' | 'promo' | 'subscription';
  effectiveAt: Date;
  expiresAt?: Date;
  createdAt: Date;
}

interface Transaction {
  id: string;
  customerId: string;
  appId: string;
  featureId?: string;
  type: 'consume' | 'refund' | 'grant' | 'expire';
  amount: number;                 // Positive for grants/refunds, negative for consume
  balanceAfter: number;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}
```

---

## API Endpoints

### Check Balance

```http
GET /ports/credits/:namespace/balance?customerId=user_123

Response:
{
  "customerId": "user_123",
  "currency": "credits",
  "available": 450,
  "pending": 50,
  "total": 500,
  "grants": [
    {
      "id": "grant_abc123",
      "amount": 500,
      "remaining": 450,
      "source": "topup",
      "effectiveAt": "2026-03-19T00:00:00Z",
      "expiresAt": null
    }
  ]
}
```

### Check Can Afford

```http
POST /ports/credits/:namespace/check
{
  "customerId": "user_123",
  "amount": 100,
  "featureId": "llm-tokens"
}

Response:
{
  "hasAccess": true,
  "balance": 450,
  "required": 100
}
```

### Consume Credits

```http
POST /ports/credits/:namespace/consume
{
  "customerId": "user_123",
  "amount": 100,
  "featureId": "llm-tokens",
  "appId": "geo-score-tracker",
  "idempotencyKey": "req_abc123",
  "metadata": {
    "model": "gpt-4o",
    "tokens": 2500
  }
}

Response:
{
  "success": true,
  "transactionId": "txn_xyz789",
  "previousBalance": 450,
  "newBalance": 350,
  "creditsConsumed": 100
}
```

### Refund Credits

```http
POST /ports/credits/:namespace/refund
{
  "transactionId": "txn_xyz789",
  "reason": "Operation failed"
}

Response:
{
  "success": true,
  "transactionId": "txn_refund_001",
  "amountRefunded": 100,
  "newBalance": 450
}
```

### Get History

```http
GET /ports/credits/:namespace/history?customerId=user_123&limit=50

Response:
{
  "transactions": [
    {
      "id": "txn_xyz789",
      "type": "consume",
      "amount": -100,
      "appId": "geo-score-tracker",
      "featureId": "llm-tokens",
      "balanceAfter": 350,
      "createdAt": "2026-03-19T10:30:00Z"
    },
    {
      "id": "grant_abc123",
      "type": "grant",
      "amount": 500,
      "source": "topup",
      "balanceAfter": 500,
      "createdAt": "2026-03-19T09:00:00Z"
    }
  ],
  "hasMore": false
}
```

---

## Feature Mapping

Apps define how many credits each feature costs:

```typescript
// App configuration (stored in app record)
interface AppFeaturePricing {
  appId: string;
  features: {
    [featureId: string]: {
      credits: number;              // Base cost
      unit?: string;                // "request" | "token" | "image"
      description?: string;
    }
  }
}

// Example: geo-score-tracker
{
  "appId": "geo-score-tracker",
  "features": {
    "llm-tokens": {
      "credits": 10,
      "unit": "1000 tokens",
      "description": "LLM API calls"
    },
    "scan-job": {
      "credits": 5,
      "unit": "scan",
      "description": "Geographic scan job"
    },
    "export": {
      "credits": 2,
      "unit": "export",
      "description": "Data export"
    }
  }
}
```

---

## Top-Up Flow

Users top up credits through a dedicated "Wallet" app:

```
┌──────────────────────────────────────────────────────────────────┐
│                      WALLET APP                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Your Balance: 450 credits                               │    │
│  │  ≈ $4.50 remaining                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Top Up Credits                                          │    │
│  │                                                          │    │
│  │  [  $10 - 100 credits  ]                                 │    │
│  │  [  $25 - 275 credits  ]  ← Bonus: +10%                  │    │
│  │  [  $50 - 600 credits  ]  ← Bonus: +20%                  │    │
│  │  [  $100 - 1300 credits ] ← Bonus: +30%                 │    │
│  │                                                          │    │
│  │  [Custom amount]                                         │    │
│  │                                                          │    │
│  │  Payment: [Stripe Element]                              │    │
│  │  [    Pay $50    ]                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Recent Activity                                        │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │  Geo Score Tracker: LLM tokens    -50    Mar 19 10:30  │    │
│  │  Top up via card                  +500   Mar 19 09:00  │    │
│  │  ZChat: Chat message              -10    Mar 18 15:22  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Idempotency & Safety

All consume operations are idempotent via `idempotencyKey`:

```typescript
// First request
POST /ports/credits/:namespace/consume
{ "idempotencyKey": "req_abc123", "amount": 50, ... }
→ { "success": true, "transactionId": "txn_001" }

// Retry with same key (within 24h)
POST /ports/credits/:namespace/consume
{ "idempotencyKey": "req_abc123", "amount": 50, ... }
→ { "success": true, "transactionId": "txn_001" }  // Same result, no double-charge
```

---

## Enforcement Model

### Hard Limit (Default)

```typescript
const check = await credits.check({
  customerId: 'user_123',
  amount: 100,
  featureId: 'llm-tokens'
});

if (!check.hasAccess) {
  // Return error to user: "Insufficient credits. Top up at scoutos.live/wallet"
  return { error: 'INSUFFICIENT_CREDITS', balance: check.balance };
}

// Proceed with operation
const result = await credits.consume({
  customerId: 'user_123',
  amount: 100,
  featureId: 'llm-tokens',
  idempotencyKey: 'req_abc123'
});
```

### Soft Limit (Optional)

Allow overdraft with automatic billing:

```typescript
// App-level configuration
{
  "overdraft": {
    "enabled": true,
    "limit": 100,        // Max overdraft credits
    "autoBill": true     // Charge card when balance negative
  }
}
```

---

## Revenue Model

### Credit Pricing

| Tier | Price | Credits | Bonus | Rate |
|------|-------|---------|-------|------|
| Starter | $10 | 100 | — | $0.10/credit |
| Basic | $25 | 275 | +10% | $0.091/credit |
| Pro | $50 | 600 | +20% | $0.083/credit |
| Team | $100 | 1300 | +30% | $0.077/credit |

### Platform Margin

- Credits sold at $0.077–$0.10/credit
- Developer payout: $0.07/credit (platform keeps 10–30%)
- Or: Platform keeps margin on credit purchase, developers get face value

Example:
- User buys 600 credits for $50 ($0.083/credit)
- User spends 100 credits on App A
- App A gets $0.70 (or 100 credits at face value)

---

## Integration with LLM Port

Credits and LLM ports work together naturally:

```typescript
// App checks credits before LLM call
const creditsCheck = await credits.check({
  customerId: user.id,
  amount: estimatedCost,
  featureId: 'llm-tokens'
});

if (!creditsCheck.hasAccess) {
  // Redirect to wallet top-up
  return { error: 'INSUFFICIENT_CREDITS', topUpUrl: '/wallet' };
}

// Make LLM call
const llmResponse = await llm.chat({
  model: 'anthropic/claude-sonnet-4',
  messages: [...]
});

// Deduct credits (idempotent)
await credits.consume({
  customerId: user.id,
  amount: actualCost,
  featureId: 'llm-tokens',
  idempotencyKey: llmResponse.id,
  metadata: {
    model: 'claude-sonnet-4',
    promptTokens: llmResponse.usage.promptTokens,
    completionTokens: llmResponse.usage.completionTokens
  }
});
```

---

## Implementation Plan

### Phase 1: MVP (Week 1-2)

- [ ] Wallet model (balance per user)
- [ ] Grants table (top-up credits)
- [ ] Ledger table (transaction log)
- [ ] `/check`, `/consume`, `/balance` endpoints
- [ ] Idempotency via idempotencyKey
- [ ] Stripe integration for top-ups

### Phase 2: Enforcement (Week 2-3)

- [ ] Real-time balance enforcement
- [ ] Feature pricing configuration per app
- [ ] Refund endpoint
- [ ] History endpoint with filters
- [ ] Rate limiting per feature

### Phase 3: Promotions (Week 3-4)

- [ ] Promotional grants (free credits)
- [ ] Expiration policy
- [ ] New user signup bonus
- [ ] Referral credits

### Phase 4: Wallet App (Week 4-5)

- [ ] Wallet dashboard UI
- [ ] Top-up flow (Stripe Elements)
- [ ] Usage charts per app
- [ ] Transaction history
- [ ] Credit balance widget for apps

### Phase 5: Advanced (Week 5+)

- [ ] Soft limits / overdraft
- [ ] Subscription credits (recurring)
- [ ] Revenue recognition integration
- [ ] Admin dashboard
- [ ] Analytics and reporting

---

## Database Schema

```sql
-- Wallets
CREATE TABLE credit_wallets (
  id UUID PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'credits',
  available_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  pending_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Grants (credit allocations)
CREATE TABLE credit_grants (
  id UUID PRIMARY KEY,
  customer_id TEXT NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  remaining DECIMAL(18,2) NOT NULL,
  source TEXT NOT NULL, -- 'topup', 'promo', 'subscription'
  stripe_payment_intent_id TEXT,
  effective_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ledger (transactions)
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY,
  customer_id TEXT NOT NULL,
  grant_id UUID REFERENCES credit_grants(id),
  type TEXT NOT NULL, -- 'consume', 'refund', 'grant', 'expire'
  amount DECIMAL(18,2) NOT NULL,
  balance_after DECIMAL(18,2) NOT NULL,
  app_id TEXT,
  feature_id TEXT,
  idempotency_key TEXT UNIQUE,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Idempotency (24h TTL)
CREATE TABLE credit_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  transaction_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Feature pricing
CREATE TABLE app_feature_pricing (
  app_id TEXT PRIMARY KEY,
  features JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## Security Considerations

1. **Idempotency keys** — Required for all consume operations
2. **Rate limiting** — Per-feature, per-user limits
3. **Audit trail** — Every grant, consume, refund logged
4. **Balance checks** — Must happen before consumption (not after)
5. **Atomic transactions** — Consume is atomic; balance + ledger update together
6. **No negative balance** — Enforcement prevents overspend

---

## Questions for Discussion

1. **Credit-to-dollar ratio** — Fixed (100 credits = $10) or variable?
2. **Developer payout** — Per-credit face value or percentage of purchase?
3. **Expiration policy** — Do credits expire? After how long?
4. **Promotional credits** — How to handle free credits vs paid credits?
5. **Refund policy** — Can users cash out credits? What's the refund window?
6. **Multi-currency** — Support multiple credit types (e.g., "AI credits", "Scan credits")?

---

## References

- [Stigg: Building AI Credits](https://www.stigg.io/blog-posts/weve-built-ai-credits-and-it-was-harder-than-we-expected)
- [Lago: Credit-Based Pricing Models](https://getlago.com/blog/credit-based-pricing)
- [Credit-Based Pricing: The Shift to Flexible Monetization](https://blog.alguna.com/credit-based-pricing/)

---

## Appendix: Widget Components

### Balance Widget

```tsx
import { CreditBalance } from '@scoutlive/credits-widget';

<CreditBalance
  customerId="user_123"
  currencyId="credits"
  showUnits={true}
  showSymbol={false}
  onTopUp={() => window.location.href = '/wallet'}
/>
```

### Usage Chart Widget

```tsx
import { CreditUsageChart } from '@scoutlive/credits-widget';

<CreditUsageChart
  customerId="user_123"
  currencyId="credits"
  timeRange="LAST_MONTH"
  groupBy="app"
/>
```

### Top-Up Widget

```tsx
import { CreditTopUp } from '@scoutlive/credits-widget';

<CreditTopUp
  customerId="user_123"
  currencyId="credits"
  amounts={[
    { credits: 100, price: 10 },
    { credits: 275, price: 25, bonus: 0.1 },
    { credits: 600, price: 50, bonus: 0.2 },
    { credits: 1300, price: 100, bonus: 0.3 },
  ]}
  onSuccess={(grant) => console.log('Granted:', grant)}
/>
```