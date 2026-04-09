export interface BaseLayoutOptions {
  title: string
  body: string
}

export function baseLayout(opts: BaseLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#13131d;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 16px 32px;text-align:center;border-bottom:1px solid #1e1e2e;">
              <span style="font-size:28px;font-weight:800;letter-spacing:2px;background:linear-gradient(135deg,#6366f1,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">TRADEGEMS</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#e2e2ef;font-size:15px;line-height:1.6;">
              ${opts.body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;text-align:center;border-top:1px solid #1e1e2e;color:#6b6b80;font-size:12px;line-height:1.5;">
              <p style="margin:0 0 8px 0;">
                <a href="https://tradegems.gg" style="color:#a855f7;text-decoration:none;">tradegems.gg</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:support@tradegems.gg" style="color:#a855f7;text-decoration:none;">Soporte</a>
              </p>
              <p style="margin:0 0 8px 0;">
                &copy; ${new Date().getFullYear()} TradeGems. Todos los derechos reservados.
              </p>
              <p style="margin:0;font-size:11px;color:#4a4a5c;">
                Si no deseas recibir estos emails, escribe a
                <a href="mailto:support@tradegems.gg?subject=Unsubscribe" style="color:#6b6b80;text-decoration:underline;">support@tradegems.gg</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
