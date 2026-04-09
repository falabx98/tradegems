export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
  metadata?: Record<string, any>
}

export interface EmailResult {
  status: 'sent' | 'failed' | 'mocked'
  resendId?: string
  error?: string
}

export interface EmailService {
  sendEmail(opts: SendEmailOptions): Promise<EmailResult>
}
