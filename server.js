require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Global safety handlers to prevent server crashes on transient network glitches
process.on('uncaughtException', (err) => {
  console.error('[Global Exception Handler] Caught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Global Rejection Handler] Unhandled Rejection:', reason?.message || reason);
});
process.stdin.resume();

const app = express();
app.use(express.json());

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Persistent file store
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'requests.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'private_feedback.json');

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

  if (!fs.existsSync(DATA_FILE)) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
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

function loadFeedbackFromDisk() {
  if (fs.existsSync(FEEDBACK_FILE)) {
    try {
      const raw = fs.readFileSync(FEEDBACK_FILE, 'utf8');
      if (raw.trim()) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
    } catch (e) {
      console.error('Error reading private_feedback.json from disk:', e.message);
    }
  }

  if (!fs.existsSync(FEEDBACK_FILE)) {
    try {
      fs.writeFileSync(FEEDBACK_FILE, JSON.stringify([], null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing initial private_feedback.json:', e.message);
    }
  }
  return [];
}

function saveFeedbackToDisk(list) {
  try {
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing private_feedback.json to disk:', e.message);
  }
}

const requests = loadRequestsFromDisk();
const privateFeedbackList = loadFeedbackFromDisk();
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

function getAppBaseUrl(req) {
  if (process.env.APP_BASE_URL) return normalizeUrl(process.env.APP_BASE_URL);
  if (process.env.RENDER_EXTERNAL_URL) return normalizeUrl(process.env.RENDER_EXTERNAL_URL);
  if (req && req.get && req.get('host')) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    return `${proto}://${req.get('host')}`;
  }
  return `http://localhost:${getPort()}`;
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

// Indian standard (+91) phone normalization helper
function normalizeIndianPhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return digits;
}

// WhatsApp sender helper
async function sendWhatsAppMessage(phone, message) {
  const targetDigits = normalizeIndianPhone(phone);
  const cleanPhone = `+${targetDigits}`;
  const chatId = `${targetDigits}@c.us`;

  // 1. Check OpenWA (Free Self-Hosted WhatsApp Gateway - rmyndharis/OpenWA)
  if (process.env.OPENWA_API_URL) {
    try {
      const baseUrl = normalizeUrl(process.env.OPENWA_API_URL);
      const apiKey = process.env.OPENWA_API_KEY || '';
      let sessionId = process.env.OPENWA_SESSION_ID || '';

      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;

      // If sessionId is not provided or set to 'default', auto-discover the active ready session
      if (!sessionId || sessionId === 'default') {
        try {
          const sRes = await fetch(`${baseUrl}/api/sessions`, { headers, signal: AbortSignal.timeout(2000) });
          if (sRes.ok) {
            const raw = await sRes.json();
            const list = Array.isArray(raw) ? raw : [raw];
            const ready = list.find(s => s && s.status === 'ready') || list[0];
            if (ready && ready.id) {
              sessionId = ready.id;
            }
          }
        } catch (e) {
          // ignore session auto-discovery error
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
        signal: AbortSignal.timeout(12000),
      });

      if (openwaRes.ok) {
        const data = await openwaRes.json().catch(() => ({}));
        console.log(`[OpenWA Success] Real WhatsApp dispatched to ${chatId} via session ${sessionId} (ID: ${data.messageId || 'ok'})`);
        return { provider: 'openwa', messageId: data.messageId, timestamp: data.timestamp, sessionId };
      } else {
        const errData = await openwaRes.json().catch(() => ({}));
        console.warn(`[OpenWA Response ${openwaRes.status}]`, errData.message || 'Dispatch notice');
        if (errData.code === 'WHATSAPP_NOT_LINKED') {
          return { provider: 'wa_link_required', message: errData.message, qrDataUrl: errData.qrDataUrl };
        }
      }
    } catch (e) {
      console.log(`[WhatsApp Gateway Offline] Falling back to Direct wa.me link mode: ${e.message}`);
    }
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


// Helper to process and dispatch a single review request
async function processReviewRequest({ customerName, email, phone, channel, jobReference, force = false, queueOnly = false }) {
  if (!customerName || (!email && !phone)) {
    throw new Error('Customer name and either email or phone are required');
  }

  const reviewUrl = getReviewUrl();
  const businessName = getBusinessName();
  const targetDigits = phone ? normalizeIndianPhone(phone) : null;
  const cleanPhone = targetDigits ? `+${targetDigits}` : null;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  let chosenChannel = (channel && ['whatsapp', 'email', 'sms'].includes(channel.toLowerCase()))
    ? channel.toLowerCase()
    : null;

  if (!chosenChannel) {
    if (cleanPhone) chosenChannel = 'whatsapp';
    else if (normalizedEmail) chosenChannel = 'email';
    else chosenChannel = 'whatsapp';
  }

  // Check 7-day rate-limiting duplicate unless forced
  if (!force) {
    const existing = [...requests.values()].find(
      r => ((normalizedEmail && r.email && r.email.toLowerCase() === normalizedEmail) ||
            (cleanPhone && r.phone && r.phone.replace(/[^0-9+]/g, '') === cleanPhone)) &&
           Date.now() - r.createdAt < 7 * 24 * 60 * 60 * 1000
    );
    if (existing) {
      return {
        skipped: true,
        reason: 'Review already requested for this customer within 7 days',
        existingId: existing.id,
        customerName,
        channel: chosenChannel,
      };
    }
  }

  const id = crypto.randomUUID();
  const baseUrl = getAppBaseUrl();
  const funnelUrl = `${baseUrl}/r/${id}`;
  const star5Url = `${baseUrl}/r/${id}?stars=5`;
  const star4Url = `${baseUrl}/r/${id}?stars=4`;
  const star3Url = `${baseUrl}/r/${id}?stars=3`;
  const star2Url = `${baseUrl}/r/${id}?stars=2`;
  const star1Url = `${baseUrl}/r/${id}?stars=1`;

  const vars = {
    customerName,
    reviewUrl,
    businessName,
    funnelUrl,
    star5Url,
    star4Url,
    star3Url,
    star2Url,
    star1Url,
    requestId: id,
    jobReference: jobReference || '',
  };

  let whatsappLink = null;
  if (cleanPhone) {
    const waText = fillTemplate(loadTemplate('whatsapp-template.md') || 'Hi {{customerName}}! Rate us: {{star5Url}}', vars);
    const targetDigits = cleanPhone.replace(/^\+/, '');
    whatsappLink = `https://wa.me/${targetDigits}?text=${encodeURIComponent(waText)}`;
  }

  const record = {
    id,
    customerName,
    email: normalizedEmail,
    phone: cleanPhone,
    channel: chosenChannel,
    jobReference: jobReference || null,
    status: 'pending',
    createdAt: Date.now(),
    followUpSent: false,
    errorMessage: null,
    whatsappLink,
    funnelUrl,
    star5Url,
    star1Url,
  };

  if (queueOnly) {
    record.status = 'queued';
    requests.set(id, record);
    return record;
  }

  try {
    if (record.channel === 'email' && transporter && normalizedEmail) {
      const emailTemplate = loadTemplate('email-template.md') || 'Hi {{customerName}}, we\'d love your feedback! Leave us a review: {{reviewUrl}}';
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: normalizedEmail,
        subject: `How was your experience, ${customerName}?`,
        html: fillTemplate(emailTemplate, vars),
      });
      record.status = 'sent';
    } else if (record.channel === 'whatsapp' && cleanPhone) {
      const waTemplate = loadTemplate('whatsapp-template.md') || 'Hi {{customerName}}! Please leave us a review: {{reviewUrl}}';
      const msg = fillTemplate(waTemplate, vars);
      const result = await sendWhatsAppMessage(cleanPhone, msg);
      record.status = 'sent';
      record.provider = result.provider;
    } else if (record.channel === 'sms' && cleanPhone) {
      const smsTemplate = loadTemplate('sms-template.md') || 'Hi {{customerName}}! How was your experience? Leave us a quick review: {{reviewUrl}}';
      console.log(`[SMS Log] To ${cleanPhone}: ${fillTemplate(smsTemplate, vars)}`);
      record.status = 'sent';
    } else if (record.channel === 'email' && !transporter) {
      record.status = 'queued';
      console.log(`[Email Queued - SMTP Not Configured] To ${normalizedEmail}: ${customerName}`);
    } else {
      record.status = 'queued';
    }
  } catch (err) {
    console.error(`Failed to send to ${customerName}:`, err.message);
    record.status = 'failed';
    record.errorMessage = err.message;
  }

  requests.set(id, record);
  return record;
}

// Send single review request
app.post('/api/request', async (req, res) => {
  const { customerName, email, phone, channel, jobReference, force } = req.body;

  if (!customerName || (!email && !phone)) {
    return res.status(400).json({ error: 'customerName and either email or phone are required' });
  }

  try {
    const result = await processReviewRequest({
      customerName,
      email,
      phone,
      channel,
      jobReference,
      force: !!force,
    });

    if (result.skipped) {
      return res.status(409).json({ error: result.reason, requestId: result.existingId });
    }

    saveRequestsToDisk();
    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Bulk import & send review requests
app.post('/api/requests/bulk', async (req, res) => {
  const { contacts, defaultChannel, force, queueOnly, delayMs = 80 } = req.body;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'An array of contacts is required' });
  }

  if (contacts.length > 1000) {
    return res.status(400).json({ error: 'Maximum 1,000 contacts per bulk import batch' });
  }

  const results = [];
  const errors = [];
  let sentCount = 0;
  let queuedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const customerName = (c.customerName || c.name || '').trim();
    const email = (c.email || '').trim() || null;
    const phone = (c.phone || c.mobile || c.whatsapp || '').trim() || null;
    const jobReference = (c.jobReference || c.job || c.invoice || c.ref || '').trim() || null;

    let channel = (c.channel || defaultChannel || '').trim().toLowerCase();
    if (!channel || channel === 'auto') {
      channel = phone ? 'whatsapp' : 'email';
    }

    if (!customerName || (!email && !phone)) {
      errors.push({
        index: i + 1,
        customerName: customerName || `Row #${i + 1}`,
        error: 'Missing required customer name and contact details (email or phone)',
      });
      continue;
    }

    try {
      const record = await processReviewRequest({
        customerName,
        email,
        phone,
        channel,
        jobReference,
        force: !!force,
        queueOnly: !!queueOnly,
      });

      if (record.skipped) {
        skippedCount++;
        results.push({
          index: i + 1,
          customerName,
          channel: record.channel,
          status: 'skipped',
          reason: record.reason,
          existingId: record.existingId,
        });
      } else {
        if (record.status === 'sent') sentCount++;
        else if (record.status === 'queued') queuedCount++;
        else if (record.status === 'failed') failedCount++;

        results.push({
          index: i + 1,
          id: record.id,
          customerName: record.customerName,
          channel: record.channel,
          status: record.status,
          phone: record.phone,
          email: record.email,
          provider: record.provider,
          errorMessage: record.errorMessage,
        });
      }

      // Small pacing delay between outbound WhatsApp / Email calls
      if (!queueOnly && delayMs > 0 && i < contacts.length - 1) {
        await new Promise(r => setTimeout(r, Math.min(delayMs, 500)));
      }
    } catch (err) {
      failedCount++;
      errors.push({
        index: i + 1,
        customerName,
        error: err.message,
      });
    }
  }

  saveRequestsToDisk();

  res.json({
    success: true,
    totalReceived: contacts.length,
    processed: results.length,
    sent: sentCount,
    queued: queuedCount,
    failed: failedCount,
    skipped: skippedCount,
    results,
    errors,
  });
});

// Root API info endpoint for /api and /api/
app.get(['/api', '/api/'], (req, res) => {
  res.json({
    status: 'ok',
    app: 'Zerix Review Request Automator',
    webDashboard: `http://localhost:${getPort()}`,
    openwaGateway: process.env.OPENWA_API_URL || 'http://localhost:2886',
    endpoints: {
      requests: '/api/requests',
      createRequest: 'POST /api/request',
      config: '/api/config',
      templates: '/api/templates',
      openwaStatus: '/api/openwa/status',
      health: '/health'
    }
  });
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

// =========================================================================
// SMART REVIEW FUNNEL & NEGATIVE SENTIMENT SHIELD ENDPOINTS
// =========================================================================

// Public funnel page route
app.get('/r/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'funnel.html'));
});

// Funnel metadata query
app.get('/api/funnel/data/:id', (req, res) => {
  const { id } = req.params;
  const requestedStars = parseInt(req.query.stars, 10) || null;
  const managerPhone = process.env.MANAGER_WHATSAPP_PHONE || process.env.ADMIN_WHATSAPP_PHONE || '';

  if (id === 'demo') {
    return res.json({
      id: 'demo',
      customerName: 'Alex Morgan',
      businessName: getBusinessName(),
      reviewUrl: getReviewUrl(),
      stars: requestedStars || 5,
      jobReference: 'INV-DEMO-8842',
      phone: '+44 7700 900000',
      email: 'alex.morgan@example.com',
      managerPhone,
    });
  }

  const record = requests.get(id);
  if (!record) {
    return res.json({
      id,
      customerName: 'Valued Customer',
      businessName: getBusinessName(),
      reviewUrl: getReviewUrl(),
      stars: requestedStars || 5,
      jobReference: null,
      phone: null,
      email: null,
      managerPhone,
    });
  }

  return res.json({
    id: record.id,
    customerName: record.customerName || 'Valued Customer',
    businessName: getBusinessName(),
    reviewUrl: getReviewUrl(),
    stars: requestedStars || 5,
    jobReference: record.jobReference || null,
    phone: record.phone || null,
    email: record.email || null,
    managerPhone,
  });
});

// Private feedback submission (Shields negative ratings from Google & alerts Manager on WhatsApp)
app.post('/api/funnel/feedback/:id', async (req, res) => {
  const { id } = req.params;
  const { stars, feedbackText, resolutionType, customerName, phone, email, primaryIssue } = req.body;

  const feedbackRecord = {
    id: crypto.randomUUID(),
    requestId: id,
    stars: parseInt(stars, 10) || 1,
    primaryIssue: primaryIssue || 'General Service',
    feedbackText: feedbackText || '',
    resolutionType: resolutionType || 'manager_call',
    customerName: customerName || 'Customer',
    phone: phone || null,
    email: email || null,
    createdAt: Date.now(),
    status: 'pending_review',
  };

  privateFeedbackList.unshift(feedbackRecord);
  saveFeedbackToDisk(privateFeedbackList);

  // Update associated request record if it exists
  const reqRecord = requests.get(id);
  if (reqRecord) {
    reqRecord.status = 'shielded';
    reqRecord.shieldedAt = Date.now();
    reqRecord.privateFeedbackId = feedbackRecord.id;
    saveRequestsToDisk();
  }

  // 1. Dispatch WhatsApp Alert to Admin / Manager Number
  const managerPhone = process.env.MANAGER_WHATSAPP_PHONE || process.env.ADMIN_WHATSAPP_PHONE;
  let managerWhatsAppLink = null;

  if (managerPhone) {
    const cleanMgrPhone = managerPhone.replace(/[^0-9]/g, '');
    const cleanCustPhone = (feedbackRecord.phone || '').replace(/[^0-9]/g, '');

    const waAlertMsg = 
`🚨 *ZERIX NEGATIVE REVIEW ALERT*
🛡️ *A dissatisfied customer was shielded from Google!*

👤 *Customer:* ${feedbackRecord.customerName}
⭐ *Rating Given:* ${'★'.repeat(feedbackRecord.stars)}${'☆'.repeat(5 - feedbackRecord.stars)} (${feedbackRecord.stars}/5 Stars)
⚠️ *Primary Issue:* ${feedbackRecord.primaryIssue}
📞 *Contact:* ${feedbackRecord.phone || feedbackRecord.email || 'None provided'}
🛠️ *Desired Fix:* ${feedbackRecord.resolutionType}

📝 *Customer Statement:*
"${feedbackRecord.feedbackText || '(No comments provided)'}"

👉 *Call or WhatsApp customer now to resolve:*
${cleanCustPhone ? `https://wa.me/${cleanCustPhone}` : 'No phone provided'}`;

    managerWhatsAppLink = `https://wa.me/${cleanMgrPhone}?text=${encodeURIComponent(waAlertMsg)}`;

    try {
      if (process.env.OPENWA_API_KEY && process.env.OPENWA_URL) {
        await sendWhatsAppMessage(cleanMgrPhone, waAlertMsg);
        console.log(`[Shield] Alert sent via OpenWA to manager WhatsApp: +${cleanMgrPhone}`);
      }
    } catch (waErr) {
      console.warn(`[Shield] OpenWA manager dispatch error (wa.me link ready):`, waErr.message);
    }
  }

  // 2. Dispatch Email Alert if SMTP is configured
  if (transporter && (process.env.SMTP_FROM || process.env.SMTP_USER)) {
    try {
      const recipient = process.env.NOTIFICATION_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: recipient,
        subject: `🚨 [Review Shield Alert] Customer Complaint - ${feedbackRecord.customerName} (${feedbackRecord.stars}★)`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
              <h3 style="color: #991b1b; margin: 0 0 6px 0;">🛡️ Negative Review Intercepted & Shielded from Google</h3>
              <p style="margin: 0; color: #7f1d1d; font-size: 13px;">A customer submitted internal feedback instead of posting publicly on Google. Reach out promptly to resolve the issue!</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 6px 0; color: #64748b;">Customer:</td><td style="font-weight: bold; color: #0f172a;">${feedbackRecord.customerName}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Rating:</td><td style="color: #e11d48; font-weight: bold;">${'★'.repeat(feedbackRecord.stars)}${'☆'.repeat(5 - feedbackRecord.stars)} (${feedbackRecord.stars}/5 Stars)</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Primary Issue:</td><td style="font-weight: bold; color: #b91c1c;">${feedbackRecord.primaryIssue}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Phone:</td><td style="font-family: monospace;">${feedbackRecord.phone || 'N/A'}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Email:</td><td style="font-family: monospace;">${feedbackRecord.email || 'N/A'}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Preferred Resolution:</td><td style="font-weight: 500;">${feedbackRecord.resolutionType}</td></tr>
            </table>
            <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; border-left: 4px solid #ef4444;">
              <strong style="font-size: 12px; text-transform: uppercase; color: #475569;">Customer Statement:</strong>
              <p style="margin: 8px 0 0 0; color: #1e293b; white-space: pre-wrap; font-size: 14px;">${feedbackRecord.feedbackText || '(No comments provided)'}</p>
            </div>
          </div>
        `
      });
    } catch (mailErr) {
      console.error('Failed to send shield notification email:', mailErr.message);
    }
  }

  res.json({
    success: true,
    message: 'Private feedback received and delivered to management',
    managerWhatsAppLink,
  });
});

// Track conversion event (User clicked copy & open Google)
app.post('/api/funnel/track/:id', (req, res) => {
  const { id } = req.params;
  const { action, stars } = req.body;

  const record = requests.get(id);
  if (record) {
    record.funnelConverted = true;
    record.convertedAt = Date.now();
    record.starsSelected = stars;
    if (record.status !== 'shielded') {
      record.status = 'reviewed';
    }
    saveRequestsToDisk();
  }
  res.json({ success: true });
});

// List all private shielded feedback
app.get('/api/feedback', (req, res) => {
  res.json(privateFeedbackList);
});

// Mark feedback as resolved
app.patch('/api/feedback/:id/resolve', (req, res) => {
  const item = privateFeedbackList.find(f => f.id === req.params.id);
  if (item) {
    item.status = 'resolved';
    item.resolvedAt = Date.now();
    saveFeedbackToDisk(privateFeedbackList);
    return res.json({ success: true, item });
  }
  return res.status(404).json({ error: 'Feedback record not found' });
});

// Helper to dispatch a single follow-up message
async function executeFollowUp(record, customMessage = null) {
  const reviewUrl = getReviewUrl();
  const businessName = getBusinessName();
  const baseUrl = getAppBaseUrl();
  const funnelUrl = `${baseUrl}/r/${record.id}`;
  const star5Url = `${baseUrl}/r/${record.id}?stars=5`;
  const star4Url = `${baseUrl}/r/${record.id}?stars=4`;
  const star3Url = `${baseUrl}/r/${record.id}?stars=3`;
  const star2Url = `${baseUrl}/r/${record.id}?stars=2`;
  const star1Url = `${baseUrl}/r/${record.id}?stars=1`;

  const vars = {
    customerName: record.customerName,
    reviewUrl,
    businessName,
    funnelUrl,
    star5Url,
    star4Url,
    star3Url,
    star2Url,
    star1Url,
    requestId: record.id,
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
    managerPhone: process.env.MANAGER_WHATSAPP_PHONE || process.env.ADMIN_WHATSAPP_PHONE || '',
    nodeVersion: process.version,
    platform: process.platform,
  });
});

// Update Server Config (saves to memory and persists to .env)
const handleConfigUpdate = (req, res) => {
  const {
    businessName,
    reviewUrl,
    followUpDays,
    port,
    managerPhone,
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
  if (managerPhone !== undefined) {
    process.env.MANAGER_WHATSAPP_PHONE = managerPhone;
    envUpdates.MANAGER_WHATSAPP_PHONE = managerPhone;
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
};

app.put('/api/config', handleConfigUpdate);
app.post('/api/config', handleConfigUpdate);


// Check OpenWA Connection & Sessions
app.get('/api/openwa/status', async (req, res) => {
  if (!process.env.OPENWA_API_URL) {
    return res.json({
      configured: false,
      connected: false,
      message: 'OPENWA_API_URL is not configured in .env',
      howToSetup: {
        step1: 'Run OpenWA on port 2886: http://localhost:2886',
        step2: 'Scan the QR code with WhatsApp on your phone in the OpenWA Dashboard',
        step3: 'Add OPENWA_API_URL to .env',
      }
    });
  }

  const baseUrl = normalizeUrl(process.env.OPENWA_API_URL);
  const apiKey = process.env.OPENWA_API_KEY || '';

  try {
    const headers = {};
    if (apiKey) headers['X-API-Key'] = apiKey;

    // Fetch rich status from OpenWA Baileys gateway
    const response = await fetch(`${baseUrl}/api/status`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(4000),
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({
        configured: true,
        connected: data.connected === true,
        sessionStatus: data.status || (data.connected ? 'ready' : 'scan_qr'),
        activePhone: data.phone || null,
        pushName: data.pushName || null,
        qr: data.qr || null,
        qrDataUrl: data.qrDataUrl || null,
        messagesCount: data.messagesCount || 0,
        url: baseUrl,
      });
    }

    // Fallback to /api/sessions if older endpoint
    const sessRes = await fetch(`${baseUrl}/api/sessions`, { headers, signal: AbortSignal.timeout(3000) });
    if (sessRes.ok) {
      const rawSessions = await sessRes.json();
      const sessions = Array.isArray(rawSessions) ? rawSessions : [rawSessions];
      const readySession = sessions.find(s => s && s.status === 'ready') || sessions[0] || null;

      return res.json({
        configured: true,
        connected: readySession?.status === 'ready',
        url: baseUrl,
        sessions,
        readySession,
        activePhone: readySession?.phone || null,
        pushName: readySession?.pushName || null,
        sessionStatus: readySession?.status || 'unknown',
        qrDataUrl: readySession?.qrDataUrl || null,
      });
    }

    return res.status(response.status).json({
      configured: true,
      connected: false,
      status: response.status,
      message: `OpenWA returned status ${response.status}`,
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

// Dedicated QR code proxy endpoint
app.get('/api/openwa/qr', async (req, res) => {
  if (!process.env.OPENWA_API_URL) return res.status(404).json({ error: 'OpenWA not configured' });
  try {
    const baseUrl = normalizeUrl(process.env.OPENWA_API_URL);
    const r = await fetch(`${baseUrl}/api/qr`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy logout to unlink device
app.post('/api/openwa/logout', async (req, res) => {
  if (!process.env.OPENWA_API_URL) return res.status(404).json({ error: 'OpenWA not configured' });
  try {
    const baseUrl = normalizeUrl(process.env.OPENWA_API_URL);
    const r = await fetch(`${baseUrl}/api/logout`, { method: 'POST', signal: AbortSignal.timeout(6000) });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch OpenWA Dispatched Messages Feed
app.get('/api/openwa/messages', async (req, res) => {
  if (!process.env.OPENWA_API_URL) return res.json([]);
  try {
    const baseUrl = normalizeUrl(process.env.OPENWA_API_URL);
    const r = await fetch(`${baseUrl}/api/messages`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const msgs = await r.json();
      return res.json(msgs);
    }
  } catch (e) {}
  res.json([]);
});

// Direct WhatsApp chat message dispatch proxy
app.post('/api/openwa/chat/send', async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ error: 'phone and text required' });
  try {
    const baseUrl = normalizeUrl(process.env.OPENWA_API_URL || 'http://localhost:2886');
    const r = await fetch(`${baseUrl}/api/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return res.json(data);
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
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


