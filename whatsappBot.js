const { Client, LocalAuth } = require("whatsapp-web.js");
const crmService = require("./backend/db/crmService");
const logger = require("./utils/logger");
const {
  saveSessionToS3,
  loadSessionFromS3,
} = require("./utils/whatsappSessionManager");

// Định nghĩa sessionPath trước khi sử dụng
const sessionPath = process.env.WHATSAPP_SESSION_DATA_PATH || "./.wwebjs_auth";

// Khởi tạo client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: sessionPath,
  }),
  puppeteer: {
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
    executablePath: "/usr/bin/google-chrome-stable",
    headless: true,
  },
});
