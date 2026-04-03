const mongoose = require('mongoose');
const { User } = require('../models/users');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Kết nối đến MongoDB Atlas sử dụng biến môi trường
const dbConnectionString = process.env.MDB_CONNECT;
mongoose.connect(dbConnectionString)
.then(() => console.log('Đã kết nối đến MongoDB Atlas'))
.catch(err => console.error('Lỗi kết nối MongoDB:', err));

// Hàm tạo mật khẩu hash
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

// Hàm tạo dữ liệu mẫu người dùng
async function seedUsers() {
    try {
        // Xóa tất cả người dùng hiện có
        await User.deleteMany({});
        
        // Mật khẩu giống nhau cho tất cả tài khoản để dễ test
        const hashedPassword = await hashPassword('123456');
        
        // Mảng dữ liệu người dùng mẫu
        const users = [
            {
                userId: 'user1',
                username: 'Nguyễn Văn An',
                email: 'vanan@example.com',
                password: hashedPassword,
                role: 'business',
                avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
                loyaltyPoints: 100,
                status: 'active'
            },
            {
                userId: 'user2',
                username: 'Trần Thị Bình',
                email: 'thibinh@example.com',
                password: hashedPassword,
                role: 'business',
                avatar: 'https://randomuser.me/api/portraits/women/1.jpg',
                loyaltyPoints: 150,
                status: 'active'
            },
            {
                userId: 'user3',
                username: 'Lê Văn Cường',
                email: 'vancuong@example.com',
                password: hashedPassword,
                role: 'hotel',
                avatar: 'https://randomuser.me/api/portraits/men/2.jpg',
                loyaltyPoints: 50,
                status: 'active'
            },
            {
                userId: 'user4',
                username: 'Phạm Thị Dung',
                email: 'thidung@example.com',
                password: hashedPassword,
                role: 'staff',
                avatar: 'https://randomuser.me/api/portraits/women/2.jpg',
                loyaltyPoints: 20,
                status: 'active'
            },
            {
                userId: 'user5',
                username: 'Hoàng Văn Em',
                email: 'vanem@example.com',
                password: hashedPassword,
                role: 'customer',
                avatar: 'https://randomuser.me/api/portraits/men/3.jpg',
                loyaltyPoints: 200,
                status: 'active'
            },
            {
                userId: 'user6',
                username: 'Lý Thị Thảo',
                email: 'lythao@example.com',
                password: hashedPassword,
                role: 'business',
                avatar: 'https://randomuser.me/api/portraits/women/3.jpg',
                loyaltyPoints: 50,
                status: 'pending'
            },
            {
                userId: 'user7',
                username: 'Ngô Văn Bình',
                email: 'ngovbinh@example.com',
                password: hashedPassword,
                role: 'business',
                avatar: 'https://randomuser.me/api/portraits/men/4.jpg',
                loyaltyPoints: 20,
                status: 'reject'
            }
        ];
        
        // Lưu người dùng vào database
        for (const userData of users) {
            const user = new User(userData);
            await user.save();
            console.log(`Đã tạo người dùng: ${user.username}`);
        }
        
        console.log(`Đã tạo thành công ${users.length} người dùng mẫu!`);
        
        // Đóng kết nối
        mongoose.connection.close();
    } catch (error) {
        console.error('Lỗi khi tạo người dùng mẫu:', error);
        mongoose.connection.close();
    }
}

// Chạy script
seedUsers(); 