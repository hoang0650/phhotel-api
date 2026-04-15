const { Camera } = require('../models/camera');
const { Guest } = require('../models/guests'); // Import model Guest từ file guests.js của bạn
const axios = require('axios');
const guestsController = require('./guestsController');
const { spawn } = require('child_process');

// 1. Lưu cấu hình camera mới
exports.saveCameraConfig = async (req, res) => {
    try {
        const {
            hotelId,
            name,
            provider,
            ipAddress,
            port,
            username,
            password,
            rtspPath,
            accessMode,
            agentBaseUrl,
            agentToken,
            aiConfig,
            status
        } = req.body || {};

        if (!hotelId || !name || !provider || !ipAddress || !username || !password) {
            return res.status(400).json({ message: 'Thiếu dữ liệu cấu hình camera (hotelId, name, provider, ipAddress, username, password)' });
        }

        const camera = new Camera({
            hotelId,
            name,
            provider,
            ipAddress,
            port,
            username,
            password,
            rtspPath,
            accessMode,
            agentBaseUrl,
            agentToken,
            aiConfig,
            status
        });
        await camera.save();
        res.status(201).json({ message: 'Lưu cấu hình camera thành công', data: camera });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

exports.getCameras = async (req, res) => {
    try {
        const { hotelId } = req.query;
        if (!hotelId) {
            return res.status(400).json({ message: 'Thiếu hotelId' });
        }
        const cameras = await Camera.find({ hotelId }).sort({ createdAt: -1 }).lean();
        res.status(200).json({ data: cameras });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

exports.getActiveCamera = async (req, res) => {
    try {
        const { hotelId } = req.query;
        if (!hotelId) {
            return res.status(400).json({ message: 'Thiếu hotelId' });
        }
        const camera = await Camera.findOne({ hotelId, status: 'active' }).sort({ createdAt: -1 }).lean();
        res.status(200).json({ data: camera || null });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

function buildRtspUrl(camera) {
    const username = camera.username || '';
    const password = camera.password || '';
    const ipAddress = camera.ipAddress || '';
    const port = camera.port || 554;
    const path = camera.rtspPath || '/Streaming/Channels/101';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${ipAddress}:${port}${normalizedPath}`;
}

function maskRtspUrl(rtspUrl) {
    if (!rtspUrl) return '';
    try {
        const u = new URL(rtspUrl);
        if (u.password) {
            u.password = '***';
        }
        return u.toString();
    } catch (_) {
        return rtspUrl.replace(/:(?:[^:@/]+)@/, ':***@');
    }
}

function isPrivateIpv4(ip) {
    if (!ip) return false;
    const parts = String(ip).trim().split('.');
    if (parts.length !== 4) return false;
    const nums = parts.map(p => Number(p));
    if (nums.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
    const [a, b] = nums;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
}

exports.getCameraSnapshot = async (req, res) => {
    try {
        const { id } = req.params;
        const camera = await Camera.findById(id).lean();
        if (!camera) {
            return res.status(404).json({ message: 'Không tìm thấy camera' });
        }

        const shouldUseAgent = camera.accessMode === 'agent';
        if (shouldUseAgent) {
            if (!camera.agentBaseUrl) {
                return res.status(400).json({
                    message: 'Chưa cấu hình agentBaseUrl cho camera.',
                    hint: 'Nhập agentBaseUrl (VD: https://agent.phgrouptechs.com) và thử lại.',
                    ipAddress: camera.ipAddress,
                    rtspPath: camera.rtspPath || null
                });
            }

            const rtspUrl = buildRtspUrl(camera);
            try {
                const headers = {};
                if (camera.agentToken) {
                    headers['x-agent-token'] = camera.agentToken;
                }
                const agentUrl = String(camera.agentBaseUrl).replace(/\/+$/, '');
                const resp = await axios.post(`${agentUrl}/snapshot`, { rtspUrl }, {
                    headers,
                    responseType: 'arraybuffer',
                    timeout: 10000
                });
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'no-store');
                return res.status(200).send(Buffer.from(resp.data));
            } catch (e) {
                const msg = e?.response?.data?.message || e?.message || 'Agent snapshot failed';
                const details = e?.response?.data?.details || null;
                return res.status(500).json({
                    message: 'Lấy snapshot qua agent thất bại.',
                    hint: 'Kiểm tra agent đang chạy/đúng URL, token, và agent có truy cập được RTSP trong LAN.',
                    error: String(msg),
                    details: details ? String(details).slice(-1200) : null,
                    agentBaseUrl: camera.agentBaseUrl || null,
                    ipAddress: camera.ipAddress,
                    port: camera.port || 554,
                    rtspPath: camera.rtspPath || null,
                    rtsp: maskRtspUrl(rtspUrl)
                });
            }
        }

        if (isPrivateIpv4(camera.ipAddress) && process.env.NODE_ENV === 'production') {
            return res.status(400).json({
                message: 'Không thể lấy snapshot: camera đang dùng IP nội bộ (LAN) nên server cloud không truy cập được.',
                hint: 'Chọn chế độ Agent (On-Prem) và cấu hình agentBaseUrl để backend proxy snapshot qua agent trong LAN.',
                ipAddress: camera.ipAddress,
                port: camera.port || 554,
                rtspPath: camera.rtspPath || null
            });
        }

        const rtspUrl = buildRtspUrl(camera);
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
            return res.status(500).json({
                message: isMissing ? 'Server chưa cài ffmpeg nên không thể lấy snapshot.' : 'Không thể chạy ffmpeg để lấy snapshot.',
                error: err.message,
                rtsp: maskRtspUrl(rtspUrl),
                ipAddress: camera.ipAddress,
                port: camera.port || 554,
                rtspPath: camera.rtspPath || null
            });
        });

        ffmpeg.on('close', (code) => {
            clearTimeout(killTimer);
            if (code !== 0 || chunks.length === 0) {
                const errText = Buffer.concat(errChunks).toString('utf8');
                return res.status(500).json({
                    message: 'Lấy snapshot thất bại. Kiểm tra rtspPath / user-pass / camera online / mạng từ server tới camera.',
                    details: errText.slice(-1200),
                    rtsp: maskRtspUrl(rtspUrl),
                    ipAddress: camera.ipAddress,
                    port: camera.port || 554,
                    rtspPath: camera.rtspPath || null
                });
            }
            const img = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).send(img);
        });
    } catch (error) {
        return res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

exports.updateCameraConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body || {};
        const updated = await Camera.findByIdAndUpdate(id, payload, { new: true }).lean();
        if (!updated) {
            return res.status(404).json({ message: 'Không tìm thấy camera' });
        }
        res.status(200).json({ message: 'Cập nhật cấu hình camera thành công', data: updated });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// 2. Gửi ảnh snapshot từ Camera sang AI Python và xử lý Khách hàng
exports.processCameraFrame = async (req, res) => {
    try {
        // Nhận imageFrontBase64 (bắt buộc) và imageBackBase64 (không bắt buộc)
        const { cameraId, imageFrontBase64, imageBackBase64 } = req.body;
        
        // 1. Lấy thông tin camera
        const camera = await Camera.findById(cameraId);
        if (!camera || !camera.aiConfig.enableOcr) {
            return res.status(400).json({ message: 'Camera không hỗ trợ AI hoặc không tồn tại' });
        }

        // 2. Gọi sang Python FastAPI Server tùy thuộc vào số lượng mặt giấy tờ
        let aiResponse;
        const pythonAiUrl = process.env.PYTHON_AI_URL || 'https://ai.phgrouptechs.com'; // Đổi lại theo env của bạn

        if (imageFrontBase64 && imageBackBase64) {
            // Dữ liệu 2 mặt -> Gọi /ocr-card
            aiResponse = await axios.post(`${pythonAiUrl}/ocr-card`, {
                image_front: imageFrontBase64,
                image_back: imageBackBase64,
                hotelId: camera.hotelId
            });
        } else if (imageFrontBase64) {
            // Dữ liệu 1 mặt -> Gọi /ocr
            aiResponse = await axios.post(`${pythonAiUrl}/ocr`, {
                image: imageFrontBase64,
                hotelId: camera.hotelId
            });
        } else {
            return res.status(400).json({ message: 'Vui lòng cung cấp ít nhất 1 mặt của giấy tờ (imageFrontBase64)' });
        }

        const ocrData = aiResponse.data.data; // Giả sử Python trả về dạng { data: { idNumber, fullName, ... } }
        
        if (!ocrData || !ocrData.idNumber) {
            return res.status(400).json({ message: 'Không thể nhận diện được số CCCD từ ảnh' });
        }

        // 3. Xử lý logic Khách cũ / Khách mới với model guests.js
        const { idNumber, fullName, dateOfBirth, gender, address } = ocrData;

        // Tìm khách hàng bằng idNumber bên trong object personalInfo
        let guest = await Guest.findOne({ 
            hotelId: camera.hotelId, 
            'personalInfo.idNumber': idNumber 
        });

        let isNewGuest = false;

        if (!guest) {
            // KHÁCH MỚI: Tạo record mới theo schema guests.js
            isNewGuest = true;
            
            // Hàm chuyển đổi string "DD/MM/YYYY" sang Date object (nếu Python trả về string)
            let parsedDob = null;
            if (dateOfBirth) {
                const parts = dateOfBirth.split('/');
                if (parts.length === 3) parsedDob = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            }

            guest = new Guest({
                hotelId: camera.hotelId,
                guestType: 'regular',
                personalInfo: {
                    fullName: fullName,
                    idNumber: idNumber,
                    idType: 'id_card', // Mặc định là CCCD
                    dateOfBirth: parsedDob,
                    gender: gender
                },
                contactInfo: {
                    address: {
                        street: address // Lưu tạm toàn bộ địa chỉ vào street
                    }
                }
            });
            await guest.save();
        } else {
            // KHÁCH CŨ: Có thể tự động nâng hạng thành 'frequent' nếu đã ở nhiều lần
            if (guest.stayHistory && guest.stayHistory.length > 0 && guest.guestType === 'regular') {
                guest.guestType = 'frequent';
                await guest.save();
            }
        }

        // 4. Tính toán thống kê từ stayHistory để báo cáo ra ngoài giao diện
        const totalStays = guest.stayHistory ? guest.stayHistory.length : 0;
        const totalSpent = guest.stayHistory ? guest.stayHistory.reduce((sum, stay) => sum + (stay.totalSpent || 0), 0) : 0;

        // 5. Trả kết quả về cho Frontend
        const label = await guestsController.computeGuestLabel({ hotelId: camera.hotelId, guestId: guest._id });
        res.status(200).json({
            status: "success",
            message: isNewGuest ? 'Đã nhận diện khách hàng mới' : 'Khách cũ quay lại',
            isNewGuest: isNewGuest,
            guestInfo: guest,
            label,
            stats: {
                totalStays: totalStays,
                totalSpent: totalSpent,
                loyaltyTier: guest.loyaltyTier,
                loyaltyPoints: guest.loyaltyPoints
            },
            ocrRawData: ocrData // Trả về data gốc để Lễ tân có thể chỉnh sửa nếu AI nhận diện sai vài chữ
        });

    } catch (error) {
        console.error("Camera Processing Error: ", error);
        // Bắt lỗi nếu gọi Python AI thất bại
        if (error.response) {
            return res.status(error.response.status).json({ message: 'Lỗi từ AI Server', details: error.response.data });
        }
        res.status(500).json({ message: 'Lỗi xử lý luồng camera', error: error.message });
    }
};
