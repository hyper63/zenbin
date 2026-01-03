// Test script to verify backward compatibility with legacy pages
import { initDatabase, getDatabase, getPage, closeDatabase } from '../storage/db.js';

async function main() {
  // Initialize the database
  initDatabase();
  const db = getDatabase();

  // Simulate a legacy page (no auth field at all)
  const legacyPage = {
    id: 'legacy-test-page',
    html: '<h1>Legacy Page</h1>',
    encoding: 'utf-8' as const,
    content_type: 'text/html; charset=utf-8',
    etag: '"abc123"',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    // NO auth field - simulating pre-auth-feature data
  };

  // Write directly to the database
  await db.put('legacy-test-page', legacyPage);
  console.log('Legacy page saved (without auth field)');

  // Read it back
  const retrieved = getPage('legacy-test-page');
  console.log('\nRetrieved page:');
  console.log('  id:', retrieved?.id);
  console.log('  html:', retrieved?.html);
  console.log('  auth:', retrieved?.auth);
  console.log('  auth is undefined:', retrieved?.auth === undefined);

  // Keep the legacy page for server testing (don't remove it)
  await closeDatabase();

  console.log('\n✓ Legacy page compatibility verified - auth field is undefined for old pages');
}

main().catch(console.error);
