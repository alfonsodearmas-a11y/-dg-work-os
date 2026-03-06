import nodemailer from 'nodemailer';

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

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('[sendEmail] GMAIL_USER or GMAIL_APP_PASSWORD is not set');
    return { success: false, error: 'Mailer not configured' };
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: FROM,
      to: Array.isArray(to) ? to.join(',') : to,
      subject,
      html,
      text: text ?? undefined,
    });
    return { success: true };
  } catch (err: any) {
    console.error('[sendEmail] Failed:', err.message);
    return { success: false, error: err.message };
  }
}
