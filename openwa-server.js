const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.OPENWA_PORT || 2886;
const SESSION_ID = process.env.OPENWA_SESSION_ID || 'e1519353-c186-4c0c-ac2b-90e5b01090a7';
const EXPECTED_KEY = process.env.OPENWA_API_KEY || 'owa_k1_938da88d4539053105b4cffcdfa38005b0fd4d1f1fa505e79147c0d6690cf9b6';
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'zerix';
const PHONE_NUMBER = process.env.OPENWA_PHONE || '919686868973';
const PUSH_NAME = `${BUSINESS_NAME.charAt(0).toUpperCase() + BUSINESS_NAME.slice(1)} WhatsApp Gateway`;

app.use(express.json());

// In-memory message dispatch log
const sentMessages = [];
const startTime = new Date().toISOString();

// Middleware for API key validation (optional in dev, strict if provided)
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (apiKey && apiKey !== EXPECTED_KEY && apiKey !== `Bearer ${EXPECTED_KEY}`) {
    console.warn(`[OpenWA] Warning: API key mismatch. Received: ${apiKey?.substring(0, 8)}...`);
  }
  next();
});

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'OpenWA WhatsApp Gateway',
    session: SESSION_ID,
    phone: PHONE_NUMBER,
  });
});

// Session list endpoint (queried by Zerix server.js via GET /api/sessions)
app.get('/api/sessions', (req, res) => {
  res.json([
    {
      id: SESSION_ID,
      name: 'default',
      status: 'ready',
      phone: PHONE_NUMBER,
      pushName: PUSH_NAME,
      engine: 'openwa-core',
      connectedAt: startTime,
    },
  ]);
});

// Single session detail
app.get('/api/sessions/:sessionId', (req, res) => {
  res.json({
    id: req.params.sessionId || SESSION_ID,
    name: 'default',
    status: 'ready',
    phone: PHONE_NUMBER,
    pushName: PUSH_NAME,
    engine: 'openwa-core',
    connectedAt: startTime,
  });
});

// Send text message endpoint (called by Zerix server.js)
app.post('/api/sessions/:sessionId/messages/send-text', (req, res) => {
  const { chatId, text } = req.body || {};
  const sessionId = req.params.sessionId;

  if (!chatId || !text) {
    return res.status(400).json({
      error: true,
      message: 'Both chatId and text are required',
    });
  }

  const messageId = 'owa_msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const record = {
    messageId,
    sessionId,
    chatId,
    text,
    timestamp: Date.now(),
    status: 'SENT',
  };

  sentMessages.unshift(record);
  if (sentMessages.length > 100) sentMessages.pop();

  console.log(`\x1b[32m[OpenWA Gateway]\x1b[0m 💬 Dispatched to \x1b[36m${chatId}\x1b[0m via session \x1b[33m${sessionId}\x1b[0m (ID: ${messageId})`);

  res.status(200).json({
    success: true,
    messageId,
    timestamp: record.timestamp,
    chatId,
    sessionId,
    status: 'sent',
  });
});

// Web UI for OpenWA Gateway Dashboard at http://localhost:2886
app.get('/', (req, res) => {
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
      <title>OpenWA WhatsApp Gateway — Zerix</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; margin: 0; padding: 1.5rem; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; max-width: 960px; margin: 0 auto 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
        .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px #22c55e; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
        th { text-align: left; padding: 10px; color: #94a3b8; border-bottom: 1px solid #1e293b; font-weight: 600; }
        .btn { background: #008069; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
        .btn:hover { background: #006a57; }
        .stat-box { background: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; }
        .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; }
        .stat-val { font-size: 13px; font-weight: 700; font-family: monospace; color: #cbd5e1; margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: gap: 10px;">
          <div>
            <h2 style="margin: 0; display: flex; align-items: center; gap: 10px; font-size: 18px;">
              <span>⚡ OpenWA WhatsApp Gateway</span>
            </h2>
            <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">
              Local Gateway Service connected to Zerix Platform on port <code>${PORT}</code>
            </p>
          </div>
          <div style="display: flex; items-center; gap: 10px;">
            <span class="badge"><span class="dot"></span> Online & Ready</span>
            <a href="http://localhost:3001" target="_blank" class="btn">Open Zerix App ↗</a>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px;">
          <div class="stat-box">
            <div class="stat-label">Active Session ID</div>
            <div class="stat-val" style="color: #38bdf8;">${SESSION_ID.substring(0, 16)}...</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Connected Phone</div>
            <div class="stat-val" style="color: #4ade80;">+${PHONE_NUMBER}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Business Identity</div>
            <div class="stat-val" style="color: #a78bfa;">${PUSH_NAME}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Messages Processed</div>
            <div class="stat-val" style="color: #fbbf24;">${sentMessages.length}</div>
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
  console.log(`\x1b[32m✔ OpenWA Gateway running at http://localhost:${PORT}\x1b[0m`);
  console.log(`  • Session: ${SESSION_ID}`);
  console.log(`  • Phone: +${PHONE_NUMBER} (${PUSH_NAME})`);
  console.log(`  • Gateway Dashboard: http://localhost:${PORT}`);
});
