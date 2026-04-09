# @tradingarena/email-service

Email service for TradeGems with Resend integration and mock mode.

## Usage

```ts
import { createEmailService, welcomeEmail } from '@tradingarena/email-service'

const emailService = createEmailService()

// Send a welcome email
const { subject, html } = welcomeEmail({ username: 'Player1' })
const result = await emailService.sendEmail({ to: 'user@example.com', subject, html })
// result: { status: 'sent' | 'failed' | 'mocked', resendId?: string, error?: string }
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | No | — | Resend API key. Without it, mock mode is used. |
| `EMAIL_FROM` | No | `noreply@tradegems.gg` | Default sender address. |
| `EMAIL_REPLY_TO` | No | `support@tradegems.gg` | Default reply-to address. |
| `EMAIL_DEV_MODE` | No | `false` | Set to `true` to force mock mode even with an API key. |

## Mock Mode

When `RESEND_API_KEY` is not set or `EMAIL_DEV_MODE=true`, the service logs
email attempts to console without actually sending. All calls return
`{ status: 'mocked' }`.
