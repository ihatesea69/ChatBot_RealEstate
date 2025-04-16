const {
  PollyClient,
  SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const util = require("util");
const stream = require("stream");
const pipeline = util.promisify(stream.pipeline);
const { v4: uuidv4 } = require("uuid");

/**
 * Dịch vụ Text-to-Speech sử dụng AWS Polly
 */
class TextToSpeechService {
  constructor(region = "us-east-1") {
    this.pollyClient = new PollyClient({ region });
    this.s3Client = new S3Client({ region });
    this.secretsClient = new SecretsManagerClient({ region });
    this.isInitialized = false;
    this.region = region;

    // Cấu hình mặc định
    this.bucketName = process.env.TTS_BUCKET_NAME;
    this.audioPrefix = process.env.TTS_AUDIO_PREFIX || "audio/";
    this.secretName = process.env.TTS_SECRET_NAME || "tts-service-config";
    this.audioFormat = process.env.TTS_AUDIO_FORMAT || "mp3";
    this.voiceId = process.env.TTS_VOICE_ID || "Joanna";
    this.engine = process.env.TTS_ENGINE || "neural";
    this.tempDir = process.env.TTS_TEMP_DIR || "/tmp";
  }

  /**
   * Khởi tạo dịch vụ Text-to-Speech
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load cấu hình từ Secrets Manager
      await this._loadConfigFromSecrets();

      // Xác thực các cấu hình cần thiết
      if (!this.bucketName) {
        throw new Error("TTS_BUCKET_NAME is required but not configured");
      }

      this.isInitialized = true;
      console.log("Text-to-Speech Service initialized successfully");
    } catch (error) {
      console.error("Error initializing Text-to-Speech Service:", error);
      throw error;
    }
  }

  /**
   * Load cấu hình từ AWS Secrets Manager
   * @private
   */
  async _loadConfigFromSecrets() {
    try {
      const command = new GetSecretValueCommand({
        SecretId: this.secretName,
      });

      const response = await this.secretsClient.send(command);
      const secretData = JSON.parse(response.SecretString);

      // Cập nhật cấu hình từ secret
      if (secretData.bucketName) {
        this.bucketName = secretData.bucketName;
      }

      if (secretData.voiceId) {
        this.voiceId = secretData.voiceId;
      }

      if (secretData.engine) {
        this.engine = secretData.engine;
      }

      if (secretData.audioFormat) {
        this.audioFormat = secretData.audioFormat;
      }

      console.log("Loaded TTS configuration from Secrets Manager");
    } catch (error) {
      console.warn(
        "Error loading TTS configuration from Secrets Manager:",
        error.message
      );
      console.log("Using default or environment variable configuration");
    }
  }

  /**
   * Chuyển đổi text thành speech và lưu vào S3
   * @param {string} text - Văn bản cần chuyển đổi
   * @param {Object} options - Tùy chọn bổ sung
   * @returns {Promise<Object>} - Kết quả chứa URL của file audio
   */
  async textToSpeech(text, options = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Cấu hình cho yêu cầu chuyển đổi
      const voiceId = options.voiceId || this.voiceId;
      const engine = options.engine || this.engine;
      const audioFormat = options.audioFormat || this.audioFormat;

      // Xử lý text quá dài (AWS Polly có giới hạn 3000 ký tự)
      const chunks = this._splitTextIntoChunks(text, 3000);
      const audioFiles = [];

      // Chuyển đổi từng chunk và lưu vào S3
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const audioId = uuidv4();
        const fileName = `${audioId}.${audioFormat}`;
        const tempFilePath = path.join(this.tempDir, fileName);

        // Tạo sinh ngữ âm từ text
        const synthesizeParams = {
          Text: chunk,
          OutputFormat: audioFormat,
          VoiceId: voiceId,
          Engine: engine,
          TextType: "text",
        };

        // Nếu có SSML, sử dụng SSML thay vì text thông thường
        if (options.ssml) {
          synthesizeParams.Text = options.ssml;
          synthesizeParams.TextType = "ssml";
        }

        const synthesizeCommand = new SynthesizeSpeechCommand(synthesizeParams);
        const synthesizeResponse = await this.pollyClient.send(
          synthesizeCommand
        );

        // Lưu file audio tạm thời
        await this._saveStreamToFile(
          synthesizeResponse.AudioStream,
          tempFilePath
        );

        // Upload file audio lên S3
        const s3Key = `${this.audioPrefix}${fileName}`;
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: s3Key,
            Body: fs.createReadStream(tempFilePath),
            ContentType: `audio/${audioFormat}`,
          })
        );

        // Tạo URL có thời hạn cho file audio
        const url = await this._generateSignedUrl(s3Key);
        audioFiles.push({
          fileName,
          url,
          s3Key,
          chunkIndex: i,
        });

        // Xóa file tạm
        fs.unlinkSync(tempFilePath);
      }

      console.log(
        `Successfully generated ${audioFiles.length} audio file(s) for the text`
      );

      // Nếu có nhiều chunks, trả về tất cả các URL
      // Nếu chỉ có 1 chunk, trả về URL đơn giản hơn
      if (audioFiles.length === 1) {
        return {
          url: audioFiles[0].url,
          s3Key: audioFiles[0].s3Key,
          fileName: audioFiles[0].fileName,
        };
      } else {
        return {
          files: audioFiles,
          count: audioFiles.length,
        };
      }
    } catch (error) {
      console.error("Error converting text to speech:", error);
      throw error;
    }
  }

  /**
   * Lấy file audio từ S3 bằng key
   * @param {string} s3Key - Key của file trong S3
   * @returns {Promise<string>} - URL có thời hạn cho file audio
   */
  async getAudioUrl(s3Key) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      return await this._generateSignedUrl(s3Key);
    } catch (error) {
      console.error("Error getting audio URL:", error);
      throw error;
    }
  }

  /**
   * Phát sinh url được ký có thời hạn cho file trên S3
   * @param {string} s3Key - Key của file trong S3
   * @returns {Promise<string>} - URL có thời hạn
   * @private
   */
  async _generateSignedUrl(s3Key) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    // URL có hiệu lực trong 1 giờ
    return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  /**
   * Lưu stream dữ liệu vào file
   * @param {ReadableStream} stream - Stream dữ liệu
   * @param {string} filePath - Đường dẫn file
   * @returns {Promise<void>}
   * @private
   */
  async _saveStreamToFile(stream, filePath) {
    const writeStream = fs.createWriteStream(filePath);
    return pipeline(stream, writeStream);
  }

  /**
   * Chia text thành các chunk nhỏ hơn
   * @param {string} text - Văn bản cần chia
   * @param {number} maxChunkSize - Kích thước tối đa của mỗi chunk
   * @returns {Array<string>} - Mảng các chunk văn bản
   * @private
   */
  _splitTextIntoChunks(text, maxChunkSize) {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      // Tìm điểm an toàn để cắt câu (dấu chấm, dấu chấm than, dấu chấm hỏi, dấu chấm phẩy)
      let chunkEnd = maxChunkSize;
      if (remaining.length > maxChunkSize) {
        // Tìm dấu câu gần nhất trước maxChunkSize
        const possibleBreakpoints = [
          remaining.lastIndexOf(". ", maxChunkSize),
          remaining.lastIndexOf("! ", maxChunkSize),
          remaining.lastIndexOf("? ", maxChunkSize),
          remaining.lastIndexOf("; ", maxChunkSize),
        ];

        // Lấy vị trí dấu câu lớn nhất
        const breakpoint = Math.max(...possibleBreakpoints);

        if (breakpoint > 0) {
          // Cắt tại dấu câu + 2 ký tự (dấu câu và khoảng trắng)
          chunkEnd = breakpoint + 2;
        } else {
          // Nếu không tìm thấy dấu câu, thử tìm khoảng trắng
          const lastSpace = remaining.lastIndexOf(" ", maxChunkSize);
          if (lastSpace > 0) {
            chunkEnd = lastSpace + 1;
          }
          // Nếu không tìm thấy khoảng trắng, cắt đúng tại maxChunkSize
        }
      }

      chunks.push(remaining.substring(0, chunkEnd));
      remaining = remaining.substring(chunkEnd);
    }

    return chunks;
  }
}

module.exports = new TextToSpeechService();
