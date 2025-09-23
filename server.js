require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const socketIo = require('socket.io');
const cors = require('./middleware/cors');
const { errorHandler, notFoundHandler, requestLogger } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/api');
const DataSourceManager = require('./services/dataSourceManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// 初始化数据源管理器
const dataSourceManager = DataSourceManager.getInstance();

// 中间件
app.use(cors);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 确保必要的目录存在
async function ensureDirectories() {
    const dirs = ['logs', 'uploads', 'data'];
    for (const dir of dirs) {
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (error) {
            console.error(`创建目录 ${dir} 失败:`, error);
        }
    }
}

// API路由
app.use('/api', apiRoutes);

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node: process.version
    });
});

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// Socket.IO 连接处理
io.on('connection', (socket) => {
    console.log('用户连接:', socket.id);

    // 加入房间
    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`用户 ${socket.id} 加入房间 ${room}`);
    });

    // 实时查询进度
    socket.on('query-progress', (data) => {
        socket.to(data.room).emit('query-progress', data);
    });

    // 实时数据更新
    socket.on('data-update', (data) => {
        socket.to(data.room).emit('data-update', data);
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('用户断开连接:', socket.id);
    });
});

// 优雅关闭
function gracefulShutdown() {
    console.log('正在关闭服务器...');
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });

    // 强制关闭
    setTimeout(() => {
        console.log('强制关闭服务器');
        process.exit(1);
    }, 10000);
}

// 监听进程信号
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 启动服务器
async function startServer() {
    try {
        await ensureDirectories();

        // 初始化数据源管理器
        const dataSourceManager = DataSourceManager.getInstance();
        await dataSourceManager.initialize();

        server.listen(PORT, () => {
            console.log(`服务器运行在端口 ${PORT}`);
            console.log(`访问地址: http://localhost:${PORT}`);
            console.log(`健康检查: http://localhost:${PORT}/health`);
            console.log(`数据源管理器已初始化`);
        });
    } catch (error) {
        console.error('启动服务器失败:', error);
        process.exit(1);
    }
}

// 启动应用
startServer();

// 全局错误处理
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
    gracefulShutdown();
});

module.exports = { app, server, io };