const cors = require('cors');

// CORS中间件配置
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*', // 允许的源
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // 允许的方法
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'], // 允许的头部
    credentials: true, // 允许发送凭据
    optionsSuccessStatus: 200 // 预检请求的状态码
};

module.exports = cors(corsOptions);