const fs = require('fs');
const path = require('path');

// Đường dẫn thư mục chứa tài liệu BĐS Dubai
const DOCS_DIR = path.join(process.cwd(), 'dubai_real_estate_docs');

/**
 * Một phiên bản đơn giản của RAG service không phụ thuộc vào LangChain
 * Sử dụng để tránh các lỗi tương thích với các gói thư viện
 */
class SimpleRAGService {
  constructor() {
    this.initialized = false;
    this.documents = [];
  }

  /**
   * Khởi tạo service, đọc tất cả tài liệu vào bộ nhớ
   */
  async initialize() {
    try {
      console.log('Initializing simple RAG service...');
      
      // Tạo thư mục docs nếu chưa tồn tại
      if (!fs.existsSync(DOCS_DIR)) {
        fs.mkdirSync(DOCS_DIR, { recursive: true });
        console.log(`Created documents directory at ${DOCS_DIR}`);
      }
      
      // Đọc tất cả tài liệu từ thư mục
      await this.loadAllDocuments();
      
      this.initialized = true;
      console.log('Simple RAG service initialized successfully');
      console.log(`Loaded ${this.documents.length} document chunks`);
      return true;
    } catch (error) {
      console.error('Error initializing simple RAG service:', error);
      return false;
    }
  }
  
  /**
   * Đọc tất cả tài liệu từ thư mục
   */
  async loadAllDocuments() {
    try {
      this.documents = [];
      const files = fs.readdirSync(DOCS_DIR);
      
      for (const file of files) {
        const filePath = path.join(DOCS_DIR, file);
        const fileExt = path.extname(file).toLowerCase();
        
        // Chỉ hỗ trợ file .txt
        if (fileExt === '.txt') {
          const content = fs.readFileSync(filePath, 'utf8');
          
          // Chia thành các đoạn nhỏ 1000 ký tự, với overlap 100 ký tự
          const chunks = [];
          const chunkSize = 1000;
          const overlap = 100;
          
          for (let i = 0; i < content.length; i += chunkSize - overlap) {
            const chunk = content.slice(i, i + chunkSize);
            chunks.push({
              content: chunk,
              metadata: { source: file }
            });
          }
          
          this.documents.push(...chunks);
          console.log(`Loaded and split ${file} into ${chunks.length} chunks`);
        } else {
          console.log(`Skipping unsupported file: ${file} (only .txt supported in simple mode)`);
        }
      }
      
      return this.documents;
    } catch (error) {
      console.error('Error loading documents:', error);
      return [];
    }
  }
  
  /**
   * Thêm một tài liệu mới
   */
  async addDocument(filePath, fileName) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      const targetPath = path.join(DOCS_DIR, fileName);
      
      // Copy file vào thư mục docs
      fs.copyFileSync(filePath, targetPath);
      console.log(`Added document ${fileName} to docs directory`);
      
      // Làm mới documents
      await this.loadAllDocuments();
      
      return true;
    } catch (error) {
      console.error('Error adding document:', error);
      return false;
    }
  }
  
  /**
   * Tìm kiếm tài liệu phù hợp với truy vấn
   * Phương thức này sử dụng tìm kiếm từ khóa đơn giản thay vì vector search
   */
  async queryDocuments(query, maxResults = 3) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      console.log(`Querying for: "${query}"`);
      
      // Xử lý query để tìm kiếm
      const keywords = query.toLowerCase().split(' ').filter(word => word.length > 3);
      
      // Tính điểm cho mỗi document dựa trên số lần xuất hiện các từ khóa
      const scoredDocs = this.documents.map(doc => {
        const content = doc.content.toLowerCase();
        let score = 0;
        
        for (const keyword of keywords) {
          const count = (content.match(new RegExp(keyword, 'g')) || []).length;
          score += count;
        }
        
        return { 
          content: doc.content,
          metadata: doc.metadata,
          score 
        };
      });
      
      // Sắp xếp theo điểm và lấy các document phù hợp nhất
      const relevantDocs = scoredDocs
        .filter(doc => doc.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
      
      console.log(`Found ${relevantDocs.length} relevant documents`);
      return relevantDocs;
    } catch (error) {
      console.error('Error querying documents:', error);
      return [];
    }
  }
  
  /**
   * Tạo prompt bổ sung với thông tin từ tài liệu liên quan
   */
  async generateRagPrompt(query, userQuery) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Truy vấn tài liệu liên quan
      const relevantDocs = await this.queryDocuments(query);
      
      if (relevantDocs.length === 0) {
        return null; // Không có tài liệu liên quan
      }
      
      // Tạo đoạn văn bản từ các tài liệu liên quan
      const contextText = relevantDocs.map((doc, index) => 
        `Document ${index + 1} (from ${doc.metadata.source}):\n${doc.content}`
      ).join('\n\n');
      
      // Tạo prompt bổ sung
      const ragPrompt = `
Here is some specific information about Dubai real estate that might help answer the query:

${contextText}

Please use this information to provide an accurate response to the following query:
${userQuery}

If the information provided isn't sufficient to answer the query fully, you can rely on your general knowledge about Dubai real estate, but prioritize the specific information provided above when possible.
`;
      
      return ragPrompt;
    } catch (error) {
      console.error('Error generating RAG prompt:', error);
      return null;
    }
  }
}

module.exports = new SimpleRAGService(); 