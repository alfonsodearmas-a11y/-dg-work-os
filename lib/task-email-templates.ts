const HEADER = `
<div style="background: linear-gradient(135deg, #0a1628, #1a2744); padding: 20px; text-align: center; border-bottom: 3px solid #d4af37;">
  <h1 style="color: #d4af37; margin: 0; font-size: 20px; letter-spacing: 1px;">DG Work OS</h1>
  <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 12px;">Ministry of Public Utilities & Aviation</p>
</div>`;

const FOOTER = `
<div style="background: #0a1628; padding: 16px; text-align: center;">
  <p style="color: #64748b; margin: 0; font-size: 11px;">Ministry of Public Utilities and Aviation — Government of Guyana</p>
</div>`;

function wrap(body: string) {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border-radius: 8px; overflow: hidden; border: 1px solid #2d3a52;">${HEADER}<div style="padding: 24px; background: #f8fafc;">${body}</div>${FOOTER}</div>`;
}

function taskCard(task: { title: string; agency: string; due_date?: string | null; priority?: string }) {
  return `
  <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <h3 style="margin: 0 0 8px; color: #1e293b;">${task.title}</h3>
    <table style="width: 100%; font-size: 13px; color: #475569;">
      <tr><td style="padding: 4px 0; width: 80px;">Agency</td><td style="font-weight: 600;">${task.agency.toUpperCase()}</td></tr>
      ${task.due_date ? `<tr><td style="padding: 4px 0;">Due</td><td>${task.due_date}</td></tr>` : ''}
      ${task.priority ? `<tr><td style="padding: 4px 0;">Priority</td><td>${task.priority}</td></tr>` : ''}
    </table>
  </div>`;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

export function taskAssignedEmail(userName: string, task: { id: string; title: string; agency: string; due_date?: string | null; priority?: string }) {
  return {
    subject: `New Task Assigned: ${task.title}`,
    html: wrap(`
      <h2 style="color: #1e293b; margin-top: 0;">Hello ${userName},</h2>
      <p style="color: #475569;">The Director General has assigned you a new task:</p>
      ${taskCard(task)}
      <a href="${BASE_URL}/dashboard/tasks/${task.id}" style="display: inline-block; background: #d4af37; color: #0a1628; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">View Task</a>
    `),
  };
}

export function taskOverdueEmail(userName: string, task: { id: string; title: string; agency: string; due_date?: string | null }) {
  return {
    subject: `OVERDUE: ${task.title}`,
    html: wrap(`
      <h2 style="color: #1e293b; margin-top: 0;">Hello ${userName},</h2>
      <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 12px 0;">
        <p style="margin: 0; color: #991b1b; font-weight: 600;">This task is now overdue.</p>
      </div>
      ${taskCard(task)}
      <a href="${BASE_URL}/dashboard/tasks/${task.id}" style="display: inline-block; background: #dc2626; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">Take Action</a>
    `),
  };
}

export function taskRejectedEmail(userName: string, task: { id: string; title: string; agency: string }, reason?: string) {
  return {
    subject: `Task Returned: ${task.title}`,
    html: wrap(`
      <h2 style="color: #1e293b; margin-top: 0;">Hello ${userName},</h2>
      <p style="color: #475569;">The Director General has returned the following task for revision:</p>
      ${taskCard(task)}
      ${reason ? `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 12px 0;"><p style="margin: 0; color: #92400e;"><strong>Reason:</strong> ${reason}</p></div>` : ''}
      <a href="${BASE_URL}/dashboard/tasks/${task.id}" style="display: inline-block; background: #d4af37; color: #0a1628; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">Resume Work</a>
    `),
  };
}

export function taskSubmittedEmail(dgName: string, task: { id: string; title: string; agency: string }, submitterName: string) {
  return {
    subject: `Task Submitted for Review: ${task.title}`,
    html: wrap(`
      <h2 style="color: #1e293b; margin-top: 0;">Hello ${dgName},</h2>
      <p style="color: #475569;"><strong>${submitterName}</strong> has submitted a task for your review:</p>
      ${taskCard(task)}
      <a href="${BASE_URL}/admin/tasks/${task.id}" style="display: inline-block; background: #059669; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">Review Task</a>
    `),
  };
}

export function extensionRequestedEmail(dgName: string, task: { id: string; title: string; agency: string }, requesterName: string, requestedDate: string, reason: string) {
  return {
    subject: `Extension Requested: ${task.title}`,
    html: wrap(`
      <h2 style="color: #1e293b; margin-top: 0;">Hello ${dgName},</h2>
      <p style="color: #475569;"><strong>${requesterName}</strong> has requested a deadline extension:</p>
      ${taskCard(task)}
      <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin: 12px 0;">
        <p style="margin: 0 0 4px; color: #1e40af;"><strong>New requested date:</strong> ${requestedDate}</p>
        <p style="margin: 0; color: #1e40af;"><strong>Reason:</strong> ${reason}</p>
      </div>
      <a href="${BASE_URL}/admin/tasks/${task.id}" style="display: inline-block; background: #d4af37; color: #0a1628; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">Review Request</a>
    `),
  };
}

export function commentAddedEmail(userName: string, task: { id: string; title: string }, commenterName: string, commentPreview: string, viewPath: string) {
  return {
    subject: `New Comment on: ${task.title}`,
    html: wrap(`
      <h2 style="color: #1e293b; margin-top: 0;">Hello ${userName},</h2>
      <p style="color: #475569;"><strong>${commenterName}</strong> commented on a task:</p>
      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="margin: 0 0 8px; color: #1e293b;">${task.title}</h3>
        <p style="color: #475569; margin: 0; font-style: italic;">"${commentPreview}"</p>
      </div>
      <a href="${BASE_URL}${viewPath}" style="display: inline-block; background: #d4af37; color: #0a1628; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">View Comment</a>
    `),
  };
}

export function taskReminderEmail(userName: string, task: { id: string; title: string; agency: string; due_date?: string | null }) {
  return {
    subject: `Reminder: ${task.title} due soon`,
    html: wrap(`
      <h2 style="color: #1e293b; margin-top: 0;">Hello ${userName},</h2>
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 12px 0;">
        <p style="margin: 0; color: #92400e; font-weight: 600;">This task is due within 48 hours.</p>
      </div>
      ${taskCard(task)}
      <a href="${BASE_URL}/dashboard/tasks/${task.id}" style="display: inline-block; background: #d4af37; color: #0a1628; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">View Task</a>
    `),
  };
}

export function userInviteEmail(userName: string, tempPassword: string) {
  return {
    subject: 'You\'ve been invited to DG Work OS',
    html: wrap(`
      <h2 style="color: #1e293b; margin-top: 0;">Welcome, ${userName}!</h2>
      <p style="color: #475569;">You've been invited to the Director General's Work OS. Use the credentials below to sign in:</p>
      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0; color: #475569;">Temporary password: <code style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${tempPassword}</code></p>
      </div>
      <p style="color: #475569;">You will be asked to change your password on first login.</p>
      <a href="${BASE_URL}/login?mode=user" style="display: inline-block; background: #d4af37; color: #0a1628; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">Sign In</a>
    `),
  };
}
