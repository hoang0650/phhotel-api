const { Business } = require('../models/business');
const { Hotel } = require('../models/hotel');
const { User } = require('../models/users');
const { Staff } = require('../models/staff');
const jwt = require('jsonwebtoken');
const { Subscription } = require('../models/subscriptions');
const mongoose = require('mongoose');

/**
 * Tạo doanh nghiệp mới
 */
async function createBusiness(req, res) {
    try {
        const businessData = req.body;
        const currentUser = req.user;
        
        console.log('Creating business with data:', businessData);
        console.log('Current user:', currentUser?._id, currentUser?.role);
        
        // Lấy ownerId từ request body hoặc từ user hiện tại
        let ownerId = businessData.ownerId;
        
        if (!ownerId && currentUser) {
            // Lấy _id từ user object (có thể là ObjectId hoặc string)
            ownerId = currentUser._id.toString();
            businessData.ownerId = ownerId;
        }
        
        // Kiểm tra nếu vẫn không có ownerId
        if (!businessData.ownerId) {
            return res.status(400).json({ message: 'Không thể xác định chủ sở hữu doanh nghiệp' });
        }
        
        // Validate ownerId là ObjectId hợp lệ
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ message: 'ownerId không hợp lệ' });
        }
        
        // Kiểm tra user tồn tại
        const ownerUser = await User.findById(ownerId);
        if (!ownerUser) {
            return res.status(400).json({ message: 'Người dùng chủ sở hữu không tồn tại' });
        }
        
        // Tạo instance của Business từ dữ liệu nhận được
        const newBusiness = new Business({
            ...businessData,
            ownerId: ownerId,
            status: businessData.status || 'pending'
        });
        
        // Lưu business trước để có _id
        const savedBusiness = await newBusiness.save();
        console.log('Business saved:', savedBusiness._id);
        
        // Nếu có danh sách hotels được gửi lên
        if (businessData.hotels && businessData.hotels.length > 0) {
            // Cập nhật businessId cho mỗi hotel
            await Promise.all(businessData.hotels.map(hotelId => 
                Hotel.findByIdAndUpdate(hotelId, { businessId: savedBusiness._id })
            ));
        }
        
        // Cập nhật user chủ sở hữu với businessId mới (chỉ nếu chưa có)
        if (!ownerUser.businessId) {
            await User.findByIdAndUpdate(ownerId, { 
                businessId: savedBusiness._id
            });
        }
        
        // Lấy thông tin business với hotels được populate
        const populatedBusiness = await Business.findById(savedBusiness._id)
            .populate('hotels')
            .populate('ownerId', 'username email fullName');
        
        res.status(201).json(populatedBusiness);
    } catch (error) {
        console.error('Error creating business:', error);
        res.status(400).json({ message: error.message || 'Lỗi khi tạo doanh nghiệp' });
    }
}

/**
 * Xóa doanh nghiệp - cascade xóa hoặc unlink các entities liên quan
 */
async function deleteBusiness(req, res) {
    try {
        const { id } = req.params;
        
        // Tìm business trước khi xóa để lấy thông tin
        const business = await Business.findById(id);
        if (!business) {
            return res.status(404).json({ message: 'Không tìm thấy doanh nghiệp' });
        }
        
        // Xóa businessId từ người dùng là chủ sở hữu
        if (business.ownerId) {
            await User.findByIdAndUpdate(
                business.ownerId, 
                { $unset: { businessId: "" } }
            );
        }
        
        // Xóa businessId từ tất cả các hotels thuộc business này
        if (business.hotels && business.hotels.length > 0) {
            await Hotel.updateMany(
                { businessId: id }, 
                { $unset: { businessId: "" } }
            );
        }
        
        // Xóa businessId từ tất cả users thuộc business
        await User.updateMany(
            { businessId: id },
            { $unset: { businessId: "" } }
        );
        
        // Xóa business
        await Business.findByIdAndDelete(id);
        
        res.status(200).json({ message: 'Đã xóa doanh nghiệp thành công' });
    } catch (error) {
        console.error('Error deleting business:', error);
        res.status(400).json({ message: error.message });
    }
}

/**
 * Cập nhật doanh nghiệp
 */
async function updateBusiness(req, res) {
    try {
        const { id } = req.params;
        const updates = req.body;
        const currentUser = req.user;
        
        // Business KHÔNG thể cập nhật doanh nghiệp, chỉ admin
        if (currentUser.role === 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật doanh nghiệp. Vui lòng liên hệ Admin.' });
        }
        
        // Không cho phép cập nhật một số trường nhạy cảm
        delete updates.ownerId;
        delete updates.subscription;
        
        // Nếu không phải admin, không cho phép thay đổi status
        if (!['superadmin', 'admin'].includes(currentUser?.role)) {
            delete updates.status;
        }
        
        // Xử lý logoId và logo tương tự như avatarId
        if (updates.logoId !== undefined) {
            if (updates.logoId) {
                updates.logo = `/files/${updates.logoId}`;
            } else {
                updates.logo = '';
            }
        } else if (updates.logo !== undefined) {
            // Nếu logo là URL từ /files/, extract logoId
            if (updates.logo && updates.logo.startsWith('/files/')) {
                const logoId = updates.logo.replace('/files/', '');
                if (mongoose.Types.ObjectId.isValid(logoId)) {
                    updates.logoId = logoId;
                }
            } else if (!updates.logo) {
                updates.logoId = null;
            }
        }
        
        const business = await Business.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        ).populate('hotels').populate('ownerId', 'username email fullName');
        
        if (!business) {
            return res.status(404).json({ message: 'Không tìm thấy doanh nghiệp' });
        }
        
        // Cập nhật hotels nếu có thay đổi
        if (updates.hotels) {
            // Xóa businessId từ hotels cũ không còn trong danh sách
            await Hotel.updateMany(
                { businessId: id, _id: { $nin: updates.hotels } },
                { $unset: { businessId: "" } }
            );
            
            // Thêm businessId cho hotels mới
            await Hotel.updateMany(
                { _id: { $in: updates.hotels } },
                { $set: { businessId: id } }
            );
        }
        
        res.status(200).json(business);
    } catch (error) {
        console.error('Error updating business:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật doanh nghiệp', error: error.message });
    }
}

/**
 * Cập nhật trạng thái doanh nghiệp với cascade blocking
 */
async function updateBusinessStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        // Kiểm tra trạng thái hợp lệ
        if (!['pending', 'active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
        }
        
        const business = await Business.findByIdAndUpdate(
            id,
            { $set: { status } },
            { new: true }
        ).populate('hotels').populate('ownerId', 'username email fullName');
        
        if (!business) {
            return res.status(404).json({ message: 'Không tìm thấy doanh nghiệp' });
        }
        
        // Cascade blocking: nếu suspend/inactive doanh nghiệp
        if (status === 'suspended' || status === 'inactive') {
            // Suspend owner
            if (business.ownerId) {
                await User.findByIdAndUpdate(
                    business.ownerId._id || business.ownerId,
                    { $set: { status: 'suspended' } }
                );
            }
            
            // Suspend tất cả hotels thuộc business
            await Hotel.updateMany(
                { businessId: id },
                { $set: { status: 'suspended' } }
            );
            
            // Suspend tất cả users có businessId này
            await User.updateMany(
                { businessId: id },
                { $set: { status: 'suspended' } }
            );
            
            // Suspend tất cả staff thuộc các hotels của business
            const hotelIds = business.hotels?.map(h => h._id || h) || [];
            if (hotelIds.length > 0) {
                await Staff.updateMany(
                    { hotelId: { $in: hotelIds } },
                    { $set: { status: 'inactive' } }
                );
            }
        } 
        // Nếu kích hoạt lại business
        else if (status === 'active') {
            // Kích hoạt lại owner
            if (business.ownerId) {
                await User.findByIdAndUpdate(
                    business.ownerId._id || business.ownerId,
                    { $set: { status: 'active' } }
                );
            }
            
            // Kích hoạt lại hotels
            await Hotel.updateMany(
                { businessId: id },
                { $set: { status: 'active' } }
            );
            
            // Kích hoạt lại users
            await User.updateMany(
                { businessId: id, status: 'suspended' },
                { $set: { status: 'active' } }
            );
            
            // Kích hoạt lại staff
            const hotelIds = business.hotels?.map(h => h._id || h) || [];
            if (hotelIds.length > 0) {
                await Staff.updateMany(
                    { hotelId: { $in: hotelIds }, status: 'inactive' },
                    { $set: { status: 'active' } }
                );
            }
        }
        
        res.status(200).json({
            message: `Trạng thái doanh nghiệp đã được cập nhật thành "${status}"`,
            business
        });
    } catch (error) {
        console.error('Error updating business status:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái doanh nghiệp', error: error.message });
    }
}

/**
 * Lấy tất cả doanh nghiệp - filter theo role
 */
async function getAllBusinesses(req, res) {
    try {
        const currentUser = req.user;
        let query = {};
        
        // Filter theo role
        if (currentUser.role === 'business') {
            // Business chỉ thấy business của mình
            query = { _id: currentUser.businessId };
        }
        // Admin và superadmin thấy tất cả
        
        const businesses = await Business.find(query)
            .populate('ownerId', 'username email fullName')
            .populate('hotels', 'name address status')
            .sort({ createdAt: -1 });
        
        res.status(200).json(businesses);
    } catch (error) {
        console.error('Error fetching businesses:', error);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách doanh nghiệp', error: error.message });
    }
}

/**
 * Lấy doanh nghiệp theo ID
 */
async function getBusinessById(req, res) {
    try {
        const { id } = req.params;
        const currentUser = req.user;
        
        // Validate id - phải là string hợp lệ, không phải "[object Object]"
        if (!id || id === '[object Object]' || typeof id !== 'string' || id.length !== 24) {
            return res.status(400).json({ 
                message: 'ID doanh nghiệp không hợp lệ',
                error: 'Invalid business ID format'
            });
        }
        
        const business = await Business.findById(id)
            .populate('ownerId', 'username email fullName')
            .populate('hotels')
            .populate('subscription.plan');
        
        if (!business) {
            return res.status(404).json({ message: 'Không tìm thấy doanh nghiệp' });
        }
        
        // Admin và Superadmin có quyền xem tất cả businesses
        if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
            return res.status(200).json(business);
        }
        
        // Business chỉ được xem business của mình
        if (currentUser.role === 'business') {
            if (currentUser.businessId && currentUser.businessId.toString() !== business._id.toString()) {
                return res.status(403).json({ message: 'Bạn không có quyền xem doanh nghiệp này' });
            }
        }
        
        // Hotel và các role khác không được phép xem business
        if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
            return res.status(403).json({ message: 'Bạn không có quyền xem thông tin doanh nghiệp' });
        }
        
        res.status(200).json(business);
    } catch (error) {
        console.error('Error fetching business:', error);
        res.status(500).json({ message: 'Lỗi khi lấy thông tin doanh nghiệp', error: error.message });
    }
}

/**
 * Lấy doanh nghiệp theo owner ID
 */
async function getBusinessByOwner(req, res) {
    try {
        const { ownerId } = req.params;
        const currentUser = req.user;
        
        // Kiểm tra quyền: chỉ cho phép lấy thông tin của chính mình hoặc admin
        if (currentUser._id.toString() !== ownerId && 
            !['superadmin', 'admin'].includes(currentUser.role)) {
            return res.status(403).json({ message: 'Không có quyền truy cập' });
        }
        
        const business = await Business.findOne({ ownerId })
            .populate('ownerId', 'username email fullName')
            .populate('hotels');
        
        if (!business) {
            return res.status(404).json({ message: 'Không tìm thấy doanh nghiệp' });
        }
        
        res.status(200).json(business);
    } catch (error) {
        console.error('Error fetching business by owner:', error);
        res.status(500).json({ message: 'Lỗi khi lấy thông tin doanh nghiệp', error: error.message });
    }
}

/**
 * Cập nhật gói đăng ký
 */
async function updateSubscription(req, res) {
    try {
        const { id } = req.params;
        const { plan, contractYears = 1, autoRenew = true } = req.body;
        
        // Kiểm tra gói đăng ký hợp lệ
        if (!['starter', 'professional', 'vip'].includes(plan)) {
            return res.status(400).json({ message: 'Gói đăng ký không hợp lệ' });
        }
        
        const business = await Business.findById(id);
        if (!business) {
            return res.status(404).json({ message: 'Không tìm thấy doanh nghiệp' });
        }
        
        // Cập nhật thông tin gói đăng ký
        business.subscription.plan = plan;
        business.subscription.contractYears = contractYears;
        business.subscription.autoRenew = autoRenew;
        business.subscription.startDate = new Date();
        business.subscription.endDate = new Date();
        business.subscription.endDate.setFullYear(business.subscription.endDate.getFullYear() + contractYears);
        business.subscription.paymentStatus = 'active';
        
        // Cập nhật giới hạn tùy theo gói
        switch (plan) {
            case 'starter':
                business.limits.maxHotels = 1;
                business.limits.maxRoomsPerHotel = 20;
                business.limits.maxStaffPerHotel = 5;
                business.limits.features = {
                    otaIntegration: false,
                    bankIntegration: false,
                    staffManagement: true,
                    ai: false
                };
                break;
            case 'professional':
                business.limits.maxHotels = 3;
                business.limits.maxRoomsPerHotel = 50;
                business.limits.maxStaffPerHotel = 20;
                business.limits.features = {
                    otaIntegration: true,
                    bankIntegration: true,
                    staffManagement: true,
                    ai: false
                };
                break;
            case 'vip':
                business.limits.maxHotels = 10;
                business.limits.maxRoomsPerHotel = 100;
                business.limits.maxStaffPerHotel = 50;
                business.limits.features = {
                    otaIntegration: true,
                    bankIntegration: true,
                    staffManagement: true,
                    ai: true
                };
                break;
        }
        
        await business.save();
        
        // Tạo hoặc cập nhật bản ghi đăng ký
        let subscription = await Subscription.findOne({ businessId: id });
        
        if (!subscription) {
            subscription = new Subscription({
                businessId: id,
                plan,
                billingCycle: contractYears > 1 ? 'yearly' : 'monthly',
                startDate: business.subscription.startDate,
                endDate: business.subscription.endDate,
                price: calculateSubscriptionPrice(plan, contractYears),
                autoRenew,
                status: 'active'
            });
        } else {
            subscription.plan = plan;
            subscription.billingCycle = contractYears > 1 ? 'yearly' : 'monthly';
            subscription.startDate = business.subscription.startDate;
            subscription.endDate = business.subscription.endDate;
            subscription.price = calculateSubscriptionPrice(plan, contractYears);
            subscription.autoRenew = autoRenew;
            subscription.status = 'active';
        }
        
        await subscription.save();
        
        res.status(200).json({
            message: 'Gói đăng ký đã được cập nhật thành công',
            business,
            subscription
        });
    } catch (error) {
        console.error('Error updating subscription:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật gói đăng ký', error: error.message });
    }
}

/**
 * Hàm tính giá gói đăng ký
 */
function calculateSubscriptionPrice(plan, years) {
    let basePrice = 0;
    
    switch (plan) {
        case 'starter':
            basePrice = 19.99;
            break;
        case 'professional':
            basePrice = 49.99;
            break;
        case 'vip':
            basePrice = 99.99;
            break;
    }
    
    // Giảm giá khi đăng ký nhiều năm
    let discount = 0;
    if (years === 2) discount = 0.1;
    else if (years >= 3) discount = 0.15;
    
    const price = years === 1 
        ? basePrice * 12
        : basePrice * 12 * years * (1 - discount);
    
    return Math.round(price * 100) / 100;
}

module.exports = {
    createBusiness,
    deleteBusiness,
    updateBusiness,
    updateBusinessStatus,
    getAllBusinesses,
    getBusinessById,
    getBusinessByOwner,
    updateSubscription
};
