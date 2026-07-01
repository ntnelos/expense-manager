import { createHash } from 'crypto';

/**
 * Generates a SHA-256 hash of a Buffer.
 * Useful for verifying document duplicates.
 */
export function generateSHA256Hash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Helper to get a short hash (e.g. first 8 characters).
 */
export function getShortHash(hash: string): string {
  return hash.substring(0, 8);
}
