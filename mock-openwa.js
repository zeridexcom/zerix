const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.MOCK_OPENWA_PORT || 2886;
const SESSION_ID = process.env.OPENWA_SESSION_ID || 'e1519353-c186-4c0c-ac2b-90e5b01090a7';
const EXPECTED_KEY = process.env.OPENWA_API_KEY || 'owa_k1_938da88d4539053105b4cffcdfa38005b0fd4d1f1fa505e79147c0d6690cf9b6';

app.use(express.json());

// In-memory message dispatch log for mock inspection
const sentMessages = [];

// Middleware for basic logging
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  // We allow requests even if key is missing in dev mode, but log it
  next();
});

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'OpenWA Mock Gateway'
  });
});

// Session list endpoint (queried by Zerix server.js)
app.get('/api/sessions', (req, res) => {
  res.json([
    {
      id: SESSION_ID,
      name: 'default',
      status: 'ready',
      phone: '447700900123',
      pushName: 'Zerix WhatsApp Gateway',
      engine: 'baileys-mock',
      connectedAt: new Date().toISOString()
    }
  ]);
});

// Single session detail
app.get('/api/sessions/:sessionId', (req, res) => {
  res.json({
    id: req.params.sessionId || SESSION_ID,
    name: 'default',
    status: 'ready',
    phone: '447700900123',
    pushName: 'Zerix WhatsApp Gateway',
    engine: 'baileys-mock'
  });
});

// Send text message endpoint (called by Zerix server.js)
app.post('/api/sessions/:sessionId/messages/send-text', (req, res) => {
  const { chatId, text } = req.body || {};
  const sessionId = req.params.sessionId;

  if (!chatId || !text) {
    return res.status(400).json({
      error: true,
      message: 'Both chatId and text are required'
    });
  }

  const messageId = 'mock_wa_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const record = {
    messageId,
    sessionId,
    chatId,
    text,
    timestamp: Date.now(),
    status: 'SENT'
  };

  sentMessages.unshift(record);
  if (sentMessages.length > 50) sentMessages.pop();

  console.log(`\x1b[32m[Mock OpenWA Gateway]\x1b[0m 💬 Sent to \x1b[36m${chatId}\x1b[0m: "${text.substring(0, 60)}..." (ID: ${messageId})`);

  res.status(200).json({
    success: true,
    messageId,
    timestamp: record.timestamp,
    chatId,
    sessionId
  });
});

// Simple web UI for testing & viewing mock gateway activity
app.get('/', (req, res) => {
  const rows = sentMessages.map(m => `
    <tr style="border-bottom: 1px solid #1e293b;">
      <td style="padding: 10px; font-family: monospace; color: #38bdf8;">${new Date(m.timestamp).toLocaleTimeString()}</td>
      <td style="padding: 10px; font-family: monospace; color: #a78bfa;">${m.chatId}</td>
      <td style="padding: 10px; color: #e2e8f0;">${m.text}</td>
      <td style="padding: 10px;"><span style="background: rgba(34, 197, 94, 0.2); color: #4ade80; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: bold;">DELIVERED</span></td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>OpenWA Mock Gateway</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; margin: 0; padding: 2rem; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; max-width: 900px; margin: 0 auto 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
        .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
        th { text-align: left; padding: 10px; color: #94a3b8; border-bottom: 1px solid #1e293b; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0; display: flex; align-items: center; gap: 10px;">
            <span>⚡ OpenWA Mock Gateway</span>
          </h2>
          <span class="badge"><span class="dot"></span> Online & Ready</span>
        </div>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 0;">
          Emulating OpenWA API on <code>http://localhost:${PORT}</code>. Messages dispatched from Zerix will appear below.
        </p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px;">
          <div style="background: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Active Session</div>
            <div style="font-size: 13px; font-weight: 600; font-family: monospace; color: #cbd5e1; margin-top: 4px;">${SESSION_ID.substring(0, 16)}...</div>
          </div>
          <div style="background: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Simulated Phone</div>
            <div style="font-size: 13px; font-weight: 600; font-family: monospace; color: #4ade80; margin-top: 4px;">+44 7700 900123</div>
          </div>
          <div style="background: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Messages Processed</div>
            <div style="font-size: 13px; font-weight: 600; font-family: monospace; color: #38bdf8; margin-top: 4px;">${sentMessages.length}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin: 0 0 12px; font-size: 15px;">Simulated Dispatches (${sentMessages.length})</h3>
        ${sentMessages.length === 0 ? '<p style="color: #64748b; font-size: 13px;">No messages sent yet. Send a WhatsApp request from the Zerix dashboard to see it here.</p>' : `
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Recipient</th>
                <th>Message Content</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        `}
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`\x1b[32m✔ OpenWA Mock Gateway running at http://localhost:${PORT}\x1b[0m`);
  console.log(`  - Active session: ${SESSION_ID}`);
  console.log(`  - Phone: +44 7700 900123`);
  console.log(`  - Dashboard: http://localhost:${PORT}`);
});
