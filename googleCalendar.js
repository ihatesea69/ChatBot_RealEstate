const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const path = require('path');
const fs = require('fs');

// Các quyền cần thiết cho Google Calendar API và Sheets API
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  // Scope cho Sheets và Drive có thể không cần nếu chỉ dùng Calendar
  // 'https://www.googleapis.com/auth/spreadsheets',
  // 'https://www.googleapis.com/auth/drive'
];

// Tên của Secret trong AWS Secrets Manager chứa Service Account Key JSON
const SECRET_NAME = process.env.GOOGLE_SERVICE_ACCOUNT_SECRET_NAME || 'google-service-account-key'; // Use environment variable or a default

// Khởi tạo Secrets Manager client (nên làm một lần bên ngoài class nếu có thể)
const secretsManagerClient = new SecretsManagerClient({});

// Hàm để lấy Service Account Key từ Secrets Manager
async function getServiceAccountKey() {
  try {
    const command = new GetSecretValueCommand({ SecretId: SECRET_NAME });
    const data = await secretsManagerClient.send(command);

    if ('SecretString' in data) {
      return JSON.parse(data.SecretString);
    } else {
      // Handle binary secret if necessary, though service account keys are typically JSON strings
      let buff = Buffer.from(data.SecretBinary, 'base64');
      return JSON.parse(buff.toString('ascii'));
    }
  } catch (error) {
    console.error(`Error retrieving secret ${SECRET_NAME}:`, error);
    throw new Error(`Could not retrieve Google Service Account key from Secrets Manager: ${error.message}`);
  }
}

class GoogleCalendarService {
  constructor() {
    this.auth = null;
    this.calendar = null;
    this.isInitialized = false; // Flag to track initialization
  }

  async initialize() {
    if (this.isInitialized) {
      // console.log('Google Calendar Service already initialized.');
      return; // Already initialized
    }
    console.log('Initializing Google Calendar Service...');
    try {
      const keyFileContent = await getServiceAccountKey();

      // Sử dụng GoogleAuth với Service Account Key
      this.auth = new GoogleAuth({
        credentials: {
          client_email: keyFileContent.client_email,
          private_key: keyFileContent.private_key,
        },
        scopes: SCOPES,
      });

      // Lấy auth client
      const authClient = await this.auth.getClient();

      // Khởi tạo Google Calendar API client
      this.calendar = google.calendar({ version: 'v3', auth: authClient });
      this.isInitialized = true; // Set flag after successful initialization
      console.log('Google Calendar Service initialized successfully.');
      // Không cần trả về auth nữa vì nó được lưu trong instance
      // return this.auth;
    } catch (error) {
      console.error('Error initializing Google Calendar with Service Account:', error);
      this.isInitialized = false; // Ensure flag is false on error
      // Rethrow the error or handle it as appropriate for Lambda (e.g., return an error response)
      throw error;
    }
  }

  async scheduleMeeting(summary, description, startTime, duration, attendees) {
    try {
      // Đảm bảo API được khởi tạo - gọi initialize nếu chưa
      if (!this.isInitialized) {
        console.log('Google Calendar API not initialized, initializing now...');
        await this.initialize();
      }
      // Thêm kiểm tra sau khi gọi initialize phòng trường hợp initialize thất bại
      if (!this.calendar) {
         throw new Error('Google Calendar client is not available after initialization attempt.');
      }

      console.log(`Creating meeting with attendees: ${JSON.stringify(attendees)}`);
      
      // Tạo ID duy nhất cho conference request
      const requestId = `meet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      console.log(`Conference request ID: ${requestId}`);
      
      const event = {
        summary: summary,
        description: description,
        start: {
          dateTime: startTime,
          timeZone: 'Asia/Dubai',
        },
        end: {
          dateTime: new Date(new Date(startTime).getTime() + duration * 60000).toISOString(),
          timeZone: 'Asia/Dubai',
        },
        attendees: attendees.map(email => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        },
        // Thêm nhắc nhở mặc định (ví dụ: popup 10 phút trước khi bắt đầu)
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', 'minutes': 10 },
            // { method: 'email', 'minutes': 30 } // Có thể thêm nhắc nhở qua email
          ],
        },
      };

      console.log(`Sending request to Google Calendar API: ${JSON.stringify(event)}`);

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all'  // Đảm bảo gửi email tới người tham gia
      });
      
      console.log('Google Calendar API response:', JSON.stringify(response.data));

      // Điều chỉnh dữ liệu trả về để phù hợp với cách dùng trong index.js
      const result = {
        meetLink: response.data.hangoutLink,
        joinUrl: response.data.hangoutLink,  // Thêm trường này để đảm bảo tương thích
        eventId: response.data.id,
        eventSummary: response.data.summary,
        startTime: response.data.start.dateTime,
        endTime: response.data.end.dateTime,
        attendees: response.data.attendees || []
      };
      
      console.log('Formatted meeting details:', JSON.stringify(result));
      return result;
    } catch (error) {
      console.error('Error scheduling meeting:', error);
      if (error.response) {
        console.error('Google API error details:', JSON.stringify(error.response.data));
      }
      // Trong môi trường Lambda, nên throw error để Lambda xử lý hoặc trả về lỗi cụ thể
      throw error;
    }
  }

  async cancelMeeting(eventId) {
    try {
      if (!this.isInitialized) {
        console.log('Google Calendar API not initialized, initializing now...');
        await this.initialize();
      }
       if (!this.calendar) {
         throw new Error('Google Calendar client is not available after initialization attempt.');
      }

      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendUpdates: 'all' // Thông báo cho người tham dự về việc hủy
      });
      console.log(`Successfully cancelled event: ${eventId}`);
      return true;
    } catch (error) {
      console.error(`Error canceling meeting ${eventId}:`, error);
      // Check for specific errors, e.g., event not found (error.code === 404 or 410)
       if (error.code === 404 || error.code === 410) {
         console.warn(`Event ${eventId} not found or already deleted.`);
         return false; // Indicate event was not found or already gone
       }
      throw error; // Rethrow other errors
    }
  }
}

// Xuất một instance duy nhất để tái sử dụng trong Lambda runtime
module.exports = new GoogleCalendarService(); 