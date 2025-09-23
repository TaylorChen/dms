const express = require('express');
const router = express.Router();
const ConnectionManager = require('../services/connectionManager');
const DataSourceManager = require('../services/dataSourceManager');
const MySQLService = require('../services/mysqlService');
const PostgreSQLService = require('../services/postgresqlService');
const MongoDBService = require('../services/mongodbService');
const RedisService = require('../services/redisService');
const multer = require('multer');
const csv = require('csv-parser');
const { Parser } = require('@json2csv/plainjs');

const connectionManager = ConnectionManager.getInstance();
let dataSourceManager = DataSourceManager.getInstance();

// 配置文件上传
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'application/json') {
            cb(null, true);
        } else {
            cb(new Error('只支持CSV和JSON文件'));
        }
    }
});

// 连接数据库
router.post('/connect', async (req, res) => {
    try {
        const { type, config, name, description = '', tags = [] } = req.body;

        // 如果没有提供名称，创建一个默认名称
        const dataSourceName = name || `${type}_${config.host || 'localhost'}_${config.port || 6379}`;

        // 检查是否已经存在相同配置的数据源
        const existingSources = dataSourceManager.getDataSources();
        const existingSource = existingSources.find(source => {
            if (source.type !== type) return false;
            if (source.config.host !== config.host) return false;
            if (source.config.port !== config.port) return false;

            // 对于不同数据库类型，检查不同的数据库标识符
            if (type === 'redis') {
                // Redis可能使用db或database字段
                const sourceDb = source.config.db !== undefined ? source.config.db : source.config.database;
                const configDb = config.db !== undefined ? config.db : config.database;
                return sourceDb === configDb;
            } else if (type === 'mysql' || type === 'postgresql') {
                return source.config.database === config.database;
            } else if (type === 'mongodb') {
                return source.config.db === config.db || source.config.database === config.database;
            }
            return true;
        });

        if (existingSource) {
            // 如果已存在，直接连接
            const connectResult = await dataSourceManager.connectDataSource(existingSource.name);
            return res.json(connectResult);
        }

        // 创建新的数据源
        const createResult = await dataSourceManager.createDataSource({
            name: dataSourceName,
            type,
            config,
            description,
            tags
        });

        if (!createResult.success) {
            return res.status(400).json(createResult);
        }

        // 连接新创建的数据源
        const connectResult = await dataSourceManager.connectDataSource(dataSourceName);
        res.json(connectResult);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 断开连接
router.delete('/disconnect/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const result = await connectionManager.disconnect(connectionId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 测试连接
router.get('/test/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const result = await connectionManager.testConnection(connectionId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 测试新连接配置
router.post('/test-connection', async (req, res) => {
    try {
        const { type, config } = req.body;
        const result = await connectionManager.testNewConnection(type, config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取连接列表
router.get('/connections', async (req, res) => {
    try {
        const connections = connectionManager.getAllConnections();
        res.json({ success: true, data: connections });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取数据库结构
router.get('/structure/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let structure = [];

        switch (connInfo.type) {
            case 'mysql':
            case 'postgresql': {
                const service = connInfo.type === 'mysql'
                    ? new MySQLService(connInfo.connection)
                    : new PostgreSQLService(connInfo.connection);

                const dbResult = await service.getDatabases();
                if (!dbResult.success) {
                    return res.json(dbResult);
                }

                for (const db of dbResult.data) {
                    const tableResult = await service.getTables(db);
                    if (tableResult.success) {
                        structure.push({
                            name: db,
                            tables: tableResult.data
                        });
                    }
                }
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                const collectionsResult = await service.getCollections();
                if (collectionsResult.success) {
                    structure.push({
                        name: connInfo.config.database,
                        tables: collectionsResult.data
                    });
                }
                break;
            }
            case 'redis': {
                // Redis没有表结构，返回数据库信息
                const service = new RedisService(connInfo.connection);
                const infoResult = await service.getInfo();
                if (infoResult.success) {
                    structure.push({
                        name: `Redis Database ${connInfo.config.database || 0}`,
                        tables: []
                    });
                }
                break;
            }
        }

        res.json({ success: true, data: structure });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取指定表的结构
router.get('/structure/:connectionId/:database/:table', async (req, res) => {
    try {
        const { connectionId, database, table } = req.params;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let structure;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                const result = await service.getTableStructure(database, table);
                if (result.success) {
                    structure = result.data;
                } else {
                    return res.json(result);
                }
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                const result = await service.getTableStructure(database, table);
                if (result.success) {
                    structure = result.data;
                } else {
                    return res.json(result);
                }
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                const result = await service.getCollectionInfo(table);
                if (result.success) {
                    structure = result.data;
                } else {
                    return res.json(result);
                }
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json({ success: true, data: structure });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 执行查询
router.post('/query/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { sql, query, params } = req.body;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;
        const actualQuery = sql || query; // 兼容两种参数名

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                const paramArray = params ? Object.values(params) : [];
                result = await service.executeQuery(actualQuery, paramArray);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                const paramArray = params ? Object.values(params) : [];
                result = await service.executeQuery(actualQuery, paramArray);
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                // MongoDB查询需要特殊处理
                try {
                    const query = JSON.parse(actualQuery);
                    result = await service.findDocuments(query.collection || 'test', query.query || {}, query.options);
                } catch (parseError) {
                    result = { success: false, error: 'MongoDB查询必须是有效的JSON格式' };
                }
                break;
            }
            case 'redis': {
                const service = new RedisService(connInfo.connection);
                // Redis命令执行
                if (typeof actualQuery !== 'string') {
                    result = { success: false, error: 'Redis查询必须是字符串格式' };
                    break;
                }

                const commands = actualQuery.split('\n').filter(cmd => {
                    const trimmed = cmd.trim();
                    return typeof trimmed === 'string' && trimmed.length > 0;
                });

                const results = [];
                for (const cmd of commands) {
                    if (typeof cmd !== 'string') continue;

                    const parts = cmd.trim().split(' ');
                    const command = parts[0].toLowerCase();
                    const args = parts.slice(1);
                    const cmdResult = await service.executeCommand(command, args);

                    // 添加命令信息到结果中
                    cmdResult.command = command;
                    cmdResult.originalCommand = cmd.trim();

                    results.push(cmdResult);
                }
                result = { success: true, data: results, meta: { executionTime: 0, rowLength: results.length } };
                break;
            }
            default:
                result = { success: false, error: '不支持的数据库类型' };
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取SQL执行计划
router.post('/explain/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { sql, params } = req.body;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;
        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                const paramArray = params ? Object.values(params) : [];
                result = await service.getExecutionPlan(sql, paramArray);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                const paramArray = params ? Object.values(params) : [];
                result = await service.getExecutionPlan(sql, paramArray);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '该数据库类型暂不支持执行计划分析' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取表数据
router.get('/data/:connectionId/:database/:table', async (req, res) => {
    try {
        const { connectionId, database, table } = req.params;
        const { page = 1, pageSize = 50, where = '', orderBy = '' } = req.query;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.getTableData(database, table, parseInt(page), parseInt(pageSize), where, orderBy);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.getTableData(database, table, parseInt(page), parseInt(pageSize), where, orderBy);
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                const query = where ? JSON.parse(where) : {};
                const options = {
                    skip: (page - 1) * pageSize,
                    limit: parseInt(pageSize),
                    sort: orderBy ? JSON.parse(orderBy) : {}
                };
                result = await service.findDocuments(table, query, options);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 创建表
router.post('/table/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { database, tableName, columns } = req.body;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.createTable(database, tableName, columns);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.createTable(database, tableName, columns);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 删除表
router.delete('/table/:connectionId/:database/:table', async (req, res) => {
    try {
        const { connectionId, database, table } = req.params;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.dropTable(database, table);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.dropTable(database, table);
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                result = await service.dropCollection(table);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 插入数据
router.post('/data/:connectionId/:database/:table', async (req, res) => {
    try {
        const { connectionId, database, table } = req.params;
        const data = req.body;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.insertData(database, table, data);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.insertData(database, table, data);
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                result = await service.insertDocument(table, data);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 更新数据
router.put('/data/:connectionId/:database/:table', async (req, res) => {
    try {
        const { connectionId, database, table } = req.params;
        const { data, where } = req.body;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.updateData(database, table, data, where);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.updateData(database, table, data, where);
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                const query = where ? JSON.parse(where) : {};
                result = await service.updateDocument(table, query, { $set: data });
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 删除数据
router.delete('/data/:connectionId/:database/:table', async (req, res) => {
    try {
        const { connectionId, database, table } = req.params;
        const { where } = req.query;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.deleteData(database, table, where);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.deleteData(database, table, where);
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                const query = where ? JSON.parse(where) : {};
                result = await service.deleteDocument(table, query);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 导入数据
router.post('/import/:connectionId', upload.single('file'), async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { targetTable, format } = req.body;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: '请选择文件' });
        }

        const filePath = req.file.path;
        let data = [];

        if (format === 'csv') {
            data = await parseCSV(filePath);
        } else if (format === 'json') {
            const fs = require('fs');
            const content = fs.readFileSync(filePath, 'utf8');
            data = JSON.parse(content);
        }

        // 清理临时文件
        const fs = require('fs');
        fs.unlinkSync(filePath);

        if (data.length === 0) {
            return res.status(400).json({ success: false, error: '文件中没有数据' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                let successCount = 0;
                for (const row of data) {
                    const insertResult = await service.insertData('', targetTable, row);
                    if (insertResult.success) successCount++;
                }
                result = { success: true, message: `成功导入 ${successCount} 条数据` };
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                let successCount = 0;
                for (const row of data) {
                    const insertResult = await service.insertData('', targetTable, row);
                    if (insertResult.success) successCount++;
                }
                result = { success: true, message: `成功导入 ${successCount} 条数据` };
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                result = await service.insertManyDocuments(targetTable, data);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 导出数据
router.post('/export/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { sourceTable, format, whereClause } = req.body;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const [database, table] = sourceTable.split('.');
                const service = new MySQLService(connInfo.connection);
                result = await service.exportTableData(database, table, format);
                break;
            }
            case 'postgresql': {
                const [database, table] = sourceTable.split('.');
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.exportTableData(database, table, format);
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                result = await service.exportCollectionData(sourceTable, format);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取数据库状态
router.get('/status/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;

        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.getDatabaseStatus();
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.getDatabaseStatus();
                break;
            }
            case 'mongodb': {
                const service = new MongoDBService(connInfo.db);
                result = await service.getDatabaseStatus();
                break;
            }
            case 'redis': {
                const service = new RedisService(connInfo.connection);
                result = await service.getStats();
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== 数据同步和比较API ==========

// 获取连接的数据库列表
router.get('/databases/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;
        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.getDatabases();
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.getDatabases();
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取数据库的表列表
router.get('/tables/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { database } = req.query;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;
        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.getTables(database);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.getTables(database);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取表结构
router.get('/table-structure/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { database, table } = req.query;
        const connInfo = connectionManager.getConnection(connectionId);

        if (!connInfo) {
            return res.status(404).json({ success: false, error: '连接不存在' });
        }

        let result;
        switch (connInfo.type) {
            case 'mysql': {
                const service = new MySQLService(connInfo.connection);
                result = await service.getTableStructure(database, table);
                break;
            }
            case 'postgresql': {
                const service = new PostgreSQLService(connInfo.connection);
                result = await service.getTableStructure(database, table);
                break;
            }
            default:
                return res.status(400).json({ success: false, error: '不支持的数据库类型' });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 预览同步
router.post('/sync/preview', async (req, res) => {
    try {
        const config = req.body;
        const previewData = await previewDataSync(config);
        res.json({ success: true, data: previewData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 执行同步
router.post('/sync/execute', async (req, res) => {
    try {
        const config = req.body;
        const result = await executeDataSync(config);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 数据比较
router.post('/compare/data', async (req, res) => {
    try {
        const config = req.body;
        const compareResult = await compareData(config);
        res.json({ success: true, data: compareResult });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 辅助函数：预览数据同步
async function previewDataSync(config) {
    const sourceConn = connectionManager.getConnection(config.sourceConnection);
    const targetConn = connectionManager.getConnection(config.targetConnection);

    if (!sourceConn || !targetConn) {
        throw new Error('源连接或目标连接不存在');
    }

    // 获取源数据
    const sourceData = await getTableData(sourceConn, config.sourceDatabase, config.sourceTable, config.sourceQuery);

    // 获取目标数据
    let targetData = [];
    try {
        targetData = await getTableData(targetConn, config.targetDatabase, config.targetTable);
    } catch (error) {
        // 目标表可能不存在
    }

    // 分析差异
    const analysis = analyzeDataDifferences(sourceData, targetData, config);

    return {
        config: config,
        insertCount: analysis.insertCount,
        updateCount: analysis.updateCount,
        deleteCount: analysis.deleteCount,
        unchangedCount: analysis.unchangedCount,
        differences: analysis.differences,
        sqlScript: generateSyncSQL(analysis, config),
        log: [
            { timestamp: new Date().toISOString(), level: 'info', message: '同步预览分析完成' },
            { timestamp: new Date().toISOString(), level: 'info', message: `发现 ${analysis.insertCount} 条新增记录` },
            { timestamp: new Date().toISOString(), level: 'info', message: `发现 ${analysis.updateCount} 条更新记录` },
            { timestamp: new Date().toISOString(), level: 'info', message: `发现 ${analysis.deleteCount} 条删除记录` }
        ]
    };
}

// 辅助函数：执行数据同步
async function executeDataSync(config) {
    const sourceConn = connectionManager.getConnection(config.sourceConnection);
    const targetConn = connectionManager.getConnection(config.targetConnection);

    if (!sourceConn || !targetConn) {
        throw new Error('源连接或目标连接不存在');
    }

    const log = [];
    let stats = { inserted: 0, updated: 0, deleted: 0, errors: 0 };

    try {
        // 根据同步模式执行不同的操作
        switch (config.syncMode) {
            case 'insert':
                stats = await executeInsertMode(sourceConn, targetConn, config, log);
                break;
            case 'update':
                stats = await executeUpdateMode(sourceConn, targetConn, config, log);
                break;
            case 'upsert':
                stats = await executeUpsertMode(sourceConn, targetConn, config, log);
                break;
            case 'replace':
                stats = await executeReplaceMode(sourceConn, targetConn, config, log);
                break;
            case 'truncate_replace':
                stats = await executeTruncateReplaceMode(sourceConn, targetConn, config, log);
                break;
        }

        log.push({ timestamp: new Date().toISOString(), level: 'info', message: '同步执行完成' });

        return {
            stats: stats,
            log: log
        };
    } catch (error) {
        log.push({ timestamp: new Date().toISOString(), level: 'error', message: error.message });
        throw error;
    }
}

// 辅助函数：数据比较
async function compareData(config) {
    const sourceConn = connectionManager.getConnection(config.sourceConnection);
    const targetConn = connectionManager.getConnection(config.targetConnection);

    if (!sourceConn || !targetConn) {
        throw new Error('源连接或目标连接不存在');
    }

    // 获取源数据
    const sourceData = await getTableData(sourceConn, config.sourceDatabase, config.sourceTable, config.sourceQuery);

    // 获取目标数据
    let targetData = [];
    try {
        targetData = await getTableData(targetConn, config.targetDatabase, config.targetTable);
    } catch (error) {
        // 目标表可能不存在
    }

    // 比较数据
    const comparison = compareDataSets(sourceData, targetData, config);

    return {
        config: config,
        totalRecords: comparison.totalRecords,
        identical: comparison.identical,
        different: comparison.different,
        sourceOnly: comparison.sourceOnly,
        targetOnly: comparison.targetOnly,
        structureDifferences: comparison.structureDifferences,
        differences: comparison.differences
    };
}

// 辅助函数：获取表数据
async function getTableData(connInfo, database, table, customQuery = null) {
    let query;

    if (customQuery) {
        query = customQuery;
    } else if (table) {
        query = `SELECT * FROM \`${database}\`.\`${table}\``;
    } else {
        throw new Error('必须指定表名或自定义查询');
    }

    let result;
    switch (connInfo.type) {
        case 'mysql': {
            const service = new MySQLService(connInfo.connection);
            result = await service.executeQuery(query);
            break;
        }
        case 'postgresql': {
            const service = new PostgreSQLService(connInfo.connection);
            result = await service.executeQuery(query);
            break;
        }
        default:
            throw new Error('不支持的数据库类型');
    }

    return result.success ? result.data : [];
}

// 辅助函数：分析数据差异
function analyzeDataDifferences(sourceData, targetData, config) {
    const keyColumns = config.keyColumns || ['id'];
    const differences = [];
    let insertCount = 0, updateCount = 0, deleteCount = 0, unchangedCount = 0;

    // 创建数据映射
    const sourceMap = new Map();
    const targetMap = new Map();

    sourceData.forEach(row => {
        const key = keyColumns.map(col => row[col]).join('|');
        sourceMap.set(key, row);
    });

    targetData.forEach(row => {
        const key = keyColumns.map(col => row[col]).join('|');
        targetMap.set(key, row);
    });

    // 分析新增记录
    sourceMap.forEach((sourceRow, key) => {
        if (!targetMap.has(key)) {
            insertCount++;
            differences.push({
                type: 'insert',
                primaryKey: key,
                message: `新增记录: ${JSON.stringify(sourceRow)}`
            });
        }
    });

    // 分析删除记录
    targetMap.forEach((targetRow, key) => {
        if (!sourceMap.has(key)) {
            deleteCount++;
            differences.push({
                type: 'delete',
                primaryKey: key,
                message: `删除记录: ${JSON.stringify(targetRow)}`
            });
        }
    });

    // 分析更新记录
    sourceMap.forEach((sourceRow, key) => {
        const targetRow = targetMap.get(key);
        if (targetRow) {
            const differences = compareRecords(sourceRow, targetRow, config.columnMapping);
            if (differences.length > 0) {
                updateCount++;
                differences.forEach(diff => {
                    differences.push({
                        type: 'update',
                        primaryKey: key,
                        columnName: diff.column,
                        sourceValue: diff.sourceValue,
                        targetValue: diff.targetValue,
                        message: `字段 ${diff.column} 从 "${diff.targetValue}" 更新为 "${diff.sourceValue}"`
                    });
                });
            } else {
                unchangedCount++;
            }
        }
    });

    return {
        insertCount,
        updateCount,
        deleteCount,
        unchangedCount,
        differences
    };
}

// 辅助函数：比较记录
function compareRecords(sourceRow, targetRow, columnMapping) {
    const differences = [];
    const mapping = columnMapping || {};

    Object.keys(sourceRow).forEach(sourceCol => {
        const targetCol = mapping[sourceCol] || sourceCol;
        const sourceValue = sourceRow[sourceCol];
        const targetValue = targetRow[targetCol];

        if (sourceValue !== targetValue) {
            differences.push({
                column: sourceCol,
                sourceValue: sourceValue,
                targetValue: targetValue
            });
        }
    });

    return differences;
}

// 辅助函数：比较数据集
function compareDataSets(sourceData, targetData, config) {
    const keyColumns = config.keyColumns || ['id'];
    const differences = [];
    let identical = 0, different = 0, sourceOnly = 0, targetOnly = 0;

    // 创建数据映射
    const sourceMap = new Map();
    const targetMap = new Map();

    sourceData.forEach(row => {
        const key = keyColumns.map(col => row[col]).join('|');
        sourceMap.set(key, row);
    });

    targetData.forEach(row => {
        const key = keyColumns.map(col => row[col]).join('|');
        targetMap.set(key, row);
    });

    // 分析数据差异
    sourceMap.forEach((sourceRow, key) => {
        if (!targetMap.has(key)) {
            sourceOnly++;
            differences.push({
                type: 'source_only',
                primaryKey: key,
                columnName: '-',
                sourceValue: '-',
                targetValue: '-',
                differenceType: '源表独有'
            });
        } else {
            const targetRow = targetMap.get(key);
            const recordDifferences = compareRecords(sourceRow, targetRow, config.columnMapping);

            if (recordDifferences.length > 0) {
                different++;
                recordDifferences.forEach(diff => {
                    differences.push({
                        type: 'different',
                        primaryKey: key,
                        columnName: diff.column,
                        sourceValue: diff.sourceValue,
                        targetValue: diff.targetValue,
                        differenceType: '数值不同'
                    });
                });
            } else {
                identical++;
            }
        }
    });

    // 分析目标表独有记录
    targetMap.forEach((targetRow, key) => {
        if (!sourceMap.has(key)) {
            targetOnly++;
            differences.push({
                type: 'target_only',
                primaryKey: key,
                columnName: '-',
                sourceValue: '-',
                targetValue: '-',
                differenceType: '目标表独有'
            });
        }
    });

    return {
        totalRecords: sourceData.length + targetData.length,
        identical,
        different,
        sourceOnly,
        targetOnly,
        structureDifferences: 0, // 简化处理
        differences
    };
}

// 辅助函数：生成同步SQL
function generateSyncSQL(analysis, config) {
    let sql = '-- 数据同步SQL脚本\n';
    sql += `-- 生成时间: ${new Date().toLocaleString()}\n\n`;

    analysis.differences.forEach(diff => {
        switch (diff.type) {
            case 'insert':
                // 生成INSERT语句（简化版）
                sql += `-- INSERT语句需要根据具体数据结构生成\n`;
                break;
            case 'update':
                sql += `UPDATE \`${config.targetDatabase}\`.\`${config.targetTable}\` SET \`${diff.columnName}\` = '${diff.sourceValue}' WHERE ${config.keyColumns[0]} = '${diff.primaryKey}';\n`;
                break;
            case 'delete':
                sql += `DELETE FROM \`${config.targetDatabase}\`.\`${config.targetTable}\` WHERE ${config.keyColumns[0]} = '${diff.primaryKey}';\n`;
                break;
        }
    });

    return sql;
}

// 执行模式的实现函数
async function executeInsertMode(sourceConn, targetConn, config, log) {
    // 简化实现
    log.push({ timestamp: new Date().toISOString(), level: 'info', message: '执行插入模式同步' });
    return { inserted: 0, updated: 0, deleted: 0, errors: 0 };
}

async function executeUpdateMode(sourceConn, targetConn, config, log) {
    // 简化实现
    log.push({ timestamp: new Date().toISOString(), level: 'info', message: '执行更新模式同步' });
    return { inserted: 0, updated: 0, deleted: 0, errors: 0 };
}

async function executeUpsertMode(sourceConn, targetConn, config, log) {
    // 简化实现
    log.push({ timestamp: new Date().toISOString(), level: 'info', message: '执行插入或更新模式同步' });
    return { inserted: 0, updated: 0, deleted: 0, errors: 0 };
}

async function executeReplaceMode(sourceConn, targetConn, config, log) {
    // 简化实现
    log.push({ timestamp: new Date().toISOString(), level: 'info', message: '执行替换模式同步' });
    return { inserted: 0, updated: 0, deleted: 0, errors: 0 };
}

async function executeTruncateReplaceMode(sourceConn, targetConn, config, log) {
    // 简化实现
    log.push({ timestamp: new Date().toISOString(), level: 'info', message: '执行清空后替换模式同步' });
    return { inserted: 0, updated: 0, deleted: 0, errors: 0 };
}

// 辅助函数：解析CSV文件
function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        const fs = require('fs');
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
                resolve(results);
            })
            .on('error', reject);
    });
}

// ===== 数据源管理路由 =====

// 初始化数据源管理器
router.post('/datasources/init', async (req, res) => {
    try {
        await dataSourceManager.initialize();
        res.json({ success: true, message: '数据源管理器初始化成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 创建数据源
router.post('/datasources', async (req, res) => {
    try {
        const result = await dataSourceManager.createDataSource(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取数据源列表
router.get('/datasources', async (req, res) => {
    try {
        const filters = {
            type: req.query.type,
            tag: req.query.tag,
            status: req.query.status
        };

        // 直接从文件读取数据源
        const fs = require('fs').promises;
        const data = await fs.readFile('data/sources.json', 'utf8');
        const sources = JSON.parse(data);
        const dataSources = Array.from(sources.map(([key, value]) => value));

        res.json({ success: true, data: dataSources });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取数据源详情
router.get('/datasources/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const dataSource = dataSourceManager.getDataSource(name);

        if (!dataSource) {
            return res.status(404).json({ success: false, error: '数据源不存在' });
        }

        res.json({ success: true, data: dataSource });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取所有数据源信息（用于查询控制台）
router.get('/datasources/all', async (req, res) => {
    try {
        // 创建新的数据源管理器实例用于测试
        const DataSourceManager = require('../services/dataSourceManager');
        const dataSourceManager = new DataSourceManager();
        await dataSourceManager.initialize();
        const dataSources = dataSourceManager.getDataSources();
        res.json({ success: true, data: dataSources });
    } catch (error) {
        console.error('获取数据源失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 更新数据源
router.put('/datasources/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const result = await dataSourceManager.updateDataSource(name, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 删除数据源
router.delete('/datasources/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const result = await dataSourceManager.deleteDataSource(name);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 连接数据源
router.post('/datasources/:name/connect', async (req, res) => {
    try {
        const { name } = req.params;
        const result = await dataSourceManager.connectDataSource(name);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 断开数据源
router.post('/datasources/:name/disconnect', async (req, res) => {
    try {
        const { name } = req.params;
        const result = await dataSourceManager.disconnectDataSource(name);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 测试数据源连接
router.post('/datasources/test', async (req, res) => {
    try {
        const result = await dataSourceManager.testDataSource(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取数据源统计信息
router.get('/datasources/stats', async (req, res) => {
    try {
        const stats = dataSourceManager.getDataSourceStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取所有标签
router.get('/datasources/tags', async (req, res) => {
    try {
        const tags = dataSourceManager.getTags();
        res.json({ success: true, data: tags });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 搜索数据源
router.get('/datasources/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const results = dataSourceManager.searchDataSources(query);
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 批量操作数据源
router.post('/datasources/batch', async (req, res) => {
    try {
        const { operation, names } = req.body;
        const results = [];

        for (const name of names) {
            try {
                let result;
                switch (operation) {
                    case 'connect':
                        result = await dataSourceManager.connectDataSource(name);
                        break;
                    case 'disconnect':
                        result = await dataSourceManager.disconnectDataSource(name);
                        break;
                    case 'delete':
                        result = await dataSourceManager.deleteDataSource(name);
                        break;
                    default:
                        result = { success: false, error: `不支持的操作: ${operation}` };
                }
                results.push({ name, ...result });
            } catch (error) {
                results.push({ name, success: false, error: error.message });
            }
        }

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 导出数据源配置
router.get('/datasources/export', async (req, res) => {
    try {
        const dataSources = dataSourceManager.getDataSources();
        const exportData = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            dataSources: dataSources.map(ds => ({
                name: ds.name,
                type: ds.type,
                config: ds.config,
                description: ds.description,
                tags: ds.tags,
                isDefault: ds.isDefault
            }))
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=datasources_${new Date().toISOString().split('T')[0]}.json`);
        res.json(exportData);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 导入数据源配置
router.post('/datasources/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请选择要导入的文件' });
        }

        const fs = require('fs');
        const importData = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));

        const results = [];
        for (const dsConfig of importData.dataSources) {
            try {
                const result = await dataSourceManager.createDataSource(dsConfig);
                results.push({ name: dsConfig.name, ...result });
            } catch (error) {
                results.push({ name: dsConfig.name, success: false, error: error.message });
            }
        }

        // 清理临时文件
        fs.unlinkSync(req.file.path);

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== MySQL表管理路由 =====

// 获取表列表
router.get('/mysql/tables', async (req, res) => {
    try {
        const { database } = req.query;

        if (!database) {
            return res.status(400).json({ success: false, error: '数据库名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.getTables(database);
        res.json(result);
    } catch (error) {
        console.error('获取表列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取表结构
router.get('/mysql/table-structure', async (req, res) => {
    try {
        const { database, table } = req.query;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.getTableStructure(database, table);
        res.json(result);
    } catch (error) {
        console.error('获取表结构失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取表数据
router.get('/mysql/table-data', async (req, res) => {
    try {
        const { database, table } = req.query;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.getTableDataSimple(database, table);
        res.json(result);
    } catch (error) {
        console.error('获取表数据失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取表DDL
router.get('/mysql/table-ddl', async (req, res) => {
    try {
        const { database, table } = req.query;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.getTableDDL(database, table);
        res.json(result);
    } catch (error) {
        console.error('获取表DDL失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取表索引
router.get('/mysql/table-indexes', async (req, res) => {
    try {
        const { database, table } = req.query;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.getTableIndexes(database, table);
        res.json(result);
    } catch (error) {
        console.error('获取表索引失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 复制表
router.post('/mysql/copy-table', async (req, res) => {
    try {
        const { database, table, newTable, copyStructure = true, copyData = true, copyIndexes = true } = req.body;

        if (!database || !table || !newTable) {
            return res.status(400).json({ success: false, error: '数据库名、表名和新表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.copyTable(database, table, newTable, { copyStructure, copyData, copyIndexes });
        res.json(result);
    } catch (error) {
        console.error('复制表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 清空表
router.post('/mysql/truncate-table', async (req, res) => {
    try {
        const { database, table } = req.body;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.truncateTable(database, table);
        res.json(result);
    } catch (error) {
        console.error('清空表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 删除表
router.post('/mysql/drop-table', async (req, res) => {
    try {
        const { database, table } = req.body;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.dropTable(database, table);
        res.json(result);
    } catch (error) {
        console.error('删除表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 生成测试数据
router.post('/mysql/generate-test-data', async (req, res) => {
    try {
        const { database, table, rowCount = 100, dataType = 'random', truncateBeforeGenerate = false } = req.body;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.generateTestData(database, table, { rowCount, dataType, truncateBeforeGenerate });
        res.json(result);
    } catch (error) {
        console.error('生成测试数据失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 导出表为SQL
router.get('/mysql/export-table-sql', async (req, res) => {
    try {
        const { database, table } = req.query;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.exportTableAsSQL(database, table);
        res.json(result);
    } catch (error) {
        console.error('导出表SQL失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 导出表为CSV
router.get('/mysql/export-table-csv', async (req, res) => {
    try {
        const { database, table } = req.query;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.exportTableAsCSV(database, table);

        if (result.success) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${table}.csv`);
            res.send(result.csv);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('导出表CSV失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 导出表为Excel
router.get('/mysql/export-table-excel', async (req, res) => {
    try {
        const { database, table } = req.query;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.exportTableAsExcel(database, table);

        if (result.success) {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${table}.xlsx`);
            res.send(result.buffer);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('导出表Excel失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 导入数据
router.post('/mysql/import-data', upload.single('file'), async (req, res) => {
    try {
        const { database, table, format = 'csv', headerRow = true, truncateTable = false } = req.body;

        if (!database || !table) {
            return res.status(400).json({ success: false, error: '数据库名和表名不能为空' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: '请选择要导入的文件' });
        }

        // 获取已连接的数据源
        const dataSources = dataSourceManager.getDataSources();
        const connectedDataSource = dataSources.find(ds =>
            ds.status === 'connected' && ds.database === database
        );

        if (!connectedDataSource) {
            return res.status(404).json({ success: false, error: '未找到已连接的数据源' });
        }

        const service = new MySQLService(connectedDataSource.connection);
        const result = await service.importTableData(database, table, req.file.path, {
            format,
            headerRow: headerRow === 'true',
            truncateTable: truncateTable === 'true'
        });

        // 清理临时文件
        const fs = require('fs');
        fs.unlinkSync(req.file.path);

        res.json(result);
    } catch (error) {
        console.error('导入数据失败:', error);

        // 清理临时文件
        if (req.file) {
            const fs = require('fs');
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupError) {
                console.error('清理临时文件失败:', cleanupError);
            }
        }

        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;