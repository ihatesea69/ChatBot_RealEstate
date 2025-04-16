# Hướng dẫn Triển khai Chatbot WhatsApp AI BĐS Dubai

Tài liệu này sẽ hướng dẫn bạn triển khai chatbot WhatsApp AI của chúng tôi lên AWS, sử dụng các dịch vụ serverless như Lambda, API Gateway, DynamoDB và Bedrock.

## Yêu cầu

Trước khi bắt đầu, đảm bảo bạn có:

1. Tài khoản AWS với quyền truy cập IAM đầy đủ
2. AWS CLI đã cài đặt và cấu hình với thông tin đăng nhập hợp lệ
3. AWS SAM CLI đã cài đặt
4. Node.js phiên bản 16.x hoặc cao hơn
5. Tài khoản WhatsApp Business API (qua Twilio hoặc nhà cung cấp khác)
6. Tài khoản Google Cloud với Service Account có quyền truy cập Google Calendar API
7. Quyền truy cập Bedrock (cần yêu cầu qua AWS)

## Chuẩn bị Các Secret

Hãy tạo các secret trong AWS Secrets Manager:

### 1. Google Service Account Key

1. Từ Google Cloud Console, tạo một service account mới với quyền truy cập Calendar API
2. Tạo và tải xuống service account key (JSON)
3. Tạo secret trong AWS Secrets Manager:
   ```bash
   aws secretsmanager create-secret \
     --name google-service-account-key \
     --secret-string "$(cat path/to/your/service-account-key.json)"
   ```

### 2. WhatsApp Provider API Key

1. Lấy API key từ nhà cung cấp WhatsApp Business API (ví dụ: Twilio Account SID và Auth Token)
2. Tạo secret trong AWS Secrets Manager:
   ```bash
   aws secretsmanager create-secret \
     --name whatsapp-provider-api-key \
     --secret-string "your-api-key-here"
   ```

### 3. System Prompt

1. Tạo system prompt cho chatbot:
   ```bash
   aws secretsmanager create-secret \
     --name dubai-real-estate-system-prompt \
     --secret-string "You are a friendly and professional real estate assistant in Dubai. Your role is to help clients with their property inquiries.

   Guidelines:
   1. Be concise and clear in your responses
   2. Focus on Dubai real estate market
   3. Provide factual information
   4. Maintain a professional tone
   5. If you don't know something, say so
   6. Always respond in English

   Remember to be helpful and welcoming to new clients."
   ```

## Cài đặt và Build

1. Clone repository:
   ```bash
   git clone <repository-url>
   cd <repository-folder>
   ```

2. Cài đặt dependencies:
   ```bash
   npm install
   ```

3. Cập nhật file `.env.example` thành `.env` và điền thông tin cần thiết (chủ yếu dùng cho phát triển cục bộ)

4. Cập nhật `template.yaml` với thông tin cụ thể của bạn:
   - Thay `REPLACE_WITH_YOUR_WHATSAPP_NUMBER` bằng số điện thoại WhatsApp Business của bạn
   - Nếu bạn không dùng Twilio, hãy thay `REPLACE_WITH_YOUR_PROVIDER_API_URL` bằng URL API của nhà cung cấp

## Triển khai

Sử dụng AWS SAM CLI để triển khai ứng dụng:

```bash
# Validate SAM template
sam validate

# Build ứng dụng
sam build

# Triển khai (với các tham số tùy chỉnh)
sam deploy --guided
```

Trong quá trình triển khai có hướng dẫn, bạn sẽ được yêu cầu nhập các tham số:
- Stack Name: Tên stack CloudFormation của bạn (ví dụ: dubai-real-estate-whatsapp)
- AWS Region: Khu vực AWS để triển khai (chọn khu vực có hỗ trợ Bedrock)
- Environment: Môi trường triển khai (dev, staging, prod)
- WhatsappProviderType: Loại nhà cung cấp WhatsApp API (twilio, messagebird, other)
- SystemPromptSecretName: Tên của secret chứa system prompt
- GoogleServiceAccountSecretName: Tên của secret chứa Google Service Account key
- WhatsappProviderApiKeySecretName: Tên của secret chứa API key của nhà cung cấp WhatsApp

## Cấu hình Webhook

Sau khi triển khai thành công, bạn sẽ nhận được URL webhook trong phần Outputs:

```
WebhookUrl: https://abcdef123.execute-api.us-east-1.amazonaws.com/dev/webhook
```

Cấu hình URL này làm webhook cho WhatsApp Business API của bạn:

### Twilio:
1. Đăng nhập vào Twilio Console
2. Điều hướng đến Messaging > Settings > WhatsApp Sandbox
3. Trong phần "When a message comes in", nhập URL webhook từ output AWS
4. Chọn phương thức HTTP "POST"
5. Lưu cấu hình

### Nhà cung cấp khác:
Tham khảo tài liệu của nhà cung cấp WhatsApp Business API của bạn để biết cách cấu hình webhook.

## Kiểm tra

1. Gửi tin nhắn thử nghiệm đến số WhatsApp Business của bạn
2. Kiểm tra CloudWatch Logs để xem logs từ Lambda function:
   ```bash
   aws logs tail /aws/lambda/<stack-name>-whatsappWebhook-<environment> --follow
   ```

## Khắc phục sự cố

### Webhook không nhận tin nhắn
- Kiểm tra cấu hình webhook trong tài khoản nhà cung cấp WhatsApp
- Xác minh API Gateway được cấu hình đúng
- Kiểm tra CloudWatch Logs cho API Gateway và Lambda

### Lỗi Database
- Kiểm tra DynamoDB tables đã được tạo đúng
- Xác minh Lambda có quyền truy cập DynamoDB

### Lỗi Bedrock
- Kiểm tra quyền truy cập Bedrock đã được kích hoạt
- Xác minh Lambda có IAM policy phù hợp

### Lỗi Google Calendar
- Kiểm tra Google Service Account key có đúng định dạng
- Xác minh Google Service Account có quyền truy cập Calendar API
- Kiểm tra Secrets Manager secret có chứa key hợp lệ

## Cập nhật và Bảo trì

### Cập nhật code:

```bash
# Sau khi thay đổi code
sam build
sam deploy
```

### Cập nhật cấu hình:

```bash
# Thay đổi cấu hình với các tham số mới
sam deploy --parameter-overrides ParameterKey=Environment,ParameterValue=prod
```

### Xóa stack:

```bash
aws cloudformation delete-stack --stack-name <stack-name>
```

## Chi phí

Các dịch vụ AWS được sử dụng trong triển khai này bao gồm:
- AWS Lambda
- Amazon API Gateway
- Amazon DynamoDB
- AWS Bedrock
- Amazon Transcribe (cho voice memos)
- AWS Secrets Manager

Ước tính chi phí hàng tháng sẽ phụ thuộc vào khối lượng sử dụng. Cân nhắc sử dụng AWS Pricing Calculator để ước tính chi phí dựa trên lưu lượng dự kiến. 