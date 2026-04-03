const { Hotel } = require('../models/hotel');
const { Business } = require('../models/business');
const { User } = require('../models/users');
const { Staff } = require('../models/staff');
const mongoose = require('mongoose');

function createService(req, res) {
    const { id } = req.params;
    const { name, description, quantity, price } = req.body;
    Hotel.findByIdAndUpdate(id, { $push: { service: { name, description, quantity, price } } }, { new: true }).then(hotel => {
        if (!hotel) return res.status(404).send('Hotel not found');

        res.send('Service added successfully')
    }).catch(err => res.status(500).send('Error adding service: ' + err))
}

function editService(req, res) {
    const { id, serviceId } = req.params;
    const { name, description, quantity, price } = req.body;
    Hotel.findOneAndUpdate({ _id: id, "services._id": serviceId }, { $set: { "services.$.name": name, "services.$.description": description, "services.$.quantity": quantity, "services.$.price": price } },
        { new: true }
    ).then(hotel => {
        if (!hotel) return res.status(404).send('Hotel or service not found');

        res.send('Service updated successfully');
    })
        .catch(err => res.status(500).send('Error updating service: ' + err));
}

function deleteService(req, res) {
    const { id, serviceId } = req.params;

    Hotel.findByIdAndUpdate(
        id,
        { $pull: { services: { _id: serviceId } } },
        { new: true }
    )
        .then(hotel => {
            if (!hotel) return res.status(404).send('Hotel or service not found');

            res.send('Service deleted successfully');
        })
        .catch(err => res.status(500).send('Error deleting service: ' + err));
}

// Tạo khách sạn mới
async function createHotel(req, res) {
    try {
        const { name, businessId, address, contactInfo, description, starRating, managerId, status, facilities, settings } = req.body;
        const currentUser = req.user;
        
        // Business KHÔNG thể tạo khách sạn, chỉ admin
        if (currentUser.role === 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền tạo khách sạn. Vui lòng liên hệ Admin.' });
        }
        
        // Xác định businessId
        let finalBusinessId = businessId;
        
        if (!finalBusinessId) {
            return res.status(400).json({ message: 'Vui lòng chọn doanh nghiệp' });
        }
        
        // Kiểm tra business có tồn tại không
        const business = await Business.findById(finalBusinessId);
        if (!business) {
            return res.status(404).json({ message: 'Không tìm thấy doanh nghiệp' });
        }
        
        // Kiểm tra business có bị block không
        if (business.status === 'suspended' || business.status === 'inactive') {
            return res.status(403).json({ message: 'Doanh nghiệp đang bị đình chỉ, không thể tạo khách sạn mới' });
        }
        
        // Kiểm tra giới hạn số lượng khách sạn của doanh nghiệp
        const hotelCount = await Hotel.countDocuments({ businessId: finalBusinessId });
        if (business.limits && hotelCount >= business.limits.maxHotels) {
            return res.status(403).json({ 
                message: `Đã đạt giới hạn số lượng khách sạn (${business.limits.maxHotels}) cho gói đăng ký này` 
            });
        }
        
        // Tạo khách sạn mới
        const hotelData = {
            name,
            businessId: finalBusinessId,
            status: status || 'active',
            createdAt: Date.now()
        };
        
        // Thêm các field optional
        if (address) hotelData.address = address;
        if (contactInfo) hotelData.contactInfo = contactInfo;
        if (req.body.taxId) hotelData.taxId = req.body.taxId;
        if (description) hotelData.description = description;
        if (starRating !== undefined && starRating !== null) hotelData.starRating = Number(starRating);
        if (managerId) hotelData.managerId = managerId;
        if (facilities) hotelData.facilities = facilities;
        if (settings) hotelData.settings = settings;
        
        // Xử lý logo
        if (req.body.logoId) {
            hotelData.logoId = req.body.logoId;
            hotelData.logo = `/files/${req.body.logoId}`;
        } else if (req.body.logo) {
            hotelData.logo = req.body.logo;
            if (req.body.logo.includes('/files/')) {
                const extractedId = req.body.logo.split('/files/')[1]?.split('?')[0];
                if (extractedId) {
                    hotelData.logoId = extractedId;
                }
            }
        }
        
        const hotel = new Hotel(hotelData);
        const savedHotel = await hotel.save();
        
        // Cập nhật danh sách khách sạn trong business
        await Business.findByIdAndUpdate(
            finalBusinessId,
            { $push: { hotels: savedHotel._id } }
        );
        
        // Cập nhật hotelId cho manager nếu có
        if (managerId) {
            await User.findByIdAndUpdate(
                managerId,
                { 
                    hotelId: savedHotel._id,
                    businessId: finalBusinessId,
                    role: 'hotel'
                }
            );
        }
        
        res.status(201).json(savedHotel);
    } catch (error) {
        console.error('Error creating hotel:', error);
        res.status(500).json({ message: 'Lỗi khi tạo khách sạn', error: error.message });
    }
}

// Lấy tất cả khách sạn - với phân quyền
async function getHotels(req, res) {
    try {
        const currentUser = req.user;
        const { businessId, status } = req.query;
        
        // Tạo query dựa trên tham số và quyền
        const query = {};
        
        // Admin/Superadmin thấy tất cả
        if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
            if (businessId) {
                // Convert businessId từ query string sang ObjectId nếu cần
                query.businessId = mongoose.Types.ObjectId.isValid(businessId) 
                    ? (typeof businessId === 'string' ? new mongoose.Types.ObjectId(businessId) : businessId)
                    : businessId;
            }
            if (status) query.status = status;
        } 
        // Business chỉ thấy hotels của mình
        else if (currentUser.role === 'business') {
            // LUÔN reload user từ database để đảm bảo có businessId đầy đủ và chính xác
            const reloadedUser = await User.findById(currentUser._id).select('businessId role');
            if (!reloadedUser) {
                console.error('Business user not found:', currentUser._id);
                return res.status(200).json([]);
            }
            
            let userBusinessId = reloadedUser.businessId;
            
            // Nếu vẫn không có businessId sau khi reload, trả về mảng rỗng
            if (!userBusinessId) {
                console.log('Business user has no businessId after reload:', {
                    userId: currentUser._id,
                    username: currentUser.username,
                    role: currentUser.role,
                    reloadedUser: {
                        _id: reloadedUser._id,
                        businessId: reloadedUser.businessId,
                        role: reloadedUser.role
                    }
                });
                return res.status(200).json([]);
            }
            
            // Convert businessId sang ObjectId để query (Hotel model sử dụng ObjectId)
            // Đảm bảo format đúng cho Mongoose query
            try {
                if (typeof userBusinessId === 'string') {
                    // Nếu là string, convert sang ObjectId
                    query.businessId = new mongoose.Types.ObjectId(userBusinessId);
                } else if (userBusinessId instanceof mongoose.Types.ObjectId) {
                    // Nếu đã là ObjectId, sử dụng trực tiếp
                    query.businessId = userBusinessId;
                } else if (userBusinessId.toString) {
                    // Nếu có method toString, convert sang string rồi sang ObjectId
                    query.businessId = new mongoose.Types.ObjectId(userBusinessId.toString());
                } else {
                    console.error('Cannot convert businessId to ObjectId:', {
                        businessId: userBusinessId,
                        type: typeof userBusinessId,
                        constructor: userBusinessId?.constructor?.name
                    });
                    return res.status(200).json([]);
                }
            } catch (convertError) {
                console.error('Error converting businessId to ObjectId:', {
                    businessId: userBusinessId,
                    error: convertError.message
                });
                return res.status(200).json([]);
            }
            
            if (status) query.status = status;
            
            console.log('Business user filtering hotels:', {
                userId: currentUser._id,
                username: currentUser.username,
                originalBusinessId: currentUser.businessId,
                reloadedBusinessId: userBusinessId,
                queryBusinessId: query.businessId,
                queryBusinessIdType: query.businessId.constructor.name,
                query: JSON.stringify(query)
            });
        }
        // Hotel manager chỉ thấy hotel của mình
        else if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
            if (currentUser.hotelId) {
                // Convert hotelId sang ObjectId nếu cần
                if (typeof currentUser.hotelId === 'string') {
                    query._id = new mongoose.Types.ObjectId(currentUser.hotelId);
                } else {
                    query._id = currentUser.hotelId;
                }
            } else {
                return res.status(200).json([]);
            }
        }
        else {
            return res.status(200).json([]);
        }
        
        // Thực hiện query với logging
        console.log('Executing Hotel.find with query:', {
            query: query,
            queryString: JSON.stringify(query)
        });
        
        const hotels = await Hotel.find(query)
            .populate('businessId', 'name status')
            .populate('managerId', 'username email fullName')
            .select('-revenue'); // Không trả về dữ liệu doanh thu chi tiết
        
        console.log('Hotels found:', {
            query: query,
            count: hotels.length,
            hotels: hotels.map(h => ({ 
                id: h._id, 
                name: h.name, 
                businessId: h.businessId?._id || h.businessId,
                businessIdType: typeof (h.businessId?._id || h.businessId),
                businessIdString: (h.businessId?._id || h.businessId)?.toString()
            }))
        });
        
        // Đảm bảo businessId được trả về đúng format (string hoặc object với _id)
        const formattedHotels = hotels.map(hotel => {
            const hotelObj = hotel.toObject ? hotel.toObject() : hotel;
            // Đảm bảo businessId luôn có _id nếu là object
            if (hotelObj.businessId && typeof hotelObj.businessId === 'object' && hotelObj.businessId._id) {
                hotelObj.businessId = hotelObj.businessId._id.toString();
            } else if (hotelObj.businessId && typeof hotelObj.businessId === 'object') {
                hotelObj.businessId = hotelObj.businessId.toString();
            }
            return hotelObj;
        });
        
        res.status(200).json(formattedHotels);
    } catch (error) {
        console.error('Error fetching hotels:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách khách sạn', error: error.message });
    }
}

// Lấy hotels theo business ID
async function getHotelsByBusiness(req, res) {
    try {
        const currentUser = req.user;
        const { businessId } = req.params;
        
        // Extract user businessId để so sánh
        let userBusinessId = null;
        if (currentUser.businessId) {
            if (typeof currentUser.businessId === 'string') {
                userBusinessId = currentUser.businessId;
            } else if (currentUser.businessId instanceof mongoose.Types.ObjectId) {
                userBusinessId = currentUser.businessId.toString();
            } else if (currentUser.businessId._id) {
                userBusinessId = typeof currentUser.businessId._id === 'string' 
                    ? currentUser.businessId._id 
                    : currentUser.businessId._id.toString();
            } else if (currentUser.businessId.toString) {
                userBusinessId = currentUser.businessId.toString();
            }
        }
        
        // Kiểm tra quyền
        if (currentUser.role === 'business' && userBusinessId && userBusinessId !== businessId) {
            return res.status(403).json({ message: 'Bạn không có quyền xem khách sạn của doanh nghiệp này' });
        }
        
        // Convert businessId từ params sang ObjectId
        const businessIdObj = mongoose.Types.ObjectId.isValid(businessId) 
            ? new mongoose.Types.ObjectId(businessId) 
            : businessId;
        
        const hotels = await Hotel.find({ businessId: businessIdObj })
            .populate('businessId', 'name status')
            .populate('managerId', 'username email fullName')
            .select('-revenue');
        
        res.status(200).json(hotels);
    } catch (error) {
        console.error('Error fetching hotels by business:', error);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách khách sạn', error: error.message });
    }
}

// Lấy khách sạn theo ID
async function getHotelById(req, res) {
    try {
        const currentUser = req.user;
        
        // Không cho phép guest truy cập
        if (currentUser.role === 'guest') {
            return res.status(403).json({ message: 'Bạn không có quyền xem thông tin khách sạn' });
        }
        
        const hotel = await Hotel.findById(req.params.id)
            .populate('businessId', 'name status limits logo logoId')
            .populate('managerId', 'username email fullName bankAccount')
            .populate('rooms')
            .populate('staff');
        
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }
        
        // Admin và Superadmin có quyền xem tất cả hotels
        if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
            return res.status(200).json(hotel);
        }
        
        // Kiểm tra quyền truy cập cho các role khác
        if (currentUser.role === 'business') {
            // Business chỉ xem được hotels của business mình
            let hotelBusinessId = null;
            if (hotel.businessId) {
                if (typeof hotel.businessId === 'string') {
                    hotelBusinessId = hotel.businessId;
                } else if (hotel.businessId._id) {
                    hotelBusinessId = typeof hotel.businessId._id === 'string' 
                        ? hotel.businessId._id 
                        : hotel.businessId._id.toString();
                } else if (hotel.businessId.toString) {
                    hotelBusinessId = hotel.businessId.toString();
                }
            }
            
            let userBusinessId = null;
            if (currentUser.businessId) {
                if (typeof currentUser.businessId === 'string') {
                    userBusinessId = currentUser.businessId;
                } else if (currentUser.businessId instanceof mongoose.Types.ObjectId) {
                    userBusinessId = currentUser.businessId.toString();
                } else if (currentUser.businessId._id) {
                    userBusinessId = typeof currentUser.businessId._id === 'string' 
                        ? currentUser.businessId._id 
                        : currentUser.businessId._id.toString();
                } else if (currentUser.businessId.toString) {
                    userBusinessId = currentUser.businessId.toString();
                }
            }
            
            if (hotelBusinessId && userBusinessId && hotelBusinessId !== userBusinessId) {
                return res.status(403).json({ message: 'Bạn không có quyền xem khách sạn này' });
            }
            // Nếu businessId khớp hoặc user không có businessId (cho phép xem để tạo booking)
            return res.status(200).json(hotel);
        }
        
        if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
            // Hotel và Staff chỉ có thể xem hotel của mình
            const userHotelId = currentUser.hotelId?.toString 
                ? currentUser.hotelId.toString() 
                : (currentUser.hotelId || null);
            
            // Nếu user có hotelId và khớp với hotel được yêu cầu
            if (userHotelId && hotel._id.toString() === userHotelId) {
                return res.status(200).json(hotel);
            }
            
            // Nếu user không có hotelId hoặc hotelId không khớp, không cho phép xem
            return res.status(403).json({ message: 'Bạn không có quyền xem khách sạn này' });
        }
        
        // Các role khác (nếu có) - mặc định cho phép xem
        res.status(200).json(hotel);
    } catch (error) {
        console.error('Error fetching hotel:', error);
        res.status(500).json({ message: 'Lỗi khi lấy thông tin khách sạn', error: error.message });
    }
}

// Cập nhật khách sạn
async function updateHotel(req, res) {
    try {
        const currentUser = req.user;
        const { id } = req.params;
        const updates = { ...req.body };
        
        // Kiểm tra khách sạn tồn tại
        const currentHotel = await Hotel.findById(id);
        if (!currentHotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }
        
        // Business KHÔNG thể cập nhật khách sạn, chỉ admin
        if (currentUser.role === 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật khách sạn. Vui lòng liên hệ Admin.' });
        }
        
        // Hotel manager KHÔNG thể cập nhật thông tin hotel, chỉ admin
        if (currentUser.role === 'hotel') {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật thông tin khách sạn. Vui lòng liên hệ Admin.' });
        }
        
        // Kiểm tra trường cần bảo vệ không cho update trực tiếp
        delete updates.businessId;
        delete updates.createdAt;
        delete updates.revenue;
        
        // Xử lý nếu có thay đổi managerId
        if (updates.managerId && updates.managerId !== currentHotel.managerId?.toString()) {
            // Xóa hotelId của manager cũ nếu có
            if (currentHotel.managerId) {
                await User.findByIdAndUpdate(
                    currentHotel.managerId,
                    { $unset: { hotelId: "" } }
                );
            }
            
            // Cập nhật hotelId và role cho manager mới
            await User.findByIdAndUpdate(
                updates.managerId,
                { 
                    hotelId: id,
                    businessId: currentHotel.businessId,
                    role: 'hotel'
                }
            );
        }
        
        // Ép kiểu starRating về number nếu có
        if (updates.starRating !== undefined && updates.starRating !== null) {
            updates.starRating = Number(updates.starRating);
        }
        
        // Xử lý bankAccount nếu có (merge với bankAccount hiện tại)
        if (updates.bankAccount) {
          const currentBankAccount = currentHotel.bankAccount || {};
          updates.bankAccount = {
            ...currentBankAccount,
            ...updates.bankAccount
          };
        }
        
        // Xử lý logo
        if (updates.logoId !== undefined) {
            updates.logo = updates.logoId ? `/files/${updates.logoId}` : '';
        } else if (updates.logo !== undefined) {
            // Nếu logo là một URL từ /files/, cố gắng trích xuất logoId
            if (updates.logo && updates.logo.includes('/files/')) {
                const extractedId = updates.logo.split('/files/')[1]?.split('?')[0];
                if (extractedId) {
                    updates.logoId = extractedId;
                } else {
                    updates.logoId = null; // Xóa logoId nếu URL không hợp lệ
                }
            } else {
                updates.logoId = null; // Xóa logoId nếu là URL không phải từ /files/
            }
        }
        
        // Cập nhật khách sạn
        const hotel = await Hotel.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );
        
        res.status(200).json(hotel);
    } catch (error) {
        console.error('Error updating hotel:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật khách sạn', error: error.message });
    }
}

// Cập nhật trạng thái khách sạn - với cascade blocking
async function updateHotelStatus(req, res) {
    try {
        const currentUser = req.user;
        const { id } = req.params;
        const { status } = req.body;
        
        // Kiểm tra trạng thái hợp lệ
        if (!['active', 'inactive', 'maintenance', 'suspended'].includes(status)) {
            return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
        }
        
        const currentHotel = await Hotel.findById(id);
        if (!currentHotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }
        
        // Business KHÔNG thể cập nhật trạng thái khách sạn, chỉ admin
        if (currentUser.role === 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật trạng thái khách sạn. Vui lòng liên hệ Admin.' });
        }
        
        const hotel = await Hotel.findByIdAndUpdate(
            id,
            { $set: { status } },
            { new: true }
        );
        
        // Cascade blocking: khi hotel bị suspended, tất cả staff cũng bị suspended
        if (status === 'suspended' || status === 'inactive') {
            await cascadeSuspendHotel(id);
        } else if (status === 'active') {
            // Kích hoạt lại staff khi hotel được kích hoạt lại
            await cascadeActivateHotel(id);
        }
        
        res.status(200).json({
            message: `Trạng thái khách sạn đã được cập nhật thành "${status}"`,
            hotel
        });
    } catch (error) {
        console.error('Error updating hotel status:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái khách sạn', error: error.message });
    }
}

// Helper: Cascade suspend hotel - tạm ngưng tất cả staff thuộc hotel
async function cascadeSuspendHotel(hotelId) {
    try {
        // Tạm ngưng tất cả users có hotelId này
        await User.updateMany(
            { hotelId: hotelId },
            { $set: { status: 'suspended' } }
        );
        
        // Tạm ngưng tất cả staff có hotelId này
        await Staff.updateMany(
            { hotelId: hotelId },
            { $set: { status: 'suspended' } }
        );
        
        console.log(`Cascade suspended all users and staff for hotel ${hotelId}`);
    } catch (error) {
        console.error('Error in cascadeSuspendHotel:', error);
    }
}

// Helper: Cascade activate hotel - kích hoạt lại staff khi hotel được kích hoạt
async function cascadeActivateHotel(hotelId) {
    try {
        // Chỉ kích hoạt lại users đang bị suspended (không kích hoạt những người đã bị xóa)
        await User.updateMany(
            { hotelId: hotelId, status: 'suspended' },
            { $set: { status: 'active' } }
        );
        
        await Staff.updateMany(
            { hotelId: hotelId, status: 'suspended' },
            { $set: { status: 'active' } }
        );
        
        console.log(`Cascade activated all users and staff for hotel ${hotelId}`);
    } catch (error) {
        console.error('Error in cascadeActivateHotel:', error);
    }
}

// Xóa khách sạn
async function deleteHotel(req, res) {
    try {
        const currentUser = req.user;
        const { id } = req.params;
        
        // Business KHÔNG thể xóa khách sạn, chỉ admin
        if (currentUser.role === 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền xóa khách sạn. Vui lòng liên hệ Admin.' });
        }
        
        const hotel = await Hotel.findById(id);
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }
        
        // Xóa tham chiếu đến khách sạn trong business
        await Business.findByIdAndUpdate(
            hotel.businessId,
            { $pull: { hotels: id } }
        );
        
        // Xóa tham chiếu đến khách sạn trong user (manager và staff)
        if (hotel.managerId) {
            await User.findByIdAndUpdate(
                hotel.managerId,
                { $unset: { hotelId: "" } }
            );
        }
        
        // Cập nhật tất cả staff của khách sạn
        await User.updateMany(
            { hotelId: id },
            { $unset: { hotelId: "" } }
        );
        
        // Xóa tất cả Staff records
        await Staff.deleteMany({ hotelId: id });
        
        // Xóa khách sạn
        await Hotel.findByIdAndDelete(id);
        
        res.status(200).json({ message: 'Khách sạn đã được xóa thành công' });
    } catch (error) {
        console.error('Error deleting hotel:', error);
        res.status(500).json({ message: 'Lỗi khi xóa khách sạn', error: error.message });
    }
}

// Tải lên hình ảnh khách sạn
async function uploadHotelImages(req, res) {
    try {
        const { id } = req.params;
        const imageUrls = req.body.images;
        
        if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
            return res.status(400).json({ message: 'Vui lòng cung cấp ít nhất một URL hình ảnh' });
        }
        
        const hotel = await Hotel.findByIdAndUpdate(
            id,
            { $push: { images: { $each: imageUrls } } },
            { new: true }
        );
        
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }
        
        res.status(200).json({
            message: 'Tải lên hình ảnh thành công',
            images: hotel.images
        });
    } catch (error) {
        console.error('Error uploading hotel images:', error);
        res.status(500).json({ message: 'Lỗi khi tải lên hình ảnh', error: error.message });
    }
}

// Xóa hình ảnh khách sạn
async function deleteHotelImage(req, res) {
    try {
        const { id, imageIndex } = req.params;
        
        const hotel = await Hotel.findById(id);
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }
        
        const index = parseInt(imageIndex);
        if (isNaN(index) || index < 0 || index >= hotel.images.length) {
            return res.status(400).json({ message: 'Chỉ số hình ảnh không hợp lệ' });
        }
        
        hotel.images.splice(index, 1);
        await hotel.save();
        
        res.status(200).json({
            message: 'Đã xóa hình ảnh thành công',
            images: hotel.images
        });
    } catch (error) {
        console.error('Error deleting hotel image:', error);
        res.status(500).json({ message: 'Lỗi khi xóa hình ảnh', error: error.message });
    }
}

// Cập nhật cài đặt khách sạn
async function updateHotelSettings(req, res) {
    try {
        const { id } = req.params;
        const { settings } = req.body;
        const currentUser = req.user;
        
        // Business KHÔNG thể cập nhật hotel settings, chỉ admin và hotel manager
        if (currentUser.role === 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật cài đặt khách sạn. Vui lòng liên hệ Admin hoặc Hotel Manager.' });
        }
        
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ message: 'Cài đặt không hợp lệ' });
        }
        
        const hotel = await Hotel.findById(id);
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }
        
        // Hotel manager chỉ có thể cập nhật settings cho hotel của mình
        if (currentUser.role === 'hotel' && hotel._id.toString() !== currentUser.hotelId?.toString()) {
            return res.status(403).json({ message: 'Bạn chỉ có thể cập nhật cài đặt cho khách sạn của mình' });
        }
        
        // Cập nhật settings
        hotel.settings = {
            ...hotel.settings,
            ...settings
        };
        
        await hotel.save();
        
        res.status(200).json({
            message: 'Cài đặt khách sạn đã được cập nhật',
            settings: hotel.settings
        });
    } catch (error) {
        console.error('Error updating hotel settings:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật cài đặt khách sạn', error: error.message });
    }
}

// Cập nhật thông tin ngân hàng cho hotel
async function updateHotelBankAccount(req, res) {
    try {
        const currentUser = req.user;
        const { id } = req.params;
        const { bankAccount } = req.body;
        
        // Kiểm tra khách sạn tồn tại
        const hotel = await Hotel.findById(id);
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }
        
        // Kiểm tra quyền chỉnh sửa
        if (currentUser.role === 'business' && hotel.businessId?.toString() !== currentUser.businessId) {
            return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa khách sạn này' });
        }
        
        if (currentUser.role === 'hotel' && hotel._id.toString() !== currentUser.hotelId) {
            return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa khách sạn này' });
        }
        
        if (!bankAccount || typeof bankAccount !== 'object') {
            return res.status(400).json({ message: 'Thông tin ngân hàng không hợp lệ' });
        }
        
        // Merge với bankAccount hiện tại (nếu có)
        const currentBankAccount = hotel.bankAccount || {};
        const updatedBankAccount = {
            ...currentBankAccount,
            ...bankAccount
        };
        
        // Cập nhật bankAccount cho hotel
        const updatedHotel = await Hotel.findByIdAndUpdate(
            id,
            { $set: { bankAccount: updatedBankAccount } },
            { new: true, runValidators: true }
        );
        
        res.status(200).json({
            message: 'Thông tin ngân hàng đã được cập nhật',
            bankAccount: updatedHotel.bankAccount
        });
    } catch (error) {
        console.error('Error updating hotel bank account:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật thông tin ngân hàng', error: error.message });
    }
}

module.exports = {
    createHotel,
    getHotels,
    getHotelsByBusiness,
    getHotelById,
    updateHotel,
    updateHotelStatus,
    deleteHotel,
    uploadHotelImages,
    deleteHotelImage,
    updateHotelSettings,
    updateHotelBankAccount,
    createService,
    editService,
    deleteService  
}