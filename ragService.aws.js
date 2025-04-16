const { BedrockRuntime } = require("@aws-sdk/client-bedrock-runtime");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { OpenSearch } = require("@opensearch-project/opensearch");
const { AwsSigv4Signer } = require("@opensearch-project/opensearch/aws");

/**
 * Dịch vụ RAG (Retrieval Augmented Generation) sử dụng AWS Bedrock và OpenSearch
 */
class RAGService {
  constructor(region = "us-east-1") {
    this.bedrockClient = new BedrockRuntime({ region });
    this.secretsClient = new SecretsManagerClient({ region });
    this.isInitialized = false;
    this.region = region;
    this.openSearchClient = null;
    this.modelId =
      process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";
    this.openSearchEndpoint = process.env.OPENSEARCH_ENDPOINT;
    this.openSearchIndex = process.env.OPENSEARCH_INDEX || "knowledge-base";
    this.secretName = process.env.RAG_SECRET_NAME || "rag-service-config";
  }

  /**
   * Khởi tạo dịch vụ RAG
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load cấu hình từ Secrets Manager
      await this._loadConfigFromSecrets();

      // Khởi tạo OpenSearch client nếu có endpoint
      if (this.openSearchEndpoint) {
        this.openSearchClient = new OpenSearch({
          node: this.openSearchEndpoint,
          ...AwsSigv4Signer({
            region: this.region,
            service: "es",
          }),
        });

        // Kiểm tra kết nối OpenSearch
        await this.openSearchClient.cluster.health();
        console.log("OpenSearch connection established successfully");
      } else {
        console.log(
          "OpenSearch endpoint not configured, RAG will operate without retrieval capability"
        );
      }

      this.isInitialized = true;
      console.log("RAG Service initialized successfully");
    } catch (error) {
      console.error("Error initializing RAG Service:", error);
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

      // Cập nhật cấu hình từ secret
      if (secretData.modelId) {
        this.modelId = secretData.modelId;
      }

      if (secretData.openSearchEndpoint) {
        this.openSearchEndpoint = secretData.openSearchEndpoint;
      }

      if (secretData.openSearchIndex) {
        this.openSearchIndex = secretData.openSearchIndex;
      }

      console.log("Loaded RAG configuration from Secrets Manager");
    } catch (error) {
      console.warn(
        "Error loading RAG configuration from Secrets Manager:",
        error.message
      );
      console.log("Using default or environment variable configuration");
    }
  }

  /**
   * Tìm kiếm thông tin liên quan từ OpenSearch
   * @param {string} query - Truy vấn tìm kiếm
   * @param {number} limit - Số lượng kết quả tối đa trả về
   * @returns {Promise<Array>} - Danh sách các kết quả tìm kiếm
   */
  async retrieveContext(query, limit = 3) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.openSearchClient) {
        console.warn(
          "OpenSearch client not initialized. Cannot retrieve context."
        );
        return [];
      }

      const searchResponse = await this.openSearchClient.search({
        index: this.openSearchIndex,
        body: {
          query: {
            multi_match: {
              query: query,
              fields: ["title^2", "content"],
              fuzziness: "AUTO",
            },
          },
          size: limit,
        },
      });

      const hits = searchResponse.body.hits.hits || [];
      const results = hits.map((hit) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source,
      }));

      console.log(
        `Retrieved ${results.length} documents for query: "${query}"`
      );
      return results;
    } catch (error) {
      console.error("Error retrieving context:", error);
      return [];
    }
  }

  /**
   * Thêm tài liệu vào kho kiến thức
   * @param {Object} document - Tài liệu cần thêm
   * @returns {Promise<Object>} - Kết quả của thao tác
   */
  async addDocument(document) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.openSearchClient) {
        throw new Error("OpenSearch client not initialized");
      }

      if (!document.id) {
        document.id = `doc_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 9)}`;
      }

      // Thêm hoặc cập nhật tài liệu trong OpenSearch
      const response = await this.openSearchClient.index({
        index: this.openSearchIndex,
        id: document.id,
        body: {
          title: document.title || "Untitled",
          content: document.content,
          metadata: document.metadata || {},
          updatedAt: new Date().toISOString(),
        },
        refresh: true, // Đảm bảo tài liệu có thể tìm kiếm ngay lập tức
      });

      console.log(`Document indexed successfully with ID: ${document.id}`);
      return {
        id: document.id,
        result: response.body,
      };
    } catch (error) {
      console.error("Error adding document to knowledge base:", error);
      throw error;
    }
  }

  /**
   * Tạo ra phản hồi từ mô hình LLM với ngữ cảnh bổ sung
   * @param {string} prompt - Prompt gốc
   * @param {Object} options - Tùy chọn bổ sung
   * @returns {Promise<string>} - Phản hồi từ mô hình
   */
  async generateWithRAG(prompt, options = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Trích xuất context liên quan từ cơ sở kiến thức
      let contextDocs = [];
      if (this.openSearchClient) {
        contextDocs = await this.retrieveContext(prompt, options.limit || 3);
      }

      // Tạo prompt mở rộng với context bổ sung
      let augmentedPrompt = prompt;
      if (contextDocs && contextDocs.length > 0) {
        const contextText = contextDocs
          .map((doc) => `--- ${doc.title || "Document"} ---\n${doc.content}`)
          .join("\n\n");

        // Thêm hướng dẫn và ngữ cảnh vào prompt
        augmentedPrompt = `Hãy trả lời dựa trên thông tin sau:

${contextText}

Dựa vào thông tin trên, hãy trả lời câu hỏi này: ${prompt}`;
      }

      // Gọi LLM với prompt đã tăng cường
      const response = await this._callLLM(augmentedPrompt, options);
      return response;
    } catch (error) {
      console.error("Error generating RAG response:", error);
      throw error;
    }
  }

  /**
   * Gọi API Bedrock để tạo phản hồi
   * @param {string} prompt - Prompt đầu vào
   * @param {Object} options - Tùy chọn bổ sung
   * @returns {Promise<string>} - Phản hồi từ mô hình
   * @private
   */
  async _callLLM(prompt, options = {}) {
    try {
      // Xác định model ID
      const modelId = options.modelId || this.modelId;

      // Khởi tạo thông số mặc định
      const temperature = options.temperature || 0.7;
      const maxTokens = options.maxTokens || 4096;

      let payload;

      // Tạo payload dựa trên model
      if (modelId.includes("anthropic.claude")) {
        // Format Anthropic Claude
        payload = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: maxTokens,
          temperature: temperature,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        };
      } else if (modelId.includes("amazon.titan")) {
        // Format Amazon Titan
        payload = {
          inputText: prompt,
          textGenerationConfig: {
            temperature: temperature,
            maxTokenCount: maxTokens,
          },
        };
      } else {
        throw new Error(`Unsupported model: ${modelId}`);
      }

      // Gọi Bedrock Runtime API
      const response = await this.bedrockClient.invokeModel({
        modelId: modelId,
        body: JSON.stringify(payload),
        contentType: "application/json",
        accept: "application/json",
      });

      // Xử lý phản hồi dựa trên model
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      if (modelId.includes("anthropic.claude")) {
        // Anthropic Claude response format
        return responseBody.content[0].text;
      } else if (modelId.includes("amazon.titan")) {
        // Amazon Titan response format
        return responseBody.results[0].outputText;
      } else {
        throw new Error(`Unsupported model response: ${modelId}`);
      }
    } catch (error) {
      console.error("Error calling Bedrock LLM:", error);
      throw error;
    }
  }
}

module.exports = new RAGService();
