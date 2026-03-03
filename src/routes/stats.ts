import { Hono } from 'hono';
import { getPageCount, getSubdomainCount } from '../storage/db.js';

const stats = new Hono();

// GET /v1/stats - Get site statistics
stats.get('/', (c) => {
  const pageCount = getPageCount();
  const subdomainCount = getSubdomainCount();
  
  return c.json({
    pages: pageCount,
    subdomains: subdomainCount,
  });
});

export { stats };