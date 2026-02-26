import { Hono } from 'hono';
import { getPageCount } from '../storage/db.js';

const stats = new Hono();

// GET /v1/stats - Get site statistics
stats.get('/', (c) => {
  const pageCount = getPageCount();
  
  return c.json({
    pages: pageCount,
  });
});

export { stats };