const express = require("express");
const router = express.Router();
const crmService = require("../db/crmService");
const { auth } = require("../middleware/auth");

// Endpoint cho đăng nhập (để demo)
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Đây chỉ là xác thực đơn giản để demo
    // Trong môi trường sản xuất, cần có xác thực mạnh mẽ hơn
    if (username === "admin" && password === "admin123") {
      // Tạo token đơn giản
      const token = "demo-token-" + Date.now();

      return res.status(200).json({
        success: true,
        token,
        user: {
          username,
          role: "admin",
        },
      });
    }

    return res.status(401).json({
      success: false,
      message: "Sai tên đăng nhập hoặc mật khẩu",
    });
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// === API Khách hàng ===

// Lấy tất cả khách hàng
router.get("/customers", auth, async (req, res) => {
  try {
    const customers = await crmService.getAllCustomers();
    return res.status(200).json({
      success: true,
      data: customers,
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách khách hàng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// Lấy thông tin chi tiết một khách hàng
router.get("/customers/:phoneNumber", auth, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const customer = await crmService.getCustomerByPhone(phoneNumber);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách hàng",
      });
    }

    return res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    console.error("Lỗi lấy thông tin khách hàng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// Thêm khách hàng mới
router.post("/customers", auth, async (req, res) => {
  try {
    const customerData = req.body;

    if (!customerData.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại là thông tin bắt buộc",
      });
    }

    const savedCustomer = await crmService.saveCustomer(customerData);

    return res.status(201).json({
      success: true,
      data: savedCustomer,
    });
  } catch (error) {
    console.error("Lỗi thêm khách hàng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// Cập nhật thông tin khách hàng
router.put("/customers/:phoneNumber", auth, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const customerData = req.body;

    // Đảm bảo phoneNumber đúng
    customerData.phoneNumber = phoneNumber;

    const updatedCustomer = await crmService.saveCustomer(customerData);

    return res.status(200).json({
      success: true,
      data: updatedCustomer,
    });
  } catch (error) {
    console.error("Lỗi cập nhật khách hàng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// === API Leads ===

// Lấy tất cả leads
router.get("/leads", auth, async (req, res) => {
  try {
    const leads = await crmService.getAllLeads();
    return res.status(200).json({
      success: true,
      data: leads,
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách leads:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// Tạo lead mới
router.post("/leads", auth, async (req, res) => {
  try {
    const leadData = req.body;

    if (!leadData.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại là thông tin bắt buộc",
      });
    }

    const savedLead = await crmService.createLead(leadData);

    return res.status(201).json({
      success: true,
      data: savedLead,
    });
  } catch (error) {
    console.error("Lỗi tạo lead:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// Cập nhật trạng thái lead
router.put("/leads/:phoneNumber/status", auth, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái mới là thông tin bắt buộc",
      });
    }

    const result = await crmService.updateLeadStatus(
      phoneNumber,
      status,
      notes
    );

    if (!result) {
      return res.status(500).json({
        success: false,
        message: "Không thể cập nhật trạng thái lead",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái lead thành công",
    });
  } catch (error) {
    console.error("Lỗi cập nhật trạng thái lead:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// === API Cuộc hội thoại ===

// Lấy lịch sử cuộc hội thoại của một khách hàng
router.get("/conversations/:phoneNumber", auth, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { limit } = req.query;

    const conversations = await crmService.getConversations(
      phoneNumber,
      limit ? parseInt(limit) : 100
    );

    return res.status(200).json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error("Lỗi lấy lịch sử hội thoại:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// Thêm tin nhắn mới vào cuộc hội thoại
router.post("/conversations/:phoneNumber", auth, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { message, isBot } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Nội dung tin nhắn là thông tin bắt buộc",
      });
    }

    const result = await crmService.logConversation(
      phoneNumber,
      message,
      isBot
    );

    if (!result) {
      return res.status(500).json({
        success: false,
        message: "Không thể lưu tin nhắn",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Đã lưu tin nhắn thành công",
    });
  } catch (error) {
    console.error("Lỗi lưu tin nhắn:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

// === API Dashboard ===

// Lấy thống kê tổng quan
router.get("/dashboard/stats", auth, async (req, res) => {
  try {
    // Lấy tất cả dữ liệu cần thiết
    const customers = await crmService.getAllCustomers();
    const leads = await crmService.getAllLeads();

    // Tính toán các số liệu
    const totalCustomers = customers.length;
    const totalLeads = leads.length;

    // Phân loại lead theo trạng thái
    const leadsByStatus = {};
    leads.forEach((lead) => {
      leadsByStatus[lead.status] = (leadsByStatus[lead.status] || 0) + 1;
    });

    // Lấy số lượng khách hàng mới trong 7 ngày qua
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const newCustomers = customers.filter((customer) => {
      const createdAt = new Date(customer.createdAt);
      return createdAt >= oneWeekAgo;
    }).length;

    return res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        totalLeads,
        newCustomers,
        leadsByStatus,
      },
    });
  } catch (error) {
    console.error("Lỗi lấy thống kê:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
});

module.exports = router;
