const { Invoice } = require('../models/invoice');
const { Hotel } = require('../models/hotel');
const { Business } = require('../models/business');
const mongoose = require('mongoose');

/**
 * Tạo hóa đơn mới
 * POST /invoices
 */
exports.createInvoice = async (req, res) => {
    try {
        const invoiceData = req.body;
        const userId = req.user?.userId;

        // Validation
        if (!invoiceData.hotelId || !invoiceData.roomNumber || !invoiceData.customerName) {
            return res.status(400).json({ 
                message: 'hotelId, roomNumber, và customerName là bắt buộc' 
            });
        }

        // Lấy thông tin hotel để lấy businessId
        const hotel = await Hotel.findById(invoiceData.hotelId);
        if (!hotel) {
            return res.status(404).json({ 
                message: 'Không tìm thấy khách sạn' 
            });
        }

        // Lấy thông tin business từ hotel
        let business = null;
        if (hotel.businessId) {
            business = await Business.findById(hotel.businessId);
        }

        // Chuẩn bị dữ liệu business info để lưu vào invoice
        let businessInfo = {};
        if (business) {
            businessInfo = {
                name: business.name || '',
                legalName: business.legalName || '',
                taxId: business.taxId || '',
                address: business.address || {},
                contactInfo: business.contactInfo || {},
                logo: business.logo || ''
            };
        } else {
            // Nếu không có business, lấy từ invoiceData
            businessInfo = {
                name: invoiceData.businessName || 'Khách sạn',
                legalName: invoiceData.businessName || '',
                taxId: '',
                address: {
                    street: invoiceData.business_address || ''
                },
                contactInfo: {
                    phone: invoiceData.phoneNumber || '',
                    email: ''
                }
            };
        }

        const rawRateType = invoiceData.rateType || invoiceData.rate_type || invoiceData.bookingType;
        let rateType = rawRateType;
        if (typeof rateType === 'string') {
            const normalized = rateType.toLowerCase();
            const rateTypeMap = {
                'theo giờ': 'hourly',
                'theo gio': 'hourly',
                'gio': 'hourly',
                'giờ': 'hourly',
                'theo ngày': 'daily',
                'ngày đêm': 'daily',
                'ngay dem': 'daily',
                'qua đêm': 'nightly',
                'qua dem': 'nightly',
                'theo tuần': 'weekly',
                'theo tuan': 'weekly',
                'theo tháng': 'monthly',
                'theo thang': 'monthly'
            };
            rateType = rateTypeMap[normalized] || normalized;
        }
        if (!rateType || !['hourly', 'daily', 'nightly', 'weekly', 'monthly'].includes(rateType)) {
            rateType = 'hourly';
        }

        const invoice = new Invoice({
            invoiceNumber: invoiceData.invoiceNumber || undefined, // Sẽ tự động tạo nếu không có
            hotelId: new mongoose.Types.ObjectId(invoiceData.hotelId),
            businessId: hotel.businessId ? new mongoose.Types.ObjectId(hotel.businessId) : undefined,
            roomId: invoiceData.roomId ? new mongoose.Types.ObjectId(invoiceData.roomId) : undefined,
            roomNumber: invoiceData.roomNumber,
            roomType: invoiceData.roomType || '',
            bookingId: invoiceData.bookingId ? new mongoose.Types.ObjectId(invoiceData.bookingId) : undefined,
            customerName: invoiceData.customerName,
            customerPhone: invoiceData.customerPhone || '',
            customerEmail: invoiceData.customerEmail || '',
            customerId: invoiceData.customerId ? new mongoose.Types.ObjectId(invoiceData.customerId) : undefined,
            guestDetails: invoiceData.guestDetails || invoiceData.guestInfo || {},
            staffId: invoiceData.staffId ? new mongoose.Types.ObjectId(invoiceData.staffId) : undefined,
            staffName: invoiceData.staffName || '',
            checkInTime: new Date(invoiceData.checkInTime || invoiceData.checkInDate),
            checkOutTime: new Date(invoiceData.checkOutTime || invoiceData.checkOutDate || new Date()),
            duration: invoiceData.duration || { hours: 0, days: 0 },
            rateType: rateType,
            products: invoiceData.products || [],
            roomAmount: invoiceData.roomAmount || invoiceData.amount || 0,
            serviceAmount: invoiceData.serviceAmount || 0,
            additionalCharges: invoiceData.additionalCharges || 0,
            discount: invoiceData.discount || 0,
            advancePayment: invoiceData.advancePayment || 0,
            totalAmount: invoiceData.totalAmount || invoiceData.amount || 0,
            paymentMethod: invoiceData.paymentMethod || 'cash',
            paymentStatus: invoiceData.paymentStatus || 'paid',
            notes: invoiceData.notes || '',
            businessInfo: businessInfo,
            status: invoiceData.status || 'issued',
            issuedDate: invoiceData.date ? new Date(invoiceData.date) : new Date(),
            paidDate: invoiceData.paymentStatus === 'paid' ? new Date() : undefined,
            metadata: invoiceData.metadata || {}
        });

        await invoice.save();

        // Populate các thông tin liên quan
        await invoice.populate('hotelId', 'name address');
        await invoice.populate('roomId', 'roomNumber type');
        if (invoice.businessId) {
            await invoice.populate('businessId', 'name taxId');
        }

        res.status(201).json({
            message: 'Tạo hóa đơn thành công',
            data: invoice
        });

    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tạo hóa đơn', 
            error: error.message 
        });
    }
};

/**
 * Lấy danh sách hóa đơn
 * GET /invoices
 */
exports.getInvoices = async (req, res) => {
    try {
        const { 
            hotelId, 
            roomId, 
            customerId, 
            startDate, 
            endDate, 
            status,
            paymentStatus,
            page = 1, 
            limit = 20 
        } = req.query;

        const query = {};

        if (hotelId) {
            query.hotelId = new mongoose.Types.ObjectId(hotelId);
        }
        if (roomId) {
            query.roomId = new mongoose.Types.ObjectId(roomId);
        }
        if (customerId) {
            query.customerId = new mongoose.Types.ObjectId(customerId);
        }
        if (status) {
            query.status = status;
        }
        if (paymentStatus) {
            query.paymentStatus = paymentStatus;
        }
        if (startDate || endDate) {
            query.issuedDate = {};
            if (startDate) query.issuedDate.$gte = new Date(startDate);
            if (endDate) query.issuedDate.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [invoices, totalCount] = await Promise.all([
            Invoice.find(query)
                .populate('hotelId', 'name address')
                .populate('roomId', 'roomNumber type')
                .populate('businessId', 'name taxId')
                .populate('staffId', 'personalInfo')
                .sort({ issuedDate: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Invoice.countDocuments(query)
        ]);

        res.status(200).json({
            message: 'Lấy danh sách hóa đơn thành công',
            data: invoices,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalItems: totalCount,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error getting invoices:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy danh sách hóa đơn', 
            error: error.message 
        });
    }
};

/**
 * Lấy chi tiết một hóa đơn
 * GET /invoices/:id
 */
exports.getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;

        const invoice = await Invoice.findById(id)
            .populate('hotelId', 'name address')
            .populate('roomId', 'roomNumber type')
            .populate('businessId', 'name taxId address contactInfo')
            .populate('staffId', 'personalInfo')
            .populate('bookingId');

        if (!invoice) {
            return res.status(404).json({ 
                message: 'Không tìm thấy hóa đơn' 
            });
        }

        res.status(200).json({
            message: 'Lấy chi tiết hóa đơn thành công',
            data: invoice
        });

    } catch (error) {
        console.error('Error getting invoice:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy chi tiết hóa đơn', 
            error: error.message 
        });
    }
};

/**
 * Cập nhật hóa đơn
 * PUT /invoices/:id
 */
exports.updateInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({ 
                message: 'Không tìm thấy hóa đơn' 
            });
        }

        // Cập nhật các trường được phép
        Object.keys(updateData).forEach(key => {
            if (key !== '_id' && key !== 'invoiceNumber' && key !== 'createdAt') {
                invoice[key] = updateData[key];
            }
        });

        invoice.updatedAt = new Date();
        await invoice.save();

        await invoice.populate('hotelId', 'name address');
        await invoice.populate('roomId', 'roomNumber type');

        res.status(200).json({
            message: 'Cập nhật hóa đơn thành công',
            data: invoice
        });

    } catch (error) {
        console.error('Error updating invoice:', error);
        res.status(500).json({ 
            message: 'Lỗi khi cập nhật hóa đơn', 
            error: error.message 
        });
    }
};

/**
 * Xóa hóa đơn (soft delete - chỉ đổi status)
 * DELETE /invoices/:id
 */
exports.deleteInvoice = async (req, res) => {
    try {
        const { id } = req.params;

        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({ 
                message: 'Không tìm thấy hóa đơn' 
            });
        }

        // Soft delete - chỉ đổi status
        invoice.status = 'cancelled';
        invoice.updatedAt = new Date();
        await invoice.save();

        res.status(200).json({
            message: 'Xóa hóa đơn thành công'
        });

    } catch (error) {
        console.error('Error deleting invoice:', error);
        res.status(500).json({ 
            message: 'Lỗi khi xóa hóa đơn', 
            error: error.message 
        });
    }
};

/**
 * Lấy thống kê hóa đơn
 * GET /invoices/stats
 */
exports.getInvoiceStats = async (req, res) => {
    try {
        const { hotelId, startDate, endDate } = req.query;

        const matchQuery = {};
        if (hotelId) {
            matchQuery.hotelId = new mongoose.Types.ObjectId(hotelId);
        }
        if (startDate || endDate) {
            matchQuery.issuedDate = {};
            if (startDate) matchQuery.issuedDate.$gte = new Date(startDate);
            if (endDate) matchQuery.issuedDate.$lte = new Date(endDate);
        }

        const stats = await Invoice.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalInvoices: { $sum: 1 },
                    totalAmount: { $sum: '$totalAmount' },
                    totalPaid: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0]
                        }
                    },
                    totalPending: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$totalAmount', 0]
                        }
                    },
                    averageAmount: { $avg: '$totalAmount' }
                }
            }
        ]);

        res.status(200).json({
            message: 'Lấy thống kê hóa đơn thành công',
            data: stats[0] || {
                totalInvoices: 0,
                totalAmount: 0,
                totalPaid: 0,
                totalPending: 0,
                averageAmount: 0
            }
        });

    } catch (error) {
        console.error('Error getting invoice stats:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy thống kê hóa đơn', 
            error: error.message 
        });
    }
};

/**
 * Gửi hóa đơn qua email
 * POST /invoices/:id/email
 */
exports.sendInvoiceEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                message: 'Email là bắt buộc' 
            });
        }

        // Tìm hóa đơn theo nhiều cách:
        // 1. Tìm theo _id (nếu id là ObjectId hợp lệ)
        // 2. Tìm theo invoiceNumber
        // 3. Tìm theo bookingId
        let invoice = null;
        
        // Thử tìm theo _id trước
        if (mongoose.Types.ObjectId.isValid(id)) {
            invoice = await Invoice.findById(id)
                .populate('hotelId', 'name address')
                .populate('roomId', 'roomNumber type')
                .populate('businessId', 'name taxId address contactInfo');
        }
        
        // Nếu không tìm thấy, thử tìm theo invoiceNumber
        if (!invoice) {
            invoice = await Invoice.findOne({ invoiceNumber: id })
                .populate('hotelId', 'name address')
                .populate('roomId', 'roomNumber type')
                .populate('businessId', 'name taxId address contactInfo');
        }
        
        // Nếu vẫn không tìm thấy, thử tìm theo bookingId
        if (!invoice && mongoose.Types.ObjectId.isValid(id)) {
            invoice = await Invoice.findOne({ bookingId: new mongoose.Types.ObjectId(id) })
                .populate('hotelId', 'name address')
                .populate('roomId', 'roomNumber type')
                .populate('businessId', 'name taxId address contactInfo');
        }

        if (!invoice) {
            console.log(`Không tìm thấy hóa đơn với ID: ${id}`);
            return res.status(404).json({ 
                message: 'Không tìm thấy hóa đơn. Có thể hóa đơn chưa được lưu vào database.' 
            });
        }

        // TODO: Implement email sending với PDF attachment
        // Hiện tại chỉ trả về thông báo thành công
        // Có thể sử dụng nodemailer hoặc email service để gửi email với PDF đính kèm
        
        console.log(`Gửi hóa đơn ${invoice.invoiceNumber} đến ${email}`);

        res.status(200).json({
            message: `Hóa đơn đã được gửi đến ${email}`,
            data: {
                invoiceId: invoice._id,
                invoiceNumber: invoice.invoiceNumber,
                email: email
            }
        });

    } catch (error) {
        console.error('Error sending invoice email:', error);
        res.status(500).json({ 
            message: 'Lỗi khi gửi email hóa đơn', 
            error: error.message 
        });
    }
};

/**
 * Xem hóa đơn nháp (EasyInvoice)
 * POST /invoices/easy-invoice/preview
 */
exports.previewEasyInvoice = async (req, res) => {
    try {
        const invoiceData = req.body;

        // Validation
        if (!invoiceData.company || !invoiceData.customer || !invoiceData.items) {
            return res.status(400).json({ 
                message: 'Thông tin công ty, khách hàng và danh sách sản phẩm là bắt buộc' 
            });
        }

        // TODO: Tích hợp với EasyInvoice API
        // Hiện tại trả về mock data để test
        // Bạn cần thay thế bằng API call thực tế đến EasyInvoice service
        
        // Mock response - thay thế bằng API call thực tế
        const previewUrl = `https://easyinvoice.example.com/preview/${Date.now()}`;
        
        // Log dữ liệu để debug
        console.log('Preview EasyInvoice data:', JSON.stringify(invoiceData, null, 2));

        res.status(200).json({
            message: 'Xem hóa đơn nháp thành công',
            data: {
                previewUrl: previewUrl,
                invoiceData: invoiceData
            }
        });

    } catch (error) {
        console.error('Error previewing EasyInvoice:', error);
        res.status(500).json({ 
            message: 'Lỗi khi xem hóa đơn nháp', 
            error: error.message 
        });
    }
};

/**
 * Xuất hóa đơn điện tử (Sepay eInvoice)
 * POST /invoices/easy-invoice/export
 */
exports.exportEasyInvoice = async (req, res) => {
    try {
        const invoiceData = req.body;
        const sepayEinvoiceService = require('../services/sepayEinvoiceService');

        // Validation
        if (!invoiceData.company || !invoiceData.customer || !invoiceData.items) {
            return res.status(400).json({ 
                success: false,
                error: {
                    code: 'INVALID_INVOICE_DATA',
                    message: 'Thông tin công ty, khách hàng và danh sách sản phẩm là bắt buộc' 
                }
            });
        }

        // Map dữ liệu từ format frontend sang format Sepay eInvoice API
        // Cần kiểm tra tài liệu Sepay để đảm bảo format đúng
        const sepayInvoiceData = {
            provider_account_id: invoiceData.providerAccountId || invoiceData.provider_account_id,
            is_draft: invoiceData.isDraft !== false, // Mặc định là draft
            invoice: {
                // Thông tin công ty (seller)
                seller: {
                    name: invoiceData.company.name || invoiceData.company.legalName,
                    tax_code: invoiceData.company.taxId || invoiceData.company.taxCode,
                    address: invoiceData.company.address?.full || invoiceData.company.address,
                    email: invoiceData.company.contactInfo?.email || invoiceData.company.email,
                    phone: invoiceData.company.contactInfo?.phone || invoiceData.company.phone
                },
                // Thông tin khách hàng (buyer)
                buyer: {
                    name: invoiceData.customer.name,
                    tax_code: invoiceData.customer.taxCode || invoiceData.customer.tax_code,
                    address: invoiceData.customer.address,
                    email: invoiceData.customer.email,
                    phone: invoiceData.customer.phone
                },
                // Danh sách sản phẩm/dịch vụ
                items: invoiceData.items.map(item => ({
                    name: item.name,
                    quantity: item.quantity || 1,
                    unit_price: item.price || item.unitPrice,
                    total_price: (item.price || item.unitPrice) * (item.quantity || 1),
                    unit: item.unit || 'cái',
                    note: item.description || item.note
                })),
                // Tổng tiền và các khoản giảm trừ
                total_amount: invoiceData.totalAmount || invoiceData.total_amount,
                discount_amount: invoiceData.discount || invoiceData.discountAmount || 0,
                tax_amount: invoiceData.tax || invoiceData.taxAmount || 0,
                // Ghi chú
                note: invoiceData.notes || invoiceData.note
            }
        };

        // Gọi Sepay eInvoice API để tạo hóa đơn
        const result = await sepayEinvoiceService.createInvoice(sepayInvoiceData);

        // Lưu thông tin vào database nếu có invoiceId trong hệ thống
        if (invoiceData.invoiceId) {
            try {
                const invoice = await Invoice.findById(invoiceData.invoiceId);
                if (invoice) {
                    invoice.einvoiceTrackingCode = result.data?.tracking_code || result.tracking_code;
                    invoice.einvoiceStatus = 'creating';
                    invoice.einvoiceData = result.data || result;
                    await invoice.save();
                }
            } catch (dbError) {
                console.error('Error saving einvoice tracking code to invoice:', dbError);
                // Không throw error, chỉ log vì Sepay đã tạo thành công
            }
        }

        res.status(200).json({
            success: true,
            message: 'Tạo hóa đơn điện tử thành công',
            data: {
                trackingCode: result.data?.tracking_code || result.tracking_code,
                referenceCode: result.data?.reference_code || result.reference_code,
                status: result.data?.status || 'creating',
                ...result.data
            }
        });

    } catch (error) {
        console.error('Error exporting eInvoice:', error);
        res.status(500).json({ 
            success: false,
            error: {
                code: 'EXPORT_EINVOICE_ERROR',
                message: error.message || 'Lỗi khi xuất hóa đơn điện tử'
            }
        });
    }
};

