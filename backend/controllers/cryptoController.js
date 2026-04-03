const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');

// Import models
require('../models/paymentHistory');
require('../models/pricingPackage');
require('../models/users');

// Get models from mongoose
const PaymentHistory = mongoose.model('PaymentHistory');
const PricingPackage = mongoose.model('PricingPackage');
const User = mongoose.model('User');

// Crypto USDT Configuration
const CRYPTO_NETWORKS = {
    TRC20: {
        name: 'TRC20',
        network: 'Tron',
        decimals: 6
    },
    ERC20: {
        name: 'ERC20',
        network: 'Ethereum',
        decimals: 6
    },
    BEP20: {
        name: 'BEP20',
        network: 'Binance Smart Chain',
        decimals: 18
    }
};

/**
 * Tạo địa chỉ ví USDT và thông tin thanh toán
 * POST /crypto/create-payment
 */
exports.createPayment = async (req, res) => {
    try {
        const { packageId, userId, billingType, amount, currency = 'VND', network = 'TRC20' } = req.body;

        console.log('Creating crypto payment with data:', { packageId, userId, billingType, amount, currency, network });

        if (!packageId || !userId || !billingType || !amount) {
            return res.status(400).json({
                error: 'Thiếu thông tin cần thiết',
                required: ['packageId', 'userId', 'billingType', 'amount']
            });
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(packageId)) {
            return res.status(400).json({ error: 'packageId không hợp lệ' });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'userId không hợp lệ' });
        }

        // Kiểm tra models
        if (!PricingPackage || typeof PricingPackage.findById !== 'function') {
            console.error('PricingPackage model error:', typeof PricingPackage, PricingPackage);
            return res.status(500).json({ error: 'Lỗi model PricingPackage' });
        }

        if (!User || typeof User.findById !== 'function') {
            console.error('User model error:', typeof User, User);
            return res.status(500).json({ error: 'Lỗi model User' });
        }

        // Kiểm tra package và user
        console.log('Finding package with ID:', packageId);
        const pkg = await PricingPackage.findById(packageId);
        if (!pkg) {
            return res.status(404).json({ error: 'Không tìm thấy gói dịch vụ' });
        }
        console.log('Package found:', pkg.name);

        console.log('Finding user with ID:', userId);
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }
        console.log('User found:', user.email || user.username);

        // Lấy địa chỉ ví USDT từ environment (hoặc từ database)
        const cryptoAddress = process.env[`CRYPTO_USDT_${network}_ADDRESS`] || process.env.CRYPTO_USDT_ADDRESS;
        if (!cryptoAddress) {
            return res.status(400).json({
                error: 'Chưa cấu hình địa chỉ ví USDT',
                hint: `Cần cấu hình CRYPTO_USDT_${network}_ADDRESS hoặc CRYPTO_USDT_ADDRESS trong environment variables`
            });
        }

        // Chuyển đổi VND sang USDT (tỷ giá có thể lấy từ API hoặc cấu hình)
        const usdtRate = parseFloat(process.env.CRYPTO_USDT_RATE || '27000'); // Mặc định 1 USDT = 25000 VND
        const usdtAmount = (parseFloat(amount) / usdtRate).toFixed(6);

        // Tạo transaction ID
        const transactionId = `CRYPTO_${Date.now()}_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

        // Lưu payment history
        const paymentHistory = new PaymentHistory({
            userId,
            packageId,
            paymentMethod: 'crypto_usdt',
            amount: parseFloat(amount),
            currency,
            status: 'pending',
            transactionId,
            billingType,
            cryptoAddress,
            cryptoNetwork: network,
            cryptoAmount: parseFloat(usdtAmount),
            metadata: {
                usdtRate,
                networkInfo: CRYPTO_NETWORKS[network]
            }
        });
        await paymentHistory.save();

        // Tạo QR code data (có thể dùng thư viện qrcode sau)
        const qrData = {
            address: cryptoAddress,
            amount: usdtAmount,
            network: network,
            memo: transactionId // Memo để tracking
        };

        res.json({
            success: true,
            transactionId,
            cryptoAddress,
            cryptoAmount: usdtAmount,
            cryptoNetwork: network,
            networkInfo: CRYPTO_NETWORKS[network],
            qrData,
            paymentHistoryId: paymentHistory._id,
            instructions: {
                step1: `Chuyển ${usdtAmount} USDT đến địa chỉ: ${cryptoAddress}`,
                step2: `Mạng: ${CRYPTO_NETWORKS[network].name} (${CRYPTO_NETWORKS[network].network})`,
                step3: `Memo/Note: ${transactionId} (Quan trọng: Phải ghi memo này để xác nhận thanh toán)`,
                step4: 'Sau khi chuyển, hệ thống sẽ tự động xác nhận trong vòng 5-15 phút',
                warning: 'Lưu ý: Chỉ chuyển USDT trên mạng đã chọn. Chuyển sai mạng sẽ mất tiền!'
            }
        });
    } catch (error) {
        console.error('Error creating crypto payment:', error);
        res.status(500).json({
            error: 'Lỗi khi tạo thanh toán crypto',
            detail: error.message
        });
    }
};

/**
 * Xác nhận thanh toán crypto (webhook hoặc manual)
 * POST /crypto/verify-payment
 */
exports.verifyPayment = async (req, res) => {
    try {
        const { transactionHash, transactionId, network = 'TRC20' } = req.body;

        if (!transactionHash || !transactionId) {
            return res.status(400).json({
                error: 'Thiếu thông tin cần thiết',
                required: ['transactionHash', 'transactionId']
            });
        }

        // Tìm payment history
        const paymentHistory = await PaymentHistory.findOne({ transactionId });
        if (!paymentHistory) {
            return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
        }

        if (paymentHistory.status === 'completed') {
            return res.json({
                success: true,
                message: 'Giao dịch đã được xác nhận trước đó',
                paymentHistory
            });
        }

        // Verify transaction trên blockchain
        const verificationResult = await verifyBlockchainTransaction(
            transactionHash,
            paymentHistory.cryptoAddress,
            paymentHistory.cryptoAmount,
            network
        );

        // Cập nhật payment history
        paymentHistory.cryptoTransactionHash = transactionHash;
        paymentHistory.metadata = {
            ...paymentHistory.metadata,
            verificationRequested: new Date(),
            network,
            verificationResult
        };

        // Nếu verify thành công, tự động cập nhật status
        if (verificationResult.verified) {
            paymentHistory.status = 'completed';
            paymentHistory.completedAt = new Date();
        } else {
            paymentHistory.status = 'pending'; // Cần admin xác nhận nếu verify thất bại
        }
        
        await paymentHistory.save();

        res.json({
            success: true,
            message: verificationResult.verified 
                ? 'Đã xác nhận thanh toán thành công!' 
                : 'Đã gửi yêu cầu xác nhận. Vui lòng đợi admin xác nhận.',
            verified: verificationResult.verified,
            paymentHistory: {
                id: paymentHistory._id,
                transactionId: paymentHistory.transactionId,
                status: paymentHistory.status,
                amount: paymentHistory.amount,
                cryptoAmount: paymentHistory.cryptoAmount
            },
            verificationDetails: verificationResult
        });
    } catch (error) {
        console.error('Error verifying crypto payment:', error);
        res.status(500).json({
            error: 'Lỗi khi xác nhận thanh toán crypto',
            detail: error.message
        });
    }
};

/**
 * Xác nhận thanh toán crypto (admin)
 * POST /crypto/confirm-payment
 */
exports.confirmPayment = async (req, res) => {
    try {
        const { paymentHistoryId, transactionHash } = req.body;

        if (!paymentHistoryId) {
            return res.status(400).json({ error: 'Thiếu paymentHistoryId' });
        }

        const paymentHistory = await PaymentHistory.findById(paymentHistoryId);
        if (!paymentHistory) {
            return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
        }

        if (paymentHistory.status === 'completed') {
            return res.json({
                success: true,
                message: 'Giao dịch đã được xác nhận trước đó',
                paymentHistory
            });
        }

        // Cập nhật status
        paymentHistory.status = 'completed';
        paymentHistory.cryptoTransactionHash = transactionHash || paymentHistory.cryptoTransactionHash;
        paymentHistory.completedAt = new Date();
        await paymentHistory.save();

        res.json({
            success: true,
            message: 'Đã xác nhận thanh toán thành công',
            paymentHistory
        });
    } catch (error) {
        console.error('Error confirming crypto payment:', error);
        res.status(500).json({
            error: 'Lỗi khi xác nhận thanh toán',
            detail: error.message
        });
    }
};

/**
 * Lấy lịch sử thanh toán crypto
 * GET /crypto/payment-history
 */
exports.getPaymentHistory = async (req, res) => {
    try {
        const { userId, status, network, limit = 50, skip = 0 } = req.query;

        const query = { paymentMethod: 'crypto_usdt' };
        if (userId) {
            query.userId = userId;
        }
        if (status) {
            query.status = status;
        }
        if (network) {
            query.cryptoNetwork = network;
        }

        const payments = await PaymentHistory.find(query)
            .populate('userId', 'username email')
            .populate('packageId', 'name price')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const total = await PaymentHistory.countDocuments(query);

        res.json({
            success: true,
            data: payments,
            total,
            limit: parseInt(limit),
            skip: parseInt(skip)
        });
    } catch (error) {
        console.error('Error getting crypto payment history:', error);
        res.status(500).json({
            error: 'Lỗi khi lấy lịch sử thanh toán crypto',
            detail: error.message
        });
    }
};

/**
 * Verify blockchain transaction
 * @param {string} transactionHash - Transaction hash từ blockchain
 * @param {string} expectedAddress - Địa chỉ ví nhận tiền
 * @param {number} expectedAmount - Số tiền mong đợi (USDT)
 * @param {string} network - Network (TRC20, ERC20, BEP20)
 * @returns {Promise<Object>} Verification result
 */
async function verifyBlockchainTransaction(transactionHash, expectedAddress, expectedAmount, network) {
    try {
        let verificationResult = {
            verified: false,
            message: '',
            details: {}
        };

        switch (network) {
            case 'TRC20':
                verificationResult = await verifyTronTransaction(transactionHash, expectedAddress, expectedAmount);
                break;
            case 'ERC20':
                verificationResult = await verifyEthereumTransaction(transactionHash, expectedAddress, expectedAmount);
                break;
            case 'BEP20':
                verificationResult = await verifyBSCTransaction(transactionHash, expectedAddress, expectedAmount);
                break;
            default:
                verificationResult.message = `Network ${network} không được hỗ trợ`;
        }

        return verificationResult;
    } catch (error) {
        console.error('Error verifying blockchain transaction:', error);
        return {
            verified: false,
            message: 'Lỗi khi verify transaction trên blockchain',
            error: error.message
        };
    }
}

/**
 * Verify Tron (TRC20) transaction
 */
async function verifyTronTransaction(transactionHash, expectedAddress, expectedAmount) {
    try {
        // TronScan API
        const apiKey = process.env.TRONSCAN_API_KEY || '';
        const apiUrl = apiKey 
            ? `https://api.trongrid.io/v1/transactions/${transactionHash}`
            : `https://apilist.tronscan.org/api/transaction-info?hash=${transactionHash}`;

        const response = await axios.get(apiUrl, {
            headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {},
            timeout: 10000
        });

        const data = response.data;
        
        // Kiểm tra transaction có tồn tại không
        if (!data || !data.ret || data.ret[0]?.contractRet !== 'SUCCESS') {
            return {
                verified: false,
                message: 'Transaction không thành công hoặc không tồn tại',
                details: data
            };
        }

        // Tìm USDT contract address (TRC20)
        const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT TRC20 contract
        
        // Kiểm tra contract transfers
        const contract = data.contract?.[0];
        if (contract?.parameter?.value?.contract_address !== usdtContract) {
            return {
                verified: false,
                message: 'Không phải giao dịch USDT TRC20',
                details: data
            };
        }

        // Kiểm tra địa chỉ nhận và số tiền
        const toAddress = contract.parameter?.value?.to_address;
        const amount = contract.parameter?.value?.amount;
        
        // Convert từ sun (1 TRX = 1,000,000 sun) sang USDT (6 decimals)
        const usdtAmount = parseFloat(amount) / 1000000;
        const expectedUsdt = parseFloat(expectedAmount);

        // So sánh địa chỉ (cần convert base58)
        const addressMatch = toAddress && toAddress.toLowerCase() === expectedAddress.toLowerCase();
        const amountMatch = Math.abs(usdtAmount - expectedUsdt) < 0.000001; // Cho phép sai số nhỏ

        if (addressMatch && amountMatch) {
            return {
                verified: true,
                message: 'Transaction đã được xác nhận',
                details: {
                    transactionHash,
                    toAddress,
                    amount: usdtAmount,
                    expectedAmount: expectedUsdt,
                    network: 'TRC20'
                }
            };
        }

        return {
            verified: false,
            message: 'Transaction không khớp với thông tin thanh toán',
            details: {
                transactionHash,
                toAddress,
                amount: usdtAmount,
                expectedAddress,
                expectedAmount: expectedUsdt
            }
        };
    } catch (error) {
        console.error('Error verifying Tron transaction:', error.response?.data || error.message);
        return {
            verified: false,
            message: 'Không thể verify transaction trên TronScan',
            error: error.message
        };
    }
}

/**
 * Verify Ethereum (ERC20) transaction
 */
async function verifyEthereumTransaction(transactionHash, expectedAddress, expectedAmount) {
    try {
        const apiKey = process.env.ETHERSCAN_API_KEY || '';
        if (!apiKey) {
            return {
                verified: false,
                message: 'Chưa cấu hình ETHERSCAN_API_KEY. Vui lòng cấu hình để tự động verify.',
                hint: 'Lấy API key tại: https://etherscan.io/apis'
            };
        }

        // Lấy thông tin transaction
        const txUrl = `https://api.etherscan.io/api?module=proxy&action=eth_getTransactionByHash&txhash=${transactionHash}&apikey=${apiKey}`;
        const txResponse = await axios.get(txUrl, { timeout: 10000 });
        
        if (txResponse.data.error) {
            return {
                verified: false,
                message: 'Transaction không tồn tại',
                details: txResponse.data
            };
        }

        const tx = txResponse.data.result;
        if (!tx || !tx.to) {
            return {
                verified: false,
                message: 'Transaction không hợp lệ'
            };
        }

        // Lấy transaction receipt để kiểm tra status
        const receiptUrl = `https://api.etherscan.io/api?module=proxy&action=eth_getTransactionReceipt&txhash=${transactionHash}&apikey=${apiKey}`;
        const receiptResponse = await axios.get(receiptUrl, { timeout: 10000 });
        const receipt = receiptResponse.data.result;

        if (receipt?.status !== '0x1') {
            return {
                verified: false,
                message: 'Transaction thất bại',
                details: receipt
            };
        }

        // Kiểm tra USDT contract (ERC20)
        const usdtContract = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT ERC20
        
        // Lấy logs để tìm Transfer event
        const logs = receipt.logs || [];
        const transferLog = logs.find(log => 
            log.address?.toLowerCase() === usdtContract.toLowerCase() &&
            log.topics?.[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event signature
        );

        if (!transferLog) {
            return {
                verified: false,
                message: 'Không tìm thấy USDT transfer trong transaction'
            };
        }

        // Decode address và amount từ topics và data
        const toAddress = '0x' + transferLog.topics[2].slice(-40);
        const amount = BigInt('0x' + transferLog.data).toString();
        const usdtAmount = parseFloat(amount) / 1000000; // USDT có 6 decimals
        const expectedUsdt = parseFloat(expectedAmount);

        const addressMatch = toAddress.toLowerCase() === expectedAddress.toLowerCase();
        const amountMatch = Math.abs(usdtAmount - expectedUsdt) < 0.000001;

        if (addressMatch && amountMatch) {
            return {
                verified: true,
                message: 'Transaction đã được xác nhận',
                details: {
                    transactionHash,
                    toAddress,
                    amount: usdtAmount,
                    expectedAmount: expectedUsdt,
                    network: 'ERC20'
                }
            };
        }

        return {
            verified: false,
            message: 'Transaction không khớp với thông tin thanh toán',
            details: {
                transactionHash,
                toAddress,
                amount: usdtAmount,
                expectedAddress,
                expectedAmount: expectedUsdt
            }
        };
    } catch (error) {
        console.error('Error verifying Ethereum transaction:', error.response?.data || error.message);
        return {
            verified: false,
            message: 'Không thể verify transaction trên Etherscan',
            error: error.message
        };
    }
}

/**
 * Verify BSC (BEP20) transaction
 */
async function verifyBSCTransaction(transactionHash, expectedAddress, expectedAmount) {
    try {
        const apiKey = process.env.BSCSCAN_API_KEY || '';
        if (!apiKey) {
            return {
                verified: false,
                message: 'Chưa cấu hình BSCSCAN_API_KEY. Vui lòng cấu hình để tự động verify.',
                hint: 'Lấy API key tại: https://bscscan.com/apis'
            };
        }

        // Lấy thông tin transaction
        const txUrl = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${transactionHash}&apikey=${apiKey}`;
        const txResponse = await axios.get(txUrl, { timeout: 10000 });
        
        if (txResponse.data.error) {
            return {
                verified: false,
                message: 'Transaction không tồn tại',
                details: txResponse.data
            };
        }

        const tx = txResponse.data.result;
        if (!tx || !tx.to) {
            return {
                verified: false,
                message: 'Transaction không hợp lệ'
            };
        }

        // Lấy transaction receipt
        const receiptUrl = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionReceipt&txhash=${transactionHash}&apikey=${apiKey}`;
        const receiptResponse = await axios.get(receiptUrl, { timeout: 10000 });
        const receipt = receiptResponse.data.result;

        if (receipt?.status !== '0x1') {
            return {
                verified: false,
                message: 'Transaction thất bại',
                details: receipt
            };
        }

        // USDT BEP20 contract
        const usdtContract = '0x55d398326f99059fF775485246999027B3197955'; // USDT BEP20
        
        // Tìm Transfer event
        const logs = receipt.logs || [];
        const transferLog = logs.find(log => 
            log.address?.toLowerCase() === usdtContract.toLowerCase() &&
            log.topics?.[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        );

        if (!transferLog) {
            return {
                verified: false,
                message: 'Không tìm thấy USDT transfer trong transaction'
            };
        }

        // Decode address và amount
        const toAddress = '0x' + transferLog.topics[2].slice(-40);
        const amount = BigInt('0x' + transferLog.data).toString();
        const usdtAmount = parseFloat(amount) / 1000000; // USDT có 6 decimals
        const expectedUsdt = parseFloat(expectedAmount);

        const addressMatch = toAddress.toLowerCase() === expectedAddress.toLowerCase();
        const amountMatch = Math.abs(usdtAmount - expectedUsdt) < 0.000001;

        if (addressMatch && amountMatch) {
            return {
                verified: true,
                message: 'Transaction đã được xác nhận',
                details: {
                    transactionHash,
                    toAddress,
                    amount: usdtAmount,
                    expectedAmount: expectedUsdt,
                    network: 'BEP20'
                }
            };
        }

        return {
            verified: false,
            message: 'Transaction không khớp với thông tin thanh toán',
            details: {
                transactionHash,
                toAddress,
                amount: usdtAmount,
                expectedAddress,
                expectedAmount: expectedUsdt
            }
        };
    } catch (error) {
        console.error('Error verifying BSC transaction:', error.response?.data || error.message);
        return {
            verified: false,
            message: 'Không thể verify transaction trên BSCScan',
            error: error.message
        };
    }
}

/**
 * Webhook để nhận thông báo từ blockchain monitoring service
 * POST /crypto/webhook
 */
exports.handleWebhook = async (req, res) => {
    try {
        const { transactionHash, network, amount, toAddress, status } = req.body;

        if (!transactionHash || !network) {
            return res.status(400).json({
                error: 'Thiếu thông tin cần thiết',
                required: ['transactionHash', 'network']
            });
        }

        // Tìm payment history theo transaction hash
        const paymentHistory = await PaymentHistory.findOne({
            cryptoTransactionHash: transactionHash,
            paymentMethod: 'crypto_usdt',
            status: { $ne: 'completed' }
        });

        if (!paymentHistory) {
            return res.status(404).json({
                error: 'Không tìm thấy payment history cho transaction này'
            });
        }

        // Verify lại transaction
        if (status === 'confirmed' || status === 'success') {
            const verificationResult = await verifyBlockchainTransaction(
                transactionHash,
                paymentHistory.cryptoAddress,
                paymentHistory.cryptoAmount,
                network
            );

            if (verificationResult.verified) {
                paymentHistory.status = 'completed';
                paymentHistory.completedAt = new Date();
                paymentHistory.metadata = {
                    ...paymentHistory.metadata,
                    webhookVerified: true,
                    webhookData: req.body
                };
                await paymentHistory.save();

                // TODO: Trigger subscription activation nếu cần
                return res.json({
                    success: true,
                    message: 'Payment đã được xác nhận qua webhook',
                    paymentHistory
                });
            }
        }

        res.json({
            success: true,
            message: 'Webhook received',
            paymentHistory
        });
    } catch (error) {
        console.error('Error handling crypto webhook:', error);
        res.status(500).json({
            error: 'Lỗi khi xử lý webhook',
            detail: error.message
        });
    }
};

