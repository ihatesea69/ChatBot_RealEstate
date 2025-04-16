# Hướng dẫn thiết lập Webhook

Tài liệu này cung cấp hướng dẫn chi tiết để thiết lập webhook cho chatbot trí tuệ nhân tạo với các nền tảng nhắn tin khác nhau.

## 1. Thiết lập Webhook với WhatsApp Business API (Meta)

### Yêu cầu cơ bản
- Một tài khoản Facebook Business
- Một số điện thoại đã đăng ký với WhatsApp Business
- Đã triển khai ứng dụng chatbot của bạn (tham khảo tài liệu DEPLOYMENT.md)

### Các bước thực hiện

#### 1.1. Đăng ký tài khoản nhà phát triển Meta
1. Truy cập [Meta for Developers](https://developers.facebook.com/) và đăng ký một tài khoản nhà phát triển.
2. Tạo một ứng dụng Meta mới, chọn "Business" làm loại ứng dụng.
3. Thêm Sản phẩm WhatsApp vào ứng dụng của bạn.

#### 1.2. Cấu hình WhatsApp Business API
1. Trong bảng điều khiển ứng dụng Meta, chuyển đến sản phẩm WhatsApp.
2. Thêm số điện thoại của bạn để kiểm tra và xác thực.
3. Tạo một khóa truy cập (Access Token) cho API:
   - Đi đến mục "WhatsApp > Configuration"
   - Tạo khóa truy cập mới và lưu lại.

#### 1.3. Thiết lập Webhook
1. Trong phần cấu hình WhatsApp Business API, chọn "Webhooks".
2. Nhấp "Subscribe to this object".
3. Nhập URL Callback của API của bạn:
   ```
   https://your-api-domain.com/api/webhook/whatsapp
   ```
4. Nhập mã xác minh bạn đã cấu hình trong ứng dụng của mình (biến môi trường `WHATSAPP_VERIFY_TOKEN`).
5. Đăng ký các trường cần theo dõi: 
   - `messages`
   - `message_reactions`
   - `message_deliveries`
   - `message_reads`

#### 1.4. Cập nhật biến môi trường trong ứng dụng của bạn
Thêm các biến môi trường sau vào tệp .env của bạn hoặc cấu hình máy chủ:

```
WHATSAPP_API_TOKEN=your_access_token_from_meta
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_custom_verification_token
```

#### 1.5. Xử lý Webhook
Trong file `routes/webhook.js` của dự án, đảm bảo xử lý đúng các yêu cầu xác minh và sự kiện từ Meta:

```javascript
// Xử lý yêu cầu xác minh từ Meta
app.get('/api/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook được xác minh thành công');
    res.status(200).send(challenge);
  } else {
    console.error('Xác minh webhook thất bại');
    res.sendStatus(403);
  }
});

// Xử lý sự kiện webhook từ Meta
app.post('/api/webhook/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    
    // Kiểm tra xem đây có phải là sự kiện WhatsApp
    if (body.object === 'whatsapp_business_account') {
      // Xử lý dữ liệu tin nhắn
      if (body.entry && body.entry.length > 0) {
        const changes = body.entry[0].changes;
        if (changes && changes.length > 0) {
          const webhookEvent = changes[0].value;
          await handleWhatsAppEvent(webhookEvent);
        }
      }
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Lỗi khi xử lý webhook:', error);
    res.sendStatus(500);
  }
});
```

## 2. Thiết lập Webhook với Twilio

### Yêu cầu cơ bản
- Một tài khoản Twilio
- Đã mua một số điện thoại Twilio hoặc đã cấu hình Sandbox Twilio WhatsApp

### Các bước thực hiện

#### 2.1. Thiết lập Twilio
1. Đăng ký một tài khoản tại [Twilio](https://www.twilio.com/).
2. Mua một số điện thoại hoặc sử dụng Sandbox WhatsApp của Twilio.
3. Lấy các thông tin xác thực:
   - Account SID
   - Auth Token
   - Số điện thoại Twilio

#### 2.2. Cấu hình Webhook cho Twilio
1. Trong bảng điều khiển Twilio, chuyển đến "Phone Numbers" > Chọn số của bạn.
2. Trong phần "Messaging", cấu hình webhook cho tin nhắn:
   - Đặt "A Message Comes In" webhook URL thành:
   ```
   https://your-api-domain.com/api/webhook/twilio
   ```
   - Đảm bảo phương thức HTTP được đặt thành POST.

#### 2.3. Cập nhật biến môi trường trong ứng dụng của bạn
Thêm các biến môi trường sau vào tệp .env của bạn:

```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

#### 2.4. Xử lý Webhook Twilio
Cài đặt thư viện Twilio:

```bash
npm install twilio
```

Thêm xử lý webhook trong `routes/webhook.js`:

```javascript
const twilio = require('twilio');

// Xử lý sự kiện webhook từ Twilio
app.post('/api/webhook/twilio', async (req, res) => {
  try {
    // Xác thực yêu cầu đến từ Twilio
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const requestIsValid = twilio.validateRequest(
      authToken,
      twilioSignature,
      url,
      req.body
    );

    if (!requestIsValid) {
      return res.status(403).send('Yêu cầu không hợp lệ');
    }

    // Xử lý tin nhắn đến
    const messageSid = req.body.MessageSid;
    const from = req.body.From; // Số người gửi
    const body = req.body.Body; // Nội dung tin nhắn

    await handleTwilioMessage(from, body, messageSid);

    // Phản hồi cho Twilio
    const twiml = new twilio.twiml.MessagingResponse();
    res.writeHead(200, {'Content-Type': 'text/xml'});
    res.end(twiml.toString());
  } catch (error) {
    console.error('Lỗi khi xử lý Twilio webhook:', error);
    res.sendStatus(500);
  }
});
```

## 3. Thiết lập Webhook với Telegram

### Yêu cầu cơ bản
- Một tài khoản Telegram
- Đã tạo một bot Telegram qua BotFather

### Các bước thực hiện

#### 3.1. Tạo bot Telegram
1. Mở ứng dụng Telegram và tìm kiếm "@BotFather".
2. Bắt đầu trò chuyện và gửi lệnh `/newbot`.
3. Làm theo hướng dẫn để đặt tên cho bot của bạn.
4. Sau khi hoàn thành, BotFather sẽ cung cấp một token API. Lưu lại token này.

#### 3.2. Thiết lập Webhook cho Telegram
1. Sử dụng API của Telegram để thiết lập một webhook:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-api-domain.com/api/webhook/telegram
```

2. Thay thế `<YOUR_BOT_TOKEN>` bằng token bot của bạn và URL bằng đường dẫn đến webhook của bạn.

#### 3.3. Cập nhật biến môi trường trong ứng dụng của bạn
Thêm các biến môi trường sau vào tệp .env của bạn:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

#### 3.4. Xử lý Webhook Telegram
Cài đặt thư viện node-telegram-bot-api:

```bash
npm install node-telegram-bot-api
```

Thêm xử lý webhook trong `routes/webhook.js`:

```javascript
const TelegramBot = require('node-telegram-bot-api');

// Xử lý sự kiện webhook từ Telegram
app.post('/api/webhook/telegram', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (message) {
      const chatId = message.chat.id;
      const text = message.text;
      
      // Xử lý tin nhắn
      await handleTelegramMessage(chatId, text, message);
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Lỗi khi xử lý Telegram webhook:', error);
    res.sendStatus(500);
  }
});
```

## 4. Xử lý chung cho các Webhook

Để quản lý và xử lý logic nhắn tin cho tất cả các nền tảng, bạn nên tạo một module xử lý chung:

```javascript
// messageHandler.js
const chatbot = require('../services/chatbotService');

// Xử lý tin nhắn từ tất cả các nguồn
async function handleIncomingMessage(platform, userId, message, metadata = {}) {
  try {
    // Ghi log tin nhắn đến
    console.log(`Tin nhắn đến từ ${platform}: ${message}`);
    
    // Xử lý tin nhắn qua chatbot
    const response = await chatbot.processMessage(message, userId, platform, metadata);
    
    // Gửi phản hồi dựa trên nền tảng
    switch (platform) {
      case 'whatsapp':
        await sendWhatsAppMessage(userId, response);
        break;
      case 'twilio':
        await sendTwilioMessage(userId, response);
        break;
      case 'telegram':
        await sendTelegramMessage(userId, response);
        break;
      default:
        console.warn(`Nền tảng không được hỗ trợ: ${platform}`);
    }
    
    return response;
  } catch (error) {
    console.error(`Lỗi khi xử lý tin nhắn từ ${platform}:`, error);
    throw error;
  }
}

module.exports = {
  handleIncomingMessage,
  // Xuất các hàm gửi tin nhắn cụ thể cho từng nền tảng
  handleWhatsAppEvent,
  handleTwilioMessage, 
  handleTelegramMessage
};
```

## 5. Kiểm tra Webhook

Để đảm bảo webhook của bạn hoạt động đúng, thực hiện các bước sau:

1. Triển khai ứng dụng của bạn lên một máy chủ có thể truy cập công khai (hoặc sử dụng dịch vụ như ngrok để tạo tunnel cho môi trường phát triển).

2. Thiết lập webhook như hướng dẫn cho từng nền tảng.

3. Kiểm tra bằng cách gửi tin nhắn thử nghiệm:
   - Gửi tin nhắn đến số WhatsApp Business của bạn
   - Gửi tin nhắn đến số Twilio của bạn
   - Gửi tin nhắn đến bot Telegram của bạn

4. Kiểm tra logs và database để xác nhận rằng tin nhắn được nhận và xử lý đúng cách.

## 6. Xử lý lỗi và gỡ lỗi

Nếu bạn gặp vấn đề với webhook:

1. Kiểm tra logs của ứng dụng để tìm lỗi.
2. Xác minh URL webhook có thể truy cập công khai.
3. Đảm bảo các token xác thực và khóa API được cấu hình chính xác.
4. Kiểm tra các yêu cầu định dạng cụ thể cho từng nền tảng.
5. Sử dụng công cụ như ngrok logs hoặc webhook.site để kiểm tra payload đến.

## 7. Bảo mật Webhook

Để bảo mật webhook của bạn:

1. Luôn sử dụng HTTPS cho các endpoint webhook.
2. Xác thực tất cả các yêu cầu webhook bằng token hoặc chữ ký.
3. Chỉ xử lý các sự kiện cần thiết.
4. Triển khai giới hạn tốc độ để ngăn chặn tấn công DOS.
5. Không hiển thị thông tin nhạy cảm trong logs.

## 8. Tham khảo thêm

- [WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp/api/webhooks)
- [Twilio API Reference](https://www.twilio.com/docs/usage/webhooks)
- [Telegram Bot API](https://core.telegram.org/bots/api#getting-updates) 