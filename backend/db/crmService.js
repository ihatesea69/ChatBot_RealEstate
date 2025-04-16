const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
  ScanCommand
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

/**
 * Dịch vụ CRM để lưu trữ và quản lý thông tin khách hàng sử dụng DynamoDB
 */
class CRMService {
  constructor(region = "us-east-1") {
    this.dynamoClient = new DynamoDBClient({ region });
    this.isInitialized = false;
    this.tableName = process.env.CRM_TABLE_NAME || "Customer";
    this.conversationsTable = process.env.CONVERSATIONS_TABLE_NAME || "Conversations";
    this.leadsTable = process.env.LEADS_TABLE_NAME || "Leads";
  }

  /**
   * Khởi tạo dịch vụ và kiểm tra các điều kiện cần thiết
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Kiểm tra kết nối với DynamoDB bằng cách query với limit 1
      await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          Limit: 1,
        })
      );

      this.isInitialized = true;
      console.log("CRM Service initialized successfully");
    } catch (error) {
      console.error("Error initializing CRM Service:", error);
      this.isInitialized = false;
      throw error;
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
   * Lấy danh sách tất cả khách hàng
   * @returns {Promise<Array>} - Danh sách khách hàng
   */
  async getAllCustomers() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const command = new ScanCommand({
        TableName: this.tableName,
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Items || response.Items.length === 0) {
        return [];
      }

      return response.Items.map(item => unmarshall(item));
    } catch (error) {
      console.error("Error getting all customers:", error);
      throw error;
    }
  }

  /**
   * Lưu trữ lịch sử hội thoại của khách hàng
   * @param {string} phoneNumber - Số điện thoại của khách hàng
   * @param {string} message - Nội dung tin nhắn
   * @param {boolean} isBot - Là tin nhắn từ bot hay không
   * @returns {Promise<boolean>} - Kết quả lưu trữ
   */
  async logConversation(phoneNumber, message, isBot = false) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!phoneNumber || !message) {
        throw new Error("Phone number and message are required");
      }

      const timestamp = Date.now();
      const conversation = {
        phoneNumber,
        timestamp,
        message: message.toString().slice(0, 50000), // Giới hạn độ dài tin nhắn
        sender: isBot ? "Bot" : "User",
        createdAt: new Date().toISOString()
      };

      const command = new PutItemCommand({
        TableName: this.conversationsTable,
        Item: marshall(conversation),
      });

      await this.dynamoClient.send(command);
      console.log(`Conversation logged for ${phoneNumber}`);
      return true;
    } catch (error) {
      console.error("Error logging conversation:", error);
      return false; // Không throw error để tránh làm gián đoạn cuộc hội thoại
    }
  }

  /**
   * Lấy lịch sử hội thoại của khách hàng
   * @param {string} phoneNumber - Số điện thoại của khách hàng
   * @param {number} limit - Số lượng tin nhắn tối đa
   * @returns {Promise<Array>} - Danh sách tin nhắn
   */
  async getConversations(phoneNumber, limit = 100) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const params = {
        TableName: this.conversationsTable,
        KeyConditionExpression: "phoneNumber = :phone",
        ExpressionAttributeValues: marshall({
          ":phone": phoneNumber
        }),
        Limit: limit,
        ScanIndexForward: false // Lấy tin nhắn mới nhất trước
      };

      const command = new QueryCommand(params);
      const response = await this.dynamoClient.send(command);

      if (!response.Items || response.Items.length === 0) {
        return [];
      }

      return response.Items.map(item => unmarshall(item));
    } catch (error) {
      console.error(`Error getting conversations for ${phoneNumber}:`, error);
      return [];
    }
  }

  /**
   * Tạo lead mới
   * @param {Object} leadData - Thông tin lead
   * @returns {Promise<Object>} - Lead đã tạo
   */
  async createLead(leadData) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!leadData.phoneNumber) {
        throw new Error("Phone number is required for lead");
      }

      const timestamp = Date.now();
      const lead = {
        phoneNumber: leadData.phoneNumber,
        timestamp,
        name: leadData.name || '',
        email: leadData.email || '',
        budget: leadData.budget || '',
        area: leadData.area || '',
        propertyType: leadData.propertyType || '',
        timeline: leadData.timeline || '',
        notes: leadData.notes || '',
        status: leadData.status || 'New Lead',
        meetingLink: leadData.meetingLink || '',
        createdAt: new Date().toISOString()
      };

      const command = new PutItemCommand({
        TableName: this.leadsTable,
        Item: marshall(lead),
      });

      await this.dynamoClient.send(command);
      console.log(`Lead created for ${leadData.phoneNumber}`);
      return lead;
    } catch (error) {
      console.error("Error creating lead:", error);
      throw error;
    }
  }

  /**
   * Cập nhật trạng thái lead
   * @param {string} phoneNumber - Số điện thoại của lead
   * @param {string} status - Trạng thái mới
   * @param {string} notes - Ghi chú bổ sung
   * @returns {Promise<boolean>} - Kết quả cập nhật
   */
  async updateLeadStatus(phoneNumber, status, notes = '') {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Tìm lead hiện tại
      const params = {
        TableName: this.leadsTable,
        KeyConditionExpression: "phoneNumber = :phone",
        ExpressionAttributeValues: marshall({
          ":phone": phoneNumber
        }),
        Limit: 1,
        ScanIndexForward: false // Lấy lead mới nhất
      };

      const queryCommand = new QueryCommand(params);
      const queryResponse = await this.dynamoClient.send(queryCommand);

      if (!queryResponse.Items || queryResponse.Items.length === 0) {
        // Nếu không tìm thấy lead, tạo lead mới
        return await this.createLead({
          phoneNumber,
          notes,
          status
        });
      }

      // Lấy lead mới nhất
      const latestLead = unmarshall(queryResponse.Items[0]);
      const timestamp = Date.now();

      // Tạo bản cập nhật mới với timestamp mới
      const updatedLead = {
        phoneNumber,
        timestamp,
        ...latestLead,
        status,
        notes: notes || latestLead.notes,
        updatedAt: new Date().toISOString()
      };

      // Cập nhật lead với timestamp mới (tạo record mới)
      const command = new PutItemCommand({
        TableName: this.leadsTable,
        Item: marshall(updatedLead),
      });

      await this.dynamoClient.send(command);
      console.log(`Lead status updated for ${phoneNumber} to ${status}`);
      return true;
    } catch (error) {
      console.error("Error updating lead status:", error);
      return false;
    }
  }

  /**
   * Lấy tất cả leads
   * @returns {Promise<Array>} - Danh sách leads
   */
  async getAllLeads() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const command = new ScanCommand({
        TableName: this.leadsTable,
      });

      const response = await this.dynamoClient.send(command);

      if (!response.Items || response.Items.length === 0) {
        return [];
      }

      return response.Items.map(item => unmarshall(item));
    } catch (error) {
      console.error("Error getting all leads:", error);
      throw error;
    }
  }
}

module.exports = new CRMService(); 