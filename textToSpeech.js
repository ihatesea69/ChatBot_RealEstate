const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

class TextToSpeech {
  constructor() {
    // Xác định dịch vụ TTS từ biến môi trường
    this.ttsService = process.env.TTS_SERVICE || 'elevenlabs';
    console.log(`Text-to-Speech service: ${this.ttsService}`);
    
    // ElevenLabs setup
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!this.elevenLabsApiKey && this.ttsService === 'elevenlabs') {
      console.warn('Warning: ELEVENLABS_API_KEY not set in environment variables');
    }
    
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  async convertToSpeech(text) {
    try {
      // Ưu tiên sử dụng ElevenLabs nếu được cấu hình
      if (this.ttsService === 'elevenlabs') {
        return await this.convertWithElevenLabs(text);
      } else {
        // Mặc định trở lại ElevenLabs nếu không hỗ trợ dịch vụ khác
        console.log('Không hỗ trợ dịch vụ TTS khác, sử dụng ElevenLabs');
        return await this.convertWithElevenLabs(text);
      }
    } catch (error) {
      console.error('Error converting text to speech:', error);
      throw error;
    }
  }
  
  async convertWithElevenLabs(text) {
    console.log('Converting text to speech with ElevenLabs API...');
    
    // Lấy Voice ID từ biến môi trường hoặc sử dụng ID mặc định
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    
    console.log(`Using voice ID: ${voiceId}`);
    console.log(`Text length: ${text.length} characters`);
    
    // Gọi API ElevenLabs trực tiếp
    const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.elevenLabsApiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    // Lấy audio data trực tiếp từ response
    const audioBuffer = await response.buffer();
    return audioBuffer;
  }
}

module.exports = new TextToSpeech(); 