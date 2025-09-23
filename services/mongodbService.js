const { ObjectId } = require('mongodb');
const winston = require('winston');

class MongoDBService {
  constructor(db) {
    this.db = db;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/mongodb.log' }),
        new winston.transports.Console()
      ]
    });
  }

  // 获取集合列表
  async getCollections() {
    try {
      const collections = await this.db.listCollections().toArray();
      return { success: true, data: collections.map(col => col.name) };
    } catch (error) {
      this.logger.error('获取集合列表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取集合信息
  async getCollectionInfo(collectionName) {
    try {
      const collection = this.db.collection(collectionName);

      // 获取文档数量
      const count = await collection.countDocuments();

      // 获取索引信息
      const indexes = await collection.indexes();

      // 获取统计信息
      const stats = await collection.stats();

      return {
        success: true,
        data: {
          count,
          indexes,
          stats
        }
      };
    } catch (error) {
      this.logger.error('获取集合信息失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 查询文档
  async findDocuments(collectionName, query = {}, options = {}) {
    try {
      const collection = this.db.collection(collectionName);
      const startTime = Date.now();

      // 处理查询条件中的ObjectId
      if (query._id && typeof query._id === 'string') {
        try {
          query._id = new ObjectId(query._id);
        } catch (e) {
          // 如果不是有效的ObjectId，保持原样
        }
      }

      // 处理查询条件中的其他ObjectId
      this.processObjectIds(query);

      const cursor = collection.find(query, options);

      // 分页处理
      if (options.skip) cursor.skip(options.skip);
      if (options.limit) cursor.limit(options.limit);
      if (options.sort) cursor.sort(options.sort);

      const documents = await cursor.toArray();
      const count = await collection.countDocuments(query);

      const endTime = Date.now();

      return {
        success: true,
        data: {
          documents,
          count,
          executionTime: endTime - startTime
        }
      };
    } catch (error) {
      this.logger.error('查询文档失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 插入文档
  async insertDocument(collectionName, document) {
    try {
      const collection = this.db.collection(collectionName);

      // 添加创建时间
      document.createdAt = new Date();
      document.updatedAt = new Date();

      const result = await collection.insertOne(document);

      return {
        success: true,
        data: {
          insertedId: result.insertedId,
          acknowledged: result.acknowledged
        }
      };
    } catch (error) {
      this.logger.error('插入文档失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 批量插入文档
  async insertManyDocuments(collectionName, documents) {
    try {
      const collection = this.db.collection(collectionName);

      // 添加时间戳
      const docsWithTimestamp = documents.map(doc => ({
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const result = await collection.insertMany(docsWithTimestamp);

      return {
        success: true,
        data: {
          insertedIds: result.insertedIds,
          insertedCount: result.insertedCount,
          acknowledged: result.acknowledged
        }
      };
    } catch (error) {
      this.logger.error('批量插入文档失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 更新文档
  async updateDocument(collectionName, query, update, options = {}) {
    try {
      const collection = this.db.collection(collectionName);

      // 处理查询条件中的ObjectId
      if (query._id && typeof query._id === 'string') {
        try {
          query._id = new ObjectId(query._id);
        } catch (e) {
          // 如果不是有效的ObjectId，保持原样
        }
      }

      this.processObjectIds(query);

      // 添加更新时间
      if (update.$set) {
        update.$set.updatedAt = new Date();
      } else {
        update.$set = { updatedAt: new Date() };
      }

      const result = await collection.updateOne(query, update, options);

      return {
        success: true,
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          acknowledged: result.acknowledged
        }
      };
    } catch (error) {
      this.logger.error('更新文档失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 批量更新文档
  async updateManyDocuments(collectionName, query, update, options = {}) {
    try {
      const collection = this.db.collection(collectionName);

      this.processObjectIds(query);

      if (update.$set) {
        update.$set.updatedAt = new Date();
      } else {
        update.$set = { updatedAt: new Date() };
      }

      const result = await collection.updateMany(query, update, options);

      return {
        success: true,
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          acknowledged: result.acknowledged
        }
      };
    } catch (error) {
      this.logger.error('批量更新文档失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除文档
  async deleteDocument(collectionName, query) {
    try {
      const collection = this.db.collection(collectionName);

      if (query._id && typeof query._id === 'string') {
        try {
          query._id = new ObjectId(query._id);
        } catch (e) {
          // 如果不是有效的ObjectId，保持原样
        }
      }

      this.processObjectIds(query);

      const result = await collection.deleteOne(query);

      return {
        success: true,
        data: {
          deletedCount: result.deletedCount,
          acknowledged: result.acknowledged
        }
      };
    } catch (error) {
      this.logger.error('删除文档失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 批量删除文档
  async deleteManyDocuments(collectionName, query) {
    try {
      const collection = this.db.collection(collectionName);

      this.processObjectIds(query);

      const result = await collection.deleteMany(query);

      return {
        success: true,
        data: {
          deletedCount: result.deletedCount,
          acknowledged: result.acknowledged
        }
      };
    } catch (error) {
      this.logger.error('批量删除文档失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 创建索引
  async createIndex(collectionName, indexSpec, options = {}) {
    try {
      const collection = this.db.collection(collectionName);
      const result = await collection.createIndex(indexSpec, options);

      return {
        success: true,
        data: {
          indexName: result,
          message: '索引创建成功'
        }
      };
    } catch (error) {
      this.logger.error('创建索引失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除索引
  async dropIndex(collectionName, indexName) {
    try {
      const collection = this.db.collection(collectionName);
      await collection.dropIndex(indexName);

      return { success: true, message: '索引删除成功' };
    } catch (error) {
      this.logger.error('删除索引失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除集合
  async dropCollection(collectionName) {
    try {
      await this.db.collection(collectionName).drop();
      return { success: true, message: `集合 ${collectionName} 删除成功` };
    } catch (error) {
      this.logger.error('删除集合失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 聚合查询
  async aggregate(collectionName, pipeline, options = {}) {
    try {
      const collection = this.db.collection(collectionName);
      const startTime = Date.now();

      const cursor = collection.aggregate(pipeline, options);
      const documents = await cursor.toArray();

      const endTime = Date.now();

      return {
        success: true,
        data: {
          documents,
          executionTime: endTime - startTime
        }
      };
    } catch (error) {
      this.logger.error('聚合查询失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 执行MongoDB命令
  async runCommand(command) {
    try {
      const result = await this.db.command(command);
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('执行命令失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取数据库状态
  async getDatabaseStatus() {
    try {
      const [serverStatus, dbStats, collStats] = await Promise.all([
        this.db.admin().serverStatus(),
        this.db.stats(),
        this.getCollections()
      ]);

      return {
        success: true,
        data: {
          serverStatus,
          dbStats,
          collections: collStats.data
        }
      };
    } catch (error) {
      this.logger.error('获取数据库状态失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 导出集合数据
  async exportCollectionData(collectionName, format = 'json') {
    try {
      const collection = this.db.collection(collectionName);
      const cursor = collection.find({});
      const documents = await cursor.toArray();

      switch (format.toLowerCase()) {
        case 'json':
          return { success: true, data: JSON.stringify(documents, null, 2) };
        case 'csv':
          if (documents.length === 0) return { success: true, data: '' };

          // 展平嵌套对象
          const flattenedDocs = documents.map(doc => this.flattenObject(doc));
          const headers = [...new Set(flattenedDocs.flatMap(doc => Object.keys(doc)))];

          const csvContent = [
            headers.join(','),
            ...flattenedDocs.map(doc =>
              headers.map(header => {
                const value = doc[header];
                return typeof value === 'string' && value.includes(',')
                  ? `"${value.replace(/"/g, '""')}"`
                  : value;
              }).join(',')
            )
          ].join('\n');

          return { success: true, data: csvContent };
        default:
          return { success: false, error: '不支持的导出格式' };
      }
    } catch (error) {
      this.logger.error('导出集合数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 辅助方法：递归处理查询条件中的ObjectId
  processObjectIds(obj) {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (Array.isArray(obj[key])) {
          obj[key] = obj[key].map(item => {
            if (typeof item === 'string' && item.length === 24) {
              try {
                return new ObjectId(item);
              } catch (e) {
                return item;
              }
            }
            return item;
          });
        } else {
          this.processObjectIds(obj[key]);
        }
      }
    }
  }

  // 辅助方法：展平嵌套对象
  flattenObject(obj, parentKey = '') {
    const result = {};

    for (const key in obj) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(result, this.flattenObject(obj[key], fullKey));
      } else if (Array.isArray(obj[key])) {
        result[fullKey] = JSON.stringify(obj[key]);
      } else {
        result[fullKey] = obj[key];
      }
    }

    return result;
  }
}

module.exports = MongoDBService;