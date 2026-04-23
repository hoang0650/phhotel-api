const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const os = require('os');

const AGENT_TOKEN = process.env.CAMERA_AGENT_TOKEN || '';
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function isAuthorized(req) {
  if (!AGENT_TOKEN) return true;
  return req.headers['x-agent-token'] === AGENT_TOKEN;
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

function getLocalIpv4s() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net && net.family === 'IPv4' && !net.internal && net.address) {
        ips.push(net.address);
      }
    }
  }
  return Array.from(new Set(ips));
}

app.get('/info', (_req, res) => {
  const ips = getLocalIpv4s();
  const urls = [`http://localhost:${PORT}`].concat(ips.map(ip => `http://${ip}:${PORT}`));
  res.status(200).json({ ok: true, port: PORT, urls, localIps: ips });
});

app.get('/snapshot', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const rtspUrl = String(req.query.rtspUrl || '');
  return handleSnapshot(rtspUrl, res);
});

app.post('/snapshot', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const rtspUrl = String(req.body?.rtspUrl || '');
  return handleSnapshot(rtspUrl, res);
});

function handleSnapshot(rtspUrl, res) {
  if (!rtspUrl) {
    return res.status(400).json({ message: 'Missing rtspUrl' });
  }

  let finished = false;
  const finishJson = (status, payload) => {
    if (finished || res.headersSent) return;
    finished = true;
    return res.status(status).json(payload);
  };
  const finishJpeg = (buf) => {
    if (finished || res.headersSent) return;
    finished = true;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  };

  const args = [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-frames:v', '1',
    '-f', 'image2',
    '-vcodec', 'mjpeg',
    'pipe:1'
  ];

  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [];
  const errChunks = [];

  const killTimer = setTimeout(() => {
    try { ffmpeg.kill('SIGKILL'); } catch (_) {}
  }, 8000);

  ffmpeg.stdout.on('data', (d) => chunks.push(d));
  ffmpeg.stderr.on('data', (d) => errChunks.push(d));

  ffmpeg.on('error', (err) => {
    clearTimeout(killTimer);
    const isMissing = err && (err.code === 'ENOENT' || String(err.message || '').toLowerCase().includes('spawn ffmpeg'));
    return finishJson(500, { message: isMissing ? 'Agent chưa cài ffmpeg.' : 'Không thể chạy ffmpeg.', error: err.message });
  });

  ffmpeg.on('close', (code) => {
    clearTimeout(killTimer);
    if (code !== 0 || chunks.length === 0) {
      const errText = Buffer.concat(errChunks).toString('utf8');
      return finishJson(500, { message: 'Snapshot thất bại', details: errText.slice(-1200) });
    }
    const img = Buffer.concat(chunks);
    return finishJpeg(img);
  });
}

app.listen(PORT, () => {
  const ips = getLocalIpv4s();
  const urls = [`http://localhost:${PORT}`].concat(ips.map(ip => `http://${ip}:${PORT}`));
  console.log(`camera-agent listening on :${PORT}`);
  console.log(`camera-agent urls: ${urls.join(' | ')}`);
});
