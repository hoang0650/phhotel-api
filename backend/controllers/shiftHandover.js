const ShiftHandover = require('../models/ShiftHandover');
const { Debt } = require('../models/debt');
const { Invoice } = require('../models/invoice');
const { Staff } = require('../models/staff');
const { User } = require('../models/users');
const { Transaction } = require('../models/transactions');
const { Booking } = require('../models/booking');
const { Room } = require('../models/rooms');
const { Hotel } = require('../models/hotel');
const RoomEvent = require('../models/roomEvent');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const mapPaymentMethod = (method) => {
    const m = (method || 'cash').toLowerCase();
    if (m === 'transfer' || m === 'banking' || m === 'bank' || m === 'bank_transfer' || m === 'qr' || m === 'vnpay') {
        return 'bank_transfer';
    }
    if (m === 'card' || m === 'credit_card' || m === 'virtual_card' || m === 'visa') {
        return 'card';
    }
    return 'cash';
};

const normalizeGuestSource = (source, booking) => {
    let normalized = '';
    if (source) {
        normalized = String(source).toLowerCase().trim();
    }
    if (!normalized && booking && typeof booking === 'object') {
        if (booking.source) {
            const bookingSource = String(booking.source).toLowerCase().trim();
            if (bookingSource === 'ota' && booking.otaSource) {
                normalized = String(booking.otaSource).toLowerCase().trim();
            } else {
                normalized = bookingSource;
            }
        } else if (booking.otaSource) {
            normalized = String(booking.otaSource).toLowerCase().trim();
        }
    }
    if (!normalized) {
        return 'walkin';
    }
    if (
        normalized === 'walkin' ||
        normalized === 'walk-in' ||
        normalized === 'walk_in' ||
        normalized === 'direct' ||
        normalized === 'phone' ||
        normalized === 'regular' ||
        normalized === 'guest' ||
        normalized === 'khach le' ||
        normalized === 'khách lẻ'
    ) {
        return 'walkin';
    }
    if (normalized.includes('booking')) {
        return 'booking';
    }
    if (normalized.includes('agoda')) {
        return 'agoda';
    }
    if (normalized.includes('traveloka')) {
        return 'traveloka';
    }
    if (normalized.includes('expedia')) {
        return 'expedia';
    }
    if (normalized.includes('trip')) {
        return 'trip';
    }
    if (normalized.includes('g2j')) {
        return 'g2j';
    }
    return 'other';
};

const optimizeRoomHistory = (roomHistory, maxItems = 1000) => {
    if (!roomHistory || !Array.isArray(roomHistory)) return [];
    
    // Giới hạn số lượng items
    const limited = roomHistory.slice(0, maxItems);
    
    return limited.map(item => {
        let guestName = item.guestName || '';
        if (!guestName && item.guestInfo?.name) {
            guestName = item.guestInfo.name;
        }
        if (!guestName && item.customerName) {
            guestName = item.customerName;
        }
        if (!guestName && item.bookingId && typeof item.bookingId === 'object') {
            const booking = item.bookingId;
            guestName = booking.guestInfo?.name || booking.customerName || booking.guestName || '';
        }
        let guestSource = 'walkin';
        if (!item.guestSource && !item.guestInfo?.guestSource && !item.event?.guestInfo?.guestSource) {
            console.log('Warning: No guestSource found in item:', {
                roomNumber: item.roomNumber,
                guestName: item.guestName,
                hasGuestSource: !!item.guestSource,
                hasGuestInfo: !!item.guestInfo,
                hasEvent: !!item.event,
                hasBookingId: !!item.bookingId
            });
        }
        if (item.guestSource) {
            guestSource = item.guestSource;
        }
        else if (item.guestInfo?.guestSource) {
            guestSource = item.guestInfo.guestSource;
        }
        else if (item.event?.guestInfo?.guestSource) {
            guestSource = item.event.guestInfo.guestSource;
        }
        else if (item.bookingId && typeof item.bookingId === 'object') {
            const booking = item.bookingId;
            guestSource = booking.guestSource || 
                         booking.guestInfo?.guestSource || 
                         booking.guestDetails?.guestSource || 
                         booking.source || 
                         booking.otaSource || 
                         'walkin';
        }
        guestSource = normalizeGuestSource(
            guestSource,
            item.bookingId && typeof item.bookingId === 'object' ? item.bookingId : null
        );
        if (guestSource !== 'walkin' || item.roomNumber) {
            console.log(`Final guestSource for room ${item.roomNumber}:`, guestSource);
        }
        
        return {
            roomId: item.roomId,
            roomNumber: item.roomNumber || null,
            bookingId: item.bookingId || null,
            action: item.action || 'check_out',
            guestName: guestName.substring(0, 100), // Giới hạn độ dài
            guestSource: guestSource, // Thêm nguồn khách
            amount: item.amount || 0,
            paymentMethod: mapPaymentMethod(item.paymentMethod),
            advancePaymentMethod: mapPaymentMethod(item.advancePaymentMethod || item.paymentMethod),
            timestamp: item.timestamp || item.date || new Date(),
            notes: (item.notes || '').substring(0, 200), // Giới hạn độ dài
            // Các trường bổ sung
            roomTotal: item.roomTotal || item.roomAmount || 0,
            additionalCharges: item.additionalCharges || 0,
            discount: item.discount || 0,
            serviceAmount: item.serviceAmount || item.serviceTotal || 0,
            advancePayment: item.advancePayment || 0,
            checkinTime: item.checkinTime || item.checkInTime || null
        };
    });
};

// Helper function để tối ưu hóa invoices
const optimizeInvoices = (invoices, maxItems = 1000) => {
    if (!invoices || !Array.isArray(invoices)) return [];
    
    const limited = invoices.slice(0, maxItems);
    
    return limited.map(item => ({
        invoiceId: item.invoiceId || null,
        invoiceNumber: (item.invoiceNumber || '').substring(0, 50),
        bookingId: item.bookingId || null,
        roomId: item.roomId || null,
        roomNumber: (item.roomNumber || '').substring(0, 20),
        guestName: (item.guestName || 'Khách lẻ').substring(0, 100),
        amount: item.amount || 0,
        paymentMethod: mapPaymentMethod(item.paymentMethod),
        type: item.type || 'room',
        timestamp: item.timestamp || new Date()
    }));
};

// Helper function để tối ưu hóa expenses
const optimizeExpenses = (expenses, maxItems = 500) => {
    if (!expenses || !Array.isArray(expenses)) return [];
    
    const limited = expenses.slice(0, maxItems);
    
    return limited.map(item => ({
        expenseId: item.expenseId || item._id || null,
        description: (item.description || 'Phiếu chi').substring(0, 200),
        amount: item.amount || 0,
        category: (item.category || item.expenseCategory || 'other').substring(0, 50),
        recipient: (item.recipient || '').substring(0, 100),
        method: mapPaymentMethod(item.method || 'cash'),
        approvedBy: item.approvedBy || null,
        timestamp: item.timestamp || item.createdAt || new Date()
    }));
};

// Helper function để tối ưu hóa incomes
const optimizeIncomes = (incomes, maxItems = 500) => {
    if (!incomes || !Array.isArray(incomes)) return [];
    
    const limited = incomes.slice(0, maxItems);
    
    return limited.map(item => ({
        incomeId: item.incomeId || item._id || null,
        description: (item.description || 'Phiếu thu').substring(0, 200),
        amount: item.amount || 0,
        category: (item.category || 'other').substring(0, 50),
        source: (item.source || '').substring(0, 100),
        method: mapPaymentMethod(item.method || 'cash'), // Thêm method để biết phương thức thanh toán
        approvedBy: item.approvedBy || null,
        timestamp: item.timestamp || item.createdAt || new Date()
    }));
};

// Helper function để tối ưu hóa serviceOrders
const optimizeServiceOrders = (serviceOrders, maxItems = 500) => {
    if (!serviceOrders || !Array.isArray(serviceOrders)) return [];
    
    const limited = serviceOrders.slice(0, maxItems);
    
    return limited.map(item => ({
        serviceOrderId: item.serviceOrderId || item._id || null,
        roomId: item.roomId || null,
        roomNumber: (item.roomNumber || '').substring(0, 20),
        serviceName: (item.serviceName || '').substring(0, 100),
        quantity: item.quantity || 1,
        amount: item.amount || 0,
        paymentMethod: mapPaymentMethod(item.paymentMethod),
        timestamp: item.timestamp || new Date()
    }));
};

// Helper function để validate và giới hạn kích thước notes
const optimizeNotes = (notes) => {
    if (!notes || typeof notes !== 'string') return '';
    return notes.substring(0, 1000); // Giới hạn 1000 ký tự
};

// ============ GIAO CA ============

/**
 * Tạo giao ca mới
 * Khi nhân viên bấm giao ca:
 * 1. Chọn nhân viên nhận ca
 * 2. Nhập mật khẩu xác nhận
 * 3. Lưu lịch sử giao ca
 * 4. Login vào tài khoản được giao ca
 */
exports.createShiftHandover = async (req, res) => {
    try {
        const {
            hotelId,
            fromStaffId,
            toStaffId,
            toUserPassword, // Mật khẩu của người nhận ca để xác nhận
            previousShiftAmount,
            cashInShift,
            managerHandoverAmount,
            cashAmount,
            bankTransferAmount,
            cardPaymentAmount,
            expenseAmount,
            incomeAmount,
            roomHistory,
            invoices,
            expenses,
            incomes,
            serviceOrders,
            notes,
            pendingIssues
        } = req.body;

        // Kiểm tra nhân viên giao ca
        const fromStaff = await Staff.findById(fromStaffId).populate('userId');
        if (!fromStaff) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên giao ca' });
        }

        // Kiểm tra nhân viên nhận ca
        const toStaff = await Staff.findById(toStaffId).populate('userId');
        if (!toStaff) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên nhận ca' });
        }

        // Xác thực mật khẩu của nhân viên nhận ca
        const toUser = await User.findById(toStaff.userId);
        if (!toUser) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản nhận ca' });
        }

        const isPasswordValid = await bcrypt.compare(toUserPassword, toUser.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Mật khẩu xác nhận không đúng' });
        }

        // Tính toán số tiền
        // Công thức: Số tiền giao ca = Số tiền ca trước + Tiền mặt trong ca - Tiền giao quản lý
        const handoverAmount = (previousShiftAmount || 0) + (cashInShift || 0) - (managerHandoverAmount || 0);
        
        // Số tiền thực nhận trong ca
        const actualReceivedAmount = handoverAmount;

        // Tính expenseAmount từ expenses array nếu có, nếu không thì dùng từ request body
        let calculatedExpenseAmount = expenseAmount || 0;
        if (expenses && Array.isArray(expenses) && expenses.length > 0) {
            // Tính tổng từ expenses array
            calculatedExpenseAmount = expenses.reduce((sum, exp) => {
                return sum + (exp.amount || 0);
            }, 0);
        }

        // Tổng doanh thu = Tiền giao quản lý + Phiếu chi
        const totalRevenue = (managerHandoverAmount || 0) + calculatedExpenseAmount;

        // Tổng tiền phòng
        const totalRoomRevenue = roomHistory?.reduce((sum, room) => sum + (room.amount || 0), 0) || 0;

        let calculatedCashAmount = cashAmount || 0;
        let calculatedBankTransferAmount = bankTransferAmount || 0;
        let calculatedCardPaymentAmount = cardPaymentAmount || 0;

        if (Array.isArray(roomHistory) && roomHistory.length > 0) {
            roomHistory.forEach(item => {
                const advance = item.advancePayment || 0;
                if (!advance) return;
                const mappedAdvanceMethod = mapPaymentMethod(
                    item.advancePaymentMethod || item.paymentMethod || 'cash'
                );
                if (mappedAdvanceMethod === 'cash') {
                    calculatedCashAmount += advance;
                } else if (mappedAdvanceMethod === 'bank_transfer') {
                    calculatedBankTransferAmount += advance;
                } else if (mappedAdvanceMethod === 'card') {
                    calculatedCardPaymentAmount += advance;
                }
            });
        }

        // Tối ưu hóa dữ liệu trước khi lưu để tránh vượt quá giới hạn BSON 16MB
        const optimizedRoomHistory = optimizeRoomHistory(roomHistory, 1000);
        const optimizedInvoices = optimizeInvoices(invoices, 1000);
        const optimizedExpenses = optimizeExpenses(expenses, 500);
        const optimizedIncomes = optimizeIncomes(incomes, 500);
        const optimizedServiceOrders = optimizeServiceOrders(serviceOrders, 500);
        const optimizedNotes = optimizeNotes(notes);

        // Log cảnh báo nếu dữ liệu bị cắt bớt
        if (roomHistory && roomHistory.length > 1000) {
            console.warn(`Warning: roomHistory có ${roomHistory.length} items, đã giới hạn xuống 1000 items`);
        }
        if (invoices && invoices.length > 1000) {
            console.warn(`Warning: invoices có ${invoices.length} items, đã giới hạn xuống 1000 items`);
        }
        if (expenses && expenses.length > 500) {
            console.warn(`Warning: expenses có ${expenses.length} items, đã giới hạn xuống 500 items`);
        }

        // Tạo bản ghi giao ca
        const shiftHandover = new ShiftHandover({
            hotelId,
            fromStaffId,
            fromUserId: fromStaff.userId,
            toStaffId,
            toUserId: toStaff.userId,
            handoverTime: new Date(),
            shiftStartTime: req.body.shiftStartTime,
            shiftEndTime: new Date(),
            previousShiftAmount: previousShiftAmount || 0,
            cashInShift: cashInShift || 0,
            managerHandoverAmount: managerHandoverAmount || 0,
            actualReceivedAmount,
            handoverAmount,
            cashAmount: calculatedCashAmount,
            bankTransferAmount: calculatedBankTransferAmount,
            cardPaymentAmount: calculatedCardPaymentAmount,
            expenseAmount: calculatedExpenseAmount,
            incomeAmount: incomeAmount || 0,
            totalRevenue,
            totalRoomRevenue,
            roomHistory: optimizedRoomHistory,
            invoices: optimizedInvoices,
            expenses: optimizedExpenses,
            incomes: optimizedIncomes,
            serviceOrders: optimizedServiceOrders,
            confirmedByPassword: true,
            confirmed: true,
            confirmedAt: new Date(),
            notes: optimizedNotes,
            pendingIssues: (pendingIssues || []).slice(0, 100).map(issue => ({
                description: (issue.description || '').substring(0, 500),
                priority: issue.priority || 'low',
                createdAt: issue.createdAt || new Date()
            })),
            status: 'confirmed'
        });

        await shiftHandover.save();

        // Tạo transaction ghi nhận giao ca
        const transaction = new Transaction({
            hotelId,
            staffId: fromStaffId,
            shiftHandoverId: shiftHandover._id,
            type: 'shift_handover',
            amount: handoverAmount,
            method: 'cash',
            status: 'completed',
            description: `Giao ca từ ${fromStaff.personalInfo?.firstName || 'N/A'} ${fromStaff.personalInfo?.lastName || ''} sang ${toStaff.personalInfo?.firstName || 'N/A'} ${toStaff.personalInfo?.lastName || ''}`,
            details: {
                fromStaffId,
                toStaffId,
                previousAmount: previousShiftAmount,
                newAmount: handoverAmount
            },
            processedBy: fromStaff.userId,
            processedAt: new Date()
        });

        await transaction.save();

        // Cập nhật shiftHandoverId cho tất cả expenses và incomes đã được giao ca
        if (expenses && Array.isArray(expenses) && expenses.length > 0) {
            const expenseIds = expenses
                .map(exp => exp.expenseId || exp._id)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id));
            
            if (expenseIds.length > 0) {
                await Transaction.updateMany(
                    { 
                        _id: { $in: expenseIds },
                        hotelId: new mongoose.Types.ObjectId(hotelId),
                        type: 'expense'
                    },
                    { 
                        $set: { shiftHandoverId: shiftHandover._id } 
                    }
                );
            }
        }
        
        // Cập nhật shiftHandoverId cho tất cả incomes đã được giao ca
        if (incomes && Array.isArray(incomes) && incomes.length > 0) {
            const incomeIds = incomes
                .map(inc => inc.incomeId || inc._id)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id));
            
            if (incomeIds.length > 0) {
                await Transaction.updateMany(
                    { 
                        _id: { $in: incomeIds },
                        hotelId: new mongoose.Types.ObjectId(hotelId),
                        type: 'income'
                    },
                    { 
                        $set: { shiftHandoverId: shiftHandover._id } 
                    }
                );
            }
        }

        // Xóa lịch sử phòng đã được lưu vào shift handover
        if (roomHistory && roomHistory.length > 0) {
            try {
                // Lấy danh sách roomId từ roomHistory
                const roomIds = [...new Set(roomHistory.map(rh => rh.roomId).filter(id => id))];
                
                // Lấy danh sách bookingId và invoiceNumber để xác định chính xác record cần xóa
                const bookingIds = [...new Set(roomHistory.map(rh => rh.bookingId).filter(id => id))];
                const invoiceNumbers = [...new Set(roomHistory.map(rh => rh.invoiceNumber).filter(num => num))];
                
                // Xóa bookingHistory trong các phòng
                for (const roomId of roomIds) {
                    try {
                        const room = await Room.findById(roomId);
                        if (room && room.bookingHistory && room.bookingHistory.length > 0) {
                            const originalLength = room.bookingHistory.length;
                            
                            // Xóa các record trong bookingHistory có:
                            // 1. Event là 'check-out' 
                            // 2. Và có bookingId hoặc invoiceNumber trùng với roomHistory
                            // 3. Hoặc nếu không có bookingId/invoiceNumber, so sánh bằng timestamp
                            // 4. QUAN TRỌNG: Không xóa các hóa đơn có công nợ chưa thanh toán
                            
                            // Lấy danh sách invoiceIds từ roomHistory để kiểm tra công nợ
                            const invoiceIds = roomHistory
                                .map(rh => rh.invoiceId)
                                .filter(id => id)
                                .map(id => id.toString());
                            
                            // Lấy danh sách invoiceNumbers từ roomHistory để tìm invoiceId
                            const invoiceNumbersFromHistory = roomHistory
                                .map(rh => rh.invoiceNumber)
                                .filter(num => num);
                            
                            // Tìm các invoice có công nợ chưa thanh toán
                            let debtInvoiceIds = [];
                            if (invoiceIds.length > 0 || invoiceNumbersFromHistory.length > 0) {
                                try {
                                    // Tìm các debt chưa thanh toán (status !== 'settled')
                                    const debts = await Debt.find({
                                        status: { $ne: 'settled' },
                                        $or: [
                                            { invoiceId: { $in: invoiceIds.map(id => mongoose.Types.ObjectId(id)) } },
                                            { invoiceNumber: { $in: invoiceNumbersFromHistory } }
                                        ]
                                    }).select('invoiceId');
                                    
                                    debtInvoiceIds = debts.map(d => d.invoiceId?.toString()).filter(id => id);
                                    
                                    // Nếu không tìm thấy bằng invoiceId, thử tìm bằng invoiceNumber
                                    if (debtInvoiceIds.length === 0 && invoiceNumbersFromHistory.length > 0) {
                                        const invoices = await Invoice.find({
                                            invoiceNumber: { $in: invoiceNumbersFromHistory }
                                        }).select('_id');
                                        const foundInvoiceIds = invoices.map(inv => inv._id.toString());
                                        
                                        const debtsByInvoiceNumber = await Debt.find({
                                            status: { $ne: 'settled' },
                                            invoiceId: { $in: foundInvoiceIds.map(id => mongoose.Types.ObjectId(id)) }
                                        }).select('invoiceId');
                                        
                                        debtInvoiceIds = debtsByInvoiceNumber.map(d => d.invoiceId?.toString()).filter(id => id);
                                    }
                                } catch (debtCheckError) {
                                    console.error('Error checking debts:', debtCheckError);
                                    // Nếu có lỗi, không xóa bất kỳ record nào để an toàn
                                }
                            }
                            
                            room.bookingHistory = room.bookingHistory.filter(history => {
                                const historyEvent = (history.event || '').toLowerCase();
                                
                                // Giữ lại tất cả các event không phải check-out
                                if (historyEvent !== 'check-out' && historyEvent !== 'checkout') {
                                    return true;
                                }
                                
                                // Đối với check-out events, kiểm tra xem có trong roomHistory không
                                const historyBookingId = history.bookingId?.toString();
                                const historyInvoiceNumber = history.invoiceNumber;
                                const historyInvoiceId = history.invoiceId?.toString();
                                const historyDate = history.date || history.checkOutTime;
                                
                                // QUAN TRỌNG: Không xóa nếu hóa đơn có công nợ chưa thanh toán
                                if (historyInvoiceId && debtInvoiceIds.includes(historyInvoiceId)) {
                                    console.log(`Giữ lại hóa đơn ${historyInvoiceNumber || historyInvoiceId} vì có công nợ chưa thanh toán`);
                                    return true; // Giữ lại
                                }
                                
                                // Kiểm tra bằng bookingId
                                if (historyBookingId && bookingIds.includes(historyBookingId)) {
                                    // Kiểm tra lại xem có công nợ không (bằng cách tìm invoice từ bookingId)
                                    if (historyInvoiceId && debtInvoiceIds.includes(historyInvoiceId)) {
                                        return true; // Giữ lại
                                    }
                                    return false; // Xóa
                                }
                                
                                // Kiểm tra bằng invoiceNumber
                                if (historyInvoiceNumber && invoiceNumbers.includes(historyInvoiceNumber)) {
                                    // Kiểm tra lại xem có công nợ không
                                    if (historyInvoiceId && debtInvoiceIds.includes(historyInvoiceId)) {
                                        return true; // Giữ lại
                                    }
                                    return false; // Xóa
                                }
                                
                                // Nếu không có bookingId hoặc invoiceNumber, so sánh bằng timestamp
                                if (historyDate && (!historyBookingId || !historyInvoiceNumber)) {
                                    const historyTimestamp = new Date(historyDate).getTime();
                                    const roomHistoryItem = roomHistory.find(rh => {
                                        const rhTimestamp = rh.timestamp ? new Date(rh.timestamp).getTime() : null;
                                        return rhTimestamp && Math.abs(rhTimestamp - historyTimestamp) < 60000; // Chênh lệch < 1 phút
                                    });
                                    if (roomHistoryItem) {
                                        // Kiểm tra lại xem có công nợ không
                                        if (historyInvoiceId && debtInvoiceIds.includes(historyInvoiceId)) {
                                            return true; // Giữ lại
                                        }
                                        return false; // Xóa
                                    }
                                }
                                
                                return true; // Giữ lại
                            });
                            
                            const newLength = room.bookingHistory.length;
                            if (originalLength !== newLength) {
                                room.markModified('bookingHistory');
                                await room.save();
                                console.log(`Đã xóa ${originalLength - newLength} record từ bookingHistory của phòng ${room.roomNumber || roomId}`);
                            }
                        }
                    } catch (roomError) {
                        console.error(`Error deleting history for room ${roomId}:`, roomError);
                        // Tiếp tục với phòng tiếp theo
                    }
                }
            } catch (deleteError) {
                console.error('Error deleting room history:', deleteError);
                // Không throw error, chỉ log vì shift handover đã được lưu thành công
            }
        }

        // Tạo token mới cho nhân viên nhận ca (login)
        const jwt = require('jsonwebtoken');
        const payloadData = {
            userId: toUser._id,
            username: toUser.username,
            email: toUser.email,
            role: toUser.role,
            status: toUser.status
        };
        
        const token = jwt.sign(payloadData, process.env.JWT_SECRET, {
            expiresIn: '30d'
        });

        // Cập nhật lastLogin cho user nhận ca
        toUser.lastLogin = new Date();
        await toUser.save();

        res.status(201).json({
            message: 'Giao ca thành công',
            shiftHandover,
            transaction,
            // Trả về thông tin login cho nhân viên nhận ca
            login: {
                token,
                user: {
                    _id: toUser._id,
                    username: toUser.username,
                    email: toUser.email,
                    fullName: toUser.fullName,
                    role: toUser.role,
                    hotelId: toUser.hotelId
                },
                staff: {
                    _id: toStaff._id,
                    personalInfo: toStaff.personalInfo,
                    employmentInfo: toStaff.employmentInfo
                }
            }
        });

    } catch (error) {
        console.error('Error creating shift handover:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tạo giao ca', 
            error: error.message 
        });
    }
};

// ============ GIAO TIỀN QUẢN LÝ ============

/**
 * Giao tiền cho quản lý
 * - Nhân viên chọn quản lý nhận tiền
 * - Quản lý nhập mật khẩu để xác nhận
 * - Lưu lịch sử giao tiền
 */
exports.createManagerHandover = async (req, res) => {
    try {
        console.log('=== CREATE MANAGER HANDOVER REQUEST ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        const {
            hotelId,
            fromStaffId,
            managerUsername, // Username hoặc email của quản lý
            managerPassword, // Mật khẩu của quản lý để xác nhận
            amount,
            cashBeforeHandover,
            cashAfterHandover,
            notes,
            roomHistory, // Lịch sử phòng để lưu vào shift handover
            previousShiftAmount, // Tiền ca trước
            cashInShift, // Tiền mặt trong ca
            cashAmount, // Tiền mặt sau khi giao
            bankTransferAmount, // Tiền chuyển khoản
            cardPaymentAmount, // Tiền cà thẻ
            expenseAmount, // Tiền chi
            incomeAmount, // Tiền thu
            expenses, // Danh sách phiếu chi từ database
            incomes // Danh sách phiếu thu từ database
        } = req.body;

        // Validate các trường bắt buộc
        if (!fromStaffId || !fromStaffId.toString().trim()) {
            console.error('Validation error: Thiếu fromStaffId');
            return res.status(400).json({ message: 'Thiếu thông tin nhân viên giao tiền' });
        }

        if (!managerUsername || !managerUsername.trim()) {
            console.error('Validation error: Thiếu managerUsername');
            return res.status(400).json({ message: 'Thiếu thông tin tài khoản quản lý' });
        }

        if (!managerPassword || !managerPassword.trim()) {
            console.error('Validation error: Thiếu managerPassword');
            return res.status(400).json({ message: 'Thiếu mật khẩu quản lý' });
        }

        if (!hotelId) {
            console.error('Validation error: Thiếu hotelId');
            return res.status(400).json({ message: 'Thiếu thông tin khách sạn' });
        }

        // Kiểm tra nhân viên giao tiền
        const fromStaffIdTrimmed = fromStaffId.toString().trim();
        console.log('Looking for staff with ID:', fromStaffIdTrimmed);
        
        // Kiểm tra ObjectId hợp lệ
        if (!mongoose.Types.ObjectId.isValid(fromStaffIdTrimmed)) {
            console.error('Invalid ObjectId:', fromStaffIdTrimmed);
            return res.status(400).json({ 
                message: 'ID nhân viên không hợp lệ',
                details: `fromStaffId: ${fromStaffIdTrimmed}`
            });
        }
        
        // Tìm staff theo ID (giống như createShiftHandover)
        const fromStaff = await Staff.findById(fromStaffIdTrimmed).populate('userId');
        console.log('Staff found:', fromStaff ? 'YES' : 'NO');
        
        if (!fromStaff) {
            // Thử tìm tất cả staff trong hotel để debug
            const allStaff = await Staff.find({ 
                hotelId: new mongoose.Types.ObjectId(hotelId) 
            }).limit(5).select('_id personalInfo hotelId');
            console.log('Sample staff in hotel:', allStaff.map(s => ({ 
                id: s._id.toString(), 
                name: s.personalInfo?.firstName,
                hotelId: s.hotelId?.toString()
            })));
            
            console.error('Staff not found with ID:', fromStaffIdTrimmed);
            return res.status(404).json({ 
                message: 'Không tìm thấy nhân viên giao tiền',
                details: `fromStaffId: ${fromStaffIdTrimmed}`,
                hotelId: hotelId
            });
        }
        
        // Kiểm tra xem staff có thuộc hotel này không (optional check)
        if (fromStaff.hotelId && fromStaff.hotelId.toString() !== hotelId) {
            console.warn('Staff belongs to different hotel:', {
                staffId: fromStaff._id,
                staffHotelId: fromStaff.hotelId.toString(),
                requestHotelId: hotelId
            });
            // Không block, chỉ cảnh báo vì có thể staff làm việc cho nhiều hotel
        }
        
        console.log('Staff found:', {
            id: fromStaff._id,
            name: fromStaff.personalInfo?.firstName,
            userId: fromStaff.userId
        });

        // Tìm user quản lý theo username hoặc email
        const managerUsernameTrimmed = managerUsername.trim();
        const managerUser = await User.findOne({
            $or: [
                { username: managerUsernameTrimmed },
                { email: managerUsernameTrimmed }
            ],
            status: { $ne: 'deleted' }
        });

        if (!managerUser) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản quản lý với username/email: ' + managerUsernameTrimmed });
        }

        // Kiểm tra quyền quản lý (phải có role admin, business, hoặc hotel)
        if (!['admin', 'business', 'hotel', 'superadmin'].includes(managerUser.role)) {
            return res.status(403).json({ message: 'Tài khoản này không có quyền quản lý' });
        }

        // Xác thực mật khẩu của quản lý
        const isPasswordValid = await bcrypt.compare(managerPassword.trim(), managerUser.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Mật khẩu quản lý không đúng' });
        }

        // Tìm staff của quản lý (nếu có)
        const toManager = await Staff.findOne({ userId: managerUser._id });

        // Lấy tên đầy đủ
        const fromStaffName = `${fromStaff.personalInfo?.firstName || ''} ${fromStaff.personalInfo?.lastName || ''}`.trim() || 'Nhân viên';
        const toManagerName = toManager 
            ? `${toManager.personalInfo?.firstName || ''} ${toManager.personalInfo?.lastName || ''}`.trim() 
            : (managerUser.fullName || managerUser.username || 'Quản lý');

        // Tạo transaction giao tiền quản lý
        const transaction = new Transaction({
            hotelId,
            staffId: fromStaffId,
            type: 'manager_handover',
            amount,
            method: 'cash',
            status: 'completed',
            description: `Giao tiền quản lý: ${fromStaffName} -> ${toManagerName}`,
            notes,
            details: {
                fromStaffId: fromStaffId,
                toManagerId: toManager?._id || null, // Có thể null nếu quản lý không có staff record
                toManagerUserId: managerUser._id,
                managerUsername: managerUsernameTrimmed,
                cashBeforeHandover: cashBeforeHandover || 0,
                cashAfterHandover: cashAfterHandover || 0
            },
            processedBy: fromStaff.userId,
            processedAt: new Date(),
            approvedBy: managerUser._id,
            approvedAt: new Date()
        });

        await transaction.save();

        // Tính toán các giá trị cần thiết
        const prevAmount = previousShiftAmount || 0;
        const cashShift = cashInShift || 0;
        const cashAfter = cashAfterHandover || 0;
        const bankTransfer = bankTransferAmount || 0;
        const cardPayment = cardPaymentAmount || 0;
        
        // Tính expenseAmount từ expenses array nếu có, nếu không thì dùng từ request body
        let expense = expenseAmount || 0;
        if (expenses && Array.isArray(expenses) && expenses.length > 0) {
            // Tính tổng từ expenses array
            expense = expenses.reduce((sum, exp) => {
                return sum + (exp.amount || 0);
            }, 0);
        }
        
        const income = incomeAmount || 0;
        
        // Tính số tiền giao ca
        const handoverAmount = prevAmount + cashShift - amount;
        
        // Tổng doanh thu = Tiền giao quản lý + Phiếu chi
        const totalRevenue = amount + expense;
        
        // Tổng tiền phòng từ roomHistory
        const totalRoomRevenue = roomHistory?.reduce((sum, room) => sum + (room.amount || 0), 0) || 0;

        // Tạo ShiftHandover record mới để lưu lịch sử giao ca
        // Tìm staff của quản lý (nếu có) để làm toStaffId
        const toManagerStaffId = toManager?._id || null;
        
        // Log roomHistory trước khi optimize để debug
        if (roomHistory && roomHistory.length > 0) {
            console.log('createManagerHandover - RoomHistory received (first item):', {
                roomNumber: roomHistory[0].roomNumber,
                guestName: roomHistory[0].guestName,
                guestSource: roomHistory[0].guestSource,
                hasGuestInfo: !!roomHistory[0].guestInfo,
                guestInfoGuestSource: roomHistory[0].guestInfo?.guestSource,
                hasEvent: !!roomHistory[0].event,
                hasBookingId: !!roomHistory[0].bookingId
            });
        }
        
        // Tối ưu hóa dữ liệu trước khi lưu để tránh vượt quá giới hạn BSON 16MB
        const optimizedRoomHistory = optimizeRoomHistory(roomHistory, 1000);
        
        // Log optimizedRoomHistory sau khi optimize để debug
        if (optimizedRoomHistory && optimizedRoomHistory.length > 0) {
            console.log('createManagerHandover - OptimizedRoomHistory after optimize (first item):', {
                roomNumber: optimizedRoomHistory[0].roomNumber,
                guestName: optimizedRoomHistory[0].guestName,
                guestSource: optimizedRoomHistory[0].guestSource
            });
        }
        const optimizedInvoices = optimizeInvoices(
            (roomHistory || []).map(item => ({
                invoiceNumber: item.invoiceNumber || null,
                bookingId: item.bookingId || null,
                roomId: item.roomId || null,
                roomNumber: item.roomNumber || null,
                guestName: item.guestName || 'Khách lẻ',
                amount: item.amount || 0,
                paymentMethod: item.paymentMethod,
                type: 'room',
                timestamp: item.timestamp || new Date()
            })),
            1000
        );
        const optimizedExpenses = optimizeExpenses(expenses, 500);
        const optimizedNotes = optimizeNotes(notes || `Giao tiền quản lý: ${fromStaffName} -> ${toManagerName}`);

        // Log cảnh báo nếu dữ liệu bị cắt bớt
        if (roomHistory && roomHistory.length > 1000) {
            console.warn(`Warning: roomHistory có ${roomHistory.length} items, đã giới hạn xuống 1000 items`);
        }
        if (expenses && expenses.length > 500) {
            console.warn(`Warning: expenses có ${expenses.length} items, đã giới hạn xuống 500 items`);
        }
        
        // Tạo shift handover record
        const shiftHandover = new ShiftHandover({
            hotelId,
            fromStaffId,
            fromUserId: fromStaff.userId,
            toStaffId: toManagerStaffId, // Có thể null nếu quản lý không có staff record
            toUserId: managerUser._id,
            handoverTime: new Date(),
            shiftStartTime: new Date(), // Có thể cần điều chỉnh
            shiftEndTime: new Date(),
            previousShiftAmount: prevAmount,
            cashInShift: cashShift,
            managerHandoverAmount: amount,
            actualReceivedAmount: handoverAmount,
            handoverAmount: handoverAmount,
            cashAmount: cashAfter,
            bankTransferAmount: bankTransfer,
            cardPaymentAmount: cardPayment,
            expenseAmount: expense,
            incomeAmount: income,
            totalRevenue: totalRevenue,
            totalRoomRevenue: totalRoomRevenue,
            roomHistory: optimizedRoomHistory,
            invoices: optimizedInvoices,
            expenses: optimizedExpenses,
            incomes: req.body.incomes ? optimizeIncomes(req.body.incomes, 500) : [],
            serviceOrders: [],
            confirmedByPassword: true,
            confirmed: true,
            confirmedAt: new Date(),
            notes: optimizedNotes,
            pendingIssues: [],
            status: 'confirmed'
        });

        await shiftHandover.save();

        // Cập nhật shiftHandoverId cho tất cả expenses và incomes đã được giao tiền quản lý
        if (expenses && Array.isArray(expenses) && expenses.length > 0) {
            const expenseIds = expenses
                .map(exp => exp.expenseId || exp._id)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id));
            
            if (expenseIds.length > 0) {
                await Transaction.updateMany(
                    { 
                        _id: { $in: expenseIds },
                        hotelId: new mongoose.Types.ObjectId(hotelId),
                        type: 'expense'
                    },
                    { 
                        $set: { shiftHandoverId: shiftHandover._id } 
                    }
                );
            }
        }
        
        // Cập nhật shiftHandoverId cho tất cả incomes đã được giao tiền quản lý
        // incomes đã được destructure từ req.body ở đầu function
        if (incomes && Array.isArray(incomes) && incomes.length > 0) {
            const incomeIds = incomes
                .map(inc => inc.incomeId || inc._id)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id));
            
            if (incomeIds.length > 0) {
                await Transaction.updateMany(
                    { 
                        _id: { $in: incomeIds },
                        hotelId: new mongoose.Types.ObjectId(hotelId),
                        type: 'income'
                    },
                    { 
                        $set: { shiftHandoverId: shiftHandover._id } 
                    }
                );
            }
        }

        // Xóa lịch sử phòng đã được lưu vào shift handover
        if (roomHistory && roomHistory.length > 0) {
            try {
                // Lấy danh sách roomId từ roomHistory
                const roomIds = [...new Set(roomHistory.map(rh => rh.roomId).filter(id => id))];
                
                // Lấy danh sách bookingId và invoiceNumber để xác định chính xác record cần xóa
                const bookingIds = [...new Set(roomHistory.map(rh => rh.bookingId).filter(id => id))];
                const invoiceNumbers = [...new Set(roomHistory.map(rh => rh.invoiceNumber).filter(num => num))];
                
                // Xóa bookingHistory trong các phòng
                for (const roomId of roomIds) {
                    try {
                        const room = await Room.findById(roomId);
                        if (room && room.bookingHistory && room.bookingHistory.length > 0) {
                            const originalLength = room.bookingHistory.length;
                            
                            // Xóa các record trong bookingHistory có:
                            // 1. Event là 'check-out' 
                            // 2. Và có bookingId hoặc invoiceNumber trùng với roomHistory
                            // 3. Hoặc nếu không có bookingId/invoiceNumber, so sánh bằng timestamp
                            // 4. QUAN TRỌNG: Không xóa các hóa đơn có công nợ chưa thanh toán
                            
                            // Lấy danh sách invoiceIds từ roomHistory để kiểm tra công nợ
                            const invoiceIds = roomHistory
                                .map(rh => rh.invoiceId)
                                .filter(id => id)
                                .map(id => id.toString());
                            
                            // Tìm các invoice có công nợ chưa thanh toán
                            let debtInvoiceIds = [];
                            if (invoiceIds.length > 0 || invoiceNumbers.length > 0) {
                                try {
                                    const debts = await Debt.find({
                                        status: { $ne: 'settled' },
                                        $or: [
                                            { invoiceId: { $in: invoiceIds.map(id => mongoose.Types.ObjectId(id)) } },
                                            { invoiceNumber: { $in: invoiceNumbers } }
                                        ]
                                    }).select('invoiceId');
                                    
                                    debtInvoiceIds = debts.map(d => d.invoiceId?.toString()).filter(id => id);
                                    
                                    // Nếu không tìm thấy bằng invoiceId, thử tìm bằng invoiceNumber
                                    if (debtInvoiceIds.length === 0 && invoiceNumbers.length > 0) {
                                        const invoices = await Invoice.find({
                                            invoiceNumber: { $in: invoiceNumbers }
                                        }).select('_id');
                                        const foundInvoiceIds = invoices.map(inv => inv._id.toString());
                                        
                                        const debtsByInvoiceNumber = await Debt.find({
                                            status: { $ne: 'settled' },
                                            invoiceId: { $in: foundInvoiceIds.map(id => mongoose.Types.ObjectId(id)) }
                                        }).select('invoiceId');
                                        
                                        debtInvoiceIds = debtsByInvoiceNumber.map(d => d.invoiceId?.toString()).filter(id => id);
                                    }
                                } catch (debtCheckError) {
                                    console.error('Error checking debts:', debtCheckError);
                                }
                            }
                            
                            room.bookingHistory = room.bookingHistory.filter(history => {
                                const historyEvent = (history.event || '').toLowerCase();
                                
                                // Giữ lại tất cả các event không phải check-out
                                if (historyEvent !== 'check-out' && historyEvent !== 'checkout') {
                                    return true;
                                }
                                
                                // Đối với check-out events, kiểm tra xem có trong roomHistory không
                                const historyBookingId = history.bookingId?.toString();
                                const historyInvoiceNumber = history.invoiceNumber;
                                const historyInvoiceId = history.invoiceId?.toString();
                                const historyDate = history.date || history.checkOutTime;
                                
                                // QUAN TRỌNG: Không xóa nếu hóa đơn có công nợ chưa thanh toán
                                if (historyInvoiceId && debtInvoiceIds.includes(historyInvoiceId)) {
                                    console.log(`Giữ lại hóa đơn ${historyInvoiceNumber || historyInvoiceId} vì có công nợ chưa thanh toán`);
                                    return true; // Giữ lại
                                }
                                
                                // Kiểm tra bằng bookingId
                                if (historyBookingId && bookingIds.includes(historyBookingId)) {
                                    if (historyInvoiceId && debtInvoiceIds.includes(historyInvoiceId)) {
                                        return true; // Giữ lại
                                    }
                                    return false; // Xóa
                                }
                                
                                // Kiểm tra bằng invoiceNumber
                                if (historyInvoiceNumber && invoiceNumbers.includes(historyInvoiceNumber)) {
                                    if (historyInvoiceId && debtInvoiceIds.includes(historyInvoiceId)) {
                                        return true; // Giữ lại
                                    }
                                    return false; // Xóa
                                }
                                
                                // Nếu không có bookingId hoặc invoiceNumber, so sánh bằng timestamp
                                if (historyDate && (!historyBookingId || !historyInvoiceNumber)) {
                                    const historyTimestamp = new Date(historyDate).getTime();
                                    const isInRoomHistory = roomHistory.some(rh => {
                                        if (rh.roomId?.toString() !== roomId.toString()) {
                                            return false;
                                        }
                                        const rhTimestamp = new Date(rh.timestamp || rh.date || 0).getTime();
                                        // Cho phép sai số 5 phút để đảm bảo khớp
                                        return Math.abs(historyTimestamp - rhTimestamp) < 300000;
                                    });
                                    if (isInRoomHistory) {
                                        if (historyInvoiceId && debtInvoiceIds.includes(historyInvoiceId)) {
                                            return true; // Giữ lại
                                        }
                                        return false; // Xóa
                                    }
                                }
                                
                                return true; // Giữ lại
                            });
                            
                            const deletedCount = originalLength - room.bookingHistory.length;
                            if (deletedCount > 0) {
                                await room.save();
                                console.log(`Đã xóa ${deletedCount} record lịch sử từ phòng ${room.roomNumber} (${roomId})`);
                            }
                        }
                    } catch (roomError) {
                        console.error(`Error deleting history for room ${roomId}:`, roomError);
                        // Tiếp tục với phòng khác, không throw error
                    }
                }
            } catch (deleteError) {
                console.error('Error deleting room history:', deleteError);
                // Không throw error, chỉ log vì shift handover đã được lưu thành công
            }
        }

        // Trả về đầy đủ thông tin để frontend cập nhật
        res.status(201).json({
            message: `Đã giao ${amount.toLocaleString('vi-VN')} đ cho ${toManagerName}`,
            transaction,
            shiftHandover: shiftHandover, // Trả về shift handover record đã tạo
            managerInfo: {
                name: toManagerName,
                position: toManager?.employmentInfo?.position || managerUser.role || 'Quản lý',
                userId: managerUser._id,
                username: managerUser.username,
                email: managerUser.email
            },
            financialInfo: {
                amount: amount,
                cashBeforeHandover: cashBeforeHandover || 0,
                cashAfterHandover: cashAfterHandover || 0
                // cashInShift sẽ được frontend tính từ paidData
            },
            cashAfterHandover // Giữ lại để backward compatibility
        });

    } catch (error) {
        console.error('Error creating manager handover:', error);
        res.status(500).json({ 
            message: 'Lỗi khi giao tiền quản lý', 
            error: error.message 
        });
    }
};

// ============ LỊCH SỬ GIAO CA ============

/**
 * Lấy lịch sử giao ca
 * CHỈ admin hoặc business được quyền xem
 */
exports.getShiftHandoverHistory = async (req, res) => {
    try {
        const { hotelId, staffId, startDate, endDate, page = 1, limit = 20 } = req.query;

        const query = {};

        // Filter theo hotelId nếu có
        if (hotelId) {
            query.hotelId = hotelId;
        } else {
            // Nếu không có hotelId trong query, filter theo quyền của user
            // Business: filter theo businessId (đã được set trong middleware)
            if (req.filterByBusinessId) {
                const { Hotel } = require('../models/hotels');
                const hotels = await Hotel.find({ businessId: req.filterByBusinessId }).select('_id');
                const hotelIds = hotels.map(h => h._id);
                query.hotelId = { $in: hotelIds };
            }
            // Hotel: filter theo hotelId của user (đã được set trong middleware)
            else if (req.filterByHotelId) {
                query.hotelId = req.filterByHotelId;
            }
        }

        if (staffId) {
            query.$or = [
                { fromStaffId: staffId },
                { toStaffId: staffId }
            ];
        }

        if (startDate || endDate) {
            query.handoverTime = {};
            if (startDate) query.handoverTime.$gte = new Date(startDate);
            if (endDate) query.handoverTime.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [shiftHandovers, totalCount] = await Promise.all([
            ShiftHandover.find(query)
                .populate('fromStaffId', 'personalInfo employmentInfo')
                .populate('toStaffId', 'personalInfo employmentInfo')
                .populate('fromUserId', 'username fullName email')
                .populate('toUserId', 'username fullName email')
                .populate('hotelId', 'name')
                .sort({ handoverTime: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            ShiftHandover.countDocuments(query)
        ]);

        const totalExpense = shiftHandovers.reduce((sum, record) => {
            if (Array.isArray(record.expenses) && record.expenses.length > 0) {
                const recordExpense = record.expenses.reduce((expSum, exp) => expSum + (exp.amount || 0), 0);
                return sum + recordExpense;
            }
            return sum + (record.expenseAmount || 0);
        }, 0);

        res.status(200).json({
            message: 'Lấy lịch sử giao ca thành công',
            data: shiftHandovers,
            totalExpense: totalExpense,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalItems: totalCount,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error getting shift handover history:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy lịch sử giao ca', 
            error: error.message 
        });
    }
};

/**
 * Lấy chi tiết một lần giao ca
 */
exports.getShiftHandoverById = async (req, res) => {
    try {
        const { id } = req.params;

        // Kiểm tra quyền - chỉ admin hoặc business được xem
        const userRole = req.user?.role;
        if (!['superadmin', 'admin', 'business'].includes(userRole)) {
            return res.status(403).json({ 
                message: 'Bạn không có quyền xem chi tiết giao ca' 
            });
        }

        const shiftHandover = await ShiftHandover.findById(id)
            .populate('fromStaffId', 'personalInfo employmentInfo')
            .populate('toStaffId', 'personalInfo employmentInfo')
            .populate('fromUserId', 'username fullName email')
            .populate('toUserId', 'username fullName email')
            .populate('hotelId', 'name')
            .populate('roomHistory.roomId', 'roomNumber floor type')
            .populate('roomHistory.bookingId')
            .populate('invoices.bookingId')
            .populate('invoices.roomId', 'roomNumber')
            .populate('serviceOrders.serviceOrderId')
            .populate('serviceOrders.roomId', 'roomNumber');

        if (!shiftHandover) {
            return res.status(404).json({ message: 'Không tìm thấy thông tin giao ca' });
        }

        res.status(200).json({
            message: 'Lấy chi tiết giao ca thành công',
            data: shiftHandover
        });

    } catch (error) {
        console.error('Error getting shift handover:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy chi tiết giao ca', 
            error: error.message 
        });
    }
};

// ============ TÍNH TOÁN DOANH THU ============

/**
 * Tính doanh thu khách sạn theo công thức:
 * Tổng doanh thu = Tiền mặt + Chuyển khoản + Cà thẻ - Tiền chi = Phiếu thu - Phiếu chi
 */
exports.calculateRevenue = async (req, res) => {
    try {
        const { hotelId, startDate, endDate } = req.query;

        // Cho phép superadmin/admin không cần hotelId (tính toàn hệ thống)
        if (!hotelId && req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(400).json({ message: 'hotelId là bắt buộc' });
        }

        const query = {};
        if (hotelId) query.hotelId = hotelId;
        
        // Nếu là business và không có hotelId -> Lấy tất cả hotel của business
        if (!hotelId && req.user.role === 'business') {
             // Cần tìm tất cả hotelId của business này
             // Tạm thời chưa hỗ trợ tính tổng business mà không có hotelId cụ thể ở API này
             // Hoặc phải query Hotel.find({ businessId: req.user.businessId })
             return res.status(400).json({ message: 'Vui lòng chọn khách sạn cụ thể' });
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Lấy tất cả transactions
        const transactions = await Transaction.find(query);

        // Tính toán
        let cashTotal = 0;
        let bankTransferTotal = 0;
        let cardTotal = 0;
        let expenseTotal = 0;
        let incomeTotal = 0;

        transactions.forEach(tx => {
            if (tx.status === 'completed') {
                if (tx.type === 'expense') {
                    expenseTotal += tx.amount;
                } else {
                    // Phân loại theo phương thức thanh toán
                    switch (tx.method) {
                        case 'cash':
                            cashTotal += tx.amount;
                            break;
                        case 'bank_transfer':
                            bankTransferTotal += tx.amount;
                            break;
                        case 'credit_card':
                        case 'card':
                            cardTotal += tx.amount;
                            break;
                        default:
                            // other hoặc method không xác định -> tính vào tiền mặt
                            cashTotal += tx.amount;
                            break;
                    }
                    if (tx.type === 'income' || tx.type === 'payment') {
                        incomeTotal += tx.amount;
                    }
                }
            }
        });

        // Tổng doanh thu = tiền mặt + chuyển khoản + cà thẻ - tiền chi
        const totalRevenue = cashTotal + bankTransferTotal + cardTotal - expenseTotal;

        // Hoặc tính theo: Phiếu thu - Phiếu chi
        const netRevenue = incomeTotal - expenseTotal;

        res.status(200).json({
            message: 'Tính doanh thu thành công',
            data: {
                cashTotal,
                bankTransferTotal,
                cardTotal,
                expenseTotal,
                incomeTotal,
                totalRevenue,
                netRevenue,
                breakdown: {
                    byMethod: {
                        cash: cashTotal,
                        bankTransfer: bankTransferTotal,
                        card: cardTotal
                    },
                    byType: {
                        income: incomeTotal,
                        expense: expenseTotal
                    }
                }
            },
            period: {
                startDate,
                endDate
            }
        });

    } catch (error) {
        console.error('Error calculating revenue:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tính doanh thu', 
            error: error.message 
        });
    }
};

// ============ LẤY DOANH THU THEO PERIOD (NGÀY/TUẦN/THÁNG) ============

/**
 * Lấy doanh thu khách sạn theo khoảng thời gian (ngày/tuần/tháng)
 * Tính từ Lịch sử phòng trong ca (roomHistory) và expenses trong shift handover
 * Không tính giao tiền quản lý (managerHandoverAmount)
 */
exports.getRevenueByPeriod = async (req, res) => {
    try {
        const { hotelId, period = 'day', startDate: startDateParam, endDate: endDateParam } = req.query;

        // Cho phép superadmin/admin không cần hotelId (tính toàn hệ thống)
        if (!hotelId && req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(400).json({ message: 'hotelId là bắt buộc' });
        }
        
        // Nếu là business và không có hotelId -> Vui lòng chọn khách sạn
        if (!hotelId && req.user.role === 'business') {
             return res.status(400).json({ message: 'Vui lòng chọn khách sạn cụ thể' });
        }

        // Tính toán khoảng thời gian dựa trên period
        const now = new Date();
        let startDate, endDate;

        if (startDateParam && endDateParam) {
            // Sử dụng startDate và endDate từ query nếu có
            startDate = new Date(startDateParam);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(endDateParam);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Tính toán tự động dựa trên period
            switch (period) {
                case 'day':
                    // Lấy dữ liệu 7 ngày gần nhất
                    startDate = new Date(now);
                    startDate.setDate(startDate.getDate() - 6);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'week':
                    // Lấy dữ liệu 4 tuần gần nhất (28 ngày)
                    startDate = new Date(now);
                    startDate.setDate(startDate.getDate() - 27);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'month':
                    // Lấy dữ liệu 12 tháng gần nhất
                    startDate = new Date(now);
                    startDate.setMonth(startDate.getMonth() - 11);
                    startDate.setDate(1);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                default:
                    return res.status(400).json({ message: 'Period không hợp lệ. Chỉ chấp nhận: day, week, month' });
            }
        }

        // Lấy tất cả shift handovers trong khoảng thời gian
        const query = {
            handoverTime: {
                $gte: startDate,
                $lte: endDate
            },
            status: 'confirmed'
        };
        
        if (hotelId) {
            query.hotelId = new mongoose.Types.ObjectId(hotelId);
        }

        const shiftHandovers = await ShiftHandover.find(query).select('handoverTime roomHistory expenses expenseAmount');

        // Nhóm dữ liệu theo period
        const grouped = {};

        shiftHandovers.forEach(record => {
            const handoverDate = new Date(record.handoverTime);
            let key;

            // Tạo key để nhóm theo period
            switch (period) {
                case 'day':
                    key = `${handoverDate.getFullYear()}-${String(handoverDate.getMonth() + 1).padStart(2, '0')}-${String(handoverDate.getDate()).padStart(2, '0')}`;
                    break;
                case 'week':
                    // Tính tuần bắt đầu từ thứ 2
                    const weekStart = new Date(handoverDate);
                    const dayOfWeek = handoverDate.getDay();
                    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Chủ nhật = 0, thứ 2 = 1
                    weekStart.setDate(handoverDate.getDate() - diff);
                    weekStart.setHours(0, 0, 0, 0);
                    key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
                    break;
                case 'month':
                    key = `${handoverDate.getFullYear()}-${String(handoverDate.getMonth() + 1).padStart(2, '0')}`;
                    break;
                default:
                    key = `${handoverDate.getFullYear()}-${String(handoverDate.getMonth() + 1).padStart(2, '0')}-${String(handoverDate.getDate()).padStart(2, '0')}`;
            }

            if (!grouped[key]) {
                grouped[key] = { revenue: 0, expense: 0, payment: 0 };
            }

            // Tính doanh thu từ Lịch sử phòng trong ca (roomHistory)
            // Công thức: roomTotal + additionalCharges - discount + serviceAmount
            if (record.roomHistory && Array.isArray(record.roomHistory)) {
                record.roomHistory.forEach((room) => {
                    const roomTotal = room.roomTotal || 0;
                    const additionalCharges = room.additionalCharges || 0;
                    const discount = room.discount || 0;
                    const serviceAmount = room.serviceAmount || room.serviceTotal || 0;

                    // Tổng doanh thu từ mỗi phòng = tiền phòng + phụ thu - khuyến mãi + tiền dịch vụ
                    const roomRevenue = roomTotal + additionalCharges - discount + serviceAmount;
                    grouped[key].revenue += roomRevenue;

                    // Payment chỉ tính tiền phòng (roomTotal)
                    grouped[key].payment += roomTotal;
                });
            }

            // Tính chi phí từ expenses (phiếu chi)
            let expenseAmount = 0;
            if (record.expenses && Array.isArray(record.expenses)) {
                expenseAmount = record.expenses.reduce((sum, expense) => {
                    return sum + (expense.amount || 0);
                }, 0);
            } else {
                expenseAmount = record.expenseAmount || 0;
            }

            grouped[key].expense += expenseAmount;
        });

        // Sắp xếp keys và tạo arrays
        const sortedKeys = Object.keys(grouped).sort();
        const labels = [];
        const revenueDataArray = [];
        const paymentDataArray = [];
        const expenseDataArray = [];

        // Tính tổng
        let totalRevenue = 0;
        let totalPayment = 0;
        let totalExpense = 0;

        sortedKeys.forEach(key => {
            // Format label
            let label;
            if (period === 'day' || period === 'week') {
                const parts = key.split('-');
                if (parts.length === 3) {
                    label = `${parts[2]}/${parts[1]}`;
                } else {
                    label = key;
                }
            } else if (period === 'month') {
                const parts = key.split('-');
                if (parts.length === 2) {
                    label = `${parts[1]}/${parts[0]}`;
                } else {
                    label = key;
                }
            } else {
                label = key;
            }

            labels.push(label);
            revenueDataArray.push(grouped[key].revenue);
            paymentDataArray.push(grouped[key].payment);
            expenseDataArray.push(grouped[key].expense);

            totalRevenue += grouped[key].revenue;
            totalPayment += grouped[key].payment;
            totalExpense += grouped[key].expense;
        });

        res.status(200).json({
            message: 'Lấy doanh thu theo period thành công',
            labels: labels,
            revenueData: revenueDataArray,
            paymentData: paymentDataArray,
            expenseData: expenseDataArray,
            totalRevenue: totalRevenue,
            totalPayment: totalPayment,
            totalExpense: totalExpense,
            period: period,
            startDate: startDate,
            endDate: endDate
        });

    } catch (error) {
        console.error('Error getting revenue by period:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy doanh thu theo period', 
            error: error.message 
        });
    }
};

// ============ LẤY SỐ TIỀN CA TRƯỚC ============

/**
 * Lấy số tiền từ ca trước để tính cho ca hiện tại
 */
exports.getPreviousShiftAmount = async (req, res) => {
    try {
        const { hotelId, staffId } = req.query;

        if (!hotelId) {
            return res.status(400).json({ message: 'hotelId là bắt buộc' });
        }

        // Tìm giao ca gần nhất của khách sạn
        const lastShiftHandover = await ShiftHandover.findOne({
            hotelId,
            status: 'confirmed'
        }).sort({ handoverTime: -1 });

        const previousShiftAmount = lastShiftHandover?.handoverAmount || 0;

        res.status(200).json({
            message: 'Lấy số tiền ca trước thành công',
            data: {
                previousShiftAmount,
                lastShiftHandover: lastShiftHandover ? {
                    id: lastShiftHandover._id,
                    handoverTime: lastShiftHandover.handoverTime,
                    handoverAmount: lastShiftHandover.handoverAmount
                } : null
            }
        });

    } catch (error) {
        console.error('Error getting previous shift amount:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy số tiền ca trước', 
            error: error.message 
        });
    }
};

// ============ THỐNG KÊ GIAO CA ============

/**
 * Thống kê giao ca theo khách sạn
 */
exports.getShiftHandoverStats = async (req, res) => {
    try {
        const { hotelId, startDate, endDate } = req.query;

        // Kiểm tra quyền
        const userRole = req.user?.role;
        if (!['superadmin', 'admin', 'business'].includes(userRole)) {
            return res.status(403).json({ 
                message: 'Bạn không có quyền xem thống kê giao ca' 
            });
        }

        const query = {};
        if (hotelId) query.hotelId = hotelId;
        if (startDate || endDate) {
            query.handoverTime = {};
            if (startDate) query.handoverTime.$gte = new Date(startDate);
            if (endDate) query.handoverTime.$lte = new Date(endDate);
        }

        const stats = await ShiftHandover.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$hotelId',
                    totalHandovers: { $sum: 1 },
                    totalCashAmount: { $sum: '$cashAmount' },
                    totalBankTransfer: { $sum: '$bankTransferAmount' },
                    totalCardPayment: { $sum: '$cardPaymentAmount' },
                    totalExpense: { $sum: '$expenseAmount' },
                    totalIncome: { $sum: '$incomeAmount' },
                    totalRevenue: { $sum: '$totalRevenue' },
                    totalRoomRevenue: { $sum: '$totalRoomRevenue' },
                    avgHandoverAmount: { $avg: '$handoverAmount' }
                }
            }
        ]);

        // Lấy tên khách sạn
        const hotelIds = stats.map(s => s._id);
        const hotels = await Hotel.find({ _id: { $in: hotelIds } }).select('name');
        const hotelMap = {};
        hotels.forEach(h => hotelMap[h._id.toString()] = h.name);

        const enrichedStats = stats.map(s => ({
            ...s,
            hotelName: hotelMap[s._id?.toString()] || 'N/A'
        }));

        res.status(200).json({
            message: 'Lấy thống kê giao ca thành công',
            data: enrichedStats
        });

    } catch (error) {
        console.error('Error getting shift handover stats:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy thống kê giao ca', 
            error: error.message 
        });
    }
};

// ============ LẤY SỐ LƯỢNG CHECK-IN THEO PERIOD (NGÀY/TUẦN/THÁNG) ============

/**
 * Lấy số lượng check-in phòng theo khoảng thời gian (ngày/tuần/tháng)
 * Đếm từ RoomEvent collection với type = 'checkin'
 */
exports.getCheckinCountByPeriod = async (req, res) => {
    try {
        const { hotelId, period = 'day', startDate: startDateParam, endDate: endDateParam } = req.query;

        if (!hotelId) {
            return res.status(400).json({ message: 'hotelId là bắt buộc' });
        }

        // Tính toán khoảng thời gian dựa trên period
        const now = new Date();
        let startDate, endDate;

        if (startDateParam && endDateParam) {
            // Sử dụng startDate và endDate từ query nếu có
            startDate = new Date(startDateParam);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(endDateParam);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Tính toán tự động dựa trên period
            switch (period) {
                case 'day':
                    // Lấy dữ liệu 7 ngày gần nhất
                    startDate = new Date(now);
                    startDate.setDate(startDate.getDate() - 6);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'week':
                    // Lấy dữ liệu 4 tuần gần nhất (28 ngày)
                    startDate = new Date(now);
                    startDate.setDate(startDate.getDate() - 27);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'month':
                    // Lấy dữ liệu 12 tháng gần nhất
                    startDate = new Date(now);
                    startDate.setMonth(startDate.getMonth() - 11);
                    startDate.setDate(1);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                default:
                    return res.status(400).json({ message: 'Period không hợp lệ. Chỉ chấp nhận: day, week, month' });
            }
        }

        // Lấy tất cả check-in events từ RoomEvent collection
        // Query: type = 'checkin' và (checkinTime trong khoảng thời gian HOẶC nếu không có checkinTime thì dùng createdAt)
        const checkinEvents = await RoomEvent.find({
            hotelId: new mongoose.Types.ObjectId(hotelId),
            type: 'checkin',
            $or: [
                { 
                    checkinTime: { 
                        $gte: startDate, 
                        $lte: endDate 
                    } 
                },
                { 
                    checkinTime: { $exists: false },
                    createdAt: { 
                        $gte: startDate, 
                        $lte: endDate 
                    }
                },
                {
                    checkinTime: null,
                    createdAt: { 
                        $gte: startDate, 
                        $lte: endDate 
                    }
                }
            ]
        }).select('checkinTime createdAt');

        // Nhóm dữ liệu theo period và đếm số lượng check-in
        const grouped = {};
        const pad = (num) => num < 10 ? '0' + num : num.toString();

        checkinEvents.forEach((event) => {
            // Lấy thời gian check-in để nhóm theo period
            // Ưu tiên checkinTime, nếu không có thì dùng createdAt
            let checkinDate;
            if (event.checkinTime) {
                checkinDate = new Date(event.checkinTime);
            } else if (event.createdAt) {
                checkinDate = new Date(event.createdAt);
            } else {
                return; // Bỏ qua nếu không có thời gian
            }

            // Kiểm tra xem check-in có nằm trong khoảng thời gian không
            if (checkinDate < startDate || checkinDate > endDate) {
                return;
            }

            let key;

            // Tạo key để nhóm theo period
            switch (period) {
                case 'day':
                    key = `${checkinDate.getFullYear()}-${pad(checkinDate.getMonth() + 1)}-${pad(checkinDate.getDate())}`;
                    break;
                case 'week':
                    // Tính tuần bắt đầu từ thứ 2
                    const weekStart = new Date(checkinDate);
                    const dayOfWeek = checkinDate.getDay();
                    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Chủ nhật = 0, thứ 2 = 1
                    weekStart.setDate(checkinDate.getDate() - diff);
                    weekStart.setHours(0, 0, 0, 0);
                    key = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
                    break;
                case 'month':
                    key = `${checkinDate.getFullYear()}-${pad(checkinDate.getMonth() + 1)}`;
                    break;
                default:
                    key = `${checkinDate.getFullYear()}-${pad(checkinDate.getMonth() + 1)}-${pad(checkinDate.getDate())}`;
            }

            if (!grouped[key]) {
                grouped[key] = 0;
            }

            grouped[key]++;
        });

        // Sắp xếp keys và tạo arrays
        const sortedKeys = Object.keys(grouped).sort();
        const labels = [];
        const checkinCountData = [];

        // Tính tổng
        let totalCheckins = 0;

        sortedKeys.forEach(key => {
            // Format label
            let label;
            if (period === 'day' || period === 'week') {
                const parts = key.split('-');
                if (parts.length === 3) {
                    label = `${parts[2]}/${parts[1]}`;
                } else {
                    label = key;
                }
            } else if (period === 'month') {
                const parts = key.split('-');
                if (parts.length === 2) {
                    label = `${parts[1]}/${parts[0]}`;
                } else {
                    label = key;
                }
            } else {
                label = key;
            }

            labels.push(label);
            checkinCountData.push(grouped[key]);
            totalCheckins += grouped[key];
        });

        res.status(200).json({
            message: 'Lấy số lượng check-in theo period thành công',
            labels: labels,
            checkinCountData: checkinCountData,
            totalCheckins: totalCheckins,
            period: period,
            startDate: startDate,
            endDate: endDate
        });

    } catch (error) {
        console.error('Error getting checkin count by period:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy số lượng check-in theo period', 
            error: error.message 
        });
    }
};

module.exports = exports;

