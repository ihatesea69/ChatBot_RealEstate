const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Voice Memo Processor
class VoiceMemoProcessor {
  constructor(transcribeService) {
    this.transcribeService = transcribeService;
  }

  /**
   * Tải và chuyển đổi voice memo thành văn bản
   * @param {string} mediaUrl URL của file audio cần transcribe
   * @param {string} senderPhoneNumber Số điện thoại người gửi (cho mục đích log)
   * @returns {Promise<string|null>} Kết quả transcription hoặc null nếu có lỗi
   */
  async handleVoiceMemo(mediaUrl, senderPhoneNumber) {
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

      // 3. Transcribe audio file
      let transcribedText = '';
      try {
        // Cần đảm bảo transcribeService hỗ trợ file path hoặc buffer
        transcribedText = await this.transcribeService.transcribeAudio(buffer, audioFileName);
        console.log(`Transcription result: ${transcribedText}`);
      } catch (transcribeError) {
        console.error('Error transcribing audio:', transcribeError);
        // Xóa file tạm thời
        try { fs.unlinkSync(audioFilePath); } catch (e) { console.error('Error deleting temp file:', e); }
        throw transcribeError;
      }

      // 4. Xóa file tạm
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
}

module.exports = VoiceMemoProcessor; 