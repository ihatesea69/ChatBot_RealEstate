/**
 * Amazon Bedrock Service
 * Tích hợp Amazon Bedrock Nova models vào chatbot
 */

const { 
  BedrockRuntimeClient, 
  InvokeModelCommand 
} = require('@aws-sdk/client-bedrock-runtime');
require('dotenv').config();
const path = require('path');
const fs = require('fs');

/**
 * Dịch vụ Amazon Bedrock để xử lý các yêu cầu chat completion
 * 
 * DeepSeek R1 (us.deepseek.r1-v1:0):
 * - Context window: 128K tokens (một trong những context window lớn nhất trên thị trường)
 * - Ngôn ngữ hỗ trợ: Tiếng Anh, Tiếng Trung
 * - Được tối ưu cho: Code generation, phân tích toán học, lập luận logic phức tạp
 */
class BedrockService {
  /**
   * Khởi tạo dịch vụ Bedrock
   * @param {Object} options - Các tùy chọn cấu hình
   */
  constructor(options = {}) {
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    
    // Log thông tin AWS
    console.log('AWS Region:', this.region);
    console.log('AWS Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 5)}...` : 'Not found');
    console.log('AWS Secret Access Key:', process.env.AWS_SECRET_ACCESS_KEY ? 'Available (hidden)' : 'Not found');
    
    // Khởi tạo client AWS Bedrock
    this.client = new BedrockRuntimeClient({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    // Định nghĩa các model ID
    this.modelIds = {
      // Anthropic Claude models
      claude3Haiku: 'anthropic.claude-3-haiku-20240307-v1:0',
      claude3Sonnet: 'anthropic.claude-3-sonnet-20240229-v1:0',
      claude3Opus: 'anthropic.claude-3-opus-20240229-v1:0',
      
      // Llama 3 models
      llama3_8B: 'meta.llama3-8b-instruct-v1:0',
      llama3_70B: 'meta.llama3-70b-instruct-v1:0',
      
      // AI21 models
      jamba: 'ai21.jamba-1-5-grande-v1:0',
      
      // DeepSeek models - ID chính xác dựa vào mã Python mẫu
      deepseekR1: 'us.deepseek.r1-v1:0',  // ID chính xác từ mã mẫu
      deepseekR1Ultra: 'us.deepseek.r1-v1:0',  // sử dụng cùng ID
      
      // Các ID model khác để thử
      deepseekChat: 'deepseek.deepseek-chat:1.0',
      deepseekInstruct: 'deepseek.deepseek-instruct:1.0',
      deepseekCoder: 'deepseek.deepseek-coder:0',
      deepseekCoderV2: 'deepseek.deepseek-coder-v2:0',
      
      // Default model
      default: 'anthropic.claude-3-sonnet-20240229-v1:0'
    };

    // Lựa chọn model mặc định
    this.defaultModel = options.defaultModel || this.modelIds.default;
  }

  /**
   * Tạo chat completion với Amazon Bedrock
   * 
   * @param {Array} messages - Mảng các tin nhắn theo định dạng [{ role: 'user', content: 'Hello' }]
   * @param {Object} options - Các tùy chọn bổ sung
   * @returns {Promise<Object>} - Kết quả từ API
   */
  async chatCompletion(messages, options = {}) {
    try {
      console.log(`Sending request to Bedrock API for model ${this.defaultModel}`);
      
      // Lấy tin nhắn cuối cùng của user
      const lastUserMessage = messages[messages.length - 1].content;
      
      // Tạo prompt theo định dạng của DeepSeek với system prompt
      const systemPrompt = `You are Sep, a real estate consultant in Dubai. Keep responses EXTREMELY SHORT - no more than 2-3 sentences total.

CRITICAL INSTRUCTIONS:
1. NEVER use emoji or special characters
2. NEVER create fictional dialogues or conversations
3. NEVER simulate multiple messages or turns
4. NEVER use greetings like "Hey there" or "Hello"
5. NEVER include any role labels (like "Sep:", "User:", "Human:", "Assistant:")
6. NEVER mention you're processing voice messages

Only answer with a single, direct response to what was asked. Keep it brief and natural like a human text message.`;

      const promptTemplate = `${systemPrompt}\n\nHuman: ${lastUserMessage}\n\nAssistant:`;
      
      // Basic format for DeepSeek on Bedrock
      const params = {
        modelId: this.defaultModel,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          prompt: promptTemplate,
          max_tokens: options.max_tokens || 1000, // Giảm max tokens
          temperature: options.temperature || 0.3 // Giảm temperature xuống 0.3
        })
      };

      const command = new InvokeModelCommand(params);
      const response = await this.client.send(command);
      
      const responseBody = JSON.parse(Buffer.from(response.body).toString());
      console.log(`Received response from Bedrock API for model ${this.defaultModel}`);
      console.log('DeepSeek response structure:', JSON.stringify(responseBody));
      
      // Xử lý phản hồi từ DeepSeek (các định dạng phản hồi khác nhau)
      let content = '';
      
      if (responseBody.choices && responseBody.choices[0]) {
        if (responseBody.choices[0].text !== undefined) {
          content = responseBody.choices[0].text || '';
        } else if (responseBody.choices[0].message && responseBody.choices[0].message.content !== undefined) {
          content = responseBody.choices[0].message.content || '';
        }
      } else if (responseBody.generated_text !== undefined) {
        content = responseBody.generated_text || '';
      } else if (responseBody.completion !== undefined) {
        content = responseBody.completion || '';
      } else {
        console.error('Unknown response format:', JSON.stringify(responseBody));
        // Trả về phản hồi trống thay vì lỗi
        return {
          choices: [{
            message: {
              content: "I don't have a specific answer for that question. Could you try rephrasing or asking something else about Dubai real estate?"
            }
          }]
        };
      }
      
      // Phản hồi trống, trả về câu thông báo mặc định
      if (!content || content.trim() === '') {
        return {
          choices: [{
            message: {
              content: "I don't have a specific answer for that question. Could you try rephrasing or asking something else about Dubai real estate?"
            }
          }]
        };
      }
      
      // Xử lý triệt để mọi trường hợp có thể
      const cleanText = content
        // Loại bỏ các ký tự đặc biệt
        .replace(/ï¼±beginâofâsentenceï¼±/g, '')
        .replace(/ï¼±endâofâsentenceï¼±/g, '')
        .replace(/ï¼±Assistantï¼±/g, '')
        // Loại bỏ phần think
        .replace(/<think>.*?<\/think>/gs, '')
        .replace(/\n?<\/think>\n?/g, '')
        .replace(/.*<\/think>/s, '')
        // Loại bỏ emoji và ký tự đặc biệt
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[👋👍👏🏻🏼🏽🏾🏿]/g, '')
        // Loại bỏ các hội thoại giả
        .replace(/Human:.*?Assistant:/gs, '')
        .replace(/User:.*?Sep:/gs, '')
        .replace(/User:.*?Assistant:/gs, '')
        .replace(/Human:.*?Sep:/gs, '')
        // Loại bỏ các dòng có chứa label
        .replace(/^(Sep|Assistant|Human|User):.*/gm, '')
        // Loại bỏ các dòng có chứa hội thoại
        .replace(/^.*\n.*: .*/gm, '')
        // Loại bỏ các lời chào
        .replace(/^(Hey there|Hello|Hi there|Hey)[\s,\.!\?]+/i, '')
        // Loại bỏ thông báo xử lý tin nhắn thoại
        .replace(/I'm processing your voice message into English\.?\s*/i, '')
        .replace(/I am processing your voice message into English\.?\s*/i, '')
        .replace(/Processing your voice message into English\.?\s*/i, '')
        .replace(/Tôi đang xử lý tin nhắn thoại của bạn thành tiếng Anh\.?\s*/i, '')
        // Lấy chỉ câu đầu tiên nếu quá dài
        .split('\n\n')[0]
        .trim();
      
      // Giới hạn độ dài phản hồi
      let finalText = cleanText;
      if (cleanText.length > 200) {
        // Tìm dấu chấm cuối cùng trong khoảng 200 ký tự đầu
        const lastPeriodIndex = cleanText.substring(0, 200).lastIndexOf('.');
        if (lastPeriodIndex > 0) {
          finalText = cleanText.substring(0, lastPeriodIndex + 1);
        } else {
          // Nếu không có dấu chấm, cắt ở 200 ký tự
          finalText = cleanText.substring(0, 200);
        }
      }
      
      // Trả về phản hồi đã được làm sạch
      return {
        choices: [{
          message: {
            content: finalText
          }
        }]
      };
      
    } catch (error) {
      console.error('Error in chatCompletion:', error);
      throw error;
    }
  }

  /**
   * Chuyển đổi định dạng tin nhắn giữa các model khác nhau
   * 
   * @param {Array} messages - Mảng các tin nhắn
   * @param {string} modelId - ID của model
   * @returns {Array} - Mảng tin nhắn đã được định dạng
   */
  formatMessages(messages, modelId) {
    // Đối với Anthropic Claude (giữ nguyên format)
    if (modelId.includes('anthropic.claude')) {
      return messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));
    }
    
    // Đối với Llama 3
    if (modelId.includes('meta.llama')) {
      return messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }
    
    // Đối với AI21
    if (modelId.includes('ai21')) {
      return messages.map(msg => ({
        role: msg.role,
        text: msg.content
      }));
    }
    
    // Đối với DeepSeek
    if (modelId.includes('deepseek')) {
      // Kiểm tra nhiều format khác nhau
      
      // Format 1: Sử dụng role và content
      // Kiểm tra định dạng chuẩn
      try {
        return messages.map(msg => ({
          role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        }));
      } catch (e) {
        console.error('Error formatting messages for DeepSeek format 1:', e);
      }
    }
    
    // Mặc định trả về nguyên bản
    return messages;
  }

  /**
   * Tối ưu hóa nội dung cho phản hồi bằng giọng nói
   * @param {string} content - Nội dung phản hồi
   * @returns {string} - Nội dung đã được tối ưu
   */
  optimizeForVoice(content) {
    // Loại bỏ các URL và mã định dạng
    let optimized = content.replace(/https?:\/\/[^\s]+/g, 'liên kết website');
    optimized = optimized.replace(/`{1,3}[^`]+`{1,3}/g, '');
    
    // Rút ngắn nội dung quá dài
    if (optimized.length > 300) {
      const sentences = optimized.split(/[.!?]+/);
      let shortened = '';
      for (const sentence of sentences) {
        if ((shortened + sentence).length < 300) {
          shortened += sentence + '. ';
        } else {
          break;
        }
      }
      optimized = shortened.trim();
    }
    
    return optimized;
  }

  /**
   * Kiểm tra kết nối với Bedrock
   * @returns {Promise<boolean>} - true nếu kết nối thành công
   */
  async testConnection() {
    try {
      await this.chatCompletion([{ role: 'user', content: 'Xin chào' }], { maxTokens: 10 });
      return true;
    } catch (error) {
      console.error('Lỗi kết nối đến Bedrock:', error);
      return false;
    }
  }

  /**
   * Kiểm tra kết nối với DeepSeek R1
   * @returns {Promise<boolean>} - true nếu kết nối thành công
   */
  async testDeepSeekConnection() {
    try {
      console.log('Testing connection to DeepSeek R1...');
      console.log('Using model ID:', this.modelIds.deepseekR1Ultra);
      console.log('AWS Region:', this.region);
      console.log('AWS Credentials:', this.client.config.credentials ? 'Available' : 'Not available');

      const result = await this.chatCompletion(
        [{ role: 'user', content: 'Test connection to DeepSeek R1' }], 
        {
          modelId: this.modelIds.deepseekR1Ultra,
          maxTokens: 10,
          temperature: 0.7
        }
      );
      
      console.log('DeepSeek connection successful!');
      console.log('Response:', JSON.stringify(result));
      return true;
    } catch (error) {
      console.error('DeepSeek connection failed with error:', error);
      if (error.Code) {
        console.error('Error code:', error.Code);
        console.error('Error message:', error.Message);
      }
      return false;
    }
  }

  /**
   * Chuyển đổi âm thanh thành văn bản sử dụng AWS Transcribe
   * @param {Buffer} audioBuffer - Buffer chứa dữ liệu âm thanh
   * @param {string} fileName - Tên file âm thanh
   * @returns {Promise<string>} - Văn bản đã chuyển đổi
   */
  async transcribeAudio(audioBuffer, fileName) {
    const TranscribeService = require('./transcribeService'); // Import here
    try {
      console.log(`Starting transcription for file: ${fileName}`);
      
      // Tạo thư mục tạm nếu chưa tồn tại
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Lưu file âm thanh tạm thời
      const tempFilePath = path.join(tempDir, fileName);
      fs.writeFileSync(tempFilePath, audioBuffer);
      
      // Khởi tạo TranscribeService
      const transcribeService = new TranscribeService({
        region: this.region,
        bucketName: 'whatsapp-voice-memos'
      });
      
      // Chuyển đổi âm thanh thành văn bản (sử dụng transcribeAudio)
      const transcribedText = await transcribeService.transcribeAudio(tempFilePath);
      
      // Xóa file tạm
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`Deleted temporary file: ${tempFilePath}`);
      } catch (deleteError) {
        console.error(`Error deleting temporary file: ${deleteError}`);
      }
      
      return transcribedText;
    } catch (error) {
      console.error('Error in transcribeAudio:', error);
      throw error;
    }
  }
}

module.exports = BedrockService; 