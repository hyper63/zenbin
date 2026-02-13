import { Hono } from 'hono';
import { config } from '../config.js';

const agent = new Hono();

const getAgentInstructions = () => `# ZenBin API — Agent Instructions

You can publish HTML pages to ZenBin using a simple API. Each page gets a unique URL that can be shared or viewed in a browser.

## Base URL

\`${config.baseUrl}\`

## Publishing a Page

Send a POST request with a JSON body containing your HTML content:

\`\`\`
POST ${config.baseUrl}/v1/pages/{id}
Content-Type: application/json
\`\`\`

### Request Body

| Field | Required | Description |
|-------|----------|-------------|
| \`html\` | No* | The HTML content (plain text or base64-encoded). *At least one of \`html\` or \`markdown\` is required. |
| \`markdown\` | No* | Markdown source content (plain text or base64-encoded). *At least one of \`html\` or \`markdown\` is required. |
| \`encoding\` | No | \`"utf-8"\` (default) or \`"base64"\` — specifies how the \`html\` field is encoded |
| \`markdown_encoding\` | No | \`"utf-8"\` (default) or \`"base64"\` — specifies how the \`markdown\` field is encoded |
| \`title\` | No | Page title (metadata only) |
| \`content_type\` | No | Content-Type header for the page (default: \`text/html; charset=utf-8\`) |
| \`auth\` | No | Authentication settings: \`{ password?: string, urlToken?: boolean }\` (see [Page Authentication](#page-authentication-optional)) |

### URL Path Parameter

| Parameter | Description |
|-----------|-------------|
| \`id\` | Unique page identifier. Allowed characters: \`A-Z\`, \`a-z\`, \`0-9\`, \`.\`, \`_\`, \`-\` |

### Response

**Success (201 Created):**

\`\`\`json
{
  "id": "my-page",
  "url": "${config.baseUrl}/p/my-page",
  "raw_url": "${config.baseUrl}/p/my-page/raw",
  "markdown_url": "${config.baseUrl}/p/my-page/md",
  "etag": "\"...\""
}
\`\`\`

- \`url\` — View the rendered page in a browser
- \`raw_url\` — Fetch the raw HTML content
- \`markdown_url\` — Fetch the markdown source (only included when markdown is provided)

**Error: ID Already Taken (409 Conflict):**

\`\`\`json
{
  "error": "Page ID \\"my-page\\" is already taken"
}
\`\`\`

Page IDs are permanent and cannot be overwritten. Choose a unique ID for each page.

## Encoding Options

### Option 1: Plain Text (encoding: "utf-8")

Send HTML as a plain string. You must escape special JSON characters (quotes, backslashes, newlines).

\`\`\`json
{
  "encoding": "utf-8",
  "html": "<!DOCTYPE html><html><head><title>Demo</title></head><body><h1>Hello!</h1></body></html>"
}
\`\`\`

### Option 2: Base64 Encoded (encoding: "base64")

**Recommended for complex HTML.** Encode your HTML as base64 to avoid JSON escaping issues.

\`\`\`json
{
  "encoding": "base64",
  "html": "PCFET0NUWVBFIGh0bWw+PGh0bWw+PGhlYWQ+PHRpdGxlPkRlbW88L3RpdGxlPjwvaGVhZD48Ym9keT48aDE+SGVsbG8hPC9oMT48L2JvZHk+PC9odG1sPg=="
}
\`\`\`

The server will decode the base64 content and store/render it as HTML.

## Examples

### Example 1: Plain text HTML

\`\`\`bash
curl -X POST ${config.baseUrl}/v1/pages/hello \\
  -H "Content-Type: application/json" \\
  -d '{"html":"<h1>Hello World</h1>"}'
\`\`\`

### Example 2: Base64 encoded HTML

\`\`\`bash
# The base64 below decodes to: <!DOCTYPE html><html><body><h1>Hello!</h1></body></html>
curl -X POST ${config.baseUrl}/v1/pages/hello-b64 \\
  -H "Content-Type: application/json" \\
  -d '{
    "encoding": "base64",
    "html": "PCFET0NUWVBFIGh0bWw+PGh0bWw+PGJvZHk+PGgxPkhlbGxvITwvaDE+PC9ib2R5PjwvaHRtbD4="
  }'
\`\`\`

### Example 3: Full page with styling

\`\`\`bash
curl -X POST ${config.baseUrl}/v1/pages/styled \\
  -H "Content-Type: application/json" \\
  -d '{
    "encoding": "utf-8",
    "html": "<!DOCTYPE html><html><head><meta charset=utf-8><style>body{font-family:system-ui;padding:2rem}</style></head><body><h1>Styled Page</h1></body></html>",
    "title": "My Styled Page"
  }'
\`\`\`

## Guidelines for Agents

1. **Use base64 encoding** — Strongly recommended to avoid JSON escaping issues with quotes, newlines, and special characters
2. **Generate complete HTML documents** — Include \`<!DOCTYPE html>\`, \`<html>\`, \`<head>\`, and \`<body>\` tags
3. **External resources supported** — You can use external HTTPS stylesheets, scripts from CDNs (unpkg, cdnjs), Google Fonts, and embed videos (YouTube, Vimeo)
4. **Inline or external** — Both inline CSS/JS and external HTTPS resources work
5. **Use unique IDs** — Choose descriptive page IDs (e.g., \`report-2024-01-15\`, \`chart-demo-v2\`)

## Limits

- Maximum HTML size: ${Math.round(config.maxPayloadSize / 1024)}KB
- Maximum ID length: ${config.maxIdLength} characters
- Allowed ID characters: \`A-Za-z0-9._-\`

## Viewing Pages

After publishing, the page is available at:

- **Rendered HTML:** \`${config.baseUrl}/p/{id}\`
- **Raw HTML:** \`${config.baseUrl}/p/{id}/raw\`
- **Markdown source:** \`${config.baseUrl}/p/{id}/md\`

### Markdown Retrieval Options

You can retrieve markdown in three ways:

1. **Dedicated endpoint:** \`GET /p/{id}/md\` — Returns markdown with \`Content-Type: text/markdown\`
2. **Content negotiation:** \`GET /p/{id}\` with \`Accept: text/markdown\` header
3. **Markdown-only pages:** If a page has markdown but no HTML, \`GET /p/{id}\` automatically returns markdown

### Example with Both HTML and Markdown

\`\`\`bash
curl -X POST ${config.baseUrl}/v1/pages/article \\
  -H "Content-Type: application/json" \\
  -d '{
    "html": "<!DOCTYPE html><html><head><style>body{font-family:system-ui;max-width:700px;margin:0 auto;padding:2rem}</style></head><body><h1>My Article</h1><p>Content here.</p></body></html>",
    "markdown": "# My Article\\n\\nContent here.",
    "title": "My Article"
  }'
\`\`\`

Response:
\`\`\`json
{
  "id": "article",
  "url": "${config.baseUrl}/p/article",
  "raw_url": "${config.baseUrl}/p/article/raw",
  "markdown_url": "${config.baseUrl}/p/article/md",
  "etag": "\"...\""
}
\`\`\`

### Example: Markdown-Only Page

\`\`\`bash
curl -X POST ${config.baseUrl}/v1/pages/notes \\
  -H "Content-Type: application/json" \\
  -d '{
    "markdown": "# Notes\\n\\n- Item 1\\n- Item 2\\n- Item 3"
  }'
\`\`\`

For markdown-only pages, both \`/p/{id}\` and \`/p/{id}/md\` return the markdown content.

## Making External API Calls (Proxy)

ZenBin-hosted pages can make external API calls through the built-in proxy to bypass CORS restrictions.

### Endpoint

\`\`\`
POST ${config.baseUrl}/api/proxy
Content-Type: application/json
\`\`\`

### Request Body

| Field | Required | Description |
|-------|----------|-------------|
| \`url\` | Yes | Target URL (must be http/https) |
| \`method\` | No | HTTP method (default: "GET") |
| \`body\` | No | Request body to forward (JSON) |
| \`timeout\` | No | Timeout in ms (max: 30000) |
| \`contentType\` | No | Content-Type for outgoing request |
| \`accept\` | No | Accept header for outgoing request |
| \`auth\` | No | Authentication configuration (see below) |

### Authentication Options

| Type | Usage | Result Header |
|------|-------|---------------|
| \`bearer\` | \`{ type: "bearer", credentials: "token" }\` | \`Authorization: Bearer token\` |
| \`basic\` | \`{ type: "basic", credentials: "base64" }\` | \`Authorization: Basic base64\` |
| \`api-key\` | \`{ type: "api-key", credentials: "key", headerName: "X-API-Key" }\` | \`X-API-Key: key\` |

### Response

\`\`\`json
{
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": { ... }
}
\`\`\`

### Example Usage

\`\`\`javascript
// From your ZenBin-hosted page
const response = await fetch('/api/proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://api.example.com/data',
    method: 'GET',
    auth: {
      type: 'bearer',
      credentials: 'your-api-token'
    }
  })
});

const data = await response.json();
console.log(data.body); // The actual API response
\`\`\`

### Proxy Limits

- Rate limit: 5 requests per minute
- Max request/response size: 5MB
- Max timeout: 30 seconds
- Only accessible from ZenBin-hosted pages

## Page Authentication (Optional)

Pages can be optionally protected with authentication. By default, pages are public.

### Password Protection

Add HTTP Basic Auth to your page:

\`\`\`json
{
  "html": "<h1>Secret Page</h1>",
  "auth": {
    "password": "your-password-here"
  }
}
\`\`\`

Viewers will be prompted for a password by their browser. Minimum password length is 8 characters.

### URL Token

Generate a secret shareable URL:

\`\`\`json
{
  "html": "<h1>Shared Page</h1>",
  "auth": {
    "urlToken": true
  }
}
\`\`\`

Response includes secret URLs:
\`\`\`json
{
  "id": "my-page",
  "url": "${config.baseUrl}/p/my-page",
  "secret_url": "${config.baseUrl}/p/my-page?token=abc123...",
  "secret_raw_url": "${config.baseUrl}/p/my-page/raw?token=abc123..."
}
\`\`\`

If the page has markdown, the response also includes \`secret_markdown_url\`:

\`\`\`json
{
  "secret_markdown_url": "${config.baseUrl}/p/my-page/md?token=abc123..."
}
\`\`\`

### Both Methods

Use both password and URL token:

\`\`\`json
{
  "html": "<h1>Dual Auth</h1>",
  "auth": {
    "password": "your-password-here",
    "urlToken": true
  }
}
\`\`\`

### Accessing Protected Pages

- **Password**: Browser prompts automatically, or use \`curl -u ":password" URL\`
- **URL Token**: Use the secret_url directly

**Note**: Authentication settings cannot be changed after page creation. The URL token is only shown once in the creation response.
`;

// GET /api/agent - Return agent instructions as markdown
agent.get('/', (c) => {
  c.header('Content-Type', 'text/markdown; charset=utf-8');
  return c.body(getAgentInstructions());
});

export { agent };
