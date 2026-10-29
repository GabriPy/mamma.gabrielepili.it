import nodemailer from 'nodemailer';
import { config, smtpConfigured } from './config.js';
import { db } from './db.js';
import { italianDate, isoToLocalDateTime, todayLocal, diffDays } from './lib/time.js';

let transport = null;
let lastError = null;

function getTransport() {
  if (!smtpConfigured()) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      pool: true,
      maxConnections: 2,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

export function mailStatus() {
  return {
    configured: smtpConfigured(),
    host: config.smtp.host || null,
    from: config.smtp.from,
    lastError,
    recipients: db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE is_active = 1 AND email IS NOT NULL AND email <> ''")
      .get().n,
  };
}

export async function sendMail({ to, subject, html, text }) {
  const tx = getTransport();
  if (!tx) {
    const err = new Error('SMTP non configurato');
    err.code = 'smtp_not_configured';
    throw err;
  }
  try {
    const info = await tx.sendMail({
      from: config.smtp.from,
      to,
      replyTo: config.smtp.replyTo || undefined,
      subject,
      text,
      html,
    });
    lastError = null;
    return info;
  } catch (err) {
    lastError = err.message;
    throw err;
  }
}

const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const escLines = (value) => esc(value).replace(/\n/g, '<br>');

const TASK_LABELS = {
  acqua: 'Annaffiare',
  concime: 'Concimare',
  potatura: 'Potare',
  rinvaso: 'Rinvasare',
  controllo: 'Controllare',
};

export function buildReminderContent(entityType, entity, reminder) {
  const appLink = config.appUrl;
  let title;
  let subtitle;
  let detail = '';
  let path = '';
  let emoji = '🔔';

  if (entityType === 'deadline') {
    emoji = '📌';
    title = entity.title;
    const due = italianDate(entity.due_date, { weekday: true });
    const days = diffDays(todayLocal(), entity.due_date);
    const when = days === 0 ? 'oggi' : days === 1 ? 'domani' : days > 1 ? `fra ${days} giorni` : `${Math.abs(days)} giorni fa`;
    subtitle = `Scade ${due} (${when})`;
    detail = [entity.category ? `Categoria: ${esc(entity.category)}` : '', escLines(entity.notes || '')].filter(Boolean).join('<br>');
    path = '/scadenze';
  } else if (entityType === 'event') {
    emoji = '📅';
    title = entity.title;
    const local = isoToLocalDateTime(entity.starts_at);
    const date = italianDate((reminder && reminder.occurrence_at) || local.slice(0, 10), { weekday: true });
    subtitle = entity.all_day ? `${date} · tutto il giorno` : `${date} alle ${local.slice(11, 16)}`;
    detail = [entity.location ? `Dove: ${esc(entity.location)}` : '', escLines(entity.description || '')].filter(Boolean).join('<br>');
    path = '/calendario';
  } else {
    emoji = '🌿';
    title = `${TASK_LABELS[entity.task_type] || 'Cura'} · ${entity.plant_name}`;
    subtitle = `Prevista ${italianDate(entity.next_due_date, { weekday: true })}`;
    detail = [entity.location ? `Posizione: ${esc(entity.location)}` : '', escLines(entity.notes || '')].filter(Boolean).join('<br>');
    path = '/piante';
  }

  const subject = `${emoji} ${title}`;
  const text = [
    title,
    subtitle,
    detail ? detail.replaceAll('<br>', '\n') : '',
    '',
    `Apri Ghibiri Home: ${appLink}${path}`,
    '',
    'Puoi gestire i promemoria dalle impostazioni della casa.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F6F0E6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C2620;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F0E6;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #EADFCE;">
        <tr><td style="height:6px;background:#C4623F;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 30px 6px 30px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#2C2620;">Ghibiri Home</div>
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#A08F79;margin-top:4px;">Promemoria di casa</div>
        </td></tr>
        <tr><td style="padding:20px 30px 4px 30px;">
          <div style="font-size:30px;line-height:1;">${emoji}</div>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:24px;line-height:1.25;margin:12px 0 8px 0;color:#2C2620;">${esc(title)}</h1>
          <div style="font-size:15px;color:#8A6A4E;font-weight:600;">${esc(subtitle)}</div>
        </td></tr>
        ${detail ? `<tr><td style="padding:14px 30px 0 30px;font-size:14px;line-height:1.6;color:#5C5145;">${detail}</td></tr>` : ''}
        <tr><td style="padding:24px 30px 8px 30px;">
          <a href="${esc(appLink)}${path}" style="display:inline-block;background:#C4623F;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:13px 22px;border-radius:12px;">Apri Ghibiri Home</a>
        </td></tr>
        <tr><td style="padding:18px 30px 28px 30px;border-top:1px solid #F0E6D8;">
          <div style="font-size:12px;line-height:1.6;color:#9A8B79;">Ricevi questo promemoria perché fai parte della famiglia su Ghibiri Home.<br>
          <a href="${esc(appLink)}/impostazioni" style="color:#9A8B79;">Gestisci i promemoria</a></div>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#B3A492;margin-top:14px;">${esc(config.appUrl.replace(/^https?:\/\//, ''))}</div>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

export function reminderRecipients(entityType, entity) {
  let rows;
  if (entity && ['event', 'deadline'].includes(entityType) && entity.visibility === 'private') {
    rows = db
      .prepare("SELECT name, email FROM users WHERE id = ? AND is_active = 1 AND email IS NOT NULL AND email <> ''")
      .all(entity.created_by);
  } else {
    rows = db
      .prepare("SELECT name, email FROM users WHERE is_active = 1 AND email IS NOT NULL AND email <> ''")
      .all();
  }
  return rows.filter((r) => r.email && r.email.includes('@'));
}

export async function sendTestEmail(to) {
  const status = mailStatus();
  const recipients = status.recipients;
  const target = to || db.prepare('SELECT email FROM users WHERE is_active = 1 AND email IS NOT NULL LIMIT 1').get()?.email;
  if (!target) throw new Error('Nessun indirizzo email configurato. Aggiungi un’email a un membro della famiglia.');
  return sendMail({
    to: target,
    subject: '✉️ Prova promemoria · Ghibiri Home',
    text: `Se leggi questa email, i promemoria di Ghibiri Home funzionano.\n\nDestinatari configurati: ${recipients}.`,
    html: `<!doctype html><html lang="it"><body style="margin:0;background:#F6F0E6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C2620;padding:32px 16px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #EADFCE;border-radius:20px;padding:30px;">
        <div style="font-family:Georgia,serif;font-size:21px;">Ghibiri Home</div>
        <h1 style="font-family:Georgia,serif;font-size:24px;margin:18px 0 8px;">Le email funzionano 🌿</h1>
        <p style="font-size:15px;line-height:1.6;color:#5C5145;">Questa è una prova dei promemoria di casa. Se la vedi, siamo pronti: scadenze, eventi e piante arriveranno qui.</p>
        <p style="font-size:13px;color:#9A8B79;">Destinatari attivi: ${recipients}</p>
      </div>
    </body></html>`,
  });
}
