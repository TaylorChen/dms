// 全局变量
let currentConnectionId = null;
let connections = [];
let connectionGroups = [];
let sqlEditor = null;
let dataTable = null;
let pendingConnection = null;
let sidebarOpen = false;

// 数据库结构缓存
let dbStructureCache = {};
let currentDbStructure = null;

// 初始化SQL编辑器
function initializeSQLEditor() {
    if (typeof ace !== 'undefined') {
        sqlEditor = ace.edit("sqlEditor");
        sqlEditor.setTheme("ace/theme/monokai");
        sqlEditor.session.setMode("ace/mode/sql");

        // 设置编辑器基础选项
        sqlEditor.setOptions({
            fontSize: "14px",
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true,
            showPrintMargin: false,
            highlightActiveLine: true,
            highlightSelectedWord: true,
            liveAutocompletionDelay: 300,
            liveAutocompletionThreshold: 2
        });

        // 默认启用SQL模式
        setupEnhancedSQLAutocompletion();

        console.log('编辑器初始化完成，已启用智能代码提示');
    }
}

// 全局错误处理
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    console.error('Error message:', e.message);
    console.error('Error filename:', e.filename);
    console.error('Error line:', e.lineno);
});

// 初始化
$(document).ready(function() {
    console.log('Document ready called');
    console.log('jQuery version:', $.fn.jquery);
    console.log('Bootstrap modal available:', typeof $.fn.modal !== 'undefined');

    initializeApp();
    initializeSQLEditor();
    setupEventListeners();
});

// 初始化应用
async function initializeApp() {
    console.log('Initializing app...');

    // 加载连接数据
    await loadConnections();

    // 更新连接选择器
    updateConnectionSelectors();

    // 检查本地存储的分组配置
    if (localStorage.getItem('connectionGroups')) {
        connectionGroups = JSON.parse(localStorage.getItem('connectionGroups'));
        console.log('Loaded connection groups:', connectionGroups);
        updateGroupSelectors();
    }

    // 加载导入导出历史记录
    loadImportExportHistory();

    // 加载同步历史记录
    loadSyncHistory();

    // 初始化备份恢复功能
    initBackupRestore();

    // 如果有保存的连接，自动尝试连接第一个MySQL连接（优先选择MySQL）
    if (connections.length > 0) {
        // 优先选择MySQL连接，如果没有则选择第一个可用连接
        const mysqlConnection = connections.find(conn => conn.type === 'mysql');
        const preferredConnection = mysqlConnection || connections[0];

        // 强制自动连接MySQL连接，如果没有autoConnect属性则默认为true
        if (preferredConnection.type === 'mysql' || preferredConnection.autoConnect) {
            setTimeout(() => {
                console.log(`🔄 [DEBUG] 自动连接到 ${preferredConnection.name} (${preferredConnection.type})`);
                selectConnection(preferredConnection.id);
            }, 500);
        }
    }
}

// 加载连接数据
async function loadConnections() {
    try {
        // 优先从API获取连接列表
        const apiResponse = await fetch('/api/connections');
        if (apiResponse.ok) {
            const result = await apiResponse.json();
            if (result.success) {
                connections = result.data.map(conn => ({
                    id: conn.id,
                    name: conn.type + '_' + conn.config.host,
                    type: conn.type,
                    config: conn.config,
                    status: 'connected',
                    connectionId: conn.id,
                    lastConnected: conn.createdAt
                }));
                console.log('Loaded connections from API:', connections);
                return;
            }
        }

        // 备用方案：从静态文件加载
        const response = await fetch('/data/sources.json');
        if (response.ok) {
            const data = await response.json();
            // 转换数据格式，保存原始key用于删除操作
            connections = data.map(([name, config]) => ({
                id: config.id,
                key: name, // 保存原始key用于删除
                name: config.name,
                type: config.type,
                config: config.config,
                status: config.status,
                description: config.description,
                tags: config.tags,
                connectionId: config.connectionId,
                lastConnected: config.lastConnected
            }));
            console.log('Loaded connections from static file:', connections);
        } else {
            console.error('Failed to load connections');
        }
    } catch (error) {
        console.error('Error loading connections:', error);
    }
}

// 初始化SQL编辑器
function initializeSQLEditor() {
    if (typeof ace !== 'undefined') {
        sqlEditor = ace.edit("sqlEditor");
        sqlEditor.setTheme("ace/theme/monokai");
        sqlEditor.session.setMode("ace/mode/sql");

        // 设置编辑器基础选项
        sqlEditor.setOptions({
            fontSize: "14px",
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true,
            showPrintMargin: false,
            highlightActiveLine: true,
            highlightSelectedWord: true,
            liveAutocompletionDelay: 300,
            liveAutocompletionThreshold: 2
        });

        // 默认启用SQL模式
        setupEnhancedSQLAutocompletion();

        console.log('编辑器初始化完成，已启用智能代码提示');
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 连接类型变更
    $('#dbType').on('change', updateConnectionForm);

    // 表选择器变更
    $('#tableSelector').on('change', loadTableData);
    $('#structureTableSelector').on('change', onStructureTableChange);
    $('#exportSourceTable').on('change', updateExportOptions);

    // 表结构管理按钮
    $('#testBtn').on('click', testTableStructureFunction);
    $('#loadStructureBtn').on('click', loadSelectedTableStructure);
    $('#createTableBtn').on('click', showCreateTableModal);

    // 搜索输入
    $('#searchInput').on('keyup', debounce(performSearch, 300));
}

// 更新连接表单
function updateConnectionForm() {
    const dbType = $('#dbType').val();
    const formFields = $('#connectionFormFields');

    let fieldsHTML = '';

    switch (dbType) {
        case 'mysql':
            fieldsHTML = `
                <div class="row">
                    <div class="col-md-8">
                        <div class="mb-3">
                            <label class="form-label">主机 <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="host" value="localhost" required>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="mb-3">
                            <label class="form-label">端口 <span class="text-danger">*</span></label>
                            <input type="number" class="form-control" id="port" value="3306" required>
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label class="form-label">用户名 <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="user" value="root" required>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label class="form-label">密码</label>
                            <input type="password" class="form-control" id="password" placeholder="留空表示无密码">
                        </div>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">数据库</label>
                    <input type="text" class="form-control" id="database" placeholder="数据库名称（可选）">
                    <div class="form-text">留空则连接到MySQL服务器，可稍后选择数据库</div>
                </div>
            `;
            break;
        case 'postgresql':
            fieldsHTML = `
                <div class="row">
                    <div class="col-md-8">
                        <div class="mb-3">
                            <label class="form-label">主机 <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="host" value="localhost" required>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="mb-3">
                            <label class="form-label">端口 <span class="text-danger">*</span></label>
                            <input type="number" class="form-control" id="port" value="5432" required>
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label class="form-label">用户名 <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="user" value="postgres" required>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label class="form-label">密码</label>
                            <input type="password" class="form-control" id="password" placeholder="留空表示无密码">
                        </div>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">数据库</label>
                    <input type="text" class="form-control" id="database" placeholder="数据库名称（可选）">
                    <div class="form-text">留空则连接到PostgreSQL服务器，可稍后选择数据库</div>
                </div>
            `;
            break;
        case 'mongodb':
            fieldsHTML = `
                <div class="mb-3">
                    <label class="form-label">连接URL <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" id="url" value="mongodb://localhost:27017" required>
                    <div class="form-text">例如：mongodb://localhost:27017 或 mongodb://user:password@host:port</div>
                </div>
                <div class="mb-3">
                    <label class="form-label">认证数据库</label>
                    <input type="text" class="form-control" id="authDatabase" placeholder="admin">
                    <div class="form-text">留空使用默认认证数据库</div>
                </div>
            `;
            break;
        case 'redis':
            fieldsHTML = `
                <div class="mb-3">
                    <label class="form-label">主机 <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" id="host" value="localhost" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">端口 <span class="text-danger">*</span></label>
                    <input type="number" class="form-control" id="port" value="6379" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">密码</label>
                    <input type="password" class="form-control" id="password" placeholder="留空表示无密码">
                </div>
                <div class="mb-3">
                    <label class="form-label">数据库</label>
                    <input type="number" class="form-control" id="database" value="0" min="0" max="15">
                    <div class="form-text">Redis数据库编号 (0-15)</div>
                </div>
            `;
            break;
    }

    formFields.html(fieldsHTML);
}

// 测试库函数
function testLibraries() {
    console.log('=== 测试库函数 ===');
    console.log('jQuery:', typeof $ !== 'undefined' ? '✓ 已加载' : '✗ 未加载');
    console.log('jQuery版本:', $.fn.jquery);
    console.log('Bootstrap:', typeof $.fn.modal !== 'undefined' ? '✓ 已加载' : '✗ 未加载');
    console.log('新建连接模态框:', $('#newConnectionModal').length > 0 ? '✓ 找到' : '✗ 未找到');
    console.log('showNewConnectionModal函数:', typeof showNewConnectionModal);

    // 测试模态框功能
    try {
        const testModal = $('#newConnectionModal');
        if (testModal.length > 0) {
            console.log('测试显示模态框...');
            testModal.modal('show');
            setTimeout(() => {
                testModal.modal('hide');
                console.log('测试模态框完成');
            }, 1000);
        }
    } catch (error) {
        console.error('测试模态框失败:', error);
    }

    alert('库测试完成，请查看控制台获取详细信息。');
}

// 简单模态框测试
function simpleModalTest() {
    console.log('Simple modal test called');
    alert('测试：JavaScript函数可以正常调用！');

    try {
        const modal = $('#newConnectionModal');
        if (modal.length > 0) {
            console.log('Found modal, attempting to show...');
            modal.modal('show');
            console.log('Modal show method called');
        } else {
            console.error('Modal not found in DOM');
            alert('找不到模态框元素');
        }
    } catch (error) {
        console.error('Modal test failed:', error);
        alert('模态框测试失败: ' + error.message);
    }
}

// 显示新建连接模态框
function showNewConnectionModal() {
    console.log('showNewConnectionModal called');
    const modal = $('#newConnectionModal');
    console.log('Modal element:', modal);
    console.log('Modal length:', modal.length);

    if (modal.length === 0) {
        console.error('New connection modal not found!');
        alert('找不到新建连接模态框，请检查页面是否正确加载。');
        return;
    }

    try {
        modal.modal('show');
        console.log('Modal show called successfully');
        updateConnectionForm();
    } catch (error) {
        console.error('Error showing modal:', error);
        alert('显示模态框时出错: ' + error.message);
    }
}

// 刷新连接列表
async function refreshConnections() {
    await loadConnections();
    showNotification('连接列表已刷新', 'success');
}

// 筛选连接
function filterConnections() {
    const filter = $('#connectionFilter').val();
    const allConnections = document.querySelectorAll('#connectionList .connection-item');

    allConnections.forEach(item => {
        const connectionType = item.dataset.type;
        const isActive = item.dataset.active === 'true';

        let showItem = false;

        switch (filter) {
            case 'all':
                showItem = true;
                break;
            case 'mysql':
            case 'postgresql':
            case 'mongodb':
            case 'redis':
                showItem = connectionType === filter;
                break;
            case 'active':
                showItem = isActive;
                break;
            case 'inactive':
                showItem = !isActive;
                break;
        }

        item.style.display = showItem ? 'block' : 'none';
    });
}

// 更新数据库选择器
async function updateDatabaseSelector() {
    const connectionId = $('#currentConnection').val();
    const dbSelector = $('#currentDatabase');

    if (!connectionId) {
        dbSelector.html('<option value="">请先选择连接</option>');
        return;
    }

    const connection = connections.find(conn => conn.id === connectionId);
    if (!connection) {
        dbSelector.html('<option value="">连接不存在</option>');
        return;
    }

    try {
        showLoading('正在加载数据库列表...');

        if (connection.type === 'redis') {
            // Redis数据库，显示0-15
            let options = '<option value="">选择数据库</option>';
            for (let i = 0; i < 16; i++) {
                options += `<option value="${i}">数据库 ${i}</option>`;
            }
            dbSelector.html(options);
            // 设置当前选择的数据库
            dbSelector.val(connection.config.db || 0);
        } else {
            // MySQL/PostgreSQL数据库，调用API
            const response = await fetch(`/api/structure/${connectionId}`);
            const result = await response.json();

            if (result.success) {
                let options = '<option value="">选择数据库</option>';
                result.data.forEach(db => {
                    options += `<option value="${db.name}">${db.name}</option>`;
                });
                dbSelector.html(options);
                // 设置当前选择的数据库
                if (connection.config.database) {
                    dbSelector.val(connection.config.database);
                }
            } else {
                dbSelector.html('<option value="">加载失败</option>');
            }
        }
    } catch (error) {
        console.error('加载数据库列表失败:', error);
        dbSelector.html('<option value="">加载失败</option>');
    } finally {
        hideLoading();
    }
}

// 显示通知消息
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = $(`
        <div class="notification notification-${type}" style="
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
            color: white;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            font-size: 14px;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        ">
            ${message}
        </div>
    `);

    $('body').append(notification);

    // 显示动画
    setTimeout(() => {
        notification.css({
            'opacity': '1',
            'transform': 'translateX(0)'
        });
    }, 100);

    // 自动隐藏
    setTimeout(() => {
        notification.css({
            'opacity': '0',
            'transform': 'translateX(100%)'
        });
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}


// 测试连接
async function testConnection() {
    const dbType = $('#dbType').val();
    const config = getConnectionConfig(dbType);

    if (!validateConnectionConfig(dbType, config)) {
        return;
    }

    try {
        showLoading('正在测试连接...');

        const response = await fetch('/api/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: dbType,
                config: config
            })
        });

        const result = await response.json();

        if (result.success) {
            showConnectionTestResult(true, '连接测试成功！', result.data);
        } else {
            showConnectionTestResult(false, '连接测试失败：' + result.error);
        }
    } catch (error) {
        showConnectionTestResult(false, '连接测试失败：' + error.message);
    } finally {
        hideLoading();
    }
}

// 显示连接测试结果
function showConnectionTestResult(success, message, data = null) {
    const modal = $('#connectionTestModal');
    const container = $('#connectionTestResult');

    let html = '';
    if (success) {
        html = `
            <div class="alert alert-success">
                <h6><i class="fas fa-check-circle"></i> 连接成功</h6>
                <p>${message}</p>
                ${data ? `<small class="text-muted">服务器信息: ${data.serverVersion || data.version || 'N/A'}</small>` : ''}
            </div>
        `;
    } else {
        html = `
            <div class="alert alert-danger">
                <h6><i class="fas fa-times-circle"></i> 连接失败</h6>
                <p>${message}</p>
            </div>
        `;
    }

    container.html(html);
    modal.modal('show');

    // 保存测试结果供后续连接使用
    pendingConnection = { type: $('#dbType').val(), config: getConnectionConfig($('#dbType').val()) };
}

// 创建连接
async function createConnection() {
    const dbType = $('#dbType').val();
    const connectionName = $('#connectionName').val();
    const saveConnection = $('#saveConnection').is(':checked');
    const config = getConnectionConfig(dbType);

    if (!validateConnectionConfig(dbType, config)) {
        return;
    }

    try {
        showLoading('正在连接数据库...');

        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: dbType,
                config: config
            })
        });

        const result = await response.json();

        if (result.success) {
            // 生成连接信息
            const connectionName = $('#connectionName').val() || getConnectionName(config);
            const connection = {
                id: result.connectionId,
                type: dbType,
                config: config,
                name: connectionName,
                groupId: $('#connectionGroup').val() || null,
                autoConnect: $('#autoConnect').is(':checked'),
                createdAt: new Date().toISOString(),
                lastConnected: new Date().toISOString()
            };

            // 添加到连接列表
            connections.push(connection);
            currentConnectionId = result.connectionId;

            // 保存连接配置
            if (saveConnection) {
                localStorage.setItem('savedConnections', JSON.stringify(connections));
            }

            // 更新界面
            updateConnectionList();
            updateConnectionSelectors();
            loadDatabaseStructure();

            // 关闭模态框
            $('#newConnectionModal').modal('hide');
            showSuccessMessage('数据库连接成功！');
        } else {
            showErrorMessage('连接失败：' + result.error);
        }
    } catch (error) {
        showErrorMessage('连接失败：' + error.message);
    } finally {
        hideLoading();
    }
}

// 验证连接配置
function validateConnectionConfig(dbType, config) {
    const requiredFields = {
        mysql: ['host', 'port', 'user'],
        postgresql: ['host', 'port', 'user'],
        mongodb: ['url'],
        redis: ['host', 'port']
    };

    const missingFields = requiredFields[dbType].filter(field => !config[field]);

    if (missingFields.length > 0) {
        showErrorMessage(`请填写必填字段：${missingFields.join(', ')}`);
        return false;
    }

    return true;
}

// 获取连接配置
function getConnectionConfig(dbType) {
    const config = {};

    switch (dbType) {
        case 'mysql':
        case 'postgresql':
        case 'redis':
            config.host = $('#host').val();
            config.port = parseInt($('#port').val());
            config.user = $('#user').val();
            config.password = $('#password').val();
            if (dbType !== 'redis') {
                config.database = $('#database').val();
            } else {
                config.database = parseInt($('#database').val()) || 0;
            }
            break;
        case 'mongodb':
            config.url = $('#url').val();
            config.authDatabase = $('#authDatabase').val();
            // 从URL中提取数据库名
            try {
                const url = new URL(config.url);
                const pathParts = url.pathname.split('/').filter(p => p);
                config.database = pathParts[0] || 'test';
            } catch (e) {
                config.database = 'test';
            }
            break;
    }

    return config;
}

// 获取连接名称
function getConnectionName(config) {
    if (config.url) {
        return `${config.url.split('//')[1]}:${config.database}`;
    }
    return `${config.host}:${config.port}${config.database ? '/' + config.database : ''}`;
}

// 更新连接列表
function updateConnectionList() {
    const container = $('#connectionList');
    console.log('Updating connection list...');
    console.log('Connections:', connections);
    console.log('Connection groups:', connectionGroups);
    console.log('Container element:', container);

    if (!container.length) {
        console.error('Connection list container not found!');
        return;
    }

    if (connections.length === 0 && connectionGroups.length === 0) {
        console.log('No connections or groups to display');
        container.html('<div class="text-muted text-center">暂无连接<br><small>点击"新建连接"开始</small></div>');
        return;
    }

    let html = '';

    // 首先显示分组
    connectionGroups.forEach(group => {
        const groupConnections = connections.filter(conn => conn.groupId === group.id);

        html += `
            <div class="connection-group mb-3">
                <div class="d-flex align-items-center mb-2">
                    <i class="fas fa-folder text-${group.color} me-2"></i>
                    <h6 class="mb-0 me-2">${group.name}</h6>
                    <small class="text-muted">(${groupConnections.length})</small>
                    <div class="ms-auto">
                        <button class="btn btn-sm btn-outline-secondary" onclick="editGroup('${group.id}', event)" title="编辑分组">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteGroup('${group.id}', event)" title="删除分组">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="ms-4">
        `;

        if (groupConnections.length === 0) {
            html += '<div class="text-muted small">暂无连接</div>';
        } else {
            groupConnections.forEach(conn => {
                const isActive = conn.id === currentConnectionId;
                html += renderConnectionItem(conn, isActive);
            });
        }

        html += `
                </div>
            </div>
        `;
    });

    // 显示未分组的连接
    const ungroupedConnections = connections.filter(conn => !conn.groupId);
    const hasGroupedConnections = connectionGroups.length > 0;

    if (ungroupedConnections.length > 0) {
        if (hasGroupedConnections) {
            html += `
                <div class="connection-group mb-3">
                    <div class="d-flex align-items-center mb-2">
                        <i class="fas fa-folder-open text-secondary me-2"></i>
                        <h6 class="mb-0">未分组</h6>
                        <small class="text-muted">(${ungroupedConnections.length})</small>
                    </div>
                    <div class="ms-4">
            `;
        }

        ungroupedConnections.forEach(conn => {
            const isActive = conn.id === currentConnectionId;
            html += renderConnectionItem(conn, isActive);
        });

        if (hasGroupedConnections) {
            html += `
                    </div>
                </div>
            `;
        }
    }

    // 如果没有任何连接，显示提示
    if (connections.length === 0) {
        html = '<div class="text-muted text-center">暂无连接<br><small>点击"新建连接"开始</small></div>';
    }

    console.log('Final HTML to render:', html);
    container.html(html);
    console.log('Connection list updated successfully');
}

// 从MySQL类型字符串中提取长度
function extractLengthFromType(typeString) {
    if (!typeString) return null;
    const match = typeString.match(/\((\d+)\)/);
    return match ? match[1] : null;
}

// 侧边栏切换功能
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggleBtn = document.querySelector('.mobile-sidebar-toggle');

    sidebarOpen = !sidebarOpen;

    if (sidebarOpen) {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        toggleBtn.innerHTML = '<i class="fas fa-times"></i>';
        document.body.style.overflow = 'hidden';
    } else {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
        document.body.style.overflow = '';
    }
}

// 响应式处理
function handleResponsiveLayout() {
    const width = window.innerWidth;
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggleBtn = document.querySelector('.mobile-sidebar-toggle');

    if (width > 991.98) {
        // 桌面端：重置移动端样式
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
        document.body.style.overflow = '';
        sidebarOpen = false;
    }
}

// 监听窗口大小变化
window.addEventListener('resize', debounce(handleResponsiveLayout, 250));

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 渲染连接项
function renderConnectionItem(conn, isActive) {
    return `
        <div class="connection-item ${isActive ? 'active' : ''}"
             data-type="${conn.type}"
             data-active="${isActive}"
             onclick="selectConnection('${conn.id}')">
            <div class="connection-info">
                <div class="d-flex align-items-center">
                    <i class="fas ${isActive ? 'fa-check-circle text-success' : 'fa-circle text-muted'} me-2"></i>
                    <div class="flex-grow-1">
                        <div class="fw-bold">${conn.name}</div>
                        <div class="connection-type small text-muted">
                            <i class="fas fa-database"></i> ${conn.type.toUpperCase()}
                            ${conn.config.host ? `<span class="ms-2"><i class="fas fa-server"></i> ${conn.config.host}</span>` : ''}
                            ${conn.config.database ? `<span class="ms-2"><i class="fas fa-folder"></i> ${conn.config.database}</span>` : ''}
                        </div>
                        ${conn.lastConnected ? `<small class="text-muted"><i class="fas fa-clock"></i> ${new Date(conn.lastConnected).toLocaleString()}</small>` : ''}
                    </div>
                    <div class="connection-actions">
                        <span class="connection-status me-2" id="status-${conn.id}">
                            <i class="fas fa-circle text-muted"></i>
                            <small>未知</small>
                        </span>
                        ${conn.config.useSSHTunnel ? `
                            <span class="ssh-tunnel-status me-2" id="ssh-status-${conn.id}">
                                ${conn.sshTunnelInfo ?
                                    `<i class="fas fa-lock text-success"></i><small class="text-success">SSH已连接</small>` :
                                    `<i class="fas fa-lock-open text-warning"></i><small class="text-warning">SSH未连接</small>`
                                }
                            </span>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-info" onclick="showConnectionProperties('${conn.id}', event)" title="连接属性">
                            <i class="fas fa-cog"></i>
                        </button>
                        ${conn.config.useSSHTunnel ? `
                            ${conn.sshTunnelInfo ?
                                `<button class="btn btn-sm btn-outline-warning" onclick="closeSSHTunnel('${conn.id}', event)" title="关闭SSH隧道">
                                    <i class="fas fa-unlock"></i>
                                </button>` :
                                `<button class="btn btn-sm btn-outline-success" onclick="establishSSHTunnel('${conn.id}', event)" title="建立SSH隧道">
                                    <i class="fas fa-lock"></i>
                                </button>`
                            }
                        ` : ''}
                        <button class="btn btn-sm btn-outline-primary" onclick="testExistingConnection('${conn.id}', event)" title="测试连接">
                            <i class="fas fa-plug"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="removeConnection('${conn.id}', event)" title="删除连接">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 测试现有连接
async function testExistingConnection(connectionId, event) {
    event.stopPropagation();

    const connection = connections.find(c => c.id === connectionId);
    if (!connection) return;

    try {
        showLoading('正在测试连接...');

        const response = await fetch('/api/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: connection.type,
                config: connection.config
            })
        });

        const result = await response.json();

        if (result.success) {
            showConnectionTestResult(true, '连接测试成功！', result.data);
        } else {
            showConnectionTestResult(false, '连接测试失败：' + result.error);
        }
    } catch (error) {
        showConnectionTestResult(false, '连接测试失败：' + error.message);
    } finally {
        hideLoading();
    }
}

// 测试已存在的连接状态
async function testConnectionStatus(connectionId) {
    try {
        const response = await fetch(`/api/test/${connectionId}`);
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 重新建立现有连接
async function reconnectExistingConnection(connection) {
    try {
        showLoading('正在重新建立连接...');

        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: connection.type,
                config: connection.config
            })
        });

        const result = await response.json();

        if (result.success) {
            // 更新连接ID
            connection.id = result.connectionId;
            connection.lastConnected = new Date().toISOString();

            // 更新当前连接ID
            currentConnectionId = result.connectionId;

            // 保存到本地存储
            localStorage.setItem('savedConnections', JSON.stringify(connections));

            // 更新UI
            updateConnectionList();
            updateConnectionSelectors();
            $('#currentConnection').val(result.connectionId);

            showSuccessMessage('连接重新建立成功！');
            return result;
        } else {
            showErrorMessage('重新连接失败：' + result.error);
            return { success: false, error: result.error };
        }
    } catch (error) {
        showErrorMessage('重新连接失败：' + error.message);
        return { success: false, error: error.message };
    } finally {
        hideLoading();
    }
}

// 选择连接
async function selectConnection(connectionId) {
    currentConnectionId = connectionId;

    // 更新连接的最后连接时间
    const connection = connections.find(c => c.id === connectionId);
    if (connection) {
        connection.lastConnected = new Date().toISOString();
        localStorage.setItem('savedConnections', JSON.stringify(connections));
    }

    // 更新UI
    updateConnectionList();
    updateConnectionSelectors();

    // 根据连接类型切换编辑器模式
    if (connection) {
        switchEditorMode(connection.type);
    }

    // 暂时禁用数据库缓存更新以排查连接切换问题
    // if (typeof updateDatabaseCache === 'function') {
    //     setTimeout(() => {
    //         updateDatabaseCache();
    //     }, 1000); // 延迟1秒更新，确保连接已建立
    // }

    // 测试连接状态，如果连接不存在则重新建立连接
    if (connection) {
        try {
            const testResult = await testConnectionStatus(connectionId);
            if (!testResult.success) {
                // 如果连接不存在，尝试重新连接
                await reconnectExistingConnection(connection);
            }
        } catch (error) {
            console.error('连接状态检查失败:', error);
            // 如果测试失败，尝试重新连接
            await reconnectExistingConnection(connection);
        }
    }

    // 加载数据库结构
    await loadDatabaseStructure();

    // 更新数据库选择器（使用loadDatabases函数确保一致性）
    await loadDatabases(connectionId);
}

// 移除连接
async function removeConnection(connectionId, event) {
    event.stopPropagation();

    if (!confirm('确定要删除此连接吗？')) {
        return;
    }

    try {
        // 获取连接信息以获取连接名称
        const connection = connections.find(conn => conn.id === connectionId);
        if (!connection) {
            showErrorMessage('连接不存在');
            return;
        }

        // 先断开连接
        await fetch(`/api/disconnect/${connectionId}`, {
            method: 'DELETE'
        });

        // 从服务器删除数据源（使用连接ID）
        console.log('🗑️ [DEBUG] 尝试删除数据源，connectionId:', connectionId);
        const deleteResponse = await fetch(`/api/datasources/id/${connectionId}`, {
            method: 'DELETE'
        });

        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.error('❌ [DEBUG] 删除数据源失败:', {
                status: deleteResponse.status,
                error: errorText,
                connectionId: connectionId
            });
            throw new Error(`删除服务器数据源失败 (${deleteResponse.status}): ${errorText}`);
        }

        const deleteResult = await deleteResponse.json();
        if (!deleteResult.success) {
            console.error('删除数据源返回错误:', deleteResult);
            throw new Error(deleteResult.error || '删除数据源失败');
        }

        // 从连接列表中移除
        connections = connections.filter(conn => conn.id !== connectionId);

        // 保存到本地存储
        localStorage.setItem('savedConnections', JSON.stringify(connections));

        if (currentConnectionId === connectionId) {
            currentConnectionId = null;
        }

        updateConnectionList();
        updateConnectionSelectors();
        showSuccessMessage('连接已删除');
    } catch (error) {
        showErrorMessage('删除连接失败：' + error.message);
    }
}

// 加载数据库结构
async function loadDatabaseStructure() {
    if (!currentConnectionId) {
        $('#databaseExplorer').html('<div class="text-muted text-center">请先连接数据库</div>');
        return;
    }

    try {
        const response = await fetch(`/api/structure/${currentConnectionId}`);
        const result = await response.json();

        if (result.success) {
            renderDatabaseStructure(result.data);
            updateTableSelectors(result.data);
        } else {
            showErrorMessage(result.error);
        }
    } catch (error) {
        showErrorMessage('加载数据库结构失败：' + error.message);
    }
}

// 渲染数据库结构
function renderDatabaseStructure(data) {
    const container = $('#databaseExplorer');

    if (!data || data.length === 0) {
        container.html('<div class="text-muted text-center">暂无数据</div>');
        return;
    }

    let html = '';
    data.forEach(db => {
        html += `
            <div class="database-item" onclick="selectDatabase('${db.name}')">
                <i class="fas fa-database"></i> ${db.name}
            </div>
        `;

        if (db.tables) {
            db.tables.forEach(table => {
                html += `
                    <div class="table-item" onclick="selectTable('${db.name}', '${table}')">
                        <i class="fas fa-table"></i> ${table}
                    </div>
                `;
            });
        }
    });

    container.html(html);
}

// 更新表选择器
function updateTableSelectors(data) {
    const selectors = ['#tableSelector', '#structureTableSelector', '#exportSourceTable'];

    selectors.forEach(selector => {
        const element = $(selector);
        element.html('<option value="">选择表</option>');

        if (data) {
            data.forEach(db => {
                if (db.tables) {
                    const optgroup = `<optgroup label="${db.name}">`;
                    let options = '';

                    db.tables.forEach(table => {
                        options += `<option value="${db.name}.${table}">${table}</option>`;
                    });

                    element.append(optgroup + options + '</optgroup>');
                }
            });
        }
    });
}

// 更新连接选择器
function updateConnectionSelectors() {
    const selector = $('#currentConnection');
    const currentValue = selector.val(); // 保存当前值

    selector.html('<option value="">选择数据库连接</option>');

    connections.forEach(connection => {
        const statusIcon = connection.status === 'connected' ? '🟢' : '🔴';
        selector.append(`<option value="${connection.id}">${statusIcon} ${connection.name}</option>`);
    });

    // 优先恢复之前的值
    if (currentValue && connections.some(conn => conn.id === currentValue)) {
        selector.val(currentValue);
        console.log(`🔄 [DEBUG] 恢复连接选择器到之前的值: ${connections.find(conn => conn.id === currentValue)?.name}`);
    } else if (currentConnectionId && connections.some(conn => conn.id === currentConnectionId)) {
        selector.val(currentConnectionId);
        console.log(`🔄 [DEBUG] 更新连接选择器，当前选择: ${connections.find(conn => conn.id === currentConnectionId)?.name}`);
    } else {
        // 只有在完全没有当前连接时才设置默认值
        const mysqlConnection = connections.find(conn => conn.type === 'mysql');
        if (mysqlConnection) {
            selector.val(mysqlConnection.id);
            currentConnectionId = mysqlConnection.id;
            console.log(`🔄 [DEBUG] 设置默认连接为MySQL: ${mysqlConnection.name}`);
            // 自动加载数据库结构
            setTimeout(() => {
                console.log('🔄 [DEBUG] 自动加载数据库结构...');
                loadDatabaseStructure();
            }, 100);
        } else if (connections.length > 0) {
            selector.val(connections[0].id);
            currentConnectionId = connections[0].id;
            console.log(`🔄 [DEBUG] 设置默认连接为第一个: ${connections[0].name}`);
            // 自动加载数据库结构
            setTimeout(() => {
                console.log('🔄 [DEBUG] 自动加载数据库结构...');
                loadDatabaseStructure();
            }, 100);
        }
    }
}

// 执行查询
async function executeQuery() {
    const connectionId = $('#currentConnection').val();
    const currentDatabase = $('#currentDatabase').val();
    const sql = sqlEditor ? sqlEditor.getValue() : $('#sqlEditor').val();

    if (!connectionId || !sql.trim()) {
        showErrorMessage('请选择连接并输入SQL语句');
        return;
    }

    // 检查是否为 Redis 连接
    const connection = connections.find(conn => conn.id === connectionId);
    const isRedis = connection && (connection.type === 'redis');

    // Redis 连接不需要选择数据库
    if (!isRedis && !currentDatabase) {
        showErrorMessage('请先选择一个数据库', 'warning');
        return;
    }

    try {
        showLoading('正在执行查询...');
        const startTime = performance.now();

        // 非Redis连接且没有指定数据库名时，自动添加USE语句
        let finalSql = sql;
        if (!isRedis && !sql.toLowerCase().includes('use ') && currentDatabase) {
            finalSql = `USE \`${currentDatabase}\`;\n${sql}`;
        }

        const response = await fetch(`/api/query/${connectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: finalSql,
                params: getParameters()
            })
        });

        const result = await response.json();
        const endTime = performance.now();
        const executionTime = Math.round(endTime - startTime);

        // 添加到查询历史
        addQueryHistory(sql, connectionId, currentDatabase, executionTime, (result.meta && result.meta.affectedRows) || 0);

        if (result.success) {
            // 根据连接类型选择显示方式
            if (isRedis) {
                displayRedisResults(result.data, result.meta);
            } else {
                displayQueryResults(result.data, result.meta);
            }
        } else {
            displayQueryError(result);
        }
    } catch (error) {
        showErrorMessage('执行查询失败：' + error.message);
    } finally {
        hideLoading();
    }
}

// 显示查询结果
function displayQueryResults(data, meta) {
    const container = $('#queryResults');
    const card = $('#queryResultsCard');

    if (data.length === 0) {
        container.html('<div class="text-muted text-center">查询结果为空</div>');
        card.show();
        return;
    }

    // 构建表格
    const columns = Object.keys(data[0]);
    let tableHTML = `
        <div class="query-meta">
            <span class="query-meta-item"><strong>行数:</strong> ${meta.rowLength}</span>
            <span class="query-meta-item"><strong>影响行数:</strong> ${meta.affectedRows}</span>
            <span class="query-meta-item"><strong>执行时间:</strong> ${meta.executionTime}ms</span>
        </div>
        <table class="table table-striped table-hover" id="queryResultsTable">
            <thead>
                <tr>
    `;

    columns.forEach(col => {
        tableHTML += `<th class="sortable-column" data-column="${col}" title="点击排序">
                        ${col}
                        <span class="sort-indicator"></span>
                      </th>`;
    });

    tableHTML += `
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(row => {
        tableHTML += '<tr>';
        columns.forEach(col => {
            const value = row[col];
            tableHTML += `<td>${value !== null ? value : '<em>NULL</em>'}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    container.html(tableHTML);
    card.show();

    // 初始化DataTables
    if (dataTable) {
        dataTable.destroy();
    }

    dataTable = $('#queryResultsTable').DataTable({
        responsive: true,
        pageLength: 50,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "全部"]]
    });
}

// 显示查询错误
function displayQueryError(result) {
    const container = $('#queryResults');
    const card = $('#queryResultsCard');

    container.html(`
        <div class="error-message">
            <strong>查询执行失败</strong>
            <div>${result.error}</div>
            ${result.sql ? `<pre>SQL: ${result.sql}</pre>` : ''}
        </div>
    `);

    card.show();
}

// 显示Redis查询结果
function displayRedisResults(data, meta) {
    const container = $('#queryResults');
    const card = $('#queryResultsCard');

    // 注入Redis样式
    injectRedisStyles();

    if (!data || data.length === 0) {
        container.html('<div class="text-muted text-center">Redis查询结果为空</div>');
        card.show();
        return;
    }

    let resultHtml = '';

    // 处理Redis多命令结果
    if (Array.isArray(data)) {
        data.forEach((result, index) => {
            if (result.command && result.success !== undefined) {
                resultHtml += displayRedisCommandResult(result, index);
            }
        });
    } else if (data.command && data.success !== undefined) {
        // 单命令结果
        resultHtml = displayRedisCommandResult(data, 0);
    } else {
        // 其他格式的数据
        resultHtml = `
            <div class="alert alert-info">
                <h6><i class="fas fa-info-circle me-2"></i>Redis查询结果</h6>
                <pre class="mb-0">${JSON.stringify(data, null, 2)}</pre>
            </div>
        `;
    }

    // 添加执行信息
    if (meta) {
        resultHtml = `
            <div class="query-meta mb-3">
                <span class="query-meta-item"><strong>执行时间:</strong> ${meta.executionTime || 0}ms</span>
                <span class="query-meta-item"><strong>命令数:</strong> ${Array.isArray(data) ? data.length : 1}</span>
            </div>
        ` + resultHtml;
    }

    container.html(resultHtml);
    card.show();
}

// 显示单个Redis命令结果
function displayRedisCommandResult(result, index) {
    if (!result.success) {
        return `
            <div class="alert alert-danger mb-3">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>${result.command.toUpperCase()} 命令执行失败:</strong> ${result.error}
            </div>
        `;
    }

    let commandHtml = '';

    switch (result.command.toLowerCase()) {
        case 'keys':
            commandHtml = displayRedisKeysResult(result);
            break;
        case 'get':
        case 'hgetall':
        case 'type':
        case 'ttl':
            commandHtml = displayRedisValueResult(result);
            break;
        default:
            commandHtml = displayGenericRedisResult(result);
    }

    return commandHtml;
}

// 显示Redis Keys命令结果
function displayRedisKeysResult(result) {
    if (!Array.isArray(result.data) || result.data.length === 0) {
        return `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Keys命令返回空结果
            </div>
        `;
    }

    return `
        <div class="mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="text-primary mb-0">
                    <i class="fas fa-key me-2"></i>
                    Keys 命令结果
                </h6>
                <span class="badge bg-primary">${result.data.length} 个键</span>
            </div>
            <div class="redis-keys-container">
                <div class="row g-2">
                    ${result.data.map(key => `
                        <div class="col-12 col-md-6 col-lg-4 col-xl-3">
                            <div class="redis-key-card">
                                <div class="d-flex align-items-center">
                                    <i class="fas fa-key text-warning me-2"></i>
                                    <div class="flex-grow-1">
                                        <div class="redis-key-name">${escapeHtml(key)}</div>
                                        <small class="text-muted">${analyzeKeyPattern(key)}</small>
                                    </div>
                                    <div class="redis-key-actions">
                                        <button class="btn btn-sm btn-outline-primary" onclick="inspectRedisKey('${escapeHtml(key)}')" title="查看详情">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger" onclick="deleteRedisKey('${escapeHtml(key)}')" title="删除">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// 显示Redis值结果
function displayRedisValueResult(result) {
    const value = typeof result.data === 'object' ? JSON.stringify(result.data, null, 2) : result.data;

    return `
        <div class="mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="text-success mb-0">
                    <i class="fas fa-database me-2"></i>
                    ${result.command.toUpperCase()} 命令结果
                </h6>
                <span class="badge bg-success">${result.command}</span>
            </div>
            <div class="redis-value-container">
                <pre class="redis-value-content">${escapeHtml(value)}</pre>
            </div>
        </div>
    `;
}

// 显示通用Redis结果
function displayGenericRedisResult(result) {
    const value = typeof result.data === 'object' ? JSON.stringify(result.data, null, 2) : result.data;

    return `
        <div class="mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="text-info mb-0">
                    <i class="fas fa-cog me-2"></i>
                    ${result.command.toUpperCase()} 命令结果
                </h6>
                <span class="badge bg-info">${result.command}</span>
            </div>
            <div class="redis-generic-container">
                <pre class="redis-generic-content">${escapeHtml(value)}</pre>
            </div>
        </div>
    `;
}

// 注入Redis样式
function injectRedisStyles() {
    if (document.getElementById('redis-styles')) return;

    const style = document.createElement('style');
    style.id = 'redis-styles';
    style.textContent = `
        .redis-keys-container {
            max-height: 600px;
            overflow-y: auto;
        }
        .redis-key-card {
            background: #ffffff;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 8px;
            transition: all 0.2s ease;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .redis-key-card:hover {
            border-color: #0d6efd;
            box-shadow: 0 2px 8px rgba(13, 110, 253, 0.15);
            transform: translateY(-1px);
        }
        .redis-key-name {
            font-weight: 600;
            color: #495057;
            word-break: break-all;
        }
        .redis-key-actions {
            display: flex;
            gap: 4px;
        }
        .redis-value-container,
        .redis-generic-container {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 16px;
        }
        .redis-value-content,
        .redis-generic-content {
            margin: 0;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-all;
        }
    `;
    document.head.appendChild(style);
}

// 分析键模式
function analyzeKeyPattern(key) {
    if (key.includes(':')) {
        const parts = key.split(':');
        return `类型: ${parts[0]} | 子类型: ${parts.slice(1).join(':')}`;
    }
    if (key.includes('_')) {
        const parts = key.split('_');
        return `前缀: ${parts[0]} | 后缀: ${parts.slice(1).join('_')}`;
    }
    return '简单键名';
}

// 转义HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 查看Redis键详情
function inspectRedisKey(key) {
    const connectionId = $('#currentConnection').val();
    if (!connectionId) return;

    showLoading('正在获取键详情...');

    // 首先获取键的类型和TTL
    const typeCommand = `TYPE ${key}`;
    const ttlCommand = `TTL ${key}`;

    Promise.all([
        fetch(`/api/query/${connectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: typeCommand, params: {} })
        }).then(res => res.json()),
        fetch(`/api/query/${connectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: ttlCommand, params: {} })
        }).then(res => res.json())
    ]).then(results => {
        const typeResult = results[0];
        const ttlResult = results[1];

        // 处理结果数据
        const type = typeResult.success && typeResult.data[0]?.data ? typeResult.data[0].data : 'unknown';
        const ttl = ttlResult.success && ttlResult.data[0]?.data !== undefined ? ttlResult.data[0].data : -1;

        // 根据类型选择获取值的命令
        let valueCommand = `GET ${key}`;
        switch (type.toLowerCase()) {
            case 'hash':
                valueCommand = `HGETALL ${key}`;
                break;
            case 'list':
                valueCommand = `LRANGE ${key} 0 -1`;
                break;
            case 'set':
                valueCommand = `SMEMBERS ${key}`;
                break;
            case 'zset':
                valueCommand = `ZRANGE ${key} 0 -1 WITHSCORES`;
                break;
            default:
                valueCommand = `GET ${key}`;
        }

        // 执行获取值的命令
        return fetch(`/api/query/${connectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: valueCommand, params: {} })
        }).then(res => res.json()).then(valueResult => {
            hideLoading();
            const value = valueResult.success && valueResult.data[0]?.data !== undefined ? valueResult.data[0].data : null;

            // 创建模态框HTML，传递类型信息
            createRedisKeyModal(key, type, ttl, value);
        });
    }).catch(error => {
        hideLoading();
        showErrorMessage('获取键详情失败: ' + error.message);
    });
}

// 创建Redis键详情模态框
function createRedisKeyModal(key, type, ttl, value) {
    // 移除已存在的模态框
    $('#redisKeyModal').remove();

    // TTL格式化
    let ttlDisplay = '永久';
    if (ttl > 0) {
        const days = Math.floor(ttl / 86400);
        const hours = Math.floor((ttl % 86400) / 3600);
        const minutes = Math.floor((ttl % 3600) / 60);
        const seconds = ttl % 60;

        if (days > 0) ttlDisplay = `${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`;
        else if (hours > 0) ttlDisplay = `${hours}小时 ${minutes}分钟 ${seconds}秒`;
        else if (minutes > 0) ttlDisplay = `${minutes}分钟 ${seconds}秒`;
        else ttlDisplay = `${seconds}秒`;
    } else if (ttl === -1) {
        ttlDisplay = '永久';
    } else if (ttl === -2) {
        ttlDisplay = '键不存在';
    }

    // 类型图标
    const typeIcons = {
        'string': 'fa-font',
        'hash': 'fa-hashtag',
        'list': 'fa-list',
        'set': 'fa-layer-group',
        'zset': 'fa-sort-amount-down',
        'stream': 'fa-stream'
    };
    const typeIcon = typeIcons[type] || 'fa-database';

    // 值显示 - 根据类型格式化
    let valueDisplay = '';
    if (value === null) {
        valueDisplay = '<em class="text-muted">null</em>';
    } else {
        switch (type.toLowerCase()) {
            case 'hash':
                // Hash类型：将对象转换为字段-值对的表格
                let hashData = value;

                // 如果value是字符串，尝试解析为对象或数组
                if (typeof value === 'string') {
                    try {
                        hashData = JSON.parse(value);
                    } catch (e) {
                        // 解析失败，显示原始值
                        valueDisplay = `<pre class="mb-0">${escapeHtml(value)}</pre>`;
                        break;
                    }
                }

                // HGETALL返回的是对象，但可能被字符串化为数组格式
                let hashObject = hashData;

                // 如果是数组格式，转换为对象
                if (Array.isArray(hashData) && hashData.length > 0) {
                    hashObject = {};
                    for (let i = 0; i < hashData.length; i += 2) {
                        if (i + 1 < hashData.length) {
                            hashObject[hashData[i]] = hashData[i + 1];
                        }
                    }
                }

                // 现在hashObject应该是对象格式
                if (typeof hashObject === 'object' && hashObject !== null && Object.keys(hashObject).length > 0) {
                    let hashTable = `
                        <div class="hash-table-container">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th>字段</th>
                                        <th>值</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;
                    Object.entries(hashObject).forEach(([field, val]) => {
                        hashTable += `
                            <tr>
                                <td><strong>${escapeHtml(field)}</strong></td>
                                <td>${escapeHtml(val)}</td>
                            </tr>
                        `;
                    });
                    hashTable += `
                                </tbody>
                            </table>
                        </div>
                    `;
                    valueDisplay = hashTable;
                } else {
                    valueDisplay = '<em class="text-muted">空hash</em>';
                }
                break;

            case 'list':
                // List类型：显示为带索引的列表
                let listArray = value;

                // 如果value是字符串，尝试解析为数组
                if (typeof value === 'string') {
                    try {
                        listArray = JSON.parse(value);
                    } catch (e) {
                        // 解析失败，显示原始值
                        valueDisplay = `<pre class="mb-0">${escapeHtml(value)}</pre>`;
                        break;
                    }
                }

                if (Array.isArray(listArray) && listArray.length > 0) {
                    let listHtml = '<div class="list-container">';
                    listArray.forEach((item, index) => {
                        listHtml += `
                            <div class="list-item">
                                <span class="list-index">${index}:</span>
                                <span class="list-value">${escapeHtml(item)}</span>
                            </div>
                        `;
                    });
                    listHtml += '</div>';
                    valueDisplay = listHtml;
                } else {
                    valueDisplay = '<em class="text-muted">空list</em>';
                }
                break;

            case 'set':
                // Set类型：显示为无序集合
                let setArray = value;

                // 如果value是字符串，尝试解析为数组
                if (typeof value === 'string') {
                    try {
                        setArray = JSON.parse(value);
                    } catch (e) {
                        // 解析失败，显示原始值
                        valueDisplay = `<pre class="mb-0">${escapeHtml(value)}</pre>`;
                        break;
                    }
                }

                if (Array.isArray(setArray) && setArray.length > 0) {
                    let setHtml = '<div class="set-container">';
                    setArray.forEach(item => {
                        setHtml += `
                            <div class="set-item">
                                <i class="fas fa-circle text-primary me-2" style="font-size: 8px;"></i>
                                ${escapeHtml(item)}
                            </div>
                        `;
                    });
                    setHtml += '</div>';
                    valueDisplay = setHtml;
                } else {
                    valueDisplay = '<em class="text-muted">空set</em>';
                }
                break;

            case 'zset':
                // ZSet类型：显示为带分数的有序集合
                let zsetArray = value;

                // 如果value是字符串，尝试解析为数组
                if (typeof value === 'string') {
                    try {
                        zsetArray = JSON.parse(value);
                    } catch (e) {
                        // 解析失败，显示原始值
                        valueDisplay = `<pre class="mb-0">${escapeHtml(value)}</pre>`;
                        break;
                    }
                }

                if (Array.isArray(zsetArray) && zsetArray.length > 0) {
                    let zsetHtml = '<div class="zset-container">';
                    for (let i = 0; i < zsetArray.length; i += 2) {
                        if (i + 1 < zsetArray.length) {
                            const member = escapeHtml(zsetArray[i]);
                            const score = escapeHtml(zsetArray[i + 1]);
                            zsetHtml += `
                                <div class="zset-item">
                                    <span class="zset-score">${score}:</span>
                                    <span class="zset-member">${member}</span>
                                </div>
                            `;
                        }
                    }
                    zsetHtml += '</div>';
                    valueDisplay = zsetHtml;
                } else {
                    valueDisplay = '<em class="text-muted">空zset</em>';
                }
                break;

            default:
                // 其他类型：默认显示
                if (typeof value === 'object') {
                    valueDisplay = `<pre class="mb-0">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
                } else {
                    valueDisplay = `<pre class="mb-0">${escapeHtml(value)}</pre>`;
                }
        }
    }

    const modalHtml = `
        <div class="modal fade" id="redisKeyModal" tabindex="-1" aria-labelledby="redisKeyModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title" id="redisKeyModalLabel">
                            <i class="${typeIcon} me-2"></i>
                            Redis 键详情
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="redis-key-info">
                            <h6 class="text-primary mb-3">
                                <i class="fas fa-key me-2"></i>
                                ${escapeHtml(key)}
                            </h6>

                            <div class="row">
                                <div class="col-md-6">
                                    <div class="info-card">
                                        <div class="info-label">数据类型</div>
                                        <div class="info-value">
                                            <span class="badge bg-info text-uppercase">${type}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="info-card">
                                        <div class="info-label">过期时间</div>
                                        <div class="info-value">${ttlDisplay}</div>
                                    </div>
                                </div>
                            </div>

                            <div class="mt-4">
                                <div class="info-label">键值</div>
                                <div class="value-container bg-light border rounded p-3">
                                    ${valueDisplay}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        <button type="button" class="btn btn-outline-danger" onclick="deleteRedisKey('${escapeHtml(key)}'); $('#redisKeyModal').modal('hide');">
                            <i class="fas fa-trash me-1"></i>
                            删除键
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 添加模态框到页面
    $('body').append(modalHtml);

    // 添加模态框样式
    if (!$('#redis-modal-styles').length) {
        const style = document.createElement('style');
        style.id = 'redis-modal-styles';
        style.textContent = `
            .info-card {
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            }
            .info-label {
                font-weight: 600;
                color: #6c757d;
                font-size: 14px;
                margin-bottom: 8px;
            }
            .info-value {
                font-size: 16px;
                color: #495057;
            }
            .value-container {
                max-height: 400px;
                overflow-y: auto;
            }
            .value-container pre {
                margin: 0;
                font-family: 'Courier New', monospace;
                font-size: 14px;
                line-height: 1.5;
                white-space: pre-wrap;
                word-break: break-all;
            }

            /* Hash类型表格样式 */
            .hash-table-container {
                border: 1px solid #dee2e6;
                border-radius: 6px;
                overflow: hidden;
            }
            .hash-table-container table {
                margin: 0;
            }
            .hash-table-container th {
                background: #e9ecef;
                font-weight: 600;
                font-size: 14px;
            }

            /* List类型样式 */
            .list-container {
                border: 1px solid #dee2e6;
                border-radius: 6px;
                padding: 12px;
                background: #f8f9fa;
            }
            .list-item {
                display: flex;
                align-items: center;
                padding: 6px 0;
                border-bottom: 1px solid #e9ecef;
            }
            .list-item:last-child {
                border-bottom: none;
            }
            .list-index {
                background: #6c757d;
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                margin-right: 12px;
                min-width: 40px;
                text-align: center;
            }
            .list-value {
                flex: 1;
                font-family: 'Courier New', monospace;
            }

            /* Set类型样式 */
            .set-container {
                border: 1px solid #dee2e6;
                border-radius: 6px;
                padding: 12px;
                background: #f8f9fa;
            }
            .set-item {
                display: flex;
                align-items: center;
                padding: 4px 0;
                font-family: 'Courier New', monospace;
            }

            /* ZSet类型样式 */
            .zset-container {
                border: 1px solid #dee2e6;
                border-radius: 6px;
                padding: 12px;
                background: #f8f9fa;
            }
            .zset-item {
                display: flex;
                align-items: center;
                padding: 6px 0;
                border-bottom: 1px solid #e9ecef;
            }
            .zset-item:last-child {
                border-bottom: none;
            }
            .zset-score {
                background: #0d6efd;
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                margin-right: 12px;
                min-width: 50px;
                text-align: center;
            }
            .zset-member {
                flex: 1;
                font-family: 'Courier New', monospace;
            }
        `;
        document.head.appendChild(style);
    }

    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById('redisKeyModal'));
    modal.show();
}

// 删除Redis键
function deleteRedisKey(key) {
    if (!confirm(`确定要删除键 "${key}" 吗？`)) return;

    const connectionId = $('#currentConnection').val();
    if (!connectionId) return;

    fetch(`/api/query/${connectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: `DEL ${key}`, params: {} })
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            alert(`键 "${key}" 已删除`);
            // 重新执行当前查询
            executeQuery();
        } else {
            alert('删除失败: ' + result.error);
        }
    });
}

// 获取参数
function getParameters() {
    const params = {};
    $('#parametersContainer .input-group').each(function() {
        const name = $(this).find('input:first').val();
        const value = $(this).find('input:last').val();
        if (name) {
            params[name] = value;
        }
    });
    return params;
}

// 添加参数
function addParameter() {
    const container = $('#parametersContainer');
    const html = `
        <div class="input-group mb-2">
            <span class="input-group-text">参数</span>
            <input type="text" class="form-control" placeholder="参数名">
            <span class="input-group-text">值</span>
            <input type="text" class="form-control" placeholder="参数值">
            <button class="btn btn-outline-danger" onclick="removeParameter(this)">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    container.append(html);
}

// 移除参数
function removeParameter(button) {
    $(button).closest('.input-group').remove();
}

// 格式化SQL
function formatSQL() {
    const sql = sqlEditor ? sqlEditor.getValue() : $('#sqlEditor').val();
    if (!sql.trim()) return;

    // 简单的SQL格式化
    const formatted = sql
        .toUpperCase()
        .replace(/\bSELECT\b/g, 'SELECT')
        .replace(/\bFROM\b/g, '\nFROM')
        .replace(/\bWHERE\b/g, '\nWHERE')
        .replace(/\bGROUP BY\b/g, '\nGROUP BY')
        .replace(/\bORDER BY\b/g, '\nORDER BY')
        .replace(/\bHAVING\b/g, '\nHAVING')
        .replace(/\bLIMIT\b/g, '\nLIMIT');

    if (sqlEditor) {
        sqlEditor.setValue(formatted);
    } else {
        $('#sqlEditor').val(formatted);
    }
}

// 加载表数据
async function loadTableData() {
    const tableSelector = $('#tableSelector').val();
    if (!tableSelector) return;

    const [database, table] = tableSelector.split('.');

    try {
        showLoading('正在加载数据...');

        const response = await fetch(`/api/data/${currentConnectionId}/${database}/${table}`);
        const result = await response.json();

        if (result.success) {
            displayTableData(result.data);
        } else {
            showErrorMessage(result.error);
        }
    } catch (error) {
        showErrorMessage('加载表数据失败：' + error.message);
    } finally {
        hideLoading();
    }
}

// 显示表数据
function displayTableData(data) {
    const container = $('#dataTableContainer');

    if (!data.rows || data.rows.length === 0) {
        container.html('<div class="text-muted text-center">暂无数据</div>');
        return;
    }

    // 保存当前表数据到全局变量，用于编辑
    currentTableData = data;
    const columns = Object.keys(data.rows[0]);

    let tableHTML = `
        <table class="table table-striped table-hover" id="dataTable">
            <thead>
                <tr>
    `;

    columns.forEach(col => {
        tableHTML += `<th class="sortable-column" data-column="${col}" title="点击排序">
                        ${col}
                        <span class="sort-indicator"></span>
                      </th>`;
    });

    tableHTML += `
                </tr>
            </thead>
            <tbody>
    `;

    data.rows.forEach((row, rowIndex) => {
        tableHTML += `<tr data-row-index="${rowIndex}">`;
        columns.forEach(col => {
            const value = row[col];
            const displayValue = value !== null ? value : '<em>NULL</em>';

            // 系统字段不可编辑
            const systemFields = ['id', 'created_at', 'updated_at', 'created_by', 'updated_by'];
            const isEditable = !systemFields.includes(col.toLowerCase());

            tableHTML += `<td data-column="${col}" data-row-index="${rowIndex}"
                             class="${isEditable ? 'editable-cell' : ''}"
                             style="${isEditable ? 'cursor: pointer;' : 'cursor: default; background-color: #f8f9fa;'}"
                             title="${isEditable ? '双击编辑' : '系统字段不可编辑'}">${displayValue}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += `
            </tbody>
        </table>
        <div class="text-muted">
            共 ${data.pagination.total} 条记录，第 ${data.pagination.page}/${data.pagination.totalPages} 页
        </div>
    `;

    container.html(tableHTML);

    // 绑定双击编辑事件
    bindInlineEditEvents();

    // 绑定列排序事件
    bindColumnSortEvents();

    // 初始化DataTables
    if (dataTable) {
        dataTable.destroy();
    }
    dataTable = $('#dataTable').DataTable({
        responsive: true,
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "全部"]]
    });
}

// 搜索功能
function performSearch() {
    const searchTerm = $('#searchInput').val().toLowerCase();
    if (!dataTable) return;

    dataTable.search(searchTerm).draw();
}

// 显示创建表模态框
function showCreateTableModal() {
    $('#createTableModal').modal('show');
}

// 添加列
function addColumn() {
    const container = $('#columnsContainer');
    const html = `
        <div class="column-definition row mb-2">
            <div class="col-md-3">
                <input type="text" class="form-control" placeholder="列名" required>
            </div>
            <div class="col-md-2">
                <select class="form-select">
                    <option value="VARCHAR">VARCHAR</option>
                    <option value="INT">INT</option>
                    <option value="TEXT">TEXT</option>
                    <option value="DATE">DATE</option>
                    <option value="DATETIME">DATETIME</option>
                </select>
            </div>
            <div class="col-md-2">
                <input type="text" class="form-control" placeholder="长度">
            </div>
            <div class="col-md-2">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="nullableCheck">
                    <label class="form-check-label" for="nullableCheck">可空</label>
                </div>
            </div>
            <div class="col-md-2">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="primaryKeyCheck">
                    <label class="form-check-label" for="primaryKeyCheck">主键</label>
                </div>
            </div>
            <div class="col-md-1">
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeColumn(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    container.append(html);
}

// 移除列
function removeColumn(button) {
    $(button).closest('.column-definition').remove();
}

// 创建表
async function createTable() {
    const tableName = $('#newTableName').val();
    const columns = [];

    $('#columnsContainer .column-definition').each(function() {
        const col = $(this);
        columns.push({
            name: col.find('input:first').val(),
            type: col.find('select').val(),
            length: col.find('input:eq(1)').val(),
            nullable: col.find('#nullableCheck').is(':checked'),
            primaryKey: col.find('#primaryKeyCheck').is(':checked')
        });
    });

    if (!tableName || columns.length === 0) {
        showErrorMessage('请填写表名和列定义');
        return;
    }

    try {
        showLoading('正在创建表...');

        const response = await fetch(`/api/table/${currentConnectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                database: $('#currentConnection option:selected').text(),
                tableName: tableName,
                columns: columns
            })
        });

        const result = await response.json();

        if (result.success) {
            $('#createTableModal').modal('hide');
            showSuccessMessage(result.message);
            loadDatabaseStructure();
        } else {
            showErrorMessage(result.error);
        }
    } catch (error) {
        showErrorMessage('创建表失败：' + error.message);
    } finally {
        hideLoading();
    }
}

// 导出查询结果
function exportResults(format) {
    if (!dataTable) return;

    const data = dataTable.data().toArray();
    const columns = dataTable.columns().header().toArray().map(th => th.textContent);

    let content = '';

    if (format === 'csv') {
        content = columns.join(',') + '\n';
        data.forEach(row => {
            content += row.map(cell => `"${cell}"`).join(',') + '\n';
        });
    } else {
        content = JSON.stringify(data.map((row, i) => {
            const obj = {};
            columns.forEach((col, j) => {
                obj[col] = row[j];
            });
            return obj;
        }), null, 2);
    }

    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// 显示成功消息
function showSuccessMessage(message) {
    const html = `
        <div class="success-message alert alert-success alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    $('body').append(html);

    setTimeout(() => {
        $('.alert-success').alert('close');
    }, 3000);
}

// 显示错误消息
function showErrorMessage(message) {
    const html = `
        <div class="error-message alert alert-danger alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    $('body').append(html);

    setTimeout(() => {
        $('.alert-danger').alert('close');
    }, 5000);
}

// 显示加载状态
function showLoading(text = '处理中...') {
    const html = `
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <div class="loading-text">${text}</div>
        </div>
    `;
    $('body').append(html);
}

// 隐藏加载状态
function hideLoading() {
    $('.loading-overlay').remove();
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 选择数据库
function selectDatabase(databaseName) {
    console.log('Selected database:', databaseName);

    // 更新当前数据库选择器
    $('#currentDatabase').val(databaseName);

    // 高亮选中的数据库
    $('.database-item').removeClass('active');
    $(`.database-item:contains('${databaseName}')`).addClass('active');

    showNotification(`已选择数据库: ${databaseName}`, 'success');
}

// 选择表
function selectTable(databaseName, tableName) {
    console.log('Selected table:', databaseName, tableName);
    // 可以在这里添加表选择逻辑
}

// 显示设置
function showSettings() {
    alert('设置功能正在开发中');
}

// 测试函数
function testTableStructureFunction() {
    console.log('测试函数工作正常');
    alert('测试函数工作正常');
}

// 表结构选择器变更处理
function onStructureTableChange() {
    console.log('onStructureTableChange 函数被调用');
    const selectedTable = $('#structureTableSelector').val();
    const loadBtn = $('#loadStructureBtn');
    console.log('选择的表:', selectedTable);

    if (selectedTable) {
        loadBtn.prop('disabled', false);
        loadBtn.html('<i class="fas fa-search"></i> 查看表结构');
        console.log('按钮已启用');
    } else {
        loadBtn.prop('disabled', true);
        loadBtn.html('<i class="fas fa-search"></i> 查看表结构');
        console.log('按钮已禁用');
    }
}

// 加载表结构（手动查询）
async function loadSelectedTableStructure() {
    console.log('loadSelectedTableStructure 函数被调用');
    const tableSelector = $('#structureTableSelector').val();
    console.log('选择的表:', tableSelector);
    console.log('当前连接ID:', currentConnectionId);

    if (!tableSelector) {
        showErrorMessage('请先选择要查看的表');
        return;
    }

    const [database, table] = tableSelector.split('.');

    try {
        showLoading('正在加载表结构...');

        // 禁用按钮防止重复点击
        $('#loadStructureBtn').prop('disabled', true);
        $('#loadStructureBtn').html('<i class="fas fa-spinner fa-spin"></i> 加载中...');

        const response = await fetch(`/api/structure/${currentConnectionId}/${database}/${table}`);
        const result = await response.json();

        if (result.success) {
            displayTableStructure(result.data);
            showSuccessMessage(`成功加载表 ${table} 的结构信息`);
        } else {
            showErrorMessage(result.error);
        }
    } catch (error) {
        showErrorMessage('加载表结构失败：' + error.message);
    } finally {
        hideLoading();
        // 恢复按钮状态
        $('#loadStructureBtn').prop('disabled', false);
        $('#loadStructureBtn').html('<i class="fas fa-search"></i> 查看表结构');
    }
}

// 加载表结构（自动加载）
async function loadTableStructure() {
    const tableSelector = $('#structureTableSelector').val();
    if (!tableSelector) return;

    const [database, table] = tableSelector.split('.');

    try {
        showLoading('正在加载表结构...');

        const response = await fetch(`/api/structure/${currentConnectionId}/${database}/${table}`);
        const result = await response.json();

        if (result.success) {
            displayTableStructure(result.data);
        } else {
            showErrorMessage(result.error);
        }
    } catch (error) {
        showErrorMessage('加载表结构失败：' + error.message);
    } finally {
        hideLoading();
    }
}

// 显示表结构
function displayTableStructure(data) {
    const container = $('#tableStructureContainer');

    let html = '';

    console.log('displayTableStructure 被调用，数据:', data);

    if (!data.columns || data.columns.length === 0) {
        console.log('没有找到列信息或列为空数组');
        container.html('<div class="alert alert-warning">没有找到表结构信息</div>');
        return;
    }

    // 显示基本信息
    html += `
        <div class="alert alert-info">
            <strong>表结构信息</strong> - 共找到 ${data.columns.length} 个列
        </div>
    `;

    // 显示列信息
    html += `
        <h6><i class="fas fa-columns"></i> 列信息</h6>
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead class="table-light">
                    <tr>
                        <th>列名</th>
                        <th>类型</th>
                        <th>长度</th>
                        <th>可空</th>
                        <th>默认值</th>
                        <th>主键</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.columns.forEach(col => {
        console.log('列数据:', col); // 调试日志

        // MySQL DESCRIBE 返回的字段名
        const isPrimary = col.Key === 'PRI';
        const isNullable = col.Null === 'YES';

        html += `
            <tr>
                <td><strong>${col.Field || col.column_name || col.name}</strong></td>
                <td><code>${col.Type || col.data_type || col.type}</code></td>
                <td>${extractLengthFromType(col.Type || col.data_type || col.type) || '-'}</td>
                <td>
                    <span class="badge ${isNullable ? 'bg-success' : 'bg-danger'}">
                        ${isNullable ? '可空' : '非空'}
                    </span>
                </td>
                <td>${col.Default || col.column_default || col.defaultValue || '-'}</td>
                <td>
                    ${isPrimary ? '<span class="badge bg-primary"><i class="fas fa-key"></i> 主键</span>' : '-'}
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    // 显示索引信息
    if (data.indexes && data.indexes.length > 0) {
        html += `
            <h6><i class="fas fa-search"></i> 索引信息</h6>
            <div class="table-responsive">
                <table class="table table-striped table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>索引名</th>
                            <th>类型</th>
                            <th>列</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.indexes.forEach(index => {
            console.log('索引数据:', index); // 调试日志

            // MySQL SHOW INDEX 返回的字段名
            const isUnique = index.Non_unique === 0;
            const indexType = index.Index_type || 'BTREE';

            html += `
                <tr>
                    <td><strong>${index.Key_name || index.index_name || index.name}</strong></td>
                    <td>
                        <span class="badge ${isUnique ? 'bg-warning' : 'bg-info'}">
                            ${isUnique ? 'UNIQUE' : indexType.toUpperCase()}
                        </span>
                    </td>
                    <td>${index.Column_name || index.column_name || index.columns || '-'}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    // 显示外键信息
    if (data.foreignKeys && data.foreignKeys.length > 0) {
        html += `
            <h6><i class="fas fa-link"></i> 外键信息</h6>
            <div class="table-responsive">
                <table class="table table-striped table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>约束名</th>
                            <th>列</th>
                            <th>引用表</th>
                            <th>引用列</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.foreignKeys.forEach(fk => {
            console.log('外键数据:', fk); // 调试日志

            html += `
                <tr>
                    <td><strong>${fk.CONSTRAINT_NAME || fk.name || 'FK'}</strong></td>
                    <td><code>${fk.COLUMN_NAME || fk.column || fk.COLUMN_NAME}</code></td>
                    <td><code>${fk.REFERENCED_TABLE_NAME || fk.referencedTable || fk.REFERENCED_TABLE_NAME}</code></td>
                    <td><code>${fk.REFERENCED_COLUMN_NAME || fk.referencedColumn || fk.REFERENCED_COLUMN_NAME}</code></td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    // 如果没有任何结构信息
    if (!data.columns && !data.indexes && !data.foreignKeys) {
        html += `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                没有找到表结构信息。请确保表存在且有读取权限。
            </div>
        `;
    }

    container.html(html);
}

// 更新导出选项
function updateExportOptions() {
    // 这里可以根据表类型更新导出选项
    console.log('Updating export options...');
}

// ==================== 连接分组管理功能 ====================

// 显示新建分组模态框
function showNewGroupModal() {
    $('#newGroupModal').modal('show');
}

// 保存分组
function saveGroup() {
    const groupName = $('#groupName').val().trim();
    const groupDescription = $('#groupDescription').val().trim();
    const groupColor = $('#groupColor').val();

    if (!groupName) {
        showErrorMessage('请输入分组名称');
        return;
    }

    // 检查分组名称是否已存在
    if (connectionGroups.some(group => group.name === groupName)) {
        showErrorMessage('分组名称已存在');
        return;
    }

    const newGroup = {
        id: 'group_' + Date.now(),
        name: groupName,
        description: groupDescription,
        color: groupColor,
        createdAt: new Date().toISOString(),
        connectionCount: 0
    };

    connectionGroups.push(newGroup);
    localStorage.setItem('connectionGroups', JSON.stringify(connectionGroups));

    updateGroupSelectors();
    updateConnectionList();

    $('#newGroupModal').modal('hide');
    $('#groupForm')[0].reset();
    showSuccessMessage('分组创建成功');
}

// 更新分组选择器
function updateGroupSelectors() {
    const selectors = ['#connectionGroup'];

    selectors.forEach(selectorId => {
        const selector = $(selectorId);
        const currentValue = selector.val();

        selector.html('<option value="">无分组</option>');

        connectionGroups.forEach(group => {
            selector.append(`<option value="${group.id}">${group.name}</option>`);
        });

        // 恢复之前选择的值
        if (currentValue && connectionGroups.some(group => group.id === currentValue)) {
            selector.val(currentValue);
        }
    });
}

// 删除分组
function deleteGroup(groupId, event) {
    event.stopPropagation();

    const group = connectionGroups.find(g => g.id === groupId);
    if (!group) return;

    // 检查分组中是否还有连接
    const connectionsInGroup = connections.filter(conn => conn.groupId === groupId);
    if (connectionsInGroup.length > 0) {
        if (!confirm(`分组"${group.name}"中还有 ${connectionsInGroup.length} 个连接，删除分组后将移除这些连接的分组关联。是否继续？`)) {
            return;
        }

        // 移除连接的分组关联
        connections.forEach(conn => {
            if (conn.groupId === groupId) {
                conn.groupId = null;
            }
        });
        localStorage.setItem('savedConnections', JSON.stringify(connections));
    }

    connectionGroups = connectionGroups.filter(g => g.id !== groupId);
    localStorage.setItem('connectionGroups', JSON.stringify(connectionGroups));

    updateGroupSelectors();
    updateConnectionList();
    showSuccessMessage('分组删除成功');
}

// 编辑分组
function editGroup(groupId, event) {
    event.stopPropagation();

    const group = connectionGroups.find(g => g.id === groupId);
    if (!group) return;

    $('#groupName').val(group.name);
    $('#groupDescription').val(group.description || '');
    $('#groupColor').val(group.color);

    // 临时存储编辑的分组ID
    $('#groupForm').data('editingGroupId', groupId);

    $('#newGroupModal').modal('show');
}

// 重命名分组
function renameGroup(groupId, newName) {
    const group = connectionGroups.find(g => g.id === groupId);
    if (!group) return;

    group.name = newName;
    localStorage.setItem('connectionGroups', JSON.stringify(connectionGroups));

    updateGroupSelectors();
    updateConnectionList();
}

// 显示连接属性
function showConnectionProperties(connectionId, event) {
    event.stopPropagation();

    const connection = connections.find(c => c.id === connectionId);
    if (!connection) return;

    // 填充基本信息
    $('#propConnectionName').val(connection.name);
    $('#propConnectionType').val(connection.type.toUpperCase());

    // 填充连接配置
    $('#propHost').val(connection.config.host || '');
    $('#propPort').val(connection.config.port || '');
    $('#propUser').val(connection.config.user || '');
    $('#propDatabase').val(connection.config.database || '');

    // 构建并显示连接URL
    let url = '';
    switch (connection.type) {
        case 'mysql':
            url = `mysql://${connection.config.user}@${connection.config.host}:${connection.config.port}/${connection.config.database}`;
            break;
        case 'postgresql':
            url = `postgresql://${connection.config.user}@${connection.config.host}:${connection.config.port}/${connection.config.database}`;
            break;
        case 'mongodb':
            url = connection.config.url || `mongodb://${connection.config.host}:${connection.config.port}/${connection.config.database}`;
            break;
        case 'redis':
            url = `redis://${connection.config.user ? connection.config.user + '@' : ''}${connection.config.host}:${connection.config.port}/${connection.config.database || 0}`;
            break;
    }
    $('#propUrl').val(url);

    // 加载保存的连接属性
    const savedProps = localStorage.getItem(`connection_props_${connectionId}`);
    let props = savedProps ? JSON.parse(savedProps) : {};

    // 填充高级设置
    $('#propTimeout').val(props.timeout || 30);
    $('#propMaxConnections').val(props.maxConnections || 10);
    $('#propCharset').val(props.charset || 'utf8');
    $('#propTimezone').val(props.timezone || '+08:00');

    // 填充连接池设置
    $('#propUseConnectionPool').prop('checked', props.useConnectionPool || false);
    $('#propMinConnections').val(props.minConnections || 2);
    $('#propPoolMaxConnections').val(props.poolMaxConnections || 10);
    $('#propIdleTimeout').val(props.idleTimeout || 300);

    // 填充SSL设置
    $('#propUseSSL').prop('checked', props.useSSL || false);
    $('#sslOptions').toggle(props.useSSL || false);

    // 填充SSH隧道设置
    $('#propUseSSHTunnel').prop('checked', props.useSSHTunnel || false);
    $('#sshTunnelOptions').toggle(props.useSSHTunnel || false);

    if (props.useSSHTunnel && props.sshConfig) {
        $('#propSSHHost').val(props.sshConfig.host || '');
        $('#propSSHPort').val(props.sshConfig.port || 22);
        $('#propSSHUser').val(props.sshConfig.username || '');
        $('#propSSHAuthMethod').val(props.sshConfig.authMethod || 'password');
        $('#propSSHPassword').val(props.sshConfig.password || '');
        $('#propSSHTunnelLocalPort').val(props.sshConfig.localPort || 0);
        $('#propSSHTunnelRemoteHost').val(props.sshConfig.remoteHost || 'localhost');
        $('#propSSHTunnelRemotePort').val(props.sshConfig.remotePort || 3306);
        $('#propSSHKeepAlive').prop('checked', props.sshConfig.keepAlive || false);

        // 根据认证方式显示对应的输入框
        toggleSSHAuthMethod(props.sshConfig.authMethod);
    }

    // 存储当前编辑的连接ID
    $('#connectionPropertiesForm').data('editingConnectionId', connectionId);

    // 显示模态框
    $('#connectionPropertiesModal').modal('show');
}

// 保存连接属性
function saveConnectionProperties() {
    const connectionId = $('#connectionPropertiesForm').data('editingConnectionId');
    if (!connectionId) return;

    // 收集表单数据
    const props = {
        timeout: parseInt($('#propTimeout').val()),
        maxConnections: parseInt($('#propMaxConnections').val()),
        charset: $('#propCharset').val(),
        timezone: $('#propTimezone').val(),
        useConnectionPool: $('#propUseConnectionPool').prop('checked'),
        minConnections: parseInt($('#propMinConnections').val()),
        poolMaxConnections: parseInt($('#propPoolMaxConnections').val()),
        idleTimeout: parseInt($('#propIdleTimeout').val()),
        useSSL: $('#propUseSSL').prop('checked'),
        sslCert: $('#propSSLCert')[0].files[0] ? $('#propSSLCert')[0].files[0].name : '',
        sslKey: $('#propSSLKey')[0].files[0] ? $('#propSSLKey')[0].files[0].name : '',
        sslCA: $('#propSSLCA')[0].files[0] ? $('#propSSLCA')[0].files[0].name : '',
        // SSH隧道配置
        useSSHTunnel: $('#propUseSSHTunnel').prop('checked'),
        sshConfig: $('#propUseSSHTunnel').prop('checked') ? {
            host: $('#propSSHHost').val(),
            port: parseInt($('#propSSHPort').val()),
            username: $('#propSSHUser').val(),
            authMethod: $('#propSSHAuthMethod').val(),
            password: $('#propSSHPassword').val(),
            keyFile: $('#propSSHKeyFile')[0] ? $('#propSSHKeyFile')[0].name : '',
            localPort: parseInt($('#propSSHTunnelLocalPort').val()),
            remoteHost: $('#propSSHTunnelRemoteHost').val(),
            remotePort: parseInt($('#propSSHTunnelRemotePort').val()),
            keepAlive: $('#propSSHKeepAlive').prop('checked')
        } : null
    };

    // 验证SSH隧道配置
    if (props.useSSHTunnel) {
        if (!props.sshConfig.host || !props.sshConfig.username) {
            showNotification('请填写SSH主机和用户名', 'error');
            return;
        }

        if (props.sshConfig.authMethod === 'password' && !props.sshConfig.password) {
            showNotification('请填写SSH密码', 'error');
            return;
        }

        if (props.sshConfig.authMethod === 'key' && !props.sshConfig.keyFile) {
            showNotification('请选择SSH私钥文件', 'error');
            return;
        }
    }

    // 保存到localStorage
    localStorage.setItem(`connection_props_${connectionId}`, JSON.stringify(props));

    // 更新连接配置（如果需要实时应用）
    const connection = connections.find(c => c.id === connectionId);
    if (connection) {
        // 应用字符集和时区设置到连接配置
        connection.config.charset = props.charset;
        connection.config.timezone = props.timezone;

        // 如果启用了SSH隧道，更新连接配置
        if (props.useSSHTunnel) {
            connection.config.useSSHTunnel = true;
            connection.config.sshConfig = props.sshConfig;
        } else {
            connection.config.useSSHTunnel = false;
            connection.config.sshConfig = null;
        }

        // 保存更新后的连接列表
        localStorage.setItem('savedConnections', JSON.stringify(connections));
    }

    showNotification('连接属性已保存', 'success');
    $('#connectionPropertiesModal').modal('hide');
}

// SSL选项切换处理
$(document).ready(function() {
    $('#propUseSSL').on('change', function() {
        $('#sslOptions').toggle($(this).prop('checked'));
    });

    // 连接池选项切换处理
    $('#propUseConnectionPool').on('change', function() {
        const poolOptions = $(this).closest('.card-body').find('.row, .mb-2').not(':first');
        poolOptions.toggle($(this).prop('checked'));
    });

    // SSH隧道选项切换处理
    $('#propUseSSHTunnel').on('change', function() {
        $('#sshTunnelOptions').toggle($(this).prop('checked'));
    });

    // SSH认证方式切换处理
    $('#propSSHAuthMethod').on('change', function() {
        toggleSSHAuthMethod($(this).val());
    });

    // SQL编辑器已在initializeSQLEditor()中初始化

    // 加载导入导出历史记录
    loadImportExportHistory();

    // 启动连接状态监控
    startConnectionStatusMonitoring();
});

// 切换SSH认证方式显示
function toggleSSHAuthMethod(authMethod) {
    if (authMethod === 'password') {
        $('#sshPasswordGroup').show();
        $('#sshKeyGroup').hide();
    } else if (authMethod === 'key') {
        $('#sshPasswordGroup').hide();
        $('#sshKeyGroup').show();
    }
}

// 测试SSH隧道连接
async function testSSHTunnel(connectionId) {
    const connection = connections.find(c => c.id === connectionId);
    if (!connection || !connection.config.useSSHTunnel) {
        showNotification('该连接未启用SSH隧道', 'error');
        return;
    }

    try {
        showLoading('正在测试SSH隧道连接...');

        const response = await fetch('/api/test-ssh-tunnel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sshConfig: connection.config.sshConfig
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('SSH隧道连接测试成功', 'success');
        } else {
            showNotification('SSH隧道连接测试失败: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('SSH隧道测试失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 建立SSH隧道
async function establishSSHTunnel(connectionId) {
    const connection = connections.find(c => c.id === connectionId);
    if (!connection || !connection.config.useSSHTunnel) {
        showNotification('该连接未启用SSH隧道', 'error');
        return;
    }

    try {
        showLoading('正在建立SSH隧道...');

        const response = await fetch('/api/establish-ssh-tunnel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                connectionId: connectionId,
                sshConfig: connection.config.sshConfig
            })
        });

        const result = await response.json();

        if (result.success) {
            connection.sshTunnelInfo = result.tunnelInfo;
            localStorage.setItem('savedConnections', JSON.stringify(connections));
            showNotification('SSH隧道建立成功', 'success');
            updateConnectionList();
        } else {
            showNotification('SSH隧道建立失败: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('SSH隧道建立失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 关闭SSH隧道
async function closeSSHTunnel(connectionId) {
    const connection = connections.find(c => c.id === connectionId);
    if (!connection || !connection.sshTunnelInfo) {
        showNotification('该连接没有活动的SSH隧道', 'error');
        return;
    }

    try {
        showLoading('正在关闭SSH隧道...');

        const response = await fetch('/api/close-ssh-tunnel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                connectionId: connectionId,
                tunnelInfo: connection.sshTunnelInfo
            })
        });

        const result = await response.json();

        if (result.success) {
            delete connection.sshTunnelInfo;
            localStorage.setItem('savedConnections', JSON.stringify(connections));
            showNotification('SSH隧道已关闭', 'success');
            updateConnectionList();
        } else {
            showNotification('SSH隧道关闭失败: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('SSH隧道关闭失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 连接状态监控
let connectionStatusInterval;

function startConnectionStatusMonitoring() {
    // 立即执行一次状态检查
    checkAllConnectionsStatus();

    // 每30秒检查一次连接状态
    connectionStatusInterval = setInterval(checkAllConnectionsStatus, 30000);
}

function stopConnectionStatusMonitoring() {
    if (connectionStatusInterval) {
        clearInterval(connectionStatusInterval);
        connectionStatusInterval = null;
    }
}

// 检查所有连接状态
async function checkAllConnectionsStatus() {
    for (const connection of connections) {
        await checkConnectionStatus(connection.id);
    }
}

// 检查单个连接状态
async function checkConnectionStatus(connectionId) {
    const connection = connections.find(c => c.id === connectionId);
    if (!connection) return;

    const statusElement = $(`#status-${connectionId}`);
    if (!statusElement.length) return;

    try {
        // 显示检查中状态
        updateConnectionStatusDisplay(statusElement, 'checking', '检查中...');

        // 测试连接
        const response = await fetch('/api/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: connection.type,
                config: connection.config
            })
        });

        const result = await response.json();

        if (result.success) {
            // 连接成功
            updateConnectionStatusDisplay(statusElement, 'connected', '已连接');
            connection.lastStatusCheck = new Date();
            connection.status = 'connected';
        } else {
            // 连接失败
            updateConnectionStatusDisplay(statusElement, 'disconnected', '未连接');
            connection.lastStatusCheck = new Date();
            connection.status = 'disconnected';
        }
    } catch (error) {
        // 网络错误或其他异常
        updateConnectionStatusDisplay(statusElement, 'error', '错误');
        connection.lastStatusCheck = new Date();
        connection.status = 'error';
    }

    // 保存连接状态
    localStorage.setItem('savedConnections', JSON.stringify(connections));
}

// 更新连接状态显示
function updateConnectionStatusDisplay(statusElement, status, text) {
    let iconClass, textClass;

    switch (status) {
        case 'connected':
            iconClass = 'fas fa-circle text-success';
            textClass = 'text-success';
            break;
        case 'disconnected':
            iconClass = 'fas fa-circle text-danger';
            textClass = 'text-danger';
            break;
        case 'checking':
            iconClass = 'fas fa-circle text-warning fa-spin';
            textClass = 'text-warning';
            break;
        case 'error':
            iconClass = 'fas fa-circle text-danger';
            textClass = 'text-danger';
            break;
        default:
            iconClass = 'fas fa-circle text-muted';
            textClass = 'text-muted';
    }

    statusElement.html(`
        <i class="${iconClass}"></i>
        <small class="${textClass}">${text}</small>
    `);
}

// 手动刷新连接状态
function refreshConnectionStatus(connectionId) {
    checkConnectionStatus(connectionId);
}

// 获取连接统计信息
function getConnectionStats() {
    const stats = {
        total: connections.length,
        connected: connections.filter(c => c.status === 'connected').length,
        disconnected: connections.filter(c => c.status === 'disconnected').length,
        error: connections.filter(c => c.status === 'error').length,
        unknown: connections.filter(c => !c.status || c.status === 'unknown').length
    };

    return stats;
}

// 显示连接状态统计
function showConnectionStats() {
    const stats = getConnectionStats();
    const statsHtml = `
        <div class="alert alert-info">
            <h6>连接状态统计</h6>
            <div class="row">
                <div class="col-6">
                    <small>总连接数: ${stats.total}</small>
                </div>
                <div class="col-6">
                    <small class="text-success">已连接: ${stats.connected}</small>
                </div>
                <div class="col-6">
                    <small class="text-danger">未连接: ${stats.disconnected}</small>
                </div>
                <div class="col-6">
                    <small class="text-warning">错误: ${stats.error}</small>
                </div>
            </div>
        </div>
    `;

    // 在连接列表上方显示统计信息
    const container = $('#connectionList');
    container.prepend(statsHtml);

    // 5秒后自动移除统计信息
    setTimeout(() => {
        $('.alert-info').fadeOut(() => $(this).remove());
    }, 5000);
}

// 页面卸载时停止监控
$(window).on('beforeunload', function() {
    stopConnectionStatusMonitoring();
});

// SQL脚本相关变量
let sqlScripts = [];

// 初始化SQL编辑器

// 切换编辑器主题
function changeEditorTheme() {
    const theme = $('#editorTheme').val();
    sqlEditor.setTheme(`ace/theme/${theme}`);
}

// 执行选中的SQL
function executeSelectedSQL() {
    const selectedText = sqlEditor.getSelectedText();
    if (selectedText.trim()) {
        executeSQLCode(selectedText);
    } else {
        showNotification('请先选择要执行的SQL语句', 'warning');
    }
}

// 清空SQL编辑器
function clearSQLEditor() {
    if (confirm('确定要清空SQL编辑器吗？')) {
        sqlEditor.setValue('');
        sqlEditor.focus();
    }
}

// 显示SQL执行计划分析
async function showSQLExplain() {
    const sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    // 检查是否是SELECT查询
    const trimmedSQL = sql.trim().toUpperCase();
    if (!trimmedSQL.startsWith('SELECT')) {
        showNotification('执行计划分析只支持SELECT查询', 'warning');
        return;
    }

    try {
        showLoading('正在分析执行计划...');

        const response = await fetch(`/api/explain/${currentConnectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: sql,
                params: {}
            })
        });

        const result = await response.json();

        if (result.success) {
            displayExecutionPlan(result.data);
            $('#explainModal').modal('show');
        } else {
            showNotification('执行计划分析失败: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('执行计划分析失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 显示执行计划结果
function displayExecutionPlan(planData) {
    const container = $('#explainResults');
    let html = '';

    // 执行计划分析摘要
    const analysis = planData.analysis;
    html += `
        <div class="alert alert-info">
            <h6>执行计划分析摘要</h6>
            <div class="row">
                <div class="col-md-3">
                    <small><strong>预计扫描行数:</strong> ${analysis.estimatedRows.toLocaleString()}</small>
                </div>
                <div class="col-md-3">
                    <small><strong>表扫描次数:</strong> ${analysis.tableScans}</small>
                </div>
                <div class="col-md-3">
                    <small><strong>索引使用次数:</strong> ${analysis.indexUsage}</small>
                </div>
                <div class="col-md-3">
                    <small><strong>全表扫描:</strong> ${analysis.fullTableScans}</small>
                </div>
            </div>
            ${analysis.warnings.length > 0 ? `
                <div class="mt-2">
                    <small class="text-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        ${analysis.warnings.join('; ')}
                    </small>
                </div>
            ` : ''}
        </div>
    `;

    // 基础执行计划表格
    if (planData.basic && planData.basic.length > 0) {
        html += `
            <h6 class="mt-4">基础执行计划</h6>
            <div class="table-responsive">
                <table class="table table-striped table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>表名</th>
                            <th>访问类型</th>
                            <th>可能的键</th>
                            <th>使用的键</th>
                            <th>键长度</th>
                            <th>引用</th>
                            <th>预计行数</th>
                            <th>额外信息</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        planData.basic.forEach(row => {
            const accessTypeClass = getAccessTypeClass(row.type);
            html += `
                <tr>
                    <td>${row.id}</td>
                    <td><code>${row.table}</code></td>
                    <td><span class="badge ${accessTypeClass}">${row.type}</span></td>
                    <td>${row.possible_keys || '-'}</td>
                    <td>${row.key || '-'}</td>
                    <td>${row.key_len || '-'}</td>
                    <td>${row.ref || '-'}</td>
                    <td>${parseInt(row.rows || 0).toLocaleString()}</td>
                    <td><small>${row.Extra || '-'}</small></td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    // 优化建议
    if (planData.recommendations && planData.recommendations.length > 0) {
        html += `
            <h6 class="mt-4">优化建议</h6>
            <div class="recommendations">
        `;

        planData.recommendations.forEach((rec, index) => {
            const priorityClass = getPriorityClass(rec.priority);
            html += `
                <div class="alert ${priorityClass} mb-2">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <strong>${rec.type === 'index' ? '索引优化' : rec.type === 'query' ? '查询优化' : '性能优化'}</strong>
                            <p class="mb-1">${rec.message}</p>
                            <small class="text-muted">建议: ${rec.suggestion}</small>
                        </div>
                        <div>
                            <span class="badge bg-secondary">${rec.priority}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
            </div>
        `;
    }

    container.html(html);
}

// 获取访问类型对应的样式类
function getAccessTypeClass(type) {
    const typeClasses = {
        'ALL': 'bg-danger',           // 全表扫描
        'index': 'bg-warning',        // 索引扫描
        'range': 'bg-info',          // 范围扫描
        'ref': 'bg-success',         // 索引引用
        'eq_ref': 'bg-success',      // 唯一索引引用
        'const': 'bg-success',       // 常量
        'system': 'bg-success',      // 系统表
        'NULL': 'bg-secondary'       // 无访问
    };
    return typeClasses[type] || 'bg-secondary';
}

// 获取优先级对应的样式类
function getPriorityClass(priority) {
    const priorityClasses = {
        'high': 'alert-danger',
        'medium': 'alert-warning',
        'low': 'alert-info'
    };
    return priorityClasses[priority] || 'alert-secondary';
}

// SQL格式化
function formatSQL() {
    let sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    try {
        // 使用专业SQL格式化算法
        const formatted = formatSQLProfessional(sql);
        sqlEditor.setValue(formatted);
        sqlEditor.clearSelection();
        showNotification('SQL格式化完成', 'success');
    } catch (error) {
        showNotification('SQL格式化失败: ' + error.message, 'error');
    }
}

// SQL代码片段定义
const sqlSnippets = {
    // SELECT语句片段
    'select': {
        prefix: 'select',
        body: 'SELECT ${1:*}\nFROM ${2:table_name}\nWHERE ${3:condition};',
        description: '基本SELECT查询'
    },
    'select-join': {
        prefix: 'select-join',
        body: 'SELECT ${1:columns}\nFROM ${2:table1}\n${3:INNER} JOIN ${4:table2} ON ${5:condition}\nWHERE ${6:condition};',
        description: '带JOIN的SELECT查询'
    },
    'select-group': {
        prefix: 'select-group',
        body: 'SELECT ${1:column}, ${2:COUNT(*)}\nFROM ${3:table_name}\nGROUP BY ${1:column}\nHAVING ${4:condition};',
        description: '带GROUP BY的SELECT查询'
    },

    // INSERT语句片段
    'insert': {
        prefix: 'insert',
        body: 'INSERT INTO ${1:table_name} (${2:columns})\nVALUES (${3:values});',
        description: '基本INSERT语句'
    },
    'insert-select': {
        prefix: 'insert-select',
        body: 'INSERT INTO ${1:table_name} (${2:columns})\nSELECT ${3:columns}\nFROM ${4:source_table}\nWHERE ${5:condition};',
        description: 'INSERT SELECT语句'
    },

    // UPDATE语句片段
    'update': {
        prefix: 'update',
        body: 'UPDATE ${1:table_name}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};',
        description: '基本UPDATE语句'
    },

    // DELETE语句片段
    'delete': {
        prefix: 'delete',
        body: 'DELETE FROM ${1:table_name}\nWHERE ${2:condition};',
        description: '基本DELETE语句'
    },

    // CREATE语句片段
    'create-table': {
        prefix: 'create-table',
        body: 'CREATE TABLE ${1:table_name} (\n    ${2:id} INT PRIMARY KEY AUTO_INCREMENT,\n    ${3:name} VARCHAR(255) NOT NULL,\n    ${4:created_at} TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
        description: '创建表'
    },
    'create-index': {
        prefix: 'create-index',
        body: 'CREATE INDEX ${1:index_name} ON ${2:table_name} (${3:column});',
        description: '创建索引'
    },

    // 事务处理片段
    'transaction': {
        prefix: 'transaction',
        body: 'START TRANSACTION;\n\n${1:-- SQL statements here}\n\nCOMMIT;\n-- ROLLBACK;',
        description: '事务处理'
    },

    // 条件语句片段
    'case': {
        prefix: 'case',
        body: 'CASE \n    WHEN ${1:condition} THEN ${2:result}\n    WHEN ${3:condition} THEN ${4:result}\n    ELSE ${5:default_result}\nEND',
        description: 'CASE语句'
    },

    // 窗口函数片段
    'window-function': {
        prefix: 'window-function',
        body: '${1:ROW_NUMBER()} OVER (\n    PARTITION BY ${2:partition_column}\n    ORDER BY ${3:order_column}\n)',
        description: '窗口函数'
    },

    // CTE片段
    'with': {
        prefix: 'with',
        body: 'WITH ${1:cte_name} AS (\n    SELECT ${2:columns}\n    FROM ${3:table_name}\n    WHERE ${4:condition}\n)\nSELECT ${5:columns}\nFROM ${1:cte_name};',
        description: 'CTE (Common Table Expression)'
    }
};

// 增强的专业SQL格式化算法
function formatSQLProfessional(sql, options = {}) {
    const {
        indentSize = 4,
        keywordCase = 'upper',
        commaStyle = 'after', // 'before' or 'after'
        maxLineLength = 120,
        alignColumns = false,
        removeComments = false
    } = options;

    // 移除注释（可选）
    let formatted = removeComments ?
        sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') :
        sql;

    // 标准化空白字符
    formatted = formatted.replace(/\s+/g, ' ').trim();

    // 关键字和操作符列表（按优先级排序）
    const keywords = [
        // 主要关键字
        'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
        'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW',

        // JOIN相关
        'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'OUTER JOIN',
        'CROSS JOIN', 'NATURAL JOIN', 'ON', 'USING',

        // GROUP和ORDER
        'GROUP BY', 'ORDER BY', 'HAVING',

        // 限制和分页
        'LIMIT', 'OFFSET', 'TOP', 'FETCH',

        // 集合操作
        'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'DISTINCT',

        // 条件操作符
        'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'EXISTS',
        'NOT EXISTS', 'ANY', 'ALL', 'SOME',

        // 比较操作符
        '=', '!=', '<>', '<', '>', '<=', '>=',

        // CASE语句
        'CASE', 'WHEN', 'THEN', 'ELSE', 'END',

        // 函数
        'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'ROUND', 'CEILING', 'FLOOR',
        'CONCAT', 'SUBSTRING', 'LENGTH', 'LOWER', 'UPPER', 'TRIM', 'REPLACE',
        'NOW', 'CURDATE', 'CURTIME', 'DATE_FORMAT', 'DATE_ADD', 'DATE_SUB',
        'DATEDIFF', 'IF', 'COALESCE', 'NULLIF', 'ABS', 'MOD'
    ];

    // 按长度排序，确保长关键字优先匹配
    const sortedKeywords = keywords.sort((a, b) => b.length - a.length);

    // SQL语句结构规则
    const structureRules = {
        // 需要换行的关键字
        breakBefore: [
            'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING',
            'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT', 'AND', 'OR', 'ON'
        ],

        // 需要增加缩进的关键字
        increaseIndent: [
            'FROM', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
            'FULL JOIN', 'OUTER JOIN', 'WHERE', 'HAVING', 'CASE', 'WHEN'
        ],

        // 需要减少缩进的关键字
        decreaseIndent: [
            'GROUP BY', 'ORDER BY', 'LIMIT', 'END', 'ELSE'
        ]
    };

    // 格式化函数
    function formatKeywordCase(text) {
        if (keywordCase === 'upper') {
            sortedKeywords.forEach(keyword => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                text = text.replace(regex, keyword.toUpperCase());
            });
        } else if (keywordCase === 'lower') {
            sortedKeywords.forEach(keyword => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                text = text.replace(regex, keyword.toLowerCase());
            });
        }
        return text;
    }

    // 格式化逗号
    function formatCommas(text) {
        if (commaStyle === 'before') {
            return text.replace(/,\s*/g, '\n' + ' '.repeat(indentSize) + ', ');
        } else {
            return text.replace(/,\s*/g, ',\n' + ' '.repeat(indentSize));
        }
    }

    // 主要格式化逻辑
    function formatStatement(text) {
        let result = '';
        let currentIndent = 0;
        let lines = text.split('\n');

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // 检查是否需要在前面换行
            let needsBreakBefore = false;
            for (let keyword of structureRules.breakBefore) {
                if (new RegExp(`\\b${keyword}\\b`, 'i').test(line)) {
                    needsBreakBefore = true;
                    break;
                }
            }

            if (needsBreakBefore && result) {
                result += '\n';
            }

            // 检查缩进变化
            let shouldIncreaseIndent = false;
            let shouldDecreaseIndent = false;

            for (let keyword of structureRules.increaseIndent) {
                if (new RegExp(`\\b${keyword}\\b`, 'i').test(line)) {
                    shouldIncreaseIndent = true;
                    break;
                }
            }

            for (let keyword of structureRules.decreaseIndent) {
                if (new RegExp(`\\b${keyword}\\b`, 'i').test(line)) {
                    shouldDecreaseIndent = true;
                    break;
                }
            }

            // 应用缩进变化
            if (shouldDecreaseIndent && currentIndent > 0) {
                currentIndent--;
            }

            // 添加缩进
            result += ' '.repeat(currentIndent * indentSize);

            // 添加行内容
            result += line;

            // 处理括号缩进
            let openParens = (line.match(/\(/g) || []).length;
            let closeParens = (line.match(/\)/g) || []).length;

            if (openParens > closeParens) {
                currentIndent += openParens - closeParens;
            } else if (closeParens > openParens) {
                currentIndent = Math.max(0, currentIndent - (closeParens - openParens));
            }

            // 应用缩进增加
            if (shouldIncreaseIndent) {
                currentIndent++;
            }

            result += '\n';
        }

        return result.trim();
    }

    // 处理长行分割
    function splitLongLines(text) {
        const lines = text.split('\n');
        const result = [];

        for (let line of lines) {
            if (line.length <= maxLineLength) {
                result.push(line);
                continue;
            }

            // 在逗号或操作符处分割
            const parts = line.split(/,(?![^()]*\))/);
            if (parts.length > 1) {
                let currentLine = parts[0];
                for (let i = 1; i < parts.length; i++) {
                    if (currentLine.length + parts[i].length + 1 > maxLineLength) {
                        result.push(currentLine);
                        currentLine = ' '.repeat(indentSize) + parts[i];
                    } else {
                        currentLine += ', ' + parts[i];
                    }
                }
                result.push(currentLine);
            } else {
                result.push(line);
            }
        }

        return result.join('\n');
    }

    // 应用所有格式化步骤
    formatted = formatKeywordCase(formatted);
    formatted = formatStatement(formatted);
    formatted = formatCommas(formatted);
    formatted = splitLongLines(formatted);

    // 清理多余的空行
    formatted = formatted.replace(/\n\s*\n\s*\n/g, '\n\n');

    return formatted;
}

// 快速SQL格式化（简化版本）
function formatSQL() {
    const sql = sqlEditor ? sqlEditor.getValue() : $('#sqlEditor').val();
    if (!sql.trim()) return;

    const formatted = formatSQLProfessional(sql, {
        indentSize: 4,
        keywordCase: 'upper',
        commaStyle: 'after'
    });

    if (sqlEditor) {
        sqlEditor.setValue(formatted);
    } else {
        $('#sqlEditor').val(formatted);
    }

    showNotification('SQL快速格式化完成', 'success');
}

// 显示SQL格式化设置模态框
function showSQLFormatModal() {
    const sql = sqlEditor.getValue();
    $('#formatPreviewOriginal').val(sql);
    $('#syntaxCheckResult').addClass('d-none');
    $('#sqlFormatModal').modal('show');
}

// 应用SQL格式化设置
function applySQLFormat() {
    const indentSize = parseInt($('#formatIndentSize').val());
    const keywordCase = $('#formatKeywordCase').val();
    const commaStyle = $('#formatCommaStyle').val();
    const maxLineLength = parseInt($('#formatMaxLineLength').val());
    const removeComments = $('#formatRemoveComments').prop('checked');
    const alignColumns = $('#formatAlignColumns').prop('checked');

    let sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    try {
        const formatted = formatSQLProfessional(sql, {
            indentSize: indentSize,
            keywordCase: keywordCase,
            commaStyle: commaStyle,
            maxLineLength: maxLineLength,
            removeComments: removeComments,
            alignColumns: alignColumns
        });

        sqlEditor.setValue(formatted);
        sqlEditor.clearSelection();
        $('#sqlFormatModal').modal('hide');
        showNotification('SQL格式化完成', 'success');
    } catch (error) {
        showNotification('SQL格式化失败: ' + error.message, 'error');
    }
}

// 预览SQL格式化效果
function previewSQLFormat() {
    const sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    try {
        const indentSize = parseInt($('#formatIndentSize').val());
        const keywordCase = $('#formatKeywordCase').val();
        const commaStyle = $('#formatCommaStyle').val();
        const maxLineLength = parseInt($('#formatMaxLineLength').val());
        const removeComments = $('#formatRemoveComments').prop('checked');
        const alignColumns = $('#formatAlignColumns').prop('checked');

        const formatted = formatSQLProfessional(sql, {
            indentSize: indentSize,
            keywordCase: keywordCase,
            commaStyle: commaStyle,
            maxLineLength: maxLineLength,
            removeComments: removeComments,
            alignColumns: alignColumns
        });

        $('#formatPreviewOriginal').val(sql);
        $('#formatPreviewFormatted').val(formatted);
        showNotification('预览生成完成', 'success');
    } catch (error) {
        showNotification('预览生成失败: ' + error.message, 'error');
    }
}

// 压缩当前SQL
function minifyCurrentSQL() {
    const sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    try {
        const minified = minifySQL(sql);
        sqlEditor.setValue(minified);
        sqlEditor.clearSelection();
        showNotification('SQL压缩完成', 'success');
    } catch (error) {
        showNotification('SQL压缩失败: ' + error.message, 'error');
    }
}

// 格式化当前SQL的注释
function formatCurrentSQLComments() {
    const sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    try {
        const formatted = formatSQLComments(sql);
        sqlEditor.setValue(formatted);
        sqlEditor.clearSelection();
        showNotification('注释格式化完成', 'success');
    } catch (error) {
        showNotification('注释格式化失败: ' + error.message, 'error');
    }
}

// 验证当前SQL语法
function validateCurrentSQL() {
    const sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    try {
        const validation = validateSQLSyntax(sql);
        const resultDiv = $('#syntaxCheckResult');

        if (validation.valid) {
            resultDiv.removeClass('alert-danger alert-warning').addClass('alert-success');
            resultDiv.html('<i class="fas fa-check-circle"></i> SQL语法检查通过，没有发现错误');
        } else {
            resultDiv.removeClass('alert-success alert-warning').addClass('alert-danger');
            resultDiv.html('<i class="fas fa-exclamation-triangle"></i> 发现语法错误：<ul><li>' + validation.errors.join('</li><li>') + '</li></ul>');
        }

        resultDiv.removeClass('d-none');
    } catch (error) {
        showNotification('语法检查失败: ' + error.message, 'error');
    }
}

// SQL语法检查
function validateSQLSyntax(sql) {
    const errors = [];

    // 基础语法检查
    const parentheses = sql.match(/\(/g) || [];
    const parenthesesClose = sql.match(/\)/g) || [];
    if (parentheses.length !== parenthesesClose.length) {
        errors.push('括号不匹配');
    }

    // 检查未闭合的引号
    const singleQuotes = sql.match(/'/g) || [];
    if (singleQuotes.length % 2 !== 0) {
        errors.push('单引号不匹配');
    }

    const doubleQuotes = sql.match(/"/g) || [];
    if (doubleQuotes.length % 2 !== 0) {
        errors.push('双引号不匹配');
    }

    // 检查常见语法错误
    const commonErrors = [
        { pattern: /\bSELECT\s+FROM\b/i, message: 'SELECT语句缺少字段' },
        { pattern: /\bFROM\s+WHERE\b/i, message: 'FROM语句缺少表名' },
        { pattern: /\bWHERE\s+(?:GROUP BY|ORDER BY|HAVING|LIMIT)\b/i, message: 'WHERE语句缺少条件' },
        { pattern: /\bGROUP BY\s+(?:ORDER BY|HAVING|LIMIT)\b/i, message: 'GROUP BY语句缺少字段' },
        { pattern: /\bORDER BY\s+(?:GROUP BY|HAVING|LIMIT)\b/i, message: 'ORDER BY语句缺少字段' },
        { pattern: /\bINSERT\s+INTO\s+(?:VALUES|SELECT)\b/i, message: 'INSERT语句缺少表名' },
        { pattern: /\bUPDATE\s+SET\b/i, message: 'UPDATE语句缺少表名' },
        { pattern: /\bDELETE\s+FROM\s+WHERE\b/i, message: 'DELETE语句缺少表名' }
    ];

    commonErrors.forEach(error => {
        if (error.pattern.test(sql)) {
            errors.push(error.message);
        }
    });

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// 高级SQL格式化（包含语法检查）
function formatAndValidateSQL() {
    const sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    try {
        // 首先进行语法检查
        const validation = validateSQLSyntax(sql);

        if (!validation.valid) {
            showNotification('SQL语法错误：' + validation.errors.join(', '), 'error');
            return;
        }

        // 格式化SQL
        const formatted = formatSQLProfessional(sql, {
            indentSize: 4,
            keywordCase: 'upper',
            commaStyle: 'after',
            maxLineLength: 120,
            removeComments: false
        });

        sqlEditor.setValue(formatted);
        sqlEditor.clearSelection();
        showNotification('SQL格式化和语法检查完成', 'success');
    } catch (error) {
        showNotification('SQL处理失败: ' + error.message, 'error');
    }
}

// SQL压缩功能
function minifySQL(sql) {
    return sql
        .replace(/--.*$/gm, '') // 移除单行注释
        .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
        .replace(/\s+/g, ' ') // 压缩空白字符
        .replace(/\s*,\s*/g, ',') // 压缩逗号周围的空格
        .replace(/\s*([()=<>!])\s*/g, '$1') // 压缩操作符周围的空格
        .trim();
}

// SQL注释格式化
function formatSQLComments(sql) {
    // 标准化注释格式
    return sql
        .replace(/--\s*/g, '-- ') // 确保单行注释后有空格
        .replace(/\/\*\s*/g, '/* ') // 确保多行注释开始后有空格
        .replace(/\s*\*\//g, ' */') // 确保多行注释结束前有空格
        .replace(/\/\*[\s\S]*?\*\//g, match => {
            // 格式化多行注释
            return match.replace(/\n\s*\*/g, '\n *');
        });
}

// 保存SQL脚本
function saveSQLScript() {
    const sql = sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('SQL编辑器为空', 'warning');
        return;
    }

    const scriptName = prompt('请输入脚本名称:');
    if (!scriptName) return;

    const script = {
        id: Date.now().toString(),
        name: scriptName,
        sql: sql,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    sqlScripts.push(script);
    localStorage.setItem('sqlScripts', JSON.stringify(sqlScripts));

    updateSQLScriptSelector();
    showNotification('脚本保存成功', 'success');
}

// 显示SQL脚本管理模态框
function showSQLScriptModal() {
    updateSQLScriptsList();
    $('#sqlScriptModal').modal('show');
}

// 更新SQL脚本列表
function updateSQLScriptsList() {
    const container = $('#savedScriptsList');
    container.empty();

    if (sqlScripts.length === 0) {
        container.html('<div class="text-muted text-center">暂无保存的脚本</div>');
        return;
    }

    sqlScripts.forEach(script => {
        const item = $(`
            <div class="list-group-item list-group-item-action">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">${script.name}</h6>
                        <small class="text-muted">
                            创建时间: ${new Date(script.createdAt).toLocaleString()}
                        </small>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-primary" onclick="loadScriptToEditor('${script.id}')">
                            <i class="fas fa-edit"></i> 编辑
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteSQLScript('${script.id}')">
                            <i class="fas fa-trash"></i> 删除
                        </button>
                    </div>
                </div>
            </div>
        `);
        container.append(item);
    });
}

// 加载脚本到编辑器
function loadScriptToEditor(scriptId) {
    const script = sqlScripts.find(s => s.id === scriptId);
    if (script) {
        sqlEditor.setValue(script.sql);
        sqlEditor.clearSelection();
        $('#sqlScriptModal').modal('hide');
        showNotification(`已加载脚本: ${script.name}`, 'success');
    }
}

// 删除SQL脚本
function deleteSQLScript(scriptId) {
    if (!confirm('确定要删除这个脚本吗？')) return;

    sqlScripts = sqlScripts.filter(s => s.id !== scriptId);
    localStorage.setItem('sqlScripts', JSON.stringify(sqlScripts));

    updateSQLScriptsList();
    updateSQLScriptSelector();
    showNotification('脚本删除成功', 'success');
}

// 创建新脚本
function createNewScript() {
    sqlEditor.setValue('');
    sqlEditor.clearSelection();
    $('#sqlScriptModal').modal('hide');
    sqlEditor.focus();
}

// 加载SQL脚本
function loadSQLScripts() {
    const saved = localStorage.getItem('sqlScripts');
    if (saved) {
        sqlScripts = JSON.parse(saved);
    }
    updateSQLScriptSelector();
}

// 更新SQL脚本选择器
function updateSQLScriptSelector() {
    const selector = $('#sqlScriptSelect');
    selector.empty();
    selector.append('<option value="">选择脚本</option>');

    sqlScripts.forEach(script => {
        const option = `<option value="${script.id}">${script.name}</option>`;
        selector.append(option);
    });
}

// 加载选中的SQL脚本
function loadSQLScript() {
    const scriptId = $('#sqlScriptSelect').val();
    if (scriptId) {
        loadScriptToEditor(scriptId);
    }
}

// 执行SQL代码
function executeSQLCode(sql) {
    if (!currentConnectionId) {
        showNotification('请先选择数据库连接', 'warning');
        return;
    }

    try {
        showLoading('正在执行SQL查询...');

        fetch(`/api/execute/${currentConnectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: sql,
                database: $('#currentDatabase').val()
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                displayQueryResults(result.data, result.meta);
                showNotification('SQL执行成功', 'success');
            } else {
                displayQueryError(result);
            }
        })
        .catch(error => {
            showNotification('SQL执行失败: ' + error.message, 'error');
        })
        .finally(() => {
            hideLoading();
        });
    } catch (error) {
        showNotification('SQL执行失败: ' + error.message, 'error');
        hideLoading();
    }
}

// 显示执行计划
function showSQLExplain() {
    const sql = sqlEditor.getSelectedText() || sqlEditor.getValue();
    if (!sql.trim()) {
        showNotification('请输入SQL语句', 'warning');
        return;
    }

    // 检查是否是SELECT语句
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
        showNotification('只能分析SELECT语句的执行计划', 'warning');
        return;
    }

    try {
        showLoading('正在分析执行计划...');

        const explainSQL = 'EXPLAIN ' + sql;

        fetch(`/api/execute/${currentConnectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: explainSQL,
                database: $('#currentDatabase').val()
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                displayExplainResults(result.data);
                showNotification('执行计划分析完成', 'success');
            } else {
                showNotification('执行计划分析失败: ' + result.error, 'error');
            }
        })
        .catch(error => {
            showNotification('执行计划分析失败: ' + error.message, 'error');
        })
        .finally(() => {
            hideLoading();
        });
    } catch (error) {
        showNotification('执行计划分析失败: ' + error.message, 'error');
        hideLoading();
    }
}

// 显示执行计划结果
function displayExplainResults(data) {
    const container = $('#queryResults');
    const card = $('#queryResultsCard');

    if (data.length === 0) {
        container.html('<div class="text-muted text-center">执行计划结果为空</div>');
        card.show();
        return;
    }

    let html = `
        <div class="alert alert-info">
            <h6>执行计划分析</h6>
            <p>以下是SQL查询的执行计划，可以帮助优化查询性能。</p>
        </div>
        <table class="table table-striped table-hover" id="explainResultsTable">
            <thead>
                <tr>
    `;

    // 获取列名
    const columns = Object.keys(data[0]);
    columns.forEach(col => {
        html += `<th>${col}</th>`;
    });

    html += `
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(row => {
        html += '<tr>';
        columns.forEach(col => {
            const value = row[col];
            html += `<td>${value !== null ? value : '<em>NULL</em>'}</td>`;
        });
        html += '</tr>';
    });

    html += `
            </tbody>
        </table>
    `;

    container.html(html);
    card.show();

    // 初始化DataTables
    if ($('#explainResultsTable').length) {
        $('#explainResultsTable').DataTable({
            responsive: true,
            pageLength: 50,
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "全部"]]
        });
    }
}

// ==================== 数据导入导出功能 ====================

// 全局变量
let importExportHistory = [];

// 显示数据导入模态框
function showDataImportModal() {
    if (!currentConnectionId) {
        showNotification('请先选择数据库连接', 'warning');
        return;
    }

    updateImportTableSelector();
    $('#dataImportModal').modal('show');
}

// 显示数据导出模态框
function showDataExportModal() {
    if (!currentConnectionId) {
        showNotification('请先选择数据库连接', 'warning');
        return;
    }

    updateExportTableSelector();
    $('#dataExportModal').modal('show');
}

// 更新导入表选择器
function updateImportTableSelector() {
    const selector = $('#importTargetTable');
    selector.empty();
    selector.append('<option value="">选择目标表</option>');

    if (!currentConnectionId) return;

    // 获取当前数据库的表列表
    const currentDatabase = $('#currentDatabase').val();
    if (currentDatabase) {
        fetch(`/api/tables/${currentConnectionId}/${currentDatabase}`)
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    result.data.forEach(table => {
                        selector.append(`<option value="${table}">${table}</option>`);
                    });
                }
            })
            .catch(error => {
                console.error('获取表列表失败:', error);
            });
    }
}

// 更新导出表选择器
function updateExportTableSelector() {
    const selector = $('#exportTable');
    selector.empty();
    selector.append('<option value="">选择要导出的表</option>');

    if (!currentConnectionId) return;

    const currentDatabase = $('#currentDatabase').val();
    if (currentDatabase) {
        fetch(`/api/tables/${currentConnectionId}/${currentDatabase}`)
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    result.data.forEach(table => {
                        selector.append(`<option value="${table}">${table}</option>`);
                    });
                }
            })
            .catch(error => {
                console.error('获取表列表失败:', error);
            });
    }
}

// 更新导入选项
function updateImportOptions() {
    const format = $('#importFormat').val();
    $('.import-options').hide();

    if (format === 'csv') {
        $('#csvOptions').show();
    }
}

// 更新导出选项
function updateExportOptions() {
    const format = $('#exportFormat').val();
    $('.export-options').hide();

    if (format === 'csv') {
        $('#csvExportOptions').show();
    }
}

// 更新导出源选项
function updateExportSource() {
    const source = $('#exportSource').val();

    if (source === 'table') {
        $('#tableExportOptions').show();
        $('#queryExportOptions').hide();
    } else {
        $('#tableExportOptions').hide();
        $('#queryExportOptions').show();
    }
}

// 开始数据导入
async function startDataImport() {
    const form = document.getElementById('dataImportForm');
    const formData = new FormData(form);

    const fileInput = document.getElementById('importFile');
    if (!fileInput.files.length) {
        showNotification('请选择要导入的文件', 'warning');
        return;
    }

    const config = {
        targetTable: $('#importTargetTable').val(),
        format: $('#importFormat').val(),
        mode: $('#importMode').val(),
        truncateTable: $('#importTruncateTable').prop('checked'),
        ignoreErrors: $('#importIgnoreErrors').prop('checked'),
        csvOptions: {
            delimiter: $('#csvDelimiter').val(),
            encoding: $('#csvEncoding').val(),
            headerRow: $('#csvHeaderRow').prop('checked')
        }
    };

    if (!config.targetTable) {
        showNotification('请选择目标表', 'warning');
        return;
    }

    try {
        showLoading('正在导入数据...');

        const response = await fetch(`/api/import/${currentConnectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: fileInput.files[0].name,
                config: config,
                database: $('#currentDatabase').val()
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('数据导入成功', 'success');
            $('#dataImportModal').modal('hide');

            // 添加到历史记录
            addToImportExportHistory('import', config.targetTable, config.format, 'success');

            // 刷新表数据
            if (window.refreshTableData) {
                window.refreshTableData();
            }
        } else {
            showNotification('数据导入失败: ' + result.error, 'error');
            addToImportExportHistory('import', config.targetTable, config.format, 'failed');
        }
    } catch (error) {
        showNotification('数据导入失败: ' + error.message, 'error');
        addToImportExportHistory('import', config.targetTable, config.format, 'failed');
    } finally {
        hideLoading();
    }
}

// 开始数据导出
async function startDataExport() {
    const source = $('#exportSource').val();
    const format = $('#exportFormat').val();

    let config = {
        format: format,
        rowLimit: $('#exportRowLimit').val() || null,
        includeSchema: $('#exportIncludeSchema').prop('checked'),
        csvOptions: {
            delimiter: $('#exportCsvDelimiter').val(),
            encoding: $('#exportCsvEncoding').val(),
            header: $('#exportCsvHeader').prop('checked')
        }
    };

    if (source === 'table') {
        config.table = $('#exportTable').val();
        if (!config.table) {
            showNotification('请选择要导出的表', 'warning');
            return;
        }
    } else {
        config.query = $('#exportQuery').val();
        if (!config.query.trim()) {
            showNotification('请输入SQL查询语句', 'warning');
            return;
        }
    }

    try {
        showLoading('正在导出数据...');

        const response = await fetch(`/api/export/${currentConnectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                config: config,
                database: $('#currentDatabase').val()
            })
        });

        const result = await response.json();

        if (result.success) {
            // 下载文件
            const blob = new Blob([result.data], {
                type: getMimeType(format)
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = getExportFileName(config, format);
            a.click();
            URL.revokeObjectURL(url);

            showNotification('数据导出成功', 'success');
            $('#dataExportModal').modal('hide');

            // 添加到历史记录
            addToImportExportHistory('export', config.table || '查询结果', format, 'success');
        } else {
            showNotification('数据导出失败: ' + result.error, 'error');
            addToImportExportHistory('export', config.table || '查询结果', format, 'failed');
        }
    } catch (error) {
        showNotification('数据导出失败: ' + error.message, 'error');
        addToImportExportHistory('export', config.table || '查询结果', format, 'failed');
    } finally {
        hideLoading();
    }
}

// 快速导入数据
async function quickImportData() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files.length) {
        showNotification('请选择要导入的文件', 'warning');
        return;
    }

    const config = {
        targetTable: $('#importTargetTable').val(),
        format: $('#importFormat').val(),
        mode: $('#importMode').val(),
        truncateTable: false,
        ignoreErrors: true
    };

    if (!config.targetTable) {
        showNotification('请选择目标表', 'warning');
        return;
    }

    try {
        showLoading('正在快速导入...');

        const response = await fetch(`/api/import/${currentConnectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: fileInput.files[0].name,
                config: config,
                database: $('#currentDatabase').val()
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('快速导入成功', 'success');
            addToImportExportHistory('import', config.targetTable, config.format, 'success');
        } else {
            showNotification('快速导入失败: ' + result.error, 'error');
            addToImportExportHistory('import', config.targetTable, config.format, 'failed');
        }
    } catch (error) {
        showNotification('快速导入失败: ' + error.message, 'error');
        addToImportExportHistory('import', config.targetTable, config.format, 'failed');
    } finally {
        hideLoading();
    }
}

// 快速导出数据
async function quickExportData() {
    const table = $('#exportTable').val();
    const format = $('#exportFormat').val();

    if (!table) {
        showNotification('请选择要导出的表', 'warning');
        return;
    }

    const config = {
        table: table,
        format: format,
        rowLimit: null,
        includeSchema: false
    };

    try {
        showLoading('正在快速导出...');

        const response = await fetch(`/api/export/${currentConnectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                config: config,
                database: $('#currentDatabase').val()
            })
        });

        const result = await response.json();

        if (result.success) {
            // 下载文件
            const blob = new Blob([result.data], {
                type: getMimeType(format)
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${table}.${format}`;
            a.click();
            URL.revokeObjectURL(url);

            showNotification('快速导出成功', 'success');
            addToImportExportHistory('export', table, format, 'success');
        } else {
            showNotification('快速导出失败: ' + result.error, 'error');
            addToImportExportHistory('export', table, format, 'failed');
        }
    } catch (error) {
        showNotification('快速导出失败: ' + error.message, 'error');
        addToImportExportHistory('export', table, format, 'failed');
    } finally {
        hideLoading();
    }
}

// 获取MIME类型
function getMimeType(format) {
    const mimeTypes = {
        'csv': 'text/csv',
        'json': 'application/json',
        'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'sql': 'text/plain',
        'xml': 'application/xml'
    };
    return mimeTypes[format] || 'text/plain';
}

// 获取导出文件名
function getExportFileName(config, format) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (config.table) {
        return `${config.table}_${timestamp}.${format}`;
    } else {
        return `query_result_${timestamp}.${format}`;
    }
}

// 添加到导入导出历史记录
function addToImportExportHistory(type, source, format, status) {
    const historyItem = {
        id: Date.now().toString(),
        type: type,
        source: source,
        format: format,
        status: status,
        timestamp: new Date().toISOString()
    };

    importExportHistory.unshift(historyItem);

    // 限制历史记录数量
    if (importExportHistory.length > 50) {
        importExportHistory = importExportHistory.slice(0, 50);
    }

    localStorage.setItem('importExportHistory', JSON.stringify(importExportHistory));
    updateImportExportHistoryTable();
}

// 更新导入导出历史记录表
function updateImportExportHistoryTable() {
    const tbody = $('#importExportHistory tbody');
    tbody.empty();

    if (importExportHistory.length === 0) {
        tbody.html('<tr><td colspan="6" class="text-center text-muted">暂无操作历史</td></tr>');
        return;
    }

    importExportHistory.slice(0, 10).forEach(item => {
        const row = $(`
            <tr>
                <td>${new Date(item.timestamp).toLocaleString()}</td>
                <td>
                    <span class="badge bg-${item.type === 'import' ? 'success' : 'primary'}">
                        ${item.type === 'import' ? '导入' : '导出'}
                    </span>
                </td>
                <td>${item.source}</td>
                <td><span class="badge bg-secondary">${item.format.toUpperCase()}</span></td>
                <td>
                    <span class="badge bg-${item.status === 'success' ? 'success' : 'danger'}">
                        ${item.status === 'success' ? '成功' : '失败'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="repeatOperation('${item.id}')" title="重复操作">
                        <i class="fas fa-redo"></i>
                    </button>
                </td>
            </tr>
        `);
        tbody.append(row);
    });
}

// 重复操作
function repeatOperation(historyId) {
    const item = importExportHistory.find(h => h.id === historyId);
    if (!item) return;

    if (item.type === 'import') {
        showDataImportModal();
    } else {
        showDataExportModal();
    }
}

async function loadConnections() {
    // 首先从localStorage加载现有连接
    const keys = ['savedConnections', 'connections', 'dbConnections'];
    let foundConnections = false;

    keys.forEach(key => {
        const saved = localStorage.getItem(key);
        console.log(`Checking localStorage key '${key}':`, saved);
        if (saved) {
            try {
                connections = JSON.parse(saved);
                console.log(`Parsed ${connections.length} connections from ${key}:`, connections);
                foundConnections = true;
                // 确保使用统一的key
                if (key !== 'savedConnections') {
                    localStorage.setItem('savedConnections', saved);
                    console.log(`Migrated connections from ${key} to savedConnections`);
                }
            } catch (error) {
                console.error(`Error parsing connections from ${key}:`, error);
            }
        }
    });

    if (!foundConnections) {
        console.log('No saved connections found in any localStorage key');
        connections = [];
    }

    // 然后从后端API获取数据源并合并
    try {
        const response = await fetch('/api/datasources');
        const result = await response.json();

        if (result.success && result.data) {
            console.log('Loaded datasources from backend:', result.data);

            // 将后端数据源转换为前端连接格式并合并
            const backendConnections = result.data.map(ds => ({
                id: ds.connectionId || ds.id,
                name: ds.name,
                type: ds.type,
                config: ds.config,
                lastConnected: ds.lastConnected || null,
                groupId: null,
                autoConnect: ds.status === 'connected',
                status: ds.status,
                connectionStats: ds.connectionStats,
                description: ds.description,
                tags: ds.tags,
                createdAt: ds.createdAt,
                updatedAt: ds.updatedAt
            }));

            // 合并连接：避免重复，以后端数据源为准
            const mergedConnections = [...connections];
            backendConnections.forEach(backendConn => {
                const existingIndex = mergedConnections.findIndex(conn =>
                    conn.id === backendConn.id ||
                    (conn.name === backendConn.name && conn.type === backendConn.type)
                );

                if (existingIndex >= 0) {
                    // 更新现有连接
                    mergedConnections[existingIndex] = { ...mergedConnections[existingIndex], ...backendConn };
                } else {
                    // 添加新连接
                    mergedConnections.push(backendConn);
                }
            });

            connections = mergedConnections;

            // 保存合并后的连接到localStorage
            localStorage.setItem('savedConnections', JSON.stringify(connections));
            console.log('Merged connections saved to localStorage:', connections.length);
        }
    } catch (error) {
        console.error('Error loading datasources from backend:', error);
    }

    // 检查connections数组的结构
    console.log('Final connections array:', connections);
    console.log('Connections array length:', connections.length);

    // 确保每个连接都有必要的字段
    connections = connections.map(conn => ({
        id: conn.id || Date.now().toString(),
        name: conn.name || '未命名连接',
        type: conn.type || 'mysql',
        config: conn.config || {},
        lastConnected: conn.lastConnected || null,
        groupId: conn.groupId || null,
        autoConnect: conn.autoConnect || false,
        status: conn.status || 'disconnected',
        connectionStats: conn.connectionStats || { totalConnections: 0, failedConnections: 0, avgResponseTime: 0 },
        description: conn.description || '',
        tags: conn.tags || [],
        createdAt: conn.createdAt || new Date().toISOString(),
        updatedAt: conn.updatedAt || new Date().toISOString(),
        ...conn
    }));

    console.log('Processed connections:', connections);

    updateConnectionList();
    updateConnectionSelectors();
}

// 加载导入导出历史记录
function loadImportExportHistory() {
    const saved = localStorage.getItem('importExportHistory');
    if (saved) {
        importExportHistory = JSON.parse(saved);
    }
    updateImportExportHistoryTable();
}

// ========== 数据同步和比较功能 ==========

let syncHistory = [];
let currentSyncConfig = null;
let compareResults = null;
let comparePagination = {
    currentPage: 1,
    pageSize: 10,
    totalItems: 0,
    filteredItems: []
};

// 显示数据同步模态框
function showDataSyncModal() {
    $('#dataSyncModal').modal('show');
    loadSyncConnections();
    initializeSyncOptions();
}

// 显示数据比较模态框
function showDataCompareModal() {
    $('#dataCompareModal').modal('show');
    loadSyncConnections();
}

// 快速数据同步
async function quickDataSync() {
    if (!currentConnectionId) {
        showNotification('请先连接到数据库', 'warning');
        return;
    }

    const currentDb = $('#currentDatabase').val();
    const currentTable = $('#currentTable').val();

    if (!currentDb || !currentTable) {
        showNotification('请选择数据库和表', 'warning');
        return;
    }

    // 简化配置，直接进行表内数据同步（示例：备份到新表）
    const config = {
        sourceConnection: currentConnectionId,
        sourceDatabase: currentDb,
        sourceTable: currentTable,
        targetConnection: currentConnectionId,
        targetDatabase: currentDb,
        targetTable: currentTable + '_backup_' + new Date().toISOString().slice(0, 10),
        syncMode: 'replace',
        syncType: 'table'
    };

    if (confirm(`确认要将表 ${currentTable} 备份到 ${config.targetTable} 吗？`)) {
        await performQuickSync(config);
    }
}

// 加载同步连接选择器
function loadSyncConnections() {
    const sourceSelect = $('#sourceConnection');
    const targetSelect = $('#targetConnection');

    sourceSelect.empty().append('<option value="">选择连接...</option>');
    targetSelect.empty().append('<option value="">选择连接...</option>');

    connections.forEach(conn => {
        const option = `<option value="${conn.id}">${conn.name} (${conn.type})</option>`;
        sourceSelect.append(option);
        targetSelect.append(option);
    });

    // 如果当前有连接，默认选中
    if (currentConnectionId) {
        sourceSelect.val(currentConnectionId);
        targetSelect.val(currentConnectionId);
        loadConnectionDatabases('source');
        loadConnectionDatabases('target');
    }
}

// 初始化同步选项
function initializeSyncOptions() {
    // 同步类型切换事件
    $('input[name="syncType"]').change(function() {
        const syncType = $(this).val();
        updateSyncUI(syncType);
    });

    // 连接选择变化事件
    $('#sourceConnection').change(function() {
        loadConnectionDatabases('source');
    });

    $('#targetConnection').change(function() {
        loadConnectionDatabases('target');
    });

    // 数据库选择变化事件
    $('#sourceDatabase').change(function() {
        loadDatabaseTables('source');
    });

    $('#targetDatabase').change(function() {
        loadDatabaseTables('target');
    });

    // 表选择变化事件
    $('#sourceTable, #targetTable').change(function() {
        updateColumnMapping();
    });

    // 同步模式变化事件
    $('#syncMode').change(function() {
        updateSyncOptions();
    });
}

// 更新同步UI
function updateSyncUI(syncType) {
    switch(syncType) {
        case 'table':
            $('#sourceTable, #targetTable').prop('disabled', false);
            $('#syncMode option[value="truncate_replace"]').show();
            break;
        case 'database':
            $('#sourceTable, #targetTable').prop('disabled', true);
            $('#syncMode option[value="truncate_replace"]').hide();
            break;
        case 'schema':
            $('#sourceTable, #targetTable').prop('disabled', true);
            $('#syncMode option[value="truncate_replace"]').hide();
            break;
    }
}

// 加载连接的数据库列表
async function loadConnectionDatabases(type) {
    const connectionId = $(`#${type}Connection`).val();
    const select = $(`#${type}Database`);

    select.empty().append('<option value="">选择数据库...</option>');

    if (!connectionId) return;

    try {
        const response = await fetch(`/api/databases/${connectionId}`);
        const result = await response.json();

        if (result.success) {
            result.data.forEach(db => {
                select.append(`<option value="${db}">${db}</option>`);
            });
        }
    } catch (error) {
        console.error('加载数据库列表失败:', error);
    }
}

// 加载数据库的表列表
async function loadDatabaseTables(type) {
    const connectionId = $(`#${type}Connection`).val();
    const database = $(`#${type}Database`).val();
    const select = $(`#${type}Table`);

    select.empty().append('<option value="">选择表...</option>');

    if (!connectionId || !database) return;

    try {
        const response = await fetch(`/api/tables/${connectionId}?database=${database}`);
        const result = await response.json();

        if (result.success) {
            result.data.forEach(table => {
                select.append(`<option value="${table}">${table}</option>`);
            });
        }
    } catch (error) {
        console.error('加载表列表失败:', error);
    }
}

// 更新列映射
async function updateColumnMapping() {
    const sourceConn = $('#sourceConnection').val();
    const sourceDb = $('#sourceDatabase').val();
    const sourceTable = $('#sourceTable').val();
    const targetConn = $('#targetConnection').val();
    const targetDb = $('#targetDatabase').val();
    const targetTable = $('#targetTable').val();

    if (!sourceConn || !sourceDb || !sourceTable || !targetConn || !targetDb || !targetTable) {
        $('#columnMapping').html('<div class="text-muted text-center">请先选择源表和目标表</div>');
        return;
    }

    try {
        // 获取源表结构
        const sourceResponse = await fetch(`/api/table-structure/${sourceConn}?database=${sourceDb}&table=${sourceTable}`);
        const sourceResult = await sourceResponse.json();

        // 获取目标表结构
        const targetResponse = await fetch(`/api/table-structure/${targetConn}?database=${targetDb}&table=${targetTable}`);
        const targetResult = await targetResponse.json();

        if (sourceResult.success && targetResult.success) {
            const mappingHtml = generateColumnMapping(sourceResult.data.columns, targetResult.data.columns);
            $('#columnMapping').html(mappingHtml);
        }
    } catch (error) {
        console.error('获取表结构失败:', error);
        $('#columnMapping').html('<div class="text-danger text-center">获取表结构失败</div>');
    }
}

// 生成列映射HTML
function generateColumnMapping(sourceColumns, targetColumns) {
    let html = '<div class="row g-2">';

    sourceColumns.forEach(sourceCol => {
        const matchingTarget = targetColumns.find(targetCol =>
            targetCol.Field.toLowerCase() === sourceCol.Field.toLowerCase()
        );

        html += `
            <div class="col-md-6">
                <div class="input-group input-group-sm">
                    <span class="input-group-text">${sourceCol.Field}</span>
                    <span class="input-group-text">
                        <i class="fas fa-arrow-right"></i>
                    </span>
                    <select class="form-select" data-source-column="${sourceCol.Field}">
                        <option value="">不映射</option>
        `;

        targetColumns.forEach(targetCol => {
            const selected = matchingTarget && matchingTarget.Field === targetCol.Field ? 'selected' : '';
            html += `<option value="${targetCol.Field}" ${selected}>${targetCol.Field}</option>`;
        });

        html += `
                    </select>
                </div>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

// 更新同步选项
function updateSyncOptions() {
    const syncMode = $('#syncMode').val();

    // 根据同步模式启用/禁用某些选项
    switch(syncMode) {
        case 'insert':
            $('#syncCreateTable').prop('disabled', false);
            $('#syncAlterTable').prop('disabled', true);
            $('#syncDropTable').prop('disabled', true);
            break;
        case 'update':
            $('#syncCreateTable').prop('disabled', true);
            $('#syncAlterTable').prop('disabled', false);
            $('#syncDropTable').prop('disabled', false);
            break;
        case 'upsert':
            $('#syncCreateTable').prop('disabled', false);
            $('#syncAlterTable').prop('disabled', false);
            $('#syncDropTable').prop('disabled', false);
            break;
        case 'replace':
        case 'truncate_replace':
            $('#syncCreateTable').prop('disabled', false);
            $('#syncAlterTable').prop('disabled', false);
            $('#syncDropTable').prop('disabled', false);
            break;
    }
}

// 预览同步
async function previewSync() {
    const config = getSyncConfig();
    if (!validateSyncConfig(config)) return;

    try {
        showLoading('正在分析同步数据...');

        const response = await fetch('/api/sync/preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (result.success) {
            displaySyncPreview(result.data);
            $('#previewSyncBtn').prop('disabled', false);
            $('#executeSyncBtn').prop('disabled', false);
        } else {
            showNotification('同步预览失败: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('同步预览失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 获取同步配置
function getSyncConfig() {
    return {
        syncType: $('input[name="syncType"]:checked').val(),
        sourceConnection: $('#sourceConnection').val(),
        sourceDatabase: $('#sourceDatabase').val(),
        sourceTable: $('#sourceTable').val(),
        sourceQuery: $('#sourceQuery').val(),
        targetConnection: $('#targetConnection').val(),
        targetDatabase: $('#targetDatabase').val(),
        targetTable: $('#targetTable').val(),
        syncMode: $('#syncMode').val(),
        keyColumns: $('#syncKeyColumns').val().split(',').map(col => col.trim()).filter(col => col),
        createTable: $('#syncCreateTable').prop('checked'),
        alterTable: $('#syncAlterTable').prop('checked'),
        dropTable: $('#syncDropTable').prop('checked'),
        columnMapping: getColumnMapping()
    };
}

// 获取列映射配置
function getColumnMapping() {
    const mapping = {};
    $('#columnMapping select').each(function() {
        const sourceCol = $(this).data('source-column');
        const targetCol = $(this).val();
        if (targetCol) {
            mapping[sourceCol] = targetCol;
        }
    });
    return mapping;
}

// 验证同步配置
function validateSyncConfig(config) {
    if (!config.sourceConnection || !config.targetConnection) {
        showNotification('请选择源连接和目标连接', 'warning');
        return false;
    }

    if (!config.sourceDatabase || !config.targetDatabase) {
        showNotification('请选择源数据库和目标数据库', 'warning');
        return false;
    }

    if (config.syncType === 'table' && (!config.sourceTable || !config.targetTable)) {
        showNotification('请选择源表和目标表', 'warning');
        return false;
    }

    if (config.syncMode === 'upsert' && config.keyColumns.length === 0) {
        showNotification('请输入主键列', 'warning');
        return false;
    }

    return true;
}

// 显示同步预览
function displaySyncPreview(previewData) {
    $('#syncPreviewCard').show();

    // 更新统计信息
    $('#previewInsertCount').text(previewData.insertCount || 0);
    $('#previewUpdateCount').text(previewData.updateCount || 0);
    $('#previewUnchangedCount').text(previewData.unchangedCount || 0);
    $('#previewDeleteCount').text(previewData.deleteCount || 0);

    // 显示差异详情
    if (previewData.differences && previewData.differences.length > 0) {
        const diffHtml = previewData.differences.map(diff => `
            <div class="alert alert-${diff.type === 'insert' ? 'success' : diff.type === 'update' ? 'warning' : 'danger'} mb-2">
                <small><strong>${diff.type.toUpperCase()}:</strong> ${diff.message}</small>
            </div>
        `).join('');
        $('#diffContent').html(diffHtml);
    }

    // 显示SQL预览
    if (previewData.sqlScript) {
        $('#sqlPreview').text(previewData.sqlScript);
    }

    // 显示日志
    if (previewData.log) {
        $('#syncLog').html(previewData.log.map(entry =>
            `<div class="${entry.level}">${entry.timestamp} - ${entry.message}</div>`
        ).join(''));
    }

    currentSyncConfig = previewData.config;
}

// 执行同步
async function executeSync() {
    if (!currentSyncConfig) {
        showNotification('请先预览同步', 'warning');
        return;
    }

    if (!confirm('确认要执行同步操作吗？此操作可能会修改目标数据库的数据。')) {
        return;
    }

    try {
        showLoading('正在执行同步...');

        const response = await fetch('/api/sync/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentSyncConfig)
        });

        const result = await response.json();

        if (result.success) {
            showNotification('同步执行成功', 'success');
            addToSyncHistory(currentSyncConfig, 'success');
            $('#dataSyncModal').modal('hide');

            // 如果同步的是当前连接的表，刷新数据
            if (currentSyncConfig.targetConnection === currentConnectionId) {
                refreshCurrentTable();
            }
        } else {
            showNotification('同步执行失败: ' + result.error, 'error');
            addToSyncHistory(currentSyncConfig, 'failed');
        }
    } catch (error) {
        showNotification('同步执行失败: ' + error.message, 'error');
        addToSyncHistory(currentSyncConfig, 'failed');
    } finally {
        hideLoading();
    }
}

// 添加到同步历史
function addToSyncHistory(config, status) {
    const historyItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        config: config,
        status: status,
        summary: {
            source: `${config.sourceDatabase}.${config.sourceTable || 'all'}`,
            target: `${config.targetDatabase}.${config.targetTable || 'all'}`,
            mode: config.syncMode
        }
    };

    syncHistory.unshift(historyItem);

    // 只保留最近50条记录
    if (syncHistory.length > 50) {
        syncHistory = syncHistory.slice(0, 50);
    }

    localStorage.setItem('syncHistory', JSON.stringify(syncHistory));
}

// 显示同步历史
function showSyncHistory() {
    const modal = $(`
        <div class="modal fade" id="syncHistoryModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">同步历史</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="table-responsive">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>时间</th>
                                        <th>源</th>
                                        <th>目标</th>
                                        <th>模式</th>
                                        <th>状态</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${syncHistory.map(item => `
                                        <tr>
                                            <td>${new Date(item.timestamp).toLocaleString()}</td>
                                            <td>${item.summary.source}</td>
                                            <td>${item.summary.target}</td>
                                            <td>${item.summary.mode}</td>
                                            <td>
                                                <span class="badge bg-${item.status === 'success' ? 'success' : 'danger'}">
                                                    ${item.status === 'success' ? '成功' : '失败'}
                                                </span>
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-outline-primary" onclick="repeatSync('${item.id}')">
                                                    <i class="fas fa-redo"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    $('body').append(modal);
    modal.modal('show');
    modal.on('hidden.bs.modal', function() {
        modal.remove();
    });
}

// 重复同步
function repeatSync(historyId) {
    const item = syncHistory.find(h => h.id === historyId);
    if (!item) return;

    currentSyncConfig = item.config;
    $('#syncHistoryModal').modal('hide');
    showDataSyncModal();

    // 重新配置界面
    setTimeout(() => {
        $('#sourceConnection').val(item.config.sourceConnection);
        $('#targetConnection').val(item.config.targetConnection);
        loadConnectionDatabases('source');
        loadConnectionDatabases('target');
    }, 500);
}

// 数据比较功能
async function performDataCompare() {
    const config = getSyncConfig();
    if (!validateSyncConfig(config)) return;

    try {
        showLoading('正在比较数据...');

        const response = await fetch('/api/compare/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (result.success) {
            compareResults = result.data;
            displayCompareResults();
            $('#dataCompareModal').modal('show');
        } else {
            showNotification('数据比较失败: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('数据比较失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 显示比较结果
function displayCompareResults() {
    if (!compareResults) return;

    // 更新统计信息
    $('#compareTotalRecords').text(compareResults.totalRecords);
    $('#compareIdentical').text(compareResults.identical);
    $('#compareDifferent').text(compareResults.different);
    $('#compareSourceOnly').text(compareResults.sourceOnly);
    $('#compareTargetOnly').text(compareResults.targetOnly);
    $('#compareStructureDiff').text(compareResults.structureDifferences);

    // 初始化分页
    comparePagination.filteredItems = compareResults.differences;
    comparePagination.totalItems = compareResults.filteredItems.length;
    comparePagination.currentPage = 1;

    updateCompareResultsTable();
    updateComparePagination();
}

// 更新比较结果表格
function updateCompareResultsTable() {
    const filter = $('#compareFilter').val();
    const search = $('#compareSearch').val().toLowerCase();
    const start = (comparePagination.currentPage - 1) * comparePagination.pageSize;
    const end = start + comparePagination.pageSize;

    let filteredItems = compareResults.differences;

    // 应用过滤器
    if (filter !== 'all') {
        filteredItems = filteredItems.filter(item => item.type === filter);
    }

    // 应用搜索
    if (search) {
        filteredItems = filteredItems.filter(item =>
            item.primaryKey.toLowerCase().includes(search) ||
            item.columnName.toLowerCase().includes(search) ||
            (item.sourceValue && item.sourceValue.toString().toLowerCase().includes(search)) ||
            (item.targetValue && item.targetValue.toString().toLowerCase().includes(search))
        );
    }

    comparePagination.filteredItems = filteredItems;
    comparePagination.totalItems = filteredItems.length;

    const pageItems = filteredItems.slice(start, end);
    const tbody = $('#compareResultBody');
    tbody.empty();

    pageItems.forEach(item => {
        const row = $(`
            <tr>
                <td>
                    <span class="badge bg-${getStatusColor(item.type)}">${getStatusText(item.type)}</span>
                </td>
                <td>${item.primaryKey}</td>
                <td>${item.columnName}</td>
                <td>${item.sourceValue || '-'}</td>
                <td>${item.targetValue || '-'}</td>
                <td>${item.differenceType}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="showRecordDetail('${item.primaryKey}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-success" onclick="syncSingleRecord('${item.primaryKey}')">
                            <i class="fas fa-sync"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `);
        tbody.append(row);
    });
}

// 获取状态颜色
function getStatusColor(type) {
    const colors = {
        'identical': 'success',
        'different': 'warning',
        'source_only': 'info',
        'target_only': 'danger',
        'structure_diff': 'secondary'
    };
    return colors[type] || 'secondary';
}

// 获取状态文本
function getStatusText(type) {
    const texts = {
        'identical': '相同',
        'different': '不同',
        'source_only': '源表独有',
        'target_only': '目标表独有',
        'structure_diff': '结构差异'
    };
    return texts[type] || type;
}

// 过滤比较结果
function filterCompareResults() {
    comparePagination.currentPage = 1;
    updateCompareResultsTable();
    updateComparePagination();
}

// 搜索比较结果
function searchCompareResults() {
    clearTimeout(window.compareSearchTimeout);
    window.compareSearchTimeout = setTimeout(() => {
        comparePagination.currentPage = 1;
        updateCompareResultsTable();
        updateComparePagination();
    }, 300);
}

// 更新比较分页
function updateComparePagination() {
    const totalPages = Math.ceil(comparePagination.totalItems / comparePagination.pageSize);
    const pagination = $('#comparePagination');
    pagination.empty();

    if (totalPages <= 1) return;

    // 上一页
    const prevDisabled = comparePagination.currentPage === 1 ? 'disabled' : '';
    pagination.append(`
        <li class="page-item ${prevDisabled}">
            <a class="page-link" href="#" onclick="changeComparePage(${comparePagination.currentPage - 1})">上一页</a>
        </li>
    `);

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= comparePagination.currentPage - 2 && i <= comparePagination.currentPage + 2)) {
            const active = i === comparePagination.currentPage ? 'active' : '';
            pagination.append(`
                <li class="page-item ${active}">
                    <a class="page-link" href="#" onclick="changeComparePage(${i})">${i}</a>
                </li>
            `);
        } else if (i === comparePagination.currentPage - 3 || i === comparePagination.currentPage + 3) {
            pagination.append(`<li class="page-item disabled"><span class="page-link">...</span></li>`);
        }
    }

    // 下一页
    const nextDisabled = comparePagination.currentPage === totalPages ? 'disabled' : '';
    pagination.append(`
        <li class="page-item ${nextDisabled}">
            <a class="page-link" href="#" onclick="changeComparePage(${comparePagination.currentPage + 1})">下一页</a>
        </li>
    `);
}

// 切换比较页
function changeComparePage(page) {
    const totalPages = Math.ceil(comparePagination.totalItems / comparePagination.pageSize);
    if (page >= 1 && page <= totalPages) {
        comparePagination.currentPage = page;
        updateCompareResultsTable();
        updateComparePagination();
    }
}

// 从比较结果打开同步
function openSyncFromCompare() {
    if (!compareResults || !compareResults.config) return;

    $('#dataCompareModal').modal('hide');
    showDataSyncModal();

    // 延迟设置配置，等待模态框完全加载
    setTimeout(() => {
        const config = compareResults.config;
        $('#sourceConnection').val(config.sourceConnection);
        $('#targetConnection').val(config.targetConnection);
        $('input[name="syncType"][value="' + config.syncType + '"]').prop('checked', true);

        loadConnectionDatabases('source');
        loadConnectionDatabases('target');
    }, 500);
}

// 导出比较结果
function exportCompareResult() {
    if (!compareResults) return;

    const format = 'json';
    const filename = `compare_result_${new Date().toISOString().slice(0, 10)}.${format}`;

    const blob = new Blob([JSON.stringify(compareResults, null, 2)], {
        type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('比较结果导出成功', 'success');
}

// 生成同步脚本
function generateSyncScript() {
    if (!compareResults) return;

    let script = '-- 数据同步脚本\n';
    script += `-- 生成时间: ${new Date().toLocaleString()}\n`;
    script += `-- 源: ${compareResults.config.sourceDatabase}.${compareResults.config.sourceTable}\n`;
    script += `-- 目标: ${compareResults.config.targetDatabase}.${compareResults.config.targetTable}\n\n`;

    // 生成INSERT语句
    compareResults.differences
        .filter(item => item.type === 'source_only')
        .forEach(item => {
            script += `INSERT INTO ${compareResults.config.targetTable} (${item.columnName}) VALUES (${item.sourceValue});\n`;
        });

    // 生成UPDATE语句
    compareResults.differences
        .filter(item => item.type === 'different')
        .forEach(item => {
            script += `UPDATE ${compareResults.config.targetTable} SET ${item.columnName} = ${item.sourceValue} WHERE ${compareResults.config.keyColumns[0]} = '${item.primaryKey}';\n`;
        });

    // 生成DELETE语句
    compareResults.differences
        .filter(item => item.type === 'target_only')
        .forEach(item => {
            script += `DELETE FROM ${compareResults.config.targetTable} WHERE ${compareResults.config.keyColumns[0]} = '${item.primaryKey}';\n`;
        });

    // 显示脚本
    const modal = $(`
        <div class="modal fade" id="syncScriptModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">同步脚本</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <pre class="border rounded p-3" style="background: #f8f9fa; max-height: 500px; overflow-y: auto;">${script}</pre>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        <button type="button" class="btn btn-primary" onclick="copySyncScript()">复制脚本</button>
                        <button type="button" class="btn btn-success" onclick="saveSyncScript()">保存脚本</button>
                    </div>
                </div>
            </div>
        </div>
    `);

    $('body').append(modal);
    modal.modal('show');
    modal.on('hidden.bs.modal', function() {
        modal.remove();
    });
}

// 刷新当前表数据
function refreshCurrentTable() {
    const currentDb = $('#currentDatabase').val();
    const currentTable = $('#currentTable').val();

    if (currentDb && currentTable) {
        loadTableData(currentDb, currentTable);
    }
}

// 快速同步
async function performQuickSync(config) {
    try {
        showLoading('正在执行快速同步...');

        const response = await fetch('/api/sync/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (result.success) {
            showNotification('快速同步成功', 'success');
            addToSyncHistory(config, 'success');

            // 如果同步的是当前连接的表，刷新数据
            if (config.targetConnection === currentConnectionId) {
                refreshCurrentTable();
            }
        } else {
            showNotification('快速同步失败: ' + result.error, 'error');
            addToSyncHistory(config, 'failed');
        }
    } catch (error) {
        showNotification('快速同步失败: ' + error.message, 'error');
        addToSyncHistory(config, 'failed');
    } finally {
        hideLoading();
    }
}

// 加载同步历史
function loadSyncHistory() {
    const saved = localStorage.getItem('syncHistory');
    if (saved) {
        syncHistory = JSON.parse(saved);
    }
}

// ===== 智能代码提示功能 =====


// 更新编辑器标签
function updateEditorLabel(label) {
    const editorLabel = $('.card-title span');
    if (editorLabel.length) {
        editorLabel.html(`<i class="fas fa-code"></i> ${label}`);
    }
}




// 获取Redis命令文档
function getRedisCommandDoc(command) {
    const commandDocs = {
        'SET': 'SET key value [EX seconds|PX milliseconds] [NX|XX] - 设置键值',
        'GET': 'GET key - 获取键值',
        'HGETALL': 'HGETALL key - 获取哈希表所有字段和值',
        'KEYS': 'KEYS pattern - 查找所有匹配给定模式的键',
        'LRANGE': 'LRANGE key start stop - 获取列表指定范围内的元素',
        'SMEMBERS': 'SMEMBERS key - 获取集合中的所有成员',
        'ZADD': 'ZADD key score member [score member ...] - 向有序集合添加成员',
        'DEL': 'DEL key [key ...] - 删除键',
        'EXPIRE': 'EXPIRE key seconds - 设置键的过期时间'
    };

    return commandDocs[command] || `${command} - Redis命令`;
}

// 分析SQL上下文
function analyzeSQLContext(text) {
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1].toUpperCase();
    const secondLastWord = words[words.length - 2]?.toUpperCase();
    const thirdLastWord = words[words.length - 3]?.toUpperCase();
    const line = text.toUpperCase();

    // 智能上下文检测 - 基于SQL语句结构
    if (line.includes('CREATE TABLE') && !line.includes('CREATE TABLE')) {
        return { type: 'create_table' };
    }
    if (line.includes('ALTER TABLE') && !line.includes('ALTER TABLE')) {
        return { type: 'alter_table' };
    }
    if (line.includes('DROP TABLE') && !line.includes('DROP TABLE')) {
        return { type: 'drop_table' };
    }
    if (line.includes('INSERT INTO') && !line.includes('INSERT INTO')) {
        return { type: 'insert_into' };
    }
    if (line.includes('UPDATE') && !line.includes('UPDATE SET')) {
        return { type: 'update_set' };
    }
    if (line.includes('DELETE FROM') && !line.includes('DELETE FROM')) {
        return { type: 'delete_from' };
    }
    if (line.includes('SELECT') && !line.includes('FROM')) {
        return { type: 'select_columns' };
    }

    // 检测是否在FROM、JOIN、INSERT INTO等需要表名的地方
    if (['FROM', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'INTO', 'UPDATE', 'TABLE'].includes(secondLastWord) ||
        (['INNER', 'LEFT', 'RIGHT', 'FULL'].includes(thirdLastWord) && secondLastWord === 'JOIN')) {
        return { type: 'table' };
    }

    // 检测是否在SELECT、WHERE、ORDER BY等需要字段名的地方
    if (['SELECT', 'WHERE', 'ORDER', 'GROUP', 'HAVING', 'SET'].includes(secondLastWord) ||
        (['SELECT', ','].includes(secondLastWord) && text.includes('FROM')) ||
        (secondLastWord === 'BY' && ['ORDER', 'GROUP'].includes(thirdLastWord))) {
        return { type: 'column', tableName: extractTableName(text) };
    }

    // 检测是否在WHERE条件中
    if (line.includes('WHERE ')) {
        return { type: 'where_condition' };
    }

    // 检测是否是函数调用
    if (lastWord.match(/[A-Z_]+\($/)) {
        return { type: 'function' };
    }

    return { type: 'keyword' };
}

// 提取表名
function extractTableName(text) {
    const fromMatch = text.match(/FROM\s+([^\s,;]+)/i);
    const joinMatch = text.match(/JOIN\s+([^\s,;]+)/i);
    const updateMatch = text.match(/UPDATE\s+([^\s,;]+)/i);

    let tableName = fromMatch?.[1] || joinMatch?.[1] || updateMatch?.[1] || '';

    // 如果表名包含数据库前缀，去除前缀
    if (tableName.includes('.')) {
        tableName = tableName.split('.')[1];
    }

    return tableName;
}

// 获取表名建议
function getTableSuggestions(prefix) {
    const suggestions = [];

    // 这里可以从数据库缓存中获取表名
    // 临时使用一些示例表名
    const sampleTables = ['users', 'orders', 'products', 'categories', 'logs'];

    sampleTables.forEach(table => {
        if (table.toLowerCase().includes(prefix.toLowerCase())) {
            suggestions.push({
                caption: table,
                value: table,
                meta: 'table',
                score: 1000
            });
        }
    });

    return suggestions;
}

// 获取字段名建议
function getColumnSuggestions(tableName, prefix) {
    const suggestions = [];

    // 这里可以从数据库缓存中获取字段名
    // 临时使用一些示例字段名
    const sampleColumns = ['id', 'name', 'email', 'created_at', 'updated_at', 'status'];

    sampleColumns.forEach(column => {
        if (column.toLowerCase().includes(prefix.toLowerCase())) {
            suggestions.push({
                caption: column,
                value: column,
                meta: 'column',
                score: 1000
            });
        }
    });

    return suggestions;
}

// ===== 智能建议函数 =====

// SET操作建议
function getSetOperationSuggestions(prefix) {
    const suggestions = [
        { caption: 'EX', value: 'EX', meta: 'option', doc: '设置过期时间（秒）' },
        { caption: 'PX', value: 'PX', meta: 'option', doc: '设置过期时间（毫秒）' },
        { caption: 'NX', value: 'NX', meta: 'option', doc: '只在键不存在时设置' },
        { caption: 'XX', value: 'XX', meta: 'option', doc: '只在键存在时设置' }
    ];

    return suggestions.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// GET操作建议
function getGetOperationSuggestions(prefix) {
    return [
        { caption: 'EXISTS', value: 'EXISTS', meta: 'related', doc: '检查键是否存在' },
        { caption: 'TTL', value: 'TTL', meta: 'related', doc: '获取键的剩余时间' },
        { caption: 'TYPE', value: 'TYPE', meta: 'related', doc: '获取键的类型' }
    ].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// HSET操作建议
function getHSetOperationSuggestions(prefix) {
    return [
        { caption: 'HGET', value: 'HGET', meta: 'related', doc: '获取哈希表字段值' },
        { caption: 'HGETALL', value: 'HGETALL', meta: 'related', doc: '获取哈希表所有字段和值' },
        { caption: 'HKEYS', value: 'HKEYS', meta: 'related', doc: '获取哈希表所有字段' },
        { caption: 'HVALS', value: 'HVALS', meta: 'related', doc: '获取哈希表所有值' },
        { caption: 'HDEL', value: 'HDEL', meta: 'related', doc: '删除哈希表字段' }
    ].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// HGET操作建议
function getHGetOperationSuggestions(prefix) {
    return [
        { caption: 'HGETALL', value: 'HGETALL', meta: 'related', doc: '获取哈希表所有字段和值' },
        { caption: 'HKEYS', value: 'HKEYS', meta: 'related', doc: '获取哈希表所有字段' },
        { caption: 'HVALS', value: 'HVALS', meta: 'related', doc: '获取哈希表所有值' },
        { caption: 'HEXISTS', value: 'HEXISTS', meta: 'related', doc: '检查哈希表字段是否存在' },
        { caption: 'HLEN', value: 'HLEN', meta: 'related', doc: '获取哈希表字段数量' }
    ].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// KEYS操作建议
function getKeysOperationSuggestions(prefix) {
    const patterns = [
        { caption: '*', value: '*', meta: 'pattern', doc: '所有键' },
        { caption: 'user:*', value: 'user:*', meta: 'pattern', doc: '所有user开头的键' },
        { caption: 'session:*', value: 'session:*', meta: 'pattern', doc: '所有session开头的键' },
        { caption: 'cache:*', value: 'cache:*', meta: 'pattern', doc: '所有cache开头的键' },
        { caption: 'temp:*', value: 'temp:*', meta: 'pattern', doc: '所有temp开头的键' }
    ];

    return patterns.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// List操作建议
function getListOperationSuggestions(prefix) {
    const listCommands = [
        { caption: 'LPOP', value: 'LPOP', meta: 'command', doc: '移出并获取列表左侧元素' },
        { caption: 'RPOP', value: 'RPOP', meta: 'command', doc: '移出并获取列表右侧元素' },
        { caption: 'LLEN', value: 'LLEN', meta: 'command', doc: '获取列表长度' },
        { caption: 'LRANGE', value: 'LRANGE', meta: 'command', doc: '获取列表指定范围内元素' },
        { caption: 'LINDEX', value: 'LINDEX', meta: 'command', doc: '获取列表中指定索引的元素' },
        { caption: 'LSET', value: 'LSET', meta: 'command', doc: '设置列表中指定索引的元素' }
    ];

    return listCommands.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// Set操作建议
function getSetOperationSuggestions(prefix) {
    const setCommands = [
        { caption: 'SREM', value: 'SREM', meta: 'command', doc: '移除集合成员' },
        { caption: 'SMEMBERS', value: 'SMEMBERS', meta: 'command', doc: '获取集合所有成员' },
        { caption: 'SCARD', value: 'SCARD', meta: 'command', doc: '获取集合成员数量' },
        { caption: 'SISMEMBER', value: 'SISMEMBER', meta: 'command', doc: '判断成员是否在集合中' },
        { caption: 'SPOP', value: 'SPOP', meta: 'command', doc: '移出并获取集合随机成员' }
    ];

    return setCommands.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// ZSet操作建议
function getZSetOperationSuggestions(prefix) {
    const zsetCommands = [
        { caption: 'ZRANGE', value: 'ZRANGE', meta: 'command', doc: '获取有序集合指定范围成员' },
        { caption: 'ZSCORE', value: 'ZSCORE', meta: 'command', doc: '获取有序集合成员分数' },
        { caption: 'ZCARD', value: 'ZCARD', meta: 'command', doc: '获取有序集合成员数量' },
        { caption: 'ZCOUNT', value: 'ZCOUNT', meta: 'command', doc: '计算指定分数区间的成员数量' },
        { caption: 'ZRANK', value: 'ZRANK', meta: 'command', doc: '获取有序集合成员排名' }
    ];

    return zsetCommands.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// TTL操作建议
function getTTLOperationSuggestions(prefix) {
    return [
        { caption: 'SETEX', value: 'SETEX', meta: 'related', doc: '设置键值和过期时间' },
        { caption: 'PEXPIRE', value: 'PEXPIRE', meta: 'related', doc: '设置毫秒级过期时间' },
        { caption: 'PTTL', value: 'PTTL', meta: 'related', doc: '获取毫秒级剩余时间' },
        { caption: 'PERSIST', value: 'PERSIST', meta: 'related', doc: '移除键的过期时间' }
    ].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 键名建议（基于常见模式）
function getKeySuggestions(prefix) {
    const commonKeys = [
        'user:session:', 'user:profile:', 'user:settings:',
        'cache:page:', 'cache:api:', 'cache:query:',
        'temp:upload:', 'temp:processing:', 'temp:token:',
        'config:app:', 'config:db:', 'config:system:',
        'log:error:', 'log:access:', 'log:debug:',
        'queue:email:', 'queue:notification:', 'queue:task:',
        'counter:visit:', 'counter:download:', 'counter:login:',
        'rate:limit:', 'rate:api:', 'rate:user:'
    ];

    return commonKeys
        .filter(key => key.toLowerCase().includes(prefix.toLowerCase()))
        .map(key => ({
            caption: key,
            value: key,
            meta: 'key',
            score: 800
        }));
}

// ===== SQL智能建议函数 =====

// CREATE TABLE 建议
function getCreateTableSuggestions(prefix) {
    const suggestions = [
        { caption: 'INT', value: 'INT', meta: 'datatype', doc: '整数类型' },
        { caption: 'VARCHAR', value: 'VARCHAR', meta: 'datatype', doc: '可变长度字符串' },
        { caption: 'TEXT', value: 'TEXT', meta: 'datatype', doc: '长文本类型' },
        { caption: 'DATETIME', value: 'DATETIME', meta: 'datatype', doc: '日期时间类型' },
        { caption: 'TIMESTAMP', value: 'TIMESTAMP', meta: 'datatype', doc: '时间戳类型' },
        { caption: 'PRIMARY KEY', value: 'PRIMARY KEY', meta: 'constraint', doc: '主键约束' },
        { caption: 'FOREIGN KEY', value: 'FOREIGN KEY', meta: 'constraint', doc: '外键约束' },
        { caption: 'NOT NULL', value: 'NOT NULL', meta: 'constraint', doc: '非空约束' },
        { caption: 'UNIQUE', value: 'UNIQUE', meta: 'constraint', doc: '唯一约束' },
        { caption: 'DEFAULT', value: 'DEFAULT', meta: 'constraint', doc: '默认值' },
        { caption: 'AUTO_INCREMENT', value: 'AUTO_INCREMENT', meta: 'option', doc: '自增属性' },
        { caption: 'ENGINE=InnoDB', value: 'ENGINE=InnoDB', meta: 'option', doc: '存储引擎' },
        { caption: 'CHARSET=utf8mb4', value: 'CHARSET=utf8mb4', meta: 'option', doc: '字符集' }
    ];

    return suggestions.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// ALTER TABLE 建议
function getAlterTableSuggestions(prefix) {
    return [
        { caption: 'ADD COLUMN', value: 'ADD COLUMN', meta: 'operation', doc: '添加列' },
        { caption: 'DROP COLUMN', value: 'DROP COLUMN', meta: 'operation', doc: '删除列' },
        { caption: 'MODIFY COLUMN', value: 'MODIFY COLUMN', meta: 'operation', doc: '修改列' },
        { caption: 'ADD PRIMARY KEY', value: 'ADD PRIMARY KEY', meta: 'operation', doc: '添加主键' },
        { caption: 'ADD FOREIGN KEY', value: 'ADD FOREIGN KEY', meta: 'operation', doc: '添加外键' },
        { caption: 'ADD INDEX', value: 'ADD INDEX', meta: 'operation', doc: '添加索引' },
        { caption: 'DROP INDEX', value: 'DROP INDEX', meta: 'operation', doc: '删除索引' },
        { caption: 'RENAME TO', value: 'RENAME TO', meta: 'operation', doc: '重命名表' }
    ].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// INSERT INTO 建议
function getInsertIntoSuggestions(prefix) {
    return [
        { caption: 'VALUES', value: 'VALUES', meta: 'keyword', doc: '插入值' },
        { caption: 'SELECT', value: 'SELECT', meta: 'keyword', doc: '插入查询结果' },
        { caption: 'DEFAULT VALUES', value: 'DEFAULT VALUES', meta: 'option', doc: '默认值' },
        { caption: 'ON DUPLICATE KEY UPDATE', value: 'ON DUPLICATE KEY UPDATE', meta: 'option', doc: '键冲突时更新' }
    ].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// UPDATE SET 建议
function getUpdateSetSuggestions(prefix) {
    const operators = [
        { caption: '=', value: '=', meta: 'operator', doc: '等于' },
        { caption: '+', value: '+', meta: 'operator', doc: '加' },
        { caption: '-', value: '-', meta: 'operator', doc: '减' },
        { caption: '*', value: '*', meta: 'operator', doc: '乘' },
        { caption: '/', value: '/', meta: 'operator', doc: '除' }
    ];

    const functions = [
        { caption: 'NOW()', value: 'NOW()', meta: 'function', doc: '当前时间' },
        { caption: 'CURRENT_TIMESTAMP', value: 'CURRENT_TIMESTAMP', meta: 'function', doc: '当前时间戳' },
        { caption: 'CONCAT()', value: 'CONCAT()', meta: 'function', doc: '字符串连接' },
        { caption: 'UPPER()', value: 'UPPER()', meta: 'function', doc: '转大写' },
        { caption: 'LOWER()', value: 'LOWER()', meta: 'function', doc: '转小写' }
    ];

    return [...operators, ...functions].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// DELETE FROM 建议
function getDeleteFromSuggestions(prefix) {
    return [
        { caption: 'WHERE', value: 'WHERE', meta: 'keyword', doc: '条件删除' },
        { caption: 'ORDER BY', value: 'ORDER BY', meta: 'keyword', doc: '排序删除' },
        { caption: 'LIMIT', value: 'LIMIT', meta: 'keyword', doc: '限制删除数量' },
        { caption: 'INNER JOIN', value: 'INNER JOIN', meta: 'keyword', doc: '关联删除' }
    ].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// SELECT 列建议
function getSelectColumnsSuggestions(prefix) {
    const aggregateFunctions = [
        { caption: 'COUNT(*)', value: 'COUNT(*)', meta: 'function', doc: '计数' },
        { caption: 'SUM()', value: 'SUM()', meta: 'function', doc: '求和' },
        { caption: 'AVG()', value: 'AVG()', meta: 'function', doc: '平均值' },
        { caption: 'MAX()', value: 'MAX()', meta: 'function', doc: '最大值' },
        { caption: 'MIN()', value: 'MIN()', meta: 'function', doc: '最小值' },
        { caption: 'DISTINCT', value: 'DISTINCT', meta: 'keyword', doc: '去重' }
    ];

    const columnAliases = [
        { caption: 'AS', value: 'AS', meta: 'keyword', doc: '别名' }
    ];

    return [...aggregateFunctions, ...columnAliases].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// WHERE 条件建议
function getWhereConditionSuggestions(prefix) {
    const operators = [
        { caption: '=', value: '=', meta: 'operator', doc: '等于' },
        { caption: '!=', value: '!=', meta: 'operator', doc: '不等于' },
        { caption: '<>', value: '<>', meta: 'operator', doc: '不等于' },
        { caption: '>', value: '>', meta: 'operator', doc: '大于' },
        { caption: '<', value: '<', meta: 'operator', doc: '小于' },
        { caption: '>=', value: '>=', meta: 'operator', doc: '大于等于' },
        { caption: '<=', value: '<=', meta: 'operator', doc: '小于等于' },
        { caption: 'LIKE', value: 'LIKE', meta: 'operator', doc: '模糊匹配' },
        { caption: 'NOT LIKE', value: 'NOT LIKE', meta: 'operator', doc: '不匹配' },
        { caption: 'IN', value: 'IN', meta: 'operator', doc: '在范围内' },
        { caption: 'NOT IN', value: 'NOT IN', meta: 'operator', doc: '不在范围内' },
        { caption: 'BETWEEN', value: 'BETWEEN', meta: 'operator', doc: '在区间内' },
        { caption: 'IS NULL', value: 'IS NULL', meta: 'operator', doc: '为空' },
        { caption: 'IS NOT NULL', value: 'IS NOT NULL', meta: 'operator', doc: '不为空' }
    ];

    const logicalOperators = [
        { caption: 'AND', value: 'AND', meta: 'logical', doc: '并且' },
        { caption: 'OR', value: 'OR', meta: 'logical', doc: '或者' },
        { caption: 'NOT', value: 'NOT', meta: 'logical', doc: '非' }
    ];

    const functions = [
        { caption: 'NOW()', value: 'NOW()', meta: 'function', doc: '当前时间' },
        { caption: 'CURDATE()', value: 'CURDATE()', meta: 'function', doc: '当前日期' },
        { caption: 'DATE()', value: 'DATE()', meta: 'function', doc: '日期部分' },
        { caption: 'MONTH()', value: 'MONTH()', meta: 'function', doc: '月份' },
        { caption: 'YEAR()', value: 'YEAR()', meta: 'function', doc: '年份' }
    ];

    return [...operators, ...logicalOperators, ...functions].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// SQL自动补全设置


// 分析SQL上下文
function analyzeSQLContext(line, column) {
    const textBefore = line.substring(0, column).toLowerCase();
    const words = textBefore.split(/\s+/).filter(w => w);

    let statementType = '';
    let clauseType = '';

    if (words.includes('create') && words.includes('table')) {
        statementType = 'CREATE TABLE';
    } else if (words.includes('insert') && words.includes('into')) {
        statementType = 'INSERT INTO';
    } else if (words.includes('select')) {
        statementType = 'SELECT';
        if (words.includes('where')) clauseType = 'WHERE';
        if (words.includes('join')) clauseType = 'JOIN';
        if (words.includes('group') && words.includes('by')) clauseType = 'GROUP BY';
        if (words.includes('order') && words.includes('by')) clauseType = 'ORDER BY';
    } else if (words.includes('update')) {
        statementType = 'UPDATE';
        if (words.includes('set')) clauseType = 'SET';
        if (words.includes('where')) clauseType = 'WHERE';
    } else if (words.includes('delete')) {
        statementType = 'DELETE';
        if (words.includes('where')) clauseType = 'WHERE';
    }

    return { statementType, clauseType, words, textBefore };
}

// 分析Redis上下文
function analyzeRedisContext(line, column) {
    const textBefore = line.substring(0, column).toUpperCase();
    const words = textBefore.split(/\s+/).filter(w => w);

    let commandType = '';
    if (words.length > 0) {
        commandType = words[0];
    }

    return { commandType, words, textBefore };
}

// 获取通用SQL建议
function getGeneralSQLSuggestions(prefix, context) {
    const keywords = [
        { caption: 'SELECT', value: 'SELECT', meta: 'keyword', doc: '查询数据' },
        { caption: 'FROM', value: 'FROM', meta: 'keyword', doc: '指定表' },
        { caption: 'WHERE', value: 'WHERE', meta: 'keyword', doc: '条件过滤' },
        { caption: 'INSERT', value: 'INSERT', meta: 'keyword', doc: '插入数据' },
        { caption: 'INTO', value: 'INTO', meta: 'keyword', doc: '插入到表' },
        { caption: 'VALUES', value: 'VALUES', meta: 'keyword', doc: '值列表' },
        { caption: 'UPDATE', value: 'UPDATE', meta: 'keyword', doc: '更新数据' },
        { caption: 'SET', value: 'SET', meta: 'keyword', doc: '设置字段' },
        { caption: 'DELETE', value: 'DELETE', meta: 'keyword', doc: '删除数据' },
        { caption: 'CREATE', value: 'CREATE', meta: 'keyword', doc: '创建' },
        { caption: 'TABLE', value: 'TABLE', meta: 'keyword', doc: '表' },
        { caption: 'DROP', value: 'DROP', meta: 'keyword', doc: '删除' },
        { caption: 'ALTER', value: 'ALTER', meta: 'keyword', doc: '修改' },
        { caption: 'INDEX', value: 'INDEX', meta: 'keyword', doc: '索引' },
        { caption: 'JOIN', value: 'JOIN', meta: 'keyword', doc: '连接' },
        { caption: 'LEFT JOIN', value: 'LEFT JOIN', meta: 'keyword', doc: '左连接' },
        { caption: 'RIGHT JOIN', value: 'RIGHT JOIN', meta: 'keyword', doc: '右连接' },
        { caption: 'INNER JOIN', value: 'INNER JOIN', meta: 'keyword', doc: '内连接' },
        { caption: 'ON', value: 'ON', meta: 'keyword', doc: '连接条件' },
        { caption: 'GROUP BY', value: 'GROUP BY', meta: 'keyword', doc: '分组' },
        { caption: 'ORDER BY', value: 'ORDER BY', meta: 'keyword', doc: '排序' },
        { caption: 'HAVING', value: 'HAVING', meta: 'keyword', doc: '分组过滤' },
        { caption: 'LIMIT', value: 'LIMIT', meta: 'keyword', doc: '限制行数' },
        { caption: 'OFFSET', value: 'OFFSET', meta: 'keyword', doc: '偏移量' },
        { caption: 'UNION', value: 'UNION', meta: 'keyword', doc: '合并结果' },
        { caption: 'DISTINCT', value: 'DISTINCT', meta: 'keyword', doc: '去重' },
        { caption: 'COUNT', value: 'COUNT', meta: 'function', doc: '计数' },
        { caption: 'SUM', value: 'SUM', meta: 'function', doc: '求和' },
        { caption: 'AVG', value: 'AVG', meta: 'function', doc: '平均值' },
        { caption: 'MAX', value: 'MAX', meta: 'function', doc: '最大值' },
        { caption: 'MIN', value: 'MIN', meta: 'function', doc: '最小值' }
    ];

    return keywords.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 获取CREATE TABLE建议
function getCreateTableSuggestions(prefix, context) {
    const dataTypes = [
        { caption: 'INT', value: 'INT', meta: 'type', doc: '整数' },
        { caption: 'VARCHAR', value: 'VARCHAR', meta: 'type', doc: '可变字符串' },
        { caption: 'CHAR', value: 'CHAR', meta: 'type', doc: '固定字符串' },
        { caption: 'TEXT', value: 'TEXT', meta: 'type', doc: '文本' },
        { caption: 'DATE', value: 'DATE', meta: 'type', doc: '日期' },
        { caption: 'DATETIME', value: 'DATETIME', meta: 'type', doc: '日期时间' },
        { caption: 'TIMESTAMP', value: 'TIMESTAMP', meta: 'type', doc: '时间戳' },
        { caption: 'DECIMAL', value: 'DECIMAL', meta: 'type', doc: '小数' },
        { caption: 'FLOAT', value: 'FLOAT', meta: 'type', doc: '浮点数' },
        { caption: 'DOUBLE', value: 'DOUBLE', meta: 'type', doc: '双精度' },
        { caption: 'BOOLEAN', value: 'BOOLEAN', meta: 'type', doc: '布尔值' },
        { caption: 'PRIMARY KEY', value: 'PRIMARY KEY', meta: 'constraint', doc: '主键' },
        { caption: 'FOREIGN KEY', value: 'FOREIGN KEY', meta: 'constraint', doc: '外键' },
        { caption: 'NOT NULL', value: 'NOT NULL', meta: 'constraint', doc: '非空' },
        { caption: 'UNIQUE', value: 'UNIQUE', meta: 'constraint', doc: '唯一' },
        { caption: 'AUTO_INCREMENT', value: 'AUTO_INCREMENT', meta: 'constraint', doc: '自增' },
        { caption: 'DEFAULT', value: 'DEFAULT', meta: 'constraint', doc: '默认值' }
    ];

    return dataTypes.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 获取INSERT INTO建议
function getInsertIntoSuggestions(prefix, context) {
    const keywords = [
        { caption: 'VALUES', value: 'VALUES', meta: 'keyword', doc: '值列表' },
        { caption: 'NULL', value: 'NULL', meta: 'value', doc: '空值' },
        { caption: 'NOW()', value: 'NOW()', meta: 'function', doc: '当前时间' },
        { caption: 'CURDATE()', value: 'CURDATE()', meta: 'function', doc: '当前日期' },
        { caption: 'UUID()', value: 'UUID()', meta: 'function', doc: 'UUID' }
    ];

    return keywords.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 获取SELECT建议
function getSelectSuggestions(prefix, context) {
    const keywords = [
        { caption: '*', value: '*', meta: 'wildcard', doc: '所有字段' },
        { caption: 'DISTINCT', value: 'DISTINCT', meta: 'keyword', doc: '去重' },
        { caption: 'COUNT', value: 'COUNT', meta: 'function', doc: '计数' },
        { caption: 'SUM', value: 'SUM', meta: 'function', doc: '求和' },
        { caption: 'AVG', value: 'AVG', meta: 'function', doc: '平均值' },
        { caption: 'MAX', value: 'MAX', meta: 'function', doc: '最大值' },
        { caption: 'MIN', value: 'MIN', meta: 'function', doc: '最小值' },
        { caption: 'GROUP_CONCAT', value: 'GROUP_CONCAT', meta: 'function', doc: '分组连接' },
        { caption: 'CONCAT', value: 'CONCAT', meta: 'function', doc: '字符串连接' },
        { caption: 'SUBSTRING', value: 'SUBSTRING', meta: 'function', doc: '子字符串' },
        { caption: 'LENGTH', value: 'LENGTH', meta: 'function', doc: '长度' },
        { caption: 'LOWER', value: 'LOWER', meta: 'function', doc: '转小写' },
        { caption: 'UPPER', value: 'UPPER', meta: 'function', doc: '转大写' },
        { caption: 'TRIM', value: 'TRIM', meta: 'function', doc: '去空格' }
    ];

    return keywords.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 获取WHERE建议
function getWhereSuggestions(prefix, context) {
    const operators = [
        { caption: '=', value: '=', meta: 'operator', doc: '等于' },
        { caption: '!=', value: '!=', meta: 'operator', doc: '不等于' },
        { caption: '<>', value: '<>', meta: 'operator', doc: '不等于' },
        { caption: '>', value: '>', meta: 'operator', doc: '大于' },
        { caption: '<', value: '<', meta: 'operator', doc: '小于' },
        { caption: '>=', value: '>=', meta: 'operator', doc: '大于等于' },
        { caption: '<=', value: '<=', meta: 'operator', doc: '小于等于' },
        { caption: 'LIKE', value: 'LIKE', meta: 'operator', doc: '模糊匹配' },
        { caption: 'NOT LIKE', value: 'NOT LIKE', meta: 'operator', doc: '不匹配' },
        { caption: 'IN', value: 'IN', meta: 'operator', doc: '在范围内' },
        { caption: 'NOT IN', value: 'NOT IN', meta: 'operator', doc: '不在范围内' },
        { caption: 'BETWEEN', value: 'BETWEEN', meta: 'operator', doc: '在区间内' },
        { caption: 'IS NULL', value: 'IS NULL', meta: 'operator', doc: '为空' },
        { caption: 'IS NOT NULL', value: 'IS NOT NULL', meta: 'operator', doc: '不为空' }
    ];

    const logicalOperators = [
        { caption: 'AND', value: 'AND', meta: 'logical', doc: '并且' },
        { caption: 'OR', value: 'OR', meta: 'logical', doc: '或者' },
        { caption: 'NOT', value: 'NOT', meta: 'logical', doc: '非' }
    ];

    const functions = [
        { caption: 'NOW()', value: 'NOW()', meta: 'function', doc: '当前时间' },
        { caption: 'CURDATE()', value: 'CURDATE()', meta: 'function', doc: '当前日期' },
        { caption: 'DATE()', value: 'DATE()', meta: 'function', doc: '日期部分' },
        { caption: 'MONTH()', value: 'MONTH()', meta: 'function', doc: '月份' },
        { caption: 'YEAR()', value: 'YEAR()', meta: 'function', doc: '年份' }
    ];

    return [...operators, ...logicalOperators, ...functions].filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 获取通用Redis建议
function getGeneralRedisSuggestions(prefix, context) {
    const commands = [
        { caption: 'SET', value: 'SET', meta: 'command', doc: '设置键值' },
        { caption: 'GET', value: 'GET', meta: 'command', doc: '获取键值' },
        { caption: 'DEL', value: 'DEL', meta: 'command', doc: '删除键' },
        { caption: 'EXISTS', value: 'EXISTS', meta: 'command', doc: '检查键是否存在' },
        { caption: 'EXPIRE', value: 'EXPIRE', meta: 'command', doc: '设置过期时间' },
        { caption: 'TTL', value: 'TTL', meta: 'command', doc: '获取剩余时间' },
        { caption: 'KEYS', value: 'KEYS', meta: 'command', doc: '查找键' },
        { caption: 'TYPE', value: 'TYPE', meta: 'command', doc: '获取键类型' },
        { caption: 'HSET', value: 'HSET', meta: 'command', doc: '设置哈希字段' },
        { caption: 'HGET', value: 'HGET', meta: 'command', doc: '获取哈希字段' },
        { caption: 'HGETALL', value: 'HGETALL', meta: 'command', doc: '获取所有哈希字段' },
        { caption: 'HDEL', value: 'HDEL', meta: 'command', doc: '删除哈希字段' },
        { caption: 'HEXISTS', value: 'HEXISTS', meta: 'command', doc: '检查哈希字段' },
        { caption: 'HKEYS', value: 'HKEYS', meta: 'command', doc: '获取哈希键' },
        { caption: 'HVALS', value: 'HVALS', meta: 'command', doc: '获取哈希值' },
        { caption: 'HLEN', value: 'HLEN', meta: 'command', doc: '获取哈希长度' },
        { caption: 'LPUSH', value: 'LPUSH', meta: 'command', doc: '左推入列表' },
        { caption: 'RPUSH', value: 'RPUSH', meta: 'command', doc: '右推入列表' },
        { caption: 'LPOP', value: 'LPOP', meta: 'command', doc: '左弹出列表' },
        { caption: 'RPOP', value: 'RPOP', meta: 'command', doc: '右弹出列表' },
        { caption: 'LLEN', value: 'LLEN', meta: 'command', doc: '获取列表长度' },
        { caption: 'LRANGE', value: 'LRANGE', meta: 'command', doc: '获取列表范围' },
        { caption: 'SADD', value: 'SADD', meta: 'command', doc: '添加集合成员' },
        { caption: 'SREM', value: 'SREM', meta: 'command', doc: '删除集合成员' },
        { caption: 'SMEMBERS', value: 'SMEMBERS', meta: 'command', doc: '获取集合成员' },
        { caption: 'SCARD', value: 'SCARD', meta: 'command', doc: '获取集合大小' },
        { caption: 'SISMEMBER', value: 'SISMEMBER', meta: 'command', doc: '检查集合成员' },
        { caption: 'ZADD', value: 'ZADD', meta: 'command', doc: '添加有序集合成员' },
        { caption: 'ZREM', value: 'ZREM', meta: 'command', doc: '删除有序集合成员' },
        { caption: 'ZRANGE', value: 'ZRANGE', meta: 'command', doc: '获取有序集合范围' },
        { caption: 'ZSCORE', value: 'ZSCORE', meta: 'command', doc: '获取有序集合分数' },
        { caption: 'ZCARD', value: 'ZCARD', meta: 'command', doc: '获取有序集合大小' }
    ];

    return commands.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 获取SET命令建议
function getSetCommandSuggestions(prefix, context) {
    const options = [
        { caption: 'EX', value: 'EX', meta: 'option', doc: '过期时间（秒）' },
        { caption: 'PX', value: 'PX', meta: 'option', doc: '过期时间（毫秒）' },
        { caption: 'NX', value: 'NX', meta: 'option', doc: '不存在时设置' },
        { caption: 'XX', value: 'XX', meta: 'option', doc: '存在时设置' }
    ];

    return options.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 获取GET命令建议
function getGetCommandSuggestions(prefix, context) {
    return getGeneralRedisSuggestions(prefix, context);
}

// 获取HSET命令建议
function getHSetCommandSuggestions(prefix, context) {
    return [];
}

// 获取HGET命令建议
function getHGetCommandSuggestions(prefix, context) {
    return [];
}

// 获取KEYS命令建议
function getKeysCommandSuggestions(prefix, context) {
    const patterns = [
        { caption: '*', value: '*', meta: 'pattern', doc: '所有键' },
        { caption: '*:*', value: '*:*', meta: 'pattern', doc: '包含冒号的键' },
        { caption: 'user:*', value: 'user:*', meta: 'pattern', doc: '用户相关键' },
        { caption: 'session:*', value: 'session:*', meta: 'pattern', doc: '会话相关键' },
        { caption: 'cache:*', value: 'cache:*', meta: 'pattern', doc: '缓存相关键' }
    ];

    return patterns.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 获取JOIN建议
function getJoinSuggestions(prefix, context) {
    const joinTypes = [
        { caption: 'INNER JOIN', value: 'INNER JOIN', meta: 'keyword', doc: '内连接' },
        { caption: 'LEFT JOIN', value: 'LEFT JOIN', meta: 'keyword', doc: '左连接' },
        { caption: 'RIGHT JOIN', value: 'RIGHT JOIN', meta: 'keyword', doc: '右连接' },
        { caption: 'FULL JOIN', value: 'FULL JOIN', meta: 'keyword', doc: '全连接' },
        { caption: 'ON', value: 'ON', meta: 'keyword', doc: '连接条件' },
        { caption: 'USING', value: 'USING', meta: 'keyword', doc: '使用字段连接' }
    ];

    return joinTypes.filter(item =>
        item.caption.toLowerCase().includes(prefix.toLowerCase())
    );
}

// 连接变更处理
async function onConnectionChange() {
    const connectionId = $('#currentConnection').val();
    const connection = connections.find(conn => conn.id === connectionId);

    if (connection) {
        console.log(`切换到连接: ${connection.name}, 类型: ${connection.type}`);
        switchEditorMode(connection.type);

        // 更新当前连接ID
        currentConnectionId = connectionId;

        // 清除当前数据库结构
        currentDbStructure = null;

        // 加载数据库列表
        await loadDatabases(connectionId);

        // 更新备份恢复的数据库选择器
        updateDatabaseSelects();
    }
}

// 加载数据库列表
async function loadDatabases(connectionId) {
    const connection = connections.find(conn => conn.id === connectionId);
    if (!connection) return;

    const databaseSelect = $('#currentDatabase');
    databaseSelect.empty();
    databaseSelect.append('<option value="">请选择数据库</option>');

    try {
        if (connection.type === 'redis') {
            // Redis数据库通常是0-15
            for (let i = 0; i < 16; i++) {
                databaseSelect.append(`<option value="${i}">数据库 ${i}</option>`);
            }
            databaseSelect.val(connection.config.db || 0);
        } else if (connection.type === 'mysql' || connection.type === 'postgresql') {
            // MySQL/PostgreSQL数据库，调用API获取完整列表
            const response = await fetch(`/api/structure/${connectionId}`);
            const result = await response.json();

            if (result.success) {
                result.data.forEach(db => {
                    databaseSelect.append(`<option value="${db.name}">${db.name}</option>`);
                });
                // 设置当前选择的数据库
                if (connection.config.database) {
                    databaseSelect.val(connection.config.database);
                }
            } else {
                console.error('加载数据库列表失败:', result.error);
                databaseSelect.append('<option value="">加载失败</option>');
            }
        }
    } catch (error) {
        console.error('加载数据库列表失败:', error);
        databaseSelect.append('<option value="">加载失败</option>');
    }
}

// 数据库变更处理
function onDatabaseChange() {
    const database = $('#currentDatabase').val();
    const connectionId = $('#currentConnection').val();
    const connection = connections.find(conn => conn.id === connectionId);

    console.log(`数据库切换到: ${database}`);

    if (!connection) return;

    // 如果是Redis连接，处理Redis数据库切换
    if (connection.type === 'redis') {
        console.log(`切换到Redis数据库: ${database}`);
        // 更新连接配置中的数据库编号
        connection.config.db = parseInt(database);
        // 显示通知
        showNotification(`已切换到Redis数据库 ${database}`, 'info');
        return;
    }

    // 如果是MySQL连接，处理MySQL数据库切换
    if (connection.type === 'mysql') {
        console.log(`切换到MySQL数据库: ${database}`);
        // 更新连接配置中的数据库名
        connection.config.database = database;
        // 清空所有表选择器，等待重新加载
        $('#tableSelector, #structureTableSelector, #exportSourceTable').each(function() {
            $(this).empty();
            $(this).append('<option value="">选择表</option>');
        });
        // 获取数据库结构以用于自动补全和表选择器更新
        loadDatabaseStructureForAutoComplete(connectionId, database);
        showNotification(`已切换到MySQL数据库 ${database}`, 'info');
    }
}

// 获取数据库结构用于自动补全
async function loadDatabaseStructureForAutoComplete(connectionId, database) {
    const cacheKey = `${connectionId}_${database}`;

    // 检查缓存
    if (dbStructureCache[cacheKey]) {
        console.log('📋 [DEBUG] 从缓存加载数据库结构:', cacheKey);
        currentDbStructure = dbStructureCache[cacheKey];
        updateSQLAutocompletionWithDBStructure();
        return;
    }

    try {
        console.log('🔄 [DEBUG] 从服务器获取数据库结构:', { connectionId, database });
        showLoading('正在加载表结构...');

        const response = await fetch(`/api/structure/${connectionId}/${database}`);
        const result = await response.json();

        if (result.success && result.data) {
            // 处理数据库结构数据
            const structure = {
                tables: {},
                connectionId: connectionId,
                database: database,
                loadedAt: new Date().toISOString()
            };

            // 处理表和字段信息
            result.data.forEach(tableInfo => {
                const tableName = tableInfo.table_name || tableInfo.TABLE_NAME;
                let columns = [];

                // 检查columns字段的结构
                if (tableInfo.columns) {
                    if (Array.isArray(tableInfo.columns)) {
                        columns = tableInfo.columns;
                    } else if (tableInfo.columns.columns && Array.isArray(tableInfo.columns.columns)) {
                        columns = tableInfo.columns.columns;
                    }
                }

                structure.tables[tableName] = {
                    name: tableName,
                    columns: columns.map(col => ({
                        name: col.column_name || col.COLUMN_NAME,
                        type: col.data_type || col.DATA_TYPE,
                        isNullable: col.is_nullable || col.IS_NULLABLE,
                        defaultValue: col.column_default || col.COLUMN_DEFAULT
                    }))
                };
            });

            // 缓存结构
            dbStructureCache[cacheKey] = structure;
            currentDbStructure = structure;

            console.log('✅ [DEBUG] 数据库结构加载完成:', {
                tables: Object.keys(structure.tables).length,
                cacheKey: cacheKey
            });

            // 更新表选择器
            const tableData = [{
                name: database,
                tables: Object.keys(structure.tables)
            }];
            updateTableSelectors(tableData);

            // 更新SQL自动补全
            updateSQLAutocompletionWithDBStructure();

        } else {
            console.error('❌ [DEBUG] 获取数据库结构失败:', result.message);
            showNotification('获取表结构失败', 'error');
        }
    } catch (error) {
        console.error('❌ [DEBUG] 加载数据库结构时出错:', error);
        showNotification('加载表结构时出错', 'error');
    } finally {
        hideLoading();
    }
}

// 更新SQL自动补全以包含数据库结构
function updateSQLAutocompletionWithDBStructure() {
    if (!sqlEditor || !currentDbStructure) {
        console.log('⚠️ [DEBUG] 编辑器或数据库结构未初始化');
        return;
    }

    console.log('🔄 [DEBUG] 更新SQL自动补全以包含数据库结构');

    // 创建新的补全器，包含数据库结构信息
    const sqlCompleterWithDB = {
        getCompletions: function(editor, session, pos, prefix, callback) {
            const line = session.getLine(pos.row);
            const textBeforeCursor = line.substring(0, pos.column);
            const context = analyzeSQLContext(line, pos.column);

            console.log('🎯 [DEBUG] SQL自动补全触发:', {
                prefix: prefix,
                context: context,
                hasDbStructure: !!currentDbStructure
            });

            let suggestions = [];

            // 根据上下文获取建议
            if (context.statementType === 'SELECT' && context.clauseType === 'SELECT') {
                suggestions = getSelectFieldSuggestions(prefix, context);
            } else if (context.clauseType === 'FROM' || context.clauseType === 'JOIN') {
                suggestions = getTableSuggestions(prefix, context);
            } else if (context.clauseType === 'WHERE') {
                suggestions = getWhereFieldSuggestions(prefix, context);
            } else if (context.statementType === 'INSERT') {
                suggestions = getInsertFieldSuggestions(prefix, context);
            } else if (context.statementType === 'UPDATE') {
                suggestions = getUpdateFieldSuggestions(prefix, context);
            } else {
                suggestions = getGeneralSQLSuggestions(prefix, context);
            }

            console.log('🎯 [DEBUG] SQL建议数量:', suggestions.length);
            callback(null, suggestions);
        }
    };

    // 更新编辑器的补全器
    const existingCompleters = sqlEditor.completers || [];
    const nonSQLCompleters = existingCompleters.filter(c =>
        c !== sqlEditor.completers.find(comp => comp.getCompletions === sqlCompleterWithDB.getCompletions)
    );

    sqlEditor.completers = [...nonSQLCompleters, sqlCompleterWithDB];

    console.log('✅ [DEBUG] SQL自动补全已更新，包含数据库结构');
}

// 获取表名建议
function getTableSuggestions(prefix, context) {
    if (!currentDbStructure) return [];

    const tableNames = Object.keys(currentDbStructure.tables);

    return tableNames
        .filter(tableName => tableName.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(tableName => ({
            caption: tableName,
            value: tableName,
            meta: 'table',
            doc: `表: ${tableName}`,
            score: 1000
        }));
}

// 获取SELECT字段建议
function getSelectFieldSuggestions(prefix, context) {
    let suggestions = [];

    // 添加通用的SQL关键字和函数
    const generalKeywords = [
        { caption: '*', value: '*', meta: 'wildcard', doc: '所有字段', score: 1000 },
        { caption: 'DISTINCT', value: 'DISTINCT', meta: 'keyword', doc: '去重', score: 900 },
        { caption: 'COUNT', value: 'COUNT(', meta: 'function', doc: '计数', score: 800 },
        { caption: 'SUM', value: 'SUM(', meta: 'function', doc: '求和', score: 800 },
        { caption: 'AVG', value: 'AVG(', meta: 'function', doc: '平均值', score: 800 },
        { caption: 'MAX', value: 'MAX(', meta: 'function', doc: '最大值', score: 800 },
        { caption: 'MIN', value: 'MIN(', meta: 'function', doc: '最小值', score: 800 }
    ];

    suggestions = generalKeywords.filter(item =>
        item.caption.toLowerCase().startsWith(prefix.toLowerCase())
    );

    // 如果有数据库结构，添加表字段建议
    if (currentDbStructure && prefix.length > 0) {
        const fieldSuggestions = getFieldSuggestions(prefix, context);
        suggestions = [...suggestions, ...fieldSuggestions];
    }

    return suggestions;
}

// 获取字段建议
function getFieldSuggestions(prefix, context) {
    if (!currentDbStructure) return [];

    let fieldSuggestions = [];

    // 遍历所有表，收集匹配的字段
    Object.entries(currentDbStructure.tables).forEach(([tableName, tableInfo]) => {
        tableInfo.columns.forEach(column => {
            if (column.name.toLowerCase().includes(prefix.toLowerCase())) {
                // 精确匹配得分更高
                const score = column.name.toLowerCase().startsWith(prefix.toLowerCase()) ? 950 : 850;

                fieldSuggestions.push({
                    caption: column.name,
                    value: column.name,
                    meta: 'field',
                    doc: `${tableName}.${column.name} (${column.type})`,
                    score: score
                });
            }
        });
    });

    return fieldSuggestions;
}

// 获取WHERE子句字段建议
function getWhereFieldSuggestions(prefix, context) {
    let suggestions = [];

    // 添加WHERE子句关键字
    const whereKeywords = [
        { caption: 'AND', value: 'AND', meta: 'operator', doc: '逻辑与', score: 900 },
        { caption: 'OR', value: 'OR', meta: 'operator', doc: '逻辑或', score: 900 },
        { caption: 'NOT', value: 'NOT', meta: 'operator', doc: '逻辑非', score: 900 },
        { caption: 'IN', value: 'IN', meta: 'operator', doc: '在...中', score: 900 },
        { caption: 'LIKE', value: 'LIKE', meta: 'operator', doc: '模糊匹配', score: 900 },
        { caption: 'BETWEEN', value: 'BETWEEN', meta: 'operator', doc: '在...之间', score: 900 },
        { caption: 'IS NULL', value: 'IS NULL', meta: 'operator', doc: '为空', score: 900 },
        { caption: 'IS NOT NULL', value: 'IS NOT NULL', meta: 'operator', doc: '不为空', score: 900 }
    ];

    suggestions = whereKeywords.filter(item =>
        item.caption.toLowerCase().startsWith(prefix.toLowerCase())
    );

    // 添加字段建议
    if (currentDbStructure) {
        const fieldSuggestions = getFieldSuggestions(prefix, context);
        suggestions = [...suggestions, ...fieldSuggestions];
    }

    return suggestions;
}

// 获取INSERT字段建议
function getInsertFieldSuggestions(prefix, context) {
    if (!currentDbStructure) return [];

    // 尝试从INSERT语句中提取表名
    const match = context.textBefore.match(/INSERT\s+INTO\s+(\w+)/i);
    const tableName = match ? match[1] : null;

    if (tableName && currentDbStructure.tables[tableName]) {
        // 返回特定表的字段
        return currentDbStructure.tables[tableName].columns
            .filter(column => column.name.toLowerCase().includes(prefix.toLowerCase()))
            .map(column => ({
                caption: column.name,
                value: column.name,
                meta: 'field',
                doc: `${tableName}.${column.name} (${column.type})`,
                score: 1000
            }));
    } else {
        // 返回所有字段
        return getFieldSuggestions(prefix, context);
    }
}

// 获取UPDATE字段建议
function getUpdateFieldSuggestions(prefix, context) {
    if (!currentDbStructure) return [];

    // 尝试从UPDATE语句中提取表名
    const match = context.textBefore.match(/UPDATE\s+(\w+)/i);
    const tableName = match ? match[1] : null;

    if (tableName && currentDbStructure.tables[tableName]) {
        // 返回特定表的字段
        return currentDbStructure.tables[tableName].columns
            .filter(column => column.name.toLowerCase().includes(prefix.toLowerCase()))
            .map(column => ({
                caption: column.name,
                value: column.name,
                meta: 'field',
                doc: `${tableName}.${column.name} (${column.type})`,
                score: 1000
            }));
    } else {
        // 返回所有字段
        return getFieldSuggestions(prefix, context);
    }
}

// 切换编辑器模式
function switchEditorMode(connectionType) {
    console.log('🔄 [DEBUG] 开始切换编辑器模式...');
    console.log('📋 [DEBUG] 目标连接类型:', connectionType);

    if (!sqlEditor) {
        console.error('❌ [DEBUG] 编辑器未初始化，无法切换模式');
        return;
    }

    console.log('✅ [DEBUG] 编辑器已初始化，准备切换模式');
    console.log('📊 [DEBUG] 切换前编辑器状态:', {
        currentMode: sqlEditor.session.getMode(),
        completerCount: sqlEditor.completers ? sqlEditor.completers.length : 0,
        liveAutocompletion: sqlEditor.getOption('enableLiveAutocompletion')
    });

    // 移除现有的自动补全器
    const oldCompleters = sqlEditor.completers ? sqlEditor.completers.length : 0;
    sqlEditor.completers = [];
    console.log(`🗑️ [DEBUG] 已移除 ${oldCompleters} 个旧的自动补全器`);

    if (connectionType === 'redis') {
        console.log('🔴 [DEBUG] 切换到Redis模式');
        sqlEditor.session.setMode("ace/mode/text");
        console.log('✅ [DEBUG] 编辑器模式已设置为text模式');

        setupRedisAutocompletion();
        console.log('✅ [DEBUG] Redis自动补全已设置');

        updateEditorLabel('Redis命令编辑器');
        console.log('✅ [DEBUG] 编辑器标签已更新为Redis命令编辑器');

        console.log('🎉 [DEBUG] Redis模式切换完成!');
    } else {
        console.log('🔵 [DEBUG] 切换到SQL模式');
        sqlEditor.session.setMode("ace/mode/sql");
        console.log('✅ [DEBUG] 编辑器模式已设置为sql模式');

        setupEnhancedSQLAutocompletion();
        console.log('✅ [DEBUG] SQL自动补全已设置');

        updateEditorLabel('SQL查询编辑器');
        console.log('✅ [DEBUG] 编辑器标签已更新为SQL查询编辑器');

        console.log('🎉 [DEBUG] SQL模式切换完成!');
    }

    console.log('📊 [DEBUG] 模式切换后编辑器最终状态:', {
        finalMode: sqlEditor.session.getMode(),
        finalCompleterCount: sqlEditor.completers ? sqlEditor.completers.length : 0,
        liveAutocompletion: sqlEditor.getOption('enableLiveAutocompletion'),
        liveAutocompletionDelay: sqlEditor.getOption('liveAutocompletionDelay'),
        liveAutocompletionThreshold: sqlEditor.getOption('liveAutocompletionThreshold')
    });
}

// 测试Redis自动补全功能
function testRedisAutocompletion() {
    console.log('🧪 [DEBUG] 开始测试Redis自动补全功能...');
    console.log('⏰ [DEBUG] 当前时间:', new Date().toISOString());

    // 检查编辑器是否初始化
    if (!sqlEditor) {
        console.error('❌ [DEBUG] 编辑器未初始化，无法测试Redis自动补全');
        return;
    }
    console.log('✅ [DEBUG] 编辑器已初始化');

    // 检查连接列表
    console.log('📋 [DEBUG] 当前连接列表:', connections.map(conn => ({ id: conn.id, name: conn.name, type: conn.type })));

    // 检查是否有Redis连接
    const redisConnection = connections.find(conn => conn.type === 'redis');
    if (!redisConnection) {
        console.error('❌ [DEBUG] 没有找到Redis连接，无法测试');
        return;
    }
    console.log('✅ [DEBUG] 找到Redis连接:', redisConnection.name);

    // 检查当前连接选择器
    const currentSelector = $('#currentConnection').val();
    console.log('📋 [DEBUG] 当前选择的连接:', currentSelector);

    // 切换到Redis连接
    console.log('🔄 [DEBUG] 准备切换到Redis连接:', redisConnection.id);
    $('#currentConnection').val(redisConnection.id);

    // 手动触发连接变更
    console.log('📞 [DEBUG] 手动触发连接变更事件...');
    try {
        onConnectionChange();
        console.log('✅ [DEBUG] 连接变更事件处理完成');
    } catch (error) {
        console.error('❌ [DEBUG] 连接变更事件处理失败:', error);
    }

    // 等待切换完成，然后测试自动补全
    setTimeout(() => {
        console.log('🔍 [DEBUG] 开始检查切换后状态...');

        try {
            const editorState = {
                mode: sqlEditor.session.getMode(),
                completerCount: sqlEditor.completers ? sqlEditor.completers.length : 0,
                label: $('.card-title span').text(),
                value: sqlEditor.getValue(),
                selection: sqlEditor.getSelectionRange()
            };
            console.log('📊 [DEBUG] 编辑器状态:', editorState);

            // 检查是否成功切换到Redis模式
            if (editorState.label.includes('Redis')) {
                console.log('✅ [DEBUG] 成功切换到Redis模式');

                // 在编辑器中插入测试文本
                console.log('✍️ [DEBUG] 在编辑器中插入测试文本 "SE"...');
                sqlEditor.setValue('SE', 1);
                sqlEditor.focus();

                console.log('🎯 [DEBUG] 已插入"SE"，Redis自动补全应该被触发!');
                console.log('💡 [DEBUG] 请在编辑器中等待300ms，查看是否出现自动补全提示');

                // 模拟用户输入，触发自动补全
                setTimeout(() => {
                    console.log('⌨️ [DEBUG] 模拟用户继续输入 "T"...');
                    sqlEditor.insert('T');
                    console.log('🎯 [DEBUG] 当前编辑器内容:', sqlEditor.getValue());
                    console.log('💡 [DEBUG] SET命令自动补全应该被触发!');
                }, 500);

            } else {
                console.error('❌ [DEBUG] 未能切换到Redis模式，当前标签:', editorState.label);
            }

        } catch (error) {
            console.error('❌ [DEBUG] 检查编辑器状态时出错:', error);
        }
    }, 1500);
}

// Redis自动补全设置函数
function setupRedisAutocompletion() {
    console.log('🔧 [DEBUG] 开始设置Redis自动补全...');

    if (!sqlEditor) {
        console.error('❌ [DEBUG] 编辑器未初始化，无法设置Redis自动补全');
        return;
    }

    // 启用Ace Editor的language_tools扩展
    try {
        if (typeof ace.require === 'function') {
            const langTools = ace.require('ace/ext/language_tools');
            console.log('✅ [DEBUG] language_tools扩展已加载');

            // 确保language_tools已启用
            sqlEditor.setOptions({
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: true,
                enableSnippets: true
            });
        }
    } catch (error) {
        console.log('⚠️ [DEBUG] language_tools扩展加载失败:', error);
    }

    console.log('✅ [DEBUG] 编辑器已初始化，开始创建Redis自动补全器');

    // Redis核心命令列表 (参考redis-cli)
    const redisCommands = [
        // 字符串命令
        { caption: 'SET', meta: '设置键值', value: 'SET ' },
        { caption: 'GET', meta: '获取键值', value: 'GET ' },
        { caption: 'SETNX', meta: '不存在时设置', value: 'SETNX ' },
        { caption: 'SETEX', meta: '设置带过期时间', value: 'SETEX ' },
        { caption: 'PSETEX', meta: '设置带毫秒过期', value: 'PSETEX ' },
        { caption: 'MSET', meta: '批量设置', value: 'MSET ' },
        { caption: 'MGET', meta: '批量获取', value: 'MGET ' },
        { caption: 'INCR', meta: '递增', value: 'INCR ' },
        { caption: 'DECR', meta: '递减', value: 'DECR ' },
        { caption: 'INCRBY', meta: '指定递增', value: 'INCRBY ' },
        { caption: 'DECRBY', meta: '指定递减', value: 'DECRBY ' },
        { caption: 'APPEND', meta: '追加', value: 'APPEND ' },
        { caption: 'STRLEN', meta: '字符串长度', value: 'STRLEN ' },

        // 哈希命令
        { caption: 'HSET', meta: '设置哈希字段', value: 'HSET ' },
        { caption: 'HGET', meta: '获取哈希字段', value: 'HGET ' },
        { caption: 'HGETALL', meta: '获取所有哈希字段', value: 'HGETALL ' },
        { caption: 'HDEL', meta: '删除哈希字段', value: 'HDEL ' },
        { caption: 'HEXISTS', meta: '检查哈希字段', value: 'HEXISTS ' },
        { caption: 'HKEYS', meta: '获取哈希键', value: 'HKEYS ' },
        { caption: 'HVALS', meta: '获取哈希值', value: 'HVALS ' },
        { caption: 'HLEN', meta: '哈希长度', value: 'HLEN ' },
        { caption: 'HMSET', meta: '批量设置哈希', value: 'HMSET ' },
        { caption: 'HMGET', meta: '批量获取哈希', value: 'HMGET ' },
        { caption: 'HINCRBY', meta: '哈希递增', value: 'HINCRBY ' },

        // 列表命令
        { caption: 'LPUSH', meta: '左推入', value: 'LPUSH ' },
        { caption: 'RPUSH', meta: '右推入', value: 'RPUSH ' },
        { caption: 'LPOP', meta: '左弹出', value: 'LPOP ' },
        { caption: 'RPOP', meta: '右弹出', value: 'RPOP ' },
        { caption: 'LLEN', meta: '列表长度', value: 'LLEN ' },
        { caption: 'LINDEX', meta: '获取列表元素', value: 'LINDEX ' },
        { caption: 'LRANGE', meta: '获取列表范围', value: 'LRANGE ' },
        { caption: 'LREM', meta: '移除列表元素', value: 'LREM ' },

        // 集合命令
        { caption: 'SADD', meta: '添加集合成员', value: 'SADD ' },
        { caption: 'SREM', meta: '移除集合成员', value: 'SREM ' },
        { caption: 'SMEMBERS', meta: '获取所有成员', value: 'SMEMBERS ' },
        { caption: 'SISMEMBER', meta: '检查成员', value: 'SISMEMBER ' },
        { caption: 'SCARD', meta: '集合大小', value: 'SCARD ' },
        { caption: 'SINTER', meta: '集合交集', value: 'SINTER ' },
        { caption: 'SUNION', meta: '集合并集', value: 'SUNION ' },
        { caption: 'SDIFF', meta: '集合差集', value: 'SDIFF ' },

        // 有序集合命令
        { caption: 'ZADD', meta: '添加有序集合', value: 'ZADD ' },
        { caption: 'ZREM', meta: '移除有序集合', value: 'ZREM ' },
        { caption: 'ZRANGE', meta: '获取有序集合范围', value: 'ZRANGE ' },
        { caption: 'ZREVRANGE', meta: '反向获取范围', value: 'ZREVRANGE ' },
        { caption: 'ZRANK', meta: '获取排名', value: 'ZRANK ' },
        { caption: 'ZSCORE', meta: '获取分数', value: 'ZSCORE ' },
        { caption: 'ZCARD', meta: '有序集合大小', value: 'ZCARD ' },

        // 键命令
        { caption: 'KEYS', meta: '查找键', value: 'KEYS ' },
        { caption: 'DEL', meta: '删除键', value: 'DEL ' },
        { caption: 'EXISTS', meta: '检查键存在', value: 'EXISTS ' },
        { caption: 'EXPIRE', meta: '设置过期时间', value: 'EXPIRE ' },
        { caption: 'TTL', meta: '获取剩余时间', value: 'TTL ' },
        { caption: 'PTTL', meta: '获取毫秒剩余', value: 'PTTL ' },
        { caption: 'TYPE', meta: '获取键类型', value: 'TYPE ' },
        { caption: 'RENAME', meta: '重命名键', value: 'RENAME ' },

        // 数据库命令
        { caption: 'SELECT', meta: '选择数据库', value: 'SELECT ' },
        { caption: 'FLUSHDB', meta: '清空当前数据库', value: 'FLUSHDB' },
        { caption: 'FLUSHALL', meta: '清空所有数据库', value: 'FLUSHALL' },
        { caption: 'DBSIZE', meta: '数据库大小', value: 'DBSIZE' },

        // 服务器命令
        { caption: 'PING', meta: '测试连接', value: 'PING' },
        { caption: 'ECHO', meta: '回显', value: 'ECHO ' },
        { caption: 'INFO', meta: '服务器信息', value: 'INFO' },
        { caption: 'CONFIG', meta: '配置管理', value: 'CONFIG ' },

        // 事务命令
        { caption: 'MULTI', meta: '开始事务', value: 'MULTI' },
        { caption: 'EXEC', meta: '执行事务', value: 'EXEC' },
        { caption: 'DISCARD', meta: '取消事务', value: 'DISCARD' },
        { caption: 'WATCH', meta: '监视键', value: 'WATCH ' },
        { caption: 'UNWATCH', meta: '取消监视', value: 'UNWATCH' }
    ];

    const redisCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
            const line = session.getLine(pos.row);
            const textBefore = line.substring(0, pos.column);

            console.log('🚀 [DEBUG] Redis自动补全触发:', {
                prefix: prefix,
                line: line,
                textBefore: textBefore
            });

            let suggestions = [];

            // 分析当前输入，确定建议类型
            const words = textBefore.trim().split(/\s+/);
            const currentWord = words[words.length - 1] || '';

            if (words.length === 1 || (words.length === 2 && currentWord === prefix)) {
                // 第一个单词，建议Redis命令
                suggestions = redisCommands.filter(cmd =>
                    cmd.caption.toLowerCase().startsWith(prefix.toLowerCase())
                );
                console.log('🎯 [DEBUG] 命令建议数量:', suggestions.length);
            } else if (words.length > 1) {
                // 后续参数，根据命令类型提供建议
                const command = words[0].toUpperCase();
                suggestions = getRedisParameterSuggestions(command, prefix);
                console.log('🎯 [DEBUG] 参数建议数量:', suggestions.length);
            }

            // 如果没有找到建议，提供所有命令
            if (suggestions.length === 0 && prefix.length > 0) {
                suggestions = redisCommands.filter(cmd =>
                    cmd.caption.toLowerCase().includes(prefix.toLowerCase())
                );
                console.log('🎯 [DEBUG] 模糊匹配建议数量:', suggestions.length);
            }

            console.log('✅ [DEBUG] 最终建议数量:', suggestions.length);
            callback(null, suggestions);
        }
    };

    // 清空现有的completers
    sqlEditor.completers = [];

    // 添加Redis自动补全器
    sqlEditor.completers.push(redisCompleter);

    // 强制启用自动补全并设置更敏感的触发条件
    sqlEditor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
        liveAutocompletionDelay: 100,  // 更短的延迟
        liveAutocompletionThreshold: 1  // 更低的阈值
    });

    // 添加键盘输入监听器，自动触发补全
    let lastInputTime = 0;
    sqlEditor.on('change', function(delta) {
        const now = Date.now();

        // 防抖：避免过于频繁的触发
        if (now - lastInputTime < 200) return;
        lastInputTime = now;

        // 安全检查delta对象
        if (!delta || !delta.action || !delta.text) {
            console.log('⚠️ [DEBUG] 无效的delta对象:', delta);
            return;
        }

        // 如果是输入字符（不是删除或其他操作）
        if (delta.action === 'insert' && delta.text && delta.text.length === 1) {
            const pos = sqlEditor.getCursorPosition();
            const line = sqlEditor.session.getLine(pos.row);
            const textBefore = line.substring(0, pos.column);

            console.log('🔤 [DEBUG] 检测到输入:', {
                text: delta.text,
                line: line,
                textBefore: textBefore
            });

            // 延迟触发自动补全
            clearTimeout(sqlEditor._redisAutoCompleteTimer);
            sqlEditor._redisAutoCompleteTimer = setTimeout(() => {
                console.log('🎯 [DEBUG] 自动触发补全检查');

                // 分析当前输入
                const words = textBefore.trim().split(/\s+/);
                const currentWord = words[words.length - 1] || '';

                // 只有当输入长度足够时才触发
                if (currentWord.length >= 1) {
                    console.log('🚀 [DEBUG] 触发自动补全，当前词:', currentWord);
                    sqlEditor.execCommand('startAutocomplete');
                }
            }, 150);
        }
    });

    console.log('✅ [DEBUG] Redis自动补全设置完成!');
    console.log('📊 [DEBUG] 编辑器状态:', {
        completerCount: sqlEditor.completers.length,
        liveAutocompletion: sqlEditor.getOption('enableLiveAutocompletion'),
        liveAutocompletionDelay: sqlEditor.getOption('liveAutocompletionDelay'),
        liveAutocompletionThreshold: sqlEditor.getOption('liveAutocompletionThreshold')
    });

    // 添加Tab键触发自动补全 (类似redis-cli)
    sqlEditor.commands.addCommand({
        name: 'redisTabCompletion',
        bindKey: { win: 'Tab', mac: 'Tab' },
        exec: function(editor) {
            console.log('⌨️ [DEBUG] Tab键触发自动补全');

            // 获取当前位置和内容
            const pos = editor.getCursorPosition();
            const line = editor.session.getLine(pos.row);
            const textBefore = line.substring(0, pos.column);

            console.log('📍 [DEBUG] 当前位置:', pos);
            console.log('📝 [DEBUG] 当前行:', line);
            console.log('🔤 [DEBUG] 光标前文本:', textBefore);

            // 强制触发自动补全显示
            try {
                // 检查是否有可用的补全器
                if (editor.completers && editor.completers.length > 0) {
                    console.log('✅ [DEBUG] 找到补全器，数量:', editor.completers.length);

                    // 方法1: 直接调用startAutocomplete
                    editor.execCommand('startAutocomplete');
                    console.log('🎯 [DEBUG] 已调用startAutocomplete');

                    // 方法2: 强制显示补全popup
                    setTimeout(() => {
                        console.log('🔄 [DEBUG] 尝试手动触发补全显示');

                        // 分析当前输入
                        const words = textBefore.trim().split(/\s+/);
                        const currentWord = words[words.length - 1] || '';
                        console.log('🎯 [DEBUG] 当前词:', currentWord);

                        // 强制显示补全提示
                        if (currentWord.length >= 1) {
                            try {
                                // 尝试多种方法触发补全
                                if (editor.showSuggestions) {
                                    editor.showSuggestions();
                                    console.log('🎉 [DEBUG] 已调用showSuggestions');
                                } else {
                                    editor.execCommand('startAutocomplete');
                                    console.log('🎉 [DEBUG] 已强制触发补全显示');
                                }
                            } catch (e) {
                                console.log('⚠️ [DEBUG] 补全显示失败:', e);
                                editor.execCommand('startAutocomplete');
                            }
                        }
                    }, 10);
                } else {
                    console.error('❌ [DEBUG] 没有找到可用的补全器');
                }
            } catch (error) {
                console.error('❌ [DEBUG] Tab补全出错:', error);
            }

            // 关键：阻止默认Tab行为
            return false;
        },
        readOnly: true
    });

    // 添加Ctrl+Space快捷键作为备选方案
    sqlEditor.commands.addCommand({
        name: 'redisCtrlSpaceCompletion',
        bindKey: { win: 'Ctrl-Space', mac: 'Cmd-Space' },
        exec: function(editor) {
            console.log('⌨️ [DEBUG] Ctrl+Space触发自动补全');
            editor.execCommand('startAutocomplete');
        },
        readOnly: true
    });
}

// 获取Redis参数建议
function getRedisParameterSuggestions(command, prefix) {
    const suggestions = [];

    switch (command) {
        case 'SELECT':
            // 数据库编号 0-15
            for (let i = 0; i <= 15; i++) {
                suggestions.push({
                    caption: i.toString(),
                    meta: '数据库编号',
                    value: i.toString()
                });
            }
            break;

        case 'SET':
            suggestions.push(
                { caption: 'EX', meta: '过期时间(秒)', value: 'EX ' },
                { caption: 'PX', meta: '过期时间(毫秒)', value: 'PX ' },
                { caption: 'NX', meta: '不存在时设置', value: 'NX' },
                { caption: 'XX', meta: '存在时设置', value: 'XX' }
            );
            break;

        case 'KEYS':
            suggestions.push(
                { caption: '*', meta: '所有键', value: '*' },
                { caption: 'user:*', meta: '用户相关键', value: 'user:*' },
                { caption: 'session:*', meta: '会话相关键', value: 'session:*' },
                { caption: 'cache:*', meta: '缓存相关键', value: 'cache:*' }
            );
            break;
    }

    return suggestions.filter(s =>
        s.caption.toLowerCase().startsWith(prefix.toLowerCase())
    );
}

// Redis上下文分析函数
function analyzeRedisContext(line, column) {
    const textBefore = line.substring(0, column);
    const words = textBefore.trim().split(/\s+/);

    const command = words[0] ? words[0].toUpperCase() : 'unknown';
    const currentWord = words[words.length - 1] || '';
    const argumentCount = words.length - 1;

    return {
        command: command,
        currentWord: currentWord,
        argumentCount: argumentCount,
        textBefore: textBefore,
        line: line
    };
}

// Redis命令建议
function getRedisCommandSuggestions(prefix) {
    const commands = [
        'GET', 'SET', 'DEL', 'EXISTS', 'EXPIRE', 'TTL', 'KEYS', 'SCAN',
        'HGET', 'HSET', 'HDEL', 'HEXISTS', 'HKEYS', 'HVALS', 'HGETALL', 'HSCAN',
        'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LLEN', 'LRANGE', 'LINDEX', 'LINSERT',
        'SADD', 'SREM', 'SMEMBERS', 'SISMEMBER', 'SCARD', 'SINTER', 'SUNION', 'SDIFF',
        'ZADD', 'ZREM', 'ZSCORE', 'ZRANGE', 'ZREVRANGE', 'ZRANK', 'ZCOUNT', 'ZCARD',
        'INCR', 'DECR', 'INCRBY', 'DECRBY', 'MGET', 'MSET', 'MSETNX',
        'APPEND', 'STRLEN', 'SETRANGE', 'GETRANGE', 'BITCOUNT', 'BITOP',
        'PUBLISH', 'SUBSCRIBE', 'UNSUBSCRIBE', 'PSUBSCRIBE', 'PUNSUBSCRIBE',
        'MULTI', 'EXEC', 'DISCARD', 'WATCH', 'UNWATCH',
        'PING', 'ECHO', 'SELECT', 'AUTH', 'QUIT', 'FLUSHDB', 'FLUSHALL'
    ];

    return commands
        .filter(cmd => cmd.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(cmd => ({
            caption: cmd,
            value: cmd,
            meta: 'Redis命令',
            score: 1000
        }));
}

// HGETALL命令建议
function getHgetAllSuggestions(context, prefix) {
    if (context.argumentCount === 1) {
        return getRedisKeySuggestions('hash', prefix);
    }
    return [];
}

// SET命令建议
function getSetSuggestions(context, prefix) {
    if (context.argumentCount === 1) {
        return getRedisKeySuggestions('string', prefix);
    } else if (context.argumentCount === 2) {
        return [
            { caption: 'EX', value: 'EX', meta: '过期时间(秒)', score: 900 },
            { caption: 'PX', value: 'PX', meta: '过期时间(毫秒)', score: 900 },
            { caption: 'NX', value: 'NX', meta: '只在键不存在时设置', score: 800 },
            { caption: 'XX', value: 'XX', meta: '只在键存在时设置', score: 800 }
        ].filter(opt => opt.caption.toLowerCase().startsWith(prefix.toLowerCase()));
    }
    return [];
}

// GET命令建议
function getGetSuggestions(context, prefix) {
    if (context.argumentCount === 1) {
        return getRedisKeySuggestions('string', prefix);
    }
    return [];
}

// HSET命令建议
function getHsetSuggestions(context, prefix) {
    if (context.argumentCount === 1) {
        return getRedisKeySuggestions('hash', prefix);
    }
    return [];
}

// KEYS命令建议
function getKeysSuggestions(context, prefix) {
    if (context.argumentCount === 1) {
        return [
            { caption: '*', value: '*', meta: '所有键', score: 1000 },
            { caption: 'user:*', value: 'user:*', meta: '用户相关键', score: 900 },
            { caption: 'session:*', value: 'session:*', meta: '会话相关键', score: 900 },
            { caption: 'cache:*', value: 'cache:*', meta: '缓存相关键', score: 900 }
        ].filter(pattern => pattern.caption.toLowerCase().startsWith(prefix.toLowerCase()));
    }
    return [];
}

// 通用Redis建议
function getGeneralRedisSuggestions(context, prefix) {
    return getRedisKeySuggestions('*', prefix);
}

// 获取Redis键建议（模拟）
function getRedisKeySuggestions(type, prefix) {
    const mockKeys = [
        'user:1', 'user:2', 'user:session:123',
        'cache:config', 'cache:data', 'cache:temp',
        'session:abc123', 'session:def456',
        'counter:visits', 'counter:orders',
        'config:app', 'config:db', 'config:redis'
    ];

    return mockKeys
        .filter(key => key.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(key => ({
            caption: key,
            value: key,
            meta: type === 'hash' ? 'Hash键' : type === 'string' ? 'String键' : '键',
            score: 800
        }));
}

// SQL自动补全设置函数

// SQL上下文分析函数
function analyzeSQLContext(line, column) {
    const textBefore = line.substring(0, column).toLowerCase();
    const words = textBefore.trim().split(/\s+/).filter(w => w);

    let statementType = 'GENERAL';
    let clauseType = '';

    // 检测语句类型
    if (textBefore.includes('create table')) {
        statementType = 'CREATE_TABLE';
    } else if (textBefore.includes('insert into')) {
        statementType = 'INSERT';
    } else if (textBefore.includes('update')) {
        statementType = 'UPDATE';
    } else if (textBefore.includes('delete from')) {
        statementType = 'DELETE';
    } else if (textBefore.includes('select')) {
        statementType = 'SELECT';

        // 检测SELECT语句的子句类型
        const lastKeywords = [];
        for (let i = words.length - 1; i >= 0; i--) {
            if (['select', 'from', 'where', 'join', 'inner', 'left', 'right', 'group', 'order', 'having', 'limit'].includes(words[i])) {
                lastKeywords.push(words[i]);
            }
        }

        if (lastKeywords.includes('from') || lastKeywords.includes('join')) {
            clauseType = 'FROM';
        } else if (lastKeywords.includes('where')) {
            clauseType = 'WHERE';
        } else if (lastKeywords.includes('select') && !lastKeywords.includes('from')) {
            clauseType = 'SELECT';
        }
    }

    // 检测是否在JOIN子句中
    if (textBefore.includes('join') || textBefore.includes('left join') || textBefore.includes('right join') || textBefore.includes('inner join')) {
        clauseType = clauseType || 'JOIN';
    }

    return {
        statementType: statementType,
        clauseType: clauseType,
        currentWord: words[words.length - 1] || '',
        words: words,
        textBefore: textBefore,
        line: line
    };
}

// CREATE TABLE建议
function getCreateTableSuggestions(context, prefix) {
    const dataTypes = [
        'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
        'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT',
        'DECIMAL', 'FLOAT', 'DOUBLE',
        'DATE', 'DATETIME', 'TIMESTAMP', 'TIME',
        'BOOLEAN', 'BOOL',
        'JSON', 'BLOB', 'LONGBLOB'
    ];

    const constraints = [
        'PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'NOT NULL', 'DEFAULT', 'AUTO_INCREMENT'
    ];

    let suggestions = [];

    dataTypes.forEach(type => {
        if (type.toLowerCase().startsWith(prefix.toLowerCase())) {
            suggestions.push({
                caption: type,
                value: type,
                meta: '数据类型',
                score: 1000
            });
        }
    });

    constraints.forEach(constraint => {
        if (constraint.toLowerCase().startsWith(prefix.toLowerCase())) {
            suggestions.push({
                caption: constraint,
                value: constraint,
                meta: '约束',
                score: 900
            });
        }
    });

    return suggestions;
}

// INSERT建议
function getInsertSuggestions(context, prefix) {
    const keywords = ['INTO', 'VALUES', ('SELECT'), 'DEFAULT'];

    return keywords
        .filter(keyword => keyword.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(keyword => ({
            caption: keyword,
            value: keyword,
            meta: 'SQL关键字',
            score: 800
        }));
}

// SELECT建议
function getSelectSuggestions(context, prefix) {
    const keywords = ['FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN'];
    const functions = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CONCAT', 'SUBSTRING', 'LENGTH', 'DATE', 'NOW'];

    let suggestions = [];

    keywords.forEach(keyword => {
        if (keyword.toLowerCase().startsWith(prefix.toLowerCase())) {
            suggestions.push({
                caption: keyword,
                value: keyword,
                meta: 'SQL关键字',
                score: 900
            });
        }
    });

    functions.forEach(func => {
        if (func.toLowerCase().startsWith(prefix.toLowerCase())) {
            suggestions.push({
                caption: func + '()',
                value: func + '()',
                meta: 'SQL函数',
                score: 800
            });
        }
    });

    return suggestions;
}

// WHERE建议
function getWhereSuggestions(context, prefix) {
    const operators = ['=', '!=', '<>', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'];
    const logical = ['AND', 'OR', 'NOT'];

    let suggestions = [];

    operators.forEach(op => {
        if (op.toLowerCase().startsWith(prefix.toLowerCase())) {
            suggestions.push({
                caption: op,
                value: op,
                meta: '比较运算符',
                score: 1000
            });
        }
    });

    logical.forEach(log => {
        if (log.toLowerCase().startsWith(prefix.toLowerCase())) {
            suggestions.push({
                caption: log,
                value: log,
                meta: '逻辑运算符',
                score: 900
            });
        }
    });

    return suggestions;
}

// JOIN建议
function getJoinSuggestions(context, prefix) {
    const keywords = ['ON', 'USING', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER'];

    return keywords
        .filter(keyword => keyword.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(keyword => ({
            caption: keyword,
            value: keyword,
            meta: 'JOIN关键字',
            score: 900
        }));
}

// 通用SQL建议
function getGeneralSQLSuggestions(context, prefix) {
    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
        'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'VIEW', 'TRIGGER',
        'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN',
        'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT',
        'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT'
    ];

    return keywords
        .filter(keyword => keyword.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(keyword => ({
            caption: keyword,
            value: keyword,
            meta: 'SQL关键字',
            score: 1000
        }));
}

// 在页面加载完成后初始化编辑器模式
$(document).ready(function() {
    console.log('🚀 [DEBUG] 页面加载完成，开始初始化...');
    console.log('⏰ [DEBUG] 当前时间:', new Date().toISOString());

    // 初始化SQL编辑器
    console.log('🔧 [DEBUG] 开始初始化SQL编辑器...');
    initializeSQLEditor();
    console.log('✅ [DEBUG] SQL编辑器初始化完成');

    // 监听连接类型变化
    console.log('📞 [DEBUG] 设置连接选择器事件监听...');
    $('#currentConnection').on('change', function() {
        const connectionId = $(this).val();
        const connection = connections.find(conn => conn.id === connectionId);
        console.log('🔄 [DEBUG] 连接选择器变更事件触发:', {
            selectedId: connectionId,
            connection: connection ? { name: connection.name, type: connection.type } : null
        });

        if (connection) {
            console.log('🎯 [DEBUG] 调用模式切换函数...');
            switchEditorMode(connection.type);
        } else {
            console.log('⚠️ [DEBUG] 未找到对应连接，不切换模式');
        }
    });

    // 设置自动触发延迟（毫秒）
    if (sqlEditor) {
        console.log('⚙️ [DEBUG] 配置编辑器自动补全选项...');
        const options = {
            liveAutocompletionDelay: 300,
            liveAutocompletionThreshold: 2
        };
        sqlEditor.setOptions(options);
        console.log('✅ [DEBUG] 编辑器选项配置完成:', options);
    } else {
        console.error('❌ [DEBUG] 编辑器未初始化，无法配置选项');
    }

    // 禁用自动测试Redis自动补全功能，避免干扰用户操作
    // console.log('⏳ [DEBUG] 5秒后将开始自动测试Redis自动补全功能...');
    // setTimeout(() => {
    //     console.log('🧪 [DEBUG] 开始自动测试Redis自动补全...');
    //     testRedisAutocompletion();
    // }, 5000);

    console.log('🎉 [DEBUG] 页面初始化完成，等待用户操作或自动测试...');
});

// ========== 内联数据编辑功能 ==========

let currentTableData = null;
let editingCell = null;

// 绑定内联编辑事件
function bindInlineEditEvents() {
    // 双击单元格编辑
    $(document).on('dblclick', '.editable-cell', function() {
        if (editingCell) {
            // 如果有正在编辑的单元格，先保存
            saveCellEdit();
        }
        startCellEdit($(this));
    });

    // 点击其他地方保存编辑
    $(document).on('click', function(e) {
        if (editingCell && !$(e.target).closest('.editable-cell, .cell-edit-input').length) {
            saveCellEdit();
        }
    });

    // Enter键保存编辑
    $(document).on('keydown', function(e) {
        if (e.key === 'Enter' && editingCell) {
            saveCellEdit();
        }
    });

    // Esc键取消编辑
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape' && editingCell) {
            cancelCellEdit();
        }
    });
}

// 开始编辑单元格
function startCellEdit(cell) {
    editingCell = cell;
    const originalValue = cell.text().trim();
    const columnName = cell.data('column');
    const rowIndex = parseInt(cell.data('row-index'));

    // 调试信息
    console.log('startCellEdit:', { columnName, originalValue, rowIndex });

    // 检查是否为NULL值
    let inputValue = originalValue === 'NULL' ? '' : originalValue;

    // 创建编辑输入框
    const inputType = getInputTypeForColumn(columnName);
    const input = $(`<input type="${inputType}" class="form-control form-control-sm cell-edit-input"
                         value="${inputValue}" style="width: 100%; padding: 2px;">`);

    // 替换单元格内容
    cell.empty().append(input);
    input.focus().select();

    // 存储原始值
    cell.data('original-value', originalValue);
    cell.data('column-name', columnName);
    cell.data('row-index', rowIndex);

    // 添加编辑样式
    cell.addClass('editing-cell');
}

// 保存单元格编辑
function saveCellEdit() {
    if (!editingCell) return;

    const input = editingCell.find('.cell-edit-input');
    const newValue = input.val();
    const originalValue = editingCell.data('original-value');
    const columnName = editingCell.data('column-name');
    const rowIndex = editingCell.data('row-index');

    // 如果值没有变化，恢复原始显示
    if (newValue === originalValue || (newValue === '' && originalValue === 'NULL')) {
        restoreCellDisplay(editingCell, originalValue);
        editingCell = null;
        return;
    }

    // 准备更新数据
    const rowData = currentTableData.rows[rowIndex];
    const primaryKey = getPrimaryKeyForRow(rowData);

    if (!primaryKey) {
        showNotification('无法找到主键，无法保存数据', 'error');
        restoreCellDisplay(editingCell, originalValue);
        editingCell = null;
        return;
    }

    // 发送更新请求
    updateTableData(editingCell, columnName, newValue, primaryKey, originalValue);
}

// 取消单元格编辑
function cancelCellEdit() {
    if (!editingCell) return;

    const originalValue = editingCell.data('original-value');
    restoreCellDisplay(editingCell, originalValue);
    editingCell = null;
}

// 恢复单元格显示
function restoreCellDisplay(cell, value) {
    const displayValue = value === '' || value === null ? '<em>NULL</em>' : value;
    cell.html(displayValue).removeClass('editing-cell');
}

// 根据列名获取输入框类型
function getInputTypeForColumn(columnName) {
    const name = columnName.toLowerCase();
    if (name.includes('id') || name.includes('key')) {
        return 'number';
    } else if (name.includes('date') || name.includes('time')) {
        return 'date';
    } else if (name.includes('email')) {
        return 'email';
    } else if (name.includes('price') || name.includes('amount') || name.includes('money')) {
        return 'number';
    } else if (name.includes('is_') || name.includes('has_') || name.includes('enabled')) {
        return 'checkbox';
    } else {
        return 'text';
    }
}

// 获取行数据的主键
function getPrimaryKeyForRow(rowData) {
    const table = $('#tableSelector').val().split('.')[1]; // 从"database.table"中提取表名

    // 特殊处理 grid_cells 表
    if (table === 'grid_cells') {
        return {
            column: 'row_id',
            value: rowData.row_id,
            secondColumn: 'col_id',
            secondValue: rowData.col_id,
            isComposite: true
        };
    }

    // 查找常见的主键字段名
    const possibleKeys = ['id', 'ID', 'uuid', 'UUID', 'key', 'KEY'];

    for (const key of possibleKeys) {
        if (rowData.hasOwnProperty(key)) {
            return { column: key, value: rowData[key] };
        }
    }

    // 如果没有找到，查找第一个字段
    const columns = Object.keys(rowData);
    if (columns.length > 0) {
        return { column: columns[0], value: rowData[columns[0]] };
    }

    return null;
}

// 更新表数据
async function updateTableData(cell, columnName, newValue, primaryKey, originalValue) {
    try {
        const connectionId = currentConnectionId;
        const database = $('#currentDatabase').val();
        const table = $('#tableSelector').val().split('.')[1]; // 从"database.table"中提取表名

        // 调试信息
        console.log('updateTableData:', {
            columnName,
            newValue,
            primaryKey,
            originalValue,
            table,
            database
        });

        if (!connectionId || !database || !table) {
            showNotification('缺少必要的连接信息', 'error');
            return;
        }

        // 构建UPDATE语句
        let updateSQL, params;

        if (primaryKey.isComposite) {
            // 处理复合主键 (grid_cells 表)
            updateSQL = `UPDATE \`${table}\` SET \`${columnName}\` = ? WHERE \`${primaryKey.column}\` = ? AND \`${primaryKey.secondColumn}\` = ?`;
            params = [newValue, primaryKey.value, primaryKey.secondValue];
        } else {
            // 处理单个主键
            updateSQL = `UPDATE \`${table}\` SET \`${columnName}\` = ? WHERE \`${primaryKey.column}\` = ?`;
            params = [newValue, primaryKey.value];
        }

        // 调试信息
        console.log('Generated SQL:', updateSQL);
        console.log('SQL Params:', params);

        const response = await fetch(`/api/query/${connectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: updateSQL,
                params: params,
                database: database
            })
        });

        const result = await response.json();

        if (result.success) {
            // 更新成功，更新显示
            const displayValue = newValue === '' || newValue === null ? '<em>NULL</em>' : newValue;
            cell.html(displayValue).removeClass('editing-cell');

            // 更新内存中的数据
            if (currentTableData && currentTableData.rows) {
                const rowIndex = parseInt(cell.data('row-index'));
                currentTableData.rows[rowIndex][columnName] = newValue;
            }

            showNotification('数据更新成功', 'success');
            editingCell = null;
        } else {
            throw new Error(result.error || '更新失败');
        }
    } catch (error) {
        console.error('更新数据失败:', error);
        showNotification('数据更新失败: ' + error.message, 'error');
        restoreCellDisplay(cell, originalValue);
        editingCell = null;
    }
}

// ========== 高级数据过滤功能 ==========

// 高级过滤相关变量
let advancedFilterRules = [];
let currentTableColumns = [];

// 切换高级过滤面板
function toggleAdvancedFilter() {
    const panel = $('#advancedFilterPanel');
    if (panel.is(':visible')) {
        panel.hide();
    } else {
        panel.show();
        if (advancedFilterRules.length === 0) {
            addFilterRule();
        }
    }
}

// 添加过滤规则
function addFilterRule() {
    const container = $('#filterRulesContainer');
    const ruleId = Date.now();

    if (!currentTableColumns.length && currentTableData) {
        currentTableColumns = Object.keys(currentTableData.rows[0] || {});
    }

    const operators = [
        { value: '=', text: '等于' },
        { value: '!=', text: '不等于' },
        { value: '>', text: '大于' },
        { value: '>=', text: '大于等于' },
        { value: '<', text: '小于' },
        { value: '<=', text: '小于等于' },
        { value: 'LIKE', text: '包含' },
        { value: 'NOT LIKE', text: '不包含' },
        { value: 'IN', text: '在列表中' },
        { value: 'NOT IN', text: '不在列表中' },
        { value: 'IS NULL', text: '为空' },
        { value: 'IS NOT NULL', text: '不为空' }
    ];

    const logicOperators = [
        { value: 'AND', text: '并且' },
        { value: 'OR', text: '或者' }
    ];

    const ruleHtml = `
        <div class="filter-rule row mb-2 align-items-center" data-rule-id="${ruleId}">
            <div class="col-md-2">
                ${advancedFilterRules.length > 0 ? `
                    <select class="form-select form-select-sm logic-operator">
                        ${logicOperators.map(op => `<option value="${op.value}">${op.text}</option>`).join('')}
                    </select>
                ` : '<span class="text-muted">条件</span>'}
            </div>
            <div class="col-md-3">
                <select class="form-select form-select-sm column-name">
                    <option value="">选择列</option>
                    ${currentTableColumns.map(col => `<option value="${col}">${col}</option>`).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <select class="form-select form-select-sm operator">
                    ${operators.map(op => `<option value="${op.value}">${op.text}</option>`).join('')}
                </select>
            </div>
            <div class="col-md-2">
                <input type="text" class="form-control form-control-sm filter-value" placeholder="过滤值">
            </div>
            <div class="col-md-2">
                <button class="btn btn-sm btn-outline-danger" onclick="removeFilterRule(${ruleId})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;

    container.append(ruleHtml);

    // 添加到规则数组
    advancedFilterRules.push({
        id: ruleId,
        logic: advancedFilterRules.length > 0 ? 'AND' : null,
        column: '',
        operator: '=',
        value: ''
    });

    // 绑定事件
    bindFilterRuleEvents(ruleId);
}

// 移除过滤规则
function removeFilterRule(ruleId) {
    $(`.filter-rule[data-rule-id="${ruleId}"]`).remove();
    advancedFilterRules = advancedFilterRules.filter(rule => rule.id !== ruleId);
}

// 绑定过滤规则事件
function bindFilterRuleEvents(ruleId) {
    const ruleElement = $(`.filter-rule[data-rule-id="${ruleId}"]`);

    ruleElement.find('.logic-operator').on('change', function() {
        const rule = advancedFilterRules.find(r => r.id === ruleId);
        if (rule) rule.logic = $(this).val();
    });

    ruleElement.find('.column-name').on('change', function() {
        const rule = advancedFilterRules.find(r => r.id === ruleId);
        if (rule) rule.column = $(this).val();
    });

    ruleElement.find('.operator').on('change', function() {
        const rule = advancedFilterRules.find(r => r.id === ruleId);
        if (rule) rule.operator = $(this).val();

        // 处理不需要值的操作符
        const valueInput = ruleElement.find('.filter-value');
        if ($(this).val() === 'IS NULL' || $(this).val() === 'IS NOT NULL') {
            valueInput.prop('disabled', true).val('');
        } else {
            valueInput.prop('disabled', false);
        }
    });

    ruleElement.find('.filter-value').on('input', function() {
        const rule = advancedFilterRules.find(r => r.id === ruleId);
        if (rule) rule.value = $(this).val();
    });
}

// 应用高级过滤
function applyAdvancedFilter() {
    if (!currentTableData) {
        showNotification('请先选择表并加载数据', 'warning');
        return;
    }

    // 更新规则数据
    advancedFilterRules.forEach(rule => {
        const ruleElement = $(`.filter-rule[data-rule-id="${rule.id}"]`);
        rule.logic = ruleElement.find('.logic-operator').val();
        rule.column = ruleElement.find('.column-name').val();
        rule.operator = ruleElement.find('.operator').val();
        rule.value = ruleElement.find('.filter-value').val();
    });

    // 验证规则
    const validRules = advancedFilterRules.filter(rule => {
        if (!rule.column || !rule.operator) return false;
        if (rule.operator !== 'IS NULL' && rule.operator !== 'IS NOT NULL' && !rule.value) return false;
        return true;
    });

    if (validRules.length === 0) {
        showNotification('请设置有效的过滤条件', 'warning');
        return;
    }

    // 执行过滤
    const filteredData = applyFilterRules(currentTableData.rows, validRules);

    // 更新表格显示
    updateTableWithFilteredData(filteredData);

    showNotification(`已应用过滤条件，显示 ${filteredData.length} 条记录`, 'success');
}

// 应用过滤规则到数据
function applyFilterRules(data, rules) {
    return data.filter(row => {
        return rules.every(rule => {
            const columnValue = row[rule.column];
            const filterValue = rule.value;

            switch (rule.operator) {
                case '=':
                    return columnValue == filterValue;
                case '!=':
                    return columnValue != filterValue;
                case '>':
                    return parseFloat(columnValue) > parseFloat(filterValue);
                case '>=':
                    return parseFloat(columnValue) >= parseFloat(filterValue);
                case '<':
                    return parseFloat(columnValue) < parseFloat(filterValue);
                case '<=':
                    return parseFloat(columnValue) <= parseFloat(filterValue);
                case 'LIKE':
                    return String(columnValue).toLowerCase().includes(filterValue.toLowerCase());
                case 'NOT LIKE':
                    return !String(columnValue).toLowerCase().includes(filterValue.toLowerCase());
                case 'IN':
                    const inValues = filterValue.split(',').map(v => v.trim());
                    return inValues.includes(String(columnValue));
                case 'NOT IN':
                    const notInValues = filterValue.split(',').map(v => v.trim());
                    return !notInValues.includes(String(columnValue));
                case 'IS NULL':
                    return columnValue === null || columnValue === undefined;
                case 'IS NOT NULL':
                    return columnValue !== null && columnValue !== undefined;
                default:
                    return true;
            }
        });
    });
}

// 更新表格显示过滤后的数据
function updateTableWithFilteredData(filteredData) {
    if (!currentTableData) return;

    const container = $('#dataTableContainer');
    const columns = Object.keys(currentTableData.rows[0] || {});

    let tableHTML = `
        <table class="table table-striped table-hover" id="dataTable">
            <thead>
                <tr>
    `;

    columns.forEach(col => {
        tableHTML += `<th class="sortable-column" data-column="${col}" title="点击排序">
                        ${col}
                        <span class="sort-indicator"></span>
                      </th>`;
    });

    tableHTML += `
                </tr>
            </thead>
            <tbody>
    `;

    filteredData.forEach((row, rowIndex) => {
        tableHTML += `<tr data-row-index="${rowIndex}">`;
        columns.forEach(col => {
            const value = row[col];
            const displayValue = value !== null ? value : '<em>NULL</em>';
            tableHTML += `<td data-column="${col}" data-row-index="${rowIndex}"
                             class="editable-cell"
                             style="cursor: pointer;"
                             title="双击编辑">${displayValue}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += `
            </tbody>
        </table>
        <div class="text-muted">
            共 ${filteredData.length} 条记录（过滤后），
            总计 ${currentTableData.pagination.total} 条记录
        </div>
    `;

    container.html(tableHTML);

    // 重新绑定编辑事件
    bindInlineEditEvents();

    // 重新初始化DataTables
    if (dataTable) {
        dataTable.destroy();
    }
    dataTable = $('#dataTable').DataTable({
        responsive: true,
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "全部"]]
    });
}

// 清除高级过滤
function clearAdvancedFilter() {
    advancedFilterRules = [];
    $('#filterRulesContainer').empty();

    // 重新显示原始数据
    if (currentTableData) {
        displayTableData(currentTableData);
    }

    showNotification('已清除过滤条件', 'info');
}

// 在表数据加载时更新列信息
function updateCurrentTableColumns(data) {
    if (data && data.rows && data.rows.length > 0) {
        currentTableColumns = Object.keys(data.rows[0]);
    }
}

// 修改原有的 loadTableData 函数，添加列信息更新
$(document).ready(function() {
    // 保存原始的 loadTableData 函数
    const originalLoadTableData = window.loadTableData;

    window.loadTableData = function() {
        // 调用原始函数
        originalLoadTableData.apply(this, arguments);

        // 延迟更新列信息，等待数据加载完成
        setTimeout(() => {
            if (currentTableData) {
                updateCurrentTableColumns(currentTableData);
            }
        }, 100);
    };
});

// ========== 列排序功能 ==========

// 列排序相关变量
let currentSortColumn = null;
let currentSortDirection = 'asc'; // 'asc' 或 'desc'

// 绑定列排序事件
function bindColumnSortEvents() {
    $(document).off('click', '.sortable-column').on('click', '.sortable-column', function() {
        const columnName = $(this).data('column');
        handleColumnSort(columnName);
    });
}

// 处理列排序
function handleColumnSort(columnName) {
    if (!currentTableData) return;

    // 确定排序方向
    if (currentSortColumn === columnName) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = columnName;
        currentSortDirection = 'asc';
    }

    // 执行排序
    const sortedData = sortTableData(currentTableData.rows, columnName, currentSortDirection);

    // 更新表格显示
    updateTableWithSortedData(sortedData);

    // 更新排序指示器
    updateSortIndicators(columnName, currentSortDirection);

    showNotification(`已按 ${columnName} ${currentSortDirection === 'asc' ? '升序' : '降序'} 排序`, 'success');
}

// 排序表格数据
function sortTableData(data, columnName, direction) {
    const sortedData = [...data].sort((a, b) => {
        let valueA = a[columnName];
        let valueB = b[columnName];

        // 处理null值
        if (valueA === null || valueA === undefined) valueA = '';
        if (valueB === null || valueB === undefined) valueB = '';

        // 尝试转换为数字进行比较
        const numA = parseFloat(valueA);
        const numB = parseFloat(valueB);

        let comparison = 0;

        if (!isNaN(numA) && !isNaN(numB)) {
            // 数字比较
            comparison = numA - numB;
        } else if (typeof valueA === 'string' && typeof valueB === 'string') {
            // 字符串比较（不区分大小写）
            comparison = valueA.localeCompare(valueB, 'zh-CN', { sensitivity: 'base' });
        } else {
            // 其他类型转换为字符串比较
            comparison = String(valueA).localeCompare(String(valueB));
        }

        return direction === 'asc' ? comparison : -comparison;
    });

    return sortedData;
}

// 更新表格显示排序后的数据
function updateTableWithSortedData(sortedData) {
    if (!currentTableData) return;

    const container = $('#dataTableContainer');
    const columns = Object.keys(currentTableData.rows[0] || {});

    let tableHTML = `
        <table class="table table-striped table-hover" id="dataTable">
            <thead>
                <tr>
    `;

    columns.forEach(col => {
        const sortClass = currentSortColumn === col ? `sort-${currentSortDirection}` : '';
        const sortIndicator = currentSortColumn === col ?
            `<span class="sort-indicator ${sortClass}"></span>` :
            '<span class="sort-indicator"></span>';

        tableHTML += `<th class="sortable-column ${sortClass}" data-column="${col}" title="点击排序">
                        ${col}
                        ${sortIndicator}
                      </th>`;
    });

    tableHTML += `
                </tr>
            </thead>
            <tbody>
    `;

    sortedData.forEach((row, rowIndex) => {
        tableHTML += `<tr data-row-index="${rowIndex}">`;
        columns.forEach(col => {
            const value = row[col];
            const displayValue = value !== null ? value : '<em>NULL</em>';
            tableHTML += `<td data-column="${col}" data-row-index="${rowIndex}"
                             class="editable-cell"
                             style="cursor: pointer;"
                             title="双击编辑">${displayValue}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += `
            </tbody>
        </table>
        <div class="text-muted">
            共 ${sortedData.length} 条记录${currentSortColumn ? `（按 ${currentSortColumn} ${currentSortDirection === 'asc' ? '升序' : '降序'} 排序）` : ''}，
            总计 ${currentTableData.pagination.total} 条记录
        </div>
    `;

    container.html(tableHTML);

    // 重新绑定事件
    bindInlineEditEvents();
    bindColumnSortEvents();

    // 重新初始化DataTables
    if (dataTable) {
        dataTable.destroy();
    }
    dataTable = $('#dataTable').DataTable({
        responsive: true,
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "全部"]]
    });
}

// 更新排序指示器
function updateSortIndicators(columnName, direction) {
    // 移除所有排序指示器
    $('.sortable-column').removeClass('sort-asc sort-desc');
    $('.sort-indicator').removeClass('sort-asc sort-desc');

    // 添加当前列的排序指示器
    const currentColumn = $(`.sortable-column[data-column="${columnName}"]`);
    currentColumn.addClass(`sort-${direction}`);
    currentColumn.find('.sort-indicator').addClass(`sort-${direction}`);
}

// 重置排序
function resetColumnSort() {
    currentSortColumn = null;
    currentSortDirection = 'asc';

    if (currentTableData) {
        displayTableData(currentTableData);
    }

    showNotification('已重置排序', 'info');
}

// 获取排序状态的字符串表示
function getSortStatusText() {
    if (!currentSortColumn) return '未排序';
    return `按 ${currentSortColumn} ${currentSortDirection === 'asc' ? '升序' : '降序'}`;
}

// 在数据过滤后保持排序状态
function applySortToFilteredData(filteredData) {
    if (currentSortColumn) {
        return sortTableData(filteredData, currentSortColumn, currentSortDirection);
    }
    return filteredData;
}

// 修改 updateTableWithFilteredData 函数以支持排序
function updateTableWithFilteredData(filteredData) {
    if (!currentTableData) return;

    // 应用当前的排序状态
    const displayData = applySortToFilteredData(filteredData);

    const container = $('#dataTableContainer');
    const columns = Object.keys(currentTableData.rows[0] || {});

    let tableHTML = `
        <table class="table table-striped table-hover" id="dataTable">
            <thead>
                <tr>
    `;

    columns.forEach(col => {
        const sortClass = currentSortColumn === col ? `sort-${currentSortDirection}` : '';
        const sortIndicator = currentSortColumn === col ?
            `<span class="sort-indicator ${sortClass}"></span>` :
            '<span class="sort-indicator"></span>';

        tableHTML += `<th class="sortable-column ${sortClass}" data-column="${col}" title="点击排序">
                        ${col}
                        ${sortIndicator}
                      </th>`;
    });

    tableHTML += `
                </tr>
            </thead>
            <tbody>
    `;

    displayData.forEach((row, rowIndex) => {
        tableHTML += `<tr data-row-index="${rowIndex}">`;
        columns.forEach(col => {
            const value = row[col];
            const displayValue = value !== null ? value : '<em>NULL</em>';
            tableHTML += `<td data-column="${col}" data-row-index="${rowIndex}"
                             class="editable-cell"
                             style="cursor: pointer;"
                             title="双击编辑">${displayValue}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += `
            </tbody>
        </table>
        <div class="text-muted">
            共 ${displayData.length} 条记录（过滤后）${currentSortColumn ? `，按 ${currentSortColumn} ${currentSortDirection === 'asc' ? '升序' : '降序'} 排序` : ''}，
            总计 ${currentTableData.pagination.total} 条记录
        </div>
    `;

    container.html(tableHTML);

    // 重新绑定事件
    bindInlineEditEvents();
    bindColumnSortEvents();

    // 重新初始化DataTables
    if (dataTable) {
        dataTable.destroy();
    }
    dataTable = $('#dataTable').DataTable({
        responsive: true,
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "全部"]]
    });
}

// 获取表结构
function getTableStructure(tableName, callback) {
    const [database, table] = tableName.split('.');

    if (!database || !table) {
        showNotification('表名格式错误', 'error');
        return;
    }

    fetch(`/api/structure/${currentConnectionId}/${database}/${table}`)
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                callback(result.data);
            } else {
                showNotification('获取表结构失败: ' + result.error, 'error');
            }
        })
        .catch(error => {
            showNotification('获取表结构失败: ' + error.message, 'error');
        });
}

// ========== 数据生成器 ==========

// 数据生成器模板
const dataGeneratorTemplates = {
    users: {
        name: '用户数据',
        fields: {
            'username': { type: 'username', locale: 'zh_CN' },
            'name': { type: 'name', locale: 'zh_CN' },
            'email': { type: 'email' },
            'phone': { type: 'phone' },
            'age': { type: 'number', min: 18, max: 80 },
            'gender': { type: 'enum', values: ['男', '女', '其他'] },
            'avatar': { type: 'avatar' },
            'bio': { type: 'text', min: 10, max: 100 },
            'website': { type: 'website' },
            'status': { type: 'enum', values: ['active', 'inactive', 'pending'] },
            'created_at': { type: 'datetime', range: 'past_year' }
        }
    },
    products: {
        name: '产品数据',
        fields: {
            'name': { type: 'product_name', locale: 'zh_CN' },
            'sku': { type: 'sku' },
            'price': { type: 'price', min: 10, max: 9999 },
            'category': { type: 'enum', values: ['电子产品', '服装', '家居', '图书', '食品', '运动'] },
            'stock': { type: 'number', min: 0, max: 1000 },
            'description': { type: 'text', min: 20, max: 200 },
            'brand': { type: 'brand', locale: 'zh_CN' },
            'weight': { type: 'weight', min: 0.1, max: 50 },
            'dimensions': { type: 'dimensions' },
            'is_active': { type: 'boolean' },
            'rating': { type: 'number', min: 1, max: 5, decimals: 1 }
        }
    },
    orders: {
        name: '订单数据',
        fields: {
            'order_number': { type: 'order_number' },
            'customer_id': { type: 'number', min: 1, max: 1000 },
            'total_amount': { type: 'price', min: 50, max: 5000 },
            'status': { type: 'enum', values: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] },
            'payment_method': { type: 'enum', values: ['alipay', 'wechat', 'credit_card', 'bank_transfer'] },
            'shipping_address': { type: 'address', locale: 'zh_CN' },
            'order_date': { type: 'datetime', range: 'past_month' },
            'shipping_date': { type: 'datetime', range: 'future_week' },
            'notes': { type: 'text', min: 0, max: 200 }
        }
    },
    logs: {
        name: '日志数据',
        fields: {
            'timestamp': { type: 'datetime', range: 'past_week' },
            'level': { type: 'enum', values: ['INFO', 'WARN', 'ERROR', 'DEBUG'] },
            'message': { type: 'log_message' },
            'user_id': { type: 'number', min: 1, max: 1000, nullable: true },
            'ip_address': { type: 'ip_address' },
            'user_agent': { type: 'user_agent' },
            'method': { type: 'enum', values: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
            'path': { type: 'url_path' },
            'status_code': { type: 'number', min: 200, max: 599 },
            'response_time': { type: 'number', min: 1, max: 5000 }
        }
    },
    addresses: {
        name: '地址数据',
        fields: {
            'street': { type: 'street', locale: 'zh_CN' },
            'city': { type: 'city', locale: 'zh_CN' },
            'province': { type: 'province', locale: 'zh_CN' },
            'postal_code': { type: 'postal_code', locale: 'zh_CN' },
            'country': { type: 'country', locale: 'zh_CN' },
            'latitude': { type: 'latitude' },
            'longitude': { type: 'longitude' },
            'timezone': { type: 'timezone' }
        }
    }
};

// 数据生成器配置
let dataGeneratorConfig = {
    template: '',
    fields: {},
    recordCount: 10,
    selectedColumns: []
};

// 显示数据生成器面板
function showDataGenerator() {
    const table = $('#tableSelector').val();
    if (!table) {
        showNotification('请先选择表', 'warning');
        return;
    }

    // 获取表结构
    getTableStructure(table, function(columns) {
        renderDataGeneratorPanel(columns);
        $('#dataGeneratorPanel').show();

        // 滚动到生成器面板
        $('#dataGeneratorPanel')[0].scrollIntoView({ behavior: 'smooth' });
    });
}

// 隐藏数据生成器面板
function hideDataGenerator() {
    $('#dataGeneratorPanel').hide();
}

// 渲染数据生成器面板
function renderDataGeneratorPanel(columns) {
    const panel = $('#dataGeneratorPanel');

    // 渲染模板选择器
    const templateOptions = Object.keys(dataGeneratorTemplates).map(key =>
        `<option value="${key}">${dataGeneratorTemplates[key].name}</option>`
    ).join('');

    // 渲染字段配置
    const fieldsHtml = columns.map(col => {
        const fieldType = detectFieldType(col);
        return `
            <div class="generator-field-config mb-3 p-3 border rounded">
                <div class="row align-items-center">
                    <div class="col-md-3">
                        <div class="form-check">
                            <input class="form-check-input field-checkbox" type="checkbox"
                                   id="field_${col.COLUMN_NAME}" data-field="${col.COLUMN_NAME}" checked>
                            <label class="form-check-label" for="field_${col.COLUMN_NAME}">
                                <strong>${col.COLUMN_NAME}</strong>
                                <small class="text-muted d-block">${col.DATA_TYPE}</small>
                            </label>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <select class="form-select field-type-select" data-field="${col.COLUMN_NAME}">
                            <option value="auto" ${fieldType === 'auto' ? 'selected' : ''}>自动检测</option>
                            <option value="number" ${fieldType === 'number' ? 'selected' : ''}>数字</option>
                            <option value="string" ${fieldType === 'string' ? 'selected' : ''}>字符串</option>
                            <option value="email" ${fieldType === 'email' ? 'selected' : ''}>邮箱</option>
                            <option value="phone" ${fieldType === 'phone' ? 'selected' : ''}>电话</option>
                            <option value="name" ${fieldType === 'name' ? 'selected' : ''}>姓名</option>
                            <option value="address" ${fieldType === 'address' ? 'selected' : ''}>地址</option>
                            <option value="date" ${fieldType === 'date' ? 'selected' : ''}>日期</option>
                            <option value="datetime" ${fieldType === 'datetime' ? 'selected' : ''}>日期时间</option>
                            <option value="boolean" ${fieldType === 'boolean' ? 'selected' : ''}>布尔值</option>
                            <option value="credit_card" ${fieldType === 'credit_card' ? 'selected' : ''}>信用卡</option>
                            <option value="domain" ${fieldType === 'domain' ? 'selected' : ''}>域名</option>
                            <option value="ip_address" ${fieldType === 'ip_address' ? 'selected' : ''}>IP地址</option>
                            <option value="regex" ${fieldType === 'regex' ? 'selected' : ''}>正则表达式</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <div class="field-options" data-field="${col.COLUMN_NAME}">
                            ${renderFieldOptions(col.COLUMN_NAME, fieldType)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    panel.find('.card-body').html(`
        <div class="row">
            <div class="col-md-4">
                <label class="form-label">选择模板</label>
                <select class="form-select" id="generatorTemplate">
                    <option value="">自定义</option>
                    ${templateOptions}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">生成数量</label>
                <div class="input-group">
                    <input type="number" class="form-control" id="generatorCount" value="10" min="1" max="1000">
                    <span class="input-group-text">条</span>
                </div>
            </div>
            <div class="col-md-4">
                <label class="form-label">操作</label>
                <div>
                    <button class="btn btn-primary me-2" onclick="generateData()">生成数据</button>
                    <button class="btn btn-secondary me-2" onclick="previewData()">预览</button>
                    <button class="btn btn-success" onclick="applyTemplate()">应用模板</button>
                </div>
            </div>
        </div>

        <hr class="my-4">

        <h6 class="mb-3">字段配置</h6>
        <div class="generator-fields">
            ${fieldsHtml}
        </div>

        <div class="mt-4" id="generatorPreview" style="display: none;">
            <h6>预览</h6>
            <div class="preview-container" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; background: #f9f9f9;">
                <pre class="mb-0"></pre>
            </div>
        </div>
    `);

    // 绑定事件
    bindGeneratorEvents();
}

// 检测字段类型
function detectFieldType(column) {
    const name = column.COLUMN_NAME.toLowerCase();
    const type = column.DATA_TYPE.toLowerCase();

    // 根据字段名和类型检测
    if (name.includes('email') || name.includes('mail')) return 'email';
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) return 'phone';
    if (name.includes('name') && !name.includes('username')) return 'name';
    if (name.includes('address') || name.includes('addr')) return 'address';
    if (name.includes('age') || name.includes('count') || name.includes('num')) return 'number';
    if (name.includes('date') && !name.includes('update') && !name.includes('create')) return 'date';
    if (name.includes('time') || name.includes('created_at') || name.includes('updated_at')) return 'datetime';
    if (name.includes('is_') || name.includes('has_') || type.includes('bool')) return 'boolean';
    if (name.includes('credit') || name.includes('card')) return 'credit_card';
    if (name.includes('domain') || name.includes('website')) return 'domain';
    if (name.includes('ip') || name.includes('addr') && name.includes('ip')) return 'ip_address';

    // 根据数据类型检测
    if (type.includes('int') || type.includes('decimal') || type.includes('float')) return 'number';
    if (type.includes('date') || type.includes('time')) return 'datetime';
    if (type.includes('bool')) return 'boolean';

    return 'string';
}

// 渲染字段选项
function renderFieldOptions(fieldName, fieldType) {
    switch(fieldType) {
        case 'number':
            return `
                <div class="row g-2">
                    <div class="col-6">
                        <input type="number" class="form-control form-control-sm" placeholder="最小值"
                               data-field="${fieldName}" data-option="min" value="1">
                    </div>
                    <div class="col-6">
                        <input type="number" class="form-control form-control-sm" placeholder="最大值"
                               data-field="${fieldName}" data-option="max" value="100">
                    </div>
                </div>
            `;
        case 'string':
        case 'text':
            return `
                <div class="row g-2">
                    <div class="col-6">
                        <input type="number" class="form-control form-control-sm" placeholder="最小长度"
                               data-field="${fieldName}" data-option="min" value="5">
                    </div>
                    <div class="col-6">
                        <input type="number" class="form-control form-control-sm" placeholder="最大长度"
                               data-field="${fieldName}" data-option="max" value="20">
                    </div>
                </div>
            `;
        case 'regex':
            return `
                <input type="text" class="form-control form-control-sm" placeholder="正则表达式"
                       data-field="${fieldName}" data-option="pattern" value="[A-Za-z0-9]+">
            `;
        case 'enum':
            return `
                <input type="text" class="form-control form-control-sm" placeholder="选项，用逗号分隔"
                       data-field="${fieldName}" data-option="values" value="选项1,选项2,选项3">
            `;
        default:
            return `<small class="text-muted">此类型无需额外配置</small>`;
    }
}

// 绑定生成器事件
function bindGeneratorEvents() {
    // 模板选择
    $('#generatorTemplate').change(function() {
        const template = $(this).val();
        if (template && dataGeneratorTemplates[template]) {
            applyTemplate(template);
        }
    });

    // 字段类型选择
    $('.field-type-select').change(function() {
        const field = $(this).data('field');
        const type = $(this).val();
        const optionsContainer = $(`.field-options[data-field="${field}"]`);
        optionsContainer.html(renderFieldOptions(field, type));
    });

    // 预览数据
    $(document).on('input', '.field-options input, #generatorCount', function() {
        if ($('#generatorPreview').is(':visible')) {
            previewData();
        }
    });
}

// 应用模板
function applyTemplate(templateName = null) {
    const template = templateName || $('#generatorTemplate').val();
    if (!template || !dataGeneratorTemplates[template]) {
        showNotification('请选择有效的模板', 'warning');
        return;
    }

    const templateData = dataGeneratorTemplates[template];

    // 更新字段配置
    Object.entries(templateData.fields).forEach(([fieldName, config]) => {
        const fieldCheckbox = $(`#field_${fieldName}`);
        const typeSelect = $(`.field-type-select[data-field="${fieldName}"]`);

        if (fieldCheckbox.length) {
            fieldCheckbox.prop('checked', true);
            typeSelect.val(config.type);

            // 更新选项
            const optionsContainer = $(`.field-options[data-field="${fieldName}"]`);
            optionsContainer.html(renderFieldOptions(fieldName, config.type));

            // 设置配置值
            Object.entries(config).forEach(([key, value]) => {
                if (key !== 'type') {
                    const optionInput = optionsContainer.find(`[data-option="${key}"]`);
                    if (optionInput.length) {
                        if (typeof value === 'object') {
                            optionInput.val(JSON.stringify(value));
                        } else {
                            optionInput.val(value);
                        }
                    }
                }
            });
        }
    });

    showNotification(`已应用${templateData.name}模板`, 'success');
}

// 生成数据
function generateData() {
    const config = collectGeneratorConfig();
    if (!config.fields.length) {
        showNotification('请至少选择一个字段', 'warning');
        return;
    }

    showLoading('正在生成数据...');

    // 生成数据
    const generatedData = [];
    for (let i = 0; i < config.recordCount; i++) {
        const record = {};
        config.fields.forEach(field => {
            record[field.name] = generateFieldValue(field);
        });
        generatedData.push(record);
    }

    // 插入数据
    insertGeneratedData(config.table, generatedData);
}

// 收集生成器配置
function collectGeneratorConfig() {
    const table = $('#tableSelector').val();
    const recordCount = parseInt($('#generatorCount').val()) || 10;
    const fields = [];

    $('.field-checkbox:checked').each(function() {
        const fieldName = $(this).data('field');
        const type = $(`.field-type-select[data-field="${fieldName}"]`).val();
        const options = {};

        $(`.field-options[data-field="${fieldName}"] input`).each(function() {
            const optionName = $(this).data('option');
            if (optionName) {
                options[optionName] = $(this).val();
            }
        });

        fields.push({
            name: fieldName,
            type: type,
            options: options
        });
    });

    return {
        table: table,
        recordCount: recordCount,
        fields: fields
    };
}

// 生成字段值
function generateFieldValue(fieldConfig) {
    const { type, options } = fieldConfig;

    switch(type) {
        case 'number':
            return generateNumber(options);
        case 'string':
        case 'text':
            return generateString(options);
        case 'email':
            return generateEmail();
        case 'phone':
            return generatePhone();
        case 'name':
            return generateName();
        case 'address':
            return generateAddress();
        case 'date':
            return generateDate(options);
        case 'datetime':
            return generateDateTime(options);
        case 'boolean':
            return generateBoolean();
        case 'credit_card':
            return generateCreditCard();
        case 'domain':
            return generateDomain();
        case 'ip_address':
            return generateIPAddress();
        case 'regex':
            return generateRegex(options);
        case 'enum':
            return generateEnum(options);
        default:
            return generateString(options);
    }
}

// 数字生成器
function generateNumber(options = {}) {
    const min = parseFloat(options.min) || 1;
    const max = parseFloat(options.max) || 100;
    const decimals = parseInt(options.decimals) || 0;

    const value = Math.random() * (max - min) + min;
    return decimals > 0 ? parseFloat(value.toFixed(decimals)) : Math.floor(value);
}

// 字符串生成器
function generateString(options = {}) {
    const minLength = parseInt(options.min) || 5;
    const maxLength = parseInt(options.max) || 20;
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 邮箱生成器
function generateEmail() {
    const usernames = ['zhang', 'wang', 'li', 'liu', 'chen', 'yang', 'zhao', 'huang', 'zhou', 'wu'];
    const domains = ['gmail.com', '163.com', 'qq.com', 'hotmail.com', 'sina.com', 'outlook.com'];

    const username = usernames[Math.floor(Math.random() * usernames.length)] +
                    Math.floor(Math.random() * 999);
    const domain = domains[Math.floor(Math.random() * domains.length)];

    return `${username}@${domain}`;
}

// 电话生成器
function generatePhone() {
    const prefixes = ['138', '139', '137', '136', '135', '134', '159', '158', '157', '150'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    return prefix + suffix;
}

// 姓名生成器
function generateName() {
    const surnames = ['张', '王', '李', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
    const givenNames = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '洋', '艳', '勇', '杰', '娟', '涛', '明', '超', '秀兰', '霞', '平', '刚', '桂英'];

    const surname = surnames[Math.floor(Math.random() * surnames.length)];
    const givenName = givenNames[Math.floor(Math.random() * givenNames.length)];

    return surname + givenName;
}

// 地址生成器
function generateAddress() {
    const cities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '武汉', '西安', '重庆'];
    const districts = ['朝阳区', '海淀区', '西城区', '东城区', '浦东新区', '黄浦区', '天河区', '越秀区', '南山区', '福田区'];
    const streets = ['建国路', '人民路', '解放路', '中山路', '友谊路', '和平路', '建设路', '新华路', '文化路', '商业街'];

    const city = cities[Math.floor(Math.random() * cities.length)];
    const district = districts[Math.floor(Math.random() * districts.length)];
    const street = streets[Math.floor(Math.random() * streets.length)];
    const number = Math.floor(Math.random() * 999) + 1;

    return `${city}市${district}${street}${number}号`;
}

// 日期生成器
function generateDate(options = {}) {
    const start = new Date(options.start || '2020-01-01');
    const end = new Date(options.end || '2024-12-31');

    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date.toISOString().split('T')[0];
}

// 日期时间生成器
function generateDateTime(options = {}) {
    const range = options.range || 'past_year';
    let start, end;

    switch(range) {
        case 'past_week':
            start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            end = new Date();
            break;
        case 'past_month':
            start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            end = new Date();
            break;
        case 'past_year':
            start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
            end = new Date();
            break;
        case 'future_week':
            start = new Date();
            end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            break;
        default:
            start = new Date(options.start || '2020-01-01');
            end = new Date(options.end || '2024-12-31');
    }

    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date.toISOString().replace('T', ' ').substring(0, 19);
}

// 布尔值生成器
function generateBoolean() {
    return Math.random() > 0.5 ? 1 : 0;
}

// 信用卡生成器
function generateCreditCard() {
    const prefixes = ['4', '5', '37', '6']; // Visa, Mastercard, Amex, Discover
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

    let cardNumber = prefix;
    const length = prefix === '37' ? 15 : 16;

    while (cardNumber.length < length - 1) {
        cardNumber += Math.floor(Math.random() * 10);
    }

    // Luhn算法校验
    let sum = 0;
    let isEven = true;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumber[i]);

        if (isEven) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        isEven = !isEven;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    cardNumber += checkDigit;

    // 格式化
    let formatted = '';
    for (let i = 0; i < cardNumber.length; i++) {
        if (i > 0 && i % 4 === 0) {
            formatted += ' ';
        }
        formatted += cardNumber[i];
    }

    return formatted;
}

// 域名生成器
function generateDomain() {
    const names = ['example', 'test', 'demo', 'sample', 'myapp', 'webapp', 'api', 'service', 'data', 'cloud'];
    const tlds = ['com', 'org', 'net', 'io', 'co', 'tech', 'dev', 'app'];

    const name = names[Math.floor(Math.random() * names.length)];
    const tld = tlds[Math.floor(Math.random() * tlds.length)];

    return `${name}.${tld}`;
}

// IP地址生成器
function generateIPAddress() {
    const version = Math.random() > 0.5 ? 4 : 6;

    if (version === 4) {
        return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    } else {
        let ipv6 = '';
        for (let i = 0; i < 8; i++) {
            ipv6 += Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
            if (i < 7) ipv6 += ':';
        }
        return ipv6;
    }
}

// 正则表达式生成器
function generateRegex(options = {}) {
    const pattern = options.pattern || '[A-Za-z0-9]+';
    const flags = options.flags || '';

    try {
        const regex = new RegExp(pattern, flags);
        const testString = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const matches = testString.match(regex);

        if (matches && matches.length > 0) {
            return matches[Math.floor(Math.random() * matches.length)];
        }

        // 如果没有匹配，生成一个随机字符串
        return generateString({ min: 5, max: 15 });
    } catch (e) {
        return generateString({ min: 5, max: 15 });
    }
}

// 枚举生成器
function generateEnum(options = {}) {
    const values = options.values ? options.values.split(',') : ['选项1', '选项2', '选项3'];
    const cleanValues = values.map(v => v.trim()).filter(v => v);

    if (cleanValues.length === 0) {
        return '选项1';
    }

    return cleanValues[Math.floor(Math.random() * cleanValues.length)];
}

// 插入生成的数据
function insertGeneratedData(table, data) {
    if (data.length === 0) {
        showNotification('没有数据需要插入', 'warning');
        return;
    }

    const connectionId = currentConnectionId;
    const database = $('#currentDatabase').val();

    if (!connectionId || !database) {
        showNotification('请先选择数据库连接', 'warning');
        return;
    }

    const columns = Object.keys(data[0]);
    const values = data.map(row => columns.map(col => row[col]));

    // 构建插入语句
    const insertSQL = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;

    // 批量插入
    const batchSize = 100;
    let insertedCount = 0;
    let currentBatch = 0;

    function insertBatch() {
        const start = currentBatch * batchSize;
        const end = Math.min(start + batchSize, values.length);
        const batchValues = values.slice(start, end);

        if (batchValues.length === 0) {
            hideLoading();
            showNotification(`成功插入 ${insertedCount} 条数据`, 'success');
            refreshTable();
            return;
        }

        showLoading(`正在插入数据 ${start + 1}-${end}/${values.length}...`);

        // 展开批量数据
        const flatValues = batchValues.flat();

        fetch(`/api/execute/${connectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: insertSQL,
                params: flatValues,
                database: database
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                insertedCount += batchValues.length;
                currentBatch++;
                insertBatch();
            } else {
                hideLoading();
                displayQueryError(result);
            }
        })
        .catch(error => {
            hideLoading();
            showNotification('插入失败: ' + error.message, 'error');
        });
    }

    insertBatch();
}

// 预览数据
function previewData() {
    const config = collectGeneratorConfig();
    if (!config.fields.length) {
        showNotification('请至少选择一个字段', 'warning');
        return;
    }

    const previewData = [];
    const previewCount = Math.min(5, config.recordCount);

    for (let i = 0; i < previewCount; i++) {
        const record = {};
        config.fields.forEach(field => {
            record[field.name] = generateFieldValue(field);
        });
        previewData.push(record);
    }

    // 显示预览
    const previewContainer = $('#generatorPreview');
    const previewContent = previewContainer.find('pre');

    let previewText = `预览 ${previewCount} 条数据 (共 ${config.recordCount} 条):\n\n`;
    previewData.forEach((record, index) => {
        previewText += `记录 ${index + 1}:\n`;
        Object.entries(record).forEach(([key, value]) => {
            previewText += `  ${key}: ${value}\n`;
        });
        previewText += '\n';
    });

    previewContent.text(previewText);
    previewContainer.show();
}

// 刷新表格数据
function refreshTable() {
    if (window.refreshTableData) {
        window.refreshTableData();
    } else {
        // 重新加载当前表数据
        const table = $('#tableSelector').val();
        if (table) {
            loadTableData(table);
        }
    }
}

// ========== 查询历史管理功能 ==========

// 查询历史数据存储
let queryHistory = [];

// 初始化查询历史
function initQueryHistory() {
    // 从localStorage加载查询历史
    const saved = localStorage.getItem('queryHistory');
    if (saved) {
        try {
            queryHistory = JSON.parse(saved);
            console.log('Loaded query history:', queryHistory.length, 'records');
        } catch (error) {
            console.error('Error loading query history:', error);
            queryHistory = [];
        }
    }
}

// 保存查询历史到localStorage
function saveQueryHistory() {
    try {
        localStorage.setItem('queryHistory', JSON.stringify(queryHistory));
    } catch (error) {
        console.error('Error saving query history:', error);
    }
}

// 添加查询历史记录
function addQueryHistory(sql, connectionId, database, executionTime, affectedRows) {
    if (!sql || sql.trim() === '') return;

    // 避免重复记录相同的查询
    const lastQuery = queryHistory[queryHistory.length - 1];
    if (lastQuery && lastQuery.sql === sql.trim() &&
        Date.now() - new Date(lastQuery.timestamp).getTime() < 5000) {
        return;
    }

    const queryType = getQueryType(sql);
    const record = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        sql: sql.trim(),
        connectionId: connectionId,
        database: database || 'unknown',
        queryType: queryType,
        executionTime: executionTime || 0,
        affectedRows: affectedRows || 0
    };

    queryHistory.push(record);

    // 限制历史记录数量（最多1000条）
    if (queryHistory.length > 1000) {
        queryHistory = queryHistory.slice(-1000);
    }

    saveQueryHistory();
    console.log('Added query history:', queryType);
}

// 获取查询类型
function getQueryType(sql) {
    const firstWord = sql.trim().toUpperCase().split(' ')[0];
    switch (firstWord) {
        case 'SELECT': return 'SELECT';
        case 'INSERT': return 'INSERT';
        case 'UPDATE': return 'UPDATE';
        case 'DELETE': return 'DELETE';
        case 'CREATE': return 'CREATE';
        case 'DROP': return 'DROP';
        case 'ALTER': return 'ALTER';
        case 'TRUNCATE': return 'TRUNCATE';
        case 'SHOW': return 'SHOW';
        case 'DESCRIBE': return 'DESCRIBE';
        case 'EXPLAIN': return 'EXPLAIN';
        default: return 'OTHER';
    }
}

// 显示查询历史模态框
function showQueryHistory() {
    $('#queryHistoryModal').modal('show');
    loadQueryHistoryTable();
}

// 加载查询历史表格
function loadQueryHistoryTable() {
    const tbody = $('#queryHistoryTable tbody');
    tbody.empty();

    if (queryHistory.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center text-muted">暂无查询历史记录</td></tr>');
        return;
    }

    // 按时间倒序显示
    const sortedHistory = [...queryHistory].reverse();

    sortedHistory.forEach(record => {
        const row = $('<tr>');
        const timeStr = new Date(record.timestamp).toLocaleString('zh-CN');
        const sqlPreview = record.sql.length > 50 ?
            record.sql.substring(0, 50) + '...' : record.sql;

        row.html(`
            <td>${timeStr}</td>
            <td><small class="text-muted">${record.database}</small></td>
            <td><span class="badge bg-${getQueryTypeBadgeClass(record.queryType)}">${record.queryType}</span></td>
            <td><code class="sql-preview" title="${record.sql.replace(/"/g, '&quot;')}">${sqlPreview}</code></td>
            <td>${record.executionTime}ms</td>
            <td>${record.affectedRows}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="loadQueryFromHistory('${record.id}')" title="加载到编辑器">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-success" onclick="executeQueryFromHistory('${record.id}')" title="重新执行">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteQueryFromHistory('${record.id}')" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `);
        tbody.append(row);
    });
}

// 获取查询类型对应的徽章样式
function getQueryTypeBadgeClass(queryType) {
    switch (queryType) {
        case 'SELECT': return 'info';
        case 'INSERT': return 'success';
        case 'UPDATE': return 'warning';
        case 'DELETE': return 'danger';
        case 'CREATE': return 'primary';
        case 'DROP': return 'danger';
        case 'ALTER': return 'warning';
        default: return 'secondary';
    }
}

// 从历史记录加载查询到编辑器
function loadQueryFromHistory(recordId) {
    const record = queryHistory.find(q => q.id == recordId);
    if (record && sqlEditor) {
        sqlEditor.setValue(record.sql);
        sqlEditor.focus();
        $('#queryHistoryModal').modal('hide');
        showNotification('查询已加载到编辑器', 'success');
    }
}

// 从历史记录执行查询
function executeQueryFromHistory(recordId) {
    const record = queryHistory.find(q => q.id == recordId);
    if (record) {
        loadQueryFromHistory(recordId);
        setTimeout(() => executeQuery(), 100);
    }
}

// 从历史记录删除查询
function deleteQueryFromHistory(recordId) {
    if (!confirm('确定要删除这条查询历史吗？')) return;

    queryHistory = queryHistory.filter(q => q.id != recordId);
    saveQueryHistory();
    loadQueryHistoryTable();
    showNotification('查询历史已删除', 'success');
}

// 搜索查询历史
function searchQueryHistory() {
    const searchTerm = $('#queryHistorySearch').val().toLowerCase();
    const rows = $('#queryHistoryTable tbody tr');

    rows.each(function() {
        const row = $(this);
        const text = row.text().toLowerCase();
        if (text.includes(searchTerm)) {
            row.show();
        } else {
            row.hide();
        }
    });
}

// 清空查询历史
function clearQueryHistory() {
    if (!confirm('确定要清空所有查询历史吗？此操作不可恢复。')) return;

    queryHistory = [];
    saveQueryHistory();
    loadQueryHistoryTable();
    showNotification('查询历史已清空', 'success');
}

// 导出查询历史
function exportQueryHistory() {
    if (queryHistory.length === 0) {
        showNotification('没有查询历史可以导出', 'warning');
        return;
    }

    const csvContent = generateQueryHistoryCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `query_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification('查询历史已导出', 'success');
}

// 生成查询历史CSV
function generateQueryHistoryCSV() {
    const headers = ['时间', '数据库', '查询类型', 'SQL语句', '执行时间(ms)', '影响行数'];
    const rows = queryHistory.map(record => [
        new Date(record.timestamp).toLocaleString('zh-CN'),
        record.database,
        record.queryType,
        `"${record.sql.replace(/"/g, '""')}"`,
        record.executionTime,
        record.affectedRows
    ]);

    return [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');
}

// 在应用初始化时初始化查询历史
document.addEventListener('DOMContentLoaded', function() {
    initQueryHistory();
});

// ========== 文件结束 ==========
// ========== 增强的SQL自动补全功能 ==========

// 增强的SQL上下文分析
function analyzeEnhancedSQLContext(text, column) {
    const textBefore = text.substring(0, column).toLowerCase();
    const words = textBefore.trim().split(/\s+/).filter(w => w);

    let context = {
        statementType: 'GENERAL',
        clauseType: '',
        isSnippetTrigger: false,
        tableAliases: new Map(),
        currentTable: null,
        position: { row: 0, column: column }
    };

    // 检测是否是代码片段触发器（以特定前缀开头）
    const snippetPrefixes = ['select', 'insert', 'update', 'delete', 'create', 'with', 'case'];
    if (words.length === 1 && snippetPrefixes.includes(words[0])) {
        context.isSnippetTrigger = true;
        return context;
    }

    // 检测语句类型
    if (textBefore.includes('create table')) {
        context.statementType = 'CREATE';
    } else if (textBefore.includes('insert into')) {
        context.statementType = 'INSERT';
    } else if (textBefore.includes('update')) {
        context.statementType = 'UPDATE';
    } else if (textBefore.includes('delete from')) {
        context.statementType = 'DELETE';
    } else if (textBefore.includes('select')) {
        context.statementType = 'SELECT';

        // 分析SELECT语句的子句
        const lastKeywords = [];
        for (let i = words.length - 1; i >= 0; i--) {
            if (['select', 'from', 'where', 'join', 'inner', 'left', 'right', 'full', 'group', 'order', 'having', 'limit'].includes(words[i])) {
                lastKeywords.push(words[i]);
            }
        }

        if (lastKeywords.includes('from') || lastKeywords.includes('join')) {
            context.clauseType = 'FROM';
        } else if (lastKeywords.includes('where')) {
            context.clauseType = 'WHERE';
        } else if (lastKeywords.includes('group') && lastKeywords.includes('by')) {
            context.clauseType = 'GROUP BY';
        } else if (lastKeywords.includes('order') && lastKeywords.includes('by')) {
            context.clauseType = 'ORDER BY';
        } else if (lastKeywords.includes('having')) {
            context.clauseType = 'HAVING';
        } else {
            context.clauseType = 'SELECT';
        }

        // 提取表别名
        extractTableAliases(textBefore, context.tableAliases);
    }

    return context;
}

// 提取表别名
function extractTableAliases(text, aliases) {
    const fromMatches = text.match(/from\s+(\w+)(?:\s+as\s+(\w+))?/gi);
    const joinMatches = text.match(/(?:inner|left|right|full)\s+join\s+(\w+)(?:\s+as\s+(\w+))?/gi);

    [fromMatches, joinMatches].forEach(matches => {
        if (matches) {
            matches.forEach(match => {
                const parts = match.match(/(\w+)(?:\s+as\s+(\w+))?/i);
                if (parts) {
                    const table = parts[1];
                    const alias = parts[2] || table;
                    aliases.set(alias, table);
                }
            });
        }
    });
}

// 获取增强的SELECT建议
function getEnhancedSelectSuggestions(prefix, context) {
    let suggestions = [];

    if (context.clauseType === 'SELECT') {
        suggestions = [
            { caption: '*', value: '*', meta: 'wildcard', doc: '所有字段', score: 1000 },
            { caption: 'DISTINCT', value: 'DISTINCT', meta: 'keyword', doc: '去重', score: 900 },
            { caption: 'COUNT(*)', value: 'COUNT(*)', meta: 'function', doc: '计数', score: 800 },
            { caption: 'SUM()', value: 'SUM(', meta: 'function', doc: '求和', score: 800 },
            { caption: 'AVG()', value: 'AVG(', meta: 'function', doc: '平均值', score: 800 },
            { caption: 'MAX()', value: 'MAX(', meta: 'function', doc: '最大值', score: 800 },
            { caption: 'MIN()', value: 'MIN(', meta: 'function', doc: '最小值', score: 800 },
            { caption: 'ROW_NUMBER()', value: 'ROW_NUMBER()', meta: 'window', doc: '行号', score: 750 },
            { caption: 'RANK()', value: 'RANK()', meta: 'window', doc: '排名', score: 750 },
            { caption: 'DENSE_RANK()', value: 'DENSE_RANK()', meta: 'window', doc: '密集排名', score: 750 }
        ];

        // 添加当前可用表的字段
        if (currentDbStructure && context.currentTable) {
            const tableColumns = currentDbStructure.tables[context.currentTable] || [];
            tableColumns.forEach(col => {
                suggestions.push({
                    caption: col.name,
                    value: col.name,
                    meta: 'column',
                    doc: `${col.name} (${col.type})`,
                    score: 850
                });
            });
        }
    } else if (context.clauseType === 'FROM') {
        suggestions = getTableSuggestions(prefix, context);
    } else if (context.clauseType === 'WHERE') {
        suggestions = [
            { caption: '=', value: '=', meta: 'operator', doc: '等于', score: 900 },
            { caption: '!=', value: '!=', meta: 'operator', doc: '不等于', score: 900 },
            { caption: '>', value: '>', meta: 'operator', doc: '大于', score: 900 },
            { caption: '<', value: '<', meta: 'operator', doc: '小于', score: 900 },
            { caption: '>=', value: '>=', meta: 'operator', doc: '大于等于', score: 900 },
            { caption: '<=', value: '<=', meta: 'operator', doc: '小于等于', score: 900 },
            { caption: 'LIKE', value: 'LIKE', meta: 'operator', doc: '模糊匹配', score: 850 },
            { caption: 'IN', value: 'IN', meta: 'operator', doc: '在列表中', score: 850 },
            { caption: 'BETWEEN', value: 'BETWEEN', meta: 'operator', doc: '在范围内', score: 850 },
            { caption: 'IS NULL', value: 'IS NULL', meta: 'operator', doc: '为空', score: 800 },
            { caption: 'IS NOT NULL', value: 'IS NOT NULL', meta: 'operator', doc: '不为空', score: 800 },
            { caption: 'AND', value: 'AND', meta: 'logical', doc: '并且', score: 950 },
            { caption: 'OR', value: 'OR', meta: 'logical', doc: '或者', score: 950 },
            { caption: 'NOT', value: 'NOT', meta: 'logical', doc: '非', score: 950 },
            { caption: 'EXISTS', value: 'EXISTS', meta: 'operator', doc: '存在', score: 800 }
        ];
    }

    return suggestions.filter(s => s.caption.toLowerCase().includes(prefix.toLowerCase()));
}

// 获取数据库感知的建议
function getDatabaseAwareSuggestions(prefix, context) {
    if (!currentDbStructure) return [];

    let suggestions = [];

    // 表名建议
    if (context.clauseType === 'FROM' || context.clauseType === 'JOIN') {
        const tableNames = Object.keys(currentDbStructure.tables);
        tableNames.forEach(tableName => {
            if (tableName.toLowerCase().includes(prefix.toLowerCase())) {
                suggestions.push({
                    caption: tableName,
                    value: tableName,
                    meta: 'table',
                    doc: `表: ${tableName}`,
                    score: 1000
                });
            }
        });
    }

    // 字段名建议
    if (context.clauseType === 'SELECT' || context.clauseType === 'WHERE') {
        Object.keys(currentDbStructure.tables).forEach(tableName => {
            const columns = currentDbStructure.tables[tableName] || [];
            columns.forEach(col => {
                if (col.name.toLowerCase().includes(prefix.toLowerCase())) {
                    suggestions.push({
                        caption: col.name,
                        value: col.name,
                        meta: 'column',
                        doc: `${col.name} (${col.type})`,
                        score: 900
                    });
                }
            });
        });
    }

    return suggestions;
}

// 带代码片段的通用SQL建议
function getGeneralSQLSuggestionsWithSnippets(prefix, context) {
    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
        'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'JOIN', 'INNER',
        'LEFT', 'RIGHT', 'FULL', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING',
        'LIMIT', 'OFFSET', 'UNION', 'DISTINCT', 'AND', 'OR', 'NOT', 'IN', 'LIKE',
        'BETWEEN', 'IS', 'NULL', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
        'EXISTS', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'WITH'
    ];

    return keywords
        .filter(keyword => keyword.toLowerCase().includes(prefix.toLowerCase()))
        .map(keyword => ({
            caption: keyword,
            value: keyword,
            meta: 'keyword',
            score: 800
        }));
}

// 设置增强的SQL自动补全
function setupEnhancedSQLAutocompletion() {
    if (!sqlEditor) return;

    console.log('设置增强的SQL自动补全');

    // 创建代码片段管理器
    const snippetManager = {
        getSnippets: function() {
            return Object.keys(sqlSnippets).map(key => ({
                caption: sqlSnippets[key].prefix,
                snippet: sqlSnippets[key].body,
                meta: 'snippet',
                description: sqlSnippets[key].description
            }));
        },

        expandSnippet: function(prefix) {
            const snippet = Object.values(sqlSnippets).find(s => s.prefix === prefix);
            return snippet ? snippet.body : null;
        }
    };

    // 增强的SQL补全器
    const enhancedSQLCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
            const line = session.getLine(pos.row);
            const textBeforeCursor = line.substring(0, pos.column);
            const context = analyzeEnhancedSQLContext(textBeforeCursor, pos.column);

            let suggestions = [];

            // 根据上下文获取不同类型的建议
            if (context.isSnippetTrigger) {
                // 代码片段建议
                suggestions = snippetManager.getSnippets().filter(snippet =>
                    snippet.caption.toLowerCase().includes(prefix.toLowerCase())
                );
            } else if (context.statementType === 'SELECT') {
                suggestions = getEnhancedSelectSuggestions(prefix, context);
            } else {
                suggestions = getGeneralSQLSuggestionsWithSnippets(prefix, context);
            }

            // 添加数据库结构相关的建议
            if (currentDbStructure) {
                const dbSuggestions = getDatabaseAwareSuggestions(prefix, context);
                suggestions = suggestions.concat(dbSuggestions);
            }

            callback(null, suggestions);
        }
    };

    // 替换现有的SQL补全器
    const existingCompleters = sqlEditor.completers || [];
    const nonSQLCompleters = existingCompleters.filter(c => {
        return c.getCompletions.toString().indexOf('analyzeSQLContext') === -1;
    });

    sqlEditor.completers = [...nonSQLCompleters, enhancedSQLCompleter];

    // 启用代码片段功能
    sqlEditor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
        liveAutocompletionDelay: 200,
        liveAutocompletionThreshold: 2
    });

    console.log('增强的SQL自动补全设置完成');
}

// 在SQL模式切换时使用增强的自动补全
function useEnhancedSQLAutocompletion() {
    setupEnhancedSQLAutocompletion();
}

// ========== 数据库备份和恢复功能 ==========

// 备份历史记录
let backupHistory = [];

// 初始化备份功能
function initBackupRestore() {
    loadBackupHistory();
    updateDatabaseSelects();
}

// 更新备份选项
function updateBackupOptions() {
    const backupType = document.getElementById('backupType').value;
    const customOptions = document.getElementById('customBackupOptions');

    if (backupType === 'custom') {
        customOptions.style.display = 'block';
    } else {
        customOptions.style.display = 'none';
    }
}

// 更新数据库选择器
function updateDatabaseSelects() {
    if (!currentConnectionId) return;

    // 获取数据库列表
    fetch(`/api/databases/${currentConnectionId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateSelectOptions('backupTarget', data.databases);
                updateSelectOptions('restoreTarget', data.databases);
            }
        })
        .catch(error => {
            console.error('获取数据库列表失败:', error);
        });
}

// 更新选择器选项
function updateSelectOptions(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;

    // 保存当前选中的值
    const currentValue = select.value;

    // 清空选项，保留第一个默认选项
    select.innerHTML = select.innerHTML.split('</option>')[0] + '</option>';

    // 添加新选项
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        select.appendChild(optionElement);
    });

    // 恢复之前选中的值
    if (currentValue && options.includes(currentValue)) {
        select.value = currentValue;
    }
}

// 创建备份
function createBackup() {
    if (!currentConnectionId) {
        showAlert('请先连接数据库', 'warning');
        return;
    }

    const backupType = document.getElementById('backupType').value;
    const backupFormat = document.getElementById('backupFormat').value;
    const backupFileName = document.getElementById('backupFileName').value || generateBackupFileName();
    const backupTarget = Array.from(document.getElementById('backupTarget').selectedOptions).map(option => option.value);

    const backupConfig = {
        type: backupType,
        format: backupFormat,
        fileName: backupFileName,
        targets: backupTarget,
        includeData: backupType === 'full' || backupType === 'data' ||
                     (backupType === 'custom' && document.getElementById('backupIncludeData').checked),
        includeStructure: backupType === 'full' || backupType === 'structure' ||
                         (backupType === 'custom' && document.getElementById('backupIncludeStructure').checked),
        includeTriggers: backupType === 'custom' && document.getElementById('backupIncludeTriggers').checked
    };

    // 显示进度提示
    showProgress('正在创建备份...', 'backup');

    fetch(`/api/backup/${currentConnectionId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(backupConfig)
    })
    .then(response => response.json())
    .then(data => {
        hideProgress('backup');

        if (data.success) {
            // 添加到备份历史
            addToBackupHistory({
                id: Date.now(),
                timestamp: new Date().toISOString(),
                type: backupType,
                format: backupFormat,
                targets: backupTarget,
                fileName: backupFileName,
                fileSize: data.fileSize || 0,
                status: 'completed',
                filePath: data.filePath
            });

            showAlert('备份创建成功！', 'success');

            // 下载备份文件
            if (data.downloadUrl) {
                window.open(data.downloadUrl, '_blank');
            }
        } else {
            showAlert('备份创建失败: ' + data.error, 'danger');
        }
    })
    .catch(error => {
        hideProgress('backup');
        console.error('备份失败:', error);
        showAlert('备份创建失败: ' + error.message, 'danger');
    });
}

// 生成备份文件名
function generateBackupFileName() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `backup_${dateStr}_${timeStr}`;
}

// 恢复数据库
function restoreDatabase() {
    if (!currentConnectionId) {
        showAlert('请先连接数据库', 'warning');
        return;
    }

    const restoreFile = document.getElementById('restoreFile').files[0];
    if (!restoreFile) {
        showAlert('请选择备份文件', 'warning');
        return;
    }

    const restoreMode = document.getElementById('restoreMode').value;
    const restoreTarget = document.getElementById('restoreTarget').value;

    const restoreConfig = {
        mode: restoreMode,
        target: restoreTarget,
        ignoreErrors: document.getElementById('restoreIgnoreErrors').checked,
        dropExisting: document.getElementById('restoreDropExisting').checked,
        disableConstraints: document.getElementById('restoreDisableConstraints').checked
    };

    // 显示进度条
    const progressBar = document.querySelector('#restoreProgress .progress-bar');
    const progressContainer = document.getElementById('restoreProgress');
    progressContainer.style.display = 'block';

    const formData = new FormData();
    formData.append('backupFile', restoreFile);
    formData.append('config', JSON.stringify(restoreConfig));

    fetch(`/api/restore/${currentConnectionId}`, {
        method: 'POST',
        body: formData
    })
    .then(response => {
        // 模拟进度更新
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 20;
            if (progress > 90) progress = 90;
            progressBar.style.width = progress + '%';
            progressBar.textContent = Math.round(progress) + '%';
        }, 500);

        return response.json().then(data => {
            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';

            setTimeout(() => {
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
                progressBar.textContent = '';
            }, 2000);

            return data;
        });
    })
    .then(data => {
        if (data.success) {
            showAlert('数据库恢复成功！', 'success');

            // 添加到备份历史
            addToBackupHistory({
                id: Date.now(),
                timestamp: new Date().toISOString(),
                type: 'restore',
                format: 'restore',
                targets: [restoreTarget],
                fileName: restoreFile.name,
                fileSize: restoreFile.size,
                status: 'completed',
                restoreMode: restoreMode
            });

            // 刷新数据库结构
            if (typeof loadDatabaseStructure === 'function') {
                loadDatabaseStructure();
            }
        } else {
            showAlert('数据库恢复失败: ' + data.error, 'danger');
        }
    })
    .catch(error => {
        progressContainer.style.display = 'none';
        console.error('恢复失败:', error);
        showAlert('数据库恢复失败: ' + error.message, 'danger');
    });
}

// 预览恢复内容
function previewRestore() {
    const restoreFile = document.getElementById('restoreFile').files[0];
    if (!restoreFile) {
        showAlert('请选择备份文件', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('backupFile', restoreFile);

    showProgress('正在分析备份文件...', 'restore');

    fetch(`/api/restore/preview/${currentConnectionId}`, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        hideProgress('restore');

        if (data.success) {
            showRestorePreview(data.preview);
        } else {
            showAlert('预览失败: ' + data.error, 'danger');
        }
    })
    .catch(error => {
        hideProgress('restore');
        console.error('预览失败:', error);
        showAlert('预览失败: ' + error.message, 'danger');
    });
}

// 显示恢复预览
function showRestorePreview(preview) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">恢复预览</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h6>基本信息</h6>
                            <p><strong>文件类型:</strong> ${preview.fileType}</p>
                            <p><strong>数据库版本:</strong> ${preview.databaseVersion || '未知'}</p>
                            <p><strong>创建时间:</strong> ${preview.createTime || '未知'}</p>
                            <p><strong>预计恢复时间:</strong> ${preview.estimatedTime || '未知'}</p>
                        </div>
                        <div class="col-md-6">
                            <h6>统计信息</h6>
                            <p><strong>表数量:</strong> ${preview.tableCount || 0}</p>
                            <p><strong>总记录数:</strong> ${preview.totalRecords || 0}</p>
                            <p><strong>文件大小:</strong> ${formatFileSize(preview.fileSize || 0)}</p>
                        </div>
                    </div>
                    <div class="row mt-3">
                        <div class="col-12">
                            <h6>包含的表</h6>
                            <div class="table-responsive">
                                <table class="table table-striped table-sm">
                                    <thead>
                                        <tr>
                                            <th>表名</th>
                                            <th>记录数</th>
                                            <th>大小</th>
                                            <th>状态</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(preview.tables || []).map(table => `
                                            <tr>
                                                <td>${table.name}</td>
                                                <td>${table.recordCount || 0}</td>
                                                <td>${formatFileSize(table.size || 0)}</td>
                                                <td><span class="badge bg-success">可恢复</span></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                    <button type="button" class="btn btn-primary" onclick="restoreDatabase(); bootstrap.Modal.getInstance(this.closest('.modal')).hide();">
                        开始恢复
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    modal.addEventListener('hidden.bs.modal', () => {
        document.body.removeChild(modal);
    });
}

// 定时备份
function scheduleBackup() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">定时备份设置</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">备份频率</label>
                        <select class="form-select" id="scheduleFrequency">
                            <option value="daily">每天</option>
                            <option value="weekly">每周</option>
                            <option value="monthly">每月</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">备份时间</label>
                        <input type="time" class="form-control" id="scheduleTime" value="02:00">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">保留份数</label>
                        <input type="number" class="form-control" id="scheduleRetention" value="7" min="1" max="30">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">备份类型</label>
                        <select class="form-select" id="scheduleType">
                            <option value="full">完整备份</option>
                            <option value="structure">仅结构</option>
                            <option value="data">仅数据</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-primary" onclick="saveBackupSchedule(); bootstrap.Modal.getInstance(this.closest('.modal')).hide();">
                        保存设置
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    modal.addEventListener('hidden.bs.modal', () => {
        document.body.removeChild(modal);
    });
}

// 保存备份计划
function saveBackupSchedule() {
    const schedule = {
        frequency: document.getElementById('scheduleFrequency').value,
        time: document.getElementById('scheduleTime').value,
        retention: parseInt(document.getElementById('scheduleRetention').value),
        type: document.getElementById('scheduleType').value,
        connectionId: currentConnectionId
    };

    fetch('/api/backup/schedule', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(schedule)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('定时备份设置已保存', 'success');
        } else {
            showAlert('保存失败: ' + data.error, 'danger');
        }
    })
    .catch(error => {
        console.error('保存定时备份失败:', error);
        showAlert('保存失败: ' + error.message, 'danger');
    });
}

// 添加到备份历史
function addToBackupHistory(backup) {
    backupHistory.unshift(backup);

    // 限制历史记录数量
    if (backupHistory.length > 100) {
        backupHistory = backupHistory.slice(0, 100);
    }

    // 保存到本地存储
    localStorage.setItem('backupHistory', JSON.stringify(backupHistory));

    // 更新显示
    updateBackupHistoryDisplay();
}

// 加载备份历史
function loadBackupHistory() {
    const saved = localStorage.getItem('backupHistory');
    if (saved) {
        try {
            backupHistory = JSON.parse(saved);
        } catch (error) {
            console.error('加载备份历史失败:', error);
            backupHistory = [];
        }
    }
    updateBackupHistoryDisplay();
}

// 更新备份历史显示
function updateBackupHistoryDisplay() {
    const tbody = document.querySelector('#backupHistoryTable tbody');
    if (!tbody) return;

    if (backupHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无备份记录</td></tr>';
        return;
    }

    tbody.innerHTML = backupHistory.map(backup => `
        <tr>
            <td>${formatDateTime(backup.timestamp)}</td>
            <td>${getBackupTypeLabel(backup.type)}</td>
            <td>${backup.targets.join(', ')}</td>
            <td>${formatFileSize(backup.fileSize)}</td>
            <td>${getStatusBadge(backup.status)}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    ${backup.filePath ? `<button class="btn btn-outline-primary" onclick="downloadBackup('${backup.filePath}')" title="下载">
                        <i class="fas fa-download"></i>
                    </button>` : ''}
                    <button class="btn btn-outline-danger" onclick="deleteBackup(${backup.id})" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// 下载备份
function downloadBackup(filePath) {
    window.open(`/api/backup/download/${encodeURIComponent(filePath)}`, '_blank');
}

// 删除备份记录
function deleteBackup(backupId) {
    if (!confirm('确定要删除这条备份记录吗？')) return;

    backupHistory = backupHistory.filter(backup => backup.id !== backupId);
    localStorage.setItem('backupHistory', JSON.stringify(backupHistory));
    updateBackupHistoryDisplay();

    showAlert('备份记录已删除', 'info');
}

// 刷新备份历史
function refreshBackupHistory() {
    loadBackupHistory();
    showAlert('备份历史已刷新', 'info');
}

// 清理旧备份
function cleanupOldBackups() {
    if (!confirm('确定要清理30天前的备份记录吗？')) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const originalCount = backupHistory.length;
    backupHistory = backupHistory.filter(backup =>
        new Date(backup.timestamp) > thirtyDaysAgo
    );

    const deletedCount = originalCount - backupHistory.length;
    localStorage.setItem('backupHistory', JSON.stringify(backupHistory));
    updateBackupHistoryDisplay();

    showAlert(`已清理 ${deletedCount} 条旧备份记录`, 'info');
}

// 辅助函数
function getBackupTypeLabel(type) {
    const labels = {
        'full': '完整备份',
        'structure': '仅结构',
        'data': '仅数据',
        'custom': '自定义',
        'restore': '恢复操作'
    };
    return labels[type] || type;
}

function getStatusBadge(status) {
    const badges = {
        'completed': '<span class="badge bg-success">已完成</span>',
        'failed': '<span class="badge bg-danger">失败</span>',
        'running': '<span class="badge bg-warning">进行中</span>',
        'scheduled': '<span class="badge bg-info">已计划</span>'
    };
    return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
}

// 显示进度提示
function showProgress(message, type = 'backup') {
    const progressDiv = document.createElement('div');
    progressDiv.id = `${type}Progress`;
    progressDiv.className = 'position-fixed top-0 start-50 translate-middle-x mt-3';
    progressDiv.style.zIndex = '9999';
    progressDiv.innerHTML = `
        <div class="alert alert-info d-flex align-items-center" role="alert">
            <div class="spinner-border spinner-border-sm me-2" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div>${message}</div>
        </div>
    `;
    document.body.appendChild(progressDiv);
}

// 隐藏进度提示
function hideProgress(type = 'backup') {
    const progressDiv = document.getElementById(`${type}Progress`);
    if (progressDiv) {
        document.body.removeChild(progressDiv);
    }
}

// 显示提示消息
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);

    // 自动隐藏
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

// ========== 文件结束 ==========

// ========== 用户权限管理 ==========

// 用户数据存储
let users = [
    {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
        lastLogin: '2025-09-26T10:30:00Z',
        createdAt: '2025-09-01T00:00:00Z',
        databasePermissions: {}
    }
];

// 角色权限配置
const rolePermissions = {
    admin: {
        name: '管理员',
        description: '完全系统访问权限',
        permissions: {
            'database:read': true, 'database:write': true, 'database:delete': true, 'database:create': true,
            'database:backup': true, 'database:restore': true, 'table:read': true, 'table:write': true,
            'table:delete': true, 'table:create': true, 'table:alter': true, 'table:truncate': true,
            'data:select': true, 'data:insert': true, 'data:update': true, 'data:delete': true,
            'data:export': true, 'data:import': true, 'user:read': true, 'user:create': true,
            'user:update': true, 'user:delete': true, 'user:manage_permissions': true, 'system:settings': true,
            'system:logs': true, 'system:monitor': true, 'system:backup': true, 'sql:execute': true,
            'sql:save': true, 'sql:history': true, 'sql:format': true
        }
    },
    developer: {
        name: '开发者',
        description: '开发和测试权限',
        permissions: {
            'database:read': true, 'database:write': true, 'database:create': true, 'table:read': true,
            'table:write': true, 'table:create': true, 'table:alter': true, 'data:select': true,
            'data:insert': true, 'data:update': true, 'data:delete': true, 'data:export': true,
            'data:import': true, 'sql:execute': true, 'sql:save': true, 'sql:history': true,
            'sql:format': true, 'system:logs': true
        }
    },
    analyst: {
        name: '分析师',
        description: '数据分析和查询权限',
        permissions: {
            'database:read': true, 'table:read': true, 'data:select': true, 'data:export': true,
            'sql:execute': true, 'sql:history': true, 'sql:format': true, 'system:logs': true
        }
    },
    viewer: {
        name: '查看者',
        description: '只读访问权限',
        permissions: {
            'database:read': true, 'table:read': true, 'data:select': true, 'data:export': true,
            'sql:execute': true, 'sql:history': true
        }
    }
};

// 审计日志存储
let auditLogs = [];

// 显示添加用户模态框
function showAddUserModal() {
    const modalHtml = `
        <div class="modal fade" id="addUserModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">添加新用户</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="addUserForm">
                            <div class="mb-3">
                                <label class="form-label">用户名 <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" id="newUsername" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">邮箱 <span class="text-danger">*</span></label>
                                <input type="email" class="form-control" id="newUserEmail" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">密码 <span class="text-danger">*</span></label>
                                <input type="password" class="form-control" id="newUserPassword" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">角色 <span class="text-danger">*</span></label>
                                <select class="form-select" id="newUserRole" required>
                                    <option value="">选择角色</option>
                                    <option value="admin">管理员</option>
                                    <option value="developer">开发者</option>
                                    <option value="analyst">分析师</option>
                                    <option value="viewer">查看者</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="newUserActive" checked>
                                    <label class="form-check-label" for="newUserActive">激活用户</label>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                        <button type="button" class="btn btn-primary" onclick="addUser()">添加用户</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('addUserModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('addUserModal'));
    modal.show();
}

// 添加用户
function addUser() {
    const username = document.getElementById('newUsername').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const active = document.getElementById('newUserActive').checked;

    if (!username || !email || !password || !role) {
        showAlert('请填写所有必填字段', 'warning');
        return;
    }

    if (users.find(u => u.username === username)) {
        showAlert('用户名已存在', 'warning');
        return;
    }

    if (users.find(u => u.email === email)) {
        showAlert('邮箱已存在', 'warning');
        return;
    }

    const newUser = {
        id: Date.now(),
        username, email, role,
        status: active ? 'active' : 'inactive',
        lastLogin: null,
        createdAt: new Date().toISOString(),
        databasePermissions: {}
    };

    users.push(newUser);
    addAuditLog('create', 'user', `创建用户: ${username}`, null, 'success');
    localStorage.setItem('users', JSON.stringify(users));

    const modal = bootstrap.Modal.getInstance(document.getElementById('addUserModal'));
    modal.hide();
    loadUsers();
    showAlert('用户添加成功', 'success');
}

// 加载用户列表
function loadUsers() {
    const tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;

    const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('roleFilter')?.value || '';

    let filteredUsers = users.filter(user => {
        const matchesSearch = !searchTerm || user.username.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm);
        const matchesRole = !roleFilter || user.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    tbody.innerHTML = filteredUsers.map(user => `
        <tr>
            <td>${user.username}</td>
            <td><span class="badge bg-${getRoleBadgeColor(user.role)}">${rolePermissions[user.role]?.name || user.role}</span></td>
            <td>${user.email}</td>
            <td><span class="badge bg-${user.status === 'active' ? 'success' : 'secondary'}">${user.status === 'active' ? '激活' : '禁用'}</span></td>
            <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString('zh-CN') : '从未登录'}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editUser(${user.id})" title="编辑"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-outline-warning" onclick="toggleUserStatus(${user.id})" title="${user.status === 'active' ? '禁用' : '激活'}"><i class="fas fa-${user.status === 'active' ? 'ban' : 'check'}"></i></button>
                    <button class="btn btn-outline-danger" onclick="deleteUser(${user.id})" title="删除"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    updateUserSelectors();
}

// 获取角色徽章颜色
function getRoleBadgeColor(role) {
    const colors = { admin: 'danger', developer: 'primary', analyst: 'info', viewer: 'secondary' };
    return colors[role] || 'secondary';
}

// 编辑用户
function editUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const modalHtml = `
        <div class="modal fade" id="editUserModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">编辑用户: ${user.username}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="editUserForm">
                            <div class="mb-3">
                                <label class="form-label">用户名</label>
                                <input type="text" class="form-control" value="${user.username}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">邮箱</label>
                                <input type="email" class="form-control" id="editUserEmail" value="${user.email}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">角色</label>
                                <select class="form-select" id="editUserRole">
                                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
                                    <option value="developer" ${user.role === 'developer' ? 'selected' : ''}>开发者</option>
                                    <option value="analyst" ${user.role === 'analyst' ? 'selected' : ''}>分析师</option>
                                    <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>查看者</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="editUserActive" ${user.status === 'active' ? 'checked' : ''}>
                                    <label class="form-check-label" for="editUserActive">激活用户</label>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">新密码 (留空不修改)</label>
                                <input type="password" class="form-control" id="editUserPassword">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                        <button type="button" class="btn btn-primary" onclick="updateUser(${userId})">更新用户</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('editUserModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
    modal.show();
}

// 更新用户
function updateUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const email = document.getElementById('editUserEmail').value.trim();
    const role = document.getElementById('editUserRole').value;
    const active = document.getElementById('editUserActive').checked;
    const password = document.getElementById('editUserPassword').value;

    if (!email || !role) {
        showAlert('请填写所有必填字段', 'warning');
        return;
    }

    if (users.find(u => u.email === email && u.id !== userId)) {
        showAlert('邮箱已被其他用户使用', 'warning');
        return;
    }

    const oldRole = user.role;
    const oldStatus = user.status;

    user.email = email;
    user.role = role;
    user.status = active ? 'active' : 'inactive';

    if (password) console.log('密码已更新');

    const changes = [];
    if (oldRole !== role) changes.push(`角色: ${oldRole} → ${role}`);
    if (oldStatus !== user.status) changes.push(`状态: ${oldStatus} → ${user.status}`);
    if (changes.length > 0) {
        addAuditLog('update', 'user', `更新用户 ${user.username}: ${changes.join(', ')}`, null, 'success');
    }

    localStorage.setItem('users', JSON.stringify(users));

    const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
    modal.hide();
    loadUsers();
    showAlert('用户更新成功', 'success');
}

// 切换用户状态
function toggleUserStatus(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? '激活' : '禁用';

    if (confirm(`确定要${action}用户 "${user.username}" 吗？`)) {
        user.status = newStatus;
        addAuditLog('update', 'user', `${action}用户: ${user.username}`, null, 'success');
        localStorage.setItem('users', JSON.stringify(users));
        loadUsers();
        showAlert(`用户已${action}`, 'success');
    }
}

// 删除用户
function deleteUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    if (confirm(`确定要删除用户 "${user.username}" 吗？此操作不可恢复。`)) {
        users = users.filter(u => u.id !== userId);
        addAuditLog('delete', 'user', `删除用户: ${user.username}`, null, 'success');
        localStorage.setItem('users', JSON.stringify(users));
        loadUsers();
        showAlert('用户删除成功', 'success');
    }
}

// 过滤用户
function filterUsers() {
    loadUsers();
}

// 更新用户选择器
function updateUserSelectors() {
    const userSelect = document.getElementById('userDatabasePermissions');
    const auditUserFilter = document.getElementById('auditUserFilter');

    if (userSelect) {
        const currentValue = userSelect.value;
        userSelect.innerHTML = '<option value="">选择用户</option>' + users.map(user => `<option value="${user.id}">${user.username}</option>`).join('');
        userSelect.value = currentValue;
    }

    if (auditUserFilter) {
        const currentValue = auditUserFilter.value;
        auditUserFilter.innerHTML = '<option value="">所有用户</option>' + users.map(user => `<option value="${user.id}">${user.username}</option>`).join('');
        auditUserFilter.value = currentValue;
    }
}

// 初始化用户权限管理
function initializeUserManagement() {
    const savedUsers = localStorage.getItem('users');
    if (savedUsers) {
        try { users = JSON.parse(savedUsers); } catch (error) { console.error('Error loading users:', error); }
    }

    const savedLogs = localStorage.getItem('auditLogs');
    if (savedLogs) {
        try { auditLogs = JSON.parse(savedLogs); } catch (error) { console.error('Error loading audit logs:', error); }
    }

    loadUsers();
}

// 页面加载完成后初始化用户管理
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => { initializeUserManagement(); }, 1000);
});

