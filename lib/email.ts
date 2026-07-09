import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

const FROM = '"DG Work OS — MPUA" <notifications@mpua.gov.gy>';

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

/**
 * Structured, non-throwing result: `sent` is the delivery-attempt truth callers
 * MUST consume (invite routes surface it as a warning to the operator instead
 * of silently reporting success).
 */
export interface SendEmailResult {
  success: boolean;
  sent: boolean;
  error?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments,
  replyTo,
}: SendEmailParams): Promise<SendEmailResult> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    logger.error({}, 'sendEmail: GMAIL_USER or GMAIL_APP_PASSWORD is not set');
    return { success: false, sent: false, error: 'Mailer not configured' };
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: FROM,
      to: Array.isArray(to) ? to.join(',') : to,
      subject,
      html,
      text: text ?? undefined,
      attachments: attachments ?? undefined,
      replyTo: replyTo ?? undefined,
    });
    return { success: true, sent: true };
  } catch (err: any) {
    logger.error({ err }, 'sendEmail: failed');
    return { success: false, sent: false, error: err.message };
  }
}
