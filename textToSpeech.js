const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const AWS = require("aws-sdk");
require("dotenv").config();

class TextToSpeech {
  constructor() {
    // Xác định dịch vụ TTS từ biến môi trường
    this.ttsService = process.env.TTS_SERVICE || "elevenlabs";
    console.log(`Text-to-Speech service: ${this.ttsService}`);

    // ElevenLabs setup
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!this.elevenLabsApiKey && this.ttsService === "elevenlabs") {
      console.warn(
        "Warning: ELEVENLABS_API_KEY not set in environment variables"
      );
    }

    this.baseUrl = "https://api.elevenlabs.io/v1";

    // AWS Polly setup
    this.polly = new AWS.Polly({
      region: process.env.AWS_REGION || "us-east-1",
    });

    // AWS Secrets Manager setup
    this.secretsManager = new AWS.SecretsManager({
      region: process.env.AWS_REGION || "us-east-1",
    });

    // Tự động tải cấu hình từ AWS Secrets Manager nếu được chỉ định
    if (process.env.USE_AWS_SECRETS === "true") {
      this.loadConfigFromSecrets().catch((err) => {
        console.warn(
          "Không thể tải cấu hình từ AWS Secrets Manager:",
          err.message
        );
      });
    }
  }

  // Tải cấu hình từ AWS Secrets Manager
  async loadConfigFromSecrets() {
    try {
      const secretName = process.env.TTS_SECRET_NAME || "text-to-speech-config";
      const data = await this.secretsManager
        .getSecretValue({ SecretId: secretName })
        .promise();

      let config;
      if (data.SecretString) {
        config = JSON.parse(data.SecretString);
      } else if (data.SecretBinary) {
        const buff = Buffer.from(data.SecretBinary, "base64");
        config = JSON.parse(buff.toString("ascii"));
      } else {
        console.warn("Không tìm thấy giá trị bí mật");
        return;
      }

      // Cập nhật cấu hình TTS
      if (config.ttsService) {
        this.ttsService = config.ttsService;
        console.log(`Cập nhật dịch vụ TTS thành: ${this.ttsService}`);
      }

      if (config.elevenLabsApiKey) {
        this.elevenLabsApiKey = config.elevenLabsApiKey;
        console.log("Đã cập nhật ElevenLabs API key từ AWS Secrets Manager");
      }

      console.log("Đã tải cấu hình TTS từ AWS Secrets Manager thành công");
    } catch (error) {
      console.error("Lỗi khi tải cấu hình từ AWS Secrets Manager:", error);
      throw error;
    }
  }

  async convertToSpeech(text) {
    try {
      switch (this.ttsService) {
        case "elevenlabs":
          return await this.convertWithElevenLabs(text);
        case "polly":
          return await this.convertWithPolly(text);
        default:
          console.log("Không hỗ trợ dịch vụ TTS đã chọn, sử dụng ElevenLabs");
          return await this.convertWithElevenLabs(text);
      }
    } catch (error) {
      console.error("Error converting text to speech:", error);
      throw error;
    }
  }

  async convertWithElevenLabs(text) {
    console.log("Converting text to speech with ElevenLabs API...");

    // Lấy Voice ID từ biến môi trường hoặc sử dụng ID mặc định
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

    console.log(`Using voice ID: ${voiceId}`);
    console.log(`Text length: ${text.length} characters`);

    // Gọi API ElevenLabs trực tiếp
    const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": this.elevenLabsApiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    // Lấy audio data trực tiếp từ response
    const audioBuffer = await response.buffer();
    return audioBuffer;
  }

  async convertWithPolly(text) {
    console.log("Converting text to speech with AWS Polly...");

    // Lấy tham số từ biến môi trường hoặc sử dụng giá trị mặc định
    const voiceId = process.env.POLLY_VOICE_ID || "Joanna";
    const engine = process.env.POLLY_ENGINE || "neural";
    const outputFormat = "mp3";

    console.log(`Using AWS Polly voice: ${voiceId}, engine: ${engine}`);
    console.log(`Text length: ${text.length} characters`);

    // Chuẩn bị tham số cho Polly
    const params = {
      Text: text,
      OutputFormat: outputFormat,
      VoiceId: voiceId,
      Engine: engine,
    };

    try {
      // Gọi Polly API
      const data = await this.polly.synthesizeSpeech(params).promise();

      // Chuyển đổi AudioStream thành Buffer
      if (data.AudioStream) {
        return Buffer.from(data.AudioStream);
      } else {
        throw new Error("Không nhận được audio stream từ AWS Polly");
      }
    } catch (error) {
      console.error("Lỗi khi sử dụng AWS Polly:", error);
      throw error;
    }
  }
}

module.exports = new TextToSpeech(); 