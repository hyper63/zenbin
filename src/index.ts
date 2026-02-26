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
import { rateLimit } from './middleware/rateLimit.js';
import { proxyRateLimit } from './middleware/proxyRateLimit.js';
import { proxy } from './routes/proxy.js';
import { verifyApiKey } from './middleware/verifyApiKey.js';
import { initAnalytics, closeAnalytics } from './analytics/posthog.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', rateLimit);

// API Key verification (must be after rateLimit to avoid abuse)
app.use('/v1/*', verifyApiKey);
app.use('/api/proxy/*', verifyApiKey);

// Landing page
app.route('/', landing);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.route('/v1/pages', pages);

// Agent instructions
app.route('/api/agent', agent);

// Proxy endpoint (with stricter rate limiting)
app.use('/api/proxy/*', proxyRateLimit);
app.route('/api/proxy', proxy);

// Render routes
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

    console.log('Initializing analytics...');
    initAnalytics();

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
  GET  /               - Landing page
  POST /v1/pages/{id}  - Create or replace a page
  GET  /p/{id}         - Render page in browser
  GET  /p/{id}/raw     - Fetch raw HTML
  GET  /api/agent      - Agent instructions (markdown)
  POST /api/proxy       - Proxy external requests (CORS bypass)
  GET  /health         - Health check

Configuration:
  Max payload size: ${config.maxPayloadSize} bytes
  Rate limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs / 1000}s
  Proxy rate limit: ${config.proxyRateLimitMax} requests per ${config.proxyRateLimitWindowMs / 1000}s

API Key Configuration:
  JWT Secret: ${process.env.ZENBIN_JWT_SECRET ? 'configured' : 'NOT SET (using default)'}
  Free tier: 10 requests/month
`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      await closeAnalytics();
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
