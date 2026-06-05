import { sendEmail } from './email';

// Branded auth emails (password reset, magic link) sent through the existing
// Gmail SMTP pipeline (lib/email.ts) — Option B of the role-simplification plan:
// we generate Supabase action links server-side (auth.admin.generateLink) and
// deliver them ourselves; Supabase's built-in email is never used.

/** Same base-URL derivation as lib/invite-email.ts. */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : '')
  );
}

function authEmailShell(body: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a1628; border: 1px solid #2d3a52; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1a2744, #0f1d32); padding: 32px 28px 24px; text-align: center;">
        <h1 style="color: #d4af37; font-size: 20px; margin: 0 0 4px;">DG Work OS</h1>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Ministry of Public Utilities &amp; Aviation</p>
      </div>
      <div style="padding: 28px;">
        ${body}
      </div>
    </div>
  `;
}

export async function sendPasswordResetEmail({ to, name, resetUrl }: { to: string; name: string; resetUrl: string }) {
  const html = authEmailShell(`
        <p style="color: #e2e8f0; font-size: 15px; margin: 0 0 16px;">Hello ${name},</p>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          We received a request to reset the password for your <strong style="color: #e2e8f0;">DG Work OS</strong> account.
          Click the button below to choose a new password.
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background: #d4af37; color: #0a1628; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 8px;">
            Reset Your Password
          </a>
        </div>
        <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0; border-top: 1px solid #2d3a52; padding-top: 16px;">
          This link expires in 1 hour and can be used once. If you didn't request a reset, you can safely ignore this email — your password is unchanged.
        </p>
  `);

  const text = `Hello ${name},\n\nWe received a request to reset your DG Work OS password.\n\nReset it here: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email — your password is unchanged.`;

  return sendEmail({ to, subject: 'Reset your DG Work OS password', html, text });
}

export async function sendMagicLinkEmail({ to, name, magicUrl }: { to: string; name: string; magicUrl: string }) {
  const html = authEmailShell(`
        <p style="color: #e2e8f0; font-size: 15px; margin: 0 0 16px;">Hello ${name},</p>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Use the button below to sign in to <strong style="color: #e2e8f0;">DG Work OS</strong> — no password needed.
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <a href="${magicUrl}" style="display: inline-block; padding: 12px 32px; background: #d4af37; color: #0a1628; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 8px;">
            Sign In to DG Work OS
          </a>
        </div>
        <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0; border-top: 1px solid #2d3a52; padding-top: 16px;">
          This link expires in 1 hour and can be used once. If you didn't request it, you can safely ignore this email.
        </p>
  `);

  const text = `Hello ${name},\n\nSign in to DG Work OS here (no password needed): ${magicUrl}\n\nThis link expires in 1 hour and can be used once. If you didn't request it, ignore this email.`;

  return sendEmail({ to, subject: 'Your DG Work OS sign-in link', html, text });
}
