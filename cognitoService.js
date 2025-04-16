const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

/**
 * Dịch vụ xác thực AWS Cognito để quản lý người dùng, đăng nhập và đăng ký
 */
class CognitoService {
  constructor(region = "us-east-1") {
    this.cognitoClient = new CognitoIdentityProviderClient({ region });
    this.secretsClient = new SecretsManagerClient({ region });
    this.isInitialized = false;
    this.region = region;

    // Cấu hình mặc định
    this.userPoolId = process.env.COGNITO_USER_POOL_ID;
    this.clientId = process.env.COGNITO_CLIENT_ID;
    this.secretName =
      process.env.COGNITO_SECRET_NAME || "cognito-service-config";
    this.useSecrets = process.env.USE_AWS_SECRETS === "true";
  }

  /**
   * Khởi tạo dịch vụ và tải cấu hình từ AWS Secrets Manager nếu được yêu cầu
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Tải cấu hình từ Secrets Manager nếu cần
      if (this.useSecrets) {
        await this._loadConfigFromSecrets();
      }

      if (!this.userPoolId || !this.clientId) {
        throw new Error("Thiếu các thông số cấu hình Cognito bắt buộc");
      }

      this.isInitialized = true;
      console.log("Dịch vụ Cognito đã được khởi tạo thành công");
    } catch (error) {
      console.error("Lỗi khởi tạo dịch vụ Cognito:", error);
      throw error;
    }
  }

  /**
   * Tải cấu hình từ AWS Secrets Manager
   * @private
   */
  async _loadConfigFromSecrets() {
    try {
      const command = new GetSecretValueCommand({
        SecretId: this.secretName,
      });

      const response = await this.secretsClient.send(command);
      const secretData = JSON.parse(response.SecretString);

      // Áp dụng cấu hình từ secret
      if (secretData.userPoolId) {
        this.userPoolId = secretData.userPoolId;
      }

      if (secretData.clientId) {
        this.clientId = secretData.clientId;
      }

      console.log("Đã tải cấu hình Cognito từ Secrets Manager");
    } catch (error) {
      console.error("Lỗi tải cấu hình Cognito từ Secrets Manager:", error);
      // Tiếp tục với cấu hình mặc định
    }
  }

  /**
   * Đăng ký người dùng mới
   * @param {string} username - Tên đăng nhập
   * @param {string} password - Mật khẩu
   * @param {string} email - Địa chỉ email
   * @param {string} phoneNumber - Số điện thoại
   * @param {Object} attributes - Các thuộc tính bổ sung
   * @returns {Promise} - Kết quả đăng ký
   */
  async signUp(username, password, email, phoneNumber, attributes = {}) {
    await this.initialize();

    const userAttrs = [{ Name: "email", Value: email }];

    if (phoneNumber) {
      userAttrs.push({ Name: "phone_number", Value: phoneNumber });
    }

    // Thêm các thuộc tính tùy chỉnh
    for (const [name, value] of Object.entries(attributes)) {
      if (name !== "email" && name !== "phone_number") {
        userAttrs.push({ Name: name, Value: value });
      }
    }

    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: username,
      Password: password,
      UserAttributes: userAttrs,
    });

    try {
      const response = await this.cognitoClient.send(command);
      return {
        success: true,
        userSub: response.UserSub,
        userConfirmed: response.UserConfirmed,
      };
    } catch (error) {
      console.error("Lỗi đăng ký người dùng:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Xác nhận đăng ký người dùng
   * @param {string} username - Tên đăng nhập
   * @param {string} confirmationCode - Mã xác nhận
   * @returns {Promise} - Kết quả xác nhận
   */
  async confirmSignUp(username, confirmationCode) {
    await this.initialize();

    const command = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: username,
      ConfirmationCode: confirmationCode,
    });

    try {
      await this.cognitoClient.send(command);
      return {
        success: true,
      };
    } catch (error) {
      console.error("Lỗi xác nhận đăng ký:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Đăng nhập người dùng
   * @param {string} username - Tên đăng nhập
   * @param {string} password - Mật khẩu
   * @returns {Promise} - Token truy cập
   */
  async login(username, password) {
    await this.initialize();

    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    });

    try {
      const response = await this.cognitoClient.send(command);
      return {
        success: true,
        accessToken: response.AuthenticationResult.AccessToken,
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        expiresIn: response.AuthenticationResult.ExpiresIn,
      };
    } catch (error) {
      console.error("Lỗi đăng nhập:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Làm mới token truy cập
   * @param {string} refreshToken - Token làm mới
   * @returns {Promise} - Token truy cập mới
   */
  async refreshToken(refreshToken) {
    await this.initialize();

    const command = new InitiateAuthCommand({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: this.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });

    try {
      const response = await this.cognitoClient.send(command);
      return {
        success: true,
        accessToken: response.AuthenticationResult.AccessToken,
        idToken: response.AuthenticationResult.IdToken,
        expiresIn: response.AuthenticationResult.ExpiresIn,
      };
    } catch (error) {
      console.error("Lỗi làm mới token:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Lấy thông tin người dùng từ token
   * @param {string} accessToken - Token truy cập
   * @returns {Promise} - Thông tin người dùng
   */
  async getUser(accessToken) {
    await this.initialize();

    const command = new GetUserCommand({
      AccessToken: accessToken,
    });

    try {
      const response = await this.cognitoClient.send(command);
      const userAttributes = {};

      // Chuyển đổi mảng thuộc tính thành đối tượng
      response.UserAttributes.forEach((attr) => {
        userAttributes[attr.Name] = attr.Value;
      });

      return {
        success: true,
        username: response.Username,
        attributes: userAttributes,
      };
    } catch (error) {
      console.error("Lỗi lấy thông tin người dùng:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Quên mật khẩu
   * @param {string} username - Tên đăng nhập
   * @returns {Promise} - Kết quả gửi mã xác nhận
   */
  async forgotPassword(username) {
    await this.initialize();

    const command = new ForgotPasswordCommand({
      ClientId: this.clientId,
      Username: username,
    });

    try {
      await this.cognitoClient.send(command);
      return {
        success: true,
      };
    } catch (error) {
      console.error("Lỗi quên mật khẩu:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Xác nhận đặt lại mật khẩu
   * @param {string} username - Tên đăng nhập
   * @param {string} confirmationCode - Mã xác nhận
   * @param {string} newPassword - Mật khẩu mới
   * @returns {Promise} - Kết quả đặt lại mật khẩu
   */
  async confirmForgotPassword(username, confirmationCode, newPassword) {
    await this.initialize();

    const command = new ConfirmForgotPasswordCommand({
      ClientId: this.clientId,
      Username: username,
      ConfirmationCode: confirmationCode,
      Password: newPassword,
    });

    try {
      await this.cognitoClient.send(command);
      return {
        success: true,
      };
    } catch (error) {
      console.error("Lỗi xác nhận đặt lại mật khẩu:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Gửi lại mã xác nhận
   * @param {string} username - Tên đăng nhập
   * @returns {Promise} - Kết quả gửi lại mã
   */
  async resendConfirmationCode(username) {
    await this.initialize();

    const command = new ResendConfirmationCodeCommand({
      ClientId: this.clientId,
      Username: username,
    });

    try {
      await this.cognitoClient.send(command);
      return {
        success: true,
      };
    } catch (error) {
      console.error("Lỗi gửi lại mã xác nhận:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Đăng xuất
   * @param {string} accessToken - Token truy cập
   * @returns {Promise} - Kết quả đăng xuất
   */
  async signOut(accessToken) {
    await this.initialize();

    const command = new GlobalSignOutCommand({
      AccessToken: accessToken,
    });

    try {
      await this.cognitoClient.send(command);
      return {
        success: true,
      };
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Quản trị viên tạo người dùng mới (không yêu cầu xác nhận)
   * @param {string} username - Tên đăng nhập
   * @param {string} email - Địa chỉ email
   * @param {Object} attributes - Các thuộc tính bổ sung
   * @returns {Promise} - Kết quả tạo người dùng
   */
  async adminCreateUser(username, email, attributes = {}) {
    await this.initialize();

    const userAttrs = [{ Name: "email", Value: email }];

    // Thêm các thuộc tính tùy chỉnh
    for (const [name, value] of Object.entries(attributes)) {
      if (name !== "email") {
        userAttrs.push({ Name: name, Value: value });
      }
    }

    const command = new AdminCreateUserCommand({
      UserPoolId: this.userPoolId,
      Username: username,
      UserAttributes: userAttrs,
    });

    try {
      const response = await this.cognitoClient.send(command);
      return {
        success: true,
        user: response.User,
      };
    } catch (error) {
      console.error("Lỗi tạo người dùng (admin):", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Quản trị viên đặt mật khẩu người dùng
   * @param {string} username - Tên đăng nhập
   * @param {string} password - Mật khẩu
   * @param {boolean} permanent - Mật khẩu cố định hay tạm thời
   * @returns {Promise} - Kết quả đặt mật khẩu
   */
  async adminSetUserPassword(username, password, permanent = true) {
    await this.initialize();

    const command = new AdminSetUserPasswordCommand({
      UserPoolId: this.userPoolId,
      Username: username,
      Password: password,
      Permanent: permanent,
    });

    try {
      await this.cognitoClient.send(command);
      return {
        success: true,
      };
    } catch (error) {
      console.error("Lỗi đặt mật khẩu người dùng (admin):", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new CognitoService();
