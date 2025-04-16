# Kế hoạch Triển khai AWS cho AI WhatsApp Assistant

## I. Phân tích Yêu cầu & Kiến trúc Công nghệ Đề xuất (AWS)

Dựa trên các chức năng yêu cầu trong `requirement.md` (chatbot AI giống người, phân loại lead, lên lịch hẹn, tích hợp CRM, đa người dùng), kiến trúc đề xuất hoàn toàn trên AWS như sau:

1.  **Webhook & API Gateway:**
    *   **AWS API Gateway:** Tạo REST API để nhận webhook từ WhatsApp (thông qua nhà cung cấp như Twilio) và cung cấp endpoint cho Admin Dashboard.
    *   **AWS Lambda:** Xử lý logic chính cho các yêu cầu đến API Gateway. Mỗi chức năng cốt lõi (nhận tin nhắn, xử lý NLP, lên lịch,...) có thể là một Lambda function riêng biệt.

2.  **AI Conversation Engine:**
    *   **AWS Bedrock:** Sử dụng các mô hình Foundation Models phù hợp có sẵn trên Bedrock để tạo phản hồi tự nhiên, thay thế cho việc gọi API bên ngoài. Cần lựa chọn model phù hợp với yêu cầu về khả năng hội thoại và huấn luyện (nếu cần) theo phong cách giao tiếp của agent.
    *   **AWS Lambda:** Tích hợp API của Deepgram (transcription) và Eleven Labs (voice response) hoặc sử dụng **AWS Transcribe** và **AWS Polly** làm giải pháp thay thế của AWS, được gọi từ Lambda.

3.  **Xử lý Logic & Dữ liệu:**
    *   **AWS Lambda:** Chứa code xử lý logic nghiệp vụ: phân loại lead, quy trình lên lịch hẹn, tích hợp CRM.
    *   **AWS DynamoDB:** Lưu trữ dữ liệu phi cấu trúc hoặc bán cấu trúc: lịch sử hội thoại, thông tin lead ban đầu, trạng thái người dùng, cấu hình cho từng tenant. Thiết kế partition key theo `tenantId`.
    *   **(Tùy chọn) AWS RDS:** Nếu cần lưu trữ dữ liệu có cấu trúc quan hệ phức tạp hơn.

4.  **Tích hợp Lịch & Nhắc nhở:**
    *   **AWS Lambda:** Tích hợp với Google Calendar API để kiểm tra lịch trống, tạo sự kiện.
    *   **AWS EventBridge (Scheduler):** Kích hoạt Lambda function theo lịch để gửi lời nhắc cuộc hẹn qua WhatsApp.

5.  **Admin Dashboard:**
    *   **AWS Amplify:** Giải pháp xây dựng và triển khai ứng dụng web fullstack.
        *   **Hosting:** Frontend (React/Vue/Angular) trên S3 + CloudFront.
        *   **API:** Tự động tạo API Gateway + Lambda cho backend dashboard.
        *   **Authentication:** Tích hợp **AWS Cognito** để quản lý đăng nhập.

6.  **Đa người dùng (Multi-Tenancy):**
    *   **DynamoDB:** Cách ly dữ liệu bằng partition key (`tenantId`).
    *   **Cognito:** Quản lý user pools riêng hoặc chung với custom attributes.
    *   **IAM:** Cấu hình vai trò/quyền truy cập riêng nếu cần.

7.  **Giám sát & Logging:**
    *   **AWS CloudWatch:** Theo dõi logs, metrics và thiết lập cảnh báo.

8.  **Triển khai & CI/CD:**
    *   **AWS CDK (Cloud Development Kit) hoặc SAM (Serverless Application Model):** Định nghĩa hạ tầng bằng code (IaC).
    *   **AWS CodeCommit/GitHub/Bitbucket:** Lưu trữ source code.
    *   **AWS CodePipeline:** Xây dựng quy trình CI/CD.
    *   **AWS CodeBuild:** Build và test code.
    *   **AWS CodeDeploy (hoặc qua CDK/SAM):** Triển khai tài nguyên serverless.

## II. Kế hoạch Coding (Tập trung vào Demo Scope)

Dựa trên cấu trúc thư mục hiện có (`index.js`, `googleCalendar.js`, `bedrockService.js`, etc.), kế hoạch coding sẽ tập trung vào điều chỉnh, tích hợp và triển khai lên AWS:

1.  **Thiết lập AWS Infrastructure (CDK/SAM):**
    *   Định nghĩa API Gateway, Lambda functions (cho `index.js`, `googleCalendar.js`, các service), DynamoDB table(s), EventBridge rules, IAM roles, Cognito User Pool.
2.  **Refactor `index.js` thành Lambda:**
    *   Chuyển logic thành Lambda function handler.
    *   Cấu hình API Gateway trigger.
    *   Quản lý biến môi trường qua Parameter Store/Secrets Manager.
3.  **Tích hợp WhatsApp:**
    *   Cấu hình webhook (ví dụ: Twilio) trỏ tới API Gateway.
4.  **AI Engine (AWS Bedrock):**
    *   **Xác nhận và Cấu hình `bedrockService.js`:** Đảm bảo module này được cấu hình đúng để gọi model mong muốn trên AWS Bedrock.
    *   **Cập nhật Lambda chính:** Gọi `bedrockService` từ Lambda xử lý tin nhắn chính.
    *   Điều chỉnh logic hội thoại và phân loại lead cho demo.
5.  **Lịch hẹn (Google Calendar):**
    *   Refactor `googleCalendar.js` thành Lambda function.
    *   Xử lý xác thực Google API an toàn (Secrets Manager).
    *   Triển khai luồng lên lịch cơ bản và nhắc nhở (EventBridge + Lambda).
6.  **Lưu trữ Dữ liệu (DynamoDB):**
    *   Thay thế `conversation_histories.json` bằng DynamoDB. Cập nhật code đọc/ghi.
7.  **Admin Dashboard (Đơn giản - Amplify):**
    *   Tạo frontend Amplify.
    *   Tạo API (API Gateway + Lambda) cho dashboard: hiển thị hội thoại (từ DynamoDB), xem lịch (gọi Lambda `googleCalendar`).
    *   Tích hợp Cognito cho đăng nhập.
8.  **Transcription/Text-to-Speech (AWS Services):**
    *   Refactor `transcribeService.js` và `textToSpeech.js` thành Lambda hoặc đảm bảo chúng hoạt động trong môi trường Lambda, ưu tiên sử dụng AWS Transcribe/Polly nếu có thể.
9.  **CRM & RAG (Ngoài phạm vi demo):**
    *   Đảm bảo `crmService.js` và `ragService.js` có thể tích hợp vào kiến trúc Lambda/API Gateway sau này.

## III. Kế hoạch Triển khai (Deployment)

1.  **Infrastructure as Code:** Viết script CDK/SAM.
2.  **CI/CD Pipeline (AWS CodePipeline):**
    *   **Source:** CodeCommit/GitHub.
    *   **Build (CodeBuild):** `npm install`, build frontend, test, synth CDK/package SAM.
    *   **Deploy (CodeDeploy/CloudFormation):** Deploy stack AWS, deploy frontend.
3.  **Cấu hình Môi trường:** Dùng Secrets Manager/Parameter Store cho secrets.
4.  **Testing:** End-to-end testing.
5.  **Monitoring:** CloudWatch Dashboards & Alarms. 