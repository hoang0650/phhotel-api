var express = require('express');
var router = express.Router();
const multer = require('multer');
const { uploadImage, getImageById, preprocessImageForOCR } = require('../controllers/fileController');
const { authenticateToken } = require('../middlewares/auth');

// Cấu hình multer để xử lý file upload
const storage = multer.memoryStorage(); // Lưu file vào memory thay vì disk
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Giới hạn 5MB
  },
  fileFilter: (req, file, cb) => {
    // Chỉ chấp nhận file ảnh
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh!'), false);
    }
  }
});

// POST /files/upload - Upload ảnh
router.post('/upload', authenticateToken, upload.single('image'), uploadImage);

// POST /files/preprocess-ocr - Pre-process ảnh cho OCR
router.post('/preprocess-ocr', authenticateToken, upload.single('image'), preprocessImageForOCR);

// GET /files/:id - Lấy ảnh theo ID
router.get('/:id', getImageById);

module.exports = router;

