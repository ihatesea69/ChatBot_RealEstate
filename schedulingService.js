// Scheduling service cho phần xử lý lên lịch hẹn

class SchedulingService {
  constructor(dynamoClient, lambdaInvoker, tableName) {
    this.dynamoClient = dynamoClient; // DynamoDBDocumentClient
    this.lambdaInvoker = lambdaInvoker; // Hàm invokeGoogleCalendarLambda
    this.userStateTableName = tableName;
  }

  /**
   * Phát hiện ý định lên lịch từ tin nhắn
   * @param {string} message Tin nhắn cần kiểm tra
   * @returns {boolean} true nếu có ý định lên lịch
   */
  detectSchedulingIntent(message) {
    if (!message) return false;
    
    // Danh sách từ khóa phổ biến liên quan đến lịch hẹn
    const schedulingKeywords = [
      'schedule', 'appointment', 'meeting', 'book', 'reserve',
      'calendar', 'availability', 'available', 'time', 'date',
      'call', 'consultation', 'viewing', 'visit'
    ];
    
    const lowerMsg = message.toLowerCase();
    return schedulingKeywords.some(keyword => lowerMsg.includes(keyword));
  }

  /**
   * Tìm địa chỉ email từ tin nhắn
   * @param {string} message Tin nhắn cần tìm
   * @returns {string|null} Địa chỉ email hoặc null
   */
  parseEmailFromMessage(message) {
    if (!message) return null;
    
    // Regular expression cơ bản để tìm email
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
    const match = message.match(emailRegex);
    
    return match ? match[0] : null;
  }

  /**
   * Lưu thông tin state của người dùng vào DynamoDB
   * @param {string} phoneNumber Số điện thoại người dùng
   * @param {Object} stateData Dữ liệu state cần lưu
   */
  async saveUserState(phoneNumber, stateData) {
    const params = {
      TableName: this.userStateTableName,
      Item: {
        phoneNumber: phoneNumber, // Partition key
        updatedAt: Date.now(),
        ...stateData // Spread all key-value pairs from stateData
      }
    };
    
    try {
      await this.dynamoClient.send(new PutCommand(params));
      console.log(`User state saved for ${phoneNumber}`);
    } catch (error) {
      console.error(`Error saving user state for ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Lấy thông tin state của người dùng từ DynamoDB
   * @param {string} phoneNumber Số điện thoại người dùng
   * @returns {Object} Thông tin state
   */
  async getUserState(phoneNumber) {
    const params = {
      TableName: this.userStateTableName,
      Key: {
        phoneNumber: phoneNumber
      }
    };
    
    try {
      const { Item } = await this.dynamoClient.send(new GetCommand(params));
      return Item || {}; // Return empty object if not found
    } catch (error) {
      console.error(`Error getting user state for ${phoneNumber}:`, error);
      return {}; // Return empty object on error
    }
  }

  /**
   * Xử lý yêu cầu lên lịch hẹn
   * @param {string} senderPhoneNumber Số điện thoại người gửi
   * @param {string} userMessage Tin nhắn của người dùng
   * @param {string} botResponse Phản hồi gốc từ bot
   * @returns {Object} { handled: boolean, updatedResponse: string }
   */
  async handleSchedulingRequest(senderPhoneNumber, userMessage, botResponse) {
    try {
      // 1. Kiểm tra nếu có ý định lên lịch
      if (!this.detectSchedulingIntent(userMessage) && !this.detectSchedulingIntent(botResponse)) {
        return { handled: false, updatedResponse: botResponse };
      }
      
      console.log('Scheduling intent detected');
      
      // 2. Lấy state hiện tại của user
      const userState = await this.getUserState(senderPhoneNumber);
      
      // 3. Kiểm tra xem đã có email chưa
      let userEmail = userState.email;
      
      // 4. Nếu chưa có email, kiểm tra trong tin nhắn hiện tại
      if (!userEmail) {
        const emailFromMessage = this.parseEmailFromMessage(userMessage);
        
        if (emailFromMessage) {
          // Cập nhật state với email mới
          userEmail = emailFromMessage;
          await this.saveUserState(senderPhoneNumber, { 
            ...userState, 
            email: userEmail,
            pendingEmailConfirmation: false 
          });
        } else {
          // Chưa có email, cần yêu cầu
          await this.saveUserState(senderPhoneNumber, {
            ...userState,
            pendingEmailConfirmation: true
          });
          
          // Trả về thông báo yêu cầu email
          const askEmailMsg = "I'd be happy to schedule a meeting. First, please provide your email address so I can send you the calendar invitation.";
          return { handled: true, updatedResponse: askEmailMsg };
        }
      }
      
      // 5. Nếu đang chờ email và nhận được email
      if (userState.pendingEmailConfirmation) {
        const emailFromMessage = this.parseEmailFromMessage(userMessage);
        
        if (emailFromMessage) {
          userEmail = emailFromMessage;
          await this.saveUserState(senderPhoneNumber, {
            ...userState,
            email: userEmail,
            pendingEmailConfirmation: false
          });
          
          // Thông báo đã nhận email và tiếp tục quá trình đặt lịch
          const confirmEmailMsg = `Thank you! I've saved your email (${userEmail}). Now I can schedule our meeting and send you the invitation.`;
          
          // Tiếp tục với quá trình đặt lịch
          const meetingDetails = await this.scheduleAppointment(userEmail);
          const meetingResponse = this.formatMeetingResponse(meetingDetails, userEmail);
          
          // Trả về cả thông báo xác nhận email và thông tin cuộc họp
          return { handled: true, updatedResponse: `${confirmEmailMsg}\n\n${meetingResponse}` };
        } else {
          // Vẫn chờ email nhưng chưa nhận được
          const askAgainMsg = "That doesn't look like a valid email address. Please provide a valid email so I can send you the meeting invitation.";
          return { handled: true, updatedResponse: askAgainMsg };
        }
      }
      
      // 6. Đã có email, tiến hành đặt lịch
      if (userEmail) {
        const meetingDetails = await this.scheduleAppointment(userEmail);
        const meetingResponse = this.formatMeetingResponse(meetingDetails, userEmail);
        return { handled: true, updatedResponse: meetingResponse };
      }
      
      // 7. Mặc định không xử lý
      return { handled: false, updatedResponse: botResponse };
    } catch (error) {
      console.error('Error in handleSchedulingRequest:', error);
      return { 
        handled: true, 
        updatedResponse: "I'm sorry, I encountered an error while trying to schedule your appointment. Please try again later."
      };
    }
  }

  /**
   * Tạo lịch hẹn thông qua Google Calendar
   * @param {string} email Email của người tham dự
   * @returns {Object} Thông tin cuộc họp đã tạo
   */
  async scheduleAppointment(email) {
    try {
      // Tạo thời gian dự kiến (24 giờ sau)
      const meetingTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      console.log(`Proposed meeting time: ${meetingTime.toISOString()}`);
      
      // Gọi Google Calendar Lambda
      const meetingDetails = await this.lambdaInvoker('schedule', {
        summary: 'Dubai Real Estate Consultation',
        description: 'Property consultation meeting with potential client',
        startTime: meetingTime.toISOString(),
        duration: 60, // 60 phút
        attendees: [email]
      });
      
      console.log('Meeting scheduled successfully:', JSON.stringify(meetingDetails));
      
      return meetingDetails;
    } catch (error) {
      console.error('Error scheduling appointment:', error);
      throw error;
    }
  }

  /**
   * Format thông tin cuộc họp để hiển thị
   * @param {Object} meetingDetails Thông tin cuộc họp từ Google Calendar
   * @param {string} email Email người tham dự
   * @returns {string} Thông tin đã format
   */
  formatMeetingResponse(meetingDetails, email) {
    const meetLink = meetingDetails.meetLink || meetingDetails.joinUrl || "Check your email for meeting details";
    
    const meetingInfo = `I've scheduled a video consultation for you:\n\n` +
      `📅 Date: ${new Date(meetingDetails.startTime).toLocaleString()}\n` +
      `🔗 Meeting Link: ${meetLink}\n\n` +
      `Please click the link at the scheduled time to join the consultation. A calendar invitation has also been sent to your email (${email}).`;
    
    return meetingInfo;
  }
}

module.exports = SchedulingService; 