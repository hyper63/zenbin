import { Hono, Context } from 'hono';
import { getPage } from '../storage/db.js';
import { validateId } from '../utils/validation.js';
import { etagMatches } from '../utils/etag.js';
import { verifyPassword, verifyUrlToken, parseBasicAuth } from '../utils/auth.js';
import { checkAuthRateLimit, recordFailedAttempt, resetAuthAttempts } from '../middleware/authRateLimit.js';
import type { Page } from '../storage/db.js';

const render = new Hono();

// Security headers for sandboxed rendering
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src *", // Allow hosted apps to make fetch/WebSocket requests
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
  'X-Frame-Options': 'DENY',
};

/**
 * Verify page authentication
 * Returns null if auth succeeds, or a Response if it fails
 */
async function verifyPageAuth(c: Context, page: Page): Promise<Response | null> {
  // Public page - no auth needed
  if (!page.auth) {
    return null;
  }

  const pageId = page.id;

  // Check rate limit first
  const rateCheck = checkAuthRateLimit(pageId);
  if (!rateCheck.allowed) {
    c.header('Retry-After', String(rateCheck.retryAfter));
    return c.json({ error: 'Too many failed authentication attempts' }, 429);
  }

  // Check URL token first (query param)
  const urlToken = c.req.query('token');
  if (urlToken && page.auth.urlTokenHash) {
    if (verifyUrlToken(urlToken, page.auth.urlTokenHash)) {
      resetAuthAttempts(pageId);
      return null; // Success
    }
    // Invalid token - record failure and continue to password check
    recordFailedAttempt(pageId);
  }

  // Check Basic Auth header
  const authHeader = c.req.header('Authorization');
  const basicAuth = parseBasicAuth(authHeader);

  if (!basicAuth) {
    // No auth provided - prompt for password
    c.header('WWW-Authenticate', `Basic realm="ZenBin-${pageId}"`);
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Verify password
  if (page.auth.passwordHash) {
    const validPassword = await verifyPassword(basicAuth.password, page.auth.passwordHash);
    if (validPassword) {
      resetAuthAttempts(pageId);
      return null; // Success
    }
  }

  // Auth failed
  recordFailedAttempt(pageId);
  c.header('WWW-Authenticate', `Basic realm="ZenBin-${pageId}"`);
  return c.json({ error: 'Invalid credentials' }, 401);
}

// GET /p/:id - Render page in browser
render.get('/:id', async (c) => {
  const id = c.req.param('id');

  // Validate ID
  const idError = validateId(id);
  if (idError) {
    return c.json({ error: idError.message }, 400);
  }

  // Get page from database
  const page = getPage(id);
  if (!page) {
    return c.json({ error: 'Page not found' }, 404);
  }

  // Check authentication
  const authResponse = await verifyPageAuth(c, page);
  if (authResponse) {
    return authResponse;
  }

  // Check If-None-Match for caching
  const ifNoneMatch = c.req.header('If-None-Match');
  if (etagMatches(ifNoneMatch, page.etag)) {
    return c.body(null, 304);
  }

  // Set security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    c.header(key, value);
  }

  // Set caching headers
  c.header('ETag', page.etag);
  c.header('Cache-Control', 'public, max-age=0, must-revalidate');

  // Return HTML
  c.header('Content-Type', page.content_type || 'text/html; charset=utf-8');
  return c.body(page.html);
});

// GET /p/:id/raw - Fetch raw HTML
render.get('/:id/raw', async (c) => {
  const id = c.req.param('id');

  // Validate ID
  const idError = validateId(id);
  if (idError) {
    return c.json({ error: idError.message }, 400);
  }

  // Get page from database
  const page = getPage(id);
  if (!page) {
    return c.json({ error: 'Page not found' }, 404);
  }

  // Check authentication
  const authResponse = await verifyPageAuth(c, page);
  if (authResponse) {
    return authResponse;
  }

  // Check If-None-Match for caching
  const ifNoneMatch = c.req.header('If-None-Match');
  if (etagMatches(ifNoneMatch, page.etag)) {
    return c.body(null, 304);
  }

  // Set headers for raw content
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header('Content-Disposition', `inline; filename="${id}.html"`);
  c.header('ETag', page.etag);
  c.header('Cache-Control', 'public, max-age=0, must-revalidate');

  return c.body(page.html);
});

export { render };
