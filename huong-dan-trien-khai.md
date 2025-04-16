# Hướng dẫn Triển khai Hệ thống CRM và WhatsApp Bot lên AWS

## Phần 1: Thiết lập môi trường AWS

Phần này mô tả các bước cần thiết để chuẩn bị môi trường AWS trước khi triển khai ứng dụng.

### 1.1. Tạo User Pool trong AWS Cognito

Cognito sẽ quản lý việc xác thực người dùng cho CRM dashboard.

1.  **Truy cập AWS Console > Cognito.**
2.  Chọn **Manage User Pools** và sau đó **Create a user pool**.
3.  **Đặt tên cho pool**, ví dụ: `CRMUserPool-prod`.
4.  **Review defaults** hoặc tùy chỉnh các cài đặt sau:
    *   **Sign-in options**: Chọn cách người dùng đăng nhập (ví dụ: username, email).
    *   **Password policy**: Thiết lập yêu cầu về độ phức tạp mật khẩu.
    *   **Multi-factor authentication (MFA)**: Cấu hình MFA nếu cần.
    *   **User account recovery**: Cấu hình cách khôi phục tài khoản.
5.  **Configure sign-up experience**:
    *   **Required attributes**: Chọn các thuộc tính bắt buộc khi đăng ký (thường là `email`).
    *   **Custom attributes**: Thêm thuộc tính tùy chỉnh `custom:roles` (kiểu String) để quản lý vai trò người dùng (ví dụ: `admin`, `user`).
6.  **Configure message delivery**: Cấu hình cách gửi email xác thực (sử dụng SES hoặc Cognito mặc định).
7.  **Integrate your app**:
    *   **App client name**: Đặt tên cho app client, ví dụ: `crm-dashboard-client`.
    *   **App type**: Chọn `Public client`.
    *   **Authentication flows**: Chọn `ALLOW_USER_PASSWORD_AUTH` và `ALLOW_REFRESH_TOKEN_AUTH`.
    *   **Hosted UI**: Không cần thiết lập nếu bạn chỉ dùng API.
    *   **Attribute read and write permissions**: Cấp quyền đọc/ghi cho các thuộc tính cần thiết, bao gồm `custom:roles`.
8.  **Review and create**: Xem lại cấu hình và tạo User Pool.
9.  **Ghi lại thông tin quan trọng**: Sau khi tạo, vào **Pool details** và **App integration** để lấy:
    *   **Pool ID** (ví dụ: `us-east-1_xxxxxxxxx`)
    *   **App client ID** (ví dụ: `xxxxxxxxxxxxxxxxxxxx`)

### 1.2. Tạo các bảng DynamoDB

DynamoDB sẽ lưu trữ dữ liệu khách hàng, hội thoại và leads.

1.  **Truy cập AWS Console > DynamoDB.**
2.  Chọn **Create table** và tạo 3 bảng sau:
    *   **Bảng `Customer`**: (Tên bảng có thể thay đổi qua biến môi trường `CRM_TABLE_NAME`)
        *   **Partition key**: `phoneNumber` (Type: String)
        *   Để các cài đặt khác mặc định (On-demand capacity).
    *   **Bảng `Conversations`**: (Tên bảng có thể thay đổi qua biến môi trường `CONVERSATIONS_TABLE_NAME`)
        *   **Partition key**: `phoneNumber` (Type: String)
        *   **Sort key**: `timestamp` (Type: Number) - Để lưu trữ tin nhắn theo thứ tự thời gian.
        *   Để các cài đặt khác mặc định.
    *   **Bảng `Leads`**: (Tên bảng có thể thay đổi qua biến môi trường `LEADS_TABLE_NAME`)
        *   **Partition key**: `phoneNumber` (Type: String)
        *   **Sort key**: `timestamp` (Type: Number) - Để lưu trữ các phiên bản lead theo thời gian.
        *   Để các cài đặt khác mặc định.

### 1.3. Tạo S3 Bucket cho WhatsApp Session

Bucket này sẽ lưu trữ session đăng nhập WhatsApp để bot có thể tự động kết nối lại sau khi khởi động lại.

1.  **Truy cập AWS Console > S3.**
2.  Chọn **Create bucket**.
3.  **Đặt tên bucket**: Ví dụ: `crm-whatsapp-sessions-prod` (tên bucket phải là duy nhất toàn cầu).
4.  **Chọn Region**: Chọn cùng Region với EC2 instance của bạn.
5.  **Block Public Access settings**: Giữ cài đặt mặc định (Block all public access).
6.  **Versioning**: Bật **Enable** versioning để dễ dàng khôi phục session nếu cần.
7.  Tạo bucket.

### 1.4. Thiết lập AWS Secrets Manager (Tùy chọn nhưng khuyến nghị)

Lưu trữ các thông tin nhạy cảm như khóa API, URL webhook một cách an toàn.

1.  **Truy cập AWS Console > Secrets Manager.**
2.  Chọn **Store a new secret**.
3.  **Chọn Secret type**: `Other type of secret`.
4.  **Secret key/value**:
    *   **Tạo secret cho Cognito**: Chọn **Plaintext** và dán cấu trúc JSON sau, thay thế bằng giá trị thực tế của bạn:
        ```json
        {
          "userPoolId": "YOUR_COGNITO_USER_POOL_ID",
          "clientId": "YOUR_COGNITO_APP_CLIENT_ID"
        }
        ```
        Đặt tên cho secret, ví dụ: `cognito-service-config-prod`. Ghi nhớ tên này cho biến môi trường `COGNITO_SECRET_NAME`.
    *   **Tạo secret cho Slack (nếu dùng)**: Chọn **Plaintext** và dán URL webhook Slack của bạn.
        Đặt tên cho secret, ví dụ: `slack-webhook-config-prod`. Ghi nhớ tên này cho biến môi trường `SLACK_SECRET_NAME`.
5.  Để các cài đặt khác mặc định và tạo secret.

### 1.5. Chuẩn bị IAM Policy và Role cho EC2

Tạo một IAM Policy cấp các quyền cần thiết cho EC2 instance để tương tác với các dịch vụ AWS khác.

1.  **Truy cập AWS Console > IAM > Policies > Create policy.**
2.  Chọn tab **JSON** và dán nội dung sau (thay thế `YOUR_ACCOUNT_ID`, `YOUR_AWS_REGION`, `YOUR_COGNITO_USER_POOL_ID`, `YOUR_S3_BUCKET_NAME` và tên các secret/bảng DynamoDB nếu bạn đặt khác):
    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "cognito-idp:AdminInitiateAuth",
            "cognito-idp:AdminRespondToAuthChallenge",
            "cognito-idp:SignUp",
            "cognito-idp:ConfirmSignUp",
            "cognito-idp:InitiateAuth",
            "cognito-idp:RespondToAuthChallenge",
            "cognito-idp:GetUser",
            "cognito-idp:ForgotPassword",
            "cognito-idp:ConfirmForgotPassword",
            "cognito-idp:ResendConfirmationCode",
            "cognito-idp:GlobalSignOut",
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminSetUserPassword"
          ],
          "Resource": "arn:aws:cognito-idp:YOUR_AWS_REGION:YOUR_ACCOUNT_ID:userpool/YOUR_COGNITO_USER_POOL_ID"
        },
        {
          "Effect": "Allow",
          "Action": [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:DeleteItem",
            "dynamodb:Scan",
            "dynamodb:Query"
          ],
          "Resource": [
            "arn:aws:dynamodb:YOUR_AWS_REGION:YOUR_ACCOUNT_ID:table/Customer",
            "arn:aws:dynamodb:YOUR_AWS_REGION:YOUR_ACCOUNT_ID:table/Conversations",
            "arn:aws:dynamodb:YOUR_AWS_REGION:YOUR_ACCOUNT_ID:table/Leads"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "s3:PutObject",
            "s3:GetObject",
            "s3:ListBucket",
            "s3:DeleteObject"
          ],
          "Resource": [
            "arn:aws:s3:::YOUR_S3_BUCKET_NAME",
            "arn:aws:s3:::YOUR_S3_BUCKET_NAME/*"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "secretsmanager:GetSecretValue"
          ],
          "Resource": [
            "arn:aws:secretsmanager:YOUR_AWS_REGION:YOUR_ACCOUNT_ID:secret:cognito-service-config-prod*",
            "arn:aws:secretsmanager:YOUR_AWS_REGION:YOUR_ACCOUNT_ID:secret:slack-webhook-config-prod*"
            // Thêm ARN cho các secret khác nếu cần
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "cloudwatch:PutMetricData"
          ],
          "Resource": "*"
        },
        {
          "Effect": "Allow",
          "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "logs:DescribeLogStreams"
          ],
          "Resource": "arn:aws:logs:*:*:*"
        }
      ]
    }
    ```
3.  Đặt tên cho policy, ví dụ: `CRMandWhatsAppBotPolicy`.
4.  **Tạo IAM Role**: Truy cập **Roles > Create role**.
    *   **Trusted entity type**: Chọn `AWS service`.
    *   **Use case**: Chọn `EC2`.
    *   **Add permissions**: Tìm và chọn policy `CRMandWhatsAppBotPolicy` vừa tạo.
    *   Đặt tên cho role, ví dụ: `EC2RoleForCRMandWhatsAppBot`.
    *   Tạo role.

Bạn sẽ gán Role này cho EC2 instance ở bước triển khai backend.

## Phần 2: Triển khai WhatsApp Bot lên EC2

Phần này tập trung vào việc cài đặt và chạy WhatsApp Bot trên một EC2 instance.

### 2.1. Tạo EC2 Instance

1.  **Truy cập AWS Console > EC2 > Instances > Launch instances.**
2.  **Name and tags**: Đặt tên cho instance, ví dụ: `whatsapp-bot-server`.
3.  **Application and OS Images**: Chọn **Amazon Linux 2023 AMI** (hoặc phiên bản Amazon Linux mới nhất). Kiến trúc `x86_64` thường phổ biến.
4.  **Instance type**: Chọn một loại instance phù hợp. `t3.medium` hoặc `t4g.medium` (ARM) là lựa chọn tốt để bắt đầu, vì Puppeteer (thư viện mà `whatsapp-web.js` sử dụng) có thể cần nhiều tài nguyên hơn `t3.small`.
5.  **Key pair (login)**: Chọn key pair hiện có hoặc tạo mới để truy cập SSH vào instance.
6.  **Network settings**:
    *   Chọn VPC và Subnet của bạn.
    *   **Auto-assign public IP**: Chọn `Enable`.
    *   **Firewall (security groups)**:
        *   Tạo security group mới hoặc chọn cái hiện có.
        *   Thêm Inbound rules:
            *   `SSH` (Port 22) từ IP của bạn (hoặc `0.0.0.0/0` nếu cần truy cập từ mọi nơi - **ít an toàn hơn**).
            *   `HTTP` (Port 80) và `HTTPS` (Port 443) nếu bạn dự định chạy web server trên instance này.
            *   Mở thêm port `8080` (hoặc port khác) nếu bạn cần dùng để hiển thị QR code qua SSH tunnel.
7.  **Configure storage**: Giữ cài đặt mặc định (ví dụ: 8 GiB gp3) hoặc tăng dung lượng nếu cần.
8.  **Advanced details**:
    *   **IAM instance profile**: Chọn IAM Role `EC2RoleForCRMandWhatsAppBot` đã tạo ở Phần 1.
9.  **Launch instance**.

### 2.2. Kết nối vào EC2 và Cài đặt môi trường

1.  Sau khi instance ở trạng thái `running`, lấy địa chỉ **Public IPv4 address** của nó.
2.  Kết nối vào instance qua SSH bằng key pair đã chọn:
    ```bash
    ssh -i /đường/dẫn/đến/your-key-pair.pem ec2-user@YOUR_EC2_PUBLIC_IP
    ```
3.  **Cập nhật hệ thống và cài đặt các gói cần thiết**:
    ```bash
    # Cập nhật hệ điều hành
    sudo yum update -y

    # Cài đặt Node.js (ví dụ: phiên bản 18.x)
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs git

    # Cài đặt Chromium (cần thiết cho Puppeteer/whatsapp-web.js)
    sudo amazon-linux-extras install epel -y
    sudo yum install -y chromium

    # Cài đặt các thư viện phụ thuộc cho Chromium/Puppeteer
    sudo yum install -y \
        alsa-lib.x86_64 \
        atk.x86_64 \
        cups-libs.x86_64 \
        gtk3.x86_64 \
        ipa-gothic-fonts \
        libXcomposite.x86_64 \
        libXcursor.x86_64 \
        libXdamage.x86_64 \
        libXext.x86_64 \
        libXi.x86_64 \
        libXrandr.x86_64 \
        libXScrnSaver.x86_64 \
        libXtst.x86_64 \
        pango.x86_64 \
        xorg-x11-fonts-100dpi \
        xorg-x11-fonts-75dpi \
        xorg-x11-fonts-cyrillic \
        xorg-x11-fonts-misc \
        xorg-x11-fonts-Type1 \
        xorg-x11-utils

    # Cài đặt PM2 để quản lý tiến trình Node.js
    sudo npm install -g pm2
    ```

### 2.3. Clone Code và Cài đặt Dependencies

1.  **Clone mã nguồn dự án** từ repository của bạn:
    ```bash
    git clone YOUR_REPOSITORY_URL
    cd YOUR_PROJECT_DIRECTORY # Ví dụ: cd crm-whatsapp-bot
    ```
2.  **Cài đặt các Node.js dependencies** cho cả backend và WhatsApp bot:
    ```bash
    # Cài đặt dependencies chung (từ root nếu có package.json chung)
    # npm install 

    # Hoặc cài đặt riêng cho từng phần
    cd backend
    npm install
    cd ../ # Quay lại thư mục gốc dự án

    # Cài đặt dependencies cho WhatsApp (nếu package.json nằm ở root)
    npm install whatsapp-web.js qrcode-terminal puppeteer-core chrome-aws-lambda # Hoặc các dependencies đã có trong package.json
    ```
    *Lưu ý*: Đảm bảo `puppeteer-core` và các thư viện liên quan (`whatsapp-web.js`) được cài đặt.

### 2.4. Cấu hình Biến môi trường

1.  Tạo file `.env` trong thư mục gốc của dự án trên EC2 (hoặc trong thư mục `backend` tùy cấu trúc dự án của bạn).
2.  Thêm các biến môi trường cần thiết. **Quan trọng**: Sử dụng các giá trị thực tế bạn đã tạo/lấy được ở Phần 1.
    ```dotenv
    # AWS Configuration
    AWS_REGION=us-east-1 # Thay bằng Region của bạn
    USE_AWS_SECRETS=true # Đặt là true nếu bạn lưu config trong Secrets Manager

    # Cognito
    # Chỉ cần nếu KHÔNG dùng Secrets Manager
    # COGNITO_USER_POOL_ID=us-east-1_xxxxxxxx
    # COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
    COGNITO_SECRET_NAME=cognito-service-config-prod # Tên secret Cognito

    # DynamoDB Table Names
    CRM_TABLE_NAME=Customer
    CONVERSATIONS_TABLE_NAME=Conversations
    LEADS_TABLE_NAME=Leads

    # WhatsApp Bot
    WHATSAPP_SESSION_AUTH=true
    WHATSAPP_SESSION_DATA_PATH=./.wwebjs_auth # Đường dẫn lưu session cục bộ
    WHATSAPP_SESSION_BUCKET=crm-whatsapp-sessions-prod # Tên S3 bucket đã tạo

    # Logging
    LOG_LEVEL=info # Hoặc debug khi cần gỡ lỗi
    NODE_ENV=production

    # Slack (Nếu dùng)
    SLACK_USE_SECRETS_MANAGER=true
    SLACK_SECRET_NAME=slack-webhook-config-prod # Tên secret Slack

    # Monitoring (Nếu dùng)
    ENABLE_CLOUDWATCH=true
    CLOUDWATCH_NAMESPACE=CRMandWhatsAppBot/Metrics # Namespace cho CloudWatch
    MEMORY_THRESHOLD=90 # Ngưỡng cảnh báo Memory (%)
    CPU_THRESHOLD=80    # Ngưỡng cảnh báo CPU (%)

    # Backend API Port (Nếu chạy chung)
    PORT=5000
    ```
3.  **Kiểm tra quyền truy cập**: Đảm bảo file `.env` không bị commit lên git repository.

### 2.5. Chỉnh sửa mã nguồn WhatsApp Bot (Nếu cần)

Đảm bảo mã nguồn trong file khởi chạy WhatsApp Bot (ví dụ: `whatsappBot.js` hoặc `index.js` tùy dự án) đã được cập nhật để:

*   Sử dụng `executablePath` đúng với đường dẫn Chromium đã cài đặt (`/usr/bin/chromium-browser`).
*   Sử dụng các tham số `--no-sandbox` và các tham số khác cho Puppeteer khi chạy trên Linux server.
*   Tích hợp logic `loadSessionFromS3()` khi khởi tạo client và `saveSessionToS3()` khi client `ready` hoặc `authenticated`, và định kỳ.
*   Gọi `initialize()` cho các service khác (CRM, RAG, v.v.) trước khi client bắt đầu xử lý tin nhắn.
*   Xử lý tín hiệu `SIGINT` để lưu session trước khi thoát.

*(Tham khảo mã mẫu trong các phản hồi trước)*

### 2.6. Khởi chạy Bot lần đầu và Quét QR Code

Do WhatsApp cần quét mã QR để liên kết thiết bị lần đầu (và đôi khi sau đó), bạn cần cách để xem mã QR này từ server EC2.

1.  **Chạy tiến trình Bot bằng Node trực tiếp (chưa dùng PM2)**:
    ```bash
    # Chạy file khởi động bot của bạn
    node whatsappBot.js # Hoặc node index.js
    ```
2.  Bot sẽ xuất mã QR ra terminal dưới dạng text và ghi vào file `qrcode.txt` (dựa theo mã mẫu).
3.  **Xem mã QR từ xa**: Có hai cách phổ biến:
    *   **Cách 1: Sao chép nội dung file qrcode.txt**: Dùng `cat qrcode.txt` trên terminal SSH, sao chép toàn bộ nội dung và dán vào một trình tạo QR code online.
    *   **Cách 2: Hiển thị QR qua SSH Tunnel (An toàn hơn)**:
        *   **Trên máy tính của bạn (local)**, mở một terminal mới và chạy lệnh SSH Tunnel (thay `YOUR_EC2_PUBLIC_IP`):
            ```bash
            ssh -L 8080:localhost:8080 -i /đường/dẫn/đến/your-key-pair.pem ec2-user@YOUR_EC2_PUBLIC_IP
            ```
            *(Lệnh này chuyển tiếp cổng 8080 trên máy bạn đến cổng 8080 trên EC2)*
        *   **Trên terminal SSH của EC2**, chạy một web server tạm thời để hiển thị QR (cần cài đặt `express` nếu chưa có: `npm install express`):
            ```bash
            node -e "const express=require('express');const fs=require('fs');const path=require('path');const app=express();app.get('/',(req,res)=>{try{const qr=fs.readFileSync(path.join(process.cwd(),'qrcode.txt'),'utf8');res.send('<p>Scan this QR code with your WhatsApp:</p><img src=\"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(qr)+'\"/>')}catch(e){res.status(404).send('QR code file not found. Is the bot running and waiting for QR scan?')}});app.listen(8080,()=>console.log('QR display server running on port 8080. Access http://localhost:8080 on your local machine via SSH tunnel.'))"
            ```
        *   **Trên máy tính của bạn**, mở trình duyệt và truy cập `http://localhost:8080`. Bạn sẽ thấy hình ảnh mã QR.
4.  **Quét mã QR**: Dùng điện thoại đã cài WhatsApp, vào **Settings > Linked Devices > Link a Device** và quét mã QR hiển thị.
5.  Sau khi quét thành công, terminal SSH của EC2 sẽ hiển thị log `WhatsApp client is ready` hoặc `WhatsApp client authenticated`.
6.  **Dừng tiến trình Node**: Nhấn `Ctrl + C` trên terminal SSH đang chạy bot.
7.  **Dừng web server tạm thời (nếu dùng cách 2)**: Nhấn `Ctrl + C` trên terminal SSH đang chạy web server.
8.  **Kiểm tra S3**: Phiên đăng nhập (`.wwebjs_auth` folder) sẽ được tự động lưu lên S3 bucket bạn đã cấu hình.

### 2.7. Chạy Bot bằng PM2

PM2 giúp quản lý tiến trình Node.js, tự động khởi động lại khi gặp lỗi và chạy ngầm.

1.  **Tạo file cấu hình PM2 (`ecosystem.config.js`)** trong thư mục gốc dự án (hoặc thư mục chứa các file khởi chạy):
    ```javascript
    module.exports = {
      apps: [
        // Cấu hình cho Backend API (nếu chạy chung trên cùng instance)
        {
          name: 'crm-api',       // Tên tiến trình API
          script: './backend/app.js', // Đường dẫn tới file khởi chạy API
          instances: 1,         // Số lượng instance
          autorestart: true,    // Tự động khởi động lại nếu lỗi
          watch: false,         // Không theo dõi thay đổi file để restart
          max_memory_restart: '1G', // Restart nếu dùng quá 1GB RAM
          env: {
            NODE_ENV: 'production'
          }
        },
        // Cấu hình cho WhatsApp Bot
        {
          name: 'whatsapp-bot', // Tên tiến trình Bot
          script: './whatsappBot.js', // Đường dẫn tới file khởi chạy Bot (thay đổi nếu cần)
          instances: 1,
          autorestart: true,
          watch: false,
          max_memory_restart: '1G',
          env: {
            NODE_ENV: 'production'
          }
        }
      ]
    };
    ```
    *Lưu ý*: Chỉnh sửa `script` để trỏ đúng đến file khởi chạy của bạn.
2.  **Khởi chạy ứng dụng bằng PM2**:
    ```bash
    pm2 start ecosystem.config.js
    ```
3.  **Kiểm tra trạng thái**: `pm2 list` hoặc `pm2 status`.
4.  **Xem logs**: `pm2 logs whatsapp-bot` hoặc `pm2 logs crm-api`.
5.  **Lưu cấu hình PM2** để tự động khởi chạy sau khi reboot server:
    ```bash
    pm2 save
    sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user
    ```
    *(Lệnh `pm2 startup` sẽ cung cấp một lệnh `sudo` khác, hãy chạy lệnh đó)*

Lúc này, cả Backend API và WhatsApp Bot sẽ chạy ngầm và được quản lý bởi PM2. Bot sẽ tự động tải session từ S3 và kết nối mà không cần quét lại QR (trừ khi session hết hạn hoặc bị đăng xuất từ điện thoại). 

## Phần 3: Triển khai Frontend (React App) lên S3 và CloudFront

Phần này hướng dẫn cách build và triển khai ứng dụng React của bạn dưới dạng static website trên S3, và sử dụng CloudFront để tăng tốc độ, bảo mật (HTTPS) và xử lý routing.

### 3.1. Cấu hình API Endpoint cho Frontend

Trước khi build, bạn cần cho ứng dụng React biết địa chỉ API backend đang chạy trên EC2 (hoặc API Gateway).

1.  **Xác định địa chỉ API Backend**: Lấy địa chỉ Public IP của EC2 instance hoặc Invoke URL của API Gateway (nếu bạn cấu hình).
2.  **Tạo file `.env.production`** trong thư mục gốc của frontend (ví dụ: `frontend/.env.production`).
3.  Thêm biến môi trường sau, thay thế bằng địa chỉ API của bạn:
    ```dotenv
    REACT_APP_API_URL=http://YOUR_EC2_PUBLIC_IP:5000 # Hoặc https://your-api-gateway-invoke-url/stage
    ```
    *Lưu ý*: Nếu bạn dự định sử dụng custom domain và HTTPS cho API sau này, hãy dùng địa chỉ HTTPS đó. Nếu chưa có, bạn có thể dùng địa chỉ IP/Invoke URL trước và cập nhật sau.

### 3.2. Build ứng dụng React

1.  Mở terminal trong thư mục frontend (ví dụ: `cd frontend`).
2.  Chạy lệnh build:
    ```bash
    npm run build
    # Hoặc yarn build
    ```
3.  Lệnh này sẽ tạo một thư mục `build` chứa các file tĩnh của ứng dụng React.

### 3.3. Cấu hình S3 Bucket cho Static Website Hosting

Chúng ta sẽ sử dụng S3 bucket đã tạo ở Phần 1 hoặc tạo mới nếu cần.

1.  **Truy cập S3 bucket** của bạn trên AWS Console.
2.  Vào tab **Properties**.
3.  Kéo xuống phần **Static website hosting** và chọn **Edit**.
4.  Chọn **Enable**.
5.  **Hosting type**: Chọn `Host a static website`.
6.  **Index document**: Nhập `index.html`.
7.  **Error document**: Nhập `index.html` (Quan trọng: Điều này giúp React Router xử lý routing phía client khi người dùng truy cập trực tiếp vào một đường dẫn cụ thể).
8.  Lưu thay đổi.
9.  **Ghi lại Endpoint**: Sao chép **Bucket website endpoint** được hiển thị. Nó sẽ có dạng `http://your-bucket-name.s3-website-your-region.amazonaws.com`.

### 3.4. Cấu hình Quyền truy cập cho S3 Bucket

Để CloudFront (và người dùng) có thể truy cập các file trong bucket, bạn cần cấp quyền đọc công khai.

1.  Vào tab **Permissions** của S3 bucket.
2.  Trong phần **Block public access (bucket settings)**, chọn **Edit**.
3.  **Bỏ chọn** ô `Block *all* public access`. **Cảnh báo**: Hãy cẩn thận khi thay đổi cài đặt này. Chúng ta chỉ cho phép đọc công khai thông qua bucket policy.
4.  Lưu thay đổi và xác nhận.
5.  Trong phần **Bucket policy**, chọn **Edit**.
6.  Dán policy sau, thay `YOUR_BUCKET_NAME` bằng tên bucket của bạn:
    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "PublicReadGetObject",
          "Effect": "Allow",
          "Principal": "*",
          "Action": "s3:GetObject",
          "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
        }
      ]
    }
    ```
7.  Lưu thay đổi.

### 3.5. Upload File Build lên S3

Sử dụng AWS CLI để đồng bộ thư mục `build` lên S3 bucket.

1.  Mở terminal trên máy tính của bạn (nơi có thư mục `build`).
2.  Đảm bảo bạn đã cấu hình AWS CLI với credentials có quyền ghi vào S3 bucket (`aws configure`).
3.  Chạy lệnh sync (thay `YOUR_BUCKET_NAME`):
    ```bash
    aws s3 sync frontend/build/ s3://YOUR_BUCKET_NAME --delete
    ```
    *   `frontend/build/`: Đường dẫn đến thư mục build của bạn.
    *   `s3://YOUR_BUCKET_NAME`: Tên bucket S3.
    *   `--delete`: Xóa các file trên S3 không còn tồn tại trong thư mục `build`.

4.  **Kiểm tra**: Truy cập **Bucket website endpoint** bạn đã ghi lại ở bước 3.3. Bạn sẽ thấy ứng dụng React của mình chạy, nhưng có thể chưa hoạt động hoàn hảo với routing và API (nếu API chưa có HTTPS hoặc CORS). CloudFront sẽ giải quyết các vấn đề này.

### 3.6. Tạo và Cấu hình CloudFront Distribution

CloudFront sẽ đóng vai trò là CDN, cung cấp HTTPS và định tuyến request đến S3 bucket.

1.  **Truy cập AWS Console > CloudFront > Distributions > Create distribution.**
2.  **Origin domain**: Chọn S3 bucket của bạn từ danh sách thả xuống. **Không chọn** bucket website endpoint, hãy chọn tên bucket dạng `your-bucket-name.s3.your-region.amazonaws.com`.
3.  **Origin access**: Chọn `Origin access control settings (recommended)`.
    *   Nhấp **Create control setting**. Giữ cài đặt mặc định và nhấp **Create**.
    *   CloudFront sẽ hiển thị một Bucket policy gợi ý. Nhấp **Copy policy** và sau đó quay lại **S3 bucket > Permissions > Bucket policy**, chọn **Edit** và **thay thế** policy hiện tại bằng policy vừa copy. Policy này chỉ cho phép CloudFront truy cập bucket.
4.  **Viewer protocol policy**: Chọn `Redirect HTTP to HTTPS`.
5.  **Allowed HTTP methods**: Chọn `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE` để cho phép tất cả các phương thức API nếu bạn định tuyến API qua CloudFront (tuy nhiên, trong trường hợp này, chúng ta chỉ phục vụ frontend).
6.  **Cache key and origin requests**: Chọn `Cache policy and origin request policy (recommended)`.
    *   **Cache Policy**: Chọn `CachingOptimized` (hoặc `CachingDisabled` nếu bạn không muốn cache).
    *   **Origin Request Policy**: Giữ mặc định `Managed-CORS-S3Origin` hoặc tạo policy riêng nếu cần.
7.  **Settings**:
    *   **Price Class**: Chọn mức giá phù hợp (ví dụ: `Use all edge locations (best performance)`).
    *   **Alternate domain name (CNAME)** (Tùy chọn): Nếu bạn có custom domain (ví dụ: `crm.yourdomain.com`), hãy thêm vào đây. Bạn sẽ cần cấu hình DNS sau.
    *   **Custom SSL certificate** (Tùy chọn): Nếu bạn sử dụng CNAME, chọn chứng chỉ SSL tương ứng đã được tạo trong AWS Certificate Manager (ACM). Chứng chỉ phải ở region `us-east-1 (N. Virginia)` để sử dụng với CloudFront.
    *   **Default root object**: Nhập `index.html`.
8.  **Create distribution**.
9.  Quá trình triển khai CloudFront distribution có thể mất vài phút. Sau khi **Status** chuyển thành `Enabled`, hãy ghi lại **Distribution domain name** (ví dụ: `d12345abcdef.cloudfront.net`).

### 3.7. Cấu hình Error Responses cho React Router

Để React Router hoạt động đúng khi người dùng truy cập trực tiếp vào các đường dẫn con (ví dụ: `yourdomain.com/customers`), bạn cần cấu hình CloudFront trả về `index.html` cho các lỗi 403 và 404.

1.  Vào CloudFront distribution vừa tạo, chọn tab **Error pages**.
2.  Chọn **Create custom error response**.
3.  **HTTP error code**: Chọn `403: Forbidden`.
4.  **Customize error response**: Chọn `Yes`.
5.  **Response page path**: Nhập `/index.html`.
6.  **HTTP Response code**: Chọn `200: OK`.
7.  Nhấp **Create**.
8.  Lặp lại các bước 2-7 cho **HTTP error code** `404: Not Found`.

### 3.8. Kiểm tra Frontend qua CloudFront

Truy cập **Distribution domain name** (ví dụ: `https://d12345abcdef.cloudfront.net`) trên trình duyệt. Ứng dụng React của bạn bây giờ sẽ được phục vụ qua CloudFront với HTTPS. Các đường dẫn con cũng sẽ hoạt động đúng nhờ cấu hình Error Responses. 

## Phần 4: Cấu hình Domain, HTTPS và Giám sát

Phần này mô tả các bước cuối cùng để hoàn thiện việc triển khai, bao gồm sử dụng tên miền riêng, bật HTTPS và thiết lập giám sát.

### 4.1. Cấu hình Tên miền tùy chỉnh (Custom Domain)

Để người dùng truy cập ứng dụng qua một tên miền dễ nhớ (ví dụ: `crm.yourdomain.com`) thay vì địa chỉ CloudFront hoặc IP.

1.  **Đăng ký tên miền**: Nếu bạn chưa có, hãy đăng ký một tên miền qua Amazon Route 53 hoặc nhà cung cấp khác.
2.  **Tạo Hosted Zone trong Route 53**: Nếu tên miền của bạn được quản lý bởi Route 53:
    *   Truy cập **AWS Console > Route 53 > Hosted zones > Create hosted zone**.
    *   Nhập tên miền của bạn (ví dụ: `yourdomain.com`).
    *   Chọn **Type**: `Public hosted zone`.
    *   Tạo hosted zone.
    *   Nếu tên miền được đăng ký ở nơi khác, bạn cần cập nhật Name Servers (NS) tại nhà đăng ký tên miền của bạn để trỏ đến các NS được cung cấp bởi Route 53.
3.  **Tạo bản ghi DNS cho Frontend (CloudFront)**:
    *   Trong hosted zone của bạn, chọn **Create record**.
    *   **Record name**: Nhập tiền tố bạn muốn (ví dụ: `crm` cho `crm.yourdomain.com`, hoặc để trống nếu muốn dùng domain gốc).
    *   **Record type**: Chọn `A – Routes traffic to an IPv4 address and some AWS resources`.
    *   **Route traffic to**: Bật **Alias**.
        *   **Choose endpoint**: Chọn `Alias to CloudFront distribution`.
        *   Chọn distribution của bạn từ danh sách thả xuống.
    *   Tạo bản ghi.
4.  **Tạo bản ghi DNS cho Backend (EC2/API Gateway - Tùy chọn)**:
    *   Nếu bạn muốn API cũng có tên miền riêng (ví dụ: `api.yourdomain.com`):
        *   **EC2**: Tạo một bản ghi `A` trỏ đến **Elastic IP** của EC2 instance (bạn nên gán Elastic IP cho instance để IP không đổi).
        *   **API Gateway**: Tạo **Custom domain name** trong API Gateway, chọn chứng chỉ ACM, cấu hình base path mapping, sau đó tạo bản ghi `A` (Alias) trong Route 53 trỏ đến API Gateway custom domain name đó.

### 4.2. Cấu hình HTTPS (SSL/TLS Certificate)

Sử dụng AWS Certificate Manager (ACM) để cung cấp chứng chỉ SSL/TLS miễn phí cho CloudFront và API Gateway.

1.  **Yêu cầu Chứng chỉ trong ACM**: **Quan trọng**: Để sử dụng với CloudFront, chứng chỉ phải được yêu cầu ở Region `us-east-1 (N. Virginia)`.
    *   Truy cập **AWS Console > Certificate Manager** (đảm bảo bạn đang ở Region `us-east-1`).
    *   Chọn **Request a certificate > Request a public certificate**.
    *   **Fully qualified domain name**: Nhập tên miền bạn muốn bảo mật (ví dụ: `crm.yourdomain.com`). Bạn cũng có thể thêm tên miền dạng wildcard (ví dụ: `*.yourdomain.com`) để bảo mật tất cả các subdomain.
    *   **Validation method**: Chọn `DNS validation` (khuyến nghị).
    *   Yêu cầu chứng chỉ.
2.  **Xác thực tên miền**: ACM sẽ cung cấp các bản ghi CNAME cần tạo trong Route 53 (hoặc DNS provider của bạn) để xác thực quyền sở hữu tên miền. Nhấp vào nút **Create records in Route 53** nếu bạn dùng Route 53, ACM sẽ tự động tạo các bản ghi cần thiết.
3.  **Gán Chứng chỉ cho CloudFront**: Quay lại cấu hình CloudFront distribution (từ bước 3.6):
    *   Vào tab **General > Edit**.
    *   Trong **Settings > Custom SSL certificate**, chọn chứng chỉ bạn vừa tạo từ danh sách thả xuống.
    *   Lưu thay đổi.
4.  **Gán Chứng chỉ cho API Gateway (Nếu dùng Custom Domain)**: Trong cấu hình Custom Domain Name của API Gateway, chọn chứng chỉ tương ứng.

Sau khi DNS và CloudFront cập nhật (có thể mất vài phút đến vài giờ), bạn sẽ có thể truy cập frontend qua `https://crm.yourdomain.com`.

### 4.3. Thiết lập Giám sát và Cảnh báo (CloudWatch)

Sử dụng CloudWatch để theo dõi hiệu suất và nhận cảnh báo khi có sự cố.

1.  **Kiểm tra Metrics**: Truy cập **AWS Console > CloudWatch > All metrics**.
    *   Tìm namespace bạn đã định nghĩa (ví dụ: `CRMandWhatsAppBot/Metrics` hoặc `Application/Metrics`).
    *   Bạn sẽ thấy các metrics như `CPUUtilization`, `MemoryUtilization`, `RequestCount`, `ErrorCount` được gửi từ `SystemMonitor` trên EC2.
2.  **Tạo CloudWatch Alarms**: Tạo cảnh báo dựa trên các ngưỡng bạn đã đặt.
    *   Truy cập **CloudWatch > Alarms > Create alarm**.
    *   **Select metric**: Chọn metric bạn muốn giám sát (ví dụ: `CPUUtilization` từ namespace của bạn).
    *   **Conditions**: Đặt ngưỡng (ví dụ: `Static`, `Greater/Equal`, `threshold: 80` cho CPU).
    *   **Notification**: Chọn hoặc tạo một **SNS topic**.
        *   Tạo SNS topic mới nếu chưa có (ví dụ: `CRMBotAlarms`).
        *   Tạo **Subscription** cho topic đó, ví dụ: gửi email đến địa chỉ của bạn hoặc gửi thông báo đến Slack thông qua AWS Chatbot hoặc Lambda function.
    *   Đặt tên và mô tả cho alarm.
    *   Tạo alarm. Lặp lại cho các metrics quan trọng khác (Memory, ErrorCount).
3.  **Kiểm tra Logs**: Truy cập **CloudWatch > Log groups**.
    *   Tìm log group bạn đã cấu hình (ví dụ: `WhatsAppBot/logs`).
    *   Bạn có thể xem logs chi tiết từ các log stream của EC2 instance, tìm kiếm lỗi và theo dõi hoạt động của ứng dụng.
4.  **Tạo CloudWatch Dashboard (Tùy chọn)**: Tạo dashboard tùy chỉnh để hiển thị các metrics và trạng thái alarm quan trọng ở một nơi.

### 4.4. Cấu hình AWS Chatbot (Tùy chọn - Gửi cảnh báo đến Slack)

Cách đơn giản để gửi cảnh báo CloudWatch đến Slack.

1.  **Truy cập AWS Console > AWS Chatbot.**
2.  **Configure a chat client**: Chọn `Slack`.
3.  Làm theo hướng dẫn để ủy quyền AWS Chatbot truy cập vào workspace Slack của bạn.
4.  **Configure new channel**: Chọn kênh Slack bạn muốn nhận thông báo.
5.  **Permissions**: Chọn IAM role cho phép Chatbot truy cập SNS và CloudWatch (thường có sẵn role `AWSChatbotServiceRolePolicy`).
6.  **Notifications**: Chọn SNS topic bạn đã tạo cho alarms (ví dụ: `CRMBotAlarms`).
7.  Cấu hình.

Bây giờ, khi một CloudWatch Alarm chuyển sang trạng thái `ALARM`, bạn sẽ nhận được thông báo trực tiếp trong kênh Slack đã chọn.

## Phần 5: Kiểm tra và Hoàn tất

1.  **Kiểm tra Frontend**: Truy cập ứng dụng qua tên miền CloudFront hoặc tên miền tùy chỉnh của bạn. Đảm bảo HTTPS hoạt động.
    *   Thử đăng nhập bằng tài khoản Cognito đã tạo.
    *   Kiểm tra tất cả các chức năng CRM (xem/thêm/sửa khách hàng, leads, hội thoại).
    *   Kiểm tra Dashboard.
2.  **Kiểm tra Backend API**: (Có thể dùng Postman hoặc từ frontend)
    *   Đảm bảo các endpoint API hoạt động chính xác.
    *   Kiểm tra xác thực (truy cập endpoint yêu cầu `authMiddleware`).
3.  **Kiểm tra WhatsApp Bot**: Gửi tin nhắn đến số điện thoại của bot.
    *   Kiểm tra bot có trả lời không.
    *   Kiểm tra tin nhắn và trạng thái lead/khách hàng có được cập nhật trong DynamoDB không.
    *   Kiểm tra logs (`pm2 logs whatsapp-bot`) trên EC2 nếu có lỗi.
4.  **Kiểm tra Lưu trữ Session**: Khởi động lại tiến trình WhatsApp Bot (`pm2 restart whatsapp-bot`). Kiểm tra xem bot có tự động kết nối lại mà không cần quét QR không.
5.  **Kiểm tra Monitoring**: Xem metrics trên CloudWatch Dashboard. Thử tạo ra một số lỗi hoặc tải giả lập để kiểm tra xem cảnh báo có được kích hoạt và gửi thông báo (email/Slack) không.
6.  **Kiểm tra Logs**: Xem CloudWatch Logs để đảm bảo logs đang được thu thập đúng cách.
7.  **Tối ưu Security Groups**: Rà soát lại các inbound rules trong Security Group của EC2, chỉ mở các port thực sự cần thiết và giới hạn IP nguồn nếu có thể.

Chúc mừng! Bạn đã triển khai thành công hệ thống CRM và WhatsApp Bot lên AWS. 