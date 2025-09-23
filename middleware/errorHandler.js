const winston = require('winston');

// 创建日志记录器
const logger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log' }),
        new winston.transports.Console()
    ]
});

// 错误处理中间件
function errorHandler(err, req, res, next) {
    // 记录错误日志
    logger.error({
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });

    // 开发环境返回详细错误信息
    if (process.env.NODE_ENV === 'development') {
        return res.status(500).json({
            success: false,
            error: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
        });
    }

    // 生产环境返回简化错误信息
    res.status(500).json({
        success: false,
        error: '服务器内部错误',
        timestamp: new Date().toISOString()
    });
}

// 404错误处理
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: '请求的资源不存在',
        url: req.url,
        method: req.method
    });
}

// 异步错误捕获包装器
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// 验证中间件
function validateRequest(schema) {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message,
                field: error.details[0].path[0]
            });
        }
        next();
    };
}

// 连接验证中间件
function validateConnection(req, res, next) {
    const connectionId = req.params.connectionId;
    if (!connectionId) {
        return res.status(400).json({
            success: false,
            error: '缺少连接ID'
        });
    }
    next();
}

// 请求日志中间件
function requestLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info({
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: duration,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
    });

    next();
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    validateRequest,
    validateConnection,
    requestLogger
};