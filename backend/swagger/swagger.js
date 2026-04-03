const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
          title: 'PHHotel API',
          version: '1.0.0',
          description: 'API Documentation for PHHotel Management System',
          contact: {
            name: 'PHHotel Support',
            email: 'support@phhotel.com'
          }
        },
        servers: [
          {
            url: 'http://localhost:3000',
            description: 'Development server'
          },
          {
            url: 'https://nest-production-8106.up.railway.app',
            description: 'Production server'
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT token được lấy từ endpoint /users/login'
            }
          },
          schemas: {
            Hotel: {
              type: 'object',
              properties: {
                _id: {
                  type: 'string',
                  description: 'ID khách sạn'
                },
                name: {
                  type: 'string',
                  description: 'Tên khách sạn'
                },
                businessId: {
                  oneOf: [
                    { type: 'string' },
                    { 
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        status: { type: 'string' }
                      }
                    }
                  ],
                  description: 'ID doanh nghiệp (có thể là string hoặc object populated)'
                },
                address: {
                  type: 'object',
                  properties: {
                    street: { type: 'string' },
                    city: { type: 'string' },
                    state: { type: 'string' },
                    country: { type: 'string' },
                    postalCode: { type: 'string' }
                  }
                },
                contactInfo: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    website: { type: 'string' }
                  }
                },
                status: {
                  type: 'string',
                  enum: ['active', 'inactive', 'maintenance'],
                  description: 'Trạng thái khách sạn'
                },
                managerId: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        username: { type: 'string' },
                        email: { type: 'string' },
                        fullName: { type: 'string' }
                      }
                    }
                  ],
                  description: 'ID quản lý khách sạn'
                },
                starRating: {
                  type: 'number',
                  description: 'Hạng sao khách sạn'
                },
                facilities: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Danh sách tiện ích'
                },
                description: {
                  type: 'string',
                  description: 'Mô tả khách sạn'
                }
              }
            },
            User: {
              type: 'object',
              properties: {
                _id: {
                  type: 'string',
                  description: 'ID người dùng'
                },
                username: {
                  type: 'string',
                  description: 'Tên đăng nhập'
                },
                email: {
                  type: 'string',
                  format: 'email',
                  description: 'Email người dùng'
                },
                role: {
                  type: 'string',
                  enum: ['superadmin', 'admin', 'business', 'hotel', 'staff', 'guest'],
                  description: 'Vai trò người dùng'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'inactive', 'suspended', 'deleted'],
                  description: 'Trạng thái tài khoản'
                },
                businessId: {
                  type: 'string',
                  description: 'ID doanh nghiệp (nếu role là business, hotel, hoặc staff)'
                },
                hotelId: {
                  type: 'string',
                  description: 'ID khách sạn (nếu role là hotel hoặc staff)'
                },
                fullName: {
                  type: 'string',
                  description: 'Họ và tên'
                },
                phone: {
                  type: 'string',
                  description: 'Số điện thoại'
                },
                lastLogin: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Thời gian đăng nhập cuối cùng'
                },
                lastLoginIp: {
                  type: 'string',
                  description: 'Địa chỉ IP lúc đăng nhập cuối cùng'
                },
                createdAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Thời gian tạo tài khoản'
                },
                updatedAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Thời gian cập nhật cuối cùng'
                },
                twoFactorEnabled: {
                  type: 'boolean',
                  description: 'Bật xác thực hai yếu tố'
                },
                pricingPackage: {
                  type: 'string',
                  description: 'ID gói dịch vụ đăng ký'
                },
                packageExpiryDate: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Ngày hết hạn gói dịch vụ'
                },
                billingType: {
                  type: 'string',
                  enum: ['monthly', 'yearly'],
                  description: 'Loại thanh toán (tháng/năm)'
                },
                paymentInfo: {
                  type: 'object',
                  properties: {
                    paymentId: { type: 'string' },
                    paymentMethod: { type: 'string' },
                    paymentDate: { type: 'string', format: 'date-time' }
                  }
                },
                preferences: {
                  type: 'object',
                  properties: {
                    language: { type: 'string' },
                    theme: { type: 'string' },
                    notifications: {
                      type: 'object',
                      properties: {
                        email: { type: 'boolean' },
                        sms: { type: 'boolean' },
                        push: { type: 'boolean' }
                      }
                    }
                  }
                },
                permissions: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['view', 'create', 'edit', 'delete', 'manage_revenue']
                  },
                  description: 'Danh sách quyền hạn'
                }
              }
            },
            Business: {
              type: 'object',
              properties: {
                _id: {
                  type: 'string',
                  description: 'ID doanh nghiệp'
                },
                name: {
                  type: 'string',
                  description: 'Tên doanh nghiệp'
                },
                status: {
                  type: 'string',
                  enum: ['pending', 'active', 'inactive', 'suspended'],
                  description: 'Trạng thái doanh nghiệp'
                },
                ownerId: {
                  type: 'string',
                  description: 'ID chủ sở hữu'
                },
                subscription: {
                  type: 'object',
                  properties: {
                    plan: {
                      type: 'string',
                      enum: ['starter', 'professional', 'vip']
                    },
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time' },
                    paymentStatus: {
                      type: 'string',
                      enum: ['active', 'pending', 'expired']
                    }
                  }
                }
              }
            },
            Room: {
              type: 'object',
              properties: {
                _id: {
                  type: 'string',
                  description: 'ID phòng'
                },
                roomNumber: {
                  type: 'string',
                  description: 'Số phòng'
                },
                hotelId: {
                  type: 'string',
                  description: 'ID khách sạn'
                },
                type: {
                  type: 'string',
                  description: 'Loại phòng'
                },
                status: {
                  type: 'string',
                  enum: ['vacant', 'occupied', 'cleaning', 'dirty', 'maintenance', 'booked'],
                  description: 'Trạng thái phòng'
                },
                floor: {
                  type: 'number',
                  description: 'Tầng'
                },
                pricing: {
                  type: 'object',
                  properties: {
                    hourly: { type: 'number' },
                    daily: { type: 'number' },
                    nightly: { type: 'number' }
                  }
                }
              }
            }
          }
        },
        security: [
          {
            bearerAuth: []
          }
        ],
        tags: [
          { name: 'Users', description: 'Quản lý người dùng và xác thực' },
          { name: 'Hotels', description: 'Quản lý khách sạn' },
          { name: 'Rooms', description: 'Quản lý phòng' },
          { name: 'Business', description: 'Quản lý doanh nghiệp' },
          { name: 'Settings', description: 'Cài đặt hệ thống' },
          { name: 'Bookings', description: 'Quản lý đặt phòng' },
          { name: 'Pricing', description: 'Quản lý gói dịch vụ và thanh toán' }
        ]
      },
      apis: ['./routes/*.js'], // Chỉ định đường dẫn tới các file route của bạn
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

module.exports = {
  swaggerUi,
  swaggerDocs,
};
