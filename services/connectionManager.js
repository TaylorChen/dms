const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { MongoClient } = require('mongodb');
const { createClient } = require('redis');
const winston = require('winston');
const dbConfig = require('../config/database');

class ConnectionManager {
  constructor() {
    if (ConnectionManager.instance) {
      return ConnectionManager.instance;
    }

    this.connections = new Map();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/connection.log' }),
        new winston.transports.Console()
      ]
    });

    ConnectionManager.instance = this;
  }

  static getInstance() {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  // 生成唯一连接ID
  generateConnectionId(dbType, host, database) {
    return `${dbType}_${host}_${database}_${Date.now()}`;
  }

  // MySQL 连接
  async connectMySQL(config) {
    const connectionId = this.generateConnectionId('mysql', config.host, config.database || 'server');

    try {
      const connectionConfig = {
        host: config.host || dbConfig.mysql.host,
        port: config.port || dbConfig.mysql.port,
        user: config.user || dbConfig.mysql.user,
        password: config.password || dbConfig.mysql.password,
        timezone: dbConfig.mysql.timezone
      };

      // 只有在指定了数据库时才添加数据库配置
      if (config.database) {
        connectionConfig.database = config.database;
      }

      const connection = await mysql.createConnection(connectionConfig);

      this.connections.set(connectionId, {
        type: 'mysql',
        connection,
        config,
        createdAt: new Date()
      });

      this.logger.info(`MySQL连接成功: ${connectionId}`);
      return { success: true, connectionId, message: 'MySQL连接成功' };
    } catch (error) {
      this.logger.error(`MySQL连接失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // PostgreSQL 连接
  async connectPostgreSQL(config) {
    const connectionId = this.generateConnectionId('postgresql', config.host, config.database || 'server');

    try {
      const clientConfig = {
        host: config.host || dbConfig.postgresql.host,
        port: config.port || dbConfig.postgresql.port,
        user: config.user || dbConfig.postgresql.user,
        password: config.password || dbConfig.postgresql.password
      };

      // 只有在指定了数据库时才添加数据库配置
      if (config.database) {
        clientConfig.database = config.database;
      }

      const client = new Client(clientConfig);

      await client.connect();

      this.connections.set(connectionId, {
        type: 'postgresql',
        connection: client,
        config,
        createdAt: new Date()
      });

      this.logger.info(`PostgreSQL连接成功: ${connectionId}`);
      return { success: true, connectionId, message: 'PostgreSQL连接成功' };
    } catch (error) {
      this.logger.error(`PostgreSQL连接失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // MongoDB 连接
  async connectMongoDB(config) {
    const connectionId = this.generateConnectionId('mongodb', config.host, config.database);

    try {
      const url = config.url || dbConfig.mongodb.url;
      const dbName = config.database || dbConfig.mongodb.database;

      const client = new MongoClient(url, dbConfig.mongodb.options);
      await client.connect();

      const db = client.db(dbName);

      this.connections.set(connectionId, {
        type: 'mongodb',
        connection: client,
        db,
        config,
        createdAt: new Date()
      });

      this.logger.info(`MongoDB连接成功: ${connectionId}`);
      return { success: true, connectionId, message: 'MongoDB连接成功' };
    } catch (error) {
      this.logger.error(`MongoDB连接失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Redis 连接
  async connectRedis(config) {
    // 统一使用db字段，支持database字段的兼容性
    const db = config.db !== undefined ? config.db : config.database;
    const connectionId = this.generateConnectionId('redis', config.host, db);

    try {
      const client = createClient({
        host: config.host || dbConfig.redis.host,
        port: config.port || dbConfig.redis.port,
        password: config.password || dbConfig.redis.password,
        database: db || dbConfig.redis.database
      });

      await client.connect();

      this.connections.set(connectionId, {
        type: 'redis',
        connection: client,
        config,
        createdAt: new Date()
      });

      this.logger.info(`Redis连接成功: ${connectionId}`);
      return { success: true, connectionId, message: 'Redis连接成功' };
    } catch (error) {
      this.logger.error(`Redis连接失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 通用连接方法
  async connect(dbType, config) {
    switch (dbType.toLowerCase()) {
      case 'mysql':
        return this.connectMySQL(config);
      case 'postgresql':
      case 'postgres':
        return this.connectPostgreSQL(config);
      case 'mongodb':
        return this.connectMongoDB(config);
      case 'redis':
        return this.connectRedis(config);
      default:
        return { success: false, error: `不支持的数据库类型: ${dbType}` };
    }
  }

  // 获取连接
  getConnection(connectionId) {
    return this.connections.get(connectionId);
  }

  // 断开连接
  async disconnect(connectionId) {
    const connInfo = this.connections.get(connectionId);
    if (!connInfo) {
      return { success: false, error: '连接不存在' };
    }

    try {
      switch (connInfo.type) {
        case 'mysql':
          await connInfo.connection.end();
          break;
        case 'postgresql':
          await connInfo.connection.end();
          break;
        case 'mongodb':
          await connInfo.connection.close();
          break;
        case 'redis':
          await connInfo.connection.quit();
          break;
      }

      this.connections.delete(connectionId);
      this.logger.info(`连接已断开: ${connectionId}`);
      return { success: true, message: '连接已断开' };
    } catch (error) {
      this.logger.error(`断开连接失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 获取所有连接
  getAllConnections() {
    const connections = [];
    for (const [id, info] of this.connections) {
      connections.push({
        id,
        type: info.type,
        config: info.config,
        createdAt: info.createdAt
      });
    }
    return connections;
  }

  // 测试连接
  async testConnection(connectionId) {
    const connInfo = this.connections.get(connectionId);
    if (!connInfo) {
      return { success: false, error: '连接不存在' };
    }

    try {
      switch (connInfo.type) {
        case 'mysql':
          await connInfo.connection.ping();
          break;
        case 'postgresql':
          await connInfo.connection.query('SELECT 1');
          break;
        case 'mongodb':
          await connInfo.db.command({ ping: 1 });
          break;
        case 'redis':
          await connInfo.connection.ping();
          break;
      }
      return { success: true, message: '连接测试成功' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 测试新连接配置
  async testNewConnection(type, config) {
    let testConnection;

    try {
      switch (type.toLowerCase()) {
        case 'mysql':
          const mysqlConfig = {
            host: config.host || dbConfig.mysql.host,
            port: config.port || dbConfig.mysql.port,
            user: config.user || dbConfig.mysql.user,
            password: config.password || dbConfig.mysql.password,
            timezone: dbConfig.mysql.timezone
          };
          if (config.database) {
            mysqlConfig.database = config.database;
          }
          testConnection = await mysql.createConnection(mysqlConfig);
          await testConnection.ping();
          await testConnection.end();
          break;

        case 'postgresql':
        case 'postgres':
          const pgConfig = {
            host: config.host || dbConfig.postgresql.host,
            port: config.port || dbConfig.postgresql.port,
            user: config.user || dbConfig.postgresql.user,
            password: config.password || dbConfig.postgresql.password
          };
          if (config.database) {
            pgConfig.database = config.database;
          }
          testConnection = new Client(pgConfig);
          await testConnection.connect();
          await testConnection.query('SELECT 1');
          await testConnection.end();
          break;

        case 'mongodb':
          const url = config.url || dbConfig.mongodb.url;
          const dbName = config.database || dbConfig.mongodb.database;
          testConnection = new MongoClient(url, dbConfig.mongodb.options);
          await testConnection.connect();
          await testConnection.db(dbName).command({ ping: 1 });
          await testConnection.close();
          break;

        case 'redis':
          const testDb = config.db !== undefined ? config.db : config.database;
          testConnection = createClient({
            host: config.host || dbConfig.redis.host,
            port: config.port || dbConfig.redis.port,
            password: config.password || dbConfig.redis.password,
            database: testDb || dbConfig.redis.database
          });
          await testConnection.connect();
          await testConnection.ping();
          await testConnection.quit();
          break;

        default:
          return { success: false, error: `不支持的数据库类型: ${type}` };
      }

      return { success: true, message: '连接测试成功' };
    } catch (error) {
      if (testConnection) {
        try {
          switch (type.toLowerCase()) {
            case 'mysql':
            case 'postgresql':
              await testConnection.end();
              break;
            case 'mongodb':
              await testConnection.close();
              break;
            case 'redis':
              await testConnection.quit();
              break;
          }
        } catch (cleanupError) {
          // 忽略清理错误
        }
      }
      return { success: false, error: error.message };
    }
  }
}

module.exports = ConnectionManager;