/**
 * Service để xử lý việc gọi Bedrock và generate response
 */
class BedrockResponseService {
  /**
   * Khởi tạo service
   * @param {Object} bedrockService Instance của bedrock service
   */
  constructor(bedrockService) {
    this.bedrockService = bedrockService;
  }

  /**
   * Generate response từ Bedrock
   * @param {Array} history Lịch sử hội thoại dạng [{role, content}]
   * @param {string} systemPrompt System prompt để cung cấp context
   * @returns {string} Bot response
   */
  async generateResponse(history, systemPrompt) {
    try {
      // Format messages cho Bedrock
      const messages = [
        { role: "system", content: systemPrompt },
        ...history.map(msg => ({ 
          role: msg.role, 
          content: msg.content 
        }))
      ];
      
      console.log(`Sending ${messages.length} messages to Bedrock`);
      
      // Gọi Bedrock thông qua service
      const response = await this.bedrockService.chatCompletion(messages, {
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

  /**
   * Tối ưu hóa response cho voice (trả về phiên bản ngắn gọn)
   * @param {string} longResponse Response gốc, có thể dài
   * @returns {string} Response đã tối ưu, ngắn gọn hơn
   */
  async optimizeForVoice(longResponse) {
    if (!longResponse || longResponse.length <= 100) {
      return longResponse; // Không cần tối ưu nếu đã ngắn
    }

    try {
      console.log('Long response, generating concise version for voice...');
      
      // Gọi Bedrock để tạo phiên bản ngắn gọn
      const voiceOptimizeResponse = await this.bedrockService.chatCompletion([
        { 
          role: "system", 
          content: "Make this response extremely concise for voice delivery. Maximum 1-2 short sentences (30-40 words). Keep only the most important information." 
        },
        { 
          role: "user", 
          content: longResponse 
        }
      ], {
        max_tokens: 100,
        temperature: 0.7
      });
      
      if (voiceOptimizeResponse && voiceOptimizeResponse.choices && 
          voiceOptimizeResponse.choices[0] && voiceOptimizeResponse.choices[0].message) {
        const shortResponse = voiceOptimizeResponse.choices[0].message.content;
        console.log('Original version:', longResponse.length, 'characters');
        console.log('Optimized version:', shortResponse.length, 'characters');
        return shortResponse;
      } else {
        console.warn('Could not generate optimized version, using original');
        return longResponse;
      }
    } catch (error) {
      console.error('Error optimizing for voice:', error);
      return longResponse; // Return original on error
    }
  }
}

module.exports = BedrockResponseService; 