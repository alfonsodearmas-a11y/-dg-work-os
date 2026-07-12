import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string equality for secrets (upload access codes, BRIDGE_TOKEN).
 * A length mismatch burns a dummy compare so the early exit doesn't leak length
 * timing. Extracted from app/api/upload/auth so every secret-comparison surface
 * shares one implementation.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, Buffer.alloc(bufA.length));
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
