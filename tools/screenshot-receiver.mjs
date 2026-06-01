#!/usr/bin/env node
/**
 * AXHY screenshot receiver — DEV-only.
 *
 * Accepts POST /screenshot with JSON body { filename, data (base64 PNG) } from
 * the worker mobile app's "Send to Claude" FAB, decodes the image, and writes
 * it to /tmp/axhy-debug-screenshots/<filename>.
 *
 * Each save logs a single line to stdout so the Claude harness Monitor tool
 * can stream notifications when new screenshots land.
 *
 * Zero npm deps — pure Node built-ins. Binds 0.0.0.0 so the iPhone on the same
 * LAN can reach it.
 *
 * Run:
 *   node tools/screenshot-receiver.mjs
 *
 * Health check:
 *   curl http://localhost:9999/
 */

import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.AXHY_SCREENSHOT_PORT ?? 9999);
const HOST = '0.0.0.0';
const SAVE_DIR = '/tmp/axhy-debug-screenshots';
const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25MB — generous for a phone PNG

mkdirSync(SAVE_DIR, { recursive: true });

/** Strip path separators / parent-traversal — only allow a leaf filename. */
function sanitizeFilename(input) {
  const fallback = `screenshot-${Date.now()}.png`;
  if (typeof input !== 'string' || input.length === 0) return fallback;
  const leaf = path.basename(input);
  const cleaned = leaf.replace(/[^A-Za-z0-9._-]/g, '-');
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') return fallback;
  return cleaned.toLowerCase().endsWith('.png') ? cleaned : `${cleaned}.png`;
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    send(res, 200, 'axhy screenshot receiver alive\n');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/screenshot') {
    send(res, 404, 'not found\n');
    return;
  }

  let received = 0;
  const chunks = [];
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      aborted = true;
      send(res, 413, `payload too large (>${MAX_BODY_BYTES} bytes)\n`);
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (aborted) return;
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      const parsed = JSON.parse(raw);
      const filename = sanitizeFilename(parsed.filename);
      const data = parsed.data;
      if (typeof data !== 'string' || data.length === 0) {
        send(res, 400, 'missing "data" base64 field\n');
        return;
      }
      const buf = Buffer.from(data, 'base64');
      if (buf.length === 0) {
        send(res, 400, 'decoded body is empty\n');
        return;
      }
      const fullPath = path.join(SAVE_DIR, filename);
      writeFileSync(fullPath, buf);
      process.stdout.write(`[receiver] saved ${fullPath} (${buf.length} bytes)\n`);
      send(
        res,
        200,
        JSON.stringify({ ok: true, path: fullPath, bytes: buf.length }) + '\n',
        'application/json',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[receiver] error: ${msg}\n`);
      send(res, 400, `bad request: ${msg}\n`);
    }
  });

  req.on('error', (err) => {
    process.stderr.write(`[receiver] request error: ${err.message}\n`);
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `[receiver] listening on http://${HOST}:${PORT} -> ${SAVE_DIR}\n`,
  );
});
