const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const ConnectionManager = require('./connectionManager');

class DataSourceManager {
  constructor() {
    if (DataSourceManager.instance) {
      return DataSourceManager.instance;
    }

    this.dataSources = new Map();
    this.connectionManager = ConnectionManager.getInstance();
    this.dataSourcesFile = path.join(__dirname, '../data/sources.json');

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/datasource.log' }),
        new winston.transports.Console()
      ]
    });

    DataSourceManager.instance = this;
  }

  static getInstance() {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  // 初始化数据源
  async initialize() {
    try {
      await this.ensureDataDirectory();
      await this.loadDataSources();
      this.logger.info('数据源管理器初始化完成');
    } catch (error) {
      this.logger.error('数据源管理器初始化失败:', error);
    }
  }

  // 确保数据目录存在
  async ensureDataDirectory() {
    try {
      await fs.mkdir(path.dirname(this.dataSourcesFile), { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  // 加载数据源
  async loadDataSources() {
    try {
      const data = await fs.readFile(this.dataSourcesFile, 'utf8');
      const sources = JSON.parse(data);
      this.dataSources = new Map(sources);
      this.logger.info(`加载了 ${this.dataSources.size} 个数据源`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.info('数据源文件不存在，创建新的');
        await this.saveDataSources();
      } else {
        this.logger.error('加载数据源失败:', error);
      }
    }
  }

  // 保存数据源
  async saveDataSources() {
    try {
      const data = JSON.stringify(Array.from(this.dataSources.entries()), null, 2);
      await fs.writeFile(this.dataSourcesFile, data, 'utf8');
      this.logger.info('数据源保存成功');
    } catch (error) {
      this.logger.error('保存数据源失败:', error);
    }
  }

  // 创建数据源
  async createDataSource(dataSource) {
    const {
      name,
      type,
      config,
      description = '',
      tags = [],
      isDefault = false
    } = dataSource;

    // 验证数据源配置
    const validation = this.validateDataSource(dataSource);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // 检查名称是否已存在
    if (this.dataSources.has(name)) {
      return { success: false, error: `数据源名称 '${name}' 已存在` };
    }

    const id = this.generateDataSourceId(type, name);

    const newDataSource = {
      id,
      name,
      type,
      config,
      description,
      tags,
      isDefault,
      status: 'disconnected',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastConnected: null,
      connectionStats: {
        totalConnections: 0,
        failedConnections: 0,
        avgResponseTime: 0
      }
    };

    this.dataSources.set(name, newDataSource);
    await this.saveDataSources();

    this.logger.info(`创建数据源: ${name} (${type})`);
    return { success: true, dataSource: newDataSource };
  }

  // 更新数据源
  async updateDataSource(name, updates) {
    if (!this.dataSources.has(name)) {
      return { success: false, error: `数据源 '${name}' 不存在` };
    }

    const dataSource = this.dataSources.get(name);

    // 如果更新配置，需要验证
    if (updates.config) {
      const validation = this.validateDataSource({ ...dataSource, ...updates });
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    const updatedDataSource = {
      ...dataSource,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.dataSources.set(name, updatedDataSource);
    await this.saveDataSources();

    this.logger.info(`更新数据源: ${name}`);
    return { success: true, dataSource: updatedDataSource };
  }

  // 删除数据源
  async deleteDataSource(name) {
    if (!this.dataSources.has(name)) {
      return { success: false, error: `数据源 '${name}' 不存在` };
    }

    // 先断开连接
    const dataSource = this.dataSources.get(name);
    if (dataSource.connectionId) {
      await this.connectionManager.disconnect(dataSource.connectionId);
    }

    this.dataSources.delete(name);
    await this.saveDataSources();

    this.logger.info(`删除数据源: ${name}`);
    return { success: true };
  }

  // 获取数据源列表
  getDataSources(filters = {}) {
    let sources = Array.from(this.dataSources.values());

    // 应用过滤器
    if (filters.type) {
      sources = sources.filter(s => s.type === filters.type);
    }
    if (filters.tag) {
      sources = sources.filter(s => s.tags.includes(filters.tag));
    }
    if (filters.status) {
      sources = sources.filter(s => s.status === filters.status);
    }

    return sources;
  }

  // 获取数据源详情
  getDataSource(name) {
    return this.dataSources.get(name);
  }

  // 连接数据源
  async connectDataSource(name) {
    const dataSource = this.dataSources.get(name);
    if (!dataSource) {
      return { success: false, error: `数据源 '${name}' 不存在` };
    }

    try {
      const startTime = Date.now();

      // 连接到数据库
      const connectionResult = await this.connectionManager.connect(dataSource.type, dataSource.config);

      if (!connectionResult.success) {
        // 更新统计信息
        dataSource.connectionStats.failedConnections++;
        dataSource.updatedAt = new Date().toISOString();
        await this.saveDataSources();

        return { success: false, error: connectionResult.error };
      }

      const responseTime = Date.now() - startTime;

      // 更新数据源状态
      dataSource.status = 'connected';
      dataSource.connectionId = connectionResult.connectionId;
      dataSource.lastConnected = new Date().toISOString();
      dataSource.updatedAt = new Date().toISOString();

      // 更新连接统计
      dataSource.connectionStats.totalConnections++;
      dataSource.connectionStats.avgResponseTime =
        (dataSource.connectionStats.avgResponseTime * (dataSource.connectionStats.totalConnections - 1) + responseTime) /
        dataSource.connectionStats.totalConnections;

      await this.saveDataSources();

      this.logger.info(`数据源连接成功: ${name} (${responseTime}ms)`);
      return {
        success: true,
        connectionId: connectionResult.connectionId,
        responseTime,
        message: `连接成功，响应时间: ${responseTime}ms`
      };
    } catch (error) {
      dataSource.connectionStats.failedConnections++;
      dataSource.updatedAt = new Date().toISOString();
      await this.saveDataSources();

      this.logger.error(`数据源连接失败: ${name}`, error);
      return { success: false, error: error.message };
    }
  }

  // 断开数据源
  async disconnectDataSource(name) {
    const dataSource = this.dataSources.get(name);
    if (!dataSource) {
      return { success: false, error: `数据源 '${name}' 不存在` };
    }

    if (dataSource.connectionId) {
      const result = await this.connectionManager.disconnect(dataSource.connectionId);
      if (result.success) {
        dataSource.status = 'disconnected';
        dataSource.connectionId = null;
        dataSource.updatedAt = new Date().toISOString();
        await this.saveDataSources();

        this.logger.info(`数据源断开: ${name}`);
        return { success: true };
      }
      return result;
    }

    return { success: true };
  }

  // 测试数据源连接
  async testDataSource(dataSource) {
    const validation = this.validateDataSource(dataSource);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const startTime = Date.now();

      // 创建临时连接进行测试
      const connectionResult = await this.connectionManager.connect(dataSource.type, dataSource.config);

      if (connectionResult.success) {
        const responseTime = Date.now() - startTime;

        // 测试完成后断开连接
        await this.connectionManager.disconnect(connectionResult.connectionId);

        return {
          success: true,
          responseTime,
          message: `连接测试成功，响应时间: ${responseTime}ms`
        };
      } else {
        return { success: false, error: connectionResult.error };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 验证数据源配置
  validateDataSource(dataSource) {
    const { type, config, name } = dataSource;

    if (!name || name.trim() === '') {
      return { valid: false, error: '数据源名称不能为空' };
    }

    if (!type) {
      return { valid: false, error: '数据库类型不能为空' };
    }

    switch (type) {
      case 'mysql':
        if (!config.host) return { valid: false, error: 'MySQL主机地址不能为空' };
        if (!config.user) return { valid: false, error: 'MySQL用户名不能为空' };
        if (!config.password) return { valid: false, error: 'MySQL密码不能为空' };
        break;
      case 'postgresql':
        if (!config.host) return { valid: false, error: 'PostgreSQL主机地址不能为空' };
        if (!config.user) return { valid: false, error: 'PostgreSQL用户名不能为空' };
        if (!config.password) return { valid: false, error: 'PostgreSQL密码不能为空' };
        break;
      case 'mongodb':
        if (!config.url && !config.host) return { valid: false, error: 'MongoDB连接URL或主机地址不能为空' };
        break;
      case 'redis':
        if (!config.host) return { valid: false, error: 'Redis主机地址不能为空' };
        break;
      default:
        return { valid: false, error: `不支持的数据库类型: ${type}` };
    }

    return { valid: true };
  }

  // 生成数据源ID
  generateDataSourceId(type, name) {
    return `${type}_${name}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // 获取数据源统计信息
  getDataSourceStats() {
    const sources = Array.from(this.dataSources.values());

    return {
      total: sources.length,
      connected: sources.filter(s => s.status === 'connected').length,
      disconnected: sources.filter(s => s.status === 'disconnected').length,
      byType: {
        mysql: sources.filter(s => s.type === 'mysql').length,
        postgresql: sources.filter(s => s.type === 'postgresql').length,
        mongodb: sources.filter(s => s.type === 'mongodb').length,
        redis: sources.filter(s => s.type === 'redis').length
      },
      totalConnections: sources.reduce((sum, s) => sum + s.connectionStats.totalConnections, 0),
      failedConnections: sources.reduce((sum, s) => sum + s.connectionStats.failedConnections, 0),
      avgResponseTime: sources.reduce((sum, s) => sum + s.connectionStats.avgResponseTime, 0) / sources.length || 0
    };
  }

  // 获取所有标签
  getTags() {
    const sources = Array.from(this.dataSources.values());
    const tagSet = new Set();

    sources.forEach(source => {
      source.tags.forEach(tag => tagSet.add(tag));
    });

    return Array.from(tagSet).sort();
  }

  // 搜索数据源
  searchDataSources(query) {
    const sources = Array.from(this.dataSources.values());
    const lowerQuery = query.toLowerCase();

    return sources.filter(source =>
      source.name.toLowerCase().includes(lowerQuery) ||
      source.description.toLowerCase().includes(lowerQuery) ||
      source.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      source.type.toLowerCase().includes(lowerQuery)
    );
  }
}

module.exports = DataSourceManager;