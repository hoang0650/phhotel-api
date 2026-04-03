const revenueService = require('../services/revenueService');
const { Hotel } = require('../models/hotel');
const { Booking } = require('../models/booking');

// Helper to get start/end of day
const getDayRange = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

exports.getSummary = async (req, res) => {
    try {
        const { hotelId } = req.params; // Or req.query if passed as query
        // Frontend calls /revenue/summary or /revenue/hotel/:id/summary?
        // Let's assume /revenue/summary with ?hotelId=... or handled by route param
        
        const targetHotelId = hotelId || req.query.hotelId;
        
        if (!targetHotelId) {
            return res.status(400).json({ message: 'Hotel ID is required' });
        }

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
        
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfYear = new Date(today.getFullYear(), 0, 1);

        // Calculate revenues in parallel
        const [todayData, yesterdayData, weekData, monthData, yearData] = await Promise.all([
            revenueService.calculateRevenue(targetHotelId, getDayRange(today).start, getDayRange(today).end),
            revenueService.calculateRevenue(targetHotelId, getDayRange(yesterday).start, getDayRange(yesterday).end),
            revenueService.calculateRevenue(targetHotelId, startOfWeek, today),
            revenueService.calculateRevenue(targetHotelId, startOfMonth, today),
            revenueService.calculateRevenue(targetHotelId, startOfYear, today)
        ]);
        
        // Count bookings separately as revenueService might not return count
        const totalBookings = await Booking.countDocuments({ hotelId: targetHotelId });
        
        // Construct response matching RevenueSummary interface
        const response = {
            todayRevenue: todayData.totalRevenue || 0,
            yesterdayRevenue: yesterdayData.totalRevenue || 0,
            weeklyRevenue: weekData.totalRevenue || 0,
            monthlyRevenue: monthData.totalRevenue || 0,
            yearlyRevenue: yearData.totalRevenue || 0,
            totalBookings: totalBookings,
            totalGuests: 0, // Placeholder
            averageBookingValue: 0, // Placeholder
            averageOccupancy: 0, // Placeholder
            averageRoomRate: 0, // Placeholder
            revenueGrowth: 0, // Placeholder
            roomRevenue: todayData.roomRevenue || 0,
            serviceRevenue: todayData.serviceRevenue || 0
        };

        res.json(response);

    } catch (error) {
        console.error('getSummary error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getDaily = async (req, res) => {
    try {
        const { hotelId, startDate, endDate } = req.query;
        
        if (!hotelId) return res.status(400).json({ message: 'Hotel ID required' });
        
        const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 7));
        const end = endDate ? new Date(endDate) : new Date();

        const dailyData = [];
        const current = new Date(start);
        
        // Loop through each day (not efficient but reuses existing service)
        // For a proper solution, we should write an aggregation pipeline.
        while (current <= end) {
            const { start: s, end: e } = getDayRange(current);
            const data = await revenueService.calculateRevenue(hotelId, s, e);
            
            dailyData.push({
                period: current.toISOString().split('T')[0],
                revenue: data.totalRevenue || 0,
                bookings: 0, // Need to count bookings per day if needed
                occupancyRate: 0
            });
            
            current.setDate(current.getDate() + 1);
        }

        res.json(dailyData);

    } catch (error) {
        console.error('getDaily error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getMonthly = async (req, res) => {
    try {
        const { hotelId, year } = req.query;
        
        if (!hotelId) return res.status(400).json({ message: 'Hotel ID required' });
        
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        const monthlyData = [];

        for (let month = 0; month < 12; month++) {
            const start = new Date(targetYear, month, 1);
            const end = new Date(targetYear, month + 1, 0, 23, 59, 59, 999);
            
            const data = await revenueService.calculateRevenue(hotelId, start, end);
            
            monthlyData.push({
                period: `${targetYear}-${String(month + 1).padStart(2, '0')}`,
                revenue: data.totalRevenue || 0,
                bookings: 0,
                occupancyRate: 0
            });
        }

        res.json(monthlyData);
    } catch (error) {
        console.error('getMonthly error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * Get room/service revenue within an arbitrary date range
 * Query: hotelId, startDate (yyyy-MM-dd or ISO), endDate (yyyy-MM-dd or ISO)
 * Response: { roomRevenue, serviceRevenue }
 */
exports.getRevenueByRange = async (req, res) => {
    try {
        const { hotelId, startDate, endDate } = req.query;

        if (!hotelId) {
            return res.status(400).json({ message: 'Hotel ID required' });
        }
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'startDate and endDate are required' });
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const data = await revenueService.calculateRevenue(hotelId, start, end);

        res.json({
            roomRevenue: data.roomRevenue || 0,
            serviceRevenue: data.serviceRevenue || 0
        });
    } catch (error) {
        console.error('getRevenueByRange error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
