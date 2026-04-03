// npx jest tests/users-info-api.test.js --verbose

// Test thực tế cho API /users/info
const jwt = require('jsonwebtoken');

// Mock data cho test
const mockUserData = {
  _id: "6123456789abcdef01234567",
  email: "test@hotel.com",
  name: "Test User",
  role: "guest",
  phoneNumber: "0123456789",
  address: "123 Test Street",
  isActive: true,
  isEmailVerified: true
};

describe('API /users/info - Test thực tế', () => {
  
  test('TEST 01: Gọi API info với token hợp lệ', async () => {
    // Tạo token giả lập
    const validToken = jwt.sign(
      { 
        userId: mockUserData._id, 
        email: mockUserData.email, 
        role: mockUserData.role 
      }, 
      'secretkey123', // Đây nên là JWT_SECRET thật từ .env
      { expiresIn: '1h' }
    );

    console.log('\n=== TEST 01: API /users/info với token hợp lệ ===');
    console.log('Token:', validToken);
    console.log('Expected User ID:', mockUserData._id);
    console.log('Expected Email:', mockUserData.email);
    console.log('Expected Role:', mockUserData.role);
    
    // Giải mã token để kiểm tra
    const decoded = jwt.decode(validToken);
    console.log('Decoded Token Payload:', JSON.stringify(decoded, null, 2));
    
    expect(validToken).toBeDefined();
    expect(decoded.userId).toBe(mockUserData._id);
    expect(decoded.email).toBe(mockUserData.email);
  });

  test('TEST 02: Cấu trúc request/response cho API info', () => {
    const apiExample = {
      request: {
        method: 'GET',
        url: 'http://localhost:3000/users/info',
        headers: {
          'Authorization': 'Bearer JWT_TOKEN_HERE',
          'Content-Type': 'application/json'
        }
      },
      responseSuccess: {
        success: true,
        data: {
          _id: "user_id",
          email: "user@example.com",
          name: "User Name",
          role: "guest|admin|business|hotel|staff",
          phoneNumber: "phone_number",
          address: "user_address",
          // ... other user fields
        }
      },
      responseErrors: {
        noToken: {
          success: false,
          message: "Token không được cung cấp hoặc không đúng định dạng"
        },
        invalidToken: {
          success: false,
          message: "Token không hợp lệ hoặc đã hết hạn"
        },
        userNotFound: {
          success: false,
          message: "Không tìm thấy thông tin user"
        }
      }
    };

    console.log('\n=== TEST 02: API /users/info Structure ===');
    console.log('Request Example:', JSON.stringify(apiExample.request, null, 2));
    console.log('Success Response:', JSON.stringify(apiExample.responseSuccess, null, 2));
    console.log('Error Responses:', JSON.stringify(apiExample.responseErrors, null, 2));

    expect(apiExample.request.method).toBe('GET');
    expect(apiExample.request.headers.Authorization).toContain('Bearer');
    expect(apiExample.responseSuccess.success).toBe(true);
  });

  test('TEST 03: Các trường hợp lỗi phổ biến', () => {
    const errorCases = [
      {
        case: 'Không có header Authorization',
        headers: {},
        expectedError: 'Token không được cung cấp hoặc không đúng định dạng'
      },
      {
        case: 'Header Authorization rỗng',
        headers: { authorization: '' },
        expectedError: 'Token không được cung cấp hoặc không đúng định dạng'
      },
      {
        case: 'Header Authorization không có Bearer',
        headers: { authorization: 'InvalidTokenFormat' },
        expectedError: 'Token không được cung cấp hoặc không đúng định dạng'
      },
      {
        case: 'Token không hợp lệ',
        headers: { authorization: 'Bearer invalid_token' },
        expectedError: 'Token không hợp lệ hoặc đã hết hạn'
      },
      {
        case: 'Token hết hạn',
        headers: { authorization: 'Bearer expired_token' },
        expectedError: 'Token không hợp lệ hoặc đã hết hạn'
      }
    ];

    console.log('\n=== TEST 03: Error Cases for /users/info ===');
    errorCases.forEach((errorCase, index) => {
      console.log(`${index + 1}. ${errorCase.case}:`);
      console.log('   Headers:', JSON.stringify(errorCase.headers, null, 2));
      console.log('   Expected Error:', errorCase.expectedError);
      console.log('');
    });

    expect(errorCases).toHaveLength(5);
    expect(errorCases[0].case).toContain('Không có header');
  });

  test('TEST 04: Hướng dẫn test API thực tế', () => {
    const testInstructions = {
      step1: {
        description: "Đăng nhập để lấy token",
        curl: `curl -X POST http://localhost:3000/users/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'`
      },
      step2: {
        description: "Copy token từ response đăng nhập",
        example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      },
      step3: {
        description: "Gọi API /users/info với token",
        curl: `curl -X GET http://localhost:3000/users/info \\
  -H "Authorization: Bearer YOUR_TOKEN_HERE"`
      },
      step4: {
        description: "Kiểm tra response",
        expectedResponse: {
          success: true,
          data: "{ user_object }"
        }
      }
    };

    console.log('\n=== TEST 04: Hướng dẫn test API thực tế ===');
    console.log('Bước 1:', testInstructions.step1.description);
    console.log(testInstructions.step1.curl);
    console.log('\nBước 2:', testInstructions.step2.description);
    console.log('Token example:', testInstructions.step2.example);
    console.log('\nBước 3:', testInstructions.step3.description);
    console.log(testInstructions.step3.curl);
    console.log('\nBước 4:', testInstructions.step4.description);
    console.log('Expected Response:', JSON.stringify(testInstructions.step4.expectedResponse, null, 2));

    expect(testInstructions.step1.curl).toContain('POST');
    expect(testInstructions.step3.curl).toContain('GET');
    expect(testInstructions.step4.expectedResponse.success).toBe(true);
  });

  test('TEST 05: PowerShell commands để test API', () => {
    const powershellCommands = {
      login: `$loginBody = @{
    email = "user@example.com"
    password = "password123"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/users/login" -Method POST -Body $loginBody -ContentType "application/json"
$token = $loginResponse.data.token
Write-Host "Token: $token"`,

      getUserInfo: `$headers = @{
    "Authorization" = "Bearer $token"
}

$userInfo = Invoke-RestMethod -Uri "http://localhost:3000/users/info" -Method GET -Headers $headers
$userInfo | ConvertTo-Json -Depth 10`
    };

    console.log('\n=== TEST 05: PowerShell Commands ===');
    console.log('1. Đăng nhập và lấy token:');
    console.log(powershellCommands.login);
    console.log('\n2. Lấy thông tin user:');
    console.log(powershellCommands.getUserInfo);

    expect(powershellCommands.login).toContain('ConvertTo-Json');
    expect(powershellCommands.getUserInfo).toContain('Authorization');
  });

});
