/**
 * Middleware xác thực đơn giản
 * Trong môi trường sản xuất thực tế, cần sử dụng JWT hoặc hệ thống xác thực mạnh hơn
 */
exports.auth = (req, res, next) => {
  try {
    // Lấy token từ header
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Vui lòng đăng nhập để tiếp tục",
      });
    }

    // Demo: Chỉ kiểm tra xem token có bắt đầu bằng 'demo-token-' không
    // Trong thực tế, cần xác minh JWT hoặc session
    if (!token.startsWith("demo-token-")) {
      return res.status(401).json({
        success: false,
        message: "Token không hợp lệ",
      });
    }

    // Lưu thông tin của user vào req để các route sau có thể sử dụng
    req.user = {
      username: "admin",
      role: "admin",
    };

    // Chuyển đến middleware tiếp theo
    next();
  } catch (error) {
    console.error("Lỗi xác thực:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi xác thực: " + error.message,
    });
  }
};

/**
 * Middleware kiểm tra quyền admin
 */
exports.adminAuth = (req, res, next) => {
  try {
    // Đảm bảo người dùng đã được xác thực
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Vui lòng đăng nhập để tiếp tục",
      });
    }

    // Kiểm tra quyền admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập chức năng này",
      });
    }

    // Chuyển đến middleware tiếp theo
    next();
  } catch (error) {
    console.error("Lỗi kiểm tra quyền admin:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ: " + error.message,
    });
  }
};
