#!/usr/bin/env node
// Zero-dependency static server for AfroLinga.
//
//   node tools/serve.mjs             http://localhost:8080 – offline mode works on THIS computer.
//   node tools/serve.mjs --usb       same, plus "adb reverse" so an Android phone on USB can open http://localhost:8080.
//   node tools/serve.mjs --phone     https://<your-LAN-IP>:8443 for testing on phones, plus a setup page
//                                    at http://<your-LAN-IP>:8081 that installs the local certificate.
//
// Why: browsers only enable the offline engine (service worker) and "Install app" on https:// or
// http://localhost. A phone opening http://192.168.x.x gets neither, so the app can't work offline.
// --phone creates a private certificate authority in .certs/ (once) that you install on the phone;
// it is restricted to local-network addresses so it cannot be used for real websites.
//
// Options: --port=8080  --https-port=8443  --setup-port=8081

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stampServiceWorker } from './stamp-sw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CERTS = path.join(ROOT, '.certs');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const PHONE = Boolean(args.phone);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.txt': 'text/plain; charset=utf-8',
};

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => a.address);
}

// ---------- static files ----------

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(ROOT, `.${pathname}`);
  const relative = path.relative(ROOT, file);
  // Never serve outside the project or hidden files/folders (.certs holds private keys).
  if (relative.startsWith('..') || relative.split(path.sep).some(p => p.startsWith('.'))) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
  res.on('finish', () => log(req, res));
}

function log(req, res) {
  if (res.statusCode >= 400 && res.statusCode !== 404) console.log(`${res.statusCode} ${req.method} ${req.url}`);
}

function listen(server, port, retries = 10) {
  return new Promise((resolve, reject) => {
    server.once('error', err => {
      if (err.code === 'EADDRINUSE' && retries > 0) {
        console.log(`  port ${port} is busy, trying ${port + 1}…`);
        resolve(listen(server, port + 1, retries - 1));
      } else reject(err);
    });
    server.listen(port, PHONE ? '0.0.0.0' : '127.0.0.1', () => resolve(port));
  });
}

// ---------- local certificate authority (phone mode) ----------

function openssl(...a) {
  execFileSync('openssl', a, { stdio: 'pipe' });
}

function ensureCertificates(ips) {
  fs.mkdirSync(CERTS, { recursive: true, mode: 0o700 });
  const caKey = path.join(CERTS, 'ca.key');
  const caCrt = path.join(CERTS, 'afrolinga-local-ca.crt');
  const key = path.join(CERTS, 'server.key');
  const crt = path.join(CERTS, 'server.crt');
  const stamp = path.join(CERTS, 'server-ips.json');

  if (!fs.existsSync(caKey) || !fs.existsSync(caCrt)) {
    console.log('Creating a local certificate authority (one time)…');
    const cnf = path.join(CERTS, 'ca.cnf');
    fs.writeFileSync(
      cnf,
      [
        '[req]',
        'distinguished_name = dn',
        'x509_extensions = v3_ca',
        'prompt = no',
        '[dn]',
        `CN = AfroLinga Local Dev CA (${os.hostname()})`,
        '[v3_ca]',
        'basicConstraints = critical, CA:TRUE, pathlen:0',
        'keyUsage = critical, keyCertSign, cRLSign',
        'subjectKeyIdentifier = hash',
        // Only valid for localhost and private network addresses – useless for real websites.
        'nameConstraints = critical, permitted;DNS:localhost, permitted;DNS:.local, permitted;IP:127.0.0.0/255.0.0.0, permitted;IP:10.0.0.0/255.0.0.0, permitted;IP:172.16.0.0/255.240.0.0, permitted;IP:192.168.0.0/255.255.0.0',
      ].join('\n'),
    );
    openssl('req', '-x509', '-new', '-nodes', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-keyout', caKey, '-out', caCrt, '-config', cnf);
    fs.chmodSync(caKey, 0o600);
    fs.rmSync(path.join(CERTS, 'server.crt'), { force: true });
  }

  const wanted = JSON.stringify([...ips].sort());
  const current = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8') : '';
  const expiresSoon = fs.existsSync(crt) && Date.parse(new crypto.X509Certificate(fs.readFileSync(crt)).validTo) < Date.now() + 7 * 864e5;
  if (!fs.existsSync(crt) || current !== wanted || expiresSoon) {
    console.log('Creating the server certificate for', ips.join(', '));
    const ext = path.join(CERTS, 'server.ext');
    const csr = path.join(CERTS, 'server.csr');
    fs.writeFileSync(
      ext,
      [
        'basicConstraints = CA:FALSE',
        'keyUsage = critical, digitalSignature, keyEncipherment',
        'extendedKeyUsage = serverAuth',
        `subjectAltName = DNS:localhost, IP:127.0.0.1${ips.map(ip => `, IP:${ip}`).join('')}`,
      ].join('\n'),
    );
    openssl('req', '-new', '-nodes', '-newkey', 'rsa:2048', '-keyout', key, '-out', csr, '-subj', '/CN=AfroLinga dev server');
    // 397 days is the maximum lifetime iOS/Chrome accept for server certificates.
    openssl('x509', '-req', '-in', csr, '-CA', caCrt, '-CAkey', caKey, '-CAcreateserial', '-out', crt, '-days', '397', '-sha256', '-extfile', ext);
    fs.chmodSync(key, 0o600);
    fs.writeFileSync(stamp, wanted);
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt), caCrt };
}

function setupPage(ips, httpsPort) {
  const links = ips.map(ip => `<a class="go" href="https://${ip}:${httpsPort}/">https://${ip}:${httpsPort}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AfroLinga – phone setup</title><style>
body{font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:20px;line-height:1.5;background:#fffaf0;color:#1d1b16}
h1{color:#0f7b4f}h2{margin-top:28px}a.btn,a.go{display:block;text-align:center;padding:14px;border-radius:14px;font-weight:700;text-decoration:none;margin:10px 0}
a.btn{background:#0f7b4f;color:#fff}a.go{background:#f2a900;color:#1d1b16}ol li{margin:6px 0}small{color:#6b6458}code{background:#eee;padding:1px 5px;border-radius:5px}
</style></head><body>
<h1>📲 AfroLinga – phone setup</h1>
<p>Phones only allow offline apps over a secure (https) link. This one-time step lets your phone trust your computer's local test server.</p>
<h2>1. Download the certificate</h2>
<a class="btn" href="/afrolinga-local-ca.crt">⬇️ Download certificate</a>
<h2>2. Install it</h2>
<p><b>Android</b></p><ol>
<li>Settings → Security (or "Security &amp; privacy") → More security settings → Encryption &amp; credentials</li>
<li>Install a certificate → <b>CA certificate</b> → Install anyway → pick <code>afrolinga-local-ca.crt</code></li></ol>
<p><b>iPhone / iPad</b> (use Safari)</p><ol>
<li>Tap "Allow" when asked to download the profile</li>
<li>Settings → General → VPN &amp; Device Management → AfroLinga Local Dev CA → Install</li>
<li>Settings → General → About → Certificate Trust Settings → turn on <b>AfroLinga Local Dev CA</b></li></ol>
<h2>3. Open the app</h2>${links}
<p>Then use <b>Install</b> (Android/Chrome) or <b>Share → Add to Home Screen</b> (iPhone). Open the installed app once while connected so it can save itself, then try airplane mode.</p>
<p><small>The certificate only works for local addresses (192.168.x.x, 10.x.x.x, localhost), not real websites. Remove it from the phone when you are done testing.
For real users, host the app on any https site (GitHub Pages, Netlify, Cloudflare Pages) – no certificate step needed.</small></p>
</body></html>`;
}

// ---------- start ----------

await stampServiceWorker({ quiet: true });

if (!PHONE) {
  const port = await listen(http.createServer(serveStatic), Number(args.port) || 8080);
  console.log(`\n  AfroLinga running at  http://localhost:${port}\n`);
  if (args.usb) {
    // Android over USB: the phone's localhost:<port> is forwarded here, and localhost counts as secure.
    try {
      execFileSync('adb', ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'pipe' });
      console.log(`  📱 USB phone connected – open  http://localhost:${port}  in Chrome on the phone.\n`);
    } catch (err) {
      console.log(`  ⚠️  adb reverse failed: ${String(err.stderr || err.message).trim()}`);
      console.log('     Plug the phone in with USB debugging enabled (Settings → Developer options) and accept the prompt.\n');
    }
  } else {
    console.log('  Testing on a phone? Run:  npm run serve:phone   (https on your Wi-Fi)');
    console.log('  Android over USB:         npm run phone:usb\n');
  }
} else {
  const ips = lanAddresses();
  if (!ips.length) {
    console.error('No network connection found – connect this computer to Wi-Fi first.');
    process.exit(1);
  }
  const { key, cert, caCrt } = ensureCertificates(ips);
  const httpsPort = await listen(https.createServer({ key, cert }, serveStatic), Number(args['https-port']) || 8443);
  const setup = http.createServer((req, res) => {
    if (req.url.startsWith('/afrolinga-local-ca.crt')) {
      res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="afrolinga-local-ca.crt"' });
      fs.createReadStream(caCrt).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(setupPage(ips, httpsPort));
  });
  const setupPort = await listen(setup, Number(args['setup-port']) || 8081);
  console.log('\n  AfroLinga phone testing (phone and computer must be on the same Wi-Fi)\n');
  for (const ip of ips) {
    console.log(`  1. First time only – on the phone open:  http://${ip}:${setupPort}`);
    console.log(`  2. Then open the app:                   https://${ip}:${httpsPort}\n`);
  }
}
