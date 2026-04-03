/**
 * Script để xóa index userId_1 không còn sử dụng trong collection users
 * Chạy: node scripts/dropUserIdIndex.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function dropIndex() {
    try {
        console.log('Đang kết nối MongoDB...');
        await mongoose.connect(process.env.MDB_CONNECT, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Đã kết nối MongoDB thành công!');

        const db = mongoose.connection.db;
        const collection = db.collection('users');

        // Liệt kê tất cả indexes
        const indexes = await collection.indexes();
        console.log('Danh sách indexes hiện tại:');
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

        // Kiểm tra và xóa index userId_1 nếu tồn tại
        const userIdIndex = indexes.find(idx => idx.name === 'userId_1');
        if (userIdIndex) {
            console.log('\nĐang xóa index userId_1...');
            await collection.dropIndex('userId_1');
            console.log('✅ Đã xóa index userId_1 thành công!');
        } else {
            console.log('\n⚠️ Index userId_1 không tồn tại.');
        }

        // Hiển thị lại danh sách indexes sau khi xóa
        const newIndexes = await collection.indexes();
        console.log('\nDanh sách indexes sau khi xóa:');
        newIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\nĐã ngắt kết nối MongoDB.');
        process.exit(0);
    }
}

dropIndex();

