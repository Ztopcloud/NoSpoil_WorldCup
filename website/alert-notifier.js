const fs = require('fs');
const net = require('net');
const path = require('path');
const tls = require('tls');

function parseBoolean(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function loadAlertState(stateFile) {
  try {
    if (!fs.existsSync(stateFile)) {
      return { sent: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.sent ? parsed : { sent: {} };
  } catch (err) {
    return { sent: {} };
  }
}

function saveAlertState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function getEmailConfig(env = process.env) {
  const host = env.SMTP_HOST || '';
  const user = env.SMTP_USER || '';
  const pass = env.SMTP_PASS || '';
  const to = env.ALERT_EMAIL_TO || '';

  return {
    host,
    port: Number(env.SMTP_PORT || 587),
    secure: parseBoolean(env.SMTP_SECURE),
    auth: user && pass ? { user, pass } : null,
    from: env.SMTP_FROM || user,
    to
  };
}

function isEmailConfigured(config) {
  return Boolean(config.host && config.to && config.from);
}

function renderTextEmail(message) {
  const lines = [
    message.summary || message.subject || '',
    '',
    ...(message.sections || []).flatMap((section) => {
      const body = Array.isArray(section.lines) ? section.lines : [];
      return [`## ${section.title}`, ...body, ''];
    })
  ];

  return lines.filter((line, index, arr) => line || arr[index - 1]).join('\n').trim() + '\n';
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value || ''), 'utf8').toString('base64')}?=`;
}

function encodeBase64Line(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function smtpCommand(socket, command, expectedCodes) {
  socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  const code = Number(response.slice(0, 3));
  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP command failed (${command}): ${response.trim()}`);
  }
  return response;
}

async function createSmtpSocket(config) {
  const port = config.port || (config.secure ? 465 : 587);
  const socket = config.secure
    ? tls.connect({ host: config.host, port, servername: config.host })
    : net.connect({ host: config.host, port });
  socket.setTimeout(15000, () => socket.destroy(new Error('SMTP connection timed out')));

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });

  await smtpRead(socket);
  return socket;
}

async function sendMailWithBuiltinSmtp(config, message) {
  let socket = await createSmtpSocket(config);
  await smtpCommand(socket, `EHLO ${config.host}`, [250]);

  if (!config.secure && config.port !== 25) {
    await smtpCommand(socket, 'STARTTLS', [220]);
    socket = tls.connect({ socket, servername: config.host });
    await new Promise((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });
    await smtpCommand(socket, `EHLO ${config.host}`, [250]);
  }

  if (config.auth) {
    await smtpCommand(socket, 'AUTH LOGIN', [334]);
    await smtpCommand(socket, encodeBase64Line(config.auth.user), [334]);
    await smtpCommand(socket, encodeBase64Line(config.auth.pass), [235]);
  }

  const text = message.text || renderTextEmail(message);
  const body = [
    `From: ${config.from}`,
    `To: ${config.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text
  ].join('\r\n').replace(/\r?\n\./g, '\r\n..');

  await smtpCommand(socket, `MAIL FROM:<${config.from}>`, [250]);
  for (const recipient of String(config.to).split(',').map((item) => item.trim()).filter(Boolean)) {
    await smtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
  }
  await smtpCommand(socket, 'DATA', [354]);
  socket.write(`${body}\r\n.\r\n`);
  await smtpRead(socket);
  await smtpCommand(socket, 'QUIT', [221]);
}

async function sendMail(config, message) {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (err) {
    await sendMailWithBuiltinSmtp(config, message);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth || undefined
  });

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject: message.subject,
    text: message.text || renderTextEmail(message)
  });
}

function createAlertNotifier(options = {}) {
  const logger = typeof options.logger === 'function' ? options.logger : console.log;
  const stateFile = options.stateFile;
  const dryRun = Boolean(options.dryRun);
  const config = getEmailConfig(options.env || process.env);
  const state = stateFile ? loadAlertState(stateFile) : { sent: {} };

  async function notify(message) {
    const subject = message.subject || '[SCGS] 自动更新通知';

    if (dryRun) {
      logger(`  [dry-run] 将发送邮件: ${subject}`);
      logger(renderTextEmail({ ...message, subject }).trim());
      return { sent: false, dryRun: true };
    }

    if (!isEmailConfigured(config)) {
      logger(`  邮件未配置，跳过通知: ${subject}`);
      return { sent: false, skipped: 'not-configured' };
    }

    await sendMail(config, { ...message, subject });
    logger(`  已发送邮件通知: ${subject}`);
    return { sent: true };
  }

  async function notifyOnce(key, message) {
    if (!key) {
      return await notify(message);
    }

    const sentRecord = state.sent[key];
    if (sentRecord && sentRecord.to === config.to) {
      logger(`  已发送过告警，跳过: ${key}`);
      return { sent: false, skipped: 'deduped' };
    }
    if (sentRecord && sentRecord.to !== config.to) {
      logger(`  收件人已变化，重新发送告警: ${key}`);
    }

    const result = await notify(message);
    if (!dryRun && result.sent) {
      state.sent[key] = {
        at: new Date().toISOString(),
        subject: message.subject || '',
        to: config.to
      };
      if (stateFile) saveAlertState(stateFile, state);
    }
    return result;
  }

  return {
    notify,
    notifyOnce,
    isConfigured: () => isEmailConfigured(config),
    config
  };
}

module.exports = {
  createAlertNotifier,
  getEmailConfig,
  isEmailConfigured,
  loadAlertState
};
