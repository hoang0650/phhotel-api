const mongoose = require('mongoose');
const { Business } = require('../models/business');
const { Hotel } = require('../models/hotel');
const { Room } = require('../models/rooms');
const { Service } = require('../models/service');
const { Staff } = require('../models/staff');
const { User } = require('../models/users');
require('dotenv').config();

// Kết nối đến MongoDB Atlas sử dụng biến môi trường
const dbConnectionString = process.env.MDB_CONNECT;
mongoose.connect(dbConnectionString)
.then(() => console.log('Đã kết nối đến MongoDB Atlas'))
.catch(err => console.error('Lỗi kết nối MongoDB:', err));

// Mảng dữ liệu mẫu cho các tên khách sạn
const hotelNames = [
    'Khách sạn Hoàng Gia',
    'Khách sạn Phương Nam',
    'Khách sạn Đông Phương',
    'Khách sạn Hải Âu',
    'Khách sạn Thiên Đường',
    'Khách sạn Bình Minh',
    'Khách sạn Hoàng Hôn',
    'Khách sạn Cao Nguyên',
    'Khách sạn Ánh Dương',
    'Khách sạn Biển Xanh'
];

// Mảng loại phòng
const roomTypes = ['Standard', 'Superior', 'Deluxe', 'Suite', 'Family', 'VIP', 'President'];

// Mảng mô tả phòng
const roomDescriptions = [
    'Phòng thoáng mát với view thành phố đẹp',
    'Phòng sang trọng với thiết kế hiện đại',
    'Phòng rộng rãi phù hợp cho gia đình',
    'Phòng hạng sang với đầy đủ tiện nghi cao cấp',
    'Phòng tiêu chuẩn với đầy đủ tiện nghi cơ bản',
    'Phòng có view biển tuyệt đẹp',
    'Phòng thiết kế theo phong cách châu Âu',
    'Phòng cao cấp với không gian thoáng đãng'
];

// Mảng danh mục dịch vụ
const serviceCategories = ['Ẩm thực', 'Đồ uống', 'Tiện nghi', 'Vui chơi', 'Giải trí', 'Spa', 'Vận chuyển'];

// Mảng tên dịch vụ theo danh mục
const serviceNames = {
    'Ẩm thực': [
        'Bữa sáng buffet', 'Món ăn Á', 'Món ăn Âu', 'Set ăn gia đình', 
        'Đồ ăn nhẹ', 'Phở bò', 'Cơm sườn', 'Pizza', 'Mì Ý', 'Sushi'
    ],
    'Đồ uống': [
        'Nước suối', 'Nước ngọt', 'Bia', 'Rượu vang', 'Cocktail', 
        'Nước trái cây', 'Cà phê', 'Trà', 'Sinh tố', 'Nước dừa'
    ],
    'Tiện nghi': [
        'Dịch vụ giặt ủi', 'Xông hơi', 'Đặt hoa tươi', 'Wifi cao cấp', 'Internet nhanh',
        'Đổi ngoại tệ', 'Thu mua vé tour', 'Đặt vé máy bay', 'Tư vấn du lịch', 'Hướng dẫn thành phố'
    ],
    'Spa': [
        'Massage chân', 'Massage toàn thân', 'Spa mặt', 'Đắp mặt nạ dưỡng da', 'Tắm bùn khoáng',
        'Xông hơi thảo dược', 'Tẩy tế bào chết', 'Dịch vụ làm đẹp', 'Chăm sóc móng', 'Chăm sóc tóc'
    ],
    'Vui chơi': [
        'Hồ bơi', 'Tennis', 'Golf mini', 'Phòng tập gym', 'Yoga',
        'Bida', 'Cầu lông', 'Đua xe đạp', 'Trượt ván', 'Leo núi nhân tạo'
    ],
    'Giải trí': [
        'Xem phim', 'Karaoke', 'Đàn Piano', 'Nhạc sống', 'Bar đêm',
        'Câu lạc bộ đêm', 'Show diễn văn hóa', 'Tiệc BBQ', 'Gaming room', 'Thư viện'
    ],
    'Vận chuyển': [
        'Thuê xe máy', 'Thuê ô tô', 'Đưa đón sân bay', 'Tour du lịch', 'Xe bus miễn phí',
        'Xe đạp', 'Dịch vụ lái xe', 'Đặt taxi', 'Thuê thuyền', 'Thuê xe đạp'
    ]
};

// Mảng tên công ty
const businessNames = [
    'Công ty Du lịch Việt Nam',
    'Tập đoàn Khách sạn Sun',
    'Công ty Dịch vụ Lưu trú Sao Việt',
    'Tập đoàn Thương mại Phương Đông',
    'Công ty TNHH Du lịch Quốc tế'
];

// Mảng địa chỉ
const addresses = [
    'Số 123 Đường Nguyễn Huệ, Quận 1, TP.HCM',
    'Số 456 Đường Lê Lợi, Quận 3, TP.HCM',
    'Số 789 Đường Trần Phú, Quận Hải Châu, Đà Nẵng',
    'Số 246 Đường Hùng Vương, Quận Hoàn Kiếm, Hà Nội',
    'Số 135 Đường Trường Sa, Phường 2, Vũng Tàu',
    'Số 579 Đường Lý Thường Kiệt, Quận Tân Bình, TP.HCM',
    'Số 862 Đường Nguyễn Trãi, Quận Thanh Xuân, Hà Nội',
    'Số 333 Đường Cách Mạng Tháng 8, Nha Trang, Khánh Hòa',
    'Số 444 Đường Phan Chu Trinh, Huế, Thừa Thiên Huế',
    'Số 777 Đường 30/4, Cần Thơ'
];

// Mảng chức vụ nhân viên
const staffPositions = ['manager', 'receptionist', 'housekeeper', 'maintenance', 'other'];

// Mảng trạng thái business
const businessStatuses = ['active', 'pending', 'reject', 'block', 'unactive'];

// Tạo dữ liệu giả cho business (5 doanh nghiệp)
async function createBusinesses() {
    try {
        await Business.deleteMany({});
        const users = await User.find({}).limit(5);
        
        if (users.length === 0) {
            console.log('Không tìm thấy user nào. Vui lòng tạo user trước.');
            return [];
        }
        
        const businesses = [];
        
        for (let i = 0; i < 5; i++) {
            const business = new Business({
                name: businessNames[i],
                address: addresses[i],
                tax_code: 1000000000 + Math.floor(Math.random() * 9000000000),
                contact: {
                    phone: `098${Math.floor(1000000 + Math.random() * 9000000)}`,
                    email: `info@${businessNames[i].toLowerCase().replace(/[^\w]/g, '')}.com`
                },
                status: businessStatuses[Math.floor(Math.random() * businessStatuses.length)],
                ownerId: users[i % users.length]._id,
                hotels: [],
                revenue: {
                    total: Math.floor(Math.random() * 1000000000),
                    history: [
                        {
                            period: 'yearly',
                            startDate: new Date('2023-01-01'),
                            endDate: new Date('2023-12-31'),
                            amount: Math.floor(Math.random() * 1000000000)
                        }
                    ]
                }
            });
            
            await business.save();
            businesses.push(business);
            console.log(`Đã tạo business: ${business.name}`);
        }
        
        return businesses;
    } catch (error) {
        console.error('Lỗi khi tạo businesses:', error);
        return [];
    }
}

// Tạo dữ liệu giả cho hotel (2 khách sạn cho mỗi doanh nghiệp)
async function createHotels(businesses) {
    try {
        await Hotel.deleteMany({});
        const hotels = [];
        
        for (const business of businesses) {
            for (let i = 0; i < 2; i++) {
                const hotelIndex = businesses.indexOf(business) * 2 + i;
                const hotel = new Hotel({
                    name: hotelNames[hotelIndex],
                    address: addresses[hotelIndex + businesses.length],
                    tax_code: 2000000000 + Math.floor(Math.random() * 9000000000),
                    contact: {
                        phone: `097${Math.floor(1000000 + Math.random() * 9000000)}`,
                        email: `info@${hotelNames[hotelIndex].toLowerCase().replace(/[^\w]/g, '')}.com`
                    },
                    businessId: business._id,
                    rooms: [],
                    staff: [],
                    revenue: {
                        total: Math.floor(Math.random() * 500000000),
                        daily: Math.floor(Math.random() * 5000000),
                        monthly: Math.floor(Math.random() * 150000000),
                        yearly: Math.floor(Math.random() * 500000000),
                        history: [
                            {
                                date: new Date(),
                                amount: Math.floor(Math.random() * 5000000),
                                source: 'room'
                            }
                        ]
                    },
                    occupancyRate: Math.random() * 100
                });
                
                await hotel.save();
                
                // Cập nhật danh sách khách sạn vào business
                business.hotels.push(hotel._id);
                await business.save();
                
                hotels.push(hotel);
                console.log(`Đã tạo hotel: ${hotel.name}`);
            }
        }
        
        return hotels;
    } catch (error) {
        console.error('Lỗi khi tạo hotels:', error);
        return [];
    }
}

// Tạo dữ liệu giả cho staff (5 nhân viên cho mỗi khách sạn)
async function createStaff(hotels) {
    try {
        await Staff.deleteMany({});
        const staffs = [];
        
        for (const hotel of hotels) {
            for (let i = 0; i < 5; i++) {
                const position = staffPositions[i % staffPositions.length];
                const staff = new Staff({
                    hotelId: hotel._id,
                    name: `Nhân viên ${i + 1} - ${hotel.name}`,
                    position: position,
                    contact: {
                        phone: `096${Math.floor(1000000 + Math.random() * 9000000)}`,
                        email: `staff${i + 1}@${hotel.name.toLowerCase().replace(/[^\w]/g, '')}.com`
                    },
                    schedule: [
                        {
                            date: new Date(),
                            shift: ['morning', 'afternoon', 'night', 'full-day'][Math.floor(Math.random() * 4)]
                        }
                    ],
                    permissions: position === 'manager' 
                        ? ['view', 'create', 'edit', 'delete', 'manage_rooms', 'manage_bookings']
                        : position === 'receptionist'
                            ? ['view', 'create', 'edit', 'manage_bookings']
                            : ['view'],
                    salary: {
                        amount: position === 'manager' ? 15000000 : 
                                position === 'receptionist' ? 8000000 : 
                                position === 'housekeeper' ? 6000000 : 7000000,
                        paymentHistory: [
                            {
                                date: new Date(),
                                amount: position === 'manager' ? 15000000 : 
                                        position === 'receptionist' ? 8000000 : 
                                        position === 'housekeeper' ? 6000000 : 7000000
                            }
                        ]
                    }
                });
                
                await staff.save();
                
                // Cập nhật danh sách nhân viên vào hotel
                hotel.staff.push(staff._id);
                await hotel.save();
                
                staffs.push(staff);
                console.log(`Đã tạo staff: ${staff.name}`);
            }
        }
        
        return staffs;
    } catch (error) {
        console.error('Lỗi khi tạo staffs:', error);
        return [];
    }
}

// Tạo dữ liệu giả cho rooms (10 phòng cho mỗi khách sạn)
async function createRooms(hotels) {
    try {
        await Room.deleteMany({});
        const rooms = [];
        
        for (const hotel of hotels) {
            for (let i = 0; i < 10; i++) {
                const floor = Math.floor(i / 2) + 1;
                const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
                const basePrice = 
                    roomType === 'Standard' ? 300000 :
                    roomType === 'Superior' ? 500000 :
                    roomType === 'Deluxe' ? 800000 :
                    roomType === 'Suite' ? 1200000 :
                    roomType === 'Family' ? 1500000 :
                    roomType === 'VIP' ? 2000000 : 3000000;
                
                const hourlyRate = basePrice / 10;
                const dailyRate = basePrice;
                const nightlyRate = basePrice * 0.8;
                
                const room = new Room({
                    hotelId: hotel._id,
                    roomNumber: (floor * 100) + (i % 2) + 1,
                    floor: floor,
                    roomType: roomType,
                    roomStatus: ['available', 'available', 'available', 'occupied', 'maintenance'][Math.floor(Math.random() * 5)],
                    hourlyRate: hourlyRate,
                    dailyRate: dailyRate,
                    nightlyRate: nightlyRate,
                    firstHourRate: hourlyRate,
                    additionalHourRate: hourlyRate * 0.7,
                    maxcount: roomType === 'Family' ? 4 : roomType === 'Suite' || roomType === 'VIP' ? 3 : 2,
                    imageurls: [
                        `https://source.unsplash.com/random/800x600/?hotel,room,${roomType.toLowerCase()}`,
                        `https://source.unsplash.com/random/800x600/?hotel,${roomType.toLowerCase()},bed`
                    ],
                    description: roomDescriptions[Math.floor(Math.random() * roomDescriptions.length)],
                    amenities: ['Tivi', 'Điều hòa', 'Wifi', 'Minibar', 'Bồn tắm'],
                    rateType: ['hourly', 'daily', 'nightly'][Math.floor(Math.random() * 3)]
                });
                
                await room.save();
                
                // Cập nhật danh sách phòng vào hotel
                hotel.rooms.push(room._id);
                await hotel.save();
                
                rooms.push(room);
                console.log(`Đã tạo room: ${room.roomNumber} - ${hotel.name}`);
            }
        }
        
        return rooms;
    } catch (error) {
        console.error('Lỗi khi tạo rooms:', error);
        return [];
    }
}

// Tạo dữ liệu giả cho services (5 dịch vụ cho mỗi khách sạn)
async function createServices(hotels) {
    try {
        await Service.deleteMany({});
        const services = [];
        
        for (const hotel of hotels) {
            // Chọn 3 danh mục ngẫu nhiên
            const selectedCategories = [];
            while (selectedCategories.length < 3) {
                const randomCategory = serviceCategories[Math.floor(Math.random() * serviceCategories.length)];
                if (!selectedCategories.includes(randomCategory)) {
                    selectedCategories.push(randomCategory);
                }
            }
            
            // Tạo 2 dịch vụ cho mỗi danh mục đã chọn
            for (const category of selectedCategories) {
                for (let i = 0; i < 2; i++) {
                    const serviceNameArray = serviceNames[category];
                    let serviceName;
                    
                    // Đảm bảo không trùng tên dịch vụ
                    do {
                        serviceName = serviceNameArray[Math.floor(Math.random() * serviceNameArray.length)];
                    } while (services.some(s => s.name === serviceName && s.hotelId.toString() === hotel._id.toString()));
                    
                    const price = Math.floor(Math.random() * 500000) + 50000;
                    
                    const service = new Service({
                        name: serviceName,
                        description: `Dịch vụ ${category} chất lượng cao tại ${hotel.name}`,
                        price: price,
                        category: category,
                        hotelId: hotel._id,
                        image: `https://source.unsplash.com/random/800x600/?${category.toLowerCase()},service`,
                        isAvailable: Math.random() > 0.1 // 90% khả năng là available
                    });
                    
                    await service.save();
                    services.push(service);
                    console.log(`Đã tạo service: ${service.name} - ${hotel.name}`);
                }
            }
        }
        
        return services;
    } catch (error) {
        console.error('Lỗi khi tạo services:', error);
        return [];
    }
}

// Hàm gán các dịch vụ cho phòng
async function assignServicesToRooms(services, rooms) {
    try {
        for (const room of rooms) {
            // Lấy danh sách dịch vụ của khách sạn
            const hotelServices = services.filter(service => service.hotelId.toString() === room.hotelId.toString());
            
            if (hotelServices.length > 0) {
                // Chọn ngẫu nhiên 1-3 dịch vụ
                const numServices = Math.floor(Math.random() * 3) + 1;
                const selectedServices = [];
                
                for (let i = 0; i < numServices && i < hotelServices.length; i++) {
                    const randomIndex = Math.floor(Math.random() * hotelServices.length);
                    const service = hotelServices[randomIndex];
                    
                    if (!selectedServices.includes(service._id)) {
                        selectedServices.push(service._id);
                    }
                }
                
                // Cập nhật phòng với dịch vụ đã chọn
                room.services = selectedServices;
                await room.save();
                console.log(`Đã gán ${selectedServices.length} dịch vụ cho phòng ${room.roomNumber}`);
            }
        }
    } catch (error) {
        console.error('Lỗi khi gán dịch vụ cho phòng:', error);
    }
}

// Hàm chính để tạo toàn bộ dữ liệu mẫu
async function seedDatabase() {
    try {
        // Tạo dữ liệu theo thứ tự phụ thuộc
        const businesses = await createBusinesses();
        const hotels = await createHotels(businesses);
        const staffs = await createStaff(hotels);
        const rooms = await createRooms(hotels);
        const services = await createServices(hotels);
        
        // Gán dịch vụ cho phòng
        await assignServicesToRooms(services, rooms);
        
        console.log('Đã tạo thành công dữ liệu mẫu!');
        console.log(`- ${businesses.length} doanh nghiệp`);
        console.log(`- ${hotels.length} khách sạn`);
        console.log(`- ${staffs.length} nhân viên`);
        console.log(`- ${rooms.length} phòng`);
        console.log(`- ${services.length} dịch vụ`);
        
        // Đóng kết nối
        mongoose.connection.close();
    } catch (error) {
        console.error('Lỗi khi tạo dữ liệu mẫu:', error);
        mongoose.connection.close();
    }
}

// Chạy script
seedDatabase(); 