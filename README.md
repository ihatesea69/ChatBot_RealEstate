# Dubai Real Estate WhatsApp Chatbot

## Mục Lục
1. [Cài Đặt](#cài-đặt)
2. [Bảo Mật](#bảo-mật)
3. [Xử Lý Giọng Nói](#xử-lý-giọng-nói)
4. [Tối Ưu Hóa Giọng Nói](#tối-ưu-hóa-giọng-nói)
5. [Cấu Hình AWS](#cấu-hình-aws)

## Cài Đặt

### Bước 1: Chuẩn bị Google Cloud Project
1. Tạo Google Cloud Project:
   - Truy cập https://console.cloud.google.com
   - Tạo project mới (ví dụ: "Dubai Real Estate Bot")

2. Bật các API sau:
   - Google Calendar API
   - Google Sheets API
   - Google Drive API

3. Tạo OAuth Credentials:
   - Vào "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Chọn "Desktop app" làm application type
   - Đặt tên (ví dụ: "Dubai Real Estate Bot Desktop Client")
   - Tải xuống file JSON
   - Đổi tên thành `credentials.json` và đặt vào thư mục gốc của dự án

### Bước 2: Thiết lập Google Sheet
1. Tạo Google Spreadsheet mới:
   - Truy cập https://sheets.google.com
   - Tạo sheet mới và đặt tên (ví dụ: "Dubai Real Estate CRM")

2. Tạo 3 sheet con:
   - Sheet "Leads" (A:K):
     - A: Timestamp
     - B: Name
     - C: Phone
     - D: Email
     - E: Budget
     - F: Area
     - G: Property Type
     - H: Timeline
     - I: Notes
     - J: Status
     - K: Meeting Link

   - Sheet "Conversations" (A:D):
     - A: Timestamp
     - B: Phone
     - C: Message
     - D: Sender (User/Bot)

   - Sheet "VoiceMemos" (A:D):
     - A: Timestamp
     - B: Phone
     - C: Transcription
     - D: Audio URL

3. Lấy Spreadsheet ID:
   - Spreadsheet ID nằm trong URL: `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`
   - Sao chép phần [SPREADSHEET_ID] và cập nhật vào file `.env`

### Bước 3: Thiết lập ElevenLabs
1. Tạo tài khoản ElevenLabs:
   - Truy cập https://elevenlabs.io
   - Đăng ký và tạo tài khoản

2. Tạo API Key:
   - Vào "Settings" > "API Key"
   - Tạo API key mới
   - Sao chép và cập nhật vào file `.env`

3. Tạo hoặc chọn Voice ID:
   - Vào "Voice Library"
   - Chọn voice có sẵn hoặc tạo voice mới bằng cách clone
   - Click nút "ID" ở góc dưới phải của voice để lấy Voice ID
   - Sao chép và cập nhật vào file `.env`

### Bước 4: Cập nhật file .env
Tạo file `.env` trong thư mục gốc với nội dung sau:
```
# OpenAI API Key - Lấy từ https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key

# Google Sheet ID - Lấy từ URL của Google Sheet
GOOGLE_SHEET_ID=your_google_sheet_id

# ElevenLabs API Key - Lấy từ https://elevenlabs.io/settings/api
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# ElevenLabs Voice ID - Lấy từ thư viện voice
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id
```

### Bước 5: Chạy ứng dụng
1. Đảm bảo đã cài đặt tất cả các package:
   ```bash
   npm install
   ```

2. Khởi động ứng dụng:
   ```bash
   node index.js
   ```

3. Lần đầu chạy:
   - Quét mã QR hiển thị trong terminal bằng WhatsApp trên điện thoại
   - Trình duyệt sẽ mở để yêu cầu xác thực Google API
   - Đăng nhập và cấp quyền cho ứng dụng
   - File `token.json` sẽ được tạo tự động

## Bảo Mật

### 1. Quản lý API Keys và Credentials
- Sử dụng AWS Secrets Manager hoặc tương đương
- Không bao giờ commit `.env` file vào git
- Sử dụng `.env.example` để hướng dẫn cấu hình

### 2. Phòng Chống Prompt Injection
- Sanitize input: loại bỏ các ký tự đặc biệt
- Giới hạn độ dài tin nhắn
- Kiểm tra các pattern độc hại
- Implement rate limiting

### 3. Bảo Mật Dữ Liệu
- Mã hóa dữ liệu nhạy cảm
- Chỉ lưu trữ dữ liệu cần thiết
- Implement data minimization

### 4. Bảo Mật Infrastructure
- Sử dụng AWS WAF rules
- Implement container security best practices
- Sử dụng non-root user trong container

### 5. Monitoring & Logging
- Implement security logging
- Giám sát các hoạt động đáng ngờ
- Lưu trữ logs an toàn

## Xử Lý Giọng Nói

### Tổng Quan
Chatbot có khả năng:
1. Nhận tin nhắn giọng nói từ người dùng
2. Chuyển đổi giọng nói thành văn bản bằng OpenAI Whisper API
3. Xử lý văn bản bằng ChatGPT và RAG
4. Chuyển đổi văn bản phản hồi thành giọng nói bằng ElevenLabs API
5. Gửi tin nhắn giọng nói lại cho người dùng

### Cách Sử Dụng
1. Gửi tin nhắn giọng nói đến chatbot
2. Chatbot sẽ tự động xử lý và phản hồi bằng giọng nói
3. Tùy chỉnh giọng nói qua Voice ID trong file .env

### Khắc Phục Sự Cố
1. Không gửi được tin nhắn giọng nói:
   - Kiểm tra log để xem lỗi cụ thể
   - Đảm bảo API key ElevenLabs vẫn còn hiệu lực
   - Kiểm tra Voice ID

2. Chất lượng giọng nói kém:
   - Điều chỉnh tham số stability (0.0-1.0)
   - Điều chỉnh tham số similarity_boost (0.0-1.0)

## Tối Ưu Hóa Giọng Nói

### Vấn Đề
- Tin nhắn dài tạo file âm thanh lớn
- Tăng chi phí API của ElevenLabs
- Thời gian xử lý và phản hồi lâu hơn
- Tốn băng thông khi gửi qua WhatsApp

### Giải Pháp
1. Sửa đổi System Prompt:
   - Thêm chỉ dẫn cụ thể cho phản hồi ngắn gọn
   - Giới hạn độ dài tin nhắn voice

2. Tạo Hai Phiên Bản Phản Hồi:
   - Phiên bản đầy đủ gửi dưới dạng text
   - Phiên bản rút gọn để chuyển thành giọng nói

3. Thực Hiện Thay Đổi:
   - Tối ưu hóa tin nhắn cho voice response
   - Gửi phiên bản đầy đủ bằng text nếu cần

### So Sánh Chi Phí
| Phương pháp | Số lượng ký tự | Chi phí trên 1000 tin nhắn |
|-------------|----------------|----------------------------|
| Không tối ưu| ~200 ký tự/tin | ~200,000 ký tự = $20 - $40|
| Có tối ưu   | ~40 ký tự/tin  | ~40,000 ký tự = $4 - $8   |

## Cấu Hình AWS

### 1. Thiết lập IAM
1. Tạo IAM User:
   - Truy cập AWS Console
   - Vào IAM > Users > Add user
   - Chọn "Programmatic access"
   - Tạo group với quyền cần thiết

2. Cấu hình AWS Credentials:
   - Tạo file `.aws/credentials`
   - Thêm thông tin access key và secret key

### 2. Tạo IAM Roles
1. Bedrock Role:
   - Tạo role mới
   - Attach policy cho Bedrock
   - Cấu hình trust relationship

2. Transcribe Role:
   - Tạo role mới
   - Attach policy cho Transcribe
   - Cấu hình trust relationship

### 3. Thiết lập S3
1. Tạo Bucket:
   - Tạo bucket mới
   - Cấu hình CORS
   - Set up lifecycle rules

2. Cấu hình Permissions:
   - Set bucket policy
   - Cấu hình public access

### 4. Testing Access
1. Kiểm tra Bedrock:
   ```bash
   aws bedrock list-foundation-models
   ```

2. Kiểm tra Transcribe:
   ```bash
   aws transcribe list-transcription-jobs
   ```

### 5. AWS Regions
- Sử dụng region phù hợp
- Cấu hình trong file `.env`
- Kiểm tra service availability 