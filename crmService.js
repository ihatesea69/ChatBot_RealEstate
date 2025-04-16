const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
const path = require('path');
const fs = require('fs');
const AWS = require('aws-sdk');

class CRMService {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    this.initialized = false;
    this.secretsManager = new AWS.SecretsManager({
      region: process.env.AWS_REGION || 'us-east-1'
    });
  }

  async initialize(auth) {
    try {
      if (!auth) {
        console.log('No auth provided, attempting to authenticate...');
        
        // Ưu tiên sử dụng Secrets Manager nếu đang ở môi trường AWS
        if (process.env.USE_AWS_SECRETS === 'true') {
          auth = await this._getAuthFromSecretsManager();
        } else {
          // Xác thực trực tiếp nếu không sử dụng AWS Secrets Manager
          auth = await authenticate({
            keyfilePath: path.join(process.cwd(), 'credentials.json'),
            scopes: [
              'https://www.googleapis.com/auth/spreadsheets',
              'https://www.googleapis.com/auth/drive'
            ],
          });
        }
      }
      
      this.sheets = google.sheets({ version: 'v4', auth });
      this.initialized = true;
      console.log('CRM Service initialized successfully');
      
      // Kiểm tra kết nối và quyền truy cập
      await this.verifyAccess();
      
      return true;
    } catch (error) {
      console.error('Error initializing CRM Service:', error);
      if (error.message && error.message.includes('insufficient')) {
        console.error('===== PERMISSION ERROR =====');
        console.error('Seems like you do not have permission to access the spreadsheet.');
        console.error('Please make sure:');
        console.error('1. The spreadsheet is shared with your Google account');
        console.error('2. You have "Editor" access to the spreadsheet');
        console.error('3. The spreadsheet ID in .env file is correct');
        console.error(`Current spreadsheet ID: ${this.spreadsheetId}`);
        console.error('===========================');
      }
      throw error;
    }
  }

  async _getAuthFromSecretsManager() {
    try {
      const secretName = process.env.GOOGLE_CREDENTIALS_SECRET_NAME || 'google/credentials';
      const data = await this.secretsManager.getSecretValue({ SecretId: secretName }).promise();
      
      let credentials;
      if (data.SecretString) {
        credentials = JSON.parse(data.SecretString);
      } else {
        const buff = Buffer.from(data.SecretBinary, 'base64');
        credentials = JSON.parse(buff.toString('ascii'));
      }

      // Thiết lập xác thực OAuth2 từ credentials lấy từ Secrets Manager
      const { client_email, private_key, client_id } = credentials;
      const auth = new google.auth.JWT(
        client_email,
        null,
        private_key,
        [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive'
        ]
      );

      console.log('Successfully retrieved Google credentials from AWS Secrets Manager');
      return auth;
    } catch (error) {
      console.error('Error loading Google credentials from Secrets Manager:', error);
      throw new Error(`Failed to get Google auth from AWS Secrets Manager: ${error.message}`);
    }
  }
  
  async verifyAccess() {
    try {
      if (!this.initialized || !this.sheets) {
        throw new Error('CRM Service not initialized properly');
      }
      
      // Check if the spreadsheet exists and we have access
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });
      
      // Check if all required sheets exist
      const sheetsInfo = response.data.sheets;
      const requiredSheets = ['Leads', 'Conversations', 'VoiceMemos'];
      const existingSheets = sheetsInfo.map(sheet => sheet.properties.title);
      
      const missingSheets = requiredSheets.filter(sheet => !existingSheets.includes(sheet));
      
      if (missingSheets.length > 0) {
        console.warn(`Warning: Missing sheets: ${missingSheets.join(', ')}`);
        console.warn('Attempting to create missing sheets...');
        
        for (const sheetName of missingSheets) {
          await this.createSheet(sheetName);
        }
      }
      
      console.log(`Successfully connected to spreadsheet: "${response.data.properties.title}"`);
      console.log(`Available sheets: ${existingSheets.join(', ')}`);
      return true;
    } catch (error) {
      console.error('Error verifying spreadsheet access:', error);
      throw new Error(`Failed to access spreadsheet. Please check your permissions and spreadsheet ID: ${error.message}`);
    }
  }
  
  async createSheet(sheetName) {
    try {
      // Add a new sheet
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }]
        }
      });
      
      // Add headers based on sheet type
      let headerRow = [];
      
      if (sheetName === 'Leads') {
        headerRow = ['Timestamp', 'Name', 'Phone', 'Email', 'Budget', 'Area', 'Property Type', 'Timeline', 'Notes', 'Status', 'Meeting Link'];
      } else if (sheetName === 'Conversations') {
        headerRow = ['Timestamp', 'Phone', 'Message', 'Sender'];
      } else if (sheetName === 'VoiceMemos') {
        headerRow = ['Timestamp', 'Phone', 'Transcription', 'Audio URL'];
      }
      
      if (headerRow.length > 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A1:Z1`,
          valueInputOption: 'RAW',
          resource: {
            values: [headerRow]
          }
        });
      }
      
      console.log(`Created new sheet: ${sheetName}`);
      return true;
    } catch (error) {
      console.error(`Error creating sheet ${sheetName}:`, error);
      throw error;
    }
  }

  async createNewLead(leadData) {
    try {
      if (!this.initialized) await this.initialize();
      
      const values = [[
        new Date().toISOString(),
        leadData.name || '',
        leadData.phone || '',
        leadData.email || '',
        leadData.budget || '',
        leadData.area || '',
        leadData.propertyType || '',
        leadData.timeline || '',
        leadData.notes || '',
        'New Lead',
        leadData.meetingDate || '',
        leadData.meetingLink || ''
      ]];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Leads!A:L',
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });

      return true;
    } catch (error) {
      console.error('Error creating new lead:', error);
      throw error;
    }
  }

  async updateLeadStatus(phone, status, notes = '') {
    try {
      if (!this.initialized) await this.initialize();
      
      console.log(`Updating lead status for phone ${phone} to ${status}`);
      
      // First try to find the lead
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Leads!A:L'
      });

      if (!response.data.values || response.data.values.length <= 1) {
        console.log('No existing leads or only header row. Creating new lead instead.');
        return await this.createNewLead({
          phone: phone,
          notes: notes,
          status: status
        });
      }
      
      const rows = response.data.values;
      let rowIndex = rows.findIndex(row => row[2] === phone);
      
      if (rowIndex === -1) {
        console.log(`Lead with phone ${phone} not found. Creating new lead.`);
        return await this.createNewLead({
          phone: phone,
          notes: notes,
          status: status
        });
      }

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `Leads!J${rowIndex + 1}:K${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[status, notes]]
        }
      });
      
      console.log(`Successfully updated lead status to ${status}`);
      return true;
    } catch (error) {
      console.error('Error updating lead status:', error);
      // Create a simple log record instead of failing
      await this.logStandalone(`Failed to update lead status for ${phone}: ${error.message}`);
      return false;
    }
  }

  async logConversation(phone, message, isBot = false) {
    try {
      if (!this.initialized) await this.initialize();
      
      if (!this.sheets) {
        console.error('Google Sheets API not initialized');
        return false;
      }
      
      const values = [[
        new Date().toISOString(),
        phone,
        message.substring(0, 50000), // Limit to 50K chars to avoid size limits
        isBot ? 'Bot' : 'User'
      ]];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Conversations!A:D',
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });

      return true;
    } catch (error) {
      console.error('Error logging conversation:', error);
      return false; // Không throw error để tránh làm gián đoạn cuộc trò chuyện
    }
  }

  async logVoiceMemo(phone, transcription, audioUrl) {
    try {
      if (!this.initialized) await this.initialize();
      
      const values = [[
        new Date().toISOString(),
        phone,
        transcription,
        audioUrl
      ]];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'VoiceMemos!A:D',
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });

      return true;
    } catch (error) {
      console.error('Error logging voice memo:', error);
      return false; // Không throw error để tránh làm gián đoạn cuộc trò chuyện
    }
  }
  
  async logStandalone(message) {
    // Simple log function that doesn't depend on spreadsheet
    console.log(`[CRM LOG] ${message}`);
    
    // Optionally write to a local log file
    try {
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const logFile = path.join(logDir, 'crm_errors.log');
      fs.appendFileSync(
        logFile, 
        `${new Date().toISOString()} - ${message}\n`
      );
    } catch (logError) {
      console.error('Failed to write to local log:', logError);
    }
  }
}

module.exports = new CRMService(); 