// Lightweight Zero-Dependency Real-Time Sync & Static Web Server
// Supports PC + Mobile Phone + Tablet real-time sync over Wi-Fi & Local Network
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 8080;

// In-Memory & File-backed Tournament State
let sharedTournamentState = null;
const STATE_FILE = path.join(__dirname, 'tournament_state.json');

// Try loading persisted state from file
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    sharedTournamentState = JSON.parse(raw);
    console.log('[Server] Loaded persisted tournament state from file.');
  }
} catch (err) {
  console.warn('[Server] No previous tournament state file found, starting fresh.');
}

// Connected SSE (Server-Sent Events) Clients for sub-second push to phones & viewers
const sseClients = new Set();

function broadcastToClients(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers for multi-device sync
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- REAL-TIME SYNC API ---

  // 1. GET /api/state - Return current shared tournament state
  if (pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, state: sharedTournamentState }));
    return;
  }

  // 2. POST /api/state - Admin updates shared tournament state
  if (pathname === '/api/state' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        sharedTournamentState = {
          ...payload,
          updatedAt: Date.now()
        };

        // Persist to file asynchronously
        try {
          fs.writeFileSync(STATE_FILE, JSON.stringify(sharedTournamentState, null, 2));
        } catch (fsErr) {
          console.warn('[Server] Could not write state file:', fsErr.message);
        }

        // Push to all connected phones, tablets, and viewer browsers
        broadcastToClients({ type: 'STATE_SYNC', payload: sharedTournamentState });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, updatedAt: sharedTournamentState.updatedAt }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. POST /api/box-event - Broadcast live box shake and reveal animation events
  if (pathname === '/api/box-event' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        broadcastToClients({ type: 'BOX_EVENT', payload });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. GET /api/events - Server-Sent Events (SSE) stream for live push
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('retry: 2000\n\n');

    // Send initial state immediately upon connection
    if (sharedTournamentState) {
      res.write(`data: ${JSON.stringify({ type: 'STATE_SYNC', payload: sharedTournamentState })}\n\n`);
    }

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent path traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

import os from 'os';

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  let localIp = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
  }

  console.log(`====================================================`);
  console.log(`🏁 APEX VELOCITY REAL-TIME TOURNAMENT SERVER ONLINE`);
  console.log(`====================================================`);
  console.log(`💻 Local Host (PC / Laptop):  http://localhost:${PORT}`);
  console.log(`📱 All Devices (Admin & Viewer): http://${localIp}:${PORT}`);
  console.log(`⚡ Full Admin Access enabled for all devices (Mobile, PC, Tablet)`);
  console.log(`====================================================`);
});
