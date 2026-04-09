import { baseLayout } from './base.js'

export interface WelcomeEmailOptions {
  username: string
}

export function welcomeEmail(opts: WelcomeEmailOptions): {
  subject: string
  html: string
} {
  const body = `
    <h1 style="margin:0 0 16px 0;font-size:22px;color:#ffffff;">
      Hola ${escapeHtml(opts.username)}, bienvenido a TradeGems
    </h1>

    <p style="margin:0 0 16px 0;color:#c4c4d6;">
      Tu cuenta ha sido creada exitosamente. TradeGems es la arena PvP donde
      puedes competir en tiempo real con otros jugadores y poner a prueba tu
      estrategia.
    </p>

    <p style="margin:0 0 16px 0;color:#c4c4d6;">
      Explora nuestros 6 modos de juego:
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;width:100%;">
      ${gameRow('Rug Pull', 'Apuesta si el token va a hacer rug o sobrevive.')}
      ${gameRow('Mines', 'Descubre gemas, esquiva minas. Cada click multiplica.')}
      ${gameRow('Predictions', 'Predice el precio de SOL contra otros traders.')}
      ${gameRow('Solo', 'Ronda rapida de apuesta 1v1 contra la casa.')}
      ${gameRow('Candleflip', 'Apuesta en velas verdes o rojas en rondas veloces.')}
      ${gameRow('Battle', 'Torneos PvP de trading simulado. El mejor trader gana.')}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
      <tr>
        <td style="background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:8px;">
          <a href="https://tradegems.gg" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">
            Entrar a TradeGems
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#6b6b80;">
      Si no creaste esta cuenta, puedes ignorar este email.
    </p>
  `

  return {
    subject: '\uD83C\uDFB0 Bienvenido a TradeGems',
    html: baseLayout({ title: 'Bienvenido a TradeGems', body }),
  }
}

function gameRow(name: string, desc: string): string {
  return `
    <tr>
      <td style="padding:6px 0;color:#ffffff;font-weight:600;font-size:14px;width:110px;vertical-align:top;">
        ${name}
      </td>
      <td style="padding:6px 0 6px 8px;color:#9a9ab0;font-size:13px;vertical-align:top;">
        ${desc}
      </td>
    </tr>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
