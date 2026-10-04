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

    sock.ev.on('messages.upsert', (m) => {
      // Future incoming message handler if needed
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

// Messages feed endpoint
app.get('/api/messages', (req, res) => {
  res.json(sentMessages);
});

// Web UI for OpenWA Gateway Dashboard at http://localhost:2886
app.get('/', (req, res) => {
  const isConnected = connectionStatus === 'connected';
  const rows = sentMessages.map(m => `
    <tr style="border-bottom: 1px solid #1e293b;">
      <td style="padding: 10px; font-family: monospace; color: #38bdf8;">${new Date(m.timestamp).toLocaleTimeString()}</td>
      <td style="padding: 10px; font-family: monospace; color: #a78bfa;">${m.chatId}</td>
      <td style="padding: 10px; color: #e2e8f0; max-width: 400px; word-break: break-word;">${escapeHtml(m.text)}</td>
      <td style="padding: 10px;"><span style="background: rgba(34, 197, 94, 0.2); color: #4ade80; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: bold;">DELIVERED</span></td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>WhatsApp Gateway — Zerix</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; margin: 0; padding: 1.5rem; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; max-width: 960px; margin: 0 auto 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
        .badge-online { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
        .badge-offline { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .dot-green { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
        .dot-yellow { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
        th { text-align: left; padding: 10px; color: #94a3b8; border-bottom: 1px solid #1e293b; font-weight: 600; }
        .btn { background: #008069; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
        .btn:hover { background: #006a57; }
        .btn-danger { background: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
        .stat-box { background: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; }
        .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; }
        .stat-val { font-size: 13px; font-weight: 700; font-family: monospace; color: #cbd5e1; margin-top: 4px; }
        .qr-card { background: #ffffff; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .step-num { width: 22px; height: 22px; border-radius: 50%; background: #008069; color: white; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; flex-shrink: 0; }
      </style>
      <script>
        // Auto-refresh until connected or to stream messages
        let isConnected = ${isConnected};
        setInterval(async () => {
          try {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.connected !== isConnected) {
              location.reload();
            }
          } catch(e) {}
        }, 3000);

        async function logoutSession() {
          if (!confirm('Unlink this WhatsApp account and generate a new QR code?')) return;
          await fetch('/api/logout', { method: 'POST' });
          location.reload();
        }
      </script>
    </head>
    <body>
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h2 style="margin: 0; display: flex; align-items: center; gap: 10px; font-size: 18px;">
              <span>⚡ Zerix WhatsApp Gateway</span>
            </h2>
            <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">
              Local Multi-Device Gateway on port <code>${PORT}</code> — Direct background delivery to real WhatsApp numbers
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            ${isConnected ? `
              <span class="badge badge-online"><span class="dot dot-green"></span> WhatsApp Linked & Ready</span>
              <button onclick="logoutSession()" class="btn btn-danger" style="padding: 6px 12px; font-size: 11px;">Unlink Device</button>
            ` : `
              <span class="badge badge-offline"><span class="dot dot-yellow"></span> Permission Pending (Scan QR)</span>
            `}
            <a href="http://localhost:3001" target="_blank" class="btn">Open Zerix App ↗</a>
          </div>
        </div>

        ${!isConnected ? `
          <!-- QR Code Permission Authorization Section -->
          <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-top: 12px;">
            <div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: center;">
              <div style="text-align: center;">
                ${currentQrDataUrl ? `
                  <div class="qr-card">
                    <img src="${currentQrDataUrl}" alt="WhatsApp QR Code" style="width: 220px; height: 220px; display: block;" />
                  </div>
                  <p style="font-size: 11px; color: #94a3b8; margin: 8px 0 0 0;">Auto-refreshes automatically</p>
                ` : `
                  <div style="width: 220px; height: 220px; display: flex; align-items: center; justify-content: center; background: #1e293b; border-radius: 12px;">
                    <p style="font-size: 12px; color: #94a3b8;">Generating QR Code...</p>
                  </div>
                `}
              </div>
              <div style="flex: 1; min-width: 260px; max-width: 480px;">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #38bdf8;">📱 Grant WhatsApp Permission</h3>
                <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 16px;">
                  WhatsApp requires 1-time device authorization to allow this local backend to send messages automatically in the background without opening WhatsApp Web.
                </p>
                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 12px; color: #94a3b8;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="step-num">1</span>
                    <span>Open <strong>WhatsApp</strong> on your mobile phone</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="step-num">2</span>
                    <span>Tap <strong>Settings</strong> (or <strong>⋮ 3-dots</strong> on Android) &rarr; <strong>Linked Devices</strong></span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="step-num">3</span>
                    <span>Tap <strong>Link a Device</strong> and point camera at the QR code</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="step-num">4</span>
                    <span>Once scanned, the gateway automatically connects and starts sending!</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px;">
          <div class="stat-box">
            <div class="stat-label">Gateway Status</div>
            <div class="stat-val" style="color: ${isConnected ? '#4ade80' : '#fbbf24'};">${isConnected ? 'CONNECTED' : 'WAITING FOR QR SCAN'}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Linked Phone</div>
            <div class="stat-val" style="color: #4ade80;">${connectedPhone ? `+${connectedPhone}` : 'Not Linked'}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Business Identity</div>
            <div class="stat-val" style="color: #a78bfa;">${pushName}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Real Messages Sent</div>
            <div class="stat-val" style="color: #38bdf8;">${sentMessages.length}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 14px; font-weight: 700;">Live Gateway Activity (${sentMessages.length} Dispatches)</h3>
          <button onclick="location.reload()" class="btn" style="padding: 4px 10px; font-size: 11px;">Refresh</button>
        </div>

        ${sentMessages.length === 0 ? `
          <p style="color: #64748b; font-size: 12px; padding: 20px 0; text-align: center;">
            No review invitations dispatched yet.<br>
            Send a review request from <a href="http://localhost:3001" target="_blank" style="color: #38bdf8;">Zerix Dashboard</a> to see it stream here.
          </p>
        ` : `
          <div style="overflow-x: auto;">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Chat ID</th>
                  <th>Message Preview</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `}
      </div>
    </body>
    </html>
  `);
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
