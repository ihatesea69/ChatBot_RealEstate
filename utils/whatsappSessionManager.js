// File: utils/whatsappSessionManager.js
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const logger = require("./logger"); // Đảm bảo file logger.js cũng tồn tại trong utils

// Khởi tạo S3 client v3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});
const bucketName = process.env.WHATSAPP_SESSION_BUCKET; // Lấy tên bucket từ biến môi trường
const sessionPath = process.env.WHATSAPP_SESSION_DATA_PATH || "./.wwebjs_auth"; // Đường dẫn cục bộ

// Hàm đệ quy lấy tất cả file trong thư mục
function getAllFiles(dirPath, arrayOfFiles = []) {
  try {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
      const filePath = path.join(dirPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      } else {
        arrayOfFiles.push(filePath);
      }
    });
  } catch (err) {
    logger.error(`Error reading directory ${dirPath}: ${err.message}`);
  }
  return arrayOfFiles;
}

// Hàm lưu session lên S3
async function saveSessionToS3() {
  if (!bucketName) {
    logger.error(
      "WHATSAPP_SESSION_BUCKET environment variable is not set. Cannot save session to S3."
    );
    return;
  }
  try {
    logger.info(
      `Attempting to save WhatsApp session to S3 bucket: ${bucketName}`
    );

    if (!fs.existsSync(sessionPath)) {
      logger.warn(
        `Session path ${sessionPath} does not exist. Nothing to save.`
      );
      return;
    }

    const sessionFiles = getAllFiles(sessionPath);

    if (sessionFiles.length === 0) {
      logger.info("No session files found locally to save.");
      return;
    }

    for (const file of sessionFiles) {
      const fileContent = fs.readFileSync(file);
      const relativePath = path.relative(sessionPath, file).replace(/\\/g, "/"); // Đảm bảo dùng / cho S3 key

      // Tạo và gửi command v3
      const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: relativePath,
        Body: fileContent,
      });
      await s3Client.send(putCommand);

      logger.debug(`Uploaded ${relativePath} to S3`);
    }

    logger.info("Successfully saved WhatsApp session to S3");
  } catch (error) {
    logger.error(`Error saving WhatsApp session to S3: ${error.message}`, {
      error,
    });
  }
}

// Hàm tải session từ S3
async function loadSessionFromS3() {
  if (!bucketName) {
    logger.error(
      "WHATSAPP_SESSION_BUCKET environment variable is not set. Cannot load session from S3."
    );
    return false;
  }
  try {
    logger.info(
      `Attempting to load WhatsApp session from S3 bucket: ${bucketName}`
    );

    // Tạo thư mục session cục bộ nếu chưa có
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
      logger.info(`Created local session directory: ${sessionPath}`);
    }

    // List các object trong bucket bằng command v3
    const listCommand = new ListObjectsV2Command({ Bucket: bucketName });
    const { Contents } = await s3Client.send(listCommand);

    if (!Contents || Contents.length === 0) {
      logger.warn(
        `No session data found in S3 bucket: ${bucketName}. Starting fresh session.`
      );
      return false; // Báo hiệu không có session để tải
    }

    // Tải từng file
    for (const obj of Contents) {
      // Bỏ qua nếu là "thư mục" rỗng trên S3
      if (obj.Key.endsWith("/")) continue;

      // Tạo và gửi command v3
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: obj.Key,
      });
      const fileData = await s3Client.send(getCommand);

      // Body trong v3 là một ReadableStream, cần đọc nó
      const bodyContents = await streamToString(fileData.Body);

      const filePath = path.join(sessionPath, obj.Key);
      const dirPath = path.dirname(filePath);

      // Tạo thư mục cha nếu chưa có
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(filePath, bodyContents); // Ghi nội dung đã đọc từ stream
      logger.debug(`Downloaded ${obj.Key} from S3 to ${filePath}`);
    }

    logger.info("Successfully loaded WhatsApp session from S3");
    return true; // Báo hiệu đã tải session thành công
  } catch (error) {
    // Nếu lỗi không phải là NoSuchBucket (ví dụ: lỗi quyền), thì log error
    if (error.code !== "NoSuchBucket") {
      logger.error(`Error loading WhatsApp session from S3: ${error.message}`, {
        error,
      });
    } else {
      logger.warn(`S3 bucket ${bucketName} not found. Starting fresh session.`);
    }
    return false; // Báo hiệu không tải được session
  }
}

// Helper function để đọc ReadableStream thành string (cần thêm vào cuối file hoặc import từ đâu đó)
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

module.exports = {
  saveSessionToS3,
  loadSessionFromS3,
};
