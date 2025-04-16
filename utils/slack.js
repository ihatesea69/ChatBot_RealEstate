const axios = require("axios");
const AWS = require("aws-sdk");
const logger = require("./logger");

/**
 * Class Slack Notifier - Gửi thông báo tới kênh Slack
 * Hỗ trợ lấy cấu hình từ AWS Secrets Manager
 */
class SlackNotifier {
  /**
   * Khởi tạo SlackNotifier
   * @param {Object} config - Cấu hình
   * @param {string} config.webhookUrl - Webhook URL của Slack
   * @param {string} config.defaultChannel - Kênh mặc định
   * @param {string} config.username - Tên người dùng hiển thị
   * @param {string} config.icon_emoji - Emoji hiển thị
   * @param {boolean} config.useSecretsManager - Sử dụng AWS Secrets Manager
   * @param {string} config.secretName - Tên secret trong AWS Secrets Manager
   * @param {string} config.region - AWS Region
   */
  constructor(config = {}) {
    this.webhookUrl = config.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    this.defaultChannel =
      config.defaultChannel || process.env.SLACK_DEFAULT_CHANNEL || "#general";
    this.username = config.username || process.env.SLACK_USERNAME || "Bot";
    this.icon_emoji =
      config.icon_emoji || process.env.SLACK_ICON_EMOJI || ":robot_face:";

    // Cấu hình AWS Secrets Manager
    this.useSecretsManager =
      config.useSecretsManager ||
      process.env.SLACK_USE_SECRETS_MANAGER === "true";
    this.secretName = config.secretName || process.env.SLACK_SECRET_NAME;
    this.region = config.region || process.env.AWS_REGION || "us-east-1";

    if (this.useSecretsManager) {
      this.secretsManager = new AWS.SecretsManager({
        region: this.region,
      });
    }

    this.initialized = false;
  }

  /**
   * Khởi tạo và lấy cấu hình từ AWS Secrets Manager nếu cần
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      if (this.useSecretsManager && this.secretName) {
        await this._loadConfigFromSecrets();
      }

      if (!this.webhookUrl) {
        throw new Error("Slack Webhook URL is required");
      }

      this.initialized = true;
      logger.info("SlackNotifier initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize SlackNotifier", { error });
      throw error;
    }
  }

  /**
   * Lấy cấu hình từ AWS Secrets Manager
   * @private
   * @returns {Promise<void>}
   */
  async _loadConfigFromSecrets() {
    try {
      logger.info(
        `Loading Slack configuration from AWS Secrets Manager: ${this.secretName}`
      );

      const data = await this.secretsManager
        .getSecretValue({ SecretId: this.secretName })
        .promise();

      if (!data.SecretString) {
        throw new Error("Secret string is empty");
      }

      const secretData = JSON.parse(data.SecretString);

      // Cập nhật cấu hình từ secret
      this.webhookUrl = secretData.webhookUrl || this.webhookUrl;
      this.defaultChannel = secretData.defaultChannel || this.defaultChannel;
      this.username = secretData.username || this.username;
      this.icon_emoji = secretData.icon_emoji || this.icon_emoji;

      logger.info(
        "Successfully loaded Slack configuration from AWS Secrets Manager"
      );
    } catch (error) {
      logger.error(
        "Error loading Slack configuration from AWS Secrets Manager",
        { error }
      );
      throw error;
    }
  }

  /**
   * Gửi thông báo tới Slack
   * @param {string} text - Nội dung thông báo
   * @param {Object} options - Tùy chọn bổ sung
   * @param {string} options.channel - Kênh để gửi thông báo (ghi đè kênh mặc định)
   * @param {Array} options.attachments - Các attachment cho thông báo
   * @param {string} options.threadTs - Thread timestamp để trả lời trong một thread
   * @returns {Promise<Object>} - Kết quả từ API Slack
   */
  async send(text, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const payload = {
        text,
        channel: options.channel || this.defaultChannel,
        username: this.username,
        icon_emoji: this.icon_emoji,
      };

      if (options.attachments) {
        payload.attachments = options.attachments;
      }

      if (options.threadTs) {
        payload.thread_ts = options.threadTs;
      }

      logger.debug("Sending message to Slack", { channel: payload.channel });

      const response = await axios.post(this.webhookUrl, payload);
      return response.data;
    } catch (error) {
      logger.error("Error sending message to Slack", { error });
      throw error;
    }
  }

  /**
   * Gửi thông báo lỗi tới Slack
   * @param {Error} error - Đối tượng Error
   * @param {string} context - Bối cảnh của lỗi
   * @param {Object} options - Tùy chọn bổ sung
   * @returns {Promise<Object>} - Kết quả từ API Slack
   */
  async sendError(error, context, options = {}) {
    const attachments = [
      {
        color: "#FF0000", // Màu đỏ
        title: `Error: ${context}`,
        text: error.message,
        fields: [
          {
            title: "Stack Trace",
            value: `\`\`\`${error.stack || "No stack trace available"}\`\`\``,
            short: false,
          },
          {
            title: "Time",
            value: new Date().toISOString(),
            short: true,
          },
          {
            title: "Environment",
            value: process.env.NODE_ENV || "development",
            short: true,
          },
        ],
        footer: "Error Notification",
        ts: Math.floor(Date.now() / 1000),
      },
    ];

    return this.send(`:rotating_light: *Error Alert* :rotating_light:`, {
      ...options,
      attachments,
    });
  }

  /**
   * Gửi thông báo thành công tới Slack
   * @param {string} title - Tiêu đề
   * @param {string} message - Nội dung
   * @param {Object} options - Tùy chọn bổ sung
   * @returns {Promise<Object>} - Kết quả từ API Slack
   */
  async sendSuccess(title, message, options = {}) {
    const attachments = [
      {
        color: "#36a64f", // Màu xanh lá
        title,
        text: message,
        footer: "Success Notification",
        ts: Math.floor(Date.now() / 1000),
      },
    ];

    return this.send(`:white_check_mark: *Success* :white_check_mark:`, {
      ...options,
      attachments,
    });
  }

  /**
   * Gửi thông báo cảnh báo tới Slack
   * @param {string} title - Tiêu đề
   * @param {string} message - Nội dung
   * @param {Object} options - Tùy chọn bổ sung
   * @returns {Promise<Object>} - Kết quả từ API Slack
   */
  async sendWarning(title, message, options = {}) {
    const attachments = [
      {
        color: "#ffc107", // Màu vàng
        title,
        text: message,
        footer: "Warning Notification",
        ts: Math.floor(Date.now() / 1000),
      },
    ];

    return this.send(`:warning: *Warning* :warning:`, {
      ...options,
      attachments,
    });
  }
}

module.exports = SlackNotifier;
