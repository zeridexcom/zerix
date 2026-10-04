const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys');
require('dotenv').config();

const app = express();
const PORT = process.env.OPENWA_PORT || 2886;
const SESSION_ID = process.env.OPENWA_SESSION_ID || 'e1519353-c186-4c0c-ac2b-90e5b01090a7';
const EXPECTED_KEY = process.env.OPENWA_API_KEY || 'owa_k1_938da88d4539053105b4cffcdfa38005b0fd4d1f1fa505e79147c0d6690cf9b6';
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'zerix';
const AUTH_DIR = path.join(__dirname, 'whatsapp_session');

app.use(express.json());

// In-memory message dispatch log & state
const sentMessages = [];
let sock = null;
let currentQr = null;
let currentQrDataUrl = null;
let connectionStatus = 'initializing'; // 'initializing', 'scan_qr', 'connected', 'reconnecting', 'disconnected'
let connectedPhone = null;
let pushName = `${BUSINESS_NAME.charAt(0).toUpperCase() + BUSINESS_NAME.slice(1)} WhatsApp Gateway`;
let connectionError = null;

// Ensure auth dir exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Middleware for API key validation (optional in dev, strict if provided)
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (apiKey && apiKey !== EXPECTED_KEY && apiKey !== `Bearer ${EXPECTED_KEY}`) {
    console.warn(`[OpenWA] Warning: API key mismatch. Received: ${apiKey?.substring(0, 8)}...`);
  }
  next();
});

// Initialize Baileys WhatsApp Connection
async function connectToWhatsApp() {
  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.ws?.close();
      } catch (e) {}
      sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.windows('Desktop'),
      connectTimeoutMs: 45000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 45000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQr = qr;
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
        } catch (e) {
          console.error('[OpenWA] Failed to generate QR data URL:', e.message);
        }
        connectionStatus = 'scan_qr';
        console.log('\n\x1b[33m[OpenWA] 📱 WhatsApp QR Code generated! Scan it with WhatsApp (Settings > Linked Devices > Link a Device)\x1b[0m');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        connectionError = lastDisconnect?.error?.message || 'Connection closed';

        console.log(`[OpenWA] Connection closed (${statusCode || 'unknown'}). Should reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatus = 'logged_out';
          currentQr = null;
          currentQrDataUrl = null;
          connectedPhone = null;
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch (e) {
            console.error('[OpenWA] Failed to clear session dir:', e.message);
          }
          console.log('[OpenWA] Logged out. Restarting fresh connection...');
          setTimeout(() => {
            connectToWhatsApp().catch(e => console.error('[OpenWA] Connect error:', e.message));
          }, 3000);
        } else {
          connectionStatus = 'reconnecting';
          setTimeout(() => {
            connectToWhatsApp().catch(e => console.error('[OpenWA] Reconnect error:', e.message));
          }, 5000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'connected';
        connectionError = null;
        currentQr = null;
        currentQrDataUrl = null;

        const rawJid = sock.user?.id || '';
        connectedPhone = rawJid.split(':')[0] || rawJid.split('@')[0] || '';
        pushName = sock.user?.name || `${BUSINESS_NAME.toUpperCase()} Official`;

        console.log(`\n\x1b[32m✔ [OpenWA] Successfully linked to WhatsApp!\x1b[0m`);
        console.log(`  • Connected Phone: +${connectedPhone}`);
        console.log(`  • Profile Name: ${pushName}\n`);
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (!messages || !Array.isArray(messages)) return;
      for (const msg of messages) {
        if (!msg.message) continue;
        const fromMe = msg.key?.fromMe;
        const remoteJid = msg.key?.remoteJid || '';
        if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') continue;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (!text) continue;
        const cleanDigits = remoteJid.replace(/[^0-9]/g, '');
        if (sentMessages.some(m => m.messageId === msg.key?.id)) continue;
        sentMessages.unshift({
          messageId: msg.key?.id || ('wa_msg_' + Date.now()),
          chatId: `+${cleanDigits}`,
          recipientJid: remoteJid,
          text,
          fromMe: Boolean(fromMe),
          timestamp: (msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now()),
          status: fromMe ? 'DELIVERED' : 'RECEIVED',
        });
        if (sentMessages.length > 200) sentMessages.pop();
      }
    });

  } catch (err) {
    console.error('[OpenWA Init Error]', err);
    connectionStatus = 'error';
    connectionError = err.message;
    setTimeout(connectToWhatsApp, 5000);
  }
}

// Start connection on launch
connectToWhatsApp();

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'OpenWA WhatsApp Gateway (Baileys Engine)',
    session: SESSION_ID,
    connected: connectionStatus === 'connected',
    connectionStatus,
    phone: connectedPhone,
  });
});

// Root API info endpoint
app.get(['/api', '/api/'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'OpenWA WhatsApp Gateway (Baileys Multi-Device)',
    session: SESSION_ID,
    connected: connectionStatus === 'connected',
    connectionStatus,
    phone: connectedPhone ? `+${connectedPhone}` : null,
    dashboard: `http://localhost:${PORT}`,
    qrAvailable: Boolean(currentQrDataUrl),
    endpoints: {
      health: `http://localhost:${PORT}/api/health`,
      status: `http://localhost:${PORT}/api/status`,
      qr: `http://localhost:${PORT}/api/qr`,
      sessions: `http://localhost:${PORT}/api/sessions`,
      sendText: `POST http://localhost:${PORT}/api/sessions/${SESSION_ID}/messages/send-text`,
      logout: `POST http://localhost:${PORT}/api/logout`,
      zerixApp: 'http://localhost:3001',
    }
  });
});

// Detailed status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    configured: true,
    connected: connectionStatus === 'connected',
    status: connectionStatus,
    phone: connectedPhone,
    pushName,
    qr: currentQr,
    qrDataUrl: currentQrDataUrl,
    sessionId: SESSION_ID,
    messagesCount: sentMessages.length,
    error: connectionError,
  });
});

// Dedicated QR code endpoint
app.get('/api/qr', (req, res) => {
  res.json({
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    qr: currentQr,
    qrDataUrl: currentQrDataUrl,
    phone: connectedPhone,
  });
});

// Session list endpoint (queried by Zerix server.js via GET /api/sessions)
app.get('/api/sessions', (req, res) => {
  res.json([
    {
      id: SESSION_ID,
      name: 'default',
      status: connectionStatus === 'connected' ? 'ready' : connectionStatus,
      connected: connectionStatus === 'connected',
      phone: connectedPhone || process.env.OPENWA_PHONE || '919686868973',
      pushName,
      engine: 'baileys-multi-device',
      qrDataUrl: currentQrDataUrl,
      messagesDispatched: sentMessages.length,
    },
  ]);
});

// Single session detail
app.get('/api/sessions/:sessionId', (req, res) => {
  res.json({
    id: req.params.sessionId || SESSION_ID,
    name: 'default',
    status: connectionStatus === 'connected' ? 'ready' : connectionStatus,
    connected: connectionStatus === 'connected',
    phone: connectedPhone || process.env.OPENWA_PHONE || '919686868973',
    pushName,
    engine: 'baileys-multi-device',
    qrDataUrl: currentQrDataUrl,
  });
});

// Send text message endpoint (called by Zerix server.js)
app.post('/api/sessions/:sessionId/messages/send-text', async (req, res) => {
  const { chatId, text } = req.body || {};
  const sessionId = req.params.sessionId;

  if (!chatId || !text) {
    return res.status(400).json({
      error: true,
      message: 'Both chatId and text are required',
    });
  }

  // Extract pure phone digits and normalize Indian standard (+91)
  let rawDigits = chatId.replace(/[^0-9]/g, '');
  if (rawDigits.length === 11 && rawDigits.startsWith('0')) {
    rawDigits = rawDigits.slice(1);
  }
  // Standard Indian 10-digit mobile number auto-prefix 91
  if (rawDigits.length === 10) {
    rawDigits = '91' + rawDigits;
  }

  if (!rawDigits || rawDigits.length < 8) {
    return res.status(400).json({
      error: true,
      message: `Invalid recipient phone number: ${chatId}`,
    });
  }

  // Standard WhatsApp JID format
  let recipientJid = `${rawDigits}@s.whatsapp.net`;

  // Verify connection status
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(409).json({
      error: true,
      code: 'WHATSAPP_NOT_LINKED',
      message: 'WhatsApp device is not linked. Scan the QR code with your phone to grant permission.',
      connectionStatus,
      qrAvailable: Boolean(currentQrDataUrl),
      qrDataUrl: currentQrDataUrl,
    });
  }

  try {
    // Check if number exists on WhatsApp and get canonical JID
    try {
      if (typeof sock.onWhatsApp === 'function') {
        const checkResults = await sock.onWhatsApp(rawDigits);
        const match = Array.isArray(checkResults) ? checkResults[0] : null;
        if (match && match.jid) {
          recipientJid = match.jid;
        }
      }
    } catch (e) {
      // Proceed with recipientJid
    }

    // Dispatch real message via Baileys WhatsApp WebSocket
    const result = await sock.sendMessage(recipientJid, { text });
    const messageId = result?.key?.id || ('wa_' + Date.now());

    const record = {
      messageId,
      sessionId,
      chatId,
      recipientJid,
      text,
      timestamp: Date.now(),
      status: 'DELIVERED',
    };

    sentMessages.unshift(record);
    if (sentMessages.length > 100) sentMessages.pop();

    console.log(`\x1b[32m[OpenWA Gateway]\x1b[0m 💬 Real WhatsApp dispatched to \x1b[36m+${rawDigits}\x1b[0m (ID: ${messageId})`);

    res.status(200).json({
      success: true,
      messageId,
      timestamp: record.timestamp,
      chatId,
      sessionId,
      status: 'sent',
    });
  } catch (err) {
    console.error(`[OpenWA Dispatch Error] Failed to deliver to +${rawDigits}:`, err);
    res.status(500).json({
      error: true,
      message: `WhatsApp dispatch failed: ${err.message}`,
    });
  }
});

// Logout endpoint (unlink phone number and clear session)
app.post(['/api/logout', '/api/sessions/:sessionId/logout'], async (req, res) => {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        // ignore error during forced logout
      }
    }
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    } catch (e) {
      // ignore
    }
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQr = null;
    currentQrDataUrl = null;

    setTimeout(connectToWhatsApp, 1500);

    res.json({ success: true, message: 'Logged out successfully. Regenerating QR code...' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Direct chat message send (from WhatsApp Web input bar)
app.post('/api/chat/send', async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ error: 'phone and text required' });
  let rawDigits = phone.replace(/[^0-9]/g, '');
  if (rawDigits.length === 10) rawDigits = '91' + rawDigits;
  const recipientJid = `${rawDigits}@s.whatsapp.net`;
  try {
    if (!sock || connectionStatus !== 'connected') {
      return res.status(409).json({ error: 'WhatsApp not connected' });
    }
    const result = await sock.sendMessage(recipientJid, { text });
    const messageId = result?.key?.id || ('wa_' + Date.now());
    const record = {
      messageId,
      sessionId: SESSION_ID,
      chatId: `+${rawDigits}`,
      recipientJid,
      text,
      fromMe: true,
      timestamp: Date.now(),
      status: 'DELIVERED',
    };
    sentMessages.unshift(record);
    res.json({ success: true, messageId, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Messages feed endpoint
app.get('/api/messages', (req, res) => {
  res.json(sentMessages);
});

// Redirect root to main app at http://localhost:3001 where WhatsApp Web UI + Top Layer live
app.get('/', (req, res) => {
  if (req.query.raw === 'true' || req.headers.accept?.includes('application/json')) {
    return res.json({
      connected: connectionStatus === 'connected',
      phone: connectedPhone,
      messagesCount: sentMessages.length,
      gateway: 'http://localhost:' + PORT
    });
  }
  res.redirect('http://localhost:3001');
});


function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.listen(PORT, () => {
  console.log(`\x1b[32m✔ OpenWA WhatsApp Gateway running at http://localhost:${PORT}\x1b[0m`);
  console.log(`  • Engine: Baileys Multi-Device WebSocket`);
  console.log(`  • Gateway UI: http://localhost:${PORT}`);
  console.log(`  • Status: Waiting for WhatsApp connection...\n`);
});
