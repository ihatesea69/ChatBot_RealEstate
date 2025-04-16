const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand
} = require('@aws-sdk/client-transcribe');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Dịch vụ chuyển đổi giọng nói thành văn bản sử dụng AWS Transcribe
 */
class TranscribeService {
  /**
   * Khởi tạo dịch vụ Transcribe
   * @param {Object} config - Các tùy chọn cấu hình
   */
  constructor(config = {}) {
    const {
      region = 'us-east-1',
      bucketName = 'whatsapp-voice-memos',
      outputFolder = 'transcriptions'
    } = config;

    this.region = region;
    this.bucketName = bucketName;
    this.outputFolder = outputFolder;

    // Khởi tạo các clients
    this.transcribeClient = new TranscribeClient({ region: this.region });
    this.s3Client = new S3Client({ region: this.region });
    
    console.log(`TranscribeService initialized with bucket: ${this.bucketName}, region: ${this.region}`);
  }

  /**
   * Chuyển đổi file âm thanh thành văn bản
   * @param {string} audioFilePath - Đường dẫn đến file âm thanh
   * @returns {Promise<string>} - Văn bản được chuyển đổi
   */
  async transcribeAudio(audioFilePath) {
    try {
      // Kiểm tra file có tồn tại không
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      console.log(`Starting transcription for: ${audioFilePath}`);
      
      // Tạo ID duy nhất cho job
      const jobId = uuidv4();
      const jobName = `whatsapp-voice-${jobId}`;
      
      // Tên file S3
      const fileName = path.basename(audioFilePath);
      const s3Key = `voice-memos/${jobId}/${fileName}`;
      
      // Tải file lên S3
      await this.uploadToS3(audioFilePath, s3Key);
      console.log(`Uploaded audio to S3: ${s3Key}`);
      
      // Bắt đầu transcription job
      const s3Uri = `s3://${this.bucketName}/${s3Key}`;
      const outputKey = `${this.outputFolder}/${jobId}.json`;

      const startCommand = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        Media: { MediaFileUri: s3Uri },
        MediaFormat: path.extname(audioFilePath).slice(1).toLowerCase() || 'mp3',
        LanguageCode: 'en-US', // Có thể điều chỉnh ngôn ngữ
        OutputBucketName: this.bucketName,
        OutputKey: outputKey
      });
      
      await this.transcribeClient.send(startCommand);
      console.log(`Started transcription job: ${jobName}`);
      
      // Đợi cho đến khi job hoàn thành
      const jobResult = await this.waitForJobCompletion(jobName);
      
      // Xử lý kết quả
      const transcribedText = await this.processTranscriptionResult(jobResult);
      console.log(`Transcription completed successfully: "${transcribedText.substring(0, 50)}..."`);
      
      return transcribedText;
    } catch (error) {
      console.error('Error in transcribeAudio:', error);
      throw error;
    }
  }
  
  /**
   * Đợi cho đến khi transcription job hoàn thành
   * @param {string} jobName - Tên của transcription job
   * @returns {Promise<object>} - Kết quả job
   */
  async waitForJobCompletion(jobName) {
    let completed = false;
    const MAX_RETRIES = 60; // Maximum 15 minutes (with 15-second intervals)
    let retries = 0;
    
    while (!completed && retries < MAX_RETRIES) {
      const getCommand = new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName
      });
      
      const response = await this.transcribeClient.send(getCommand);
      const status = response.TranscriptionJob.TranscriptionJobStatus;
      
      if (status === 'COMPLETED') {
        console.log(`Job ${jobName} completed successfully`);
        console.log('Job result structure:', JSON.stringify({
          OutputKey: response.TranscriptionJob.OutputKey,
          hasTranscript: !!response.TranscriptionJob.Transcript,
          TranscriptFileUri: response.TranscriptionJob.Transcript ? response.TranscriptionJob.Transcript.TranscriptFileUri : 'none'
        }));
        return response.TranscriptionJob;
      } else if (status === 'FAILED') {
        const failureReason = response.TranscriptionJob.FailureReason || 'Unknown reason';
        throw new Error(`Transcription job failed: ${failureReason}`);
      }
      
      // Đợi 15 giây trước khi kiểm tra lại
      console.log(`Job ${jobName} status: ${status}. Waiting...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
      retries++;
    }
    
    if (retries >= MAX_RETRIES) {
      throw new Error(`Transcription job ${jobName} timed out after ${MAX_RETRIES * 15} seconds`);
    }
  }
  
  /**
   * Xử lý kết quả của transcription job
   * @param {object} jobResult - Kết quả từ GetTranscriptionJobCommand
   * @returns {Promise<string>} - Văn bản đã transcribe
   */
  async processTranscriptionResult(jobResult) {
    try {
      console.log('Processing transcription result...');
  
      if (!jobResult || !jobResult.TranscriptionJobName) {
        console.error('Invalid job result object received (missing TranscriptionJobName):', JSON.stringify(jobResult));
        throw new Error('Invalid transcription job result object');
      }
  
      // Construct the expected OutputKey based on JobName and predefined outputFolder
      // Example JobName: whatsapp-voice-2d0ce24c-1fc9-4d97-8af4-3e26148e64e0
      const jobName = jobResult.TranscriptionJobName;
      const jobIdMatch = jobName.match(/whatsapp-voice-(.*)/);
      if (!jobIdMatch || !jobIdMatch[1]) {
          console.error(`Could not extract jobId from jobName: ${jobName}`);
          throw new Error(`Could not determine output key from job name.`);
      }
      const jobId = jobIdMatch[1];
      const expectedOutputKey = `${this.outputFolder}/${jobId}.json`; // e.g., transcriptions/2d0ce...e0.json
  
      console.log(`Attempting to get transcription from S3 using expected OutputKey: ${expectedOutputKey}`);
      try {
        const getCommand = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: expectedOutputKey
        });
  
        const response = await this.s3Client.send(getCommand);
        const jsonStr = await response.Body.transformToString();
        const transcriptionResult = JSON.parse(jsonStr);
  
        if (transcriptionResult && transcriptionResult.results &&
            transcriptionResult.results.transcripts &&
            transcriptionResult.results.transcripts.length > 0) {
          return transcriptionResult.results.transcripts[0].transcript;
        } else {
           console.error('Invalid transcription result format from S3 (using expected OutputKey):', jsonStr);
           throw new Error('Invalid transcription result format from S3');
        }
      } catch (s3Error) {
        console.error(`Error getting transcription result from S3 using expected OutputKey ${expectedOutputKey}:`, s3Error);
        // Log specific permission error possibility
        if (s3Error.name === 'AccessDenied' || (s3Error.$metadata && s3Error.$metadata.httpStatusCode === 403)) {
             console.error(`-> ACCESS DENIED fetching result. Ensure the IAM user/role running this code has s3:GetObject permission on bucket '${this.bucketName}' for key '${expectedOutputKey}'.`);
        }
        throw s3Error; // Re-throw the error
      }
  
    } catch (error) {
      console.error('Error processing transcription result:', error);
      throw error;
    }
  }
  
  /**
   * Upload file lên S3
   * @param {string} filePath - Đường dẫn đến file cần upload
   * @param {string} s3Key - Key của file trên S3
   */
  async uploadToS3(filePath, s3Key) {
    try {
      const fileContent = fs.readFileSync(filePath);
      
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileContent
      });
      
      await this.s3Client.send(putCommand);
      console.log(`Successfully uploaded ${filePath} to ${this.bucketName}/${s3Key}`);
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw error;
    }
  }

  /**
   * Giải mã văn bản từ tệp tin âm thanh cục bộ
   * Hữu ích cho các tệp tin ngắn và phát triển cục bộ
   * @param {String} audioFilePath - Đường dẫn tới tệp âm thanh
   * @returns {Promise<String>} - Văn bản đã chuyển đổi
   */
  async transcribeLocally(audioFilePath) {
    // Phương pháp đơn giản để xử lý tệp âm thanh cục bộ
    // Chỉ sử dụng cho mục đích phát triển cục bộ và thử nghiệm
    
    console.log(`Attempting local transcription of file ${audioFilePath}`);
    
    // Return an English fallback message
    return "Hello! I've received your voice message but currently cannot accurately transcribe its content. Please send a text message so I can better assist you.";
  }

  /**
   * Kiểm tra kết nối với AWS Transcribe
   * @returns {Promise<boolean>} - true nếu kết nối thành công
   */
  async testConnection() {
    try {
      // Liệt kê các công việc chuyển đổi để kiểm tra kết nối
      const listCommand = new ListTranscriptionJobsCommand({
        MaxResults: 1
      });
      
      await this.transcribeClient.send(listCommand);
      console.log('Kết nối đến AWS Transcribe thành công');
      return true;
    } catch (error) {
      console.error('Lỗi kết nối đến AWS Transcribe:', error);
      return false;
    }
  }
}

module.exports = TranscribeService; 