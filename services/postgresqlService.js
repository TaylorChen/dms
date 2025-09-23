const winston = require('winston');

class PostgreSQLService {
  constructor(connection) {
    this.connection = connection;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/postgresql.log' }),
        new winston.transports.Console()
      ]
    });
  }

  // 获取数据库列表
  async getDatabases() {
    try {
      const result = await this.connection.query(`
        SELECT datname as database
        FROM pg_database
        WHERE datistemplate = false
        ORDER BY datname
      `);
      return { success: true, data: result.rows.map(row => row.database) };
    } catch (error) {
      this.logger.error('获取数据库列表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取表列表
  async getTables(database) {
    try {
      let sql = `
        SELECT tablename as table_name
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `;

      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      const result = await this.connection.query(sql);
      return { success: true, data: result.rows.map(row => row.table_name) };
    } catch (error) {
      this.logger.error('获取表列表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取表结构
  async getTableStructure(database, table) {
    try {
      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      // 获取列信息
      const columnsResult = await this.connection.query(`
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      // 获取主键信息
      const primaryKeyResult = await this.connection.query(`
        SELECT
          kcu.column_name,
          tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
      `, [table]);

      // 获取索引信息
      const indexesResult = await this.connection.query(`
        SELECT
          indexname as index_name,
          indexdef as index_definition
        FROM pg_indexes
        WHERE tablename = $1
        ORDER BY indexname
      `, [table]);

      // 获取外键信息
      const foreignKeysResult = await this.connection.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
      `, [table]);

      return {
        success: true,
        data: {
          columns: columnsResult.rows,
          primaryKeys: primaryKeyResult.rows,
          indexes: indexesResult.rows,
          foreignKeys: foreignKeysResult.rows
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
      const result = await this.connection.query(sql, params);
      const endTime = Date.now();

      return {
        success: true,
        data: result.rows,
        meta: {
          affectedRows: result.rowCount || 0,
          executionTime: endTime - startTime,
          rowLength: result.rows.length
        }
      };
    } catch (error) {
      this.logger.error('执行查询失败:', error);
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
      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      const offset = (page - 1) * pageSize;
      let sql = `SELECT * FROM "${table}"`;
      let countSql = `SELECT COUNT(*) as total FROM "${table}"`;

      if (where) {
        sql += ` WHERE ${where}`;
        countSql += ` WHERE ${where}`;
      }

      if (orderBy) {
        sql += ` ORDER BY ${orderBy}`;
      }

      sql += ` LIMIT ${pageSize} OFFSET ${offset}`;

      // 执行查询获取数据
      const result = await this.connection.query(sql);
      const countResult = await this.connection.query(countSql);
      const total = parseInt(countResult.rows[0].total);

      return {
        success: true,
        data: {
          rows: result.rows,
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

  // 创建表
  async createTable(database, tableName, columns) {
    try {
      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      const columnDefs = columns.map(col => {
        let def = `"${col.name}" ${col.type}`;
        if (col.length) def += `(${col.length})`;
        if (col.nullable === false) def += ' NOT NULL';
        if (col.defaultValue !== undefined) def += ` DEFAULT ${col.defaultValue}`;
        if (col.primaryKey) def += ' PRIMARY KEY';
        if (col.unique) def += ' UNIQUE';
        return def;
      }).join(', ');

      const sql = `CREATE TABLE "${tableName}" (${columnDefs})`;

      await this.connection.query(sql);

      return { success: true, message: `表 ${tableName} 创建成功` };
    } catch (error) {
      this.logger.error('创建表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除表
  async dropTable(database, tableName) {
    try {
      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      await this.connection.query(`DROP TABLE IF EXISTS "${tableName}"`);

      return { success: true, message: `表 ${tableName} 删除成功` };
    } catch (error) {
      this.logger.error('删除表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 插入数据
  async insertData(database, table, data) {
    try {
      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');

      const sql = `INSERT INTO "${table}" ("${columns.join('", "')}") VALUES (${placeholders}) RETURNING id`;

      const result = await this.connection.query(sql, values);

      return {
        success: true,
        data: {
          insertId: result.rows[0]?.id || null,
          affectedRows: result.rowCount
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
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      const setClause = Object.keys(data).map((key, index) => `"${key}" = $${index + 1}`).join(', ');
      const values = [...Object.values(data)];

      let sql = `UPDATE "${table}" SET ${setClause}`;

      if (where) {
        sql += ` WHERE ${where}`;
      }

      const result = await this.connection.query(sql, values);

      return {
        success: true,
        data: {
          affectedRows: result.rowCount
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
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      let sql = `DELETE FROM "${table}"`;

      if (where) {
        sql += ` WHERE ${where}`;
      }

      const result = await this.connection.query(sql);

      return {
        success: true,
        data: {
          affectedRows: result.rowCount
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
      const [version, status, settings, activity] = await Promise.all([
        this.connection.query('SELECT version()'),
        this.connection.query(`
          SELECT
            datname as database,
            numbackends as connections,
            xact_commit as transactions,
            blks_read as blocks_read,
            blks_hit as blocks_hit
          FROM pg_stat_database
        `),
        this.connection.query('SELECT name, setting FROM pg_settings ORDER BY name'),
        this.connection.query(`
          SELECT
            pid,
            usename as username,
            application_name,
            client_addr,
            state,
            query
          FROM pg_stat_activity
          WHERE state != 'idle'
        `)
      ]);

      return {
        success: true,
        data: {
          version: version.rows[0].version,
          databases: status.rows,
          settings: settings.rows,
          activity: activity.rows
        }
      };
    } catch (error) {
      this.logger.error('获取数据库状态失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 导出表数据
  async exportTableData(database, table, format = 'json') {
    try {
      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      const result = await this.connection.query(`SELECT * FROM "${table}"`);

      switch (format.toLowerCase()) {
        case 'json':
          return { success: true, data: JSON.stringify(result.rows, null, 2) };
        case 'csv':
          if (result.rows.length === 0) return { success: true, data: '' };
          if (!result.rows[0]) return { success: true, data: '' };

          const headers = Object.keys(result.rows[0]);
          const csvContent = [
            headers.join(','),
            ...result.rows.map(row =>
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

  // 获取序列信息
  async getSequences(database) {
    try {
      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      const result = await this.connection.query(`
        SELECT
          sequence_name,
          start_value,
          increment_by,
          max_value,
          min_value,
          cache_size
        FROM information_schema.sequences
      `);

      return { success: true, data: result.rows };
    } catch (error) {
      this.logger.error('获取序列信息失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取视图列表
  async getViews(database) {
    try {
      let sql = `
        SELECT viewname as view_name
        FROM pg_views
        WHERE schemaname = 'public'
        ORDER BY viewname
      `;

      if (database) {
        await this.connection.query(`SET search_path TO ${database}, public`);
      }

      const result = await this.connection.query(sql);
      return { success: true, data: result.rows.map(row => row.view_name) };
    } catch (error) {
      this.logger.error('获取视图列表失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = PostgreSQLService;