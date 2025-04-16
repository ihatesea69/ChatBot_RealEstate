# Hướng dẫn sử dụng AWS Cognito Service

Tài liệu này hướng dẫn cách sử dụng dịch vụ xác thực AWS Cognito trong dự án của bạn.

## Cài đặt

Thêm các phụ thuộc cần thiết vào file `package.json`:

```bash
npm install @aws-sdk/client-cognito-identity-provider @aws-sdk/client-secrets-manager --save
```

## Cấu hình

Bạn có thể cấu hình Cognito Service theo hai cách:

### 1. Sử dụng biến môi trường

Tạo file `.env` hoặc cập nhật file `.env` hiện có với các thông số sau:

```
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
USE_AWS_SECRETS=false
```

### 2. Sử dụng AWS Secrets Manager

Nếu bạn muốn lưu trữ cấu hình trong AWS Secrets Manager:

1. Tạo một secret mới trong AWS Secrets Manager với cấu trúc JSON:

```json
{
  "userPoolId": "us-east-1_xxxxxxxxx",
  "clientId": "xxxxxxxxxxxxxxxxxxxx"
}
```

2. Cập nhật biến môi trường:

```
USE_AWS_SECRETS=true
COGNITO_SECRET_NAME=cognito-service-config
```

## Cách sử dụng

### Khởi tạo dịch vụ

```javascript
const cognitoService = require('./cognitoService');

// Khởi tạo dịch vụ (cần gọi trước khi sử dụng)
await cognitoService.initialize();
```

### Đăng ký người dùng mới

```javascript
const signUpResult = await cognitoService.signUp(
  'username',
  'Password123!',
  'user@example.com',
  '+84123456789',  // Tùy chọn
  {
    // Các thuộc tính tùy chỉnh
    'name': 'Nguyen Van A',
    'custom:role': 'user'
  }
);

if (signUpResult.success) {
  console.log('Đăng ký thành công, userSub:', signUpResult.userSub);
  
  // Kiểm tra xem người dùng đã được xác nhận chưa
  if (!signUpResult.userConfirmed) {
    console.log('Người dùng cần xác nhận qua email');
  }
} else {
  console.error('Lỗi đăng ký:', signUpResult.error);
}
```

### Xác nhận đăng ký

```javascript
const confirmResult = await cognitoService.confirmSignUp('username', '123456');

if (confirmResult.success) {
  console.log('Xác nhận đăng ký thành công');
} else {
  console.error('Lỗi xác nhận đăng ký:', confirmResult.error);
}
```

### Đăng nhập

```javascript
const loginResult = await cognitoService.login('username', 'Password123!');

if (loginResult.success) {
  console.log('Đăng nhập thành công');
  
  // Lưu token
  const accessToken = loginResult.accessToken;
  const idToken = loginResult.idToken;
  const refreshToken = loginResult.refreshToken;
  
  // Thời gian hết hạn (giây)
  const expiresIn = loginResult.expiresIn;
} else {
  console.error('Lỗi đăng nhập:', loginResult.error);
}
```

### Làm mới token

```javascript
const refreshResult = await cognitoService.refreshToken(refreshToken);

if (refreshResult.success) {
  console.log('Làm mới token thành công');
  
  // Cập nhật token
  const newAccessToken = refreshResult.accessToken;
  const newIdToken = refreshResult.idToken;
} else {
  console.error('Lỗi làm mới token:', refreshResult.error);
}
```

### Lấy thông tin người dùng

```javascript
const userResult = await cognitoService.getUser(accessToken);

if (userResult.success) {
  console.log('Tên người dùng:', userResult.username);
  console.log('Email:', userResult.attributes.email);
  console.log('Các thuộc tính:', userResult.attributes);
} else {
  console.error('Lỗi lấy thông tin người dùng:', userResult.error);
}
```

### Quên mật khẩu

```javascript
const forgotResult = await cognitoService.forgotPassword('username');

if (forgotResult.success) {
  console.log('Đã gửi mã xác nhận đến email của người dùng');
} else {
  console.error('Lỗi quên mật khẩu:', forgotResult.error);
}
```

### Xác nhận đặt lại mật khẩu

```javascript
const resetResult = await cognitoService.confirmForgotPassword(
  'username',
  '123456',  // Mã xác nhận từ email
  'NewPassword123!'
);

if (resetResult.success) {
  console.log('Đặt lại mật khẩu thành công');
} else {
  console.error('Lỗi đặt lại mật khẩu:', resetResult.error);
}
```

### Gửi lại mã xác nhận

```javascript
const resendResult = await cognitoService.resendConfirmationCode('username');

if (resendResult.success) {
  console.log('Đã gửi lại mã xác nhận');
} else {
  console.error('Lỗi gửi lại mã xác nhận:', resendResult.error);
}
```

### Đăng xuất

```javascript
const signOutResult = await cognitoService.signOut(accessToken);

if (signOutResult.success) {
  console.log('Đăng xuất thành công');
} else {
  console.error('Lỗi đăng xuất:', signOutResult.error);
}
```

## Chức năng quản trị

### Tạo người dùng mới (không cần xác nhận)

```javascript
const createResult = await cognitoService.adminCreateUser(
  'newuser',
  'newuser@example.com',
  {
    'name': 'Nguyen Van B',
    'custom:role': 'admin'
  }
);

if (createResult.success) {
  console.log('Tạo người dùng thành công:', createResult.user);
} else {
  console.error('Lỗi tạo người dùng:', createResult.error);
}
```

### Đặt mật khẩu người dùng

```javascript
const setPasswordResult = await cognitoService.adminSetUserPassword(
  'username',
  'NewPassword123!',
  true  // true = mật khẩu cố định, false = mật khẩu tạm thời
);

if (setPasswordResult.success) {
  console.log('Đặt mật khẩu thành công');
} else {
  console.error('Lỗi đặt mật khẩu:', setPasswordResult.error);
}
```

## Xử lý lỗi phổ biến

- **InvalidParameterException**: Kiểm tra lại các tham số đầu vào
- **UserNotFoundException**: Người dùng không tồn tại
- **UsernameExistsException**: Tên người dùng đã tồn tại
- **NotAuthorizedException**: Thông tin đăng nhập không chính xác hoặc token hết hạn
- **CodeMismatchException**: Mã xác nhận không chính xác
- **ExpiredCodeException**: Mã xác nhận đã hết hạn
- **LimitExceededException**: Vượt quá giới hạn yêu cầu

## Tích hợp với Express.js

Ví dụ tạo route xác thực với Express:

```javascript
const express = require('express');
const cognitoService = require('./cognitoService');
const router = express.Router();

// Khởi tạo dịch vụ
cognitoService.initialize().catch(err => {
  console.error('Lỗi khởi tạo Cognito:', err);
  process.exit(1);
});

// Đăng ký
router.post('/signup', async (req, res) => {
  const { username, password, email, phone, ...attributes } = req.body;
  
  try {
    const result = await cognitoService.signUp(username, password, email, phone, attributes);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Đăng nhập
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await cognitoService.login(username, password);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Xác nhận đăng ký
router.post('/confirm', async (req, res) => {
  const { username, code } = req.body;
  
  try {
    const result = await cognitoService.confirmSignUp(username, code);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Thêm các route khác tương tự...

module.exports = router;
```

## Tạo Middleware Xác thực

```javascript
const cognitoService = require('./cognitoService');

// Middleware xác thực token
const authMiddleware = async (req, res, next) => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Thiếu token xác thực' });
    }

    const token = authHeader.substring(7);
    
    // Kiểm tra token
    const userResult = await cognitoService.getUser(token);
    
    if (!userResult.success) {
      return res.status(401).json({ error: 'Token không hợp lệ' });
    }
    
    // Thêm thông tin người dùng vào request
    req.user = {
      username: userResult.username,
      ...userResult.attributes
    };
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Lỗi xác thực: ' + error.message });
  }
};

module.exports = authMiddleware; 