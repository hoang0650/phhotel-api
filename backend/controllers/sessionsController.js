const { getCache, setCache, generateCacheKey, invalidateHotelCache } = require('../config/cacheHelper');

const SESSION_TTL = 86400;

async function getRoomSessions(req, res) {
    try {
        const { hotelId } = req.query;
        
        if (!hotelId) {
            return res.status(400).json({ message: 'hotelId is required' });
        }
        
        const cacheKey = generateCacheKey('roomSessions', hotelId);
        let sessions = await getCache(cacheKey);
        
        if (!sessions) {
            sessions = {};
        }
        
        console.log(`[Cache HIT] getRoomSessions key: ${cacheKey}`);
        res.status(200).json(sessions);
    } catch (error) {
        console.error('Error getting room sessions:', error);
        res.status(500).json({ message: 'Lỗi khi lấy room sessions', error: error.message });
    }
}

async function saveRoomSessions(req, res) {
    try {
        const { hotelId, sessions } = req.body;
        
        if (!hotelId) {
            return res.status(400).json({ message: 'hotelId is required' });
        }
        
        const cacheKey = generateCacheKey('roomSessions', hotelId);
        await setCache(cacheKey, sessions || {}, SESSION_TTL);
        
        console.log(`[Cache SET] saveRoomSessions key: ${cacheKey}`);
        res.status(200).json({ message: 'Sessions saved successfully' });
    } catch (error) {
        console.error('Error saving room sessions:', error);
        res.status(500).json({ message: 'Lỗi khi lưu room sessions', error: error.message });
    }
}

async function updateRoomSession(req, res) {
    try {
        const { hotelId, roomId, sessionData } = req.body;
        
        if (!hotelId || !roomId) {
            return res.status(400).json({ message: 'hotelId and roomId are required' });
        }
        
        const cacheKey = generateCacheKey('roomSessions', hotelId);
        let sessions = await getCache(cacheKey) || {};
        
        if (sessionData === null) {
            delete sessions[roomId];
        } else {
            sessions[roomId] = sessionData;
        }
        
        await setCache(cacheKey, sessions, SESSION_TTL);
        
        console.log(`[Cache UPDATE] updateRoomSession key: ${cacheKey}, roomId: ${roomId}`);
        res.status(200).json({ message: 'Session updated successfully' });
    } catch (error) {
        console.error('Error updating room session:', error);
        res.status(500).json({ message: 'Lỗi khi cập nhật room session', error: error.message });
    }
}

async function getSelectedHotel(req, res) {
    try {
        const { userId } = req.query;
        
        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }
        
        const cacheKey = generateCacheKey('selectedHotel', userId);
        const selectedHotelId = await getCache(cacheKey);
        
        console.log(`[Cache ${selectedHotelId ? 'HIT' : 'MISS'}] getSelectedHotel key: ${cacheKey}`);
        res.status(200).json({ selectedHotelId: selectedHotelId || null });
    } catch (error) {
        console.error('Error getting selected hotel:', error);
        res.status(500).json({ message: 'Lỗi khi lấy selected hotel', error: error.message });
    }
}

async function saveSelectedHotel(req, res) {
    try {
        const { userId, hotelId } = req.body;
        
        if (!userId || !hotelId) {
            return res.status(400).json({ message: 'userId and hotelId are required' });
        }
        
        const cacheKey = generateCacheKey('selectedHotel', userId);
        await setCache(cacheKey, hotelId, SESSION_TTL);
        
        console.log(`[Cache SET] saveSelectedHotel key: ${cacheKey}, hotelId: ${hotelId}`);
        res.status(200).json({ message: 'Selected hotel saved successfully' });
    } catch (error) {
        console.error('Error saving selected hotel:', error);
        res.status(500).json({ message: 'Lỗi khi lưu selected hotel', error: error.message });
    }
}

async function getRoomTotalPrice(req, res) {
    try {
        const { hotelId, roomId } = req.query;
        
        if (!hotelId || !roomId) {
            return res.status(400).json({ message: 'hotelId and roomId are required' });
        }
        
        const cacheKey = `room_${hotelId}_${roomId}_totalPrice`;
        const totalPrice = await getCache(cacheKey);
        
        console.log(`[Cache ${totalPrice ? 'HIT' : 'MISS'}] getRoomTotalPrice key: ${cacheKey}`);
        res.status(200).json({ totalPrice: totalPrice ? parseInt(totalPrice) : null });
    } catch (error) {
        console.error('Error getting room total price:', error);
        res.status(500).json({ message: 'Lỗi khi lấy room total price', error: error.message });
    }
}

async function saveRoomTotalPrice(req, res) {
    try {
        const { hotelId, roomId, totalPrice } = req.body;
        
        if (!hotelId || !roomId) {
            return res.status(400).json({ message: 'hotelId and roomId are required' });
        }
        
        const cacheKey = `room_${hotelId}_${roomId}_totalPrice`;
        
        if (totalPrice === null || totalPrice === undefined) {
            await invalidateHotelCache(hotelId, cacheKey);
        } else {
            await setCache(cacheKey, totalPrice.toString(), SESSION_TTL);
        }
        
        console.log(`[Cache SET] saveRoomTotalPrice key: ${cacheKey}, totalPrice: ${totalPrice}`);
        res.status(200).json({ message: 'Room total price saved successfully' });
    } catch (error) {
        console.error('Error saving room total price:', error);
        res.status(500).json({ message: 'Lỗi khi lưu room total price', error: error.message });
    }
}

async function getCheckinData(req, res) {
    try {
        const { hotelId, roomId } = req.query;
        
        if (!hotelId || !roomId) {
            return res.status(400).json({ message: 'hotelId and roomId are required' });
        }
        
        const cacheKey = `checkin_${hotelId}_${roomId}`;
        const checkinData = await getCache(cacheKey);
        
        console.log(`[Cache ${checkinData ? 'HIT' : 'MISS'}] getCheckinData key: ${cacheKey}`);
        res.status(200).json({ checkinData: checkinData ? JSON.parse(checkinData) : null });
    } catch (error) {
        console.error('Error getting checkin data:', error);
        res.status(500).json({ message: 'Lỗi khi lấy checkin data', error: error.message });
    }
}

async function saveCheckinData(req, res) {
    try {
        const { hotelId, roomId, checkinData } = req.body;
        
        if (!hotelId || !roomId) {
            return res.status(400).json({ message: 'hotelId and roomId are required' });
        }
        
        const cacheKey = `checkin_${hotelId}_${roomId}`;
        
        if (checkinData === null) {
            await invalidateHotelCache(hotelId, cacheKey);
        } else {
            await setCache(cacheKey, JSON.stringify(checkinData), SESSION_TTL);
        }
        
        console.log(`[Cache SET] saveCheckinData key: ${cacheKey}`);
        res.status(200).json({ message: 'Checkin data saved successfully' });
    } catch (error) {
        console.error('Error saving checkin data:', error);
        res.status(500).json({ message: 'Lỗi khi lưu checkin data', error: error.message });
    }
}

async function getRoomColumnsCount(req, res) {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        const cacheKey = generateCacheKey('roomColumnsCount', userId);
        const columnsCount = await getCache(cacheKey);

        console.log(`[Cache ${columnsCount ? 'HIT' : 'MISS'}] getRoomColumnsCount key: ${cacheKey}`);
        res.status(200).json({ columnsCount: columnsCount ? parseInt(columnsCount) : null });
    } catch (error) {
        console.error('Error getting room columns count:', error);
        res.status(500).json({ message: 'Lỗi khi lấy room columns count', error: error.message });
    }
}

async function saveRoomColumnsCount(req, res) {
    try {
        const { userId, columnsCount } = req.body;

        if (!userId || columnsCount === undefined) {
            return res.status(400).json({ message: 'userId and columnsCount are required' });
        }

        const cacheKey = generateCacheKey('roomColumnsCount', userId);
        await setCache(cacheKey, columnsCount.toString(), SESSION_TTL);

        console.log(`[Cache SET] saveRoomColumnsCount key: ${cacheKey}, columnsCount: ${columnsCount}`);
        res.status(200).json({ message: 'Room columns count saved successfully' });
    } catch (error) {
        console.error('Error saving room columns count:', error);
        res.status(500).json({ message: 'Lỗi khi lưu room columns count', error: error.message });
    }
}

async function getSelectedFloor(req, res) {
    try {
        const { userId, hotelId } = req.query;

        if (!userId || !hotelId) {
            return res.status(400).json({ message: 'userId and hotelId are required' });
        }

        const cacheKey = generateCacheKey(`selectedFloor_${hotelId}`, userId);
        const selectedFloor = await getCache(cacheKey);

        console.log(`[Cache ${selectedFloor ? 'HIT' : 'MISS'}] getSelectedFloor key: ${cacheKey}`);
        res.status(200).json({ selectedFloor: selectedFloor || null });
    } catch (error) {
        console.error('Error getting selected floor:', error);
        res.status(500).json({ message: 'Lỗi khi lấy selected floor', error: error.message });
    }
}

async function saveSelectedFloor(req, res) {
    try {
        const { userId, hotelId, floor } = req.body;

        if (!userId || !hotelId || floor === undefined) {
            return res.status(400).json({ message: 'userId, hotelId and floor are required' });
        }

        const cacheKey = generateCacheKey(`selectedFloor_${hotelId}`, userId);
        await setCache(cacheKey, floor, SESSION_TTL);

        console.log(`[Cache SET] saveSelectedFloor key: ${cacheKey}, floor: ${floor}`);
        res.status(200).json({ message: 'Selected floor saved successfully' });
    } catch (error) {
        console.error('Error saving selected floor:', error);
        res.status(500).json({ message: 'Lỗi khi lưu selected floor', error: error.message });
    }
}

module.exports = {
    getRoomSessions,
    saveRoomSessions,
    updateRoomSession,
    getSelectedHotel,
    saveSelectedHotel,
    getRoomTotalPrice,
    saveRoomTotalPrice,
    getCheckinData,
    saveCheckinData,
    getRoomColumnsCount,
    saveRoomColumnsCount,
    getSelectedFloor,
    saveSelectedFloor
};