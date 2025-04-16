const AWS = require("aws-sdk");
const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
const axios = require("axios");
const logger = require("../utils/logger");

class CognitoService {
  constructor() {
    this.cognitoIdentity = null;
    this.userPoolId = null;
    this.clientId = null;
    this.region = null;
    this.secretsManager = null;
    this.useSecretsManager = false;
    this.secretId = null;
    this.jwks = null;
    this.pems = {};
  }

  /**
   * Khởi tạo dịch vụ Cognito
   * @param {Object} config - Cấu hình Cognito
   * @param {string} config.region - AWS Region
   * @param {string} config.userPoolId - ID User Pool Cognito
   * @param {string} config.clientId - ID Client Cognito
   * @param {boolean} [config.useSecretsManager] - Sử dụng AWS Secrets Manager
   * @param {string} [config.secretId] - ID của secret trong AWS Secrets Manager
   */
  async initialize(config = {}) {
    try {
      // Kiểm tra xem có sử dụng Secrets Manager không
      if (config.useSecretsManager && config.secretId) {
        this.useSecretsManager = true;
        this.secretId = config.secretId;
        this.region = config.region || process.env.AWS_REGION;

        // Khởi tạo Secrets Manager
        this.secretsManager = new AWS.SecretsManager({
          region: this.region,
        });

        // Lấy cấu hình từ Secrets Manager
        await this._loadConfigFromSecrets();
      } else {
        // Sử dụng cấu hình trực tiếp
        this.userPoolId = config.userPoolId || process.env.COGNITO_USER_POOL_ID;
        this.clientId = config.clientId || process.env.COGNITO_CLIENT_ID;
        this.region = config.region || process.env.AWS_REGION;
      }

      // Kiểm tra các thông tin cần thiết
      if (!this.userPoolId || !this.clientId || !this.region) {
        throw new Error("Thiếu thông tin cấu hình Cognito");
      }

      // Khởi tạo Cognito Identity Provider
      this.cognitoIdentity = new AWS.CognitoIdentityServiceProvider({
        region: this.region,
      });

      // Tải JWKS để xác thực token
      await this._loadJwks();

      logger.info("Đã khởi tạo Cognito Service thành công");
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi khởi tạo Cognito Service: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Lấy cấu hình từ AWS Secrets Manager
   */
  async _loadConfigFromSecrets() {
    try {
      const params = {
        SecretId: this.secretId,
      };

      const secretData = await this.secretsManager
        .getSecretValue(params)
        .promise();
      let secretJson;

      // Lấy dữ liệu secret dưới dạng chuỗi hoặc binary
      if ("SecretString" in secretData) {
        secretJson = JSON.parse(secretData.SecretString);
      } else {
        const buff = Buffer.from(secretData.SecretBinary, "base64");
        secretJson = JSON.parse(buff.toString("ascii"));
      }

      // Cập nhật cấu hình từ secret
      this.userPoolId = secretJson.userPoolId;
      this.clientId = secretJson.clientId;
      this.region = secretJson.region || this.region;

      logger.debug("Đã tải cấu hình Cognito từ Secrets Manager");
    } catch (error) {
      logger.error(`Lỗi tải cấu hình từ Secrets Manager: ${error.message}`, {
        error,
      });
      throw error;
    }
  }

  /**
   * Tải JWKS từ Cognito để xác thực token
   */
  async _loadJwks() {
    try {
      const url = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`;
      const response = await axios.get(url);
      this.jwks = response.data.keys;

      // Chuyển đổi các JWK sang dạng PEM
      this.pems = {};
      for (const key of this.jwks) {
        const pem = jwkToPem(key);
        this.pems[key.kid] = pem;
      }

      logger.debug("Đã tải JWKS từ Cognito");
    } catch (error) {
      logger.error(`Lỗi tải JWKS: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Đăng ký người dùng mới
   * @param {Object} user - Thông tin người dùng
   * @param {string} user.username - Tên đăng nhập
   * @param {string} user.password - Mật khẩu
   * @param {string} user.email - Email
   * @param {string} [user.phoneNumber] - Số điện thoại (với định dạng +xx)
   * @param {Object} [user.attributes] - Các thuộc tính khác
   */
  async signUp(user) {
    try {
      const { username, password, email, phoneNumber, attributes = {} } = user;

      // Chuẩn bị danh sách thuộc tính
      const userAttributes = [{ Name: "email", Value: email }];

      // Thêm số điện thoại nếu có
      if (phoneNumber) {
        userAttributes.push({ Name: "phone_number", Value: phoneNumber });
      }

      // Thêm các thuộc tính khác
      for (const [key, value] of Object.entries(attributes)) {
        if (key !== "email" && key !== "phone_number") {
          userAttributes.push({ Name: key, Value: String(value) });
        }
      }

      const params = {
        ClientId: this.clientId,
        Username: username,
        Password: password,
        UserAttributes: userAttributes,
      };

      const result = await this.cognitoIdentity.signUp(params).promise();

      logger.info(`Đã đăng ký người dùng: ${username}`);
      return {
        success: true,
        userSub: result.UserSub,
        userConfirmed: result.UserConfirmed,
      };
    } catch (error) {
      logger.error(`Lỗi đăng ký người dùng: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Xác nhận đăng ký người dùng
   * @param {string} username - Tên đăng nhập
   * @param {string} confirmationCode - Mã xác nhận
   */
  async confirmSignUp(username, confirmationCode) {
    try {
      const params = {
        ClientId: this.clientId,
        Username: username,
        ConfirmationCode: confirmationCode,
      };

      await this.cognitoIdentity.confirmSignUp(params).promise();

      logger.info(`Đã xác nhận đăng ký người dùng: ${username}`);
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi xác nhận đăng ký: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Đăng nhập người dùng
   * @param {string} username - Tên đăng nhập
   * @param {string} password - Mật khẩu
   */
  async signIn(username, password) {
    try {
      const params = {
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      };

      const result = await this.cognitoIdentity.initiateAuth(params).promise();

      logger.info(`Đăng nhập thành công: ${username}`);
      return {
        success: true,
        tokens: {
          idToken: result.AuthenticationResult.IdToken,
          accessToken: result.AuthenticationResult.AccessToken,
          refreshToken: result.AuthenticationResult.RefreshToken,
          expiresIn: result.AuthenticationResult.ExpiresIn,
        },
      };
    } catch (error) {
      logger.error(`Lỗi đăng nhập: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Làm mới token
   * @param {string} refreshToken - Refresh token
   */
  async refreshTokens(refreshToken) {
    try {
      const params = {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: this.clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      };

      const result = await this.cognitoIdentity.initiateAuth(params).promise();

      logger.debug("Đã làm mới token thành công");
      return {
        success: true,
        tokens: {
          idToken: result.AuthenticationResult.IdToken,
          accessToken: result.AuthenticationResult.AccessToken,
          expiresIn: result.AuthenticationResult.ExpiresIn,
        },
      };
    } catch (error) {
      logger.error(`Lỗi làm mới token: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Lấy thông tin người dùng từ token
   * @param {string} token - Access token
   */
  async getUser(token) {
    try {
      // Xác thực token
      const decoded = await this._verifyToken(token);
      if (!decoded) {
        return { success: false, error: "Token không hợp lệ" };
      }

      // Lấy thông tin người dùng từ Cognito
      const params = {
        AccessToken: token,
      };

      const userData = await this.cognitoIdentity.getUser(params).promise();

      // Chuyển đổi thuộc tính thành đối tượng
      const attributes = {};
      for (const attribute of userData.UserAttributes) {
        attributes[attribute.Name] = attribute.Value;
      }

      logger.debug(`Đã lấy thông tin người dùng: ${userData.Username}`);
      return {
        success: true,
        username: userData.Username,
        attributes,
      };
    } catch (error) {
      logger.error(`Lỗi lấy thông tin người dùng: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Xác thực token JWT
   * @param {string} token - Token JWT
   */
  async _verifyToken(token) {
    try {
      // Giải mã token để lấy header
      const decodedJwt = jwt.decode(token, { complete: true });
      if (!decodedJwt) {
        logger.warn("Token không hợp lệ");
        return null;
      }

      // Lấy kid từ header của token
      const kid = decodedJwt.header.kid;
      const pem = this.pems[kid];

      if (!pem) {
        logger.warn("PEM không tìm thấy cho token này");
        // Tải lại JWKS nếu không tìm thấy PEM
        await this._loadJwks();
        return null;
      }

      // Xác thực token
      const verifyPromise = promisify(jwt.verify);
      const payload = await verifyPromise(token, pem, {
        issuer: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`,
      });

      return payload;
    } catch (error) {
      logger.warn(`Xác thực token thất bại: ${error.message}`, { error });
      return null;
    }
  }

  /**
   * Quên mật khẩu - gửi mã xác nhận
   * @param {string} username - Tên đăng nhập
   */
  async forgotPassword(username) {
    try {
      const params = {
        ClientId: this.clientId,
        Username: username,
      };

      await this.cognitoIdentity.forgotPassword(params).promise();

      logger.info(`Đã gửi yêu cầu quên mật khẩu cho: ${username}`);
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi yêu cầu quên mật khẩu: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Xác nhận đặt lại mật khẩu
   * @param {string} username - Tên đăng nhập
   * @param {string} confirmationCode - Mã xác nhận
   * @param {string} newPassword - Mật khẩu mới
   */
  async confirmForgotPassword(username, confirmationCode, newPassword) {
    try {
      const params = {
        ClientId: this.clientId,
        Username: username,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      };

      await this.cognitoIdentity.confirmForgotPassword(params).promise();

      logger.info(`Đã đặt lại mật khẩu cho: ${username}`);
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi đặt lại mật khẩu: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Thay đổi mật khẩu
   * @param {string} accessToken - Access token
   * @param {string} oldPassword - Mật khẩu cũ
   * @param {string} newPassword - Mật khẩu mới
   */
  async changePassword(accessToken, oldPassword, newPassword) {
    try {
      const params = {
        AccessToken: accessToken,
        PreviousPassword: oldPassword,
        ProposedPassword: newPassword,
      };

      await this.cognitoIdentity.changePassword(params).promise();

      logger.info("Đã thay đổi mật khẩu thành công");
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi thay đổi mật khẩu: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Gửi lại mã xác nhận
   * @param {string} username - Tên đăng nhập
   */
  async resendConfirmationCode(username) {
    try {
      const params = {
        ClientId: this.clientId,
        Username: username,
      };

      await this.cognitoIdentity.resendConfirmationCode(params).promise();

      logger.info(`Đã gửi lại mã xác nhận cho: ${username}`);
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi gửi lại mã xác nhận: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Đăng xuất người dùng
   * @param {string} accessToken - Access token
   */
  async signOut(accessToken) {
    try {
      const params = {
        AccessToken: accessToken,
      };

      await this.cognitoIdentity.globalSignOut(params).promise();

      logger.info("Đã đăng xuất thành công");
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi đăng xuất: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Admin - Tạo người dùng mới (không cần xác nhận)
   * @param {Object} user - Thông tin người dùng
   * @param {string} user.username - Tên đăng nhập
   * @param {string} user.password - Mật khẩu
   * @param {string} user.email - Email
   * @param {string} [user.phoneNumber] - Số điện thoại
   * @param {Object} [user.attributes] - Các thuộc tính khác
   */
  async adminCreateUser(user) {
    try {
      const { username, password, email, phoneNumber, attributes = {} } = user;

      // Chuẩn bị danh sách thuộc tính
      const userAttributes = [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
      ];

      // Thêm số điện thoại nếu có
      if (phoneNumber) {
        userAttributes.push({ Name: "phone_number", Value: phoneNumber });
        userAttributes.push({ Name: "phone_number_verified", Value: "true" });
      }

      // Thêm các thuộc tính khác
      for (const [key, value] of Object.entries(attributes)) {
        if (
          ![
            "email",
            "phone_number",
            "email_verified",
            "phone_number_verified",
          ].includes(key)
        ) {
          userAttributes.push({ Name: key, Value: String(value) });
        }
      }

      const params = {
        UserPoolId: this.userPoolId,
        Username: username,
        TemporaryPassword: password,
        MessageAction: "SUPPRESS", // Không gửi email
        UserAttributes: userAttributes,
      };

      await this.cognitoIdentity.adminCreateUser(params).promise();

      // Thiết lập mật khẩu vĩnh viễn
      if (password) {
        await this.adminSetUserPassword(username, password, true);
      }

      logger.info(`Admin đã tạo người dùng: ${username}`);
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi tạo người dùng: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Admin - Thiết lập mật khẩu cho người dùng
   * @param {string} username - Tên đăng nhập
   * @param {string} password - Mật khẩu mới
   * @param {boolean} permanent - Mật khẩu vĩnh viễn (không cần thay đổi)
   */
  async adminSetUserPassword(username, password, permanent = true) {
    try {
      const params = {
        UserPoolId: this.userPoolId,
        Username: username,
        Password: password,
        Permanent: permanent,
      };

      await this.cognitoIdentity.adminSetUserPassword(params).promise();

      logger.info(`Admin đã thiết lập mật khẩu cho: ${username}`);
      return { success: true };
    } catch (error) {
      logger.error(`Lỗi thiết lập mật khẩu: ${error.message}`, { error });
      return { success: false, error: error.message };
    }
  }
}

module.exports = new CognitoService();
