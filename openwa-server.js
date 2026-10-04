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
      <title>OpenWA — The Open-WhatsApp Gateway Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        :root {
          --wa-green: #25D366;
          --wa-teal: #128C7E;
          --wa-dark-teal: #075E54;
          --bg-dark: #0b0f19;
          --card-bg: #131b2e;
          --border: #1e293b;
        }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-dark); color: #f8fafc; margin: 0; padding: 1.5rem; }
        .container { max-width: 1040px; margin: 0 auto; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 14px; padding: 24px; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
        .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 14px; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; font-family: monospace; }
        .badge-online { background: rgba(37, 211, 102, 0.15); color: #4ade80; border: 1px solid rgba(37, 211, 102, 0.3); }
        .badge-offline { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .dot-green { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
        .dot-yellow { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
        .tabs { display: flex; gap: 6px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
        .tab-btn { background: transparent; border: none; color: #94a3b8; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .tab-btn:hover { color: #f8fafc; background: rgba(255,255,255,0.05); }
        .tab-btn.active { background: #128C7E; color: white; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
        th { text-align: left; padding: 10px; color: #94a3b8; border-bottom: 1px solid var(--border); font-weight: 600; }
        .btn { background: #128C7E; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: background 0.2s; }
        .btn:hover { background: #075E54; }
        .btn-danger { background: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 16px; }
        .stat-box { background: var(--bg-dark); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
        .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
        .stat-val { font-size: 14px; font-weight: 700; font-family: monospace; color: #cbd5e1; margin-top: 6px; }
        .qr-card { background: #ffffff; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .code-block { background: #0b0f19; border: 1px solid var(--border); border-radius: 8px; padding: 14px; font-family: monospace; font-size: 11px; color: #38bdf8; overflow-x: auto; margin-top: 8px; }
        input, textarea { background: #0b0f19; border: 1px solid var(--border); border-radius: 8px; padding: 10px; color: #f8fafc; font-size: 12px; width: 100%; box-sizing: border-box; }
        input:focus, textarea:focus { outline: none; border-color: #25D366; }
      </style>
      <script>
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
          if (!confirm('Unlink this WhatsApp account and generate a new QR code in OpenWA?')) return;
          await fetch('/api/logout', { method: 'POST' });
          location.reload();
        }

        async function sendTestMessage(e) {
          e.preventDefault();
          const phone = document.getElementById('test-phone').value.trim();
          const text = document.getElementById('test-text').value.trim();
          const btn = document.getElementById('test-send-btn');
          const resp = document.getElementById('test-response');
          if (!phone || !text) return alert('Phone number and message text required');

          btn.disabled = true;
          btn.textContent = 'Dispatching...';
          resp.textContent = 'Sending...';

          try {
            const res = await fetch('/api/sessions/${SESSION_ID}/messages/send-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId: phone, text })
            });
            const data = await res.json();
            resp.textContent = JSON.stringify(data, null, 2);
            if (res.ok) {
              alert('Message sent successfully!');
              setTimeout(() => location.reload(), 1000);
            } else {
              alert('Error: ' + (data.message || 'Dispatch failed'));
            }
          } catch(err) {
            resp.textContent = err.message;
            alert('Error: ' + err.message);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Send via OpenWA';
          }
        }

        function switchOpenwaTab(tabName) {
          document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
          document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
          document.getElementById('tab-content-' + tabName).style.display = 'block';
          document.getElementById('tab-btn-' + tabName).classList.add('active');
        }
      </script>
    </head>
    <body>
      <div class="container">
        
        <!-- OpenWA Official Brand Header -->
        <div class="card">
          <div class="header-bar">
            <div style="display: flex; align-items: center; gap: 14px;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="#25D366">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 012.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.12.82.83-3.04-.19-.3a8.217 8.217 0 01-1.26-4.48c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.51c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.71 4.3 3.8.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z"/>
              </svg>
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #25D366; letter-spacing: -0.5px;">OpenWA</h1>
                  <span style="background: rgba(37, 211, 102, 0.15); color: #25D366; border: 1px solid rgba(37, 211, 102, 0.3); font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; font-family: monospace;">GATEWAY API</span>
                </div>
                <p style="color: #94a3b8; font-size: 12px; margin: 3px 0 0 0;">
                  Open-WhatsApp Multi-Device REST API Server • Port <code>${PORT}</code> • Session <code>${SESSION_ID.substring(0, 13)}...</code>
                </p>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              ${isConnected ? `
                <span class="badge badge-online"><span class="dot dot-green"></span> SESSION CONNECTED (+${connectedPhone})</span>
                <button onclick="logoutSession()" class="btn btn-danger" style="padding: 6px 12px; font-size: 11px;">Unlink</button>
              ` : `
                <span class="badge badge-offline"><span class="dot dot-yellow"></span> WAITING FOR QR SCAN</span>
              `}
              <a href="http://localhost:3001" target="_blank" class="btn" style="background: #008069;">Zerix App ↗</a>
            </div>
          </div>

          <!-- OpenWA Navigation Tabs -->
          <div class="tabs">
            <button id="tab-btn-sessions" onclick="switchOpenwaTab('sessions')" class="tab-btn active">📱 Sessions</button>
            <button id="tab-btn-activity" onclick="switchOpenwaTab('activity')" class="tab-btn">💬 Live Message Feed (${sentMessages.length})</button>
            <button id="tab-btn-tester" onclick="switchOpenwaTab('tester')" class="tab-btn">🚀 API Tester</button>
            <button id="tab-btn-docs" onclick="switchOpenwaTab('docs')" class="tab-btn">🔌 Swagger Docs</button>
          </div>

          <!-- TAB 1: SESSIONS & CONNECTION -->
          <div id="tab-content-sessions" class="tab-content">
            ${!isConnected ? `
              <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-top: 8px;">
                <div style="display: flex; flex-wrap: wrap; gap: 28px; align-items: center; justify-content: center;">
                  <div style="text-align: center;">
                    ${currentQrDataUrl ? `
                      <div class="qr-card">
                        <img src="${currentQrDataUrl}" alt="OpenWA WhatsApp QR Code" style="width: 220px; height: 220px; display: block;" />
                      </div>
                      <p style="font-size: 11px; color: #94a3b8; margin: 8px 0 0 0;">Auto-refreshes every 20 seconds</p>
                    ` : `
                      <div style="width: 220px; height: 220px; display: flex; align-items: center; justify-content: center; background: #1e293b; border-radius: 12px;">
                        <p style="font-size: 12px; color: #94a3b8;">Generating pairing QR code...</p>
                      </div>
                    `}
                  </div>
                  <div style="flex: 1; min-width: 260px; max-width: 480px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #25D366;">Link WhatsApp to OpenWA</h3>
                    <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 16px;">
                      OpenWA uses WhatsApp's official Multi-Device protocol to route automated HTTP messages in the background without needing a browser window open.
                    </p>
                    <ol style="margin: 0; padding-left: 20px; font-size: 12px; color: #94a3b8; line-height: 1.8;">
                      <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                      <li>Go to <strong>Settings</strong> &rarr; <strong>Linked Devices</strong></li>
                      <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
                      <li>OpenWA will save the session token and auto-reconnect on boot!</li>
                    </ol>
                  </div>
                </div>
              </div>
            ` : ''}

            <div class="stat-grid">
              <div class="stat-box">
                <div class="stat-label">Session ID</div>
                <div class="stat-val" style="color: #38bdf8; font-size: 12px; word-break: break-all;">${SESSION_ID}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Linked WhatsApp Phone</div>
                <div class="stat-val" style="color: #25D366;">${connectedPhone ? '+' + connectedPhone : 'Not Connected'}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Session Name</div>
                <div class="stat-val" style="color: #a78bfa;">${pushName}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Protocol Engine</div>
                <div class="stat-val" style="color: #f59e0b;">Baileys Multi-Device (WebSocket)</div>
              </div>
            </div>
          </div>

          <!-- TAB 2: LIVE MESSAGE ACTIVITY -->
          <div id="tab-content-activity" class="tab-content" style="display: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="margin: 0; font-size: 14px; font-weight: 700;">Dispatched WhatsApp Messages (${sentMessages.length})</h3>
              <button onclick="location.reload()" class="btn" style="padding: 4px 10px; font-size: 11px;">Refresh</button>
            </div>

            ${sentMessages.length === 0 ? `
              <p style="color: #64748b; font-size: 12px; padding: 24px 0; text-align: center;">
                No messages dispatched yet through this OpenWA session.<br>
                Use the <strong>API Tester</strong> tab or trigger a dispatch from Zerix to test.
              </p>
            ` : `
              <div style="overflow-x: auto;">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Chat ID</th>
                      <th>Message Content</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            `}
          </div>

          <!-- TAB 3: API TESTER -->
          <div id="tab-content-tester" class="tab-content" style="display: none;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700;">OpenWA Direct Message Dispatcher</h3>
            <p style="color: #94a3b8; font-size: 12px; margin-bottom: 14px;">
              Send an instant WhatsApp message directly using OpenWA's <code>/api/sessions/:sessionId/messages/send-text</code> endpoint.
            </p>

            <form onsubmit="sendTestMessage(event)" style="display: grid; gap: 12px; max-width: 580px;">
              <div>
                <label style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">RECIPIENT PHONE NUMBER (WITH COUNTRY CODE)</label>
                <input id="test-phone" type="text" placeholder="e.g. +917349710647 or 919876543210" required />
              </div>

              <div>
                <label style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">MESSAGE TEXT</label>
                <textarea id="test-text" rows="3" placeholder="Hello from OpenWA Gateway!" required></textarea>
              </div>

              <div style="display: flex; gap: 10px; align-items: center;">
                <button type="submit" id="test-send-btn" class="btn" style="background: #25D366; color: #0b0f19; font-weight: 700;">
                  Send via OpenWA
                </button>
                <span style="font-size: 11px; color: #64748b;">Routes via linked session <code>${SESSION_ID.substring(0, 8)}</code></span>
              </div>
            </form>

            <div style="margin-top: 16px;">
              <div class="stat-label">API RESPONSE:</div>
              <pre id="test-response" class="code-block">Waiting for dispatch...</pre>
            </div>
          </div>

          <!-- TAB 4: SWAGGER & API DOCS -->
          <div id="tab-content-docs" class="tab-content" style="display: none;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700;">OpenWA REST Endpoints Reference</h3>
            <p style="color: #94a3b8; font-size: 12px; margin-bottom: 14px;">
              Integrate with OpenWA using standard HTTP REST requests.
            </p>

            <div style="display: grid; gap: 14px;">
              <div style="background: var(--bg-dark); border: 1px solid var(--border); border-radius: 8px; padding: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="background: #25D366; color: #0b0f19; font-weight: 800; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-family: monospace;">POST</span>
                  <span style="font-family: monospace; font-size: 12px; font-weight: 700;">/api/sessions/:sessionId/messages/send-text</span>
                </div>
                <div class="code-block">curl -X POST http://localhost:2886/api/sessions/${SESSION_ID}/messages/send-text \\
  -H "Content-Type: application/json" \\
  -d '{"chatId": "917349710647@c.us", "text": "Hello from OpenWA!"}'</div>
              </div>

              <div style="background: var(--bg-dark); border: 1px solid var(--border); border-radius: 8px; padding: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="background: #38bdf8; color: #0b0f19; font-weight: 800; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-family: monospace;">GET</span>
                  <span style="font-family: monospace; font-size: 12px; font-weight: 700;">/api/status</span>
                </div>
                <div class="code-block">curl http://localhost:2886/api/status</div>
              </div>

              <div style="background: var(--bg-dark); border: 1px solid var(--border); border-radius: 8px; padding: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="background: #a78bfa; color: #0b0f19; font-weight: 800; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-family: monospace;">GET</span>
                  <span style="font-family: monospace; font-size: 12px; font-weight: 700;">/api/qr</span>
                </div>
                <div class="code-block">curl http://localhost:2886/api/qr</div>
              </div>
            </div>
          </div>

        </div>

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
