import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { pages } from '../routes/pages.js';
import { render } from '../routes/render.js';
import { initDatabase, closeDatabase, getDatabase } from '../storage/db.js';
import { resetAuthAttempts } from '../middleware/authRateLimit.js';

const app = new Hono();
app.route('/v1/pages', pages);
app.route('/p', render);

// Helper to create Basic Auth header
function basicAuth(password: string, username: string = ''): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

// Helper to generate unique page IDs
function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('Page Authentication', () => {
  beforeAll(() => {
    initDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('Page Creation with Auth', () => {
    it('should create a page with password protection', async () => {
      const id = uniqueId('pass');
      const res = await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Secret</h1>',
          auth: { password: 'testpassword123' }
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe(id);
      expect(data.url).toContain(`/p/${id}`);
      expect(data.secret_url).toBeUndefined(); // No token requested
    });

    it('should create a page with URL token', async () => {
      const id = uniqueId('token');
      const res = await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Token Page</h1>',
          auth: { urlToken: true }
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.secret_url).toBeDefined();
      expect(data.secret_url).toContain('?token=');
      expect(data.secret_raw_url).toBeDefined();
      expect(data.secret_raw_url).toContain('?token=');
    });

    it('should create a page with both password and URL token', async () => {
      const id = uniqueId('both');
      const res = await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Dual Auth</h1>',
          auth: { password: 'testpassword123', urlToken: true }
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.secret_url).toBeDefined();
    });

    it('should reject password shorter than 8 characters', async () => {
      const id = uniqueId('short');
      const res = await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Test</h1>',
          auth: { password: 'short' }
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('8 characters');
    });

    it('should reject empty auth object', async () => {
      const id = uniqueId('empty');
      const res = await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Test</h1>',
          auth: {}
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should create public page without auth', async () => {
      const id = uniqueId('public');
      const res = await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Public</h1>'
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.secret_url).toBeUndefined();
    });
  });

  describe('Accessing Protected Pages', () => {
    let passwordPageId: string;
    let tokenPageId: string;
    let urlToken: string;
    const password = 'testpassword123';

    beforeAll(async () => {
      // Create password-protected page
      passwordPageId = uniqueId('access-pass');
      await app.request(`/v1/pages/${passwordPageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Password Protected</h1>',
          auth: { password }
        }),
      });

      // Create token-protected page
      tokenPageId = uniqueId('access-token');
      const tokenRes = await app.request(`/v1/pages/${tokenPageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Token Protected</h1>',
          auth: { urlToken: true }
        }),
      });
      const tokenData = await tokenRes.json();
      const url = new URL(tokenData.secret_url);
      urlToken = url.searchParams.get('token')!;
    });

    it('should return 401 without auth for protected page', async () => {
      const res = await app.request(`/p/${passwordPageId}`);
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe(`Basic realm="ZenBin-${passwordPageId}"`);
    });

    it('should return 401 with wrong password', async () => {
      resetAuthAttempts(passwordPageId);
      const res = await app.request(`/p/${passwordPageId}`, {
        headers: { Authorization: basicAuth('wrongpassword') }
      });
      expect(res.status).toBe(401);
    });

    it('should return 200 with correct password', async () => {
      resetAuthAttempts(passwordPageId);
      const res = await app.request(`/p/${passwordPageId}`, {
        headers: { Authorization: basicAuth(password) }
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Password Protected');
    });

    it('should return 200 with valid URL token', async () => {
      const res = await app.request(`/p/${tokenPageId}?token=${urlToken}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Token Protected');
    });

    it('should return 401 with invalid URL token', async () => {
      resetAuthAttempts(tokenPageId);
      const res = await app.request(`/p/${tokenPageId}?token=invalidtoken`);
      expect(res.status).toBe(401);
    });

    it('should work with raw endpoint and password', async () => {
      resetAuthAttempts(passwordPageId);
      const res = await app.request(`/p/${passwordPageId}/raw`, {
        headers: { Authorization: basicAuth(password) }
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/plain');
    });

    it('should work with raw endpoint and URL token', async () => {
      const res = await app.request(`/p/${tokenPageId}/raw?token=${urlToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Public Pages Still Work', () => {
    it('should access public page without auth', async () => {
      const id = uniqueId('still-public');
      await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: '<h1>Public</h1>' }),
      });

      const res = await app.request(`/p/${id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('ETag Caching with Auth', () => {
    it('should return 304 for authenticated request with matching ETag', async () => {
      const id = uniqueId('etag');
      const password = 'testpassword123';

      // Create page
      const createRes = await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>ETag Test</h1>',
          auth: { password }
        }),
      });
      const { etag } = await createRes.json();

      // First request to get content
      resetAuthAttempts(id);
      const firstRes = await app.request(`/p/${id}`, {
        headers: { Authorization: basicAuth(password) }
      });
      expect(firstRes.status).toBe(200);

      // Second request with If-None-Match
      const secondRes = await app.request(`/p/${id}`, {
        headers: {
          Authorization: basicAuth(password),
          'If-None-Match': etag
        }
      });
      expect(secondRes.status).toBe(304);
    });
  });

  describe('Brute Force Protection', () => {
    it('should lock out after too many failed attempts', async () => {
      const id = uniqueId('brute');
      await app.request(`/v1/pages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<h1>Brute Force Test</h1>',
          auth: { password: 'correctpassword' }
        }),
      });

      // Reset any existing attempts
      resetAuthAttempts(id);

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await app.request(`/p/${id}`, {
          headers: { Authorization: basicAuth('wrongpassword') }
        });
      }

      // Next attempt should be rate limited
      const res = await app.request(`/p/${id}`, {
        headers: { Authorization: basicAuth('wrongpassword') }
      });
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeDefined();
    });
  });
});
