const { Transaction } = require('../models/transactions');
const { Invoice } = require('../models/invoice');
const { Hotel } = require('../models/hotel');
const { ServiceOrder } = require('../models/serviceOrder');
const { Room } = require('../models/rooms');
const ShiftHandover = require('../models/ShiftHandover');
const mongoose = require('mongoose');
const revenueService = require('../services/revenueService');

/**
 * Tính toán báo cáo tổng hợp tài chính
 * Bao gồm: Tổng doanh thu, Chi phí, Lợi nhuận, Thời gian hoàn vốn
 */
exports.getFinancialSummary = async (req, res) => {
    try {
        const { hotelId, startDate, endDate } = req.query;
        const currentUser = req.user;

        // Kiểm tra quyền: chỉ superadmin và business mới được xem báo cáo
        if (currentUser.role !== 'superadmin' && currentUser.role !== 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo tổng hợp tài chính' });
        }

        if (!hotelId) {
            return res.status(400).json({ message: 'hotelId là bắt buộc' });
        }

        // Lấy thông tin khách sạn để kiểm tra quyền business
        const hotel = await Hotel.findById(hotelId);
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }

        // Kiểm tra quyền business: chỉ được xem hotels của business mình
        if (currentUser.role === 'business') {
            if (!currentUser.businessId) {
                return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo tổng hợp tài chính' });
            }
            if (hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
                return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo tổng hợp tài chính của khách sạn này' });
            }
        }

        // Mặc định lấy dữ liệu tháng trước nếu không có startDate/endDate
        let start = startDate ? new Date(startDate) : new Date();
        let end = endDate ? new Date(endDate) : new Date();
        
        // Đảm bảo endDate bao gồm cả ngày cuối
        end.setHours(23, 59, 59, 999);
        start.setHours(0, 0, 0, 0);

        // Sử dụng RevenueService để tính toán
        const result = await revenueService.calculateRevenue(hotelId, start, end);

        // Tính toán các chỉ số tài chính bổ sung (NPV, IRR, Payback Period) nếu chưa có trong service
        // Hiện tại RevenueService đã trả về đủ các chỉ số cơ bản.
        // Các chỉ số nâng cao (NPV, IRR) nếu cần thiết nên được chuyển vào Service sau này.
        // Để đảm bảo backward compatibility, ta map lại response.

        // Mapping response
        res.status(200).json({
            message: 'Lấy báo cáo tổng hợp tài chính thành công',
            data: {
                totalRevenue: result.totalRevenue,
                totalCosts: result.totalCosts,
                profit: result.profitAfterTax, // Map profit = profitAfterTax
                initialInvestment: result.initialInvestment || 0, // Cần bổ sung vào service nếu chưa có
                monthlyProfit: result.monthlyProfit || 0,
                paybackPeriod: result.paybackPeriod || 0,
                paybackPeriodDays: result.paybackPeriodDays || 0,
                depreciation: result.depreciationPeriod,
                interest: result.interestPeriod,
                profitBeforeTax: result.profitBeforeTax,
                tax: result.tax,
                profitAfterTax: result.profitAfterTax,
                npv: result.npv || 0,
                irr: result.irr || 0,
                breakdown: {
                    revenue: {
                        roomRevenue: result.roomRevenue,
                        roomRevenueDaily: 0, // Tạm thời 0 hoặc tính thêm
                        roomRevenueMonthly: 0,
                        roomRevenueYearly: 0,
                        serviceRevenue: result.serviceRevenue,
                        cafeRevenue: result.cafeRevenue,
                        otherServiceRevenue: result.otherServiceRevenue,
                        receiptRevenue: result.receiptRevenue,
                        otherRevenue: 0
                    },
                    costs: {
                        expenses: result.totalExpenses,
                        receiptExpenses: result.totalExpenses, // Tạm gán
                        utilities: result.breakdown.utilities,
                        salary: result.breakdown.salary,
                        supplies: result.breakdown.supplies,
                        maintenance: result.breakdown.maintenance,
                        marketing: result.breakdown.marketing,
                        training: result.breakdown.training,
                        serviceCost: result.breakdown.serviceCost,
                        other: result.breakdown.otherCosts
                    }
                },
                period: {
                    startDate: result.startDate.toISOString().split('T')[0],
                    endDate: result.endDate.toISOString().split('T')[0]
                },
                financialConfig: result.financialConfig || {}
            }
        });

    } catch (error) {
        console.error('Error calculating financial summary:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tính toán báo cáo tổng hợp tài chính', 
            error: error.message 
        });
    }
};

/**
 * Cập nhật vốn đầu tư ban đầu cho khách sạn
 */
exports.updateInitialInvestment = async (req, res) => {
    try {
        const { hotelId } = req.params;
        const { initialInvestment } = req.body;

        if (!hotelId) {
            return res.status(400).json({ message: 'hotelId là bắt buộc' });
        }

        if (initialInvestment === undefined || initialInvestment === null) {
            return res.status(400).json({ message: 'initialInvestment là bắt buộc' });
        }

        if (isNaN(Number(initialInvestment)) || Number(initialInvestment) < 0) {
            return res.status(400).json({ message: 'initialInvestment phải là số dương' });
        }

        const hotel = await Hotel.findByIdAndUpdate(
            hotelId,
            { initialInvestment: Number(initialInvestment) },
            { new: true, runValidators: true }
        );

        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }

        res.status(200).json({
            message: 'Cập nhật vốn đầu tư ban đầu thành công',
            data: {
                hotelId: hotel._id,
                initialInvestment: hotel.initialInvestment
            }
        });

    } catch (error) {
        console.error('Error updating initial investment:', error);
        res.status(500).json({ 
            message: 'Lỗi khi cập nhật vốn đầu tư ban đầu', 
            error: error.message 
        });
    }
};

/**
 * Cập nhật cấu hình tài chính cho khách sạn
 */
exports.updateFinancialConfig = async (req, res) => {
    try {
        const { hotelId } = req.params;
        const { financialConfig } = req.body;
        const currentUser = req.user;

        // Kiểm tra quyền: chỉ superadmin và business mới được cập nhật
        if (currentUser.role !== 'superadmin' && currentUser.role !== 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật cấu hình tài chính' });
        }

        if (!hotelId) {
            return res.status(400).json({ message: 'hotelId là bắt buộc' });
        }

        if (!financialConfig || typeof financialConfig !== 'object') {
            return res.status(400).json({ message: 'financialConfig là bắt buộc' });
        }

        // Kiểm tra hotel tồn tại
        const hotel = await Hotel.findById(hotelId);
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }

        // Kiểm tra quyền business: chỉ được cập nhật hotels của business mình
        if (currentUser.role === 'business') {
            if (!currentUser.businessId) {
                return res.status(403).json({ message: 'Bạn không có quyền cập nhật cấu hình tài chính' });
            }
            if (hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
                return res.status(403).json({ message: 'Bạn không có quyền cập nhật cấu hình tài chính của khách sạn này' });
            }
        }

        // Validate và cập nhật từng trường
        const updateData = {};
        if (hotel.financialConfig) {
            updateData.financialConfig = { ...hotel.financialConfig };
        } else {
            updateData.financialConfig = {
                depreciationRate: 10,
                loanPercentage: 70,
                interestRate: 8,
                taxRate: 20,
                wacc: 9,
                projectionYears: 10
            };
        }

        if (financialConfig.depreciationRate !== undefined) {
            const val = Number(financialConfig.depreciationRate);
            if (isNaN(val) || val < 0 || val > 100) {
                return res.status(400).json({ message: 'depreciationRate phải là số từ 0 đến 100' });
            }
            updateData.financialConfig.depreciationRate = val;
        }

        if (financialConfig.loanPercentage !== undefined) {
            const val = Number(financialConfig.loanPercentage);
            if (isNaN(val) || val < 0 || val > 100) {
                return res.status(400).json({ message: 'loanPercentage phải là số từ 0 đến 100' });
            }
            updateData.financialConfig.loanPercentage = val;
        }

        if (financialConfig.interestRate !== undefined) {
            const val = Number(financialConfig.interestRate);
            if (isNaN(val) || val < 0 || val > 100) {
                return res.status(400).json({ message: 'interestRate phải là số từ 0 đến 100' });
            }
            updateData.financialConfig.interestRate = val;
        }

        if (financialConfig.taxRate !== undefined) {
            const val = Number(financialConfig.taxRate);
            if (isNaN(val) || val < 0 || val > 100) {
                return res.status(400).json({ message: 'taxRate phải là số từ 0 đến 100' });
            }
            updateData.financialConfig.taxRate = val;
        }

        if (financialConfig.wacc !== undefined) {
            const val = Number(financialConfig.wacc);
            if (isNaN(val) || val < 0 || val > 100) {
                return res.status(400).json({ message: 'wacc phải là số từ 0 đến 100' });
            }
            updateData.financialConfig.wacc = val;
        }

        if (financialConfig.projectionYears !== undefined) {
            const val = Number(financialConfig.projectionYears);
            if (isNaN(val) || val < 1 || val > 50) {
                return res.status(400).json({ message: 'projectionYears phải là số từ 1 đến 50' });
            }
            updateData.financialConfig.projectionYears = val;
        }

        // Cập nhật hotel
        const updatedHotel = await Hotel.findByIdAndUpdate(
            hotelId,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: 'Cập nhật cấu hình tài chính thành công',
            data: {
                hotelId: updatedHotel._id,
                financialConfig: updatedHotel.financialConfig
            }
        });

    } catch (error) {
        console.error('Error updating financial config:', error);
        res.status(500).json({ 
            message: 'Lỗi khi cập nhật cấu hình tài chính', 
            error: error.message 
        });
    }
};

/**
 * Export báo cáo tài chính tổng hợp ra file Excel
 */
exports.exportFinancialSummaryToExcel = async (req, res) => {
    try {
        const { hotelId, startDate, endDate } = req.query;
        const currentUser = req.user;

        // Kiểm tra quyền: chỉ superadmin và business mới được export Excel
        if (currentUser.role !== 'superadmin' && currentUser.role !== 'business') {
            return res.status(403).json({ message: 'Bạn không có quyền xuất báo cáo Excel' });
        }

        if (!hotelId) {
            return res.status(400).json({ message: 'hotelId là bắt buộc' });
        }

        // Kiểm tra xem exceljs đã được cài đặt chưa
        let ExcelJS;
        try {
            ExcelJS = require('exceljs');
        } catch (err) {
            return res.status(500).json({ 
                message: 'Thư viện exceljs chưa được cài đặt. Vui lòng chạy: npm install exceljs' 
            });
        }

        // Lấy thông tin khách sạn
        const hotel = await Hotel.findById(hotelId);
        if (!hotel) {
            return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
        }

        // Kiểm tra quyền business: chỉ được xem hotels của business mình
        if (currentUser.role === 'business') {
            if (!currentUser.businessId) {
                return res.status(403).json({ message: 'Bạn không có quyền xuất báo cáo Excel' });
            }
            if (hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
                return res.status(403).json({ message: 'Bạn không có quyền xuất báo cáo Excel của khách sạn này' });
            }
        }

        // Lấy danh sách phòng
        const rooms = await Room.find({ hotelId: hotelId });
        const totalRooms = rooms.length;

        // Tính toán khoảng thời gian
        let start = startDate ? new Date(startDate) : new Date();
        let end = endDate ? new Date(endDate) : new Date();
        end.setHours(23, 59, 59, 999);
        start.setHours(0, 0, 0, 0);

        const initialInvestment = hotel.initialInvestment || 0;
        
        // Lấy cấu hình tài chính từ hotel, nếu không có thì dùng mặc định
        const financialConfig = hotel.financialConfig || {};
        const depreciationRate = financialConfig.depreciationRate !== undefined ? financialConfig.depreciationRate : 10; // %
        const loanPercentage = financialConfig.loanPercentage !== undefined ? financialConfig.loanPercentage : 70; // %
        const interestRate = financialConfig.interestRate !== undefined ? financialConfig.interestRate / 100 : 0.08; // Chuyển từ % sang decimal
        const taxRate = financialConfig.taxRate !== undefined ? financialConfig.taxRate / 100 : 0.20; // Chuyển từ % sang decimal
        const wacc = financialConfig.wacc !== undefined ? financialConfig.wacc / 100 : 0.09; // Chuyển từ % sang decimal
        const projectionYears = financialConfig.projectionYears !== undefined ? financialConfig.projectionYears : 10;

        // Tính doanh thu phòng
        const paidInvoices = await Invoice.find({
            hotelId: hotelId,
            paymentStatus: { $in: ['paid', 'completed'] },
            issuedDate: { $gte: start, $lte: end }
        });

        let roomRevenue = 0;
        paidInvoices.forEach(invoice => {
            roomRevenue += (invoice.totalAmount || 0);
        });

        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const roomRevenueDaily = daysDiff > 0 ? roomRevenue / daysDiff : 0;
        const avgRoomPrice = totalRooms > 0 ? roomRevenueDaily / totalRooms : 0;

        // Tính doanh thu dịch vụ
        // Chỉ cần kiểm tra paymentStatus, không cần kiểm tra status
        const completedServiceOrders = await ServiceOrder.find({
            hotelId: hotelId,
            paymentStatus: { $in: ['paid', 'included_in_room_charge'] },
            $or: [
                { orderTime: { $gte: start, $lte: end } },
                { createdAt: { $gte: start, $lte: end } },
                { deliveryTime: { $gte: start, $lte: end } },
                { updatedAt: { $gte: start, $lte: end } }
            ]
        }).populate('items.serviceId');

        let cafeRevenue = 0;
        let otherServiceRevenue = 0;
        completedServiceOrders.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    let itemTotal = 0;
                    if (item.total) {
                        itemTotal = item.total;
                    } else if (item.price && item.quantity) {
                        itemTotal = (item.price * item.quantity);
                    }
                    
                    if (item.serviceId && typeof item.serviceId === 'object') {
                        const service = item.serviceId;
                        if (service.category === 'beverage' || 
                            (service.name && service.name.toLowerCase().includes('café')) ||
                            (service.name && service.name.toLowerCase().includes('cafe'))) {
                            cafeRevenue += itemTotal;
                        } else {
                            otherServiceRevenue += itemTotal;
                        }
                    } else {
                        otherServiceRevenue += itemTotal;
                    }
                });
            }
        });

        // Tính chi phí
        const expenseTransactions = await Transaction.find({
            hotelId: hotelId,
            type: 'expense',
            status: 'completed',
            createdAt: { $gte: start, $lte: end }
        });

        let receiptExpenses = 0; // Tổng phiếu chi (tương tự receiptRevenue)
        let salary = 0;
        let marketing = 0;
        let maintenance = 0;
        let training = 0;
        let utilities = 0;
        let supplies = 0;
        let serviceCost = 0;
        let otherCosts = 0;

        expenseTransactions.forEach(tx => {
            const amount = tx.amount || 0;
            receiptExpenses += amount; // Tổng tất cả phiếu chi
            switch (tx.expenseCategory) {
                case 'utilities':
                    utilities += amount;
                    break;
                case 'salary':
                    salary += amount;
                    break;
                case 'supplies':
                    supplies += amount;
                    break;
                case 'maintenance':
                    maintenance += amount;
                    break;
                case 'marketing':
                    marketing += amount;
                    break;
                case 'other':
                default:
                    if (tx.description && (
                        tx.description.toLowerCase().includes('đào tạo') ||
                        tx.description.toLowerCase().includes('training') ||
                        tx.description.toLowerCase().includes('học')
                    )) {
                        training += amount;
                    } else {
                        otherCosts += amount;
                    }
                    break;
            }
        });

        // Tính chi phí giá vốn dịch vụ
        const { Service } = require('../models/service');
        const soldServices = await ServiceOrder.find({
            hotelId: hotelId,
            status: { $in: ['delivered'] },
            paymentStatus: { $in: ['paid', 'included_in_room_charge'] },
            orderTime: { $gte: start, $lte: end }
        }).populate('items.serviceId');

        soldServices.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    if (item.serviceId && typeof item.serviceId === 'object' && item.serviceId.costPrice) {
                        const quantity = item.quantity || 1;
                        serviceCost += (item.serviceId.costPrice * quantity);
                    }
                });
            }
        });

        // Tính doanh thu từ phiếu thu từ shift-handover-history
        const shiftHandoversForExcel = await ShiftHandover.find({
            hotelId: hotelId,
            handoverTime: { $gte: start, $lte: end }
        });

        let receiptRevenue = 0;
        shiftHandoversForExcel.forEach(record => {
            receiptRevenue += (record.incomeAmount || 0);
        });
        allIncomeTransactions.forEach(tx => {
            const incomeCat = tx.incomeCategory;
            const amount = tx.amount || 0;
            
            // Chỉ tính các phiếu thu KHÔNG phải từ phòng hoặc dịch vụ
            // Bao gồm: null, undefined, 'deposit', 'penalty', 'other', hoặc bất kỳ giá trị nào khác 'room' và 'service'
            // Loại bỏ 'room', 'rental', và 'service' (đã được tính riêng)
            if (!incomeCat || (incomeCat !== 'room' && incomeCat !== 'rental' && incomeCat !== 'service')) {
                receiptRevenue += amount;
            }
        });

        // Doanh thu khác (không cần query riêng nữa vì đã gộp vào receiptRevenue)
        let otherRevenue = 0;

        // Tính toán các giá trị cơ bản
        const totalRevenue = roomRevenue + cafeRevenue + otherServiceRevenue + receiptRevenue + otherRevenue;
        
        // Tính doanh thu năm (từ dữ liệu thực tế)
        const roomRevenueYearly = daysDiff > 0 ? (roomRevenue / daysDiff) * 365 : 0;
        const cafeRevenueYearly = daysDiff > 0 ? (cafeRevenue / daysDiff) * 365 : 0;
        const receiptRevenueYearly = daysDiff > 0 ? (receiptRevenue / daysDiff) * 365 : 0;
        const totalRevenueYearly = roomRevenueYearly + cafeRevenueYearly + receiptRevenueYearly;
        
        // Tính công suất phòng (giả sử 70% nếu không có dữ liệu)
        const roomOccupancyRate = 0.70; // 70%
        
        // Tính doanh thu phòng năm với công suất
        const roomRevenueYearlyWithOccupancy = roomRevenueYearly * roomOccupancyRate;
        
        // Tính các chi phí theo % doanh thu (nếu chưa có dữ liệu)
        const marketingPercent = marketing > 0 ? marketing / totalRevenue : 0.15; // 15% mặc định
        const maintenancePercent = maintenance > 0 ? maintenance / totalRevenue : 0.03; // 3% mặc định
        const trainingPercent = training > 0 ? training / totalRevenue : 0.01; // 1% mặc định
        const utilitiesPercent = utilities > 0 ? utilities / totalRevenue : 0.03; // 3% mặc định
        const insurancePercent = 0.02; // 2% bảo hiểm công trình
        const serviceCostPercent = serviceCost > 0 && cafeRevenue > 0 ? serviceCost / cafeRevenue : 0.30; // 30% giá vốn café
        
        // Tính chi phí năm
        const salaryYearly = daysDiff > 0 ? (salary / daysDiff) * 365 : 0;
        const marketingYearly = totalRevenueYearly * marketingPercent;
        const maintenanceYearly = totalRevenueYearly * maintenancePercent;
        const trainingYearly = totalRevenueYearly * trainingPercent;
        const utilitiesYearly = totalRevenueYearly * utilitiesPercent;
        const insuranceYearly = totalRevenueYearly * insurancePercent;
        const serviceCostYearly = cafeRevenueYearly * serviceCostPercent;
        
        // Khấu hao: theo % mỗi năm của tổng đầu tư
        const depreciationYearly = initialInvestment * (depreciationRate / 100) / 1000000; // triệu đồng
        
        // Tính toán vay nợ
        const loanAmount = initialInvestment * (loanPercentage / 100);
        const loanAmountTr = loanAmount / 1000000; // triệu đồng
        const principalPaymentYearly = loanAmount / 7 / 1000000; // Trả trong 7 năm
        
        // Tạo workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Báo cáo tài chính');

        // ============ THÔNG SỐ DỰ ÁN ============
        worksheet.mergeCells('A1:Z1');
        worksheet.getCell('A1').value = `BÁO CÁO TÀI CHÍNH TỔNG HỢP KHÁCH SẠN ${hotel.name.toUpperCase()}`; 
        worksheet.getCell('A1').font = { bold: true, size: 14 };
        worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.getCell('A2').value = 'THÔNG SỐ DỰ ÁN';
        worksheet.getCell('A2').font = { bold: true };

        // Tổng mức đầu tư
        const totalInvestmentTr = initialInvestment / 1000000;
        worksheet.getCell('A4').value = 'Tổng mức đầu tư';
        worksheet.getCell('B4').value = totalInvestmentTr;
        worksheet.getCell('C4').value = 'trđ';
        worksheet.getCell('D4').value = '100%';

        // Tiền đất (69%)
        const landCost = totalInvestmentTr * 0.69;
        worksheet.getCell('A5').value = 'Tiền đất';
        worksheet.getCell('B5').value = landCost;
        worksheet.getCell('C5').value = '69%';
        worksheet.getCell('D5').value = 'trđ';

        // Tiền xây (21%)
        const constructionCost = totalInvestmentTr * 0.21;
        worksheet.getCell('A6').value = 'tiền xây';
        worksheet.getCell('B6').value = constructionCost;
        worksheet.getCell('C6').value = '21%';
        worksheet.getCell('D6').value = 'trđ';
        worksheet.getCell('E6').value = '10tr/m2 xây';
        worksheet.getCell('F6').value = constructionCost / 10; // m2
        worksheet.getCell('G6').value = 'm2';
        worksheet.getCell('H6').value = totalRooms;
        worksheet.getCell('I6').value = 'phòng';

        // Tiền trang thiết bị (10%)
        const equipmentCost = totalInvestmentTr * 0.10;
        worksheet.getCell('A7').value = 'Tiền trang thiết bị';
        worksheet.getCell('B7').value = equipmentCost;
        worksheet.getCell('C7').value = '10%';
        worksheet.getCell('D7').value = 'trđ';

        // Cơ cấu vốn
        worksheet.getCell('A8').value = 'Cơ cấu vốn';
        worksheet.getCell('A8').font = { bold: true };

        worksheet.getCell('A9').value = 'Vay';
        worksheet.getCell('B9').value = loanAmountTr;
        worksheet.getCell('C9').value = '70%';
        worksheet.getCell('D9').value = 'trđ';

        const equityAmount = totalInvestmentTr * 0.30;
        worksheet.getCell('A10').value = 'Vốn góp';
        worksheet.getCell('B10').value = equityAmount;
        worksheet.getCell('C10').value = '30%';
        worksheet.getCell('D10').value = 'trđ';

        // Lãi suất
        worksheet.getCell('A11').value = 'Lãi suất kỳ vọng';
        worksheet.getCell('A11').font = { bold: true };
        worksheet.getCell('A12').value = 'Vay';
        worksheet.getCell('B12').value = '8%';
        worksheet.getCell('A13').value = 'Vốn CSH';
        worksheet.getCell('B13').value = '15%';
        worksheet.getCell('A14').value = 'WACC';
        worksheet.getCell('B14').value = '9%';

        // ============ DOANH THU ============
        worksheet.getCell('A16').value = 'Doanh thu';
        worksheet.getCell('A16').font = { bold: true };
        worksheet.getCell('A17').value = 'Doanh thu phòng';
        worksheet.getCell('A17').font = { bold: true };
        worksheet.getCell('A18').value = 'Loại phòng';
        worksheet.getCell('B18').value = 'Để đơn giản lấy 1 loại phòng giá cho thuê 1,5tr/ngày';
        worksheet.getCell('A19').value = 'Đơn giá phòng';
        worksheet.getCell('B19').value = avgRoomPrice / 1000000; // triệu đồng/ngày
        worksheet.getCell('A20').value = 'Số Phòng';
        worksheet.getCell('B20').value = totalRooms;
        worksheet.getCell('C20').value = 'Phòng';
        worksheet.getCell('A21').value = 'Doanh thu phòng ngày';
        worksheet.getCell('B21').value = roomRevenueDaily / 1000000;
        worksheet.getCell('C21').value = 'trđ';
        worksheet.getCell('A22').value = 'Công suất phòng';
        worksheet.getCell('B22').value = roomOccupancyRate * 100;
        worksheet.getCell('C22').value = '%';
        worksheet.getCell('A23').value = 'Doanh thu năm (365 ngày)';
        worksheet.getCell('B23').value = roomRevenueYearlyWithOccupancy / 1000000;
        worksheet.getCell('C23').value = 'trđ';

        // Doanh thu dịch vụ
        worksheet.getCell('A25').value = 'Doanh thu dịch vụ';
        worksheet.getCell('A25').font = { bold: true };
        worksheet.getCell('A26').value = 'Gồm giặt ủi, nhà hàng, café, spa... để đơn giản lấy doanh thu café theo chỗ ngồi';
        worksheet.getCell('A27').value = 'Diện tích quán café';
        worksheet.getCell('B27').value = 100; // Giả định
        worksheet.getCell('C27').value = 'm2';
        worksheet.getCell('A28').value = 'Số chỗ';
        worksheet.getCell('B28').value = 60; // Giả định
        worksheet.getCell('C28').value = 'chỗ';
        worksheet.getCell('A29').value = 'Đơn giá café';
        worksheet.getCell('B29').value = 30; // ngàn đồng/ly
        worksheet.getCell('C29').value = 'ngànđ/ly';
        worksheet.getCell('A30').value = 'Số lượt';
        worksheet.getCell('B30').value = 5;
        worksheet.getCell('C30').value = 'lượt/ngày/chỗ';
        worksheet.getCell('A31').value = 'Doanh thu ngày';
        worksheet.getCell('B31').value = (60 * 30 * 5) / 1000; // triệu đồng
        worksheet.getCell('C31').value = 'tr/ngày';
        worksheet.getCell('A32').value = 'Tỷ lệ lấp đầy';
        worksheet.getCell('B32').value = 50;
        worksheet.getCell('C32').value = '%';
        worksheet.getCell('A33').value = 'Doanh thu năm (365 ngày)';
        worksheet.getCell('B33').value = cafeRevenueYearly / 1000000;
        worksheet.getCell('C33').value = 'trđ';

        worksheet.getCell('A35').value = 'Tốc độ tăng doanh thu';
        worksheet.getCell('B35').value = '10%';
        worksheet.getCell('C35').value = 'năm';

        // ============ CHI PHÍ ============
        worksheet.getCell('A37').value = 'Chi phí';
        worksheet.getCell('A37').font = { bold: true };
        worksheet.getCell('A38').value = 'Chi phí lương';
        worksheet.getCell('A38').font = { bold: true };
        worksheet.getCell('A39').value = 'Chi tiết bảng dưới, tuy nhiên đơn giản ta cho 3 quản lý (lương 20tr/thang) và 20 nhân viên (lương10tr/thang)';
        worksheet.getCell('A40').value = 'Lương quản lý';
        worksheet.getCell('B40').value = (3 * 20 * 12) / 1000000; // 3 quản lý * 20tr/tháng * 12 tháng
        worksheet.getCell('C40').value = 'tr/thang';
        worksheet.getCell('A41').value = 'Lương phục vụ';
        worksheet.getCell('B41').value = (20 * 10 * 12) / 1000000; // 20 nhân viên * 10tr/tháng * 12 tháng
        worksheet.getCell('C41').value = 'tr/thang';
        worksheet.getCell('A42').value = 'Lương năm';
        worksheet.getCell('B42').value = salaryYearly / 1000000;
        worksheet.getCell('C42').value = 'trđ/năm';

        worksheet.getCell('A44').value = 'Chi bán hàng, quảng cáo';
        worksheet.getCell('B44').value = `${(marketingPercent * 100).toFixed(0)}%`;
        worksheet.getCell('C44').value = 'Doanh thu';
        worksheet.getCell('A45').value = 'Chi phí bảo trì';
        worksheet.getCell('B45').value = `${(maintenancePercent * 100).toFixed(0)}%`;
        worksheet.getCell('C45').value = '%DTT';
        worksheet.getCell('A46').value = 'Chi phí đào tạo';
        worksheet.getCell('B46').value = `${(trainingPercent * 100).toFixed(0)}%`;
        worksheet.getCell('C46').value = 'Doanh thu';
        worksheet.getCell('A47').value = 'Chi phí giá vốn (Café)';
        worksheet.getCell('B47').value = `${(serviceCostPercent * 100).toFixed(0)}%`;
        worksheet.getCell('C47').value = 'Doanh thu dịch vụ ngoài';
        worksheet.getCell('A48').value = 'Chi phí hoạt động ks (điện nước, khăn)';
        worksheet.getCell('B48').value = `${(utilitiesPercent * 100).toFixed(0)}%`;
        worksheet.getCell('C48').value = '/DTT';
        worksheet.getCell('A49').value = 'Chi bảo hiểm công trình';
        worksheet.getCell('B49').value = `${(insurancePercent * 100).toFixed(0)}%`;
        worksheet.getCell('C49').value = '/DTT';

        worksheet.getCell('A51').value = 'Tốc độ tăng lương';
        worksheet.getCell('B51').value = '5%';
        worksheet.getCell('C51').value = 'năm';

        // ============ BẢNG TRẢ NỢ ============
        worksheet.getCell('A54').value = 'Bảng trả nợ';
        worksheet.getCell('A54').font = { bold: true };
        worksheet.getCell('A55').value = 'Năm';
        for (let year = 0; year <= 6; year++) {
            worksheet.getCell(String.fromCharCode(66 + year) + '55').value = year;
        }
        
        // Tính toán bảng trả nợ
        let remainingDebt = loanAmountTr;
        const debtData = [];
        
        for (let year = 0; year <= 7; year++) {
            const openingBalance = remainingDebt;
            const principalPayment = year < 7 ? principalPaymentYearly : 0;
            const interestPayment = openingBalance * interestRate;
            const closingBalance = Math.max(0, openingBalance - principalPayment);
            
            debtData.push({
                openingBalance,
                principalPayment,
                interestPayment,
                closingBalance
            });
            
            remainingDebt = closingBalance;
        }
        
        // Ghi dữ liệu vào worksheet
        worksheet.getCell('A56').value = 'Dư nợ đầu kỳ';
        worksheet.getCell('A57').value = 'trả gốc';
        worksheet.getCell('A58').value = 'trả lãi';
        worksheet.getCell('A59').value = 'Dư nợ cuối kỳ';
        
        for (let year = 0; year <= 6; year++) {
            const col = String.fromCharCode(66 + year);
            const data = debtData[year];
            worksheet.getCell(col + '56').value = data.openingBalance;
            worksheet.getCell(col + '57').value = data.principalPayment;
            worksheet.getCell(col + '58').value = data.interestPayment;
            worksheet.getCell(col + '59').value = data.closingBalance;
        }

        // ============ BẢNG DOANH THU - CHI PHÍ - LỢI NHUẬN ============
        worksheet.getCell('A61').value = 'Doanh thu - chi phí - lợi nhuận';
        worksheet.getCell('A61').font = { bold: true };

        // Header năm
        worksheet.getCell('A62').value = 'Năm';
        for (let year = 0; year <= projectionYears; year++) {
            worksheet.getCell(String.fromCharCode(66 + year) + '62').value = year;
        }

        // Tính toán cho từng năm
        let currentDebt = loanAmountTr;
        // taxRate, interestRate, wacc đã được khai báo ở trên

        for (let year = 0; year <= projectionYears; year++) {
            const col = String.fromCharCode(66 + year);
            
            // Doanh thu (tăng 10% mỗi năm)
            const yearRevenue = totalRevenueYearly * Math.pow(1.1, year) / 1000000;
            if (year === 0) worksheet.getCell('A63').value = 'Doanh thu';
            worksheet.getCell(col + '63').value = yearRevenue;
            
            // Doanh thu phòng
            const yearRoomRevenue = roomRevenueYearlyWithOccupancy * Math.pow(1.1, year) / 1000000;
            if (year === 0) worksheet.getCell('A64').value = 'Doanh thu phòng';
            worksheet.getCell(col + '64').value = yearRoomRevenue;
            
            // Doanh thu café
            const yearCafeRevenue = cafeRevenueYearly * Math.pow(1.1, year) / 1000000;
            if (year === 0) worksheet.getCell('A65').value = 'Doanh thu café';
            worksheet.getCell(col + '65').value = yearCafeRevenue;
            
            // Doanh thu từ phiếu thu
            const yearReceiptRevenue = receiptRevenueYearly * Math.pow(1.1, year) / 1000000;
            if (year === 0) worksheet.getCell('A66').value = 'Doanh thu từ phiếu thu';
            worksheet.getCell(col + '66').value = yearReceiptRevenue;
            
            // Chi phí
            const yearSalary = salaryYearly * Math.pow(1.05, year) / 1000000;
            const yearMarketing = yearRevenue * marketingPercent;
            const yearMaintenance = yearRevenue * maintenancePercent;
            const yearTraining = yearRevenue * trainingPercent;
            const yearServiceCost = yearCafeRevenue * serviceCostPercent;
            const yearUtilities = yearRevenue * utilitiesPercent;
            const yearInsurance = yearRevenue * insurancePercent;
            const yearDepreciation = depreciationYearly;
            const yearInterest = year < 7 ? (currentDebt * interestRate) : 0;
            
            const yearTotalCosts = yearSalary + yearMarketing + yearMaintenance + yearTraining + 
                                 yearServiceCost + yearUtilities + yearInsurance + yearDepreciation + yearInterest;
            
            if (year === 0) worksheet.getCell('A67').value = 'Chi phí';
            worksheet.getCell(col + '67').value = yearTotalCosts;
            
            if (year === 0) worksheet.getCell('A68').value = 'Chi phí lương';
            worksheet.getCell(col + '68').value = yearSalary;
            
            if (year === 0) worksheet.getCell('A69').value = 'Chi bán hàng,quảng cáo';
            worksheet.getCell(col + '69').value = yearMarketing;
            
            if (year === 0) worksheet.getCell('A70').value = 'Chi phí bảo trì';
            worksheet.getCell(col + '70').value = yearMaintenance;
            
            if (year === 0) worksheet.getCell('A71').value = 'Chi phí đào tạo';
            worksheet.getCell(col + '71').value = yearTraining;
            
            if (year === 0) worksheet.getCell('A72').value = 'Chi phí giá vốn (Café)';
            worksheet.getCell(col + '72').value = yearServiceCost;
            
            if (year === 0) worksheet.getCell('A73').value = 'Chi phí hoạt động ks (điện nước, khăn)';
            worksheet.getCell(col + '73').value = yearUtilities;
            
            if (year === 0) worksheet.getCell('A74').value = 'Chi bảo hiểm công trình';
            worksheet.getCell(col + '74').value = yearInsurance;
            
            if (year === 0) worksheet.getCell('A75').value = 'Khấu hao';
            worksheet.getCell(col + '75').value = yearDepreciation;
            
            if (year === 0) worksheet.getCell('A76').value = 'lãi vay';
            worksheet.getCell(col + '76').value = yearInterest;
            
            // LNTT (Lợi nhuận trước thuế)
            const profitBeforeTax = yearRevenue - yearTotalCosts;
            if (year === 0) worksheet.getCell('A77').value = 'LNTT';
            worksheet.getCell(col + '77').value = profitBeforeTax;
            
            // Thuế
            const tax = profitBeforeTax > 0 ? profitBeforeTax * taxRate : 0;
            if (year === 0) worksheet.getCell('A78').value = 'Thuế';
            worksheet.getCell(col + '78').value = tax;
            
            // LNST (Lợi nhuận sau thuế)
            const profitAfterTax = profitBeforeTax - tax;
            if (year === 0) worksheet.getCell('A79').value = 'LNST';
            worksheet.getCell(col + '79').value = profitAfterTax;
            
            // Cập nhật dư nợ cho năm tiếp theo
            if (year < 7) {
                currentDebt -= principalPaymentYearly;
            }
        }

        // ============ FORMATTING ============
        
        // Set column widths
        worksheet.getColumn('A').width = 35;
        worksheet.getColumn('B').width = 15;
        worksheet.getColumn('C').width = 12;
        worksheet.getColumn('D').width = 10;
        worksheet.getColumn('E').width = 12;
        worksheet.getColumn('F').width = 12;
        worksheet.getColumn('G').width = 8;
        worksheet.getColumn('H').width = 10;
        worksheet.getColumn('I').width = 8;
        
        // Set column widths for year columns (B-L)
        for (let i = 1; i <= 11; i++) {
            const col = String.fromCharCode(65 + i); // B to L
            worksheet.getColumn(col).width = 12;
        }
        
        // Format header row (A1)
        worksheet.getRow(1).height = 25;
        worksheet.getCell('A1').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        
        // Format section headers
        const sectionHeaders = [
            { row: 2, text: 'THÔNG SỐ DỰ ÁN' },
            { row: 16, text: 'Doanh thu' },
            { row: 37, text: 'Chi phí' },
            { row: 54, text: 'Bảng trả nợ' },
            { row: 61, text: 'Doanh thu - chi phí - lợi nhuận' }
        ];
        
        sectionHeaders.forEach(section => {
            const cell = worksheet.getCell(`A${section.row}`);
            cell.font = { bold: true, size: 12 };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9E1F2' }
            };
            worksheet.getRow(section.row).height = 20;
        });
        
        // Format table headers (row 62 for revenue-cost-profit table)
        worksheet.getRow(62).height = 20;
        for (let col = 1; col <= 12; col++) {
            const cell = worksheet.getCell(62, col);
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE7E6E6' }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        }
        
        // Format table headers for debt table (row 55)
        worksheet.getRow(55).height = 20;
        for (let col = 1; col <= 8; col++) {
            const cell = worksheet.getCell(55, col);
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE7E6E6' }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        }
        
        // Format number cells and add borders
        for (let row = 4; row <= 79; row++) {
            for (let col = 1; col <= 12; col++) {
                const cell = worksheet.getCell(row, col);
                
                // Format numbers
                if (typeof cell.value === 'number' && cell.value !== 0) {
                    cell.numFmt = '#,##0.00';
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                } else if (typeof cell.value === 'string') {
                    // Align text left
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                }
                
                // Add borders to data rows in tables
                if (row >= 56 && row <= 59 && col <= 8) {
                    // Debt table
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                } else if (row >= 63 && row <= 79 && col <= 12) {
                    // Revenue-cost-profit table
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                }
            }
        }
        
        // Format specific rows with background colors
        const highlightRows = [63, 67, 77, 79]; // Doanh thu, Chi phí, LNTT, LNST
        highlightRows.forEach(rowNum => {
            for (let col = 1; col <= 12; col++) {
                const cell = worksheet.getCell(rowNum, col);
                if (rowNum === 63 || rowNum === 66) {
                    // Revenue and Cost rows - light blue
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFDEEBF7' }
                    };
                    cell.font = { bold: true };
                } else if (rowNum === 76) {
                    // LNTT - light yellow
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFF2CC' }
                    };
                    cell.font = { bold: true };
                } else if (rowNum === 78) {
                    // LNST - light green
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE2EFDA' }
                    };
                    cell.font = { bold: true };
                }
            }
        });
        
        // Format debt table rows
        for (let row = 56; row <= 59; row++) {
            for (let col = 1; col <= 8; col++) {
                const cell = worksheet.getCell(row, col);
                if (row === 56 || row === 59) {
                    // Opening and closing balance - light blue
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFDEEBF7' }
                    };
                    cell.font = { bold: true };
                }
            }
        }
        
        // Format left column (A) for better readability
        for (let row = 4; row <= 78; row++) {
            const cell = worksheet.getCell(row, 1);
            if (cell.value && typeof cell.value === 'string') {
                cell.font = { size: 10 };
            }
        }
        
        // Format percentage cells
        for (let row = 4; row <= 106; row++) {
            for (let col = 1; col <= 12; col++) {
                const cell = worksheet.getCell(row, col);
                if (cell.value && typeof cell.value === 'string' && cell.value.includes('%')) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.font = { bold: true };
                }
            }
        }
        
        // Freeze panes for easier navigation - chỉ freeze cột A, không freeze rows để có thể scroll
        worksheet.views = [
            {
                state: 'frozen',
                xSplit: 1, // Freeze first column only
                ySplit: 0, // Không freeze rows
                topLeftCell: 'B1',
                activeCell: 'B1'
            }
        ];

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="bao-cao-tai-chinh-${hotel.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.xlsx"`);

        // Write to response
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error exporting financial summary to Excel:', error);
        res.status(500).json({ 
            message: 'Lỗi khi xuất báo cáo Excel', 
            error: error.message 
        });
    }
};

