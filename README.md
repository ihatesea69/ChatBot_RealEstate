# Hệ thống CRM

Hệ thống quản lý khách hàng (CRM) sử dụng Amazon DynamoDB để lưu trữ dữ liệu thay vì Google Sheets. Hệ thống bao gồm backend API (Express) và frontend (React).

## Tính năng

- **Quản lý khách hàng:** Thêm, sửa, xem thông tin khách hàng
- **Quản lý Leads:** Theo dõi và cập nhật trạng thái leads
- **Cuộc hội thoại:** Xem lịch sử hội thoại với khách hàng
- **Dashboard:** Thống kê tổng quan về khách hàng và leads
- **Xác thực:** Đăng nhập và phân quyền đơn giản

## Yêu cầu hệ thống

- Node.js >= 14.0.0
- AWS DynamoDB (local hoặc cloud)
- Môi trường AWS được cấu hình (credentials)

## Cài đặt

### Backend

1. Di chuyển vào thư mục backend:
```
cd backend
```

2. Cài đặt các dependencies:
```
npm install
```

3. Tạo file .env với nội dung:
```
PORT=5000
AWS_REGION=us-east-1
CRM_TABLE_NAME=Customer
CONVERSATIONS_TABLE_NAME=Conversations
LEADS_TABLE_NAME=Leads
```

4. Khởi động server:
```
npm run dev
```

Server sẽ chạy tại http://localhost:5000

### Frontend

1. Di chuyển vào thư mục frontend:
```
cd frontend
```

2. Cài đặt các dependencies:
```
npm install
```

3. Khởi động ứng dụng:
```
npm start
```

Frontend sẽ chạy tại http://localhost:3000

## Cấu trúc dự án

```
├── backend/            # Backend API
│   ├── db/             # Kết nối cơ sở dữ liệu
│   ├── middleware/     # Middleware (auth, etc.)
│   ├── routes/         # API Routes
│   ├── app.js          # Ứng dụng Express
│   └── package.json
│
└── frontend/           # Frontend React
    ├── public/         # Static files
    └── src/
        ├── components/ # Các component tái sử dụng
        ├── pages/      # Các trang chính
        ├── App.jsx     # Component gốc
        └── index.js    # Entry point
```

## Triển khai

### Chuẩn bị DynamoDB

Tạo các bảng trong DynamoDB:

1. Bảng **Customer**:
   - Khóa chính: `phoneNumber` (String)

2. Bảng **Conversations**:
   - Khóa chính:
     - Partition key: `phoneNumber` (String)
     - Sort key: `timestamp` (Number)

3. Bảng **Leads**:
   - Khóa chính:
     - Partition key: `phoneNumber` (String)
     - Sort key: `timestamp` (Number)

### Triển khai lên AWS

#### Backend

1. Đóng gói ứng dụng:
```
zip -r backend.zip backend
```

2. Tạo một AWS Lambda Function và upload gói zip
3. Đặt handler là `backend/app.handler`
4. Thêm các biến môi trường cần thiết

#### Frontend

1. Build ứng dụng:
```
cd frontend
npm run build
```

2. Deploy thư mục build lên AWS S3 hoặc dịch vụ hosting khác

## Đăng nhập demo

Thông tin đăng nhập mặc định:
- Username: admin
- Password: admin123

## Bản quyền

© 2023 Your Company 