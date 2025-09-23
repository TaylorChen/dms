const winston = require('winston');

class RedisService {
  constructor(connection) {
    this.connection = connection;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/redis.log' }),
        new winston.transports.Console()
      ]
    });
  }

  // 获取Redis信息
  async getInfo() {
    try {
      const info = await this.connection.info();
      return { success: true, data: info };
    } catch (error) {
      this.logger.error('获取Redis信息失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取数据库键列表
  async getKeys(pattern = '*', cursor = 0, count = 100) {
    try {
      const result = await this.connection.scan(cursor, {
        MATCH: pattern,
        COUNT: count
      });

      return {
        success: true,
        data: {
          cursor: result.cursor,
          keys: result.keys,
          count: result.keys.length
        }
      };
    } catch (error) {
      this.logger.error('获取键列表失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取键的类型
  async getKeyType(key) {
    try {
      const type = await this.connection.type(key);
      return { success: true, data: type };
    } catch (error) {
      this.logger.error('获取键类型失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取键的TTL
  async getKeyTTL(key) {
    try {
      const ttl = await this.connection.ttl(key);
      return { success: true, data: ttl };
    } catch (error) {
      this.logger.error('获取键TTL失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除键
  async deleteKey(key) {
    try {
      const result = await this.connection.del(key);
      return { success: true, data: { deleted: result > 0 } };
    } catch (error) {
      this.logger.error('删除键失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 设置键值
  async setKey(key, value, options = {}) {
    try {
      const result = await this.connection.set(key, value, options);
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('设置键值失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取键值
  async getKey(key) {
    try {
      const value = await this.connection.get(key);
      return { success: true, data: value };
    } catch (error) {
      this.logger.error('获取键值失败:', error);
      return { success: false, error: error.message };
    }
  }

  // String操作
  async stringOperations(key, operation, ...args) {
    try {
      let result;
      switch (operation) {
        case 'get':
          result = await this.connection.get(key);
          break;
        case 'set':
          result = await this.connection.set(key, ...args);
          break;
        case 'append':
          result = await this.connection.append(key, ...args);
          break;
        case 'strlen':
          result = await this.connection.strlen(key);
          break;
        case 'getrange':
          result = await this.connection.getrange(key, ...args);
          break;
        case 'setrange':
          result = await this.connection.setrange(key, ...args);
          break;
        case 'incr':
          result = await this.connection.incr(key);
          break;
        case 'decr':
          result = await this.connection.decr(key);
          break;
        case 'incrby':
          result = await this.connection.incrby(key, ...args);
          break;
        case 'decrby':
          result = await this.connection.decrby(key, ...args);
          break;
        default:
          throw new Error(`不支持的字符串操作: ${operation}`);
      }
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('字符串操作失败:', error);
      return { success: false, error: error.message };
    }
  }

  // Hash操作
  async hashOperations(key, operation, ...args) {
    try {
      let result;
      switch (operation) {
        case 'hget':
          result = await this.connection.hget(key, ...args);
          break;
        case 'hset':
          result = await this.connection.hset(key, ...args);
          break;
        case 'hgetall':
          result = await this.connection.hgetall(key);
          break;
        case 'hkeys':
          result = await this.connection.hkeys(key);
          break;
        case 'hvals':
          result = await this.connection.hvals(key);
          break;
        case 'hlen':
          result = await this.connection.hlen(key);
          break;
        case 'hexists':
          result = await this.connection.hexists(key, ...args);
          break;
        case 'hdel':
          result = await this.connection.hdel(key, ...args);
          break;
        case 'hincrby':
          result = await this.connection.hincrby(key, ...args);
          break;
        default:
          throw new Error(`不支持的Hash操作: ${operation}`);
      }
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Hash操作失败:', error);
      return { success: false, error: error.message };
    }
  }

  // List操作
  async listOperations(key, operation, ...args) {
    try {
      let result;
      switch (operation) {
        case 'lpush':
          result = await this.connection.lpush(key, ...args);
          break;
        case 'rpush':
          result = await this.connection.rpush(key, ...args);
          break;
        case 'lpop':
          result = await this.connection.lpop(key);
          break;
        case 'rpop':
          result = await this.connection.rpop(key);
          break;
        case 'llen':
          result = await this.connection.llen(key);
          break;
        case 'lrange':
          result = await this.connection.lrange(key, ...args);
          break;
        case 'lindex':
          result = await this.connection.lindex(key, ...args);
          break;
        case 'lset':
          result = await this.connection.lset(key, ...args);
          break;
        case 'lrem':
          result = await this.connection.lrem(key, ...args);
          break;
        case 'ltrim':
          result = await this.connection.ltrim(key, ...args);
          break;
        default:
          throw new Error(`不支持的List操作: ${operation}`);
      }
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('List操作失败:', error);
      return { success: false, error: error.message };
    }
  }

  // Set操作
  async setOperations(key, operation, ...args) {
    try {
      let result;
      switch (operation) {
        case 'sadd':
          result = await this.connection.sadd(key, ...args);
          break;
        case 'srem':
          result = await this.connection.srem(key, ...args);
          break;
        case 'smembers':
          result = await this.connection.smembers(key);
          break;
        case 'scard':
          result = await this.connection.scard(key);
          break;
        case 'sismember':
          result = await this.connection.sismember(key, ...args);
          break;
        case 'spop':
          result = await this.connection.spop(key);
          break;
        case 'srandmember':
          result = await this.connection.srandmember(key, ...args);
          break;
        default:
          throw new Error(`不支持的Set操作: ${operation}`);
      }
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Set操作失败:', error);
      return { success: false, error: error.message };
    }
  }

  // Sorted Set操作
  async zsetOperations(key, operation, ...args) {
    try {
      let result;
      switch (operation) {
        case 'zadd':
          result = await this.connection.zadd(key, ...args);
          break;
        case 'zrem':
          result = await this.connection.zrem(key, ...args);
          break;
        case 'zrange':
          result = await this.connection.zrange(key, ...args);
          break;
        case 'zrangebyscore':
          result = await this.connection.zrangebyscore(key, ...args);
          break;
        case 'zscore':
          result = await this.connection.zscore(key, ...args);
          break;
        case 'zrank':
          result = await this.connection.zrank(key, ...args);
          break;
        case 'zcard':
          result = await this.connection.zcard(key);
          break;
        case 'zcount':
          result = await this.connection.zcount(key, ...args);
          break;
        default:
          throw new Error(`不支持的Sorted Set操作: ${operation}`);
      }
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Sorted Set操作失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 执行Lua脚本
  async eval(script, keys = [], args = []) {
    try {
      const result = await this.connection.eval(script, {
        keys: keys,
        arguments: args
      });
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('执行Lua脚本失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 发布订阅
  async publish(channel, message) {
    try {
      const result = await this.connection.publish(channel, message);
      return { success: true, data: { subscribers: result } };
    } catch (error) {
      this.logger.error('发布消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 管道操作
  async pipeline(operations) {
    try {
      const pipeline = this.connection.multi();

      for (const op of operations) {
        pipeline[op.command](...op.args);
      }

      const results = await pipeline.exec();
      return { success: true, data: results };
    } catch (error) {
      this.logger.error('管道操作失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取Redis统计信息
  async getStats() {
    try {
      const [info, dbsize, slowlog] = await Promise.all([
        this.connection.info(),
        this.connection.dbsize(),
        this.connection.slowlog('get', 10)
      ]);

      // 解析info信息
      const infoMap = {};
      info.split('\n').forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            infoMap[key.trim()] = value.trim();
          }
        }
      });

      return {
        success: true,
        data: {
          info: infoMap,
          dbsize,
          slowlog
        }
      };
    } catch (error) {
      this.logger.error('获取Redis统计信息失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 备份数据
  async backup() {
    try {
      const keys = await this.connection.keys('*');
      const backup = {};

      for (const key of keys) {
        const type = await this.connection.type(key);
        backup[key] = {
          type,
          ttl: await this.connection.ttl(key)
        };

        switch (type) {
          case 'string':
            backup[key].value = await this.connection.get(key);
            break;
          case 'hash':
            backup[key].value = await this.connection.hgetall(key);
            break;
          case 'list':
            backup[key].value = await this.connection.lrange(key, 0, -1);
            break;
          case 'set':
            backup[key].value = await this.connection.smembers(key);
            break;
          case 'zset':
            backup[key].value = await this.connection.zrange(key, 0, -1, 'WITHSCORES');
            break;
        }
      }

      return { success: true, data: backup };
    } catch (error) {
      this.logger.error('备份Redis数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 清空数据库
  async flushDB() {
    try {
      const result = await this.connection.flushdb();
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('清空数据库失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 执行Redis命令
  async executeCommand(command, args = []) {
    try {
      let result;
      switch (command.toLowerCase()) {
        case 'get':
          result = await this.connection.get(args[0]);
          break;
        case 'set':
          result = await this.connection.set(args[0], args[1]);
          break;
        case 'del':
          result = await this.connection.del(args[0]);
          break;
        case 'exists':
          result = await this.connection.exists(args[0]);
          break;
        case 'keys':
          result = await this.connection.keys(args[0] || '*');
          break;
        case 'type':
          result = await this.connection.type(args[0]);
          break;
        case 'expire':
          result = await this.connection.expire(args[0], parseInt(args[1]));
          break;
        case 'ttl':
          result = await this.connection.ttl(args[0]);
          break;
        case 'hgetall':
          result = await this.connection.hGetAll(args[0]);
          break;
        case 'hget':
          result = await this.connection.hGet(args[0], args[1]);
          break;
        case 'hset':
          result = await this.connection.hSet(args[0], args[1], args[2]);
          break;
        case 'hdel':
          result = await this.connection.hDel(args[0], args[1]);
          break;
        case 'hlen':
          result = await this.connection.hLen(args[0]);
          break;
        case 'hexists':
          result = await this.connection.hExists(args[0], args[1]);
          break;
        case 'hkeys':
          result = await this.connection.hKeys(args[0]);
          break;
        case 'hvals':
          result = await this.connection.hVals(args[0]);
          break;
        case 'lrange':
          result = await this.connection.lRange(args[0], parseInt(args[1]) || 0, parseInt(args[2]) || -1);
          break;
        case 'llen':
          result = await this.connection.lLen(args[0]);
          break;
        case 'lpush':
          result = await this.connection.lPush(args[0], args[1]);
          break;
        case 'rpush':
          result = await this.connection.rPush(args[0], args[1]);
          break;
        case 'lpop':
          result = await this.connection.lPop(args[0]);
          break;
        case 'rpop':
          result = await this.connection.rPop(args[0]);
          break;
        case 'lindex':
          result = await this.connection.lIndex(args[0], parseInt(args[1]));
          break;
        case 'sadd':
          result = await this.connection.sAdd(args[0], args.slice(1));
          break;
        case 'smembers':
          result = await this.connection.sMembers(args[0]);
          break;
        case 'srem':
          result = await this.connection.sRem(args[0], args.slice(1));
          break;
        case 'scard':
          result = await this.connection.sCard(args[0]);
          break;
        case 'sismember':
          result = await this.connection.sIsMember(args[0], args[1]);
          break;
        case 'zadd':
          result = await this.connection.zAdd(args[0], args.slice(1));
          break;
        case 'zrange':
          if (args.includes('WITHSCORES')) {
            const withScores = args.includes('WITHSCORES');
            const start = parseInt(args[1]) || 0;
            const end = parseInt(args[2]) || -1;
            result = await this.connection.zRangeWithScores(args[0], start, end);
          } else {
            const start = parseInt(args[1]) || 0;
            const end = parseInt(args[2]) || -1;
            result = await this.connection.zRange(args[0], start, end);
          }
          break;
        case 'zrem':
          result = await this.connection.zRem(args[0], args.slice(1));
          break;
        case 'zcard':
          result = await this.connection.zCard(args[0]);
          break;
        case 'zscore':
          result = await this.connection.zScore(args[0], args[1]);
          break;
        default:
          return { success: false, error: `不支持的命令: ${command}` };
      }
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('执行命令失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = RedisService;