const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

const AGENT_TOKEN = process.env.CAMERA_AGENT_TOKEN || '';
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(cors());

function isAuthorized(req) {
  if (!AGENT_TOKEN) return true;
  return req.headers['x-agent-token'] === AGENT_TOKEN;
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/snapshot', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const rtspUrl = String(req.query.rtspUrl || '');
  if (!rtspUrl) {
    return res.status(400).json({ message: 'Missing rtspUrl' });
  }

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
    return res.status(500).json({ message: isMissing ? 'Agent chưa cài ffmpeg.' : 'Không thể chạy ffmpeg.', error: err.message });
  });

  ffmpeg.on('close', (code) => {
    clearTimeout(killTimer);
    if (code !== 0 || chunks.length === 0) {
      const errText = Buffer.concat(errChunks).toString('utf8');
      return res.status(500).json({ message: 'Snapshot thất bại', details: errText.slice(-1200) });
    }
    const img = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(img);
  });
});

app.listen(PORT, () => {
  console.log(`camera-agent listening on :${PORT}`);
});

