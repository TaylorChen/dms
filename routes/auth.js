const express = require('express');
const router = express.Router();
const AuthService = require('../services/authService');
const { asyncHandler, validateRequest } = require('../middleware/errorHandler');

const authService = new AuthService();

// 用户注册
router.post('/register', asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(result.success ? 201 : 400).json(result);
}));

// 用户登录
router.post('/login', asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.status(result.success ? 200 : 401).json(result);
}));

// 刷新令牌
router.post('/refresh', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ success: false, error: '刷新令牌缺失' });
    }

    const result = await authService.refreshToken(refreshToken);
    res.status(result.success ? 200 : 401).json(result);
}));

// 获取用户信息
router.get('/profile', authService.authenticateToken, asyncHandler(async (req, res) => {
    const result = await authService.getUserById(req.user.userId);
    res.status(result.success ? 200 : 404).json(result);
}));

// 更新用户信息
router.put('/profile', authService.authenticateToken, asyncHandler(async (req, res) => {
    const result = await authService.updateUser(req.user.userId, req.body);
    res.status(result.success ? 200 : 400).json(result);
}));

// 修改密码
router.put('/password', authService.authenticateToken, asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ success: false, error: '请提供旧密码和新密码' });
    }

    const result = await authService.changePassword(req.user.userId, oldPassword, newPassword);
    res.status(result.success ? 200 : 400).json(result);
}));

// 获取所有用户（仅管理员）
router.get('/users',
    authService.authenticateToken,
    authService.requirePermission('all'),
    asyncHandler(async (req, res) => {
        const result = await authService.getAllUsers();
        res.status(result.success ? 200 : 500).json(result);
    })
);

// 删除用户（仅管理员）
router.delete('/users/:userId',
    authService.authenticateToken,
    authService.requirePermission('all'),
    asyncHandler(async (req, res) => {
        const result = await authService.deleteUser(req.params.userId);
        res.status(result.success ? 200 : 404).json(result);
    })
);

// 验证令牌
router.post('/verify', asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ success: false, error: '令牌缺失' });
    }

    const result = await authService.verifyToken(token);
    res.status(result.success ? 200 : 401).json(result);
}));

module.exports = router;