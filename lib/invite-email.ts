import { sendEmail } from './email';
import { ROLE_LABELS } from './people-types';
import { normalizeRole } from './auth-session';

interface SendInviteParams {
  to: string;
  name: string;
  role: string;
  agency: string | null;
  inviterName: string;
  /** If provided, email includes a "Set Your Password" link. Otherwise, Google sign-in only. */
  inviteToken: string | null;
}

export async function sendInviteEmail({ to, name, role, agency, inviterName, inviteToken }: SendInviteParams) {
  // Canonical origin for emailed links: NEXT_PUBLIC_SITE_URL. The legacy chain
  // stays as fallback so invites keep working until the env var lands in Vercel
  // (NEXTAUTH_URL predates the Supabase Auth cutover and should be retired).
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || process.env.NEXTAUTH_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  const loginUrl = `${baseUrl}/login`;
  // `role` may be a raw stored value (legacy names until Phase 3) — normalize for the label.
  const normalized = normalizeRole(role);
  const roleLabel = (normalized && ROLE_LABELS[normalized]) || role;
  const agencyLabel = agency ? ` (${agency.toUpperCase()})` : '';

  const setPasswordUrl = inviteToken ? `${baseUrl}/set-password?token=${inviteToken}` : null;

  // Google sign-in is disabled in production (password-only) — the email must
  // not advertise it.
  const ctaSection = setPasswordUrl
    ? `
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Set up your password to get started.
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <a href="${setPasswordUrl}" style="display: inline-block; padding: 12px 32px; background: #d4af37; color: #0a1628; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 8px;">
            Set Your Password
          </a>
        </div>`
    : `
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Sign in to get started.
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 32px; background: #d4af37; color: #0a1628; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 8px;">
            Sign In to DG Work OS
          </a>
        </div>`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a1628; border: 1px solid #2d3a52; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1a2744, #0f1d32); padding: 32px 28px 24px; text-align: center;">
        <h1 style="color: #d4af37; font-size: 20px; margin: 0 0 4px;">DG Work OS</h1>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Ministry of Public Utilities &amp; Aviation</p>
      </div>
      <div style="padding: 28px;">
        <p style="color: #e2e8f0; font-size: 15px; margin: 0 0 16px;">Hello ${name},</p>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          ${inviterName} has invited you to join <strong style="color: #e2e8f0;">DG Work OS</strong> as
          <strong style="color: #d4af37;">${roleLabel}${agencyLabel}</strong>.
        </p>
        ${ctaSection}
        <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0; border-top: 1px solid #2d3a52; padding-top: 16px;">
          ${setPasswordUrl ? 'This link expires in 7 days. ' : ''}If you did not expect this invite, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  const textCta = setPasswordUrl
    ? `Set your password at: ${setPasswordUrl}`
    : `Sign in at: ${loginUrl}`;

  const text = `Hello ${name},\n\n${inviterName} has invited you to DG Work OS as ${roleLabel}${agencyLabel}.\n\n${textCta}`;

  return sendEmail({
    to,
    subject: `You're invited to DG Work OS — ${roleLabel}`,
    html,
    text,
  });
}
