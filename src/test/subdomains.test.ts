import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { pages } from '../routes/pages.js';
import { subdomains } from '../routes/subdomains.js';
import { subdomainRender } from '../routes/subdomainRender.js';
import { stats } from '../routes/stats.js';
import { render } from '../routes/render.js';
import { initDatabase, closeDatabase } from '../storage/db.js';
import { config } from '../config.js';
import { rmSync } from 'fs';

const TEST_DB_PATH = './data/test-subdomains.lmdb';
const TEST_SUBDOMAIN_DB_PATH = './data/test-subdomains.lmdb-subdomains';

// Type for context variables
type Variables = { subdomain: string };

// Generate unique IDs for each test run
let testId: number;
const uniqueId = (base: string) => `${base}-${testId++}`;

// Create test apps
const app = new Hono<{ Variables: Variables }>();
app.route('/v1/pages', pages);
app.route('/v1/subdomains', subdomains);
app.route('/v1/stats', stats);
app.route('/p', render);

// Subdomain detection middleware for testing (not needed for API tests, but useful for subdomain render)
app.use('*', async (c, next) => {
  const host = c.req.header('host') || '';
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
app.route('/', subdomainRender);

beforeAll(() => {
  try {
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
    rmSync(TEST_SUBDOMAIN_DB_PATH, { recursive: true, force: true });
  } catch { /* ignore */ }
  process.env.LMDB_PATH = TEST_DB_PATH;
  initDatabase();
});

beforeEach(() => {
  testId = Date.now();
});

afterAll(async () => {
  await closeDatabase();
  try {
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
    rmSync(TEST_SUBDOMAIN_DB_PATH, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe('Subdomains', () => {
  describe('Claim Subdomain', () => {
    it('should claim an available subdomain', async () => {
      const name = uniqueId('my-test-site');
      const res = await app.request(`/v1/subdomains/${name}`, {
        method: 'POST',
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { name: string; url: string; created_at: string };
      expect(body.name).toBe(name);
      expect(body.url).toContain(name);
      expect(body.created_at).toBeDefined();
    });

    it('should normalize subdomain to lowercase', async () => {
      const name = uniqueId('MyTestSite').toLowerCase();
      const res = await app.request(`/v1/subdomains/${uniqueId('MyTestSite')}`, {
        method: 'POST',
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { name: string };
      expect(body.name).toBe(body.name.toLowerCase());
    });

    it('should reject already taken subdomain', async () => {
      const name = uniqueId('my-site');
      // First claim
      await app.request(`/v1/subdomains/${name}`, { method: 'POST' });
      
      // Second claim
      const res = await app.request(`/v1/subdomains/${name}`, {
        method: 'POST',
      });
      expect(res.status).toBe(409);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('already taken');
    });

    it('should reject reserved subdomain names', async () => {
      const res = await app.request('/v1/subdomains/www', {
        method: 'POST',
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('reserved');
    });

    it('should reject api as reserved', async () => {
      const res = await app.request('/v1/subdomains/api', {
        method: 'POST',
      });
      expect(res.status).toBe(400);
    });

    it('should reject subdomain that is too short', async () => {
      const res = await app.request('/v1/subdomains/ab', {
        method: 'POST',
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('at least 3 characters');
    });

    it('should reject invalid subdomain patterns', async () => {
      const res = await app.request('/v1/subdomains/123site', {
        method: 'POST',
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('start with a letter');
    });

    it('should reject subdomain ending with hyphen', async () => {
      const res = await app.request('/v1/subdomains/my-site-', {
        method: 'POST',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Get Subdomain Info', () => {
    it('should get subdomain info', async () => {
      const name = uniqueId('test-site');
      // Claim first
      await app.request(`/v1/subdomains/${name}`, { method: 'POST' });
      
      const res = await app.request(`/v1/subdomains/${name}`);
      expect(res.status).toBe(200);
      const body = await res.json() as { name: string; page_count: number };
      expect(body.name).toBe(name);
      expect(body.page_count).toBe(0);
    });

    it('should return 404 for non-existent subdomain', async () => {
      const res = await app.request('/v1/subdomains/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('Publish to Subdomain', () => {
    it('should publish index page to subdomain', async () => {
      const name = uniqueId('test-site');
      // Claim subdomain first
      await app.request(`/v1/subdomains/${name}`, { method: 'POST' });
      
      // Publish index page
      const res = await app.request('/v1/pages/index', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Subdomain': name,
        },
        body: JSON.stringify({ html: '<h1>Hello Subdomain!</h1>' }),
      });
      
      expect(res.status).toBe(201);
      const body = await res.json() as { id: string; subdomain: string; url: string; path: string };
      expect(body.id).toBe('index');
      expect(body.subdomain).toBe(name);
      expect(body.url).toContain(name);
      expect(body.path).toBe('/');
    });

    it('should publish nested path to subdomain', async () => {
      const name = uniqueId('test-site');
      await app.request(`/v1/subdomains/${name}`, { method: 'POST' });
      
      const res = await app.request('/v1/pages/about', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Subdomain': name,
        },
        body: JSON.stringify({ html: '<h1>About</h1>' }),
      });
      
      expect(res.status).toBe(201);
      const body = await res.json() as { url: string; path: string };
      expect(body.url).toContain(name);
      expect(body.path).toBe('/about');
    });

    it('should reject publish to non-existent subdomain', async () => {
      const res = await app.request('/v1/pages/index', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Subdomain': 'nonexistent',
        },
        body: JSON.stringify({ html: '<h1>Test</h1>' }),
      });
      
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('does not exist');
    });

    it('should reject duplicate page in same subdomain', async () => {
      const name = uniqueId('test-site');
      await app.request(`/v1/subdomains/${name}`, { method: 'POST' });
      
      // First publish
      await app.request('/v1/pages/index', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Subdomain': name,
        },
        body: JSON.stringify({ html: '<h1>First</h1>' }),
      });
      
      // Second publish to same page - now updates
      const res = await app.request('/v1/pages/index', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Subdomain': name,
        },
        body: JSON.stringify({ html: '<h1>Second</h1>' }),
      });
      
      expect(res.status).toBe(200); // Update returns 200
    });
  });

  describe('List Subdomain Pages', () => {
    it('should list pages in subdomain', async () => {
      const name = uniqueId('test-site');
      await app.request(`/v1/subdomains/${name}`, { method: 'POST' });
      
      // Publish a few pages
      await app.request('/v1/pages/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Subdomain': name },
        body: JSON.stringify({ html: '<h1>Home</h1>' }),
      });
      await app.request('/v1/pages/about', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Subdomain': name },
        body: JSON.stringify({ html: '<h1>About</h1>' }),
      });
      
      const res = await app.request(`/v1/subdomains/${name}/pages`);
      expect(res.status).toBe(200);
      const body = await res.json() as { pages: Array<{ id: string; path: string }>; total: number };
      expect(body.pages).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.pages.find(p => p.id === 'index')?.path).toBe('/');
      expect(body.pages.find(p => p.id === 'about')?.path).toBe('/about');
    });
  });

  describe('Delete Subdomain', () => {
    it('should delete subdomain and all its pages', async () => {
      const name = uniqueId('test-site');
      await app.request(`/v1/subdomains/${name}`, { method: 'POST' });
      await app.request('/v1/pages/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Subdomain': name },
        body: JSON.stringify({ html: '<h1>Test</h1>' }),
      });
      
      const res = await app.request(`/v1/subdomains/${name}`, {
        method: 'DELETE',
      });
      
      expect(res.status).toBe(204);
      
      // Verify subdomain is gone
      const checkRes = await app.request(`/v1/subdomains/${name}`);
      expect(checkRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent subdomain', async () => {
      const res = await app.request('/v1/subdomains/nonexistent', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('Statistics', () => {
    it('should include subdomain count in stats', async () => {
      await app.request(`/v1/subdomains/${uniqueId('site1')}`, { method: 'POST' });
      await app.request(`/v1/subdomains/${uniqueId('site2')}`, { method: 'POST' });
      
      const res = await app.request('/v1/stats');
      expect(res.status).toBe(200);
      const body = await res.json() as { subdomains: number };
      expect(body.subdomains).toBeGreaterThanOrEqual(2);
    });
  });
});