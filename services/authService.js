const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const winston = require('winston');

class AuthService {
    constructor() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'logs/auth.log' }),
                new winston.transports.Console()
            ]
        });

        // 模拟用户数据库（实际应用中应该使用数据库）
        this.users = new Map();
        this.initializeDefaultUsers();
    }

    // 初始化默认用户
    initializeDefaultUsers() {
        const defaultUsers = [
            {
                username: 'admin',
                email: 'admin@example.com',
                password: '$2b$10$rOZXp7mGX8QY3X7V3X7X7e3X7X7X7X7X7X7X7X7X7X7X7X7X', // password: admin123
                role: 'admin',
                permissions: ['all'],
                createdAt: new Date().toISOString()
            },
            {
                username: 'user',
                email: 'user@example.com',
                password: '$2b$10$rOZXp7mGX8QY3X7V3X7X7e3X7X7X7X7X7X7X7X7X7X7X7X7X', // password: user123
                role: 'user',
                permissions: ['read', 'execute', 'export'],
                createdAt: new Date().toISOString()
            }
        ];

        defaultUsers.forEach(user => {
            this.users.set(user.username, user);
        });
    }

    // 用户注册
    async register(userData) {
        try {
            const { username, email, password, role = 'user' } = userData;

            // 验证用户名是否已存在
            if (this.users.has(username)) {
                return { success: false, error: '用户名已存在' };
            }

            // 验证邮箱是否已存在
            const existingUser = Array.from(this.users.values()).find(u => u.email === email);
            if (existingUser) {
                return { success: false, error: '邮箱已存在' };
            }

            // 加密密码
            const hashedPassword = await bcrypt.hash(password, 10);

            // 根据角色设置权限
            const permissions = this.getPermissionsByRole(role);

            // 创建用户
            const user = {
                id: Date.now().toString(),
                username,
                email,
                password: hashedPassword,
                role,
                permissions,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                isActive: true
            };

            this.users.set(username, user);

            this.logger.info(`新用户注册: ${username}`);
            return { success: true, message: '注册成功', user: { ...user, password: undefined } };
        } catch (error) {
            this.logger.error('用户注册失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 用户登录
    async login(credentials) {
        try {
            const { username, password } = credentials;

            // 查找用户
            const user = this.users.get(username);
            if (!user) {
                return { success: false, error: '用户名或密码错误' };
            }

            // 检查用户状态
            if (!user.isActive) {
                return { success: false, error: '账户已被禁用' };
            }

            // 验证密码
            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return { success: false, error: '用户名或密码错误' };
            }

            // 更新最后登录时间
            user.lastLogin = new Date().toISOString();

            // 生成JWT令牌
            const token = jwt.sign(
                {
                    userId: user.id,
                    username: user.username,
                    role: user.role,
                    permissions: user.permissions
                },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            // 生成刷新令牌
            const refreshToken = jwt.sign(
                { userId: user.id, username: user.username },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );

            this.logger.info(`用户登录: ${username}`);
            return {
                success: true,
                message: '登录成功',
                data: {
                    token,
                    refreshToken,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        permissions: user.permissions
                    }
                }
            };
        } catch (error) {
            this.logger.error('用户登录失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 刷新令牌
    async refreshToken(refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'your-secret-key');
            const user = Array.from(this.users.values()).find(u => u.id === decoded.userId);

            if (!user || !user.isActive) {
                return { success: false, error: '用户不存在或已禁用' };
            }

            // 生成新的访问令牌
            const newToken = jwt.sign(
                {
                    userId: user.id,
                    username: user.username,
                    role: user.role,
                    permissions: user.permissions
                },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            return {
                success: true,
                data: {
                    token: newToken
                }
            };
        } catch (error) {
            this.logger.error('刷新令牌失败:', error);
            return { success: false, error: '无效的刷新令牌' };
        }
    }

    // 验证令牌
    async verifyToken(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            const user = Array.from(this.users.values()).find(u => u.id === decoded.userId);

            if (!user || !user.isActive) {
                return { success: false, error: '用户不存在或已禁用' };
            }

            return { success: true, data: decoded };
        } catch (error) {
            return { success: false, error: '无效的访问令牌' };
        }
    }

    // 获取用户信息
    async getUserById(userId) {
        try {
            const user = Array.from(this.users.values()).find(u => u.id === userId);
            if (!user) {
                return { success: false, error: '用户不存在' };
            }

            return {
                success: true,
                data: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    permissions: user.permissions,
                    createdAt: user.createdAt,
                    lastLogin: user.lastLogin
                }
            };
        } catch (error) {
            this.logger.error('获取用户信息失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 更新用户信息
    async updateUser(userId, updateData) {
        try {
            const user = Array.from(this.users.values()).find(u => u.id === userId);
            if (!user) {
                return { success: false, error: '用户不存在' };
            }

            // 不允许更新敏感字段
            const allowedFields = ['email', 'role', 'isActive'];
            const updates = {};

            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    updates[field] = updateData[field];
                }
            }

            // 如果更新角色，同时更新权限
            if (updates.role) {
                updates.permissions = this.getPermissionsByRole(updates.role);
            }

            Object.assign(user, updates);

            this.logger.info(`用户信息更新: ${user.username}`);
            return { success: true, message: '用户信息更新成功', user: { ...user, password: undefined } };
        } catch (error) {
            this.logger.error('更新用户信息失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 修改密码
    async changePassword(userId, oldPassword, newPassword) {
        try {
            const user = Array.from(this.users.values()).find(u => u.id === userId);
            if (!user) {
                return { success: false, error: '用户不存在' };
            }

            // 验证旧密码
            const isValidPassword = await bcrypt.compare(oldPassword, user.password);
            if (!isValidPassword) {
                return { success: false, error: '旧密码错误' };
            }

            // 加密新密码
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            user.password = hashedPassword;

            this.logger.info(`用户密码修改: ${user.username}`);
            return { success: true, message: '密码修改成功' };
        } catch (error) {
            this.logger.error('密码修改失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 删除用户
    async deleteUser(userId) {
        try {
            const user = Array.from(this.users.values()).find(u => u.id === userId);
            if (!user) {
                return { success: false, error: '用户不存在' };
            }

            this.users.delete(user.username);

            this.logger.info(`用户删除: ${user.username}`);
            return { success: true, message: '用户删除成功' };
        } catch (error) {
            this.logger.error('删除用户失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 获取所有用户
    async getAllUsers() {
        try {
            const users = Array.from(this.users.values()).map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                isActive: user.isActive
            }));

            return { success: true, data: users };
        } catch (error) {
            this.logger.error('获取用户列表失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 根据角色获取权限
    getPermissionsByRole(role) {
        const rolePermissions = {
            admin: ['all'],
            user: ['read', 'execute', 'export'],
            guest: ['read']
        };

        return rolePermissions[role] || ['read'];
    }

    // 检查权限
    checkPermission(userPermissions, requiredPermission) {
        if (!userPermissions || !requiredPermission) {
            return false;
        }

        // 管理员拥有所有权限
        if (userPermissions.includes('all')) {
            return true;
        }

        return userPermissions.includes(requiredPermission);
    }

    // 中间件：验证JWT令牌
    authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ success: false, error: '访问令牌缺失' });
        }

        jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
            if (err) {
                return res.status(403).json({ success: false, error: '无效的访问令牌' });
            }

            req.user = user;
            next();
        });
    }

    // 中间件：检查权限
    requirePermission(permission) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ success: false, error: '用户未认证' });
            }

            if (!this.checkPermission(req.user.permissions, permission)) {
                return res.status(403).json({ success: false, error: '权限不足' });
            }

            next();
        };
    }
}

module.exports = AuthService;