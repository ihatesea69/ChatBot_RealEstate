const cognitoService = require("../services/cognitoService");
const logger = require("../utils/logger");

/**
 * Middleware xác thực người dùng
 * @param {Object} req - Đối tượng request
 * @param {Object} res - Đối tượng response
 * @param {Function} next - Hàm next
 */
async function authMiddleware(req, res, next) {
  try {
    // Lấy Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Không tìm thấy token');
      return res.status(401).json({ success: false, message: 'Không được phép truy cập' });
    }

    // Lấy token từ header
    const token = authHeader.split(' ')[1];
    if (!token) {
      logger.warn('Token không hợp lệ');
      return res.status(401).json({ success: false, message: 'Không được phép truy cập' });
    }

    // Xác thực token với Cognito
    const decoded = await cognitoService._verifyToken(token);
    if (!decoded) {
      logger.warn('Token không hợp lệ hoặc đã hết hạn');
      return res.status(401).json({ success: false, message: 'Không được phép truy cập' });
    }

    // Lấy thông tin người dùng
    const userData = await cognitoService.getUser(token);
    if (!userData.success) {
      logger.warn('Không thể lấy thông tin người dùng');
      return res.status(401).json({ success: false, message: 'Không được phép truy cập' });
    }

    // Lưu thông tin người dùng vào request
    req.user = {
      id: decoded.sub,
      username: userData.username,
      email: userData.attributes.email,
      // Lấy các thuộc tính cần thiết khác
      roles: userData.attributes['custom:roles'] ? userData.attributes['custom:roles'].split(',') : [],
      attributes: userData.attributes
    };

    // Chuyển đến middleware tiếp theo
    next();
  } catch (error) {
    logger.error(`Lỗi xác thực: ${error.message}`, { error });
    return res.status(401).json({ success: false, message: 'Không được phép truy cập' });
  }
}

/**
 * Middleware yêu cầu quyền admin
 * @param {Object} req - Đối tượng request
 * @param {Object} res - Đối tượng response
 * @param {Function} next - Hàm next
 */
function requireAdmin(req, res, next) {
  // Kiểm tra xem người dùng đã được xác thực chưa
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Không được phép truy cập' });
  }

  // Kiểm tra xem người dùng có quyền admin không
  if (!req.user.roles.includes('admin')) {
    logger.warn(`Người dùng ${req.user.username} không có quyền admin`);
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này' });
  }

  next();
}

/**
 * Middleware yêu cầu quyền cụ thể
 * @param {string[]} allowedRoles - Danh sách các quyền được phép
 * @returns {Function} Middleware
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    // Kiểm tra xem người dùng đã được xác thực chưa
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Không được phép truy cập' });
    }

    // Kiểm tra xem người dùng có quyền yêu cầu không
    const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      logger.warn(`Người dùng ${req.user.username} không có quyền yêu cầu`);
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này' });
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  requireAdmin,
  requireRole
};
