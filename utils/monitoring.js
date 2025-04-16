const os = require("os");
const AWS = require("aws-sdk");
const logger = require("./logger");
const SlackNotifier = require("./slack");

/**
 * Class Monitoring - Theo dõi tài nguyên và hiệu suất hệ thống
 * Hỗ trợ gửi metric lên CloudWatch và thông báo qua Slack
 */
class SystemMonitor {
  /**
   * Khởi tạo SystemMonitor
   * @param {Object} config - Cấu hình
   * @param {boolean} config.enableCloudWatch - Bật CloudWatch monitoring
   * @param {string} config.region - AWS Region
   * @param {string} config.namespace - CloudWatch namespace
   * @param {Object} config.slackConfig - Cấu hình cho Slack notifications
   * @param {number} config.memoryThreshold - Ngưỡng memory usage (%)
   * @param {number} config.cpuThreshold - Ngưỡng CPU usage (%)
   * @param {number} config.diskThreshold - Ngưỡng disk usage (%)
   */
  constructor(config = {}) {
    this.enableCloudWatch =
      config.enableCloudWatch || process.env.ENABLE_CLOUDWATCH === "true";
    this.region = config.region || process.env.AWS_REGION || "us-east-1";
    this.namespace =
      config.namespace ||
      process.env.CLOUDWATCH_NAMESPACE ||
      "Application/Metrics";
    this.memoryThreshold =
      config.memoryThreshold || parseInt(process.env.MEMORY_THRESHOLD || "90");
    this.cpuThreshold =
      config.cpuThreshold || parseInt(process.env.CPU_THRESHOLD || "80");
    this.diskThreshold =
      config.diskThreshold || parseInt(process.env.DISK_THRESHOLD || "85");

    // Khởi tạo AWS CloudWatch nếu được bật
    if (this.enableCloudWatch) {
      this.cloudWatch = new AWS.CloudWatch({
        region: this.region,
      });
    }

    // Khởi tạo Slack notifier nếu có cấu hình
    if (config.slackConfig) {
      this.slackNotifier = new SlackNotifier(config.slackConfig);
    }

    this.metrics = {};
    this.intervals = {};
    this.requestCounts = {
      total: 0,
      success: 0,
      error: 0,
      by4xx: 0,
      by5xx: 0,
    };

    this.startTime = Date.now();
    this.initialized = false;
  }

  /**
   * Khởi tạo monitoring
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Khởi tạo Slack notifier nếu có
      if (this.slackNotifier) {
        await this.slackNotifier.initialize();
      }

      this.initialized = true;
      logger.info("SystemMonitor initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize SystemMonitor", { error });
      throw error;
    }
  }

  /**
   * Bắt đầu giám sát tài nguyên hệ thống
   * @param {number} interval - Khoảng thời gian giữa các lần thu thập (ms)
   */
  startResourceMonitoring(interval = 60000) {
    if (this.intervals.resources) {
      clearInterval(this.intervals.resources);
    }

    // Thu thập metrics ngay lập tức
    this.collectResourceMetrics();

    // Đặt interval để thu thập metrics định kỳ
    this.intervals.resources = setInterval(() => {
      this.collectResourceMetrics();
    }, interval);

    logger.info(`Started resource monitoring with interval ${interval}ms`);
  }

  /**
   * Thu thập các metrics về tài nguyên hệ thống
   * @returns {Object} Các metrics đã thu thập
   */
  collectResourceMetrics() {
    try {
      // CPU Usage (tính trung bình trên tất cả các core)
      const cpus = os.cpus();
      const cpuUsage = this._calculateCpuUsage(cpus);

      // Memory Usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryUsage = (usedMem / totalMem) * 100;

      // Uptime
      const uptime = process.uptime();

      // Load Average
      const loadAvg = os.loadavg();

      // Thông tin hệ thống
      const hostname = os.hostname();
      const platform = os.platform();

      // Gán cho metrics
      this.metrics.cpu = cpuUsage;
      this.metrics.memory = memoryUsage;
      this.metrics.uptime = uptime;
      this.metrics.loadAvg = loadAvg;
      this.metrics.hostname = hostname;
      this.metrics.platform = platform;
      this.metrics.timestamp = new Date().toISOString();

      // Gửi metrics lên CloudWatch nếu được bật
      if (this.enableCloudWatch) {
        this._sendMetricsToCloudWatch();
      }

      // Kiểm tra và gửi cảnh báo nếu vượt ngưỡng
      this._checkThresholds();

      logger.debug("Resource metrics collected", { metrics: this.metrics });

      return this.metrics;
    } catch (error) {
      logger.error("Error collecting resource metrics", { error });
      return null;
    }
  }

  /**
   * Tính toán CPU usage
   * @param {Array} cpus - Mảng thông tin CPU từ os.cpus()
   * @returns {number} CPU usage (%)
   * @private
   */
  _calculateCpuUsage(cpus) {
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return ((1 - totalIdle / totalTick) * 100).toFixed(2);
  }

  /**
   * Gửi metrics lên CloudWatch
   * @private
   */
  _sendMetricsToCloudWatch() {
    const params = {
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: "CPUUtilization",
          Value: this.metrics.cpu,
          Unit: "Percent",
          Dimensions: [
            {
              Name: "Host",
              Value: this.metrics.hostname,
            },
          ],
        },
        {
          MetricName: "MemoryUtilization",
          Value: this.metrics.memory,
          Unit: "Percent",
          Dimensions: [
            {
              Name: "Host",
              Value: this.metrics.hostname,
            },
          ],
        },
        {
          MetricName: "RequestCount",
          Value: this.requestCounts.total,
          Unit: "Count",
          Dimensions: [
            {
              Name: "Host",
              Value: this.metrics.hostname,
            },
          ],
        },
        {
          MetricName: "ErrorCount",
          Value: this.requestCounts.error,
          Unit: "Count",
          Dimensions: [
            {
              Name: "Host",
              Value: this.metrics.hostname,
            },
          ],
        },
      ],
    };

    this.cloudWatch.putMetricData(params, (err) => {
      if (err) {
        logger.error("Error sending metrics to CloudWatch", { error: err });
      } else {
        logger.debug("Successfully sent metrics to CloudWatch");
      }
    });
  }

  /**
   * Kiểm tra và gửi cảnh báo nếu vượt ngưỡng
   * @private
   */
  _checkThresholds() {
    // Kiểm tra CPU usage
    if (this.metrics.cpu > this.cpuThreshold) {
      logger.warn(
        `CPU usage (${this.metrics.cpu}%) exceeds threshold (${this.cpuThreshold}%)`
      );

      if (this.slackNotifier) {
        this.slackNotifier
          .sendWarning(
            "High CPU Usage Alert",
            `CPU usage is at ${this.metrics.cpu}%, which exceeds the threshold of ${this.cpuThreshold}%.`
          )
          .catch((err) =>
            logger.error("Failed to send CPU alert to Slack", { error: err })
          );
      }
    }

    // Kiểm tra Memory usage
    if (this.metrics.memory > this.memoryThreshold) {
      logger.warn(
        `Memory usage (${this.metrics.memory.toFixed(2)}%) exceeds threshold (${
          this.memoryThreshold
        }%)`
      );

      if (this.slackNotifier) {
        this.slackNotifier
          .sendWarning(
            "High Memory Usage Alert",
            `Memory usage is at ${this.metrics.memory.toFixed(
              2
            )}%, which exceeds the threshold of ${this.memoryThreshold}%.`
          )
          .catch((err) =>
            logger.error("Failed to send memory alert to Slack", { error: err })
          );
      }
    }
  }

  /**
   * Middleware Express để theo dõi các request
   * @returns {Function} Express middleware
   */
  requestMonitor() {
    return (req, res, next) => {
      const startTime = Date.now();

      // Theo dõi khi request hoàn thành
      res.on("finish", () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Cập nhật counter
        this.requestCounts.total++;

        if (statusCode >= 200 && statusCode < 400) {
          this.requestCounts.success++;
        } else {
          this.requestCounts.error++;

          if (statusCode >= 400 && statusCode < 500) {
            this.requestCounts.by4xx++;
          } else if (statusCode >= 500) {
            this.requestCounts.by5xx++;
          }
        }

        // Lưu thời gian phản hồi
        if (!this.metrics.responseTime) {
          this.metrics.responseTime = {
            min: duration,
            max: duration,
            avg: duration,
            count: 1,
          };
        } else {
          const rt = this.metrics.responseTime;
          rt.min = Math.min(rt.min, duration);
          rt.max = Math.max(rt.max, duration);
          rt.avg = (rt.avg * rt.count + duration) / (rt.count + 1);
          rt.count++;
        }

        logger.debug("Request tracked", {
          method: req.method,
          url: req.originalUrl,
          statusCode,
          duration: `${duration}ms`,
        });
      });

      next();
    };
  }

  /**
   * Dừng tất cả các hoạt động giám sát
   */
  stopMonitoring() {
    Object.values(this.intervals).forEach((interval) => {
      clearInterval(interval);
    });

    this.intervals = {};
    logger.info("All monitoring stopped");
  }

  /**
   * Lấy thống kê hiện tại
   * @returns {Object} Metrics và thống kê
   */
  getStats() {
    const now = Date.now();
    const uptimeMs = now - this.startTime;

    return {
      system: this.metrics,
      requests: this.requestCounts,
      uptime: {
        startTime: new Date(this.startTime).toISOString(),
        uptimeMs,
        uptimeHuman: this._formatUptime(uptimeMs),
      },
    };
  }

  /**
   * Format thời gian uptime thành dạng dễ đọc
   * @param {number} uptimeMs - Thời gian tính bằng ms
   * @returns {string} Uptime dạng dễ đọc
   * @private
   */
  _formatUptime(uptimeMs) {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  }
}

module.exports = SystemMonitor;
