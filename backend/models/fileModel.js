const mongoose = require('mongoose');
// Tạo schema cho ảnh
const imageSchema = new mongoose.Schema({
  filename: String,
  data: Buffer,
  contentType: String
});

const Image = mongoose.model('Image', imageSchema);
module.exports = {Image}