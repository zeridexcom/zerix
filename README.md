# Zerix — Automated Review Collection & WhatsApp Cloud Platform

A modern, high-performance Node.js server and dashboard that automates Google review collection and customer follow-ups via WhatsApp (Self-Hosted Gateway & Cloud), Email (SMTP), and SMS.

## Features

- ⚡ **Zerix Interactive Dashboard** — Real-time metrics, live WhatsApp gateway connection indicator, customer activity table, and settings manager.
- 📱 **Zerix WhatsApp Direct Gateway** — Direct WhatsApp integration with self-hosted headless browser engine or direct chat links.
- 🔔 **Interactive Follow-up Hub** — Select individual or bulk customers, customize reminders on the fly with live preview, and dispatch with 1-click.
- 📬 **Multi-Channel Delivery** — WhatsApp, Email (SMTP), and SMS dispatching.
- 📝 **Live Template Editor** — Customise WhatsApp, Email, and SMS templates directly from the UI.
- ⚙️ **Editable Live Configuration** — Update business details, Google review links, and API credentials on the fly without server restarts.
- 🐳 **Docker & Cloud Ready** — Pre-configured Docker & Docker Compose setup for instant cloud deployment on Render, Railway, VPS, or AWS.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/zerix/zerix.git
cd zerix

# Install dependencies
npm install

# Start the server
npm run dev
```

The Zerix dashboard will be accessible at `http://localhost:3001`.

## Environment Configuration

Configure your environment variables in `.env`:

```env
PORT=3001
BUSINESS_NAME=Zerix
GOOGLE_REVIEW_URL=https://g.page/r/YOUR_REVIEW_LINK/review
FOLLOW_UP_DAYS=3

# WhatsApp Gateway (Self-Hosted Engine)
OPENWA_API_URL=http://localhost:2886
OPENWA_API_KEY=your-api-key
OPENWA_SESSION_ID=default

# Email (SMTP) - Optional
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=reviews@zerix.app
SMTP_PASS=your-smtp-password
SMTP_FROM=reviews@zerix.app
```

## API Endpoints

### 1. Send Review Request
```http
POST /api/request
Content-Type: application/json

{
  "customerName": "Jane Smith",
  "phone": "+447700900000",
  "channel": "whatsapp",
  "jobReference": "JOB-1029"
}
```

### 2. Check Requests
```http
GET /api/requests
GET /api/requests/:id
```

### 3. Send Single Follow-up
```http
POST /api/requests/:id/follow-up
Content-Type: application/json

{
  "customMessage": "Hi Jane, just following up on our service..."
}
```

### 4. Trigger Batch Follow-ups
```http
POST /api/follow-up
Content-Type: application/json

{
  "requestIds": ["abc-123", "def-456"],
  "customMessage": "Quick reminder to share your experience with Zerix!"
}
```

## Licence
MIT — Created by Zerix.
