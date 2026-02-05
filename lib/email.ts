import nodemailer from 'nodemailer';

const AGENCY_NAMES: Record<string, string> = {
  cjia: 'CJIA - Cheddi Jagan International Airport',
  gwi: 'GWI - Guyana Water Inc.',
  gpl: 'GPL - Guyana Power & Light',
  gcaa: 'GCAA - Guyana Civil Aviation Authority',
};

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mail.me.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_APP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  });
}

interface UserData {
  fullName: string;
  email: string;
  username: string;
  agency: string;
}

export const emailService = {
  async sendRegistrationNotification(userData: UserData) {
    const transporter = createTransporter();
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: 'alfonso.dearmas@mpua.gov.gy',
      subject: 'New Account Registration Pending Approval - MPUA Dashboard',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0d9488, #06b6d4); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">MPUA Dashboard</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">New Account Registration</p>
          </div>
          <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e293b; margin-top: 0;">New Registration Requires Approval</h2>
            <p style="color: #475569;">A new user has registered for the Ministry Dashboard and requires your approval:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 140px;">Full Name</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 600;">${userData.fullName}</td></tr>
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Email</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${userData.email}</td></tr>
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Username</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${userData.username}</td></tr>
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Agency</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${AGENCY_NAMES[userData.agency] || userData.agency}</td></tr>
              <tr><td style="padding: 12px; color: #64748b;">Registration Date</td><td style="padding: 12px; color: #1e293b;">${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</td></tr>
            </table>
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;"><strong>Action Required:</strong> Please log in to the Admin Portal to approve or reject this registration request.</p>
            </div>
          </div>
          <div style="background: #1e293b; padding: 20px; text-align: center;">
            <p style="color: #94a3b8; margin: 0; font-size: 12px;">Ministry of Public Utilities and Aviation - Government of Guyana</p>
          </div>
        </div>
      `,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('[email] Registration notification sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error('[email] Failed to send registration notification:', error.message);
      return { success: false, error: error.message };
    }
  },

  async sendApprovalNotification(userData: UserData, approved: boolean) {
    const transporter = createTransporter();
    const subject = approved ? 'Your MPUA Dashboard Account Has Been Approved' : 'Your MPUA Dashboard Account Registration';
    const statusMessage = approved
      ? '<p style="color: #059669; font-weight: 600;">Your account has been approved! You can now log in to the dashboard.</p>'
      : '<p style="color: #dc2626; font-weight: 600;">Unfortunately, your account registration was not approved at this time.</p>';

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: userData.email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0d9488, #06b6d4); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">MPUA Dashboard</h1>
          </div>
          <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e293b; margin-top: 0;">Hello ${userData.fullName},</h2>
            ${statusMessage}
            ${approved ? '<p style="color: #475569;">You can access the dashboard at: <a href="https://dashboard.mpua.gov.gy">dashboard.mpua.gov.gy</a></p>' : ''}
          </div>
          <div style="background: #1e293b; padding: 20px; text-align: center;">
            <p style="color: #94a3b8; margin: 0; font-size: 12px;">Ministry of Public Utilities and Aviation - Government of Guyana</p>
          </div>
        </div>
      `,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('[email] Approval notification sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error('[email] Failed to send approval notification:', error.message);
      return { success: false, error: error.message };
    }
  },
};
