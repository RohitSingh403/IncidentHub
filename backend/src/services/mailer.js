import nodemailer from 'nodemailer';
import { getEnv } from '../config/env.js';

export async function sendConfiguredEmail({ to, subject, text }) {
  const smtpUrl = getEnv().smtpUrl;
  if (!smtpUrl) return { status: 'skipped', error: 'SMTP is not configured' };
  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from: getEnv().smtpFrom || 'IncidentHub <noreply@localhost>',
      to,
      subject,
      text,
    });
    return { status: 'sent', error: null };
  } catch (error) {
    return { status: 'failed', error: error.message };
  }
}
