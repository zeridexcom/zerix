require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Persistent file store
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'requests.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err.message);
  }
}

function loadRequestsFromDisk() {
  const map = new Map();
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      if (raw.trim()) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach(r => {
            if (r && r.id) {
              map.set(r.id, r);
            }
          });
        }
      }
    } catch (e) {
      console.error('Error reading requests.json from disk:', e.message);
    }
  }

  // If no file exists or map is empty on initial boot, generate default records and save
  if (map.size === 0 && !fs.existsSync(DATA_FILE)) {
    const defaultSamples = [
      {
        id: crypto.randomUUID(),
        customerName: 'Sarah Jenkins',
        email: 'sarah.jenkins@example.com',
        phone: '+44 7700 900123',
        channel: 'email',
        jobReference: 'JOB-9021',
        status: 'sent',
        createdAt: Date.now() - (4 * 24 * 60 * 60 * 1000),
        followUpSent: false,
      },
      {
        id: crypto.randomUUID(),
        customerName: 'Marcus Vance',
        email: null,
        phone: '+44 7700 900456',
        channel: 'whatsapp',
        jobReference: 'JOB-9022',
        status: 'sent',
        createdAt: Date.now() - (4 * 24 * 60 * 60 * 1000),
        followUpSent: false,
        whatsappLink: 'https://wa.me/447700900456?text=Hi%20Marcus%20Vance!%20Thanks%20for%20choosing%20our%20services.',
      },
      {
        id: crypto.randomUUID(),
        customerName: 'Elena Rostova',
        email: 'elena.rostova@example.com',
        phone: null,
        channel: 'email',
        jobReference: 'JOB-9023',
        status: 'sent',
        createdAt: Date.now() - (6 * 24 * 60 * 60 * 1000),
        followUpSent: true,
        followUpSentAt: Date.now() - (3 * 24 * 60 * 60 * 1000),
      },
      {
        id: crypto.randomUUID(),
        customerName: 'David K. Miller',
        email: 'david.miller@invalid-mail-domain-test.org',
        phone: '+44 7700 900789',
        channel: 'whatsapp',
        jobReference: 'JOB-9024',
        status: 'sent',
        createdAt: Date.now() - (2 * 60 * 60 * 1000),
        followUpSent: false,
        whatsappLink: 'https://wa.me/447700900789?text=Hi%20David%20K.%20Miller!',
      },
      {
        id: crypto.randomUUID(),
        customerName: 'TechSolutions Ltd',
        email: 'accounts@techsolutions.local',
        phone: '+44 7700 900999',
        channel: 'sms',
        jobReference: 'JOB-9025',
        status: 'queued',
        createdAt: Date.now() - (15 * 60 * 1000),
        followUpSent: false,
      }
    ];
    defaultSamples.forEach(s => map.set(s.id, s));
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultSamples, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing initial requests.json:', e.message);
    }
  }

  return map;
}

function saveRequestsToDisk() {
  try {
    const list = [...requests.values()];
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing requests.json to disk:', e.message);
  }
}

const requests = loadRequestsFromDisk();
const startTime = Date.now();

function getReviewUrl() {
  return process.env.GOOGLE_REVIEW_URL || 'https://g.page/r/YOUR_REVIEW_LINK/review';
}

function getBusinessName() {
  return process.env.BUSINESS_NAME || 'Zerix';
}

function getFollowUpDays() {
  return parseInt(process.env.FOLLOW_UP_DAYS || '3', 10);
}

function getPort() {
  return process.env.PORT || 3000;
}

// Email transporter management
let transporter = null;
function initTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } catch (e) {
      console.error('Error initializing nodemailer:', e.message);
      transporter = null;
    }
  } else {
    transporter = null;
  }
}
initTransporter();

// Helper to persist updates to .env file
function updateEnvFile(updates) {
  const envPath = path.join(__dirname, '.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const lines = envContent.split(/\r?\n/);
  const updatedKeys = new Set();
  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      if (key in updates) {
        updatedKeys.add(key);
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });

  // Add any new keys that were not previously present
  for (const [k, v] of Object.entries(updates)) {
    if (!updatedKeys.has(k)) {
      newLines.push(`${k}=${v}`);
    }
  }

  fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
}


function loadTemplate(name) {
  try {
    return fs.readFileSync(path.join(__dirname, 'templates', name), 'utf8');
  } catch (e) {
    return null;
  }
}

function saveTemplate(name, content) {
  const templatesDir = path.join(__dirname, 'templates');
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  fs.writeFileSync(path.join(templatesDir, name), content, 'utf8');
}

function fillTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return result;
}

function normalizeUrl(url) {
  if (!url) return '';
  url = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url;
}

// WhatsApp sender helper
async function sendWhatsAppMessage(phone, message) {
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const targetDigits = cleanPhone.replace(/^\+/, '');
  const chatId = `${targetDigits}@c.us`;

  // 1. Check OpenWA (Free Self-Hosted WhatsApp Gateway - rmyndharis/OpenWA)
  if (process.env.OPENWA_API_URL) {
    const baseUrl = normalizeUrl(process.env.OPENWA_API_URL);
    const apiKey = process.env.OPENWA_API_KEY || '';
    let sessionId = process.env.OPENWA_SESSION_ID || '';

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    // If sessionId is not provided or set to 'default', auto-discover the active ready session
    if (!sessionId || sessionId === 'default') {
      try {
        const sRes = await fetch(`${baseUrl}/api/sessions`, { headers, signal: AbortSignal.timeout(3000) });
        if (sRes.ok) {
          const raw = await sRes.json();
          const list = Array.isArray(raw) ? raw : [raw];
          const ready = list.find(s => s && s.status === 'ready') || list[0];
          if (ready && ready.id) {
            sessionId = ready.id;
          }
        }
      } catch (e) {
        console.warn('Could not auto-discover OpenWA session:', e.message);
      }
    }

    if (!sessionId) sessionId = 'default';

    // Call OpenWA send-text endpoint
    const openwaRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages/send-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chatId,
        text: message,
      }),
    });

    const data = await openwaRes.json().catch(() => ({}));
    if (!openwaRes.ok) {
      throw new Error(data.message || `OpenWA error (${openwaRes.status}): ${JSON.stringify(data)}`);
    }

    console.log(`[OpenWA Success] Message sent to ${chatId} via session ${sessionId} (ID: ${data.messageId || 'ok'})`);
    return { provider: 'openwa', messageId: data.messageId, timestamp: data.timestamp, sessionId };
  }

  // 2. Check Twilio WhatsApp integration
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:') ? process.env.TWILIO_WHATSAPP_FROM : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;
    const to = cleanPhone.startsWith('whatsapp:') ? cleanPhone : `whatsapp:${cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone}`;

    const params = new URLSearchParams();
    params.append('From', from);
    params.append('To', to);
    params.append('Body', message);

    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await twilioRes.json();
    if (!twilioRes.ok) {
      throw new Error(data.message || 'Twilio WhatsApp dispatch failed');
    }
    return { provider: 'twilio', sid: data.sid };
  }

  // 3. Check Meta WhatsApp Cloud API
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const recipientPhone = cleanPhone.replace(/^\+/, '');
    const metaRes = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { body: message },
      }),
    });

    const data = await metaRes.json();
    if (!metaRes.ok) {
      throw new Error(data.error?.message || 'Meta WhatsApp Cloud API dispatch failed');
    }
    return { provider: 'meta', messageId: data.messages?.[0]?.id };
  }

  // 4. Fallback: Log and provide direct wa.me link
  console.log(`[WhatsApp Simulated/Logged] To ${cleanPhone}: ${message}`);
  return { provider: 'simulated', logged: true };
}


// Send review request
app.post('/api/request', async (req, res) => {
  const { customerName, email, phone, channel, jobReference } = req.body;

  if (!customerName || (!email && !phone)) {
    return res.status(400).json({ error: 'customerName and either email or phone are required' });
  }

  const reviewUrl = getReviewUrl();
  const businessName = getBusinessName();
  const chosenChannel = channel || (phone ? 'whatsapp' : 'email');

  // Check if already requested recently (7 days)
  const existing = [...requests.values()].find(
    r => (r.email === email || r.phone === phone) && Date.now() - r.createdAt < 7 * 24 * 60 * 60 * 1000
  );
  if (existing) {
    return res.status(409).json({ error: 'Review already requested for this customer recently', requestId: existing.id });
  }

  const id = crypto.randomUUID();
  const cleanPhone = phone ? phone.replace(/[^0-9+]/g, '') : null;
  const vars = {
    customerName,
    reviewUrl,
    businessName,
  };

  let whatsappLink = null;
  if (cleanPhone) {
    const waText = fillTemplate(loadTemplate('whatsapp-template.md') || 'Hi {{customerName}}! Leave us a review: {{reviewUrl}}', vars);
    const targetDigits = cleanPhone.replace(/^\+/, '');
    whatsappLink = `https://wa.me/${targetDigits}?text=${encodeURIComponent(waText)}`;
  }

  const record = {
    id,
    customerName,
    email: email || null,
    phone: phone || null,
    channel: chosenChannel,
    jobReference: jobReference || null,
    status: 'pending',
    createdAt: Date.now(),
    followUpSent: false,
    errorMessage: null,
    whatsappLink,
  };

  try {
    if (record.channel === 'email' && transporter && email) {
      const emailTemplate = loadTemplate('email-template.md') || 'Hi {{customerName}}, we\'d love your feedback! Leave us a review: {{reviewUrl}}';
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `How was your experience, ${customerName}?`,
        html: fillTemplate(emailTemplate, vars),
      });
      record.status = 'sent';
    } else if (record.channel === 'whatsapp' && phone) {
      const waTemplate = loadTemplate('whatsapp-template.md') || 'Hi {{customerName}}! Please leave us a review: {{reviewUrl}}';
      const msg = fillTemplate(waTemplate, vars);
      const result = await sendWhatsAppMessage(phone, msg);
      record.status = 'sent';
      record.provider = result.provider;
    } else if (record.channel === 'sms' && phone) {
      const smsTemplate = loadTemplate('sms-template.md') || 'Hi {{customerName}}! How was your experience? Leave us a quick review: {{reviewUrl}}';
      console.log(`[SMS Log] To ${phone}: ${fillTemplate(smsTemplate, vars)}`);
      record.status = 'sent';
    } else if (record.channel === 'email' && !transporter) {
      record.status = 'queued';
      console.log(`[Email Queued - SMTP Not Configured] To ${email}: ${customerName}`);
    } else {
      record.status = 'queued';
    }
  } catch (err) {
    console.error('Failed to send:', err.message);
    record.status = 'failed';
    record.errorMessage = err.message;
  }

  requests.set(id, record);
  saveRequestsToDisk();
  res.status(201).json(record);
});

// List all requests
app.get('/api/requests', (req, res) => {
  const all = [...requests.values()].sort((a, b) => b.createdAt - a.createdAt);
  res.json(all);
});

// Get single request
app.get('/api/requests/:id', (req, res) => {
  const record = requests.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json(record);
});

// Delete request
app.delete('/api/requests/:id', (req, res) => {
  if (requests.has(req.params.id)) {
    requests.delete(req.params.id);
    saveRequestsToDisk();
    return res.json({ success: true, message: 'Request deleted' });
  }
  return res.status(404).json({ error: 'Request not found' });
});

// Helper to dispatch a single follow-up message
async function executeFollowUp(record, customMessage = null) {
  const reviewUrl = getReviewUrl();
  const businessName = getBusinessName();
  const vars = {
    customerName: record.customerName,
    reviewUrl,
    businessName,
  };

  if (record.channel === 'email' && transporter && record.email) {
    const htmlBody = customMessage
      ? fillTemplate(customMessage, vars)
      : `<p>Hi ${record.customerName},</p><p>Just a quick follow-up — if you have a moment, we'd really appreciate a Google review.</p><p><a href="${reviewUrl}" style="background-color:#4f46e5;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Leave a Google Review</a></p><p>Thanks,<br>${businessName}</p>`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: record.email,
      subject: `Quick reminder, ${record.customerName}`,
      html: htmlBody,
    });
  } else if (record.channel === 'whatsapp' && record.phone) {
    const waMsg = customMessage
      ? fillTemplate(customMessage, vars)
      : `Hi ${record.customerName}, just a gentle follow-up! 👋\n\nIf you have a quick 30 seconds, we'd really appreciate your Google review:\n\n⭐ ${reviewUrl}\n\nThank you!\n— ${businessName}`;

    await sendWhatsAppMessage(record.phone, waMsg);
  } else if (record.channel === 'sms' && record.phone) {
    const smsMsg = customMessage
      ? fillTemplate(customMessage, vars)
      : `Hi ${record.customerName}, quick reminder to leave us a review: ${reviewUrl}`;
    console.log(`[SMS Follow-up] To ${record.phone}: ${smsMsg}`);
  } else if (record.channel === 'email' && !transporter && record.email) {
    console.log(`[Email Follow-up Queued] To ${record.email}: ${record.customerName}`);
  }

  record.followUpSent = true;
  record.followUpSentAt = Date.now();
  record.followUpCount = (record.followUpCount || 0) + 1;
  saveRequestsToDisk();
  return record;
}

// Trigger follow-ups (Automated or Custom Batch Selection)
app.post('/api/follow-up', async (req, res) => {
  const { requestIds, customMessage, force, thresholdDays } = req.body || {};
  const followUpDays = thresholdDays !== undefined && thresholdDays !== null ? Number(thresholdDays) : getFollowUpDays();
  const cutoff = Date.now() - followUpDays * 24 * 60 * 60 * 1000;

  let targets = [];

  if (Array.isArray(requestIds) && requestIds.length > 0) {
    // Targeted custom selection
    targets = requestIds
      .map(id => requests.get(id))
      .filter(Boolean);
  } else {
    // Automated query based on threshold
    targets = [...requests.values()].filter(r => {
      const validStatus = r.status === 'sent' || r.status === 'queued';
      if (!validStatus) return false;
      if (force) return true;
      return !r.followUpSent && r.createdAt <= cutoff;
    });
  }

  let sent = 0;
  const processed = [];
  const errors = [];

  for (const record of targets) {
    try {
      await executeFollowUp(record, customMessage);
      sent++;
      processed.push({ id: record.id, customerName: record.customerName, channel: record.channel, followUpCount: record.followUpCount });
    } catch (err) {
      console.error(`Follow-up failed for ${record.id}:`, err.message);
      errors.push({ id: record.id, customerName: record.customerName, error: err.message });
    }
  }

  res.json({
    success: true,
    followUpsSent: sent,
    totalTargeted: targets.length,
    processed,
    errors,
  });
});

// Single Customer Follow-up
app.post('/api/requests/:id/follow-up', async (req, res) => {
  const record = requests.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Review request not found' });

  const { customMessage } = req.body || {};

  try {
    await executeFollowUp(record, customMessage);
    res.json({
      success: true,
      message: `Follow-up sent to ${record.customerName} via ${record.channel.toUpperCase()}!`,
      record,
    });
  } catch (err) {
    console.error(`Single follow-up failed for ${record.id}:`, err.message);
    res.status(500).json({ error: `Follow-up failed: ${err.message}` });
  }
});


// Get Server Stats
app.get('/api/stats', (req, res) => {
  const all = [...requests.values()];
  const followUpDays = getFollowUpDays();
  const cutoff = Date.now() - followUpDays * 24 * 60 * 60 * 1000;
  const followUpsDue = all.filter(r => (r.status === 'sent' || r.status === 'queued') && !r.followUpSent && r.createdAt < cutoff).length;
  const followUpsSent = all.filter(r => r.followUpSent).length;
  const sentCount = all.filter(r => r.status === 'sent').length;
  const queuedCount = all.filter(r => r.status === 'queued').length;
  const failedCount = all.filter(r => r.status === 'failed').length;
  const pendingCount = all.filter(r => r.status === 'pending').length;
  const emailCount = all.filter(r => r.channel === 'email').length;
  const smsCount = all.filter(r => r.channel === 'sms').length;
  const whatsappCount = all.filter(r => r.channel === 'whatsapp').length;

  res.json({
    totalRequests: all.length,
    sent: sentCount,
    queued: queuedCount,
    failed: failedCount,
    pending: pendingCount,
    emailCount,
    smsCount,
    whatsappCount,
    followUpsDue,
    followUpsSent,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  });
});

// Get Server Config
app.get('/api/config', (req, res) => {
  const openwaConfigured = !!(process.env.OPENWA_API_URL);
  const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
  const metaConfigured = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  let activeWhatsAppProvider = 'Direct Link (wa.me)';
  if (openwaConfigured) activeWhatsAppProvider = 'Zerix Gateway (Self-Hosted)';
  else if (twilioConfigured) activeWhatsAppProvider = 'Twilio WhatsApp API';
  else if (metaConfigured) activeWhatsAppProvider = 'Meta WhatsApp Cloud API';

  res.json({
    port: getPort(),
    businessName: getBusinessName(),
    reviewUrl: getReviewUrl(),
    followUpDays: getFollowUpDays(),
    smtpConfigured: !!transporter,
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: process.env.SMTP_PORT || '587',
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPassConfigured: !!process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    whatsappConfigured: openwaConfigured || twilioConfigured || metaConfigured,
    activeWhatsAppProvider,
    openwaConfigured,
    openwaUrl: process.env.OPENWA_API_URL || '',
    openwaApiKeyConfigured: !!process.env.OPENWA_API_KEY,
    openwaSessionId: process.env.OPENWA_SESSION_ID || 'default',
    twilioConfigured,
    twilioSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioFrom: process.env.TWILIO_WHATSAPP_FROM || '',
    metaConfigured,
    metaPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    nodeVersion: process.version,
    platform: process.platform,
  });
});

// Update Server Config (saves to memory and persists to .env)
app.put('/api/config', (req, res) => {
  const {
    businessName,
    reviewUrl,
    followUpDays,
    port,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    smtpFrom,
    openwaUrl,
    openwaApiKey,
    openwaSessionId,
    twilioSid,
    twilioAuthToken,
    twilioFrom,
    metaToken,
    metaPhoneId,
  } = req.body;

  const envUpdates = {};

  if (businessName !== undefined) {
    process.env.BUSINESS_NAME = businessName;
    envUpdates.BUSINESS_NAME = businessName;
  }
  if (reviewUrl !== undefined) {
    process.env.GOOGLE_REVIEW_URL = reviewUrl;
    envUpdates.GOOGLE_REVIEW_URL = reviewUrl;
  }
  if (followUpDays !== undefined) {
    process.env.FOLLOW_UP_DAYS = String(followUpDays);
    envUpdates.FOLLOW_UP_DAYS = String(followUpDays);
  }
  if (port !== undefined) {
    process.env.PORT = String(port);
    envUpdates.PORT = String(port);
  }

  // SMTP updates
  if (smtpHost !== undefined) {
    process.env.SMTP_HOST = smtpHost;
    envUpdates.SMTP_HOST = smtpHost;
  }
  if (smtpPort !== undefined) {
    process.env.SMTP_PORT = String(smtpPort);
    envUpdates.SMTP_PORT = String(smtpPort);
  }
  if (smtpSecure !== undefined) {
    process.env.SMTP_SECURE = String(smtpSecure);
    envUpdates.SMTP_SECURE = String(smtpSecure);
  }
  if (smtpUser !== undefined) {
    process.env.SMTP_USER = smtpUser;
    envUpdates.SMTP_USER = smtpUser;
  }
  if (smtpPass !== undefined && smtpPass !== '') {
    process.env.SMTP_PASS = smtpPass;
    envUpdates.SMTP_PASS = smtpPass;
  }
  if (smtpFrom !== undefined) {
    process.env.SMTP_FROM = smtpFrom;
    envUpdates.SMTP_FROM = smtpFrom;
  }

  // OpenWA updates
  if (openwaUrl !== undefined) {
    process.env.OPENWA_API_URL = openwaUrl;
    envUpdates.OPENWA_API_URL = openwaUrl;
  }
  if (openwaApiKey !== undefined && openwaApiKey !== '') {
    process.env.OPENWA_API_KEY = openwaApiKey;
    envUpdates.OPENWA_API_KEY = openwaApiKey;
  }
  if (openwaSessionId !== undefined) {
    process.env.OPENWA_SESSION_ID = openwaSessionId;
    envUpdates.OPENWA_SESSION_ID = openwaSessionId;
  }

  // Twilio updates
  if (twilioSid !== undefined) {
    process.env.TWILIO_ACCOUNT_SID = twilioSid;
    envUpdates.TWILIO_ACCOUNT_SID = twilioSid;
  }
  if (twilioAuthToken !== undefined && twilioAuthToken !== '') {
    process.env.TWILIO_AUTH_TOKEN = twilioAuthToken;
    envUpdates.TWILIO_AUTH_TOKEN = twilioAuthToken;
  }
  if (twilioFrom !== undefined) {
    process.env.TWILIO_WHATSAPP_FROM = twilioFrom;
    envUpdates.TWILIO_WHATSAPP_FROM = twilioFrom;
  }

  // Meta Cloud API updates
  if (metaToken !== undefined && metaToken !== '') {
    process.env.WHATSAPP_ACCESS_TOKEN = metaToken;
    envUpdates.WHATSAPP_ACCESS_TOKEN = metaToken;
  }
  if (metaPhoneId !== undefined) {
    process.env.WHATSAPP_PHONE_NUMBER_ID = metaPhoneId;
    envUpdates.WHATSAPP_PHONE_NUMBER_ID = metaPhoneId;
  }

  // Re-initialize transporter
  initTransporter();

  // Persist to .env file
  try {
    updateEnvFile(envUpdates);
  } catch (err) {
    console.error('Failed to update .env file:', err);
  }

  res.json({
    success: true,
    message: 'Configuration saved and updated successfully!',
  });
});


// Check OpenWA Connection & Sessions
app.get('/api/openwa/status', async (req, res) => {
  if (!process.env.OPENWA_API_URL) {
    return res.json({
      configured: false,
      message: 'OPENWA_API_URL is not configured in .env',
      howToSetup: {
        step1: 'Run OpenWA on port 2886: http://localhost:2886',
        step2: 'Scan the QR code with WhatsApp on your phone in the OpenWA Dashboard',
        step3: 'Add OPENWA_API_URL, OPENWA_API_KEY, and OPENWA_SESSION_ID to .env',
      }
    });
  }

  const baseUrl = normalizeUrl(process.env.OPENWA_API_URL);
  const apiKey = process.env.OPENWA_API_KEY || '';

  try {
    const headers = {};
    if (apiKey) headers['X-API-Key'] = apiKey;

    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return res.status(response.status).json({
        configured: true,
        connected: false,
        status: response.status,
        message: `OpenWA returned status ${response.status}`,
      });
    }

    const rawSessions = await response.json();
    const sessions = Array.isArray(rawSessions) ? rawSessions : [rawSessions];
    const readySession = sessions.find(s => s && s.status === 'ready') || sessions[0] || null;

    return res.json({
      configured: true,
      connected: true,
      url: baseUrl,
      sessions,
      readySession,
      activePhone: readySession?.phone || null,
      pushName: readySession?.pushName || null,
      sessionStatus: readySession?.status || 'unknown',
    });
  } catch (err) {
    return res.json({
      configured: true,
      connected: false,
      url: baseUrl,
      error: err.message,
    });
  }
});


// Get templates
app.get('/api/templates', (req, res) => {
  const emailTemplate = loadTemplate('email-template.md') || '';
  const smsTemplate = loadTemplate('sms-template.md') || '';
  const whatsappTemplate = loadTemplate('whatsapp-template.md') || '';
  res.json({
    email: emailTemplate,
    sms: smsTemplate,
    whatsapp: whatsappTemplate,
  });
});

// Save template
app.put('/api/templates/:name', (req, res) => {
  const { name } = req.params;
  const { content } = req.body;
  if (!['email-template.md', 'sms-template.md', 'whatsapp-template.md'].includes(name)) {
    return res.status(400).json({ error: 'Invalid template name' });
  }
  try {
    saveTemplate(name, content || '');
    res.json({ success: true, message: `Template ${name} saved successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save template: ' + err.message });
  }
});

// Seed sample data for testing UI easily
app.post('/api/seed', (req, res) => {
  const samples = [
    {
      customerName: 'Sarah Jenkins',
      email: 'sarah.jenkins@example.com',
      phone: '+44 7700 900123',
      channel: 'email',
      jobReference: 'JOB-9021',
      status: 'sent',
      createdAt: Date.now() - (4 * 24 * 60 * 60 * 1000), // 4 days ago -> due for follow up
      followUpSent: false,
    },
    {
      customerName: 'Marcus Vance',
      email: null,
      phone: '+44 7700 900456',
      channel: 'whatsapp',
      jobReference: 'JOB-9022',
      status: 'sent',
      createdAt: Date.now() - (4 * 24 * 60 * 60 * 1000), // 4 days ago -> due for follow up
      followUpSent: false,
      whatsappLink: 'https://wa.me/447700900456?text=Hi%20Marcus%20Vance!%20Thanks%20for%20choosing%20our%20services.',
    },
    {
      customerName: 'Elena Rostova',
      email: 'elena.rostova@example.com',
      phone: null,
      channel: 'email',
      jobReference: 'JOB-9023',
      status: 'sent',
      createdAt: Date.now() - (6 * 24 * 60 * 60 * 1000), // 6 days ago -> follow-up already done
      followUpSent: true,
      followUpSentAt: Date.now() - (3 * 24 * 60 * 60 * 1000),
    },
    {
      customerName: 'David K. Miller',
      email: 'david.miller@invalid-mail-domain-test.org',
      phone: '+44 7700 900789',
      channel: 'whatsapp',
      jobReference: 'JOB-9024',
      status: 'sent',
      createdAt: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
      followUpSent: false,
      whatsappLink: 'https://wa.me/447700900789?text=Hi%20David%20K.%20Miller!',
    },
    {
      customerName: 'TechSolutions Ltd',
      email: 'accounts@techsolutions.local',
      phone: '+44 7700 900999',
      channel: 'sms',
      jobReference: 'JOB-9025',
      status: 'queued',
      createdAt: Date.now() - (15 * 60 * 1000), // 15 mins ago
      followUpSent: false,
    },
  ];

  samples.forEach(s => {
    const id = crypto.randomUUID();
    requests.set(id, { id, ...s });
  });

  saveRequestsToDisk();
  res.json({ success: true, count: samples.length, message: 'Sample data seeded successfully' });
});


// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    requests: requests.size,
  });
});

const PORT = getPort();
app.listen(PORT, () => {
  console.log(`⚡ Zerix Platform running on port ${PORT}`);
});


