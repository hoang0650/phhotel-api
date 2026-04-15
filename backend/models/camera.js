const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cameraSchema = new Schema({
  hotelId: {
    type: Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true
  },
  name: { type: String, required: true }, // Tên camera (VD: Camera Quầy Lễ Tân)
  provider: { 
    type: String, 
    enum: ['hikvision', 'kbvision'], 
    required: true 
  },
  ipAddress: { type: String, required: true },
  port: { type: Number, default: 554 }, // Port RTSP
  username: { type: String, required: true },
  password: { type: String, required: true },
  
  // Cấu hình AI tích hợp
  aiConfig: {
    enableOcr: { type: Boolean, default: true },
    enableFaceRecognition: { type: Boolean, default: false },
    autoCheckin: { type: Boolean, default: false }
  },
  
  status: { type: String, enum: ['active', 'inactive', 'error'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const Camera = mongoose.model('Camera', cameraSchema);
module.exports = { Camera };