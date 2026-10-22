import { Resend } from 'resend'
import { env } from '../config/env'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

async function send(to: string, subject: string, text: string, html: string) {
  if (!resend) {
    console.log(`[mailer:stub] to=${to} subject="${subject}"\n${text}`)
    return
  }
  await resend.emails.send({ from: env.RESEND_FROM, to, subject, text, html })
}

export async function sendPasswordResetEmail(to: string, resetLink: string) {
  const subject = 'Reset your VeriSkill password'
  const text =
    `We received a request to reset your VeriSkill password.\n\n` +
    `Open this link to pick a new one (expires in 1 hour):\n${resetLink}\n\n` +
    `If you didn't ask for this, you can ignore this email.`
  const html =
    `<p>We received a request to reset your VeriSkill password.</p>` +
    `<p><a href="${resetLink}">Reset your password</a> (expires in 1 hour).</p>` +
    `<p>If you didn't ask for this, you can ignore this email.</p>`
  await send(to, subject, text, html)
}
