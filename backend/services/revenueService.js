const { Transaction } = require('../models/transactions');
const { Hotel } = require('../models/hotel');
const { ServiceOrder } = require('../models/serviceOrder');
const ShiftHandover = require('../models/ShiftHandover');
const { Service } = require('../models/service');

class RevenueService {
  /**
   * Tính toán doanh thu, chi phí và lợi nhuận của khách sạn trong khoảng thời gian
   * @param {String} hotelId - ID khách sạn
   * @param {Date} startDate - Ngày bắt đầu
   * @param {Date} endDate - Ngày kết thúc
   */
  async calculateRevenue(hotelId, startDate, endDate) {
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        // Lấy thông tin khách sạn để tính khấu hao/lãi vay
        const hotel = await Hotel.findById(hotelId);
        if (!hotel) {
            throw new Error('Hotel not found');
        }

        const initialInvestment = hotel.initialInvestment || 0;
        const financialConfig = hotel.financialConfig || {};
        const depreciationRate = financialConfig.depreciationRate !== undefined ? financialConfig.depreciationRate : 10;
        const loanPercentage = financialConfig.loanPercentage !== undefined ? financialConfig.loanPercentage : 70;
        const interestRate = financialConfig.interestRate !== undefined ? financialConfig.interestRate / 100 : 0.08;
        const taxRate = financialConfig.taxRate !== undefined ? financialConfig.taxRate / 100 : 0.20;

        // 1. Doanh thu từ phòng và phiếu thu (ShiftHandover)
        const shiftHandovers = await ShiftHandover.find({
            hotelId: hotelId,
            handoverTime: { $gte: start, $lte: end }
        });

        let roomRevenue = 0;
        let receiptRevenue = 0;
        
        shiftHandovers.forEach(record => {
            roomRevenue += (record.totalRoomRevenue || 0);
            receiptRevenue += (record.incomeAmount || 0);
        });

        // 2. Doanh thu từ dịch vụ (ServiceOrder)
        const allServiceOrders = await ServiceOrder.find({
            hotelId: hotelId,
            $or: [
                { orderTime: { $gte: start, $lte: end } },
                { createdAt: { $gte: start, $lte: end } },
                { deliveryTime: { $gte: start, $lte: end } },
                { updatedAt: { $gte: start, $lte: end } }
            ]
        }).populate('items.serviceId');

        const completedServiceOrders = allServiceOrders.filter(order => {
            return order.totalAmount > 0 || (order.items && order.items.length > 0);
        });

        let serviceRevenue = 0;
        let cafeRevenue = 0;
        let otherServiceRevenue = 0;

        completedServiceOrders.forEach(order => {
            let orderTotal = 0;
            let orderCafeRevenue = 0;
            let orderOtherServiceRevenue = 0;
            
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    let itemTotal = 0;
                    if (item.total) {
                        itemTotal = item.total;
                    } else if (item.price && item.quantity) {
                        itemTotal = (item.price * item.quantity);
                    }
                    orderTotal += itemTotal;
                    
                    if (item.serviceId && typeof item.serviceId === 'object') {
                        const service = item.serviceId;
                        if (service.category === 'beverage' || 
                            (service.name && service.name.toLowerCase().includes('café')) ||
                            (service.name && service.name.toLowerCase().includes('cafe'))) {
                            orderCafeRevenue += itemTotal;
                        } else {
                            orderOtherServiceRevenue += itemTotal;
                        }
                    } else {
                        orderOtherServiceRevenue += itemTotal;
                    }
                });
            } else if (order.totalAmount) {
                orderTotal = order.totalAmount;
                orderOtherServiceRevenue = orderTotal;
            }
            
            serviceRevenue += orderTotal;
            cafeRevenue += orderCafeRevenue;
            otherServiceRevenue += orderOtherServiceRevenue;
        });

        // Điều chỉnh serviceRevenue nếu có sai số làm tròn
        const calculatedServiceRevenue = cafeRevenue + otherServiceRevenue;
        if (Math.abs(serviceRevenue - calculatedServiceRevenue) > 0.01) {
            serviceRevenue = calculatedServiceRevenue;
        }

        let otherRevenue = 0;
        const totalRevenue = roomRevenue + serviceRevenue + receiptRevenue + otherRevenue;

        // 3. Chi phí (Transaction)
        const expenseTransactions = await Transaction.find({
            hotelId: hotelId,
            type: 'expense',
            status: 'completed',
            createdAt: { $gte: start, $lte: end }
        });

        let totalExpenses = 0;
        let utilities = 0;
        let salary = 0;
        let supplies = 0;
        let maintenance = 0;
        let marketing = 0;
        let training = 0;
        let otherCosts = 0;

        expenseTransactions.forEach(tx => {
            const amount = tx.amount || 0;
            totalExpenses += amount;

            switch (tx.expenseCategory) {
                case 'utilities': utilities += amount; break;
                case 'salary': salary += amount; break;
                case 'supplies': supplies += amount; break;
                case 'maintenance': maintenance += amount; break;
                case 'marketing': marketing += amount; break;
                default:
                    if (tx.description && (
                        tx.description.toLowerCase().includes('đào tạo') ||
                        tx.description.toLowerCase().includes('training')
                    )) {
                        training += amount;
                    } else {
                        otherCosts += amount;
                    }
                    break;
            }
        });

        // Tính chi phí giá vốn dịch vụ
        let serviceCost = 0;
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

        // Tính thời gian (ngày/tháng) để tính khấu hao/lãi vay
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const monthsDiff = daysDiff / 30;

        // Khấu hao
        const depreciationYearly = initialInvestment * (depreciationRate / 100);
        const depreciationPeriod = monthsDiff > 0 ? (depreciationYearly / 12) * monthsDiff : 0;

        // Lãi vay
        const loanAmount = initialInvestment * (loanPercentage / 100);
        const interestYearly = loanAmount * interestRate;
        const interestPeriod = monthsDiff > 0 ? (interestYearly / 12) * monthsDiff : 0;

        const totalCosts = totalExpenses + depreciationPeriod + interestPeriod;
        const profitBeforeTax = totalRevenue - totalCosts;
        const tax = profitBeforeTax > 0 ? profitBeforeTax * taxRate : 0;
        const profitAfterTax = profitBeforeTax - tax;

        return {
            roomRevenue,
            serviceRevenue,
            cafeRevenue,
            otherServiceRevenue,
            receiptRevenue,
            totalRevenue,
            totalExpenses, // Chi phí thực tế (tiền mặt/CK)
            depreciationPeriod,
            interestPeriod,
            totalCosts, // Bao gồm khấu hao và lãi vay
            profitBeforeTax,
            tax,
            profitAfterTax,
            breakdown: {
                utilities,
                salary,
                supplies,
                maintenance,
                marketing,
                training,
                otherCosts,
                serviceCost
            },
            startDate,
            endDate
        };

    } catch (error) {
        console.error(`Error calculating revenue for hotel ${hotelId}:`, error);
        throw error;
    }
  }
}

module.exports = new RevenueService();
