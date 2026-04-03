/**
 * Tuya Client Utility
 * Sử dụng @tuya/tuya-connector-nodejs để kết nối với Tuya Cloud
 * 
 * Cài đặt: npm install @tuya/tuya-connector-nodejs
 */

// TODO: Uncomment sau khi cài đặt package
// const { TuyaContext } = require('@tuya/tuya-connector-nodejs');

// Cấu hình Tuya từ environment variables
const TUYA_CONFIG = {
    accessKey: process.env.TUYA_ACCESS_ID || process.env.TUYA_ACCESS_KEY || 'your_access_key',
    secretKey: process.env.TUYA_ACCESS_SECRET || process.env.TUYA_SECRET_KEY || 'your_secret_key',
    baseUrl: process.env.TUYA_BASE_URL || 'https://openapi.tuyaus.com', // us, eu, cn, in
    region: process.env.TUYA_REGION || 'us'
};

// Khởi tạo Tuya Context (sẽ được khởi tạo khi package được cài đặt)
let tuyaContext = null;

/**
 * Khởi tạo Tuya Context
 */
function initTuyaContext() {
    if (!tuyaContext) {
        try {
            // TODO: Uncomment sau khi cài đặt package
            // const { TuyaContext } = require('@tuya/tuya-connector-nodejs');
            // tuyaContext = new TuyaContext({
            //     baseUrl: TUYA_CONFIG.baseUrl,
            //     accessKey: TUYA_CONFIG.accessKey,
            //     secretKey: TUYA_CONFIG.secretKey,
            // });
            console.log('Tuya Context initialized (mock mode - cần cài đặt @tuya/tuya-connector-nodejs)');
        } catch (error) {
            console.error('Error initializing Tuya Context:', error);
            console.log('Đang chạy ở chế độ mock. Vui lòng cài đặt @tuya/tuya-connector-nodejs');
        }
    }
    return tuyaContext;
}

/**
 * Lấy trạng thái thiết bị từ Tuya Cloud
 * @param {string} deviceId - Device ID từ Tuya Cloud
 * @returns {Promise<{online: boolean, state: boolean}>}
 */
async function getDeviceStatus(deviceId) {
    try {
        const context = initTuyaContext();
        
        if (!context) {
            // Mock mode - trả về dữ liệu giả
            console.log(`[Mock] Getting device status for ${deviceId}`);
            return {
                online: true,
                state: false
            };
        }

        // Gọi Tuya API để lấy thông tin thiết bị
        const response = await context.request({
            method: 'GET',
            path: `/v1.0/devices/${deviceId}/status`
        });

        if (response.success) {
            // Parse trạng thái từ response
            const statuses = response.result || [];
            const switchStatus = statuses.find(s => s.code === 'switch_1' || s.code === 'switch');
            
            return {
                online: true,
                state: switchStatus ? switchStatus.value === true : false
            };
        }

        return {
            online: false,
            state: false
        };
    } catch (error) {
        console.error('Error getting device status from Tuya:', error);
        return {
            online: false,
            state: false
        };
    }
}

/**
 * Điều khiển thiết bị (bật/tắt)
 * @param {string} deviceId - Device ID từ Tuya Cloud
 * @param {boolean} state - true để bật, false để tắt
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function controlDevice(deviceId, state) {
    try {
        const context = initTuyaContext();
        
        if (!context) {
            // Mock mode - trả về thành công
            console.log(`[Mock] Controlling device ${deviceId} to ${state ? 'ON' : 'OFF'}`);
            return {
                success: true,
                message: `Đã ${state ? 'bật' : 'tắt'} thiết bị (mock mode)`
            };
        }

        // Gọi Tuya API để điều khiển thiết bị
        const commands = [{
            code: 'switch_1', // Hoặc 'switch' tùy theo loại thiết bị
            value: state
        }];

        const response = await context.request({
            method: 'POST',
            path: `/v1.0/devices/${deviceId}/commands`,
            body: {
                commands: commands
            }
        });

        if (response.success) {
            return {
                success: true,
                message: `Đã ${state ? 'bật' : 'tắt'} thiết bị thành công`
            };
        }

        return {
            success: false,
            message: response.msg || 'Không thể điều khiển thiết bị'
        };
    } catch (error) {
        console.error('Error controlling device:', error);
        return {
            success: false,
            message: error.message || 'Lỗi khi điều khiển thiết bị'
        };
    }
}

/**
 * Lấy danh sách thiết bị từ Tuya Cloud
 * @param {string} uid - User ID (optional)
 * @returns {Promise<Array>}
 */
async function getDevicesList(uid) {
    try {
        const context = initTuyaContext();
        
        if (!context) {
            // Mock mode
            console.log('[Mock] Getting devices list');
            return [];
        }

        const path = uid 
            ? `/v1.0/users/${uid}/devices`
            : '/v1.0/devices';

        const response = await context.request({
            method: 'GET',
            path: path
        });

        if (response.success) {
            return response.result || [];
        }

        return [];
    } catch (error) {
        console.error('Error getting devices list:', error);
        return [];
    }
}

module.exports = {
    initTuyaContext,
    getDeviceStatus,
    controlDevice,
    getDevicesList,
    TUYA_CONFIG
};

