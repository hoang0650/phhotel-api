const { User } = require('../models/users')
const { Business } = require('../models/business')
const { Hotel } = require('../models/hotel')
const { Staff } = require('../models/staff')
const jwt = require('jsonwebtoken')
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendForgotPasswordEmail } = require('../config/emailServices');
const { sendEmailTemplate, sendEmail: sendEmailAdapter, EMAIL_PROVIDER } = require('../config/emailServiceAdapter');
dotenv.config()

async function getUserInfo(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông tin user'
            });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Unexpected error in getUserInfo:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server không mong muốn'
        });
    }
}

async function createUser(req, res) {
    try {
        const { 
            username, email, password, fullName, phone, role = 'staff', 
            businessId, hotelId, status = 'active', preferences, twoFactorEnabled,
            // Tính năng (features) và feature flags - chỉ admin mới có thể set
            features, qrPaymentFeature, otaManagementFeature, emailManagementFeature,
            electricManagementFeature, paypalPaymentFeature, cryptoPaymentFeature,
            draftInvoiceFeature, exportInvoiceFeature, aiChatboxFeature
        } = req.body;
        const currentUser = req.user;
        
        // Chỉ admin (superadmin + admin) mới có thể tạo user
        // Business và Hotel Manager KHÔNG thể tạo user, chỉ xem
        if (!['superadmin', 'admin'].includes(currentUser.role)) {
            return res.status(403).json({ 
                message: 'Bạn không có quyền tạo người dùng. Chỉ Admin mới có thể tạo người dùng.' 
            });
        }
        
        // Validate required fields
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Vui lòng điền đầy đủ username, email và password' });
        }
        
        // Kiểm tra quyền tạo user với role cụ thể (chỉ admin)
        const roleHierarchy = {
            'superadmin': ['superadmin', 'admin', 'business', 'hotel', 'staff', 'guest'],
            'admin': ['admin', 'business', 'hotel', 'staff', 'guest']
        };
        
        const allowedRoles = roleHierarchy[currentUser.role] || [];
        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ 
                message: `Bạn không có quyền tạo người dùng với vai trò ${role}` 
            });
        }
        
        // Kiểm tra giới hạn số lượng nhân viên nếu tạo staff cho business
        // Superadmin và admin có thể tạo không giới hạn (bỏ qua kiểm tra)
        if (role === 'staff' && businessId) {
            try {
                // Lấy thông tin business owner
                const businessOwner = await User.findOne({ businessId: businessId, role: 'business' })
                    .populate('pricingPackage');
                
                if (businessOwner && businessOwner.pricingPackage) {
                    const package = businessOwner.pricingPackage;
                    const maxUsers = package.maxUsers;
                    
                    // Nếu maxUsers = 0 hoặc null thì không giới hạn
                    // Superadmin và admin có thể tạo không giới hạn (bỏ qua kiểm tra)
                    if (maxUsers !== 0 && maxUsers !== null) {
                        // Đếm số nhân viên hiện tại của business (role = 'staff' và cùng businessId)
                        const staffCount = await User.countDocuments({ 
                            businessId: businessId, 
                            role: 'staff',
                            status: { $ne: 'deleted' } // Không đếm các user đã bị xóa
                        });
                        
                        // Chỉ kiểm tra giới hạn nếu không phải superadmin/admin
                        // Superadmin và admin có thể tạo không giới hạn
                        if (!['superadmin', 'admin'].includes(currentUser.role) && staffCount >= maxUsers) {
                            return res.status(403).json({ 
                                message: `Đã đạt giới hạn số lượng nhân viên (${maxUsers}) cho gói đăng ký này. Vui lòng nâng cấp gói để tạo thêm nhân viên.` 
                            });
                        }
                    }
                }
            } catch (limitError) {
                console.error('Error checking user limit:', limitError);
                // Không block việc tạo user nếu có lỗi khi kiểm tra limit
            }
        }
        
        // Kiểm tra trùng email hoặc username
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ 
                message: existingUser.email === email 
                    ? 'Email đã được sử dụng' 
                    : 'Tên đăng nhập đã được sử dụng' 
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 8);
        
        // Xác định businessId và hotelId (lọc null/undefined)
        // Admin tự chọn businessId/hotelId khi tạo user
        let finalBusinessId = businessId || undefined;
        let finalHotelId = hotelId || undefined;
        
        // Tạo object user data, chỉ bao gồm các field có giá trị
        const userData = {
            username,
            email,
            password: hashedPassword,
            role,
            status,
            createdAt: Date.now()
        };
        
        // Thêm các field optional nếu có giá trị
        if (fullName) userData.fullName = fullName;
        if (phone) userData.phone = phone;
        if (finalBusinessId) userData.businessId = finalBusinessId;
        if (finalHotelId) userData.hotelId = finalHotelId;
        if (twoFactorEnabled !== undefined) userData.twoFactorEnabled = twoFactorEnabled;
        if (preferences) userData.preferences = preferences;
        
        // Chỉ admin mới có thể set features và feature flags trực tiếp
        if (['superadmin', 'admin'].includes(currentUser.role)) {
            if (features && Array.isArray(features)) {
                userData.features = features;
            }
            if (qrPaymentFeature !== undefined) userData.qrPaymentFeature = qrPaymentFeature;
            if (otaManagementFeature !== undefined) userData.otaManagementFeature = otaManagementFeature;
            if (emailManagementFeature !== undefined) userData.emailManagementFeature = emailManagementFeature;
            if (electricManagementFeature !== undefined) userData.electricManagementFeature = electricManagementFeature;
            if (paypalPaymentFeature !== undefined) userData.paypalPaymentFeature = paypalPaymentFeature;
            if (cryptoPaymentFeature !== undefined) userData.cryptoPaymentFeature = cryptoPaymentFeature;
            if (draftInvoiceFeature !== undefined) userData.draftInvoiceFeature = draftInvoiceFeature;
            if (exportInvoiceFeature !== undefined) userData.exportInvoiceFeature = exportInvoiceFeature;
            if (aiChatboxFeature !== undefined) userData.aiChatboxFeature = aiChatboxFeature;
        }
        
        const newUser = new User(userData);
        const savedUser = await newUser.save();
        
        // Nếu user có role 'guest', tự động gán gói free (giá = 0)
        if (role === 'guest') {
            try {
                const PricingPackage = require('../models/pricingPackage');
                // Tìm gói free (monthlyPrice = 0 và yearlyPrice = 0)
                const freePackage = await PricingPackage.findOne({ 
                    monthlyPrice: 0, 
                    yearlyPrice: 0,
                    isActive: true 
                });
                
                if (freePackage) {
                    savedUser.pricingPackage = freePackage._id;
                    // Set expiry date xa trong tương lai (ví dụ: 100 năm) cho gói free
                    savedUser.packageExpiryDate = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
                    savedUser.billingType = 'monthly';
                    await savedUser.save();
                    console.log(`Auto-assigned free package to guest user: ${savedUser.username}`);
                } else {
                    console.warn('Free package (price = 0) not found. Guest user created without package.');
                }
            } catch (packageError) {
                console.error('Error assigning free package to guest user:', packageError);
                // Không throw error để không ảnh hưởng đến việc tạo user
            }
        }
        
        // Tạo thông báo cho admin/superadmin về user đăng ký mới
        try {
            const { Settings } = require('../models/settings');
            const mongoose = require('mongoose');
            let settings = await Settings.findOne();
            
            if (!settings) {
                settings = new Settings();
            }
            
            const announcementId = new mongoose.Types.ObjectId().toString();
            const registrationAnnouncement = {
                id: announcementId,
                type: 'info',
                title: `Người dùng mới đăng ký: ${savedUser.fullName || savedUser.username || savedUser.email}`,
                message: `Người dùng ${savedUser.fullName || savedUser.username || savedUser.email} (${savedUser.email}) đã được tạo với vai trò ${savedUser.role}.`,
                priority: 'medium',
                startDate: new Date(),
                isActive: true,
                targetRoles: ['superadmin', 'admin'], // Chỉ gửi cho superadmin và admin
                targetType: 'system',
                notificationType: 'registration',
                userId: savedUser._id, // User ID của người dùng mới đăng ký
                createdAt: new Date(),
                createdBy: currentUser._id
            };
            
            if (!settings.announcements) {
                settings.announcements = [];
            }
            
            settings.announcements.push(registrationAnnouncement);
            await settings.save();
        } catch (announcementError) {
            console.error('Error creating registration announcement:', announcementError);
            // Không throw error để không ảnh hưởng đến việc tạo user
        }
        
        // Không trả về password trong response
        const userResponse = savedUser.toObject();
        delete userResponse.password;
        
        res.status(201).json(userResponse);
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ message: 'Lỗi khi tạo người dùng', error: err.message });
    }
}

async function login(req, res) {
    try {
        const { password, email, username } = req.body;
        
        // Xác định identifier: ưu tiên email nếu có, nếu không thì dùng username
        const identifier = email || username;
        
        if (!identifier || !password) {
            return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập/email và mật khẩu' });
        }
        
        // Tìm user bằng email hoặc username
        // Kiểm tra xem identifier có phải là email không (chứa @)
        const isEmail = identifier.includes('@');
        let user;
        
        if (isEmail) {
            // Tìm bằng email
            user = await User.findOne({ email: identifier });
        } else {
            // Tìm bằng username
            user = await User.findOne({ username: identifier });
        }
        
        if (!user) {
            return res.status(401).json({ message: 'Thông tin đăng nhập không hợp lệ' });
        }
        
        if (user.status === 'suspended' || user.status === 'deleted') {
            return res.status(403).json({ message: 'Tài khoản đã bị khóa hoặc không tồn tại' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Thông tin đăng nhập không hợp lệ' });
        }
        
        // Kiểm tra xác thực hai yếu tố nếu đã kích hoạt
        if (user.twoFactorEnabled && !req.body.twoFactorCode) {
            return res.status(200).json({ 
                requireTwoFactor: true,
                userId: user._id
            });
        }
        
        // Nếu là staff, lấy hotelId từ Staff model
        let hotelId = user.hotelId;
        if (user.role === 'staff' && !hotelId) {
            const { Staff } = require('../models/staff');
            const staff = await Staff.findOne({ userId: user._id });
            if (staff && staff.hotelId) {
                hotelId = staff.hotelId;
                // Cập nhật hotelId vào user để dùng sau này
                user.hotelId = hotelId;
                await user.save();
            }
        }
        
        const payloadData = {
            userId: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status,
            businessId: user.businessId,
            hotelId: hotelId
        };
        
        const accessToken = jwt.sign(payloadData, process.env.JWT_SECRET, { expiresIn: '30d' });
        const rememberLogin = !!req.body.remember;
        const refreshToken = jwt.sign(
            { userId: user._id },
            process.env.REFRESH_TOKEN_SECRET,
            { expiresIn: '30d' }
        );
        
        // Lấy địa chỉ IP từ request
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                         req.headers['x-real-ip'] || 
                         req.connection.remoteAddress || 
                         req.socket.remoteAddress ||
                         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                         'Unknown';
        
        // Cập nhật thời gian đăng nhập cuối và IP address
        user.lastLogin = Date.now();
        user.lastLoginIp = clientIp;
        await user.save();
        
        const userToReturn = user.toObject();
        delete userToReturn.password;
        delete userToReturn.twoFactorSecret;

        const sameSiteEnv = (process.env.COOKIE_SAMESITE || '').toLowerCase().trim();
        let sameSitePolicy;
        if (sameSiteEnv === 'strict' || sameSiteEnv === 'lax') {
            sameSitePolicy = sameSiteEnv;
        } else if (sameSiteEnv === 'none') {
            // Fallback for older express/cookie versions that do not support 'none'
            sameSitePolicy = 'lax';
        } else if (sameSiteEnv === 'true') {
            sameSitePolicy = true;
        } else if (sameSiteEnv === 'false') {
            sameSitePolicy = false;
        } else {
            // Default policy
            sameSitePolicy = 'lax';
        }
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: sameSitePolicy,
            path: '/',
            maxAge: 30 * 24 * 60 * 60 * 1000
        };
        res.cookie('refreshToken', refreshToken, cookieOptions);
        res.status(200).json({ message: 'Đăng nhập thành công', token: accessToken, user: userToReturn });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ message: 'Lỗi khi đăng nhập', error: err.message });
    }
}

// Đăng ký tài khoản công khai (không yêu cầu authentication)
async function registerUser(req, res) {
    try {
        const { username, email, password, fullName, phone } = req.body;
        
        // Validate required fields
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Vui lòng điền đầy đủ username, email và password' });
        }
        
        // Kiểm tra email đã tồn tại chưa
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ 
                message: existingUser.email === email 
                    ? 'Email đã được sử dụng' 
                    : 'Tên đăng nhập đã được sử dụng' 
            });
        }

        // Mã hóa mật khẩu
        const hashedPassword = await bcrypt.hash(password, 8);

        // Tạo người dùng mới với vai trò 'guest'
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            fullName,
            phone,
            role: 'guest',
            status: 'active',
            createdAt: Date.now()
        });

        // Lưu người dùng
        await newUser.save();
        
        // Tự động gán gói free (giá = 0) cho guest user
        try {
            const { PricingPackage } = require('../models/pricingPackage');
            const freePackage = await PricingPackage.findOne({ 
                monthlyPrice: 0, 
                yearlyPrice: 0 
            });
            
            if (freePackage) {
                newUser.pricingPackage = freePackage._id;
                // Set expiry date 100 năm trong tương lai
                newUser.packageExpiryDate = new Date();
                newUser.packageExpiryDate.setFullYear(newUser.packageExpiryDate.getFullYear() + 100);
                newUser.billingType = 'monthly';
                await newUser.save();
            }
        } catch (packageError) {
            console.error('Error assigning free package:', packageError);
            // Không block việc tạo user nếu có lỗi khi gán package
        }
        
        const userToReturn = newUser.toObject();
        delete userToReturn.password;

        res.status(201).json({
            message: 'Đăng ký tài khoản thành công',
            user: userToReturn
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Lỗi khi đăng ký tài khoản', error: error.message });
    }
}

// Thêm chức năng đăng ký tài khoản doanh nghiệp
async function createBusinessUser(req, res) {
    try {
        const { username, email, password, fullName, phone, businessInfo } = req.body;
        
        // Kiểm tra email đã tồn tại chưa
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ 
                message: existingUser.email === email 
                    ? 'Email đã được sử dụng' 
                    : 'Tên đăng nhập đã được sử dụng' 
            });
        }

        // Mã hóa mật khẩu
        const hashedPassword = await bcrypt.hash(password, 8);

        // Tạo người dùng mới với vai trò 'business'
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            fullName,
            phone,
            role: 'business',
            status: 'active',
            createdAt: Date.now()
        });

        // Lưu người dùng
        await newUser.save();

        // Tạo thông tin doanh nghiệp
        const newBusiness = new Business({
            name: businessInfo.name,
            legalName: businessInfo.legalName,
            taxId: businessInfo.taxId,
            address: businessInfo.address,
            contactInfo: {
                email: businessInfo.contactInfo?.email || email,
                phone: businessInfo.contactInfo?.phone || phone,
                website: businessInfo.contactInfo?.website
            },
            ownerId: newUser._id,
            status: 'pending'
        });

        // Lưu thông tin doanh nghiệp
        const savedBusiness = await newBusiness.save();

        // Cập nhật thông tin businessId cho người dùng
        newUser.businessId = savedBusiness._id;
        await newUser.save();
        
        const userToReturn = newUser.toObject();
        delete userToReturn.password;

        res.status(201).json({
            user: userToReturn,
            business: savedBusiness
        });
    } catch (error) {
        console.error('Error creating business user:', error);
        res.status(500).json({ message: 'Lỗi khi tạo tài khoản doanh nghiệp', error: error.message });
    }
}

/**
 * Lấy tất cả users (chỉ admin)
 */
async function getAllUsers(req, res) {
    try {
        const currentUser = req.user;
        
        // Chỉ superadmin và admin mới được phép xem danh sách users
        if (!['superadmin', 'admin'].includes(currentUser.role)) {
            return res.status(403).json({ message: 'Bạn không có quyền xem danh sách người dùng' });
        }
        
        // Superadmin: xem tất cả users (bao gồm admin)
        // Admin: không xem superadmin
        let query = { status: { $ne: 'deleted' } };
        
        if (currentUser.role === 'admin' && currentUser.role !== 'superadmin') {
            // Admin không xem superadmin
            query.role = { $ne: 'superadmin' };
        }
        
        const users = await User.find(query)
            .select('-password -twoFactorSecret')
            .sort({ createdAt: -1 });
        
        res.status(200).json(users);
    } catch (error) {
        console.error('Error getting all users:', error);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách người dùng', error: error.message });
    }
}

/**
 * Lấy users theo business ID
 */
async function getUsersByBusiness(req, res) {
    try {
        const { businessId } = req.params;
        const currentUser = req.user;
        
        // Kiểm tra quyền: business chỉ được xem users thuộc business của mình
        if (currentUser.role === 'business' && currentUser.businessId?.toString() !== businessId) {
            return res.status(403).json({ message: 'Bạn không có quyền xem danh sách người dùng của doanh nghiệp khác' });
        }
        
        // Lấy tất cả users thuộc business, bao gồm cả business owner
        // Business owner là user có role='business' và businessId trỏ đến business này
        const users = await User.find({ 
            businessId: businessId,
            status: { $ne: 'deleted' } 
        })
        .select('-password -twoFactorSecret')
        .sort({ createdAt: -1 });
        
        // Đảm bảo business owner (user có role='business' và businessId=this businessId) được bao gồm
        // Nếu business owner chưa có trong danh sách (có thể do businessId chưa được set), thêm vào
        const businessOwner = await User.findOne({ 
            businessId: businessId,
            role: 'business',
            status: { $ne: 'deleted' }
        }).select('-password -twoFactorSecret');
        
        const userList = users.map(u => u.toObject());
        // Nếu business owner tồn tại và chưa có trong danh sách, thêm vào
        if (businessOwner && !userList.find(u => u._id.toString() === businessOwner._id.toString())) {
            userList.unshift(businessOwner.toObject());
        }
        
        res.status(200).json(userList);
    } catch (error) {
        console.error('Error getting users by business:', error);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách người dùng', error: error.message });
    }
}

/**
 * Lấy users theo hotel ID
 */
async function getUsersByHotel(req, res) {
    try {
        const { hotelId } = req.params;
        const currentUser = req.user;
        
        // Kiểm tra quyền
        if (currentUser.role === 'hotel' && currentUser.hotelId?.toString() !== hotelId) {
            return res.status(403).json({ message: 'Bạn không có quyền xem danh sách người dùng của khách sạn khác' });
        }
        
        // Business có thể xem users của hotels thuộc business
        if (currentUser.role === 'business') {
            const hotel = await Hotel.findById(hotelId);
            if (!hotel || hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
                return res.status(403).json({ message: 'Bạn không có quyền xem danh sách người dùng của khách sạn này' });
            }
        }
        
        const users = await User.find({ 
            hotelId,
            status: { $ne: 'deleted' } 
        })
        .select('-password -twoFactorSecret')
        .sort({ createdAt: -1 });
        
        res.status(200).json(users);
    } catch (error) {
        console.error('Error getting users by hotel:', error);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách người dùng', error: error.message });
    }
}

// Lấy danh sách người dùng theo vai trò
async function getUsersByRole(req, res) {
    try {
        const { role } = req.params;
        
        // Kiểm tra vai trò hợp lệ
        const validRoles = ['superadmin', 'admin', 'business', 'hotel', 'staff', 'guest'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: 'Vai trò không hợp lệ' });
        }
        
        // Tìm người dùng theo vai trò và không có status là 'deleted'
        const users = await User.find({ role, status: { $ne: 'deleted' } }).select('-password');
        
        res.status(200).json(users);
    } catch (error) {
        console.error('Error getting users by role:', error);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách người dùng', error: error.message });
    }
}

// Cập nhật thông tin người dùng
async function updateUser(req, res) {
    try {
        const { userId } = req.params;
        const updates = req.body;
        const currentUser = req.user;
        
        // Chỉ admin (superadmin + admin) mới có thể cập nhật user
        // Business và Hotel Manager KHÔNG thể cập nhật user, chỉ xem
        if (!['superadmin', 'admin'].includes(currentUser.role)) {
            return res.status(403).json({ 
                message: 'Bạn không có quyền cập nhật người dùng. Chỉ Admin mới có thể cập nhật người dùng.' 
            });
        }
        
        // Tìm user cần cập nhật
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }
        
        // Kiểm tra quyền (chỉ admin mới đến được đây)
        const canUpdate = checkUserPermission(currentUser, targetUser);
        if (!canUpdate) {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật người dùng này' });
        }
        
        // Không cho phép cập nhật mật khẩu qua route này
        if (updates.password) {
            // Hash password nếu có
            updates.password = await bcrypt.hash(updates.password, 8);
        }
        
        // Chỉ admin mới có thể thay đổi role
        if (updates.role && !['superadmin', 'admin'].includes(currentUser.role)) {
            delete updates.role;
        }
        
        // Không cho phép đổi role thành superadmin (trừ superadmin)
        if (updates.role === 'superadmin' && currentUser.role !== 'superadmin') {
            return res.status(403).json({ message: 'Không thể gán vai trò superadmin' });
        }
        
        // Superadmin có thể thay đổi role của admin
        // Admin không thể thay đổi role của admin khác
        if (updates.role && targetUser.role === 'admin' && currentUser.role === 'admin') {
            return res.status(403).json({ message: 'Chỉ Super Admin mới có thể thay đổi vai trò của Admin' });
        }
        
        // Admin không thể thay đổi role của superadmin
        if (targetUser.role === 'superadmin' && currentUser.role === 'admin') {
            return res.status(403).json({ message: 'Không thể thay đổi vai trò của Super Admin' });
        }
        
        // Chỉ admin mới có thể cập nhật features và feature flags
        // Nếu không phải admin, xóa các field này khỏi updates
        if (!['superadmin', 'admin'].includes(currentUser.role)) {
            delete updates.features;
            delete updates.qrPaymentFeature;
            delete updates.otaManagementFeature;
            delete updates.emailManagementFeature;
            delete updates.electricManagementFeature;
            delete updates.paypalPaymentFeature;
            delete updates.cryptoPaymentFeature;
            delete updates.draftInvoiceFeature;
            delete updates.exportInvoiceFeature;
            delete updates.aiChatboxFeature;
        }
        
        // Cập nhật thông tin người dùng
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password -twoFactorSecret');
        
        res.status(200).json(updatedUser);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật thông tin người dùng', error: error.message });
    }
}

// Cập nhật trạng thái người dùng với cascade blocking
async function updateUserStatus(req, res) {
    try {
        const { userId } = req.params;
        const { status } = req.body;
        const currentUser = req.user;
        
        // Chỉ admin (superadmin + admin) mới có thể cập nhật trạng thái user
        // Business và Hotel Manager KHÔNG thể cập nhật trạng thái, chỉ xem
        if (!['superadmin', 'admin'].includes(currentUser.role)) {
            return res.status(403).json({ 
                message: 'Bạn không có quyền thay đổi trạng thái người dùng. Chỉ Admin mới có thể thay đổi trạng thái.' 
            });
        }
        
        if (!['active', 'inactive', 'suspended', 'deleted'].includes(status)) {
            return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
        }
        
        // Tìm user cần cập nhật
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }
        
        // Không thể tự thay đổi status của chính mình (đặc biệt là xóa)
        if (targetUser._id.toString() === currentUser.userId.toString() && status === 'deleted') {
            return res.status(403).json({ message: 'Bạn không thể tự xóa chính mình' });
        }
        
        // Không thể thay đổi status của superadmin (trừ superadmin khác)
        if (targetUser.role === 'superadmin' && currentUser.role !== 'superadmin') {
            return res.status(403).json({ message: 'Không thể thay đổi trạng thái của Super Admin' });
        }
        
        // Superadmin có thể thay đổi status của admin (khóa, xóa)
        // Admin không thể thay đổi status của admin khác
        if (targetUser.role === 'admin' && currentUser.role === 'admin') {
            return res.status(403).json({ message: 'Chỉ Super Admin mới có thể thay đổi trạng thái của Admin' });
        }
        
        // Kiểm tra quyền (chỉ admin mới đến được đây)
        const canUpdate = checkUserPermission(currentUser, targetUser);
        if (!canUpdate) {
            return res.status(403).json({ message: 'Bạn không có quyền thay đổi trạng thái người dùng này' });
        }
        
        // Cập nhật trạng thái người dùng
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: { status } },
            { new: true }
        ).select('-password -twoFactorSecret');
        
        // Cascade blocking nếu suspend user là business hoặc hotel
        if (status === 'suspended' || status === 'inactive') {
            await cascadeSuspendUser(user);
        } else if (status === 'active') {
            await cascadeActivateUser(user);
        }
        
        let statusMessage = '';
        switch (status) {
            case 'active':
                statusMessage = 'Tài khoản đã được kích hoạt';
                break;
            case 'inactive':
                statusMessage = 'Tài khoản đã bị vô hiệu hóa';
                break;
            case 'suspended':
                statusMessage = 'Tài khoản đã bị đình chỉ';
                break;
            case 'deleted':
                statusMessage = 'Tài khoản đã được xóa';
                break;
        }
        
        res.status(200).json({
            message: statusMessage,
            user
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái người dùng', error: error.message });
    }
}

/**
 * Cascade suspend khi user bị suspend
 */
async function cascadeSuspendUser(user) {
    try {
        // Nếu user là business owner, suspend tất cả hotels và users thuộc business
        if (user.role === 'business' && user.businessId) {
            // Suspend business
            await Business.findByIdAndUpdate(user.businessId, { status: 'suspended' });
            
            // Suspend tất cả hotels thuộc business
            await Hotel.updateMany(
                { businessId: user.businessId },
                { status: 'suspended' }
            );
            
            // Suspend tất cả users thuộc business (trừ chính user này)
            await User.updateMany(
                { businessId: user.businessId, _id: { $ne: user._id } },
                { status: 'suspended' }
            );
            
            // Suspend tất cả staff thuộc hotels của business
            const hotels = await Hotel.find({ businessId: user.businessId });
            const hotelIds = hotels.map(h => h._id);
            if (hotelIds.length > 0) {
                await Staff.updateMany(
                    { hotelId: { $in: hotelIds } },
                    { status: 'inactive' }
                );
            }
        }
        
        // Nếu user là hotel manager, suspend tất cả staff thuộc hotel
        if (user.role === 'hotel' && user.hotelId) {
            // Suspend hotel
            await Hotel.findByIdAndUpdate(user.hotelId, { status: 'suspended' });
            
            // Suspend tất cả users thuộc hotel (trừ chính user này)
            await User.updateMany(
                { hotelId: user.hotelId, _id: { $ne: user._id } },
                { status: 'suspended' }
            );
            
            // Suspend tất cả staff thuộc hotel
            await Staff.updateMany(
                { hotelId: user.hotelId },
                { status: 'inactive' }
            );
        }
    } catch (error) {
        console.error('Error in cascadeSuspendUser:', error);
    }
}

/**
 * Cascade activate khi user được activate
 */
async function cascadeActivateUser(user) {
    try {
        // Nếu user là business owner
        if (user.role === 'business' && user.businessId) {
            // Activate business
            await Business.findByIdAndUpdate(user.businessId, { status: 'active' });
            
            // Activate tất cả hotels thuộc business
            await Hotel.updateMany(
                { businessId: user.businessId, status: 'suspended' },
                { status: 'active' }
            );
            
            // Activate tất cả users thuộc business
            await User.updateMany(
                { businessId: user.businessId, status: 'suspended', _id: { $ne: user._id } },
                { status: 'active' }
            );
            
            // Activate tất cả staff thuộc hotels của business
            const hotels = await Hotel.find({ businessId: user.businessId });
            const hotelIds = hotels.map(h => h._id);
            if (hotelIds.length > 0) {
                await Staff.updateMany(
                    { hotelId: { $in: hotelIds }, status: 'inactive' },
                    { status: 'active' }
                );
            }
        }
        
        // Nếu user là hotel manager
        if (user.role === 'hotel' && user.hotelId) {
            // Activate hotel
            await Hotel.findByIdAndUpdate(user.hotelId, { status: 'active' });
            
            // Activate tất cả users thuộc hotel
            await User.updateMany(
                { hotelId: user.hotelId, status: 'suspended', _id: { $ne: user._id } },
                { status: 'active' }
            );
            
            // Activate tất cả staff thuộc hotel
            await Staff.updateMany(
                { hotelId: user.hotelId, status: 'inactive' },
                { status: 'active' }
            );
        }
    } catch (error) {
        console.error('Error in cascadeActivateUser:', error);
    }
}

/**
 * Kiểm tra quyền user hiện tại có thể thao tác với target user không
 */
function checkUserPermission(currentUser, targetUser) {
    // Chỉ admin (superadmin + admin) mới có quyền quản lý user
    // Business và Hotel Manager KHÔNG thể quản lý user
    
    // Superadmin có quyền với tất cả users (bao gồm admin, có thể chỉnh sửa role, khóa, xóa admin)
    if (currentUser.role === 'superadmin') {
        // Superadmin có thể quản lý tất cả, kể cả admin
        return true;
    }
    
    // Admin có quyền với tất cả trừ superadmin
    // Admin KHÔNG thể quản lý admin khác (chỉ superadmin mới có thể)
    if (currentUser.role === 'admin') {
        return targetUser.role !== 'superadmin' && targetUser.role !== 'admin';
    }
    
    // Business và Hotel Manager KHÔNG thể quản lý user
    return false;
}

// Đổi mật khẩu người dùng
async function changePassword(req, res) {
    try {
        const { userId } = req.params;
        const { currentPassword, newPassword } = req.body;
        const currentUser = req.user;
        
        // Kiểm tra mật khẩu mới
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
        }
        
        // Tìm người dùng
        const user = await User.findById(userId);
        if (!user || user.status === 'deleted') {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }
        
        // Kiểm tra quyền: chỉ có thể đổi mật khẩu của chính mình hoặc admin có thể đổi cho người khác
        if (currentUser._id.toString() !== userId && !['superadmin', 'admin'].includes(currentUser.role)) {
            return res.status(403).json({ message: 'Bạn không có quyền đổi mật khẩu người dùng này' });
        }
        
        // Nếu đổi cho chính mình, kiểm tra mật khẩu hiện tại
        if (currentUser._id.toString() === userId) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
            }
        }
        
        // Mã hóa mật khẩu mới
        const hashedNewPassword = await bcrypt.hash(newPassword, 8);
        
        // Cập nhật mật khẩu
        user.password = hashedNewPassword;
        await user.save();
        
        res.status(200).json({ message: 'Mật khẩu đã được cập nhật thành công' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ message: 'Lỗi khi đổi mật khẩu', error: error.message });
    }
}

// Lấy thông tin cá nhân
async function getProfile(req, res) {
    try {
        const userId = req.user._id;
        
        const user = await User.findById(userId)
            .select('-password -twoFactorSecret')
            .populate('businessId', 'name status')
            .populate('hotelId', 'name status');
            
        if (!user || user.status === 'deleted') {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }
        
        res.status(200).json(user);
    } catch (error) {
        console.error('Error getting user profile:', error);
        res.status(500).json({ message: 'Lỗi khi lấy thông tin người dùng', error: error.message });
    }
}

// Cập nhật cài đặt tùy chọn
async function updatePreferences(req, res) {
    try {
        const userId = req.user._id;
        const { language, theme, notifications, biometricEnabled } = req.body;
        
        const user = await User.findById(userId);
        if (!user || user.status === 'deleted') {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        const updateData = {};
        if (language) updateData['preferences.language'] = language;
        if (theme) updateData['preferences.theme'] = theme;
        if (biometricEnabled !== undefined) updateData['preferences.biometricEnabled'] = biometricEnabled;
        if (notifications) {
            if (notifications.email !== undefined) updateData['preferences.notifications.email'] = notifications.email;
            if (notifications.sms !== undefined) updateData['preferences.notifications.sms'] = notifications.sms;
            if (notifications.push !== undefined) updateData['preferences.notifications.push'] = notifications.push;
        }
        
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true }
        ).select('preferences');
                
        res.status(200).json({
            message: 'Cập nhật tùy chọn thành công',
            preferences: updatedUser.preferences
        });
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật tùy chọn', error: error.message });
    }
}

// Cập nhật hồ sơ cá nhân
async function updateProfile(req, res) {
    try {
        const userId = req.user._id;
        const {
            fullName,
            phone,
            avatar,
            avatarId,
            bankAccount,
            personalInfo
        } = req.body;
        
        const user = await User.findById(userId);
        if (!user || user.status === 'deleted') {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        const updateData = {};
        
        // Cập nhật thông tin cơ bản
        if (fullName !== undefined) updateData.fullName = fullName;
        if (phone !== undefined) updateData.phone = phone;
        // Ưu tiên avatarId, nếu không có thì dùng avatar (URL)
        if (avatarId !== undefined) {
            updateData.avatarId = avatarId;
            // Nếu có avatarId, tạo URL từ imageId
            if (avatarId) {
                updateData.avatar = `/files/${avatarId}`;
            } else {
                updateData.avatar = '';
            }
        } else if (avatar !== undefined) {
            updateData.avatar = avatar;
            // Nếu avatar là URL từ /files/, extract imageId
            if (avatar && avatar.startsWith('/files/')) {
                const imageId = avatar.replace('/files/', '');
                if (mongoose.Types.ObjectId.isValid(imageId)) {
                    updateData.avatarId = imageId;
                }
            } else if (!avatar) {
                updateData.avatarId = null;
            }
        }
        
        // Cập nhật thông tin ngân hàng
        if (bankAccount) {
            if (bankAccount.bankName !== undefined) updateData['bankAccount.bankName'] = bankAccount.bankName;
            if (bankAccount.accountNumber !== undefined) updateData['bankAccount.accountNumber'] = bankAccount.accountNumber;
            if (bankAccount.accountHolderName !== undefined) updateData['bankAccount.accountHolderName'] = bankAccount.accountHolderName;
            if (bankAccount.beneficiaryName !== undefined) updateData['bankAccount.beneficiaryName'] = bankAccount.beneficiaryName;
            if (bankAccount.branch !== undefined) updateData['bankAccount.branch'] = bankAccount.branch;
            if (bankAccount.swiftCode !== undefined) updateData['bankAccount.swiftCode'] = bankAccount.swiftCode;
            if (bankAccount.iban !== undefined) updateData['bankAccount.iban'] = bankAccount.iban;
            if (bankAccount.qrPaymentUrl !== undefined) updateData['bankAccount.qrPaymentUrl'] = bankAccount.qrPaymentUrl;
        }
        
        // Cập nhật thông tin cá nhân
        if (personalInfo) {
            if (personalInfo.dateOfBirth !== undefined) updateData['personalInfo.dateOfBirth'] = personalInfo.dateOfBirth;
            if (personalInfo.gender !== undefined) updateData['personalInfo.gender'] = personalInfo.gender;
            if (personalInfo.nationality !== undefined) updateData['personalInfo.nationality'] = personalInfo.nationality;
            if (personalInfo.idCard !== undefined) updateData['personalInfo.idCard'] = personalInfo.idCard;
            if (personalInfo.idCardIssueDate !== undefined) updateData['personalInfo.idCardIssueDate'] = personalInfo.idCardIssueDate;
            if (personalInfo.idCardIssuePlace !== undefined) updateData['personalInfo.idCardIssuePlace'] = personalInfo.idCardIssuePlace;
            
            // Cập nhật địa chỉ
            if (personalInfo.address) {
                if (personalInfo.address.street !== undefined) updateData['personalInfo.address.street'] = personalInfo.address.street;
                if (personalInfo.address.ward !== undefined) updateData['personalInfo.address.ward'] = personalInfo.address.ward;
                if (personalInfo.address.district !== undefined) updateData['personalInfo.address.district'] = personalInfo.address.district;
                if (personalInfo.address.city !== undefined) updateData['personalInfo.address.city'] = personalInfo.address.city;
                if (personalInfo.address.country !== undefined) updateData['personalInfo.address.country'] = personalInfo.address.country;
                if (personalInfo.address.postalCode !== undefined) updateData['personalInfo.address.postalCode'] = personalInfo.address.postalCode;
            }
        }
        
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true }
        ).select('-password -twoFactorSecret')
         .populate('businessId', 'name status')
         .populate('hotelId', 'name status');
                
        res.status(200).json({
            success: true,
            message: 'Cập nhật hồ sơ thành công',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi cập nhật hồ sơ', 
            error: error.message 
        });
    }
}

// Quên mật khẩu - gửi email reset password
async function forgotPassword(req, res) {
    try {
        const { email, username } = req.body;
        
        // Xác định identifier: ưu tiên email nếu có, nếu không thì dùng username
        const identifier = email || username;
        
        if (!identifier) {
            return res.status(400).json({ message: 'Vui lòng nhập email hoặc tên đăng nhập' });
        }
        
        // Tìm user bằng email hoặc username
        const isEmail = identifier.includes('@');
        let user;
        
        if (isEmail) {
            user = await User.findOne({ email: identifier });
        } else {
            user = await User.findOne({ username: identifier });
        }
        
        // Luôn trả về thành công để tránh leak thông tin user
        if (!user) {
            return res.status(200).json({ 
                message: 'Nếu email/tên đăng nhập tồn tại, chúng tôi đã gửi link đặt lại mật khẩu đến email của bạn' 
            });
        }
        
        if (user.status === 'suspended' || user.status === 'deleted') {
            return res.status(200).json({ 
                message: 'Nếu email/tên đăng nhập tồn tại, chúng tôi đã gửi link đặt lại mật khẩu đến email của bạn' 
            });
        }
        
        // Tạo token reset password
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 giờ
        
        // Lưu token vào database
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(resetTokenExpiry);
        await user.save();
        
        // Gửi email reset password
        try {
            // Gửi email reset password sử dụng email hệ thống (không dùng emailFrom từ request)
            await sendForgotPasswordEmail(user.email, resetToken, null);
            
            res.status(200).json({ 
                message: 'Chúng tôi đã gửi link đặt lại mật khẩu đến email của bạn. Vui lòng kiểm tra hộp thư.' 
            });
        } catch (emailError) {
            console.error('Error sending forgot password email:', emailError);
            
            // Kiểm tra nếu là lỗi timeout hoặc connection
            const errorMessage = (emailError.message || emailError.toString() || '').toLowerCase();
            const errorCode = emailError.code || '';
            const isTimeoutError = errorMessage.includes('timeout') || 
                                   errorCode === 'ETIMEDOUT' ||
                                   errorCode === 'ECONNECTION' ||
                                   errorMessage.includes('connection timeout');
            
            // Trong môi trường development hoặc khi có SKIP_EMAIL
            const isDevelopment = process.env.NODE_ENV !== 'production';
            const skipEmail = process.env.SKIP_EMAIL === 'true' || process.env.SKIP_EMAIL === '1';
            
            // Nếu là timeout/connection error, luôn xử lý gracefully
            if (isTimeoutError) {
                const resetUrl = `${process.env.APP_URL || 'http://localhost:4200'}/reset-password/${resetToken}`;
                
                console.log('⚠️  Email timeout/connection error - Logging reset token:');
                console.log('📧 Email:', user.email);
                console.log('🔗 Reset URL:', resetUrl);
                console.log('🔑 Reset Token:', resetToken);
                
                // Trong development hoặc khi có SKIP_EMAIL, trả về success với URL
                if (isDevelopment || skipEmail) {
                    res.status(200).json({ 
                        message: 'Link đặt lại mật khẩu đã được tạo. Vui lòng kiểm tra console log để lấy link.',
                        devMode: true,
                        resetUrl: resetUrl
                    });
                } else {
                    // Trong production nhưng email timeout, vẫn trả về success nhưng không trả về URL
                    // Token vẫn được lưu trong DB, admin có thể hỗ trợ
                    res.status(200).json({ 
                        message: 'Yêu cầu đặt lại mật khẩu đã được tạo. Nếu email không đến trong vài phút, vui lòng liên hệ admin với email của bạn để được hỗ trợ.'
                    });
                }
                return;
            }
            
            // Giữ lại token trong database để user có thể thử lại sau
            // KHÔNG xóa token ngay lập tức, để admin có thể hỗ trợ nếu cần
            
            // Log token trong development mode để debug
            if (isDevelopment) {
                console.log('Reset token (DEV ONLY):', resetToken);
                console.log('Reset URL (DEV ONLY):', `${process.env.APP_URL || 'http://localhost:4200'}/reset-password/${resetToken}`);
            }
            
            // Trả về lỗi nhưng vẫn giữ token để có thể thử lại
            res.status(500).json({ 
                message: 'Không thể gửi email lúc này. Vui lòng thử lại sau hoặc liên hệ admin để được hỗ trợ.',
                error: isDevelopment ? emailError.message : undefined
            });
        }
    } catch (error) {
        console.error('Error in forgotPassword:', error);
        res.status(500).json({ message: 'Lỗi khi xử lý yêu cầu quên mật khẩu', error: error.message });
    }
}

// Gửi email xác thực
async function sendVerificationEmail(req, res) {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
        }
        if (user.emailVerified) {
            return res.status(200).json({ success: true, message: 'Email đã được xác thực' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        user.emailVerificationToken = token;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        let emailSettings = null;
        try {
            const { Settings } = require('../models/settings');
            const settingsDoc = await Settings.findOne();
            emailSettings = settingsDoc?.emailSettings || null;
        } catch (e) {
            emailSettings = null;
        }
        const provider = (emailSettings?.emailProvider || process.env.EMAIL_PROVIDER || EMAIL_PROVIDER || 'nodemailer').toLowerCase();
        const templateId = emailSettings?.resendTemplateVerifyEmailId || emailSettings?.resendTemplateVerifyEmailAlias || process.env.RESEND_TEMPLATE_VERIFY_EMAIL_ID || process.env.RESEND_TEMPLATE_VERIFY_EMAIL_ALIAS;
        const fromEmail = emailSettings?.emailFrom || process.env.EMAIL_FROM || '';
        const backendUrl = process.env.BACKEND_PUBLIC_URL || process.env.API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
        const verificationUrl = `${backendUrl}/users/email/verify?token=${token}`;
        const appName = process.env.APP_NAME || emailSettings?.emailFromName || 'PHHotel';
        const logoUrl = `${backendUrl}/images/phgroup_logo_circle.PNG`;

        if (provider === 'resend' && templateId) {
            const variables = {
                logoUrl,
                appName,
                userName: user.username || user.email || '',
                verifyLink: verificationUrl,
                expireTime: '24 giờ'
            };
            const overrides = { from: fromEmail, subject: 'Xác thực email' };
            await sendEmailTemplate(user.email, templateId, variables, overrides, emailSettings || undefined);
        } else {
            const subject = 'Xác thực email';
            const html = `
                <div style="font-family: Inter, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
                  <div style="text-align:center; padding: 24px 0;">
                    <img src="${logoUrl}" alt="${appName}" style="width:48px;height:48px;border-radius:12px;display:block;margin:0 auto 8px auto;" />
                    <div style="font-size: 14px; color: #64748b;">${appName}</div>
                  </div>
                  <div style="text-align:center; margin-bottom: 12px; color:#1f2937;">
                    <span style="font-size:16px;">📧 Xác thực email</span>
                  </div>
                  <div style="margin-top:16px; font-size:15px; line-height:1.6;">
                    <p>Xin chào <strong>${user.username || user.email}</strong>,</p>
                    <p>Vui lòng nhấn nút dưới đây để xác thực địa chỉ email của bạn.</p>
                  </div>
                  <div style="text-align:center; margin: 28px 0;">
                    <a href="${verificationUrl}" style="background-color:#1a73e8; color:#ffffff; padding: 12px 20px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:600;">Xác thực email</a>
                  </div>
                  <div style="text-align:center; margin-top:8px; font-size:12px; color:#64748b;">
                    © ${appName}
                  </div>
                </div>
            `;
            const text = `Xin chào ${user.username || user.email},

Vui lòng truy cập liên kết sau để xác thực email của bạn:
${verificationUrl}

© ${appName}`;
            await sendEmailAdapter(user.email, subject, html, text, fromEmail, emailSettings || undefined);
        }

        return res.json({ success: true, message: 'Đã gửi email xác thực. Vui lòng kiểm tra hộp thư của bạn.' });
    } catch (error) {
        console.error('Error sending verification email:', error);
        return res.status(500).json({ success: false, message: 'Lỗi khi gửi email xác thực', error: error.message });
    }
}

// Xác nhận email qua token
async function verifyEmail(req, res) {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Thiếu token xác thực' });
        }
        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: new Date() }
        });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
        }
        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        const redirectUrl = `${process.env.APP_URL || 'http://localhost:4200'}/profile?emailVerified=1`;
        res.redirect(302, redirectUrl);
    } catch (error) {
        console.error('Error verifying email:', error);
        return res.status(500).json({ success: false, message: 'Lỗi khi xác thực email', error: error.message });
    }
}

// Đặt lại mật khẩu với token
async function resetPassword(req, res) {
    try {
        const { token, password } = req.body;
        
        if (!token || !password) {
            return res.status(400).json({ message: 'Vui lòng nhập token và mật khẩu mới' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }
        
        // Tìm user với token hợp lệ và chưa hết hạn
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({ 
                message: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu mới.' 
            });
        }
        
        if (user.status === 'suspended' || user.status === 'deleted') {
            return res.status(403).json({ message: 'Tài khoản đã bị khóa hoặc không tồn tại' });
        }
        
        // Mã hóa mật khẩu mới
        const hashedPassword = await bcrypt.hash(password, 8);
        
        // Cập nhật mật khẩu và xóa token
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        
        res.status(200).json({ 
            message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.' 
        });
    } catch (error) {
        console.error('Error in resetPassword:', error);
        res.status(500).json({ message: 'Lỗi khi đặt lại mật khẩu', error: error.message });
    }
}

async function refreshAccessToken(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Không có refresh token' });
        }
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        } catch (err) {
            return res.status(401).json({ message: 'Refresh token không hợp lệ hoặc đã hết hạn' });
        }
        const user = await User.findById(decoded.userId);
        if (!user || user.status !== 'active') {
            return res.status(403).json({ message: 'Tài khoản không hợp lệ' });
        }
        let hotelId = user.hotelId;
        if (user.role === 'staff' && !hotelId) {
            const staff = await Staff.findOne({ userId: user._id });
            if (staff && staff.hotelId) {
                hotelId = staff.hotelId;
            }
        }
        const payloadData = {
            userId: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status,
            businessId: user.businessId,
            hotelId
        };
        const accessToken = jwt.sign(payloadData, process.env.JWT_SECRET, { expiresIn: '30d' });
        const userToReturn = user.toObject();
        delete userToReturn.password;
        delete userToReturn.twoFactorSecret;
        res.status(200).json({ token: accessToken, user: userToReturn });
    } catch (error) {
        console.error('Error refreshing access token:', error);
        res.status(500).json({ message: 'Lỗi khi cấp lại access token' });
    }
}

async function logout(req, res) {
    try {
        const sameSiteEnv = (process.env.COOKIE_SAMESITE || '').toLowerCase().trim();
        let sameSitePolicy;
        if (sameSiteEnv === 'strict' || sameSiteEnv === 'lax') {
            sameSitePolicy = sameSiteEnv;
        } else if (sameSiteEnv === 'none') {
            sameSitePolicy = 'lax';
        } else if (sameSiteEnv === 'true') {
            sameSitePolicy = true;
        } else if (sameSiteEnv === 'false') {
            sameSitePolicy = false;
        } else {
            sameSitePolicy = 'lax';
        }
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: sameSitePolicy,
            path: '/'
        });
        res.status(200).json({ message: 'Đăng xuất thành công' });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ message: 'Lỗi khi đăng xuất' });
    }
}

module.exports = {
    getUserInfo,
    createUser,
    registerUser,
    login,
    createBusinessUser,
    getAllUsers,
    getUsersByBusiness,
    getUsersByHotel,
    getUsersByRole,
    updateUser,
    updateUserStatus,
    changePassword,
    getProfile,
    updatePreferences,
    updateProfile,
    forgotPassword,
    resetPassword,
    refreshAccessToken,
    logout,
    sendVerificationEmail,
    verifyEmail
}