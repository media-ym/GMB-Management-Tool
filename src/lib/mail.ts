import nodemailer from "nodemailer";
import { getSmtpConfig, type SmtpConfig } from "@/lib/app-settings";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Override saved SMTP (e.g. unsaved form values during test). Password falls back to saved. */
  smtpOverride?: Partial<SmtpConfig>;
};

function buildTransport(cfg: SmtpConfig) {
  const host = (cfg.host || "").trim();
  const port = Number(cfg.port) || 587;
  const encryption = String(cfg.encryption || "TLS").toUpperCase();
  if (!host) throw new Error("SMTP host is not configured");
  if (!cfg.username || !cfg.password) {
    throw new Error("SMTP username/password are required");
  }

  const secure = encryption === "SSL" || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: cfg.username,
      pass: cfg.password,
    },
    requireTLS: encryption === "TLS" && !secure,
  });
}

export async function resolveSmtpConfig(override?: Partial<SmtpConfig>): Promise<SmtpConfig> {
  const saved = await getSmtpConfig();
  return {
    ...saved,
    ...override,
    // Never blank out saved password if UI sent empty (masked)
    password:
      override?.password && String(override.password).trim()
        ? override.password
        : saved.password,
  };
}

export async function verifySmtp(override?: Partial<SmtpConfig>): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await resolveSmtpConfig(override);
    const transport = buildTransport(cfg);
    await transport.verify();
    return { ok: true, message: `Connected to ${cfg.host}:${cfg.port}` };
  } catch (e: any) {
    return { ok: false, message: e?.message || "SMTP verification failed" };
  }
}

export async function sendMail(input: SendMailInput): Promise<{ messageId: string; from: string }> {
  const cfg = await resolveSmtpConfig(input.smtpOverride);
  const transport = buildTransport(cfg);
  const fromName = cfg.senderName || "MyFNG";
  const fromEmail = cfg.senderEmail || cfg.username || "noreply@myfng.in";
  const from = `"${fromName}" <${fromEmail}>`;

  const info = await transport.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html || `<pre style="font-family:sans-serif">${input.text}</pre>`,
  });

  return { messageId: info.messageId || "", from };
}

export function isSmtpConfigured(cfg?: SmtpConfig | null): boolean {
  const c = cfg;
  return !!(c?.host && c?.username && c?.password);
}
