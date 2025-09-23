# 连接显示问题调试指南

## 问题描述
上次已经连接过的数据库连接没有显示在左侧连接列表中。

## 调试步骤

### 1. 打开浏览器开发者工具
- 按 F12 打开开发者工具
- 切换到 Console 标签页
- 刷新页面 (Ctrl+R)

### 2. 检查调试信息
在控制台中应该能看到以下信息：
- "Initializing app..."
- "Loading connections from localStorage..."
- "Checking localStorage key 'savedConnections': ..."
- "Final connections array: ..."

### 3. 如果没有连接显示，尝试以下方法：

#### 方法1：添加测试连接
- 点击左侧连接列表区域的🐛（虫子）图标按钮
- 这会添加两个测试连接到localStorage
- 页面会自动刷新并显示测试连接

#### 方法2：手动检查localStorage
- 在浏览器开发者工具中切换到 Application 标签页
- 在左侧找到 Storage -> Local Storage
- 检查是否有以下键：
  - `savedConnections`
  - `connections`
  - `dbConnections`

#### 方法3：使用调试页面
- 访问 `http://localhost:3000/debug.html`
- 查看localStorage中的所有数据

### 4. 常见问题和解决方案

#### 问题1：localStorage为空
- **原因**：之前创建的连接没有正确保存
- **解决**：点击"新建连接"创建一个新连接

#### 问题2：数据格式错误
- **原因**：localStorage中的数据格式不正确
- **解决**：在控制台运行 `clearTestConnections()` 清理数据，然后重新创建连接

#### 问题3：JavaScript错误
- **原因**：页面加载时有JavaScript错误
- **解决**：检查控制台是否有红色错误信息，根据错误信息修复

### 5. 测试连接功能
如果添加了测试连接，应该能在左侧看到：
- 本地MySQL测试
- 远程PostgreSQL

这些连接用于验证连接列表的显示功能是否正常。

### 6. 恢复正常
调试完成后：
- 点击🐛按钮旁边的刷新按钮重新加载连接
- 或者手动删除测试连接数据