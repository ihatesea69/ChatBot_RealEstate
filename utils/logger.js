const winston = require("winston");
const { format } = winston;

/**
 * Cấu hình logger sử dụng winston
 *
 * Logger này hỗ trợ nhiều cấp độ log và có thể cấu hình để ghi log
 * vào console và file
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "crm-api" },
  transports: [
    // Ghi tất cả log từ mức error trở lên vào file error.log
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Ghi tất cả các log vào file combined.log
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

/**
 * Thêm transport ghi log ra console khi không ở môi trường production
 */
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          // Ẩn stack trace khi log ra console để dễ đọc hơn
          if (meta.error && meta.error.stack) {
            meta.error.stack = meta.error.stack.split("\n")[0];
          }

          // Định dạng log ra console
          const metaString = Object.keys(meta).length
            ? JSON.stringify(meta, null, 2)
            : "";

          return `${timestamp} ${level}: ${message} ${metaString}`;
        })
      ),
    })
  );
}

/**
 * Hàm wrapper để ghi log
 * @param {string} level - Cấp độ log (error, warn, info, http, verbose, debug, silly)
 * @param {string} message - Nội dung log
 * @param {Object} meta - Thông tin bổ sung
 */
function log(level, message, meta = {}) {
  logger.log(level, message, meta);
}

/**
 * Ghi log cấp độ error
 * @param {string} message - Nội dung lỗi
 * @param {Object} meta - Thông tin bổ sung
 */
function error(message, meta = {}) {
  logger.error(message, meta);
}

/**
 * Ghi log cấp độ warn
 * @param {string} message - Nội dung cảnh báo
 * @param {Object} meta - Thông tin bổ sung
 */
function warn(message, meta = {}) {
  logger.warn(message, meta);
}

/**
 * Ghi log cấp độ info
 * @param {string} message - Nội dung thông tin
 * @param {Object} meta - Thông tin bổ sung
 */
function info(message, meta = {}) {
  logger.info(message, meta);
}

/**
 * Ghi log cấp độ http
 * @param {string} message - Nội dung HTTP
 * @param {Object} meta - Thông tin bổ sung
 */
function http(message, meta = {}) {
  logger.http(message, meta);
}

/**
 * Ghi log cấp độ verbose
 * @param {string} message - Nội dung chi tiết
 * @param {Object} meta - Thông tin bổ sung
 */
function verbose(message, meta = {}) {
  logger.verbose(message, meta);
}

/**
 * Ghi log cấp độ debug
 * @param {string} message - Nội dung debug
 * @param {Object} meta - Thông tin bổ sung
 */
function debug(message, meta = {}) {
  logger.debug(message, meta);
}

/**
 * Middleware express ghi log HTTP requests
 * @param {Object} req - Đối tượng request
 * @param {Object} res - Đối tượng response
 * @param {Function} next - Hàm next
 */
function httpLogger(req, res, next) {
  const startTime = new Date();
  const { method, url, ip, headers } = req;

  // Khi response hoàn tất, ghi log
  res.on("finish", () => {
    const responseTime = new Date() - startTime;
    const { statusCode } = res;

    http(`${method} ${url}`, {
      ip,
      statusCode,
      responseTime,
      userAgent: headers["user-agent"],
    });
  });

  next();
}

module.exports = {
  logger,
  log,
  error,
  warn,
  info,
  http,
  verbose,
  debug,
  httpLogger,
};
