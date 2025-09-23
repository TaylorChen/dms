const winston = require('winston');

class MySQLService {
  constructor(connection) {
    this.connection = connection;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/mysql.log' }),
        new winston.transports.Console()
      ]
    });
  }

  // 获取数据库列表
  async getDatabases() {
    try {
      const [rows] = await this.connection.execute('SHOW DATABASES');
      return { success: true, data: rows.map(row => row.Database) };
    } catch (error) {
      this.logger.error('获取数据库列表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取表列表
  async getTables(database) {
    try {
      let query;
      if (database) {
        // 使用数据库名.表名的格式而不是USE命令
        query = `SHOW TABLES FROM \`${database}\``;
      } else {
        // 如果没有指定数据库，返回空列表
        return { success: true, data: [] };
      }

      const [rows] = await this.connection.execute(query);

      // 检查是否有结果
      if (!rows || rows.length === 0) {
        return { success: true, data: [] };
      }

      const tableName = Object.keys(rows[0])[0];
      return { success: true, data: rows.map(row => row[tableName]) };
    } catch (error) {
      this.logger.error('获取表列表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取表结构
  async getTableStructure(database, table) {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      // 获取列信息
      const [columns] = await this.connection.execute(`DESCRIBE \`${database}\`.\`${table}\``);

      // 获取索引信息
      const [indexes] = await this.connection.execute(`SHOW INDEX FROM \`${database}\`.\`${table}\``);

      // 获取外键信息
      const [foreignKeys] = await this.connection.execute(`
        SELECT
          CONSTRAINT_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
      `, [database, table]);

      return {
        success: true,
        data: {
          columns,
          indexes,
          foreignKeys
        }
      };
    } catch (error) {
      this.logger.error('获取表结构失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 执行查询
  async executeQuery(sql, params = []) {
    try {
      const startTime = Date.now();

      // 处理多语句SQL（如USE语句后跟其他语句）
      const statements = sql.split(';').filter(s => s.trim());
      let rows = [];

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim();
        if (!statement) continue;

        // 如果是USE语句，使用query方法而不是execute
        if (statement.toLowerCase().startsWith('use ')) {
          await this.connection.query(statement);
          continue;
        }

        const [result] = await this.connection.execute(statement, params);
        if (i === statements.length - 1) {
          rows = result;
        }
      }

      const endTime = Date.now();

      // 获取查询结果的信息
      const [info] = await this.connection.execute('SELECT ROW_COUNT() as affectedRows');

      return {
        success: true,
        data: rows,
        meta: {
          affectedRows: info[0].affectedRows,
          executionTime: endTime - startTime,
          rowLength: Array.isArray(rows) ? rows.length : 0
        }
      };
    } catch (error) {
      this.logger.error('执行查询失败:', error);

      // 特殊处理没有选择数据库的错误
      if (error.code === 'ER_NO_DB_ERROR') {
        return {
          success: false,
          error: '请先选择一个数据库。您可以在左侧的数据库结构浏览器中点击数据库名称来选择。',
          suggestion: '选择数据库后重试查询'
        };
      }

      return {
        success: false,
        error: error.message,
        sql: sql,
        params: params
      };
    }
  }

  // 获取表数据（分页）
  async getTableData(database, table, page = 1, pageSize = 50, where = '', orderBy = '') {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      const offset = (page - 1) * pageSize;
      let sql = `SELECT * FROM \`${database}\`.\`${table}\``;
      let countSql = `SELECT COUNT(*) as total FROM \`${database}\`.\`${table}\``;

      if (where) {
        sql += ` WHERE ${where}`;
        countSql += ` WHERE ${where}`;
      }

      if (orderBy) {
        sql += ` ORDER BY ${orderBy}`;
      }

      sql += ` LIMIT ${pageSize} OFFSET ${offset}`;

      // 执行查询获取数据
      const [rows] = await this.connection.execute(sql);

      // 获取总数
      const [countResult] = await this.connection.execute(countSql);
      const total = countResult[0].total;

      return {
        success: true,
        data: {
          rows,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
          }
        }
      };
    } catch (error) {
      this.logger.error('获取表数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取表数据的简化版本（用于表管理界面）
  async getTableDataSimple(database, table) {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      const startTime = Date.now();
      const sql = `SELECT * FROM \`${database}\`.\`${table}\` LIMIT 1000`;

      // 执行查询获取数据
      const [rows] = await this.connection.execute(sql);

      return {
        success: true,
        data: rows,
        meta: {
          executionTime: Date.now() - startTime,
          rowLength: rows.length
        }
      };
    } catch (error) {
      this.logger.error('获取表数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 创建表
  async createTable(database, tableName, columns) {
    try {
      if (!database || !tableName) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      // 构建创建表的SQL
      const columnDefs = columns.map(col => {
        let def = `\`${col.name}\` ${col.type}`;
        if (col.length) def += `(${col.length})`;
        if (col.nullable === false) def += ' NOT NULL';
        if (col.defaultValue !== undefined) def += ` DEFAULT ${col.defaultValue}`;
        if (col.autoIncrement) def += ' AUTO_INCREMENT';
        if (col.primaryKey) def += ' PRIMARY KEY';
        if (col.unique) def += ' UNIQUE';
        return def;
      }).join(', ');

      const sql = `CREATE TABLE \`${database}\`.\`${tableName}\` (${columnDefs})`;

      await this.connection.execute(sql);

      return { success: true, message: `表 ${tableName} 创建成功` };
    } catch (error) {
      this.logger.error('创建表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除表
  async dropTable(database, tableName) {
    try {
      if (!database || !tableName) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      await this.connection.execute(`DROP TABLE IF EXISTS \`${database}\`.\`${tableName}\``);

      return { success: true, message: `表 ${tableName} 删除成功` };
    } catch (error) {
      this.logger.error('删除表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 插入数据
  async insertData(database, table, data) {
    try {
      if (!database) {
        return { success: false, error: "数据库名不能为空" };
      }
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(() => '?').join(', ');

      const sql = `INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;

      const [result] = await this.connection.execute(sql, values);

      return {
        success: true,
        data: {
          insertId: result.insertId,
          affectedRows: result.affectedRows
        }
      };
    } catch (error) {
      this.logger.error('插入数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 更新数据
  async updateData(database, table, data, where) {
    try {
      if (database) {
      }

      const setClause = Object.keys(data).map(key => `\`${key}\` = ?`).join(', ');
      const values = [...Object.values(data)];

      let sql = `UPDATE \`${table}\` SET ${setClause}`;

      if (where) {
        sql += ` WHERE ${where}`;
      }

      const [result] = await this.connection.execute(sql, values);

      return {
        success: true,
        data: {
          affectedRows: result.affectedRows,
          changedRows: result.changedRows
        }
      };
    } catch (error) {
      this.logger.error('更新数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除数据
  async deleteData(database, table, where) {
    try {
      if (database) {
      }

      let sql = `DELETE FROM \`${table}\``;

      if (where) {
        sql += ` WHERE ${where}`;
      }

      const [result] = await this.connection.execute(sql);

      return {
        success: true,
        data: {
          affectedRows: result.affectedRows
        }
      };
    } catch (error) {
      this.logger.error('删除数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取数据库状态信息
  async getDatabaseStatus() {
    try {
      const [status] = await this.connection.execute('SHOW STATUS');
      const [variables] = await this.connection.execute('SHOW VARIABLES');
      const [processList] = await this.connection.execute('SHOW PROCESSLIST');

      return {
        success: true,
        data: {
          status,
          variables,
          processList
        }
      };
    } catch (error) {
      this.logger.error('获取数据库状态失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取SQL执行计划
  async getExecutionPlan(sql, params = []) {
    try {
      // 检查是否是SELECT查询
      const trimmedSQL = sql.trim().toUpperCase();
      if (!trimmedSQL.startsWith('SELECT')) {
        return { success: false, error: '执行计划只支持SELECT查询' };
      }

      // 添加EXPLAIN前缀
      const explainSQL = 'EXPLAIN ' + sql;

      // 执行EXPLAIN查询
      const [rows] = await this.connection.execute(explainSQL, params);

      // 获取更详细的执行计划信息
      const extendedPlan = await this.getExtendedExecutionPlan(sql, params);

      return {
        success: true,
        data: {
          basic: rows,
          extended: extendedPlan,
          analysis: this.analyzeExecutionPlan(rows),
          recommendations: this.generateRecommendations(rows)
        }
      };
    } catch (error) {
      this.logger.error('获取执行计划失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取扩展执行计划信息
  async getExtendedExecutionPlan(sql, params = []) {
    try {
      const plans = {};

      // 基础执行计划
      const [basic] = await this.connection.execute('EXPLAIN ' + sql, params);
      plans.basic = basic;

      // 格式化执行计划
      try {
        const [formatted] = await this.connection.execute('EXPLAIN FORMAT=JSON ' + sql, params);
        plans.formatted = formatted;
      } catch (e) {
        // 如果不支持JSON格式，跳过
      }

      // 分析执行计划
      try {
        const [analyze] = await this.connection.execute('EXPLAIN ANALYZE ' + sql, params);
        plans.analyze = analyze;
      } catch (e) {
        // 如果不支持ANALYZE，跳过
      }

      return plans;
    } catch (error) {
      this.logger.error('获取扩展执行计划失败:', error);
      return { basic: [] };
    }
  }

  // 分析执行计划
  analyzeExecutionPlan(planRows) {
    const analysis = {
      totalCost: 0,
      tableScans: 0,
      indexUsage: 0,
      fullTableScans: 0,
      temporaryTables: 0,
      fileSorts: 0,
      estimatedRows: 0,
      warnings: []
    };

    planRows.forEach(row => {
      // 估算行数
      analysis.estimatedRows += parseInt(row.rows) || 0;

      // 检查全表扫描
      if (row.type === 'ALL') {
        analysis.fullTableScans++;
        analysis.warnings.push(`表 ${row.table} 使用了全表扫描`);
      }

      // 检查索引使用
      if (row.key) {
        analysis.indexUsage++;
      }

      // 检查临时表
      if (row.Extra && row.Extra.includes('Using temporary')) {
        analysis.temporaryTables++;
        analysis.warnings.push('使用了临时表，可能影响性能');
      }

      // 检查文件排序
      if (row.Extra && row.Extra.includes('Using filesort')) {
        analysis.fileSorts++;
        analysis.warnings.push('使用了文件排序，可能影响性能');
      }

      // 检查表扫描类型
      if (['ALL', 'index', 'range', 'ref', 'eq_ref', 'const', 'system'].includes(row.type)) {
        analysis.tableScans++;
      }
    });

    return analysis;
  }

  // 生成优化建议
  generateRecommendations(planRows) {
    const recommendations = [];

    planRows.forEach(row => {
      // 全表扫描建议
      if (row.type === 'ALL') {
        recommendations.push({
          type: 'index',
          priority: 'high',
          table: row.table,
          message: `建议为表 ${row.table} 添加适当的索引以避免全表扫描`,
          suggestion: `CREATE INDEX idx_${row.table}_recommended ON ${row.table} (frequently_used_columns)`
        });
      }

      // 临时表建议
      if (row.Extra && row.Extra.includes('Using temporary')) {
        recommendations.push({
          type: 'query',
          priority: 'medium',
          table: row.table,
          message: '查询使用了临时表，考虑优化查询或调整服务器配置',
          suggestion: '检查GROUP BY或ORDER BY子句，或者增加tmp_table_size配置'
        });
      }

      // 文件排序建议
      if (row.Extra && row.Extra.includes('Using filesort')) {
        recommendations.push({
          type: 'index',
          priority: 'medium',
          table: row.table,
          message: '查询使用了文件排序，建议添加适当的索引',
          suggestion: `为排序字段创建索引：CREATE INDEX idx_${row.table}_sort ON ${row.table} (sort_columns)`
        });
      }

      // 大数据量建议
      if (row.rows && parseInt(row.rows) > 10000) {
        recommendations.push({
          type: 'performance',
          priority: 'low',
          table: row.table,
          message: `预计扫描 ${row.rows} 行，考虑分页或限制结果集`,
          suggestion: '添加LIMIT子句或使用分页查询'
        });
      }

      // 索引使用建议
      if (!row.key && row.type !== 'const' && row.type !== 'system') {
        recommendations.push({
          type: 'index',
          priority: 'medium',
          table: row.table,
          message: `查询没有使用索引，表 ${row.table} 的WHERE条件字段可能需要索引`,
          suggestion: `为WHERE条件中的字段创建索引以提升查询性能`
        });
      }
    });

    // 去重并按优先级排序
    const uniqueRecommendations = recommendations.filter((rec, index, self) =>
      index === self.findIndex(r => r.message === rec.message)
    );

    return uniqueRecommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // 导出表数据
  async exportTableData(database, table, format = 'json') {
    try {
      if (database) {
      }

      const [rows] = await this.connection.execute(`SELECT * FROM \`${table}\``);

      switch (format.toLowerCase()) {
        case 'json':
          return { success: true, data: JSON.stringify(rows, null, 2) };
        case 'csv':
          if (rows.length === 0) return { success: true, data: '' };
          if (!rows[0]) return { success: true, data: '' };

          const headers = Object.keys(rows[0]);
          const csvContent = [
            headers.join(','),
            ...rows.map(row =>
              headers.map(header => {
                const value = row[header];
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
      this.logger.error('导出表数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // ===== 表管理操作方法 =====

  // 获取表的DDL创建语句
  async getTableDDL(database, table) {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      // 获取创建表的DDL
      const [createTableRows] = await this.connection.execute(`SHOW CREATE TABLE \`${database}\`.\`${table}\``);

      if (createTableRows.length === 0) {
        return { success: false, error: '表不存在' };
      }

      const ddl = createTableRows[0]['Create Table'];

      // 获取外键约束
      const [constraints] = await this.connection.execute(`
        SELECT CONSTRAINT_NAME, CHECK_CLAUSE
        FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ?
      `, [database, table]);

      return {
        success: true,
        data: {
          ddl,
          constraints: constraints,
          database,
          table,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      this.logger.error('获取表DDL失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 复制表
  async copyTable(database, table, newTable, options = {}) {
    try {
      if (!database || !table || !newTable) {
        return { success: false, error: '数据库名、原表名和新表名不能为空' };
      }

      const { copyData = true, copyConstraints = true } = options;

      // 检查新表是否已存在
      const [existingTables] = await this.connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `, [database, newTable]);

      if (existingTables.length > 0) {
        return { success: false, error: `表 ${newTable} 已存在` };
      }

      // 获取原表的DDL
      const ddlResult = await this.getTableDDL(database, table);
      if (!ddlResult.success) {
        return ddlResult;
      }

      // 修改表名
      let newDDL = ddlResult.data.ddl.replace(
        new RegExp(`CREATE TABLE \`${table}\``),
        `CREATE TABLE \`${newTable}\``
      );

      // 如果不需要复制数据，移除AUTO_INCREMENT值
      if (!copyData) {
        newDDL = newDDL.replace(/AUTO_INCREMENT=\d+/g, '');
      }

      // 创建新表
      await this.connection.execute(newDDL);

      let copiedRows = 0;

      // 复制数据
      if (copyData) {
        const insertSQL = `INSERT INTO \`${database}\`.\`${newTable}\` SELECT * FROM \`${database}\`.\`${table}\``;
        const [result] = await this.connection.execute(insertSQL);
        copiedRows = result.affectedRows;
      }

      return {
        success: true,
        data: {
          originalTable: `${database}.${table}`,
          newTable: `${database}.${newTable}`,
          copiedRows,
          copyData,
          copyConstraints,
          message: `表复制成功，${copyData ? `复制了 ${copiedRows} 行数据` : '仅复制表结构'}`
        }
      };
    } catch (error) {
      this.logger.error('复制表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 清空表数据
  async truncateTable(database, table) {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      // 先检查表是否存在
      const [tableExists] = await this.connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `, [database, table]);

      if (tableExists.length === 0) {
        return { success: false, error: `表 ${table} 不存在` };
      }

      // 执行TRUNCATE
      await this.connection.execute(`TRUNCATE TABLE \`${database}\`.\`${table}\``);

      return {
        success: true,
        data: {
          table: `${database}.${table}`,
          action: 'truncate',
          message: '表数据已清空'
        }
      };
    } catch (error) {
      this.logger.error('清空表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除表
  async dropTable(database, table) {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      // 检查表是否存在
      const [tableExists] = await this.connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `, [database, table]);

      if (tableExists.length === 0) {
        return { success: false, error: `表 ${table} 不存在` };
      }

      // 执行DROP TABLE
      await this.connection.execute(`DROP TABLE \`${database}\`.\`${table}\``);

      return {
        success: true,
        data: {
          table: `${database}.${table}`,
          action: 'drop',
          message: '表已删除'
        }
      };
    } catch (error) {
      this.logger.error('删除表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 编辑表属性
  async editTable(database, table, newOptions = {}) {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      const { newName, comment } = newOptions;
      let executedActions = [];

      // 重命名表
      if (newName && newName !== table) {
        await this.connection.execute(`RENAME TABLE \`${database}\`.\`${table}\` TO \`${database}\`.\`${newName}\``);
        executedActions.push(`重命名表: ${table} -> ${newName}`);
        table = newName;
      }

      // 修改表注释
      if (comment !== undefined) {
        await this.connection.execute(`ALTER TABLE \`${database}\`.\`${table}\` COMMENT = ?`, [comment]);
        executedActions.push(`修改表注释: ${comment || '无注释'}`);
      }

      return {
        success: true,
        data: {
          originalTable: `${database}.${newOptions.newName || table}`,
          newTable: `${database}.${table}`,
          executedActions,
          message: `表修改完成，执行了 ${executedActions.length} 个操作`
        }
      };
    } catch (error) {
      this.logger.error('编辑表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 生成测试数据
  async generateTestData(database, table, options = {}) {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      const { rowCount = 100, batchSize = 1000 } = options;

      // 获取表结构
      const structureResult = await this.getTableStructure(database, table);
      if (!structureResult.success) {
        return structureResult;
      }

      const columns = structureResult.data.columns;
      if (columns.length === 0) {
        return { success: false, error: '表没有列定义' };
      }

      let totalInserted = 0;

      // 分批插入数据
      for (let i = 0; i < rowCount; i += batchSize) {
        const currentBatchSize = Math.min(batchSize, rowCount - i);
        const insertSQL = this.generateInsertSQL(database, table, columns, currentBatchSize);

        const [result] = await this.connection.execute(insertSQL);
        totalInserted += result.affectedRows;
      }

      return {
        success: true,
        data: {
          table: `${database}.${table}`,
          totalInserted,
          requestedRows: rowCount,
          message: `成功生成 ${totalInserted} 条测试数据`
        }
      };
    } catch (error) {
      this.logger.error('生成测试数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 生成INSERT SQL语句
  generateInsertSQL(database, table, columns, rowCount) {
    const columnNames = columns.map(col => `\`${col.Field}\``).join(', ');
    const placeholders = columns.map(() => '?').join(', ');

    let sql = `INSERT INTO \`${database}\`.\`${table}\` (${columnNames}) VALUES `;
    const values = [];

    for (let i = 0; i < rowCount; i++) {
      if (i > 0) sql += ', ';
      sql += `(${placeholders})`;

      // 为每列生成测试数据
      columns.forEach(col => {
        values.push(this.generateTestValue(col));
      });
    }

    return { sql, values };
  }

  // 根据列类型生成测试数据
  generateTestValue(column) {
    const { Field, Type, Null, Default } = column;
    const baseType = Type.toLowerCase().split('(')[0].split(' ')[0];

    // 如果允许NULL且随机选择NULL
    if (Null === 'YES' && Math.random() < 0.1) {
      return null;
    }

    switch (baseType) {
      case 'int':
      case 'integer':
      case 'bigint':
      case 'smallint':
      case 'tinyint':
      case 'mediumint':
        return Math.floor(Math.random() * 1000);

      case 'decimal':
      case 'numeric':
      case 'float':
      case 'double':
        return Math.random() * 1000;

      case 'varchar':
      case 'char':
      case 'text':
      case 'tinytext':
      case 'mediumtext':
      case 'longtext':
        const length = Type.match(/\d+/);
        const maxLength = length ? parseInt(length[0]) : 255;
        const text = `测试数据_${Math.random().toString(36).substring(2, 8)}`;
        return text.substring(0, maxLength);

      case 'date':
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 365));
        return date.toISOString().split('T')[0];

      case 'datetime':
      case 'timestamp':
        const datetime = new Date();
        datetime.setDate(datetime.getDate() - Math.floor(Math.random() * 365));
        return datetime.toISOString().replace('T', ' ').substring(0, 19);

      case 'time':
        const hours = Math.floor(Math.random() * 24);
        const minutes = Math.floor(Math.random() * 60);
        const seconds = Math.floor(Math.random() * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

      case 'boolean':
      case 'bool':
        return Math.random() > 0.5 ? 1 : 0;

      case 'enum':
        const enumValues = Type.match(/'([^']+)'/g) || [];
        if (enumValues.length > 0) {
          const randomEnum = enumValues[Math.floor(Math.random() * enumValues.length)];
          return randomEnum.replace(/'/g, '');
        }
        return null;

      default:
        return null;
    }
  }

  // 导出表结构和数据为SQL
  async exportTableAsSQL(database, table, options = {}) {
    try {
      if (!database || !table) {
        return { success: false, error: '数据库名和表名不能为空' };
      }

      const { includeData = true, includeDropTable = false } = options;

      let sql = '';

      // 添加DROP TABLE语句
      if (includeDropTable) {
        sql += `DROP TABLE IF EXISTS \`${table}\`;\n\n`;
      }

      // 获取表结构DDL
      const ddlResult = await this.getTableDDL(database, table);
      if (!ddlResult.success) {
        return ddlResult;
      }

      sql += ddlResult.data.ddl + ';\n\n';

      // 添加数据
      if (includeData) {
        // 获取表数据
        const dataResult = await this.getTableData(database, table, 1, 10000); // 限制最大导出行数
        if (dataResult.success && dataResult.data.rows.length > 0) {
          sql += `-- 导入表数据\n`;

          dataResult.data.rows.forEach(row => {
            const columns = Object.keys(row);
            const values = columns.map(col => {
              const value = row[col];
              if (value === null || value === undefined) {
                return 'NULL';
              } else if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
              } else if (typeof value === 'boolean') {
                return value ? '1' : '0';
              } else if (value instanceof Date) {
                return `'${value.toISOString().replace('T', ' ').substring(0, 19)}'`;
              } else {
                return value;
              }
            });

            sql += `INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')});\n`;
          });
        }
      }

      return {
        success: true,
        data: {
          sql,
          database,
          table,
          includeData,
          exportTime: new Date().toISOString()
        }
      };
    } catch (error) {
      this.logger.error('导出表为SQL失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = MySQLService;