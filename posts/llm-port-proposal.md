# LLM Port: A Unified Interface for Large Language Models

**Author:** Scout Live Team
**Date:** 2026-03-19
**Status:** Proposal

---

## Abstract

We propose a unified LLM port for Scout Live that abstracts across multiple language model providers (OpenAI, Anthropic, OpenRouter, Ollama, Scout Atoms) with a single, provider-agnostic API. This follows the same pattern as existing ports (cache, blob, queue, data, agents) and enables apps to switch providers without code changes.

---

## Motivation

### Current State

- Each LLM provider has a different API:
  - **OpenAI**: `POST /v1/chat/completions` with `messages[]` and `tools[]`
  - **Anthropic**: `POST /v1/messages` with `messages[]`, `system`, and `tools[]`
  - **Ollama**: `POST /api/chat` or `/api/generate`
  - **OpenRouter**: OpenAI-compatible with model routing

- Apps must:
  - Choose a provider at build time
  - Handle provider-specific authentication
  - Manage API keys in code or environment
  - Deal with different error formats, streaming protocols, tool-calling schemas

### The Problem

1. **Vendor lock-in**: Switching providers requires code changes
2. **Key sprawl**: API keys scattered across apps and deployments
3. **Inconsistent interfaces**: Different message formats, tool schemas, streaming protocols
4. **No centralized observability**: Usage, costs, and errors are tracked per-app, not centrally

### The Vision

A Scout Live port that provides:

```
POST /ports/llm/:namespace/chat
POST /ports/llm/:namespace/stream  (SSE)
POST /ports/llm/:namespace/embed
GET  /ports/llm/:namespace/models
```

Apps call a unified API, the port handles provider translation.

---

## Provider Comparison

### Core Functions

| Function | OpenAI | Anthropic | Ollama |
|----------|--------|-----------|--------|
| **Chat** | `/v1/chat/completions` | `/v1/messages` | `/api/chat` |
| **Embed** | `/v1/embeddings` | Via document blocks | `/api/embeddings` |
| **Stream** | SSE `data:` chunks | SSE event types | SSE or JSON stream |
| **Tools** | `tools[]` + `tool_choice` | `tools[]` + `tool_use` blocks | Limited |
| **Vision** | `image_url` blocks | `image` blocks | Via LLaVA |
| **Audio** | `input_audio` blocks | Not supported | Via Whisper |
| **Documents** | File uploads | `document` blocks | Context window |

### Key Differences

#### 1. Message Format

```typescript
// OpenAI: System as a message role
messages: [
  { role: "system", content: "You are helpful." },
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there!" },
  { role: "user", content: [{ type: "text", text: "Look at this" }, { type: "image_url", image_url: { url: "..." } }] }
]

// Anthropic: System as top-level parameter
{
  system: "You are helpful.",
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
    { role: "user", content: [{ type: "text", text: "Look at this" }, { type: "image", source: { type: "url", url: "..." } }] }
  ]
}
```

#### 2. Tool Calling

```typescript
// OpenAI
{
  tools: [{ type: "function", function: { name: "get_weather", parameters: {...} } }],
  tool_choice: "auto" | { type: "function", function: { name: "get_weather" } }
}
// Response:
{ choices: [{ message: { tool_calls: [{ id: "call_123", function: { name: "get_weather", arguments: "{}" } }] }}] }

// Anthropic
{
  tools: [{ name: "get_weather", input_schema: {...} }],
  tool_choice: { type: "auto" } | { type: "tool", name: "get_weather" }
}
// Response:
{ content: [{ type: "tool_use", id: "toolu_123", name: "get_weather", input: {...} }] }
```

#### 3. Streaming Events

```typescript
// OpenAI: Delta chunks
data: {"choices":[{"delta":{"content":"Hello"}}]}

// Anthropic: Typed events
event: content_block_delta
data: {"index":0,"delta":{"type":"text_delta","text":"Hello"}}
```

#### 4. Parameters

| Parameter | OpenAI | Anthropic | Notes |
|-----------|--------|-----------|-------|
| `max_tokens` | Optional | **Required** | Anthropic requires this |
| `temperature` | 0-2 | 0-1 | Normalization needed |
| `top_p` | 0-1 | 0-1 | Same |
| `top_k` | Not supported | 0-∞ | Anthropic only |
| `stop` | Array of strings | Array of strings | Same |
| `seed` | Supported | Not supported | Determinism |

---

## Proposed Interface

### Unified Request Format

```typescript
// POST /ports/llm/:namespace/chat
// POST /ports/llm/:namespace/stream  (returns SSE)

interface LLMRequest {
  // Model selection
  model: string;                    // "openai/gpt-4o" | "anthropic/claude-sonnet-4" | "ollama/llama3"
  
  // Messages (unified format)
  messages: Message[];
  system?: string;                  // System prompt (normalized per provider)
  
  // Generation parameters
  maxTokens?: number;               // Default: provider-specific
  temperature?: number;             // 0-2, normalized
  topP?: number;                    // 0-1
  topK?: number;                    // Anthropic only, ignored by others
  stopSequences?: string[];         // Stop tokens
  
  // Tool calling
  tools?: Tool[];
  toolChoice?: "auto" | "required" | { name: string };
  
  // Streaming
  stream?: boolean;                 // Enable SSE streaming
  
  // Provider-specific overrides
  metadata?: Record<string, any>;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}

interface ContentPart {
  type: "text" | "image" | "document" | "audio";
  
  // Text
  text?: string;
  
  // Image
  image?: {
    url?: string;                   // Remote URL
    data?: string;                   // Base64
    mediaType?: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  };
  
  // Document
  document?: {
    url?: string;
    data?: string;                   // Base64
    mediaType?: "application/pdf" | "text/plain";
  };
  
  // Audio (OpenAI only)
  audio?: {
    data: string;                    // Base64
    mediaType: "wav" | "mp3";
  };
}

interface Tool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;          // Unified JSON Schema
}
```

### Unified Response Format

```typescript
interface LLMResponse {
  id: string;                        // Request ID
  model: string;                     // Actual model used
  role: "assistant";
  
  // Content
  content: ContentPart[];
  
  // Tool calls
  toolCalls?: ToolCall[];
  
  // Usage
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  // Stop reason
  stopReason: "stop" | "length" | "tool_use" | "content_filter";
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;   // Parsed JSON
}
```

### Streaming Format

```typescript
// SSE event types (normalized from provider formats)

// Content delta
event: content_delta
data: { "delta": "Hello" }

// Tool call start
event: tool_call_start
data: { "id": "call_123", "name": "get_weather" }

// Tool call arguments
event: tool_call_delta
data: { "id": "call_123", "argumentsDelta": "{\"location\":" }

// Usage (final event)
event: usage
data: { "promptTokens": 100, "completionTokens": 50, "totalTokens": 150 }

// Done
event: done
data: {}
```

### Additional Endpoints

```typescript
// Embeddings
POST /ports/llm/:namespace/embed
{
  model: "openai/text-embedding-3-small",
  input: string | string[]
}
→ { embeddings: number[][], usage: Usage }

// Model discovery
GET /ports/llm/:namespace/models
→ {
  models: [{
    id: string,
    contextWindow: number,
    capabilities: ("chat" | "embed" | "vision" | "tools" | "audio")[]
  }]
}

// Token counting
POST /ports/llm/:namespace/count-tokens
{
  model: string,
  messages: Message[]
}
→ { tokenCount: number }
```

---

## Adapter Architecture

### Port Routing

```typescript
// /src/ports/llm/router.ts
export async function handleLLMRequest(
  namespace: string,
  action: "chat" | "stream" | "embed",
  body: LLMRequest,
  app: AppRecord
): Promise<LLMResponse | ReadableStream> {
  // Get adapter config for namespace
  const adapter = await getLLMAdapter(namespace, app);
  
  // Route to provider-specific handler
  switch (adapter.type) {
    case "openai":
      return openaiAdapter.chat(body, adapter);
    case "anthropic":
      return anthropicAdapter.chat(body, adapter);
    case "openrouter":
      return openrouterAdapter.chat(body, adapter);
    case "ollama":
      return ollamaAdapter.chat(body, adapter);
    case "scout-atoms":
      return scoutAtomsAdapter.chat(body, adapter);
    case "custom":
      return customAdapter.chat(body, adapter);
  }
}
```

### Provider Adapters

```typescript
// /src/ports/llm/adapters/openai.ts
export const openaiAdapter: LLMAdapter = {
  chat: async (req, config) => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toOpenAIRequest(req)),
    });
    return fromOpenAIResponse(await response.json());
  },
  
  stream: async (req, config) => {
    // SSE streaming with delta normalization
  },
  
  embed: async (req, config) => { /* ... */ },
};

// /src/ports/llm/adapters/anthropic.ts
export const anthropicAdapter: LLMAdapter = {
  chat: async (req, config) => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toAnthropicRequest(req)),
    });
    return fromAnthropicResponse(await response.json());
  },
  
  // Anthropic doesn't have a dedicated embed endpoint
  embed: async (req, config) => {
    throw new Error("Anthropic does not support embeddings directly");
  },
};
```

### Model String Format

```
provider/model-identifier

Examples:
  openai/gpt-4o
  openai/gpt-4o-mini
  anthropic/claude-sonnet-4
  anthropic/claude-opus-4
  openrouter/anthropic/claude-sonnet-4
  ollama/llama3.2
  scout-atoms/zyx
  custom/my-model
```

---

## Adapter Configuration

### App-Level Configuration

```typescript
// App's LLM port config (stored in app record)
interface LLMAdapterConfig {
  type: "openai" | "anthropic" | "openrouter" | "ollama" | "scout-atoms" | "custom";
  
  // Provider-specific
  apiKey?: string;                   // For OpenAI, Anthropic, OpenRouter
  baseUrl?: string;                  // For Ollama, custom
  
  // Custom headers (for custom adapters)
  headers?: Record<string, string>;
  
  // Model selection (optional overrides)
  defaultModel?: string;
  allowedModels?: string[];
  
  // Rate limiting
  maxRequestsPerMinute?: number;
  maxTokensPerRequest?: number;
}
```

### Shared Adapters

Apps can use shared adapters configured at the platform level:

```typescript
// Platform-level shared LLM adapters (ports:llm:shared-*)
const sharedAdapters = {
  "shared-openai": {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,  // Platform-managed
    defaultModel: "gpt-4o-mini",
  },
  "shared-anthropic": {
    type: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: "claude-sonnet-4",
  },
  "shared-ollama": {
    type: "ollama",
    baseUrl: "http://ollama.scout-live.svc.cluster.local:11434",
  },
};
```

---

## Implementation Plan

### Phase 1: Core Interface (Week 1)

- [ ] Define TypeScript interfaces for request/response
- [ ] Create adapter type definitions
- [ ] Implement port router skeleton

### Phase 2: OpenAI Adapter (Week 1-2)

- [ ] Implement `toOpenAIRequest` transformer
- [ ] Implement `fromOpenAIResponse` transformer
- [ ] Implement SSE streaming normalization
- [ ] Test with gpt-4o, gpt-4o-mini

### Phase 3: Anthropic Adapter (Week 2-3)

- [ ] Implement `toAnthropicRequest` transformer
- [ ] Implement `fromAnthropicResponse` transformer
- [ ] Handle system prompt normalization
- [ ] Handle tool_use/tool_result blocks
- [ ] Test with claude-sonnet-4, claude-opus-4

### Phase 4: Additional Adapters (Week 3-4)

- [ ] OpenRouter adapter (OpenAI-compatible)
- [ ] Ollama adapter
- [ ] Scout Atoms adapter
- [ ] Custom adapter support

### Phase 5: Observability (Week 4)

- [ ] Token usage tracking
- [ ] Cost estimation
- [ ] Error rate monitoring
- [ ] Latency tracking

---

## Questions for Discussion

1. **Embedding support:** Should we include embeddings in v1, or defer to Phase 2?

2. **Streaming protocol:** Use our existing SSE format (ports:sse) or create LLM-specific events?

3. **Context caching:** Anthropic supports prompt caching. Should we expose this?

4. **Fallback/rotation:** Should the port support fallback models if primary fails?

5. **Cost attribution:** Should we return estimated costs per request?

---

## References

- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Scout Live Port Architecture](../scout-live/DESIGN_GUIDE.md)

---

## Appendix: Adapter Transformation Examples

### OpenAI Request

```typescript
// Unified request to OpenAI format
function toOpenAIRequest(req: LLMRequest): OpenAI.ChatCompletionCreateParams {
  return {
    model: req.model.replace("openai/", ""),
    messages: req.messages.map(m => ({
      role: m.role,
      content: normalizeContent(m.content),
    })),
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    top_p: req.topP,
    stop: req.stopSequences,
    tools: req.tools?.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    })),
    tool_choice: req.toolChoice === "auto" ? "auto" 
      : req.toolChoice === "required" ? "required"
      : req.toolChoice?.name ? { type: "function", function: { name: req.toolChoice.name } }
      : undefined,
    stream: req.stream,
  };
}
```

### Anthropic Request

```typescript
// Unified request to Anthropic format
function toAnthropicRequest(req: LLMRequest): Anthropic.Messages.MessagesRequest {
  const systemPrompt = req.system 
    || req.messages.find(m => m.role === "system")?.content 
    || undefined;
  
  return {
    model: req.model.replace("anthropic/", ""),
    max_tokens: req.maxTokens ?? 4096,  // Required by Anthropic
    system: systemPrompt,
    messages: req.messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role,
        content: normalizeContentBlocks(m.content),
      })),
    temperature: req.temperature,
    top_p: req.topP,
    top_k: req.topK,
    stop_sequences: req.stopSequences,
    tools: req.tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    })),
    tool_choice: req.toolChoice === "auto" ? { type: "auto" }
      : req.toolChoice === "required" ? { type: "any" }
      : req.toolChoice?.name ? { type: "tool", name: req.toolChoice.name }
      : undefined,
  };
}
```