const { Transaction } = require('../models/transactions');
const mongoose = require('mongoose');
const { getCache, setCache, deleteCachePattern, generateCacheKey } = require('../config/cacheHelper');

const TRANSACTION_LIST_TTL = 30;

function normalizeDateParam(value) {
    if (!value) return '';
    try {
        return new Date(value).toISOString();
    } catch (_) {
        return String(value);
    }
}

async function invalidateTransactionCache(hotelId) {
    if (!hotelId) return;
    await Promise.all([
        deleteCachePattern(`transactions:income:${hotelId}:*`),
        deleteCachePattern(`transactions:expense:${hotelId}:*`)
    ]);
}

/**
 * Tạo phiếu chi mới
 * POST /transactions/expense
 */
exports.createExpense = async (req, res) => {
    try {
        const { hotelId, amount, method, expenseCategory, description, notes, recipient } = req.body;
        const userId = req.user?.userId;

        // Validation
        if (!hotelId || !amount || !method) {
            return res.status(400).json({ 
                message: 'hotelId, amount, và method là bắt buộc' 
            });
        }

        if (amount <= 0) {
            return res.status(400).json({ 
                message: 'Số tiền phải lớn hơn 0' 
            });
        }

        // Tạo transaction mới
        const transaction = new Transaction({
            hotelId: new mongoose.Types.ObjectId(hotelId),
            type: 'expense',
            amount: parseFloat(amount),
            method: method,
            expenseCategory: expenseCategory || 'other',
            description: description || '',
            notes: notes || '',
            status: 'completed',
            processedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
            processedAt: new Date(),
            details: {
                recipient: recipient || ''
            },
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await transaction.save();
        await invalidateTransactionCache(hotelId);

        res.status(201).json({
            message: 'Tạo phiếu chi thành công',
            data: transaction
        });

    } catch (error) {
        console.error('Error creating expense:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tạo phiếu chi', 
            error: error.message 
        });
    }
};

/**
 * Lấy danh sách phiếu chi
 * GET /transactions/expense
 */
exports.getExpenses = async (req, res) => {
    try {
        const { hotelId, startDate, endDate, page = 1, limit = 20 } = req.query;

        if (!hotelId) {
            return res.status(400).json({ 
                message: 'hotelId là bắt buộc' 
            });
        }

        const cacheKey = generateCacheKey(
            'transactions:expense',
            String(hotelId),
            normalizeDateParam(startDate),
            normalizeDateParam(endDate),
            String(page),
            String(limit)
        );
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.status(200).json(cached);
        }

        const query = {
            hotelId: new mongoose.Types.ObjectId(hotelId),
            type: 'expense',
            // Chỉ lấy phiếu chi chưa được giao ca (chưa có shiftHandoverId)
            shiftHandoverId: { $exists: false }
        };

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [expenses, totalCount] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Transaction.countDocuments(query)
        ]);

        const payload = {
            message: 'Lấy danh sách phiếu chi thành công',
            data: expenses,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalItems: totalCount,
                itemsPerPage: parseInt(limit)
            }
        };
        await setCache(cacheKey, payload, TRANSACTION_LIST_TTL);
        res.status(200).json(payload);

    } catch (error) {
        console.error('Error getting expenses:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy danh sách phiếu chi', 
            error: error.message 
        });
    }
};

/**
 * Xóa phiếu chi
 * DELETE /transactions/expense/:id
 */
exports.deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        const transaction = await Transaction.findById(id);

        if (!transaction) {
            return res.status(404).json({ 
                message: 'Không tìm thấy phiếu chi' 
            });
        }

        if (transaction.type !== 'expense') {
            return res.status(400).json({ 
                message: 'Giao dịch này không phải là phiếu chi' 
            });
        }

        // Chỉ cho phép xóa nếu chưa được giao ca
        if (transaction.shiftHandoverId) {
            return res.status(400).json({ 
                message: 'Không thể xóa phiếu chi đã được giao ca' 
            });
        }

        await Transaction.findByIdAndDelete(id);
        await invalidateTransactionCache(String(transaction.hotelId));

        res.status(200).json({
            message: 'Xóa phiếu chi thành công'
        });

    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ 
            message: 'Lỗi khi xóa phiếu chi', 
            error: error.message 
        });
    }
};

/**
 * Tạo phiếu thu mới
 * POST /transactions/income
 */
exports.createIncome = async (req, res) => {
    try {
        const { hotelId, amount, method, incomeCategory, description, notes, payer, metadata, invoiceNumber, bookingId, staffId } = req.body;
        const userId = req.user?.userId;

        // Validation
        if (!hotelId || !amount || !method) {
            return res.status(400).json({ 
                message: 'hotelId, amount, và method là bắt buộc' 
            });
        }

        if (amount <= 0) {
            return res.status(400).json({ 
                message: 'Số tiền phải lớn hơn 0' 
            });
        }

        // Map 'rental' thành 'room' nếu cần (hoặc giữ nguyên nếu đã thêm vào enum)
        // Nếu incomeCategory không hợp lệ, mặc định là 'other'
        const validIncomeCategories = ['room', 'rental', 'service', 'deposit', 'penalty', 'other'];
        const finalIncomeCategory = incomeCategory && validIncomeCategories.includes(incomeCategory) 
            ? incomeCategory 
            : 'other';

        // Tạo transaction mới
        const transaction = new Transaction({
            hotelId: new mongoose.Types.ObjectId(hotelId),
            bookingId: bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? new mongoose.Types.ObjectId(bookingId) : undefined,
            staffId: staffId && mongoose.Types.ObjectId.isValid(staffId) ? new mongoose.Types.ObjectId(staffId) : undefined,
            type: 'income',
            amount: parseFloat(amount),
            method: method,
            incomeCategory: finalIncomeCategory,
            description: description || '',
            notes: notes || '',
            invoiceNumber: invoiceNumber || undefined,
            status: 'completed',
            processedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
            processedAt: new Date(),
            details: {
                payer: payer || ''
            },
            metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await transaction.save();
        await invalidateTransactionCache(hotelId);

        res.status(201).json({
            message: 'Tạo phiếu thu thành công',
            data: transaction
        });

    } catch (error) {
        console.error('Error creating income:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tạo phiếu thu', 
            error: error.message 
        });
    }
};

/**
 * Lấy danh sách phiếu thu
 * GET /transactions/income
 */
exports.getIncomes = async (req, res) => {
    try {
        const { hotelId, startDate, endDate, page = 1, limit = 20 } = req.query;

        if (!hotelId) {
            return res.status(400).json({ 
                message: 'hotelId là bắt buộc' 
            });
        }

        const cacheKey = generateCacheKey(
            'transactions:income',
            String(hotelId),
            normalizeDateParam(startDate),
            normalizeDateParam(endDate),
            String(page),
            String(limit)
        );
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.status(200).json(cached);
        }

        const query = {
            hotelId: new mongoose.Types.ObjectId(hotelId),
            type: 'income',
            // Chỉ lấy phiếu thu chưa được giao ca (chưa có shiftHandoverId)
            shiftHandoverId: { $exists: false }
        };

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [incomes, totalCount] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Transaction.countDocuments(query)
        ]);

        const payload = {
            message: 'Lấy danh sách phiếu thu thành công',
            data: incomes,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalItems: totalCount,
                itemsPerPage: parseInt(limit)
            }
        };
        await setCache(cacheKey, payload, TRANSACTION_LIST_TTL);
        res.status(200).json(payload);

    } catch (error) {
        console.error('Error getting incomes:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy danh sách phiếu thu', 
            error: error.message 
        });
    }
};

/**
 * Xóa phiếu thu
 * DELETE /transactions/income/:id
 */
exports.deleteIncome = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        const transaction = await Transaction.findById(id);

        if (!transaction) {
            return res.status(404).json({ 
                message: 'Không tìm thấy phiếu thu' 
            });
        }

        if (transaction.type !== 'income') {
            return res.status(400).json({ 
                message: 'Giao dịch này không phải là phiếu thu' 
            });
        }

        // Chỉ cho phép xóa nếu chưa được giao ca
        if (transaction.shiftHandoverId) {
            return res.status(400).json({ 
                message: 'Không thể xóa phiếu thu đã được giao ca' 
            });
        }

        await Transaction.findByIdAndDelete(id);
        await invalidateTransactionCache(String(transaction.hotelId));

        res.status(200).json({
            message: 'Xóa phiếu thu thành công'
        });

    } catch (error) {
        console.error('Error deleting income:', error);
        res.status(500).json({ 
            message: 'Lỗi khi xóa phiếu thu', 
            error: error.message 
        });
    }
};

