// Test case hiển thị cấu trúc dữ liệu tài khoản đăng nhập
// Mô phỏng dữ liệu trả về từ API POST /users/login

const { expect } = require('chai');
const jwt = require('jsonwebtoken');

describe('DEMO: Cấu trúc dữ liệu tài khoản đăng nhập', () => {
  
  it('01. GUEST ACCOUNT - Tài khoản khách', () => {
    const guestLoginResponse = {
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          _id: "6123456789abcdef01234567",
          email: "guest@example.com",
          username: "guest_user",
          fullName: "Nguyễn Văn Khách",
          phone: "0901234567",
          role: "guest",
          avatar: null,
          address: "123 Đường ABC, Quận 1, TP.HCM",
          dateOfBirth: "1990-05-15",
          gender: "male",
          isActive: true,
          isEmailVerified: true,
          loyaltyPoints: 150,
          totalBookings: 3,
          createdAt: "2024-01-15T10:30:00.000Z",
          updatedAt: "2024-05-30T08:15:00.000Z"
        },
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        tokenExpires: "2024-05-31T08:15:00.000Z"
      }
    };

    console.log('\n🏨 GUEST ACCOUNT STRUCTURE:');
    console.log(JSON.stringify(guestLoginResponse, null, 2));
    
    expect(guestLoginResponse.data.user.role).to.equal('guest');
    expect(guestLoginResponse.data.user).to.have.property('loyaltyPoints');
    expect(guestLoginResponse.data.user).to.have.property('totalBookings');
  });

  it('02. ADMIN ACCOUNT - Tài khoản quản trị', () => {
    const adminLoginResponse = {
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          _id: "admin123456789abcdef012345",
          email: "admin@hotelsystem.com",
          username: "admin",
          fullName: "Trần Thị Quản Lý",
          phone: "0912345678",
          role: "admin",
          avatar: "/uploads/avatars/admin.jpg",
          department: "IT Management",
          employeeId: "EMP001",
          permissions: [
            "user_management",
            "hotel_management", 
            "booking_management",
            "financial_reports",
            "system_settings"
          ],
          isActive: true,
          isEmailVerified: true,
          lastLogin: "2024-05-30T08:00:00.000Z",
          createdAt: "2023-01-01T00:00:00.000Z",
          updatedAt: "2024-05-30T08:00:00.000Z"
        },
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        tokenExpires: "2024-05-31T08:00:00.000Z"
      }
    };

    console.log('\n👑 ADMIN ACCOUNT STRUCTURE:');
    console.log(JSON.stringify(adminLoginResponse, null, 2));
    
    expect(adminLoginResponse.data.user.role).to.equal('admin');
    expect(adminLoginResponse.data.user).to.have.property('permissions');
    expect(adminLoginResponse.data.user).to.have.property('employeeId');
  });

  it('03. BUSINESS ACCOUNT - Tài khoản doanh nghiệp', () => {
    const businessLoginResponse = {
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          _id: "biz123456789abcdef0123456",
          email: "business@luxuryhotel.com",
          username: "luxury_hotels",
          fullName: "Công ty TNHH Khách sạn Luxury",
          phone: "0283456789",
          role: "business",
          avatar: "/uploads/business/luxury_logo.jpg",
          businessInfo: {
            companyName: "Luxury Hotels Group",
            taxCode: "0123456789",
            businessLicense: "GP123456",
            address: "456 Đường DEF, Quận 3, TP.HCM",
            website: "https://luxuryhotels.com",
            description: "Chuỗi khách sạn cao cấp hàng đầu Việt Nam"
          },
          subscriptionPlan: "premium",
          totalHotels: 5,
          totalRevenue: 2500000000,
          isActive: true,
          isVerified: true,
          verificationDate: "2024-02-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-05-30T07:45:00.000Z"
        },
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        tokenExpires: "2024-05-31T07:45:00.000Z"
      }
    };

    console.log('\n🏢 BUSINESS ACCOUNT STRUCTURE:');
    console.log(JSON.stringify(businessLoginResponse, null, 2));
    
    expect(businessLoginResponse.data.user.role).to.equal('business');
    expect(businessLoginResponse.data.user).to.have.property('businessInfo');
    expect(businessLoginResponse.data.user).to.have.property('totalHotels');
    expect(businessLoginResponse.data.user).to.have.property('subscriptionPlan');
  });

  it('04. HOTEL ACCOUNT - Tài khoản khách sạn', () => {
    const hotelLoginResponse = {
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          _id: "hotel23456789abcdef0123456",
          email: "manager@grandhotel.com",
          username: "grand_hotel",
          fullName: "Grand Hotel Saigon",
          phone: "0287654321",
          role: "hotel",
          avatar: "/uploads/hotels/grand_hotel.jpg",
          hotelInfo: {
            hotelName: "Grand Hotel Saigon",
            address: "789 Đường GHI, Quận 1, TP.HCM",
            stars: 5,
            totalRooms: 120,
            availableRooms: 45,
            amenities: ["wifi", "pool", "spa", "gym", "restaurant", "bar"],
            checkInTime: "14:00",
            checkOutTime: "12:00"
          },
          businessOwnerId: "biz123456789abcdef0123456",
          isActive: true,
          isVerified: true,
          rating: 4.8,
          totalBookings: 1250,
          monthlyRevenue: 850000000,
          createdAt: "2024-01-15T00:00:00.000Z",
          updatedAt: "2024-05-30T07:30:00.000Z"
        },
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        tokenExpires: "2024-05-31T07:30:00.000Z"
      }
    };

    console.log('\n🏨 HOTEL ACCOUNT STRUCTURE:');
    console.log(JSON.stringify(hotelLoginResponse, null, 2));
    
    expect(hotelLoginResponse.data.user.role).to.equal('hotel');
    expect(hotelLoginResponse.data.user).to.have.property('hotelInfo');
    expect(hotelLoginResponse.data.user).to.have.property('totalBookings');
    expect(hotelLoginResponse.data.user).to.have.property('rating');
  });

  it('05. STAFF ACCOUNT - Tài khoản nhân viên', () => {
    const staffLoginResponse = {
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          _id: "staff3456789abcdef01234567",
          email: "staff@grandhotel.com",
          username: "receptionist_01",
          fullName: "Lê Thị Tiếp Tân",
          phone: "0923456789",
          role: "staff",
          avatar: "/uploads/staff/staff_01.jpg",
          staffInfo: {
            employeeId: "STAFF001",
            position: "Receptionist",
            department: "Front Office",
            shift: "morning",
            salary: 15000000,
            startDate: "2024-03-01",
            supervisor: "Nguyễn Văn Quản Lý"
          },
          hotelId: "hotel23456789abcdef0123456",
          permissions: [
            "booking_check_in",
            "booking_check_out", 
            "room_status_update",
            "guest_services"
          ],
          isActive: true,
          workingDays: 45,
          performance: {
            rating: 4.5,
            customerFeedback: 4.7,
            tasksCompleted: 892
          },
          createdAt: "2024-03-01T00:00:00.000Z",
          updatedAt: "2024-05-30T07:00:00.000Z"
        },
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        tokenExpires: "2024-05-31T07:00:00.000Z"
      }
    };

    console.log('\n👨‍💼 STAFF ACCOUNT STRUCTURE:');
    console.log(JSON.stringify(staffLoginResponse, null, 2));
    
    expect(staffLoginResponse.data.user.role).to.equal('staff');
    expect(staffLoginResponse.data.user).to.have.property('staffInfo');
    expect(staffLoginResponse.data.user).to.have.property('hotelId');
    expect(staffLoginResponse.data.user).to.have.property('performance');
  });

  it('06. JWT TOKEN ANALYSIS - Phân tích cấu trúc JWT', () => {
    // Tạo token mẫu
    const tokenPayload = {
      userId: "6123456789abcdef01234567",
      email: "test@example.com",
      role: "guest",
      username: "test_user",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    const sampleToken = jwt.sign(tokenPayload, 'sample_secret');
    const decodedToken = jwt.decode(sampleToken);

    console.log('\n🔑 JWT TOKEN STRUCTURE:');
    console.log('Sample Token:', sampleToken);
    console.log('Decoded Payload:', JSON.stringify(decodedToken, null, 2));
    
    expect(decodedToken).to.have.property('userId');
    expect(decodedToken).to.have.property('email');
    expect(decodedToken).to.have.property('role');
    expect(decodedToken).to.have.property('iat');
    expect(decodedToken).to.have.property('exp');
  });

  it('07. API ERROR RESPONSES - Cấu trúc lỗi API', () => {
    const errorResponses = {
      invalidCredentials: {
        success: false,
        message: "Email hoặc mật khẩu không đúng",
        error: "INVALID_CREDENTIALS",
        statusCode: 401
      },
      accountInactive: {
        success: false,
        message: "Tài khoản đã bị vô hiệu hóa",
        error: "ACCOUNT_INACTIVE",
        statusCode: 403
      },
      emailNotVerified: {
        success: false,
        message: "Email chưa được xác thực",
        error: "EMAIL_NOT_VERIFIED",
        statusCode: 403
      },
      serverError: {
        success: false,
        message: "Lỗi server nội bộ",
        error: "INTERNAL_SERVER_ERROR",
        statusCode: 500
      }
    };

    console.log('\n❌ API ERROR RESPONSES:');
    console.log(JSON.stringify(errorResponses, null, 2));
    
    expect(errorResponses.invalidCredentials.success).to.be.false;
    expect(errorResponses.accountInactive.statusCode).to.equal(403);
    expect(errorResponses.emailNotVerified.error).to.equal('EMAIL_NOT_VERIFIED');
  });

});

// Hướng dẫn test API thực tế
console.log(`
================================================================
🚀 HƯỚNG DẪN TEST API THỰC TẾ:

1. Start server:
   npm start

2. Test login API với PowerShell:
   
   # Test với tài khoản guest
   $body = @{
     email = "guest@example.com"
     password = "password123"
   } | ConvertTo-Json
   
   Invoke-RestMethod -Uri "http://localhost:3000/users/login" -Method POST -Body $body -ContentType "application/json"

3. Test với curl:
   curl -X POST http://localhost:3000/users/login \\
     -H "Content-Type: application/json" \\
     -d "{\\"email\\":\\"guest@example.com\\",\\"password\\":\\"password123\\"}"

4. Test API /users/info:
   # Lấy token từ login response, sau đó:
   $token = "YOUR_JWT_TOKEN_HERE"
   $headers = @{ Authorization = "Bearer $token" }
   Invoke-RestMethod -Uri "http://localhost:3000/users/info" -Method GET -Headers $headers

================================================================
`);
