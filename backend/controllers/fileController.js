const {Image} = require('../models/fileModel') 
const crypto = require('crypto');
const sharp = require('sharp');

async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    // Resize ảnh và chuyển đổi sang JPEG
    const resizedImageBuffer = await sharp(req.file.buffer)
      .resize(800)
      .jpeg({ quality: 80 })
      .toBuffer();

    // Tạo một đối tượng ảnh mới và lưu vào MongoDB
    // Sử dụng crypto.randomUUID() thay vì uuid package (Node.js 18+)
    const imageId = crypto.randomUUID();
    const image = new Image({
      filename: `${imageId}.jpg`,
      data: resizedImageBuffer,
      contentType: 'image/jpeg'
    });

    await image.save();

    res.json({ 
      message: 'Image uploaded successfully!', 
      imageId: image._id,
      imageUrl: `/files/${image._id}` // URL để lấy ảnh
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error uploading file.');
  }
}

async function getImageById(req, res) {
  try {
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).send('Image not found.');
    }

    res.set('Content-Type', image.contentType);
    res.send(image.data);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving image.');
  }
}

/**
 * Pre-process ảnh trước OCR sử dụng sharp
 * Pipeline xử lý tối ưu: resize, grayscale, denoising, contrast enhancement, sharpening
 */
async function preprocessImageForOCR(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded.' 
      });
    }

    // Lấy metadata ảnh gốc
    const metadata = await sharp(req.file.buffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    const originalFormat = metadata.format;

    // Tính toán kích thước mới
    // Để OCR chính xác, cần đảm bảo text đủ lớn, đặc biệt cho text tiếng Việt có dấu
    // Tối thiểu 2000px để text rõ ràng hơn, tối đa 3500px để không quá chậm
    const minDimension = 2000; // Tăng từ 1800px để text rõ hơn
    const maxDimension = 3500; // Tăng từ 3000px để giữ chất lượng tốt hơn
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    // Phóng to ảnh nhỏ để text rõ hơn (quan trọng cho text có dấu)
    if (originalWidth < minDimension || originalHeight < minDimension) {
      const ratio = Math.max(minDimension / originalWidth, minDimension / originalHeight);
      targetWidth = Math.round(originalWidth * ratio);
      targetHeight = Math.round(originalHeight * ratio);
    }

    // Giới hạn kích thước tối đa
    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      const ratio = Math.min(maxDimension / targetWidth, maxDimension / targetHeight);
      targetWidth = Math.round(targetWidth * ratio);
      targetHeight = Math.round(targetHeight * ratio);
    }

    const processingSteps = [];

    // Bước 1: Resize với kernel tốt để giữ chất lượng
    let processedBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: false, // Cho phép phóng to ảnh nhỏ để text rõ hơn
        kernel: 'lanczos3' // Lanczos3 cho chất lượng tốt nhất
      })
      .toBuffer();
    processingSteps.push(`resize (lanczos3, ${targetWidth}x${targetHeight}px)`);

    // Bước 2: Chuyển sang grayscale (sử dụng ITU-R BT.601 standard)
    processedBuffer = await sharp(processedBuffer)
      .greyscale()
      .toBuffer();
    processingSteps.push('grayscale');

    // Bước 3: Normalize histogram để cải thiện contrast tự động
    processedBuffer = await sharp(processedBuffer)
      .normalize()
      .toBuffer();
    processingSteps.push('normalize (histogram)');

    processedBuffer = await sharp(processedBuffer)
      .median(3)
      .toBuffer();
    processingSteps.push('denoising (median 3x3)');

    // Điều chỉnh gamma nhẹ để làm rõ mid-tones
    processedBuffer = await sharp(processedBuffer)
      .gamma(1.3)
      .toBuffer();
    processingSteps.push('gamma (1.3)');

    // Bước 4: Điều chỉnh brightness và saturation
    // Tăng brightness để làm sáng text, đặc biệt quan trọng cho ảnh tối và text có dấu
    // Điều chỉnh để phù hợp với cả CCCD cũ và mới, tối ưu cho OCR chính xác hơn
    // Tăng brightness vừa phải để tránh làm mất chi tiết text
    // Đồng bộ với frontend để đảm bảo OCR chính xác cho tên (mặt trước), địa chỉ (từ "Nơi cư trú:" / "Nơi thường trú:")
    // Tối ưu cho nhận diện mặt trước (có "CĂN CƯỚC" hoặc "CĂN CƯỚC CÔNG DÂN") và địa chỉ: tăng brightness để làm rõ các ký tự
    // Tăng thêm để đảm bảo OCR có thể nhận diện chính xác tên (mặt trước), header (đặc biệt "CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM") và ký tự trong địa chỉ (đặc biệt "Nơi thường trú" và "Nơi cư trú")
    // Tối ưu đặc biệt cho địa chỉ: tăng brightness để OCR có thể phân biệt rõ ràng giữa địa chỉ và các thông tin khác (tên, ngày sinh, giới tính)
    processedBuffer = await sharp(processedBuffer)
      .modulate({
        brightness: 2.25,   // Tăng độ sáng 125% để làm rõ text hơn, đặc biệt cho địa chỉ ("Nơi thường trú", "Nơi cư trú") và header mặt trước (tăng từ 2.2)
        saturation: 0      // Đảm bảo grayscale
      })
      .toBuffer();
    processingSteps.push('brightness adjustment (+125%)');

    // Bước 5: Tăng contrast mạnh hơn để làm rõ text
    // Formula: output = (input - 128) * contrast + 128 + brightness_offset
    // Contrast 3.6 để làm rõ text hơn, đặc biệt cho text tiếng Việt có dấu, header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN"), tên (mặt trước) và địa chỉ (từ "Nơi cư trú:" / "Nơi thường trú:")
    // Đồng bộ với frontend để đảm bảo OCR chính xác cho header mặt trước, tên (mặt trước), địa chỉ (từ "Nơi cư trú:" / "Nơi thường trú:")
    // Tối ưu cho nhận diện mặt trước (có "CĂN CƯỚC" hoặc "CĂN CƯỚC CÔNG DÂN") và địa chỉ: tăng contrast để phân tách rõ ràng giữa text và background
    // Tăng thêm để đảm bảo OCR có thể nhận diện chính xác header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), tên (mặt trước) và ký tự trong địa chỉ (đặc biệt "Nơi thường trú" và "Nơi cư trú")
    // Tối ưu đặc biệt cho địa chỉ: tăng contrast để OCR có thể phân biệt rõ ràng giữa địa chỉ và các thông tin khác (tên, ngày sinh, giới tính)
    processedBuffer = await sharp(processedBuffer)
      .linear(4.2, -(128 * 2.1)) // Contrast 4.2, brightness offset -268.8 (tăng từ 4.0) để làm rõ địa chỉ ("Nơi thường trú", "Nơi cư trú") và header mặt trước
      .toBuffer();
    processingSteps.push('contrast enhancement (4.2x)');

    // Bước 6: Làm sắc nét (sharpen) để cải thiện OCR
    // Tham số được tối ưu cho text recognition, đặc biệt cho text nhỏ và text tiếng Việt có dấu
    // Tối ưu cho cả CCCD cũ và mới, tăng cường để OCR chính xác hơn
    // Điều chỉnh để làm rõ text mà không tạo noise
    // Đồng bộ với frontend để đảm bảo OCR chính xác cho header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN"), tên (mặt trước), địa chỉ (từ "Nơi cư trú:" / "Nơi thường trú:")
    // Tối ưu cho nhận diện mặt trước (có "CĂN CƯỚC" hoặc "CĂN CƯỚC CÔNG DÂN") và địa chỉ: tăng cường sharpen để làm rõ các ký tự
    // Tăng thêm để đảm bảo OCR có thể nhận diện chính xác header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), tên (mặt trước) và ký tự trong địa chỉ (đặc biệt "Nơi thường trú" và "Nơi cư trú")
    // Tối ưu đặc biệt cho địa chỉ: tăng sharpen để OCR có thể phân biệt rõ ràng giữa địa chỉ và các thông tin khác (tên, ngày sinh, giới tính)
    processedBuffer = await sharp(processedBuffer)
      .sharpen({
        sigma: 6.8,        // Tăng sigma từ 6.5 lên 6.8 để làm sắc nét tốt hơn cho địa chỉ ("Nơi thường trú", "Nơi cư trú") và header mặt trước
        flat: 1.0,         // Flat threshold
        jagged: 12.5        // Tăng jagged từ 12.0 lên 12.5 để làm sắc nét text tốt hơn, đặc biệt cho địa chỉ, header mặt trước, tên (mặt trước), dấu tiếng Việt
      })
      .toBuffer();
    processingSteps.push('sharpen (sigma: 6.8, jagged: 12.5)');

    // Bước 7: Áp dụng edge enhancement để làm rõ viền chữ
    // Sử dụng convolve để tăng cường edge detection
    // Kernel edge enhancement: làm nổi bật các cạnh (viền chữ)
    // Kernel này giúp làm rõ viền chữ mà không làm mất chi tiết, đặc biệt quan trọng cho text tiếng Việt có dấu
    // Đồng bộ với frontend để đảm bảo OCR chính xác cho giới tính, tên, địa chỉ
    // Tối ưu cho nhận diện mặt trước (có "CĂN CƯỚC" hoặc "CĂN CƯỚC CÔNG DÂN") và địa chỉ: tăng cường edge enhancement để làm rõ các ký tự
    try {
      const edgeKernel = [
        [0, -1, 0],
        [-1, 24, -1], // Tăng từ 23 lên 24 để edge enhancement mạnh hơn cho địa chỉ ("Nơi thường trú", "Nơi cư trú") và header mặt trước
        [0, -1, 0]
      ];
      
      // Áp dụng edge enhancement để làm rõ viền chữ
      processedBuffer = await sharp(processedBuffer)
        .convolve({
          width: 3,
          height: 3,
          kernel: edgeKernel,
          scale: 1,
          offset: 0
        })
        .toBuffer();
      processingSteps.push('edge enhancement (convolve, kernel: 24)');
    } catch (convolveError) {
      // Nếu convolve không hỗ trợ, bỏ qua bước này
      console.warn('Edge enhancement (convolve) failed, skipping:', convolveError.message);
      processingSteps.push('edge enhancement (skipped due to error)');
    }

    // Bước 8: Áp dụng thêm một lần contrast enhancement để làm rõ text
    // Tăng contrast một lần nữa để phân tách text và background rõ ràng hơn
    // Điều chỉnh để phù hợp với text tiếng Việt có dấu, tối ưu cho cả CCCD cũ và mới
    // Đồng bộ với frontend để đảm bảo OCR chính xác cho header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN"), tên (mặt trước), địa chỉ (từ "Nơi cư trú:" / "Nơi thường trú:")
    // Tối ưu cho nhận diện mặt trước (có "CĂN CƯỚC" hoặc "CĂN CƯỚC CÔNG DÂN") và địa chỉ: tăng contrast để làm rõ các ký tự
    // Tăng thêm để đảm bảo OCR có thể nhận diện chính xác header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), tên (mặt trước) và ký tự trong địa chỉ (đặc biệt "Nơi thường trú" và "Nơi cư trú")
    // Tối ưu đặc biệt cho địa chỉ: tăng contrast để OCR có thể phân biệt rõ ràng giữa địa chỉ và các thông tin khác (tên, ngày sinh, giới tính)
    processedBuffer = await sharp(processedBuffer)
      .linear(5.8, -(128 * 3.4)) // Contrast 5.8, brightness offset -435.2 (tăng từ 5.6) để làm rõ địa chỉ ("Nơi thường trú", "Nơi cư trú") và header mặt trước
      .toBuffer();
    processingSteps.push('additional contrast enhancement (5.8x)');
    
    // Bước 8.5: Áp dụng thêm một lần normalize để đảm bảo phân bố pixel tối ưu
    // Giúp phân tách text và background rõ ràng hơn
    // Tối ưu cho địa chỉ: normalize giúp làm rõ các ký tự trong địa chỉ
    processedBuffer = await sharp(processedBuffer)
      .normalize()
      .toBuffer();
    processingSteps.push('normalize (intermediate)');

    // Bước 9: Áp dụng thêm một lần normalize để đảm bảo contrast tối ưu
    // Tối ưu cho địa chỉ: normalize cuối cùng để đảm bảo chất lượng tốt nhất
    processedBuffer = await sharp(processedBuffer)
      .normalize()
      .toBuffer();
    processingSteps.push('normalize (final)');
    
    // Bước 9.5: Áp dụng thresholding nhẹ để làm rõ text và background
    // Chuyển đổi ảnh sang binary-like để làm rõ text, đặc biệt quan trọng cho header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN"), tên (mặt trước) và địa chỉ (từ "Nơi cư trú:" / "Nơi thường trú:")
    // Sử dụng linear với contrast cao để tạo hiệu ứng thresholding nhẹ
    // Tối ưu cho nhận diện mặt trước (có "CĂN CƯỚC" hoặc "CĂN CƯỚC CÔNG DÂN") và địa chỉ: thresholding giúp làm rõ các ký tự
    // Đồng bộ với frontend: đảm bảo OCR có thể phân biệt rõ header (mặt trước) và địa chỉ (từ "Nơi cư trú:" / "Nơi thường trú:")
    // Tăng thêm để đảm bảo OCR có thể nhận diện chính xác header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), tên (mặt trước) và ký tự trong địa chỉ (đặc biệt "Nơi thường trú" và "Nơi cư trú")
    // Tối ưu đặc biệt cho địa chỉ: tăng thresholding để OCR có thể phân biệt rõ ràng giữa địa chỉ và các thông tin khác (tên, ngày sinh, giới tính)
    try {
      processedBuffer = await sharp(processedBuffer)
        .linear(7.2, -(128 * 4.1)) // Contrast 7.2, brightness offset -524.8 (tăng từ 7.0) để làm rõ text hơn, đặc biệt cho địa chỉ ("Nơi thường trú", "Nơi cư trú") và header mặt trước
        .toBuffer();
      processingSteps.push('thresholding (light, contrast: 7.2x)');
    } catch (thresholdError) {
      console.warn('Thresholding failed, skipping:', thresholdError.message);
      processingSteps.push('thresholding (skipped due to error)');
    }
    
    // Bước 9.6: Normalize lại sau thresholding để đảm bảo chất lượng
    // Tối ưu cho nhận diện mặt sau và địa chỉ: normalize đảm bảo phân bố pixel tối ưu
    processedBuffer = await sharp(processedBuffer)
      .normalize()
      .toBuffer();
    processingSteps.push('normalize (post-thresholding)');
    
    // Bước 9.7: Áp dụng thêm một lần sharpen nhẹ sau thresholding để làm rõ text
    // Tối ưu cho nhận diện mặt trước và mặt sau: sharpen nhẹ giúp làm rõ các ký tự sau thresholding
    // Đồng bộ với frontend: đảm bảo OCR có thể phân biệt rõ header (mặt trước) và địa chỉ (từ "Nơi cư trú:" / "Nơi thường trú:")
    // Tăng thêm để đảm bảo OCR có thể nhận diện chính xác header mặt trước ("CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), tên (mặt trước) và ký tự trong địa chỉ (đặc biệt "Nơi thường trú" và "Nơi cư trú")
    // Tối ưu đặc biệt cho địa chỉ: tăng sharpen để OCR có thể phân biệt rõ ràng giữa địa chỉ và các thông tin khác (tên, ngày sinh, giới tính)
    try {
      processedBuffer = await sharp(processedBuffer)
        .sharpen({
          sigma: 4.8,        // Tăng sigma từ 4.5 lên 4.8 để làm rõ text hơn, đặc biệt cho địa chỉ ("Nơi thường trú", "Nơi cư trú") và header mặt trước
          flat: 1.0,
          jagged: 7.5        // Tăng jagged từ 7.0 lên 7.5 để làm rõ text hơn, đặc biệt cho địa chỉ ("Nơi thường trú", "Nơi cư trú") và header mặt trước
        })
        .toBuffer();
      processingSteps.push('final sharpen (sigma: 4.8, jagged: 7.5)');
    } catch (sharpenError) {
      console.warn('Final sharpen failed, skipping:', sharpenError.message);
      processingSteps.push('final sharpen (skipped due to error)');
    }
    
    // Bước 9.8: Normalize cuối cùng để đảm bảo chất lượng tốt nhất
    // Tối ưu cho nhận diện mặt sau và địa chỉ: normalize cuối cùng đảm bảo phân bố pixel tối ưu
    // Đồng bộ với frontend: đảm bảo OCR có thể phân biệt rõ header (mặt trước) và địa chỉ (mặt sau)
    processedBuffer = await sharp(processedBuffer)
      .normalize()
      .toBuffer();
    processingSteps.push('normalize (final post-processing)');

    // Bước 10: Xuất PNG với chất lượng cao nhất
    const finalBuffer = await sharp(processedBuffer)
      .png({ 
        quality: 100,           // Chất lượng tối đa
        compressionLevel: 6,     // Compression level (0-9, 6 là cân bằng)
        adaptiveFiltering: true, // Adaptive filtering để tối ưu
        palette: false          // Không dùng palette để giữ grayscale đầy đủ
      })
      .toBuffer();
    processingSteps.push('export PNG (quality: 100)');

    // Trả về ảnh đã xử lý dưới dạng base64
    const base64Image = finalBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    res.json({
      success: true,
      processedImage: dataUrl,
      metadata: {
        originalWidth,
        originalHeight,
        originalFormat,
        processedWidth: targetWidth,
        processedHeight: targetHeight,
        format: 'png',
        processingSteps
      }
    });
  } catch (error) {
    console.error('Error preprocessing image for OCR:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error preprocessing image: ' + error.message 
    });
  }
}

module.exports = {
  uploadImage,
  getImageById,
  preprocessImageForOCR
}
