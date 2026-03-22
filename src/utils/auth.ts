import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { config } from '../config.js';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.auth.bcryptRounds);
}

/**
 * Verify a password against a bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a URL token and its hash
 * Returns the plain token (to return to user) and hash (to store)
 */
export function generateUrlToken(): { token: string; hash: string } {
  const token = randomBytes(config.auth.tokenLength).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

/**
 * Verify a URL token against a stored hash
 * Uses timing-safe comparison to prevent timing attacks
 */
export function verifyUrlToken(token: string, hash: string): boolean {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(tokenHash, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Parse HTTP Basic Auth header
 * Returns null if header is missing or invalid
 */
export function parseBasicAuth(header: string | undefined): { username: string; password: string } | null {
  if (!header || !header.startsWith('Basic ')) {
    return null;
  }

  try {
    const base64 = header.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const colonIndex = decoded.indexOf(':');
    
    if (colonIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, colonIndex),
      password: decoded.slice(colonIndex + 1),
    };
  } catch {
    return null;
  }
}
