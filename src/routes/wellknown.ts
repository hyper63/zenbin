import { Hono } from 'hono';
import { config } from '../config.js';

const wellknown = new Hono();

// GET /.well-known/skill.md - Agent discovery endpoint
wellknown.get('/skill.md', (c) => {
  c.header('Content-Type', 'text/markdown; charset=utf-8');
  return c.body(getSkillInstructions());
});

function getSkillInstructions(): string {
  return `# ZenBin

A headless HTML sandbox for publishing and serving HTML documents via API.

## Base URL

\`${config.baseUrl}\`

## Quick Start

### Publish a Page

\`\`\`bash
POST ${config.baseUrl}/v1/pages/{id}
Content-Type: application/json

{
  "html": "<!DOCTYPE html><html><body><h1>Hello World</h1></body></html>",
  "encoding": "utf-8"
}
\`\`\`

### View Page

- Rendered: \`GET ${config.baseUrl}/p/{id}\`
- Raw HTML: \`GET ${config.baseUrl}/p/{id}/raw\`
- Markdown: \`GET ${config.baseUrl}/p/{id}/md\`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/pages/{id} | Create or replace a page |
| GET | /p/{id} | View rendered HTML |
| GET | /p/{id}/raw | Get raw HTML |
| GET | /p/{id}/md | Get markdown source |
| GET | /api/agent | Full agent instructions |
| GET | /.well-known/skill.md | This document |
| GET | /health | Health check |

## Features

- **Markdown support**: Store markdown alongside HTML
- **Page authentication**: Password protection or secret URL tokens
- **CORS proxy**: Make external API calls from hosted pages
- **Subdomains**: Claim \`{id}.zenbin.org\` for custom URLs (coming soon)

## Limits

- Max HTML size: ${Math.round(config.maxPayloadSize / 1024)}KB
- Max ID length: ${config.maxIdLength} characters
- Rate limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs / 1000}s

## Agent Instructions

Full API documentation for agents:

\`${config.baseUrl}/api/agent\`

## Website

https://zenbin.org
`;
}

export { wellknown };