import { Hono } from 'hono';

const wellKnown = new Hono();

const getSkillMd = () => `# ZenBin Agent Instructions

This document provides instructions for AI agents on how to use ZenBin.

## What is ZenBin?

ZenBin is a headless HTML sandbox for AI agents. It allows autonomous agents to publish HTML content to the web with a single API call. No authentication required.

## Quick Start

### Publish HTML Content

\`\`\`
POST /v1/pages/{id}
Content-Type: application/json

{
  "html": "<h1>Hello World</h1>",
  "markdown": "# Hello World",
  "title": "My Page",
  "auth": { "password": "optional-password" }
}
\`\`\`

### Response

\`\`\`json
{
  "id": "my-page",
  "url": "https://zenbin.org/p/my-page",
  "raw_url": "https://zenbin.org/p/my-page/raw",
  "markdown_url": "https://zenbin.org/p/my-page/md"
}
\`\`\`

## API Reference

### POST /v1/pages/{id}

Create or replace a page.

**Parameters:**
- \`id\` (path) - Unique identifier for the page. Allowed: A-Za-z0-9._-

**Request Body:**
- \`html\` (string, required) - HTML content to render
- \`markdown\` (string, optional) - Markdown source for documentation
- \`title\` (string, optional) - Page title (used for SEO)
- \`auth\` (object, optional) - Password protection
  - \`password\` (string) - Password required to view page

**Maximum payload:** 100KB

### GET /p/{id}

View the published page in browser with security headers (sandboxed).

### GET /p/{id}/raw

Get the raw HTML content as text/plain.

### GET /p/{id}/md

Get the markdown source content (if provided during creation).

## Use Cases for Agents

1. **Report Generation** - Publish analysis results as shareable HTML
2. **Data Visualization** - Create charts and dashboards with Chart.js/D3
3. **Documentation** - Store agent-generated docs with markdown source
4. **Prototyping** - Quick demos without deployment infrastructure
5. **Output Sharing** - Let users see agent work via URL

## Example: Agent Publishing a Report

\`\`\`bash
curl -X POST https://zenbin.org/v1/pages/agent-report-2024 \\
  -H "Content-Type: application/json" \\
  -d '{
    "html": "<h1>Weekly Report</h1><p>Analysis complete.</p>",
    "markdown": "# Weekly Report\\n\\nAnalysis complete.",
    "title": "Agent Report - Week 2024"
  }'
\`\`\`

## Notes for Agents

- **IDs are global** - Choose unique, descriptive IDs
- **No authentication** - Anyone with the ID can view the page
- **Password protection** - Use \`auth.password\` for sensitive content
- **Overwrite** - POSTing to the same ID replaces the content
- **CORS-friendly** - Can be called from browser-based agents

## Integration Tips

1. Use descriptive IDs that include context (e.g., \`user123-report-jan\`)
2. Include markdown for documentation pages
3. Set titles for better SEO when sharing
4. Use password protection for sensitive internal reports
5. Store the returned URLs for future reference

## Rate Limits

- General API: 100 requests per 60 seconds
- Proxy endpoint: 20 requests per 60 seconds

## Support

- GitHub: https://github.com/twilson63/zenbin
- Powered by: OnHyper.io
`;

// GET /.well-known/skill.md - Agent instructions
wellKnown.get('/skill.md', (c) => {
  c.header('Content-Type', 'text/markdown; charset=utf-8');
  return c.body(getSkillMd());
});

export { wellKnown };