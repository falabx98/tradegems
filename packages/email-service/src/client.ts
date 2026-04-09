import { Resend } from 'resend'
import type { EmailService, SendEmailOptions, EmailResult } from './types.js'

const DEFAULT_FROM = process.env.EMAIL_FROM || 'noreply@tradegems.gg'
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@tradegems.gg'

function redactEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  const visible = local.slice(0, 3)
  return `${visible}***@${domain}`
}

// ---------------------------------------------------------------------------
// Mock client — logs to console, never sends
// ---------------------------------------------------------------------------
class MockEmailService implements EmailService {
  async sendEmail(opts: SendEmailOptions): Promise<EmailResult> {
    const to = redactEmail(opts.to)
    const ts = new Date().toISOString()
    console.log(`[EmailService] ${ts} | MOCKED | to=${to} | subject="${opts.subject}"`)
    return { status: 'mocked' }
  }
}

// ---------------------------------------------------------------------------
// Real client — sends via Resend SDK
// ---------------------------------------------------------------------------
class RealEmailService implements EmailService {
  private resend: Resend

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey)
  }

  async sendEmail(opts: SendEmailOptions): Promise<EmailResult> {
    const to = redactEmail(opts.to)
    const ts = new Date().toISOString()
    try {
      const { data, error } = await this.resend.emails.send({
        from: opts.from || DEFAULT_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        replyTo: opts.replyTo || DEFAULT_REPLY_TO,
      })

      if (error) {
        console.error(`[EmailService] ${ts} | FAILED | to=${to} | subject="${opts.subject}" | error=${error.message}`)
        return { status: 'failed', error: error.message }
      }

      const resendId = data?.id || undefined
      console.log(`[EmailService] ${ts} | SENT | to=${to} | subject="${opts.subject}" | resendId=${resendId}`)
      return { status: 'sent', resendId }
    } catch (err: any) {
      const message = err?.message || String(err)
      console.error(`[EmailService] ${ts} | FAILED | to=${to} | subject="${opts.subject}" | error=${message}`)
      return { status: 'failed', error: message }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
let _instance: EmailService | undefined

export function createEmailService(): EmailService {
  if (_instance) return _instance

  const apiKey = process.env.RESEND_API_KEY
  const devMode = process.env.EMAIL_DEV_MODE === 'true'

  if (!apiKey || devMode) {
    const reason = !apiKey ? 'no RESEND_API_KEY' : 'EMAIL_DEV_MODE=true'
    console.log(`[EmailService] Initialized in MOCK mode (${reason})`)
    _instance = new MockEmailService()
  } else {
    console.log('[EmailService] Initialized in RESEND mode')
    _instance = new RealEmailService(apiKey)
  }

  return _instance
}

/**
 * Reset the singleton — only useful for testing.
 */
export function resetEmailService(): void {
  _instance = undefined
}
