const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");
const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

/**
 * Dịch vụ CRM để lưu trữ và quản lý thông tin khách hàng sử dụng DynamoDB
 */
class CRMService {
  constructor(region = "us-east-1") {
    this.dynamoClient = new DynamoDBClient({ region });
    this.secretsClient = new SecretsManagerClient({ region });
    this.isInitialized = false;
    this.tableName = process.env.CRM_TABLE_NAME;
    this.secretName = process.env.CRM_SECRET_NAME;
    this.spreadsheetId = process.env.CRM_SPREADSHEET_ID;
    this.auth = null;
    this.sheets = null;
    this.googleServiceAccountSecretName =
      process.env.GOOGLE_SERVICE_ACCOUNT_SECRET_NAME ||
      "google-service-account-key";
  }

  /**
   * Khởi tạo dịch vụ và kiểm tra các điều kiện cần thiết
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      if (!this.tableName) {
        throw new Error("CRM_TABLE_NAME environment variable is not set");
      }

      // Kiểm tra kết nối với DynamoDB
      await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          Limit: 1,
        })
      );

      // Load các cấu hình từ Secrets Manager nếu có
      if (this.secretName) {
        await this._loadConfigFromSecrets();
      }

      this.isInitialized = true;
      console.log("CRM Service initialized successfully");
    } catch (error) {
      console.error("Error initializing CRM Service:", error);
      this.isInitialized = false;
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

      // Có thể áp dụng các cấu hình bổ sung từ secret
      if (secretData.tableName) {
        this.tableName = secretData.tableName;
      }

      console.log("Loaded CRM configuration from Secrets Manager");
    } catch (error) {
      console.error(
        "Error loading CRM configuration from Secrets Manager:",
        error
      );
      // Tiếp tục với cấu hình mặc định
    }
  }

  /**
   * Tạo hoặc cập nhật thông tin khách hàng
   * @param {Object} customer - Thông tin khách hàng
   * @returns {Promise<Object>} - Thông tin khách hàng đã lưu
   */
  async saveCustomer(customer) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!customer || !customer.phoneNumber) {
        throw new Error("Customer object with phoneNumber is required");
      }

      // Thêm timestamp
      const timestamp = new Date().toISOString();
      const customerData = {
        ...customer,
        updatedAt: timestamp,
      };

      if (!customerData.createdAt) {
        customerData.createdAt = timestamp;
      }

      // Kiểm tra xem khách hàng đã tồn tại chưa
      const existingCustomer = await this.getCustomerByPhone(
        customer.phoneNumber
      );
      if (existingCustomer) {
        // Cập nhật khách hàng hiện có
        return await this._updateCustomer(customerData);
      } else {
        // Tạo khách hàng mới
        const command = new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(customerData),
        });

        await this.dynamoClient.send(command);
        console.log(`Customer created: ${customer.phoneNumber}`);
        return customerData;
      }
    } catch (error) {
      console.error("Error saving customer:", error);
      throw error;
    }
  }

  /**
   * Cập nhật thông tin khách hàng hiện có
   * @param {Object} customer - Thông tin khách hàng
   * @returns {Promise<Object>} - Thông tin khách hàng đã cập nhật
   * @private
   */
  async _updateCustomer(customer) {
    try {
      // Xây dựng biểu thức cập nhật và giá trị
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      for (const [key, value] of Object.entries(customer)) {
        // Bỏ qua phoneNumber vì là khóa chính
        if (key !== "phoneNumber") {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      }

      if (updateExpressions.length === 0) {
        // Không có gì để cập nhật
        return customer;
      }

      const command = new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ phoneNumber: customer.phoneNumber }),
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ReturnValues: "ALL_NEW",
      });

      const response = await this.dynamoClient.send(command);
      const updatedCustomer = unmarshall(response.Attributes);

      console.log(`Customer updated: ${customer.phoneNumber}`);
      return updatedCustomer;
    } catch (error) {
      console.error("Error updating customer:", error);
      throw error;
    }
  }

  /**
   * Lấy thông tin khách hàng theo số điện thoại
   * @param {string} phoneNumber - Số điện thoại của khách hàng
   * @returns {Promise<Object|null>} - Thông tin khách hàng hoặc null nếu không tìm thấy
   */
  async getCustomerByPhone(phoneNumber) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!phoneNumber) {
        throw new Error("Phone number is required");
      }

      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ phoneNumber }),
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Item) {
        console.log(`Customer not found: ${phoneNumber}`);
        return null;
      }

      const customer = unmarshall(response.Item);
      console.log(`Customer found: ${phoneNumber}`);
      return customer;
    } catch (error) {
      console.error("Error getting customer:", error);
      throw error;
    }
  }

  /**
   * Lưu trữ lịch sử hội thoại của khách hàng
   * @param {string} phoneNumber - Số điện thoại của khách hàng
   * @param {Object} interaction - Thông tin tương tác
   * @returns {Promise<Object>} - Kết quả lưu trữ
   */
  async saveCustomerInteraction(phoneNumber, interaction) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!phoneNumber || !interaction) {
        throw new Error("Phone number and interaction details are required");
      }

      // Lấy thông tin khách hàng hiện tại
      const customer = await this.getCustomerByPhone(phoneNumber);

      if (!customer) {
        // Tạo khách hàng mới nếu chưa tồn tại
        return await this.saveCustomer({
          phoneNumber,
          interactions: [this._formatInteraction(interaction)],
        });
      }

      // Thêm tương tác mới vào mảng tương tác hiện có
      const interactions = customer.interactions || [];
      interactions.push(this._formatInteraction(interaction));

      // Chỉ giữ 50 tương tác gần nhất để tránh vượt quá giới hạn kích thước của DynamoDB
      if (interactions.length > 50) {
        interactions.shift(); // Loại bỏ tương tác cũ nhất
      }

      // Cập nhật khách hàng với tương tác mới
      return await this._updateCustomer({
        phoneNumber,
        interactions,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error saving customer interaction:", error);
      throw error;
    }
  }

  /**
   * Định dạng dữ liệu tương tác với khách hàng
   * @param {Object} interaction - Dữ liệu tương tác thô
   * @returns {Object} - Dữ liệu tương tác đã định dạng
   * @private
   */
  _formatInteraction(interaction) {
    return {
      ...interaction,
      timestamp: new Date().toISOString(),
      id: `int_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
  }

  /**
   * Cập nhật trạng thái của khách hàng
   * @param {string} phoneNumber - Số điện thoại của khách hàng
   * @param {Object} state - Trạng thái mới
   * @returns {Promise<Object>} - Thông tin khách hàng đã cập nhật
   */
  async updateCustomerState(phoneNumber, state) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!phoneNumber || !state) {
        throw new Error("Phone number and state are required");
      }

      // Lấy thông tin khách hàng hiện tại
      const customer = await this.getCustomerByPhone(phoneNumber);

      if (!customer) {
        // Tạo khách hàng mới với trạng thái đã cho
        return await this.saveCustomer({
          phoneNumber,
          state,
          createdAt: new Date().toISOString(),
        });
      }

      // Cập nhật khách hàng với trạng thái mới
      return await this._updateCustomer({
        phoneNumber,
        state,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error updating customer state:", error);
      throw error;
    }
  }

  /**
   * Lấy Google Service Account key từ AWS Secrets Manager
   */
  async getServiceAccountKey() {
    try {
      const command = new GetSecretValueCommand({
        SecretId: this.googleServiceAccountSecretName,
      });
      const data = await this.secretsClient.send(command);

      if ("SecretString" in data) {
        return JSON.parse(data.SecretString);
      } else {
        let buff = Buffer.from(data.SecretBinary, "base64");
        return JSON.parse(buff.toString("ascii"));
      }
    } catch (error) {
      console.error(
        `Error retrieving secret ${this.googleServiceAccountSecretName}:`,
        error
      );
      throw new Error(
        `Could not retrieve Google Service Account key from Secrets Manager: ${error.message}`
      );
    }
  }

  /**
   * Khởi tạo kết nối với Google Sheets API
   */
  async initializeGoogleSheets() {
    if (this.isInitialized) {
      return;
    }
    console.log("Initializing CRM Service...");

    try {
      if (!this.spreadsheetId) {
        throw new Error("CRM_SPREADSHEET_ID environment variable is not set");
      }

      const keyFileContent = await this.getServiceAccountKey();

      // Sử dụng GoogleAuth với Service Account Key
      this.auth = new GoogleAuth({
        credentials: {
          client_email: keyFileContent.client_email,
          private_key: keyFileContent.private_key,
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      // Lấy auth client
      const authClient = await this.auth.getClient();

      // Khởi tạo Google Sheets API client
      this.sheets = google.sheets({ version: "v4", auth: authClient });
      this.isInitialized = true;
      console.log("CRM Service initialized successfully");
    } catch (error) {
      console.error("Error initializing CRM Service:", error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Lưu cuộc hội thoại vào CRM
   */
  async logConversation(phoneNumber, content, isBot = false) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.sheets) {
        throw new Error("CRM Service is not properly initialized");
      }

      const timestamp = new Date().toISOString();
      const row = [
        timestamp,
        phoneNumber,
        isBot ? "Bot" : "User",
        content.toString().slice(0, 5000), // Giới hạn độ dài content
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: "Conversations!A:D", // Đảm bảo có sheet tên 'Conversations' với các cột phù hợp
        valueInputOption: "RAW",
        resource: {
          values: [row],
        },
      });

      console.log(`Logged conversation for ${phoneNumber} to CRM`);
      return true;
    } catch (error) {
      console.error("Error logging conversation to CRM:", error);
      return false; // Không throw error để không làm gián đoạn luồng chính
    }
  }

  /**
   * Cập nhật trạng thái của lead trong CRM
   */
  async updateLeadStatus(phoneNumber, status, notes = "") {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.sheets) {
        throw new Error("CRM Service is not properly initialized");
      }

      const timestamp = new Date().toISOString();
      const row = [
        timestamp,
        phoneNumber,
        status,
        notes.toString().slice(0, 5000), // Giới hạn độ dài notes
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: "Leads!A:D", // Đảm bảo có sheet tên 'Leads' với các cột phù hợp
        valueInputOption: "RAW",
        resource: {
          values: [row],
        },
      });

      console.log(`Updated lead status for ${phoneNumber} to ${status}`);
      return true;
    } catch (error) {
      console.error("Error updating lead status in CRM:", error);
      return false; // Không throw error để không làm gián đoạn luồng chính
    }
  }
}

module.exports = new CRMService();
