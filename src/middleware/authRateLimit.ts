import { config } from '../config.js';

interface AuthAttemptRecord {
  attempts: number;
  firstAttempt: number;
  lockedUntil?: number;
}

// Track failed auth attempts per page ID
const authAttempts = new Map<string, AuthAttemptRecord>();

/**
 * Check if a page is currently locked due to too many failed attempts
 * Returns { allowed: true } or { allowed: false, retryAfter: seconds }
 */
export function checkAuthRateLimit(pageId: string): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const record = authAttempts.get(pageId);

  if (!record) {
    return { allowed: true };
  }

  // Check if locked
  if (record.lockedUntil && record.lockedUntil > now) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Check if window has expired - reset if so
  if (now - record.firstAttempt > config.auth.failedAttemptWindowMs) {
    authAttempts.delete(pageId);
    return { allowed: true };
  }

  return { allowed: true };
}

/**
 * Record a failed authentication attempt
 * May trigger a lockout if max attempts exceeded
 */
export function recordFailedAttempt(pageId: string): void {
  const now = Date.now();
  const record = authAttempts.get(pageId);

  if (!record || now - record.firstAttempt > config.auth.failedAttemptWindowMs) {
    // Start new window
    authAttempts.set(pageId, {
      attempts: 1,
      firstAttempt: now,
    });
    return;
  }

  // Increment attempts
  record.attempts++;

  // Check if should lock
  if (record.attempts >= config.auth.maxFailedAttempts) {
    record.lockedUntil = now + config.auth.lockoutDurationMs;
  }
}

/**
 * Reset attempts for a page (call on successful auth)
 */
export function resetAuthAttempts(pageId: string): void {
  authAttempts.delete(pageId);
}

/**
 * Cleanup expired entries periodically
 */
function cleanup(): void {
  const now = Date.now();
  for (const [pageId, record] of authAttempts.entries()) {
    // Remove if window expired and not locked
    const windowExpired = now - record.firstAttempt > config.auth.failedAttemptWindowMs;
    const lockExpired = !record.lockedUntil || record.lockedUntil <= now;
    
    if (windowExpired && lockExpired) {
      authAttempts.delete(pageId);
    }
  }
}

// Run cleanup every 60 seconds
setInterval(cleanup, 60000);
