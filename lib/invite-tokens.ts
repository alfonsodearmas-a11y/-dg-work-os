import crypto from 'crypto';
import { query } from './db-pg';

export function generateToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function createInviteToken(
  userId: string,
  type: 'invite' | 'password_reset',
  expiryHours: number
): Promise<string> {
  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  await query(
    `INSERT INTO invite_tokens (user_id, token_hash, type, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hash, type, expiresAt]
  );

  return raw;
}

interface TokenVerifyResult {
  token: { id: string; user_id: string; type: string; expires_at: string; consumed_at: string | null };
  user: { id: string; full_name: string; email: string; role: string; agency: string; status: string };
}

export async function verifyToken(
  rawToken: string
): Promise<{ ok: true; data: TokenVerifyResult } | { ok: false; reason: 'invalid' | 'expired' | 'consumed' }> {
  const hash = hashToken(rawToken);

  const result = await query(
    `SELECT t.id, t.user_id, t.type, t.expires_at, t.consumed_at,
            u.full_name, u.email, u.role, u.agency, u.status
     FROM invite_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1`,
    [hash]
  );

  if (result.rows.length === 0) {
    return { ok: false, reason: 'invalid' };
  }

  const row = result.rows[0];

  if (row.consumed_at) {
    return { ok: false, reason: 'consumed' };
  }

  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    data: {
      token: { id: row.id, user_id: row.user_id, type: row.type, expires_at: row.expires_at, consumed_at: row.consumed_at },
      user: { id: row.user_id, full_name: row.full_name, email: row.email, role: row.role, agency: row.agency, status: row.status },
    },
  };
}

export async function consumeToken(tokenId: string): Promise<void> {
  await query('UPDATE invite_tokens SET consumed_at = NOW() WHERE id = $1', [tokenId]);
}

export async function revokeUserTokens(userId: string, type?: 'invite' | 'password_reset'): Promise<void> {
  if (type) {
    await query(
      'UPDATE invite_tokens SET consumed_at = NOW() WHERE user_id = $1 AND type = $2 AND consumed_at IS NULL',
      [userId, type]
    );
  } else {
    await query(
      'UPDATE invite_tokens SET consumed_at = NOW() WHERE user_id = $1 AND consumed_at IS NULL',
      [userId]
    );
  }
}
