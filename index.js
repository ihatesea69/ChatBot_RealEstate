require('dotenv').config();

// AWS SDK Clients (Initialize outside handler for reuse)
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda"); // To invoke other lambdas like Google Calendar
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

// Other requires (keep relevant ones)
// const { OpenAI } = require('openai'); // Remove if only using Bedrock
const googleCalendar = require('./googleCalendar'); // Keep refactored service
const crmService = require('./crmService'); // Keep, may need refactoring later
const ragService = require('./ragService'); // Keep, may need refactoring later
const textToSpeech = require('./textToSpeech'); // Keep, may need refactoring later
const fs = require('fs'); // Keep for potential temp file handling (e.g., voice memos)
const path = require('path');
// const { spawn } = require('child_process'); // Remove, avoid child processes in Lambda
// const util = require('util'); // Remove if exec is not needed
// const exec = util.promisify(require('child_process').exec); // Remove
const fetch = require('node-fetch'); // Keep if needed for external API calls (e.g., WhatsApp provider)
const FormData = require('form-data'); // Keep if needed for file uploads

const bedrockService = require('./bedrockService'); // Keep refactored Bedrock service
const TranscribeService = require('./transcribeService'); // Keep, may need refactoring

// Import các service mới tạo
const VoiceMemoProcessor = require('./voiceMemo');
const SchedulingService = require('./schedulingService');
const BedrockResponseService = require('./bedrockResponseService');

// --- AWS Clients Initialization ---
// Use environment variables set by Lambda runtime
const region = process.env.AWS_REGION || 'us-east-1';
const dynamoDBClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const lambdaClient = new LambdaClient({ region });
const secretsManagerClient = new SecretsManagerClient({ region });

// --- Configuration --- (Load from environment variables/Secrets Manager)
const CONVERSATION_HISTORY_TABLE_NAME = process.env.CONVERSATION_HISTORY_TABLE_NAME || 'ChatHistory';
const GOOGLE_CALENDAR_LAMBDA_NAME = process.env.GOOGLE_CALENDAR_LAMBDA_NAME; // e.g., 'google-calendar-handler-dev'
const WHATSAPP_PROVIDER_API_KEY_SECRET_NAME = process.env.WHATSAPP_PROVIDER_API_KEY_SECRET_NAME; // e.g., 'whatsapp-twilio-api-key'
const WHATSAPP_PROVIDER_SEND_API_URL = process.env.WHATSAPP_PROVIDER_SEND_API_URL; // URL to send messages
const WHATSAPP_PROVIDER_PHONE_NUMBER = process.env.WHATSAPP_PROVIDER_PHONE_NUMBER; // The bot's WhatsApp number

const MAX_HISTORY_LENGTH = 10; // Max user/assistant pairs

// Thêm bảng DynamoDB cho state
const USER_STATE_TABLE_NAME = process.env.USER_STATE_TABLE_NAME || 'UserState';

// Constants cho system prompt
const SYSTEM_PROMPT_SECRET_NAME = process.env.SYSTEM_PROMPT_SECRET_NAME || 'dubai-real-estate-system-prompt';

// --- Initialize Services (outside handler) ---
// Initialize Bedrock Service (Ensure it uses IAM role credentials implicitly)
const bedrock = new bedrockService({ region: region /* , defaultModel: ... */ });

// Initialize Transcribe Service (Ensure it uses IAM role credentials)
const transcribeService = new TranscribeService({ region: region });

// Khởi tạo các service mới
const voiceMemoProcessor = new VoiceMemoProcessor(transcribeService);
const bedrockResponseService = new BedrockResponseService(bedrock);

// Other services like CRM, RAG, TTS might need similar initialization adjustments
// async function initializeServices() { ... } // This function is no longer needed in the same way

// --- Helper Functions (Adapted for DynamoDB) ---

// Function to get secrets (cache in memory for the lifetime of the container)
const secretCache = {};
async function getSecret(secretName) {
  if (secretCache[secretName]) {
    return secretCache[secretName];
  }
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const data = await secretsManagerClient.send(command);
    let secretValue;
    if ('SecretString' in data) {
      secretValue = data.SecretString;
    } else {
      let buff = Buffer.from(data.SecretBinary, 'base64');
      secretValue = buff.toString('ascii');
    }
    secretCache[secretName] = secretValue; // Cache the secret
    return secretValue;
  } catch (error) {
    console.error(`Error retrieving secret ${secretName}:`, error);
    throw new Error(`Could not retrieve secret ${secretName}: ${error.message}`);
  }
}

// Function to save conversation history to DynamoDB
async function saveConversationHistory(phone, role, content) {
  const timestamp = Date.now();
  const params = {
    TableName: CONVERSATION_HISTORY_TABLE_NAME,
    Item: {
      phoneNumber: phone, // Partition Key
      timestamp: timestamp, // Sort Key
      role: role,
      content: content,
      // Add TTL attribute if you want auto-deletion of old records
      // ttl: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30) // Example: 30 days TTL
    }
  };
  try {
    await docClient.send(new PutCommand(params));
    console.log(`Saved history for ${phone} to DynamoDB`);
  } catch (error) {
    console.error(`Error saving history for ${phone} to DynamoDB:`, error);
    // Handle error appropriately
  }
}

// Function to get conversation history from DynamoDB
async function getConversationHistory(phone) {
  const params = {
    TableName: CONVERSATION_HISTORY_TABLE_NAME,
    KeyConditionExpression: "phoneNumber = :phone",
    ExpressionAttributeValues: {
      ":phone": phone
    },
    ScanIndexForward: false, // Get latest messages first
    Limit: MAX_HISTORY_LENGTH * 2 // Fetch enough messages (user + assistant)
  };

  try {
    const data = await docClient.send(new QueryCommand(params));
    // Reverse the items to get chronological order (oldest first)
    return data.Items ? data.Items.reverse() : [];
  } catch (error) {
    console.error(`Error getting history for ${phone} from DynamoDB:`, error);
    return []; // Return empty history on error
  }
}

// Remove file-based history loading/saving
// const HISTORY_FILE_PATH = path.join(process.cwd(), 'conversation_histories.json');
// function loadConversationHistories() { ... }
// function saveConversationHistoriesToDisk() { ... }
// setInterval(saveConversationHistoriesToDisk, 5 * 60 * 1000);

// Remove state variables that should be managed elsewhere (e.g., DynamoDB)
// const conversationHistories = {};
// const pendingEmailConfirmation = {};
// const userEmails = {};

// --- WhatsApp Sending Function (Example using Twilio API - adapt to your provider) ---
async function sendWhatsAppMessage(to, body, mediaUrl = null) {
  console.log(`Attempting to send message to ${to}: ${body.substring(0, 50)}...`);
  if (!WHATSAPP_PROVIDER_SEND_API_URL || !WHATSAPP_PROVIDER_API_KEY_SECRET_NAME || !WHATSAPP_PROVIDER_PHONE_NUMBER) {
      console.error('WhatsApp provider environment variables not configured!');
      return; // Cannot send message
  }

  try {
    const apiKey = await getSecret(WHATSAPP_PROVIDER_API_KEY_SECRET_NAME);
    // This is a simplified example for Twilio API - structure will vary by provider
    const accountSid = process.env.TWILIO_ACCOUNT_SID; // Twilio specific
    const authToken = apiKey; // Assuming the secret is the auth token

    const messageData = {
      To: `whatsapp:${to}`,
      From: `whatsapp:${WHATSAPP_PROVIDER_PHONE_NUMBER}`,
      Body: body,
    };

    if (mediaUrl) {
      messageData.MediaUrl = [mediaUrl];
      delete messageData.Body; // Can't send both Body and MediaUrl with Twilio usually
    }

    const response = await fetch(WHATSAPP_PROVIDER_SEND_API_URL.replace('{AccountSid}', accountSid), { // Replace placeholder if needed
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(messageData).toString()
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`Error sending WhatsApp message to ${to}: ${response.status} ${response.statusText}`, responseData);
      // Handle specific errors if possible
    } else {
      console.log(`Message sent successfully to ${to}. SID: ${responseData.sid}`);
    }
  } catch (error) {
    console.error(`Failed to send WhatsApp message to ${to}:`, error);
  }
}

// Remove OpenAI client initialization if not used
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Remove DUBAI_REAL_ESTATE_PROMPT - This should be loaded dynamically or configured per tenant/agent
// const DUBAI_REAL_ESTATE_PROMPT = `...`;

// Remove client initialization and event listeners
// const client = new Client({ ... });
// client.on('qr', ...);
// client.on('authenticated', ...);
// client.on('auth_failure', ...);
// client.on('ready', ...);
// client.on('message', ...);

// --- 1. Hàm xử lý voice memo ---
async function handleVoiceMemo(mediaUrl, senderPhoneNumber) {
  if (!mediaUrl) {
    console.error('No media URL provided for transcription');
    return null;
  }

  console.log(`Processing voice memo from ${senderPhoneNumber} at URL: ${mediaUrl}`);
  try {
    // 1. Tải file audio
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
    }
    
    // Tạo thư mục /tmp (Lambda có quyền ghi vào /tmp)
    const tempDir = '/tmp';
    const audioFileName = `voice_${Date.now()}.ogg`; // hoặc định dạng phù hợp
    const audioFilePath = path.join(tempDir, audioFileName);
    
    // 2. Lưu file vào /tmp
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(audioFilePath, buffer);
    console.log(`Audio file saved to ${audioFilePath}, size: ${buffer.length} bytes`);

    // 3. Transcribe audio file (sử dụng TranscribeService đã refactor)
    let transcribedText = '';
    try {
      // Cần đảm bảo transcribeService hỗ trợ file path hoặc buffer
      transcribedText = await transcribeService.transcribeAudio(buffer, audioFileName);
      console.log(`Transcription result: ${transcribedText}`);
    } catch (transcribeError) {
      console.error('Error transcribing audio:', transcribeError);
      // Xóa file tạm thời nếu có lỗi
      try { fs.unlinkSync(audioFilePath); } catch (e) { console.error('Error deleting temp file:', e); }
      throw transcribeError;
    }

    // 4. Xóa file tạm sau khi hoàn thành
    try {
      fs.unlinkSync(audioFilePath);
      console.log(`Deleted temp file ${audioFilePath}`);
    } catch (deleteError) {
      console.error(`Failed to delete temp file: ${deleteError}`);
      // Continue execution even if file deletion fails
    }

    // 5. Trả lại kết quả transcribe
    return transcribedText || null;
  } catch (error) {
    console.error('Error in handleVoiceMemo:', error);
    return null;
  }
}

// --- 2. Quản lý state qua DynamoDB ---

// Lưu state của người dùng
async function saveUserState(phoneNumber, stateData) {
  const params = {
    TableName: USER_STATE_TABLE_NAME,
    Item: {
      phoneNumber: phoneNumber, // Partition key
      updatedAt: Date.now(), // Sort key hoặc attribute
      ...stateData // Spread tất cả key-value pairs từ stateData
    }
  };
  
  try {
    await docClient.send(new PutCommand(params));
    console.log(`User state saved for ${phoneNumber}`);
  } catch (error) {
    console.error(`Error saving user state for ${phoneNumber}:`, error);
    throw error; // Rethrow để hàm gọi có thể xử lý
  }
}

// Lấy state của người dùng
async function getUserState(phoneNumber) {
  const params = {
    TableName: USER_STATE_TABLE_NAME,
    Key: {
      phoneNumber: phoneNumber
    }
  };
  
  try {
    const { Item } = await docClient.send(new GetCommand(params));
    return Item || {}; // Trả về object rỗng nếu không tìm thấy
  } catch (error) {
    console.error(`Error getting user state for ${phoneNumber}:`, error);
    return {}; // Trả về object rỗng nếu có lỗi
  }
}

// --- 3. Tạo hàm gọi Bedrock ---
async function generateBedrockResponse(history, systemPrompt) {
  try {
    // Cấu trúc messages cho Bedrock
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(msg => ({ 
        role: msg.role, 
        content: msg.content 
      }))
    ];
    
    console.log(`Sending ${messages.length} messages to Bedrock`);
    
    // Gọi Bedrock thông qua service đã refactor
    const response = await bedrock.chatCompletion(messages, {
      max_tokens: 2000,
      temperature: 0.7
    });
    
    if (!response || !response.choices || !response.choices[0]) {
      console.error('Invalid response from Bedrock:', response);
      throw new Error('Invalid response format from Bedrock');
    }
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating Bedrock response:', error);
    return "I apologize, but I'm having trouble processing your request right now. Please try again later.";
  }
}

// --- 4. Parse lịch hẹn từ tin nhắn ---
function detectSchedulingIntent(message) {
  // Kiểm tra những từ khóa phổ biến liên quan đến lịch hẹn
  const schedulingKeywords = [
    'schedule', 'appointment', 'meeting', 'book', 'reserve',
    'calendar', 'availability', 'available', 'time', 'date',
    'call', 'meeting', 'consultation', 'viewing', 'visit'
  ];
  
  const lowerMsg = message.toLowerCase();
  return schedulingKeywords.some(keyword => lowerMsg.includes(keyword));
}

function parseEmailFromMessage(message) {
  // Regular expression cơ bản để tìm email
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
  const match = message.match(emailRegex);
  
  return match ? match[0] : null;
}

async function handleSchedulingRequest(senderPhoneNumber, userMessage, botResponse) {
  try {
    // 1. Kiểm tra nếu có ý định lên lịch
    if (!detectSchedulingIntent(userMessage) && !detectSchedulingIntent(botResponse)) {
      return { handled: false, updatedResponse: botResponse };
    }
    
    console.log('Scheduling intent detected');
    
    // 2. Lấy state hiện tại của user
    const userState = await getUserState(senderPhoneNumber);
    
    // 3. Kiểm tra xem đã có email chưa
    let userEmail = userState.email;
    
    // 4. Nếu chưa có email, kiểm tra trong tin nhắn hiện tại
    if (!userEmail) {
      const emailFromMessage = parseEmailFromMessage(userMessage);
      
      if (emailFromMessage) {
        // Cập nhật state với email mới
        userEmail = emailFromMessage;
        await saveUserState(senderPhoneNumber, { 
          ...userState, 
          email: userEmail,
          pendingEmailConfirmation: false 
        });
      } else {
        // Chưa có email, cần yêu cầu
        await saveUserState(senderPhoneNumber, {
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
      const emailFromMessage = parseEmailFromMessage(userMessage);
      
      if (emailFromMessage) {
        userEmail = emailFromMessage;
        await saveUserState(senderPhoneNumber, {
          ...userState,
          email: userEmail,
          pendingEmailConfirmation: false
        });
        
        // Thông báo đã nhận email và tiếp tục quá trình đặt lịch
        const confirmEmailMsg = `Thank you! I've saved your email (${userEmail}). Now I can schedule our meeting and send you the invitation.`;
        
        // Tiếp tục với quá trình đặt lịch
        const meetingDetails = await scheduleAppointment(userEmail);
        const meetingResponse = formatMeetingResponse(meetingDetails, userEmail);
        
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
      const meetingDetails = await scheduleAppointment(userEmail);
      const meetingResponse = formatMeetingResponse(meetingDetails, userEmail);
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

async function scheduleAppointment(email) {
  try {
    // Tạo thời gian dự kiến (24 giờ sau)
    const meetingTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    console.log(`Proposed meeting time: ${meetingTime.toISOString()}`);
    
    // Gọi Google Calendar Lambda
    const meetingDetails = await invokeGoogleCalendarLambda('schedule', {
      summary: 'Dubai Real Estate Consultation',
      description: 'Property consultation meeting with potential client',
      startTime: meetingTime.toISOString(),
      duration: 60, // 60 phút
      attendees: [email]
    });
    
    // Log kết quả
    console.log('Meeting scheduled successfully:', JSON.stringify(meetingDetails));
    
    return meetingDetails;
  } catch (error) {
    console.error('Error scheduling appointment:', error);
    throw error; // Rethrow để hàm gọi xử lý
  }
}

function formatMeetingResponse(meetingDetails, email) {
  // Format để hiển thị thông tin cuộc họp
  const meetLink = meetingDetails.meetLink || meetingDetails.joinUrl || "Check your email for meeting details";
  
  const meetingInfo = `I've scheduled a video consultation for you:\n\n` +
    `📅 Date: ${new Date(meetingDetails.startTime).toLocaleString()}\n` +
    `🔗 Meeting Link: ${meetLink}\n\n` +
    `Please click the link at the scheduled time to join the consultation. A calendar invitation has also been sent to your email (${email}).`;
  
  return meetingInfo;
}

// --- Cập nhật Main Lambda Handler ---
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // --- 1. Parse Incoming Message (giữ nguyên) --- 
  let incomingMsgBody = '';
  let senderPhoneNumber = '';
  let mediaUrl = null;
  let mediaContentType = null;

  try {
    // Parse webhook từ provider (ví dụ: Twilio)
    const params = new URLSearchParams(event.body);
    incomingMsgBody = params.get('Body');
    senderPhoneNumber = params.get('From')?.replace('whatsapp:', '');
    const numMedia = parseInt(params.get('NumMedia') || '0');

    if (!senderPhoneNumber) {
        console.error('Could not extract sender phone number from request body.');
        return { statusCode: 400, body: 'Bad Request: Missing sender information.' };
    }

    console.log(`Message from ${senderPhoneNumber}: ${incomingMsgBody}`);

    // Xử lý tin nhắn có media (nếu có)
    if (numMedia > 0) {
        mediaUrl = params.get('MediaUrl0');
        mediaContentType = params.get('MediaContentType0');
        console.log(`Received media: ${mediaContentType} at ${mediaUrl}`);
        
        // Nếu là audio/voice memo
        if (mediaContentType && mediaContentType.startsWith('audio/')) {
            console.log('Audio message received, transcribing...');
            // Xử lý voice memo
            const transcribedText = await voiceMemoProcessor.handleVoiceMemo(mediaUrl, senderPhoneNumber);
            
            if (transcribedText && transcribedText.trim() !== '') {
                console.log(`Successfully transcribed: "${transcribedText}"`);
                incomingMsgBody = transcribedText;
            } else {
                // Nếu không thể transcribe, gửi thông báo lỗi
                incomingMsgBody = "[Could not transcribe audio message]";
                
                // Gửi thông báo cho người dùng về vấn đề transription
                await sendWhatsAppMessage(
                    senderPhoneNumber, 
                    "I'm sorry, I had trouble understanding your voice message. Could you please send your message as text instead?"
                );
            }
          } else {
            // Xử lý các loại media khác nếu cần
            incomingMsgBody = incomingMsgBody || "[Media Message]";
        }
    } 
    
    // Kiểm tra tin nhắn trống
    if (!incomingMsgBody && !mediaUrl) {
        console.warn('Received empty message body and no media.');
        const twilioResponse = '<Response></Response>';
        return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twilioResponse };
    }

  } catch (error) {
    console.error('Error parsing incoming webhook request:', error);
    return { statusCode: 400, body: 'Bad Request: Could not parse request.' };
  }

  // --- 2. Process Message Logic (Cập nhật) --- 
  try {
      // Lưu tin nhắn người dùng vào lịch sử
      await saveConversationHistory(senderPhoneNumber, 'user', incomingMsgBody);

      // Lấy lịch sử cuộc trò chuyện từ DynamoDB
      const history = await getConversationHistory(senderPhoneNumber);
      
      // Lấy system prompt từ Secrets Manager
      let systemPrompt;
      try {
        systemPrompt = await getSecret(SYSTEM_PROMPT_SECRET_NAME);
      } catch (secretError) {
        console.warn(`Could not retrieve system prompt from secrets, using default: ${secretError.message}`);
        // Default prompt nếu không lấy được từ Secrets Manager
        systemPrompt = `You are a friendly and professional real estate assistant in Dubai. Your role is to help clients with their property inquiries.

Guidelines:
1. Be concise and clear in your responses
2. Focus on Dubai real estate market
3. Provide factual information
4. Maintain a professional tone
5. If you don't know something, say so
6. Always respond in English

Remember to be helpful and welcoming to new clients.`;
      }
      
      // Gọi Bedrock để lấy response
      console.log("Calling Bedrock service...");
      let botResponse = await bedrockResponseService.generateResponse(history, systemPrompt);
      console.log(`Bedrock response: ${botResponse.substring(0, 100)}...`);

      // Kiểm tra và xử lý yêu cầu lên lịch
      const userState = await getUserState(senderPhoneNumber);
      const scheduling = await handleSchedulingRequest(senderPhoneNumber, incomingMsgBody, botResponse);
      
      if (scheduling.handled) {
        botResponse = scheduling.updatedResponse;
        console.log('Scheduling handled, updated response');
      }

      // Tùy chọn: Log cuộc trò chuyện vào CRM
      try {
        await crmService.logConversation(senderPhoneNumber, incomingMsgBody, false);
        await crmService.logConversation(senderPhoneNumber, botResponse, true);
      } catch (crmError) {
        console.error('Error logging to CRM:', crmError);
        // Continue execution even if CRM logging fails
      }

      // Lưu phản hồi của bot vào lịch sử
      await saveConversationHistory(senderPhoneNumber, 'assistant', botResponse);
      
      // Gửi phản hồi qua WhatsApp API
      await sendWhatsAppMessage(senderPhoneNumber, botResponse);

      // Trả về response cho API Gateway
      const twilioResponse = '<Response></Response>';
      return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twilioResponse };

      } catch (error) {
      console.error('Error processing message:', error);
      // Gửi thông báo lỗi cho người dùng
      try {
          await sendWhatsAppMessage(senderPhoneNumber, "Sorry, I encountered an error processing your request. Please try again later.");
      } catch (sendError) {
          console.error('Failed to send error message to user:', sendError);
      }
      // Trả về response cho API Gateway
      const twilioResponse = '<Response></Response>';
      return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twilioResponse };
  }
};

// Placeholder/Helper for invoking Google Calendar Lambda (implement properly)
async function invokeGoogleCalendarLambda(action, details) {
    if (!GOOGLE_CALENDAR_LAMBDA_NAME) {
        console.error('GOOGLE_CALENDAR_LAMBDA_NAME environment variable is not set.');
        throw new Error('Google Calendar Lambda integration is not configured.');
    }
    const payload = {
        action: action, // e.g., 'schedule', 'cancel'
        details: details // e.g., { summary, description, startTime, duration, attendees } or { eventId }
    };

    const command = new InvokeCommand({
        FunctionName: GOOGLE_CALENDAR_LAMBDA_NAME,
        Payload: JSON.stringify(payload),
        InvocationType: 'RequestResponse' // Wait for the result
    });

    try {
        const { Payload } = await lambdaClient.send(command);
        const result = JSON.parse(Buffer.from(Payload).toString());
        console.log('Google Calendar Lambda response:', result);
        
        // Check if the invoked Lambda returned an error
        if (result.statusCode && result.statusCode >= 400) {
             throw new Error(`Google Calendar Lambda failed: ${result.body || 'Unknown error'}`);
        } 
        // Assuming the invoked lambda returns the meeting details directly in the body if successful
        // Adjust based on the actual return structure of your googleCalendar lambda
        else if (result.body) { 
           return JSON.parse(result.body);
        } else {
            return result; // Return the raw result if body is not the primary content
        }

    } catch (error) {
        console.error(`Error invoking Google Calendar Lambda (${GOOGLE_CALENDAR_LAMBDA_NAME}):`, error);
        throw error; // Re-throw the error to be handled by the main handler
    }
}

// --- Remaining Functions to Refactor/Implement ---
// async function processIncomingMessage(client, message, text) { ... } // Logic moved into handler
// function calculateTypingDelay(message) { ... } // Not applicable with API
// async function sendDelayedReply(message, reply) { ... } // Not applicable with API
// async function sendMessage(userText, phone, previousMessages = [], crm_id = null) { ... } // Logic moved into handler/Bedrock call
// async function handleVoiceMemo(msg, phoneNumber, msgBody) { ... } // Needs implementation using TranscribeService
// async function scheduleMeetingWithEmail(message, email) { ... } // Logic to be integrated into main processing flow
// async function logToCRM(...) // Keep, but ensure crmService is adapted for Lambda

console.log('Lambda function initialized.'); // Log when the container initializes

// TODO: Implement handleVoiceMemo using TranscribeService
// TODO: Integrate Bedrock call logic within the handler
// TODO: Integrate scheduling logic (parsing intent, calling invokeGoogleCalendarLambda) within the handler
// TODO: Refactor crmService, ragService, textToSpeech for Lambda environment (credentials, state)
// TODO: Implement actual WhatsApp message sending logic based on provider
// TODO: Add proper error handling and response formatting for API Gateway
