import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config.js';
import { initDatabase, closeDatabase } from './storage/db.js';
import { pages } from './routes/pages.js';
import { render } from './routes/render.js';
import { agent } from './routes/agent.js';
import { landing } from './routes/landing.js';
import { stats } from './routes/stats.js';
import { wellKnown } from './routes/wellKnown.js';
import { subdomains } from './routes/subdomains.js';
import { subdomainRender } from './routes/subdomainRender.js';
import { rateLimit } from './middleware/rateLimit.js';
import { proxyRateLimit } from './middleware/proxyRateLimit.js';
import { proxy } from './routes/proxy.js';

// Type for context variables
type Variables = {
  subdomain: string;
};

const app = new Hono<{ Variables: Variables }>();

// Middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', rateLimit);

// Subdomain detection middleware
app.use('*', async (c, next) => {
  const host = c.req.header('host') || '';
  const baseDomain = config.subdomains.baseDomain;
  
  // Check if this is a subdomain request
  const parts = host.split('.');
  if (parts.length >= 3) {
    const potentialSubdomain = parts[0].toLowerCase();
    const reserved = new Set(config.subdomains.reservedNames);
    if (!reserved.has(potentialSubdomain) && potentialSubdomain !== 'www') {
      c.set('subdomain', potentialSubdomain);
    }
  }
  
  await next();
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.route('/v1/pages', pages);
app.route('/v1/subdomains', subdomains);
app.route('/v1/stats', stats);

// Agent instructions
app.route('/api/agent', agent);

// Proxy endpoint (with stricter rate limiting)
app.use('/api/proxy/*', proxyRateLimit);
app.route('/api/proxy', proxy);

// Well-known endpoints (for agent discoverability)
app.route('/.well-known', wellKnown);

// Subdomain render routes (must come before /p routes)
// This handles: {subdomain}.{domain}/* paths
app.route('/', subdomainRender);

// Landing page (only for main domain)
app.route('/', landing);

// Render routes (for /p/{id} paths - backwards compatibility)
app.route('/p', render);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Initialize database and start server
async function main() {
  try {
    console.log('Initializing database...');
    initDatabase();
    console.log(`Database initialized at ${config.lmdbPath}`);

    const server = serve({
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
    }, (info) => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ███████╗███████╗███╗   ██╗██████╗ ██╗███╗   ██╗         ║
║   ╚══███╔╝██╔════╝████╗  ██║██╔══██╗██║████╗  ██║         ║
║     ███╔╝ █████╗  ██╔██╗ ██║██████╔╝██║██╔██╗ ██║         ║
║    ███╔╝  ██╔══╝  ██║╚██╗██║██╔══██╗██║██║╚██╗██║         ║
║   ███████╗███████╗██║ ╚████║██████╔╝██║██║ ╚████║         ║
║   ╚══════╝╚══════╝╚═╝  ╚═══╝╚═════╝ ╚═╝╚═╝  ╚═══╝         ║
║                                                           ║
║   Headless HTML Sandbox                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

Server running at http://${info.address}:${info.port}

Endpoints:
  GET  /                        - Landing page
  GET  /.well-known/skill.md    - Agent instructions
  GET  /v1/stats                - Site statistics
  POST /v1/subdomains/{name}    - Claim a subdomain
  GET  /v1/subdomains/{name}    - Get subdomain info
  GET  /v1/subdomains/{name}/pages - List subdomain pages
  DELETE /v1/subdomains/{name}  - Delete subdomain
  POST /v1/pages/{id}           - Create or replace a page (use X-Subdomain header for subdomains)
  GET  /p/{id}                 - Render page in browser
  GET  /p/{id}/raw             - Fetch raw HTML
  GET  /p/{id}/md              - Fetch markdown source
  GET  /{path} (subdomain)     - Render subdomain page
  GET  /api/agent              - Agent instructions (markdown)
  POST /api/proxy              - Proxy external requests (CORS bypass)
  GET  /health                 - Health check

Subdomain routing:
  {name}.zenbin.io/            - Subdomain root page
  {name}.zenbin.io/{path}      - Subdomain nested pages

Configuration:
  Max payload size: ${config.maxPayloadSize} bytes
  Rate limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs / 1000}s
  Proxy rate limit: ${config.proxyRateLimitMax} requests per ${config.proxyRateLimitWindowMs / 1000}s
`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      await closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
