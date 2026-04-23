# Camera Agent (On-Prem)

Agent chạy trong LAN để lấy snapshot từ RTSP (camera nội bộ) và trả ảnh JPEG qua HTTP. Backend cloud (Railway) hoặc web (Vercel) gọi vào agent thông qua Cloudflare Tunnel.

## Yêu cầu

- Node.js 18+
- ffmpeg có trong PATH (agent dùng ffmpeg để cắt 1 frame)

## Biến môi trường

- `PORT` (mặc định `8787`)
- `CAMERA_AGENT_TOKEN` (tuỳ chọn) nếu set thì các endpoint `/snapshot` yêu cầu header `x-agent-token`

## Chạy agent

Tại thư mục `phhotel-api/backend/camera-agent`:

```bash
node server.js
```

Test:

- `http://localhost:8787/health` → `{ "ok": true }`
- `http://localhost:8787/info` → thông tin port + các IP LAN của máy chạy agent

## Endpoint

- `GET /health`
- `GET /info`
- `GET /snapshot?rtspUrl=...` (cần encode)
- `POST /snapshot` body: `{ "rtspUrl": "rtsp://..." }`

## Lưu ý về ffmpeg

Nếu agent trả về lỗi kiểu `Agent chưa cài ffmpeg` hoặc `Không thể chạy ffmpeg`, hãy cài ffmpeg trên máy chạy agent và đảm bảo lệnh `ffmpeg` chạy được trong terminal.

## Cloudflare Tunnel (subdomain cố định)

Ví dụ dùng subdomain: `camera-agent.phgrouptechs.com`

1) Login:

```bash
cloudflared tunnel login
```

2) Tạo tunnel:

```bash
cloudflared tunnel create phhotel-camera-agent
```

3) Route DNS:

```bash
cloudflared tunnel route dns <TUNNEL_UUID> camera-agent.phgrouptechs.com
```

4) Tạo config:

Tạo file `C:\Users\<User>\.cloudflared\config.yml` (Windows) hoặc `~/.cloudflared/config.yml` (Linux/macOS):

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: C:\Users\<User>\.cloudflared\<TUNNEL_UUID>.json

ingress:
  - hostname: camera-agent.phgrouptechs.com
    service: http://localhost:8787
  - service: http_status:404
```

5) Run tunnel:

```bash
cloudflared tunnel run <TUNNEL_UUID>
```

Test:

- `https://camera-agent.phgrouptechs.com/health`

## Cấu hình trong PHHotel UI

Trong trang Camera Settings:

- Access Mode: `Agent (On-Prem)`
- Agent URL: `https://camera-agent.phgrouptechs.com`
- Agent Token: nhập đúng token nếu bạn có set `CAMERA_AGENT_TOKEN`
- IP/Port/Username/Password/RTSP Path: theo thông tin camera

