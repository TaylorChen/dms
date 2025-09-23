// 注入Redis结果展示的CSS样式
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
            font-family: 'Courier New', monospace;
            font-weight: 600;
            color: #495057;
            word-break: break-all;
            margin-bottom: 4px;
        }

        .redis-key-actions {
            display: flex;
            gap: 4px;
            opacity: 0.7;
            transition: opacity 0.2s ease;
        }

        .redis-key-card:hover .redis-key-actions {
            opacity: 1;
        }

        .json-viewer {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 16px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            max-height: 400px;
            overflow-y: auto;
        }

        .value-display {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
        }

        .result-table {
            font-size: 14px;
        }

        .result-table th {
            background-color: #f8f9fa;
            font-weight: 600;
            border-bottom: 2px solid #dee2e6;
        }

        /* 滚动条美化 */
        .redis-keys-container::-webkit-scrollbar {
            width: 6px;
        }

        .redis-keys-container::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
        }

        .redis-keys-container::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 3px;
        }

        .redis-keys-container::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
        }
    `;

    document.head.appendChild(style);
}

class QueryConsole {
    constructor() {
        this.editor = null;
        this.currentDatasource = null;
        this.currentDatabase = null;
        this.queryHistory = JSON.parse(localStorage.getItem('queryHistory') || '[]');
        this.savedQueries = JSON.parse(localStorage.getItem('savedQueries') || '[]');
        this.selectedFile = null;

        this.init();
    }

    async init() {
        // 注入Redis样式
        injectRedisStyles();

        await this.loadDataSources();
        this.initEditor();
        this.setupEventListeners();
        this.loadQueryHistory();
    }

    initEditor() {
        this.editor = CodeMirror.fromTextArea(document.getElementById('sqlEditor'), {
            mode: 'text/x-sql',
            theme: 'monokai',
            lineNumbers: true,
            lineWrapping: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            extraKeys: {
                "Ctrl-Enter": () => this.executeQuery(),
                "Cmd-Enter": () => this.executeQuery(),
                "Ctrl-Space": "autocomplete"
            },
            hintOptions: {
                completeSingle: false
            }
        });

        this.editor.setSize(null, '100%');
        this.editor.setValue('-- 选择数据源后开始编写SQL查询\n-- 支持快捷键 Ctrl+Enter 或 Cmd+Enter 执行查询');
    }

    setupEventListeners() {
        // 文件拖拽
        const fileDropArea = document.getElementById('fileDropArea');
        const fileInput = document.getElementById('sqlFileInput');

        fileDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileDropArea.classList.add('drag-over');
        });

        fileDropArea.addEventListener('dragleave', () => {
            fileDropArea.classList.remove('drag-over');
        });

        fileDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileDropArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });
    }

    async loadDataSources() {
        try {
            const response = await fetch('/api/datasources');
            const result = await response.json();

            if (result.success) {
                this.renderDataSources(result.data);
            } else {
                this.showMessage('加载数据源失败: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showMessage('加载数据源失败: ' + error.message, 'danger');
        }
    }

    renderDataSources(dataSources) {
        const container = document.getElementById('datasourceList');

        if (dataSources.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-plug"></i>
                    <div>无可用数据源</div>
                    <small class="text-muted">请先连接数据源</small>
                </div>
            `;
            return;
        }

        const html = dataSources.map(ds => `
            <div class="datasource-item" onclick="queryConsole.selectDatasource('${ds.name}')">
                <div class="d-flex align-items-center">
                    <span class="status-indicator ${ds.status}"></span>
                    <div class="flex-grow-1">
                        <div class="fw-bold">${ds.name}</div>
                        <small class="text-muted">${ds.config.host || ds.config.url}</small>
                    </div>
                    <span class="datasource-type ${ds.type}">${ds.type}</span>
                </div>
                <div class="mt-2" id="db-${ds.name}" style="display: none;">
                    <!-- 数据库列表将在这里动态加载 -->
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    async selectDatasource(name) {
        // 更新选中状态
        document.querySelectorAll('.datasource-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget.classList.add('active');

        // 获取数据源详细信息
        try {
            const response = await fetch(`/api/datasources/${name}`);
            const result = await response.json();

            if (result.success) {
                this.currentDatasource = result.data;
                document.getElementById('currentDatasource').textContent = `当前数据源: ${name}`;

                // 加载数据库列表
                await this.loadDatabases(name);

                // 启用编辑器
                this.editor.setOption('readOnly', false);
                this.editor.setValue('');
                this.editor.focus();
            } else {
                this.showMessage('获取数据源信息失败: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showMessage('获取数据源信息失败: ' + error.message, 'danger');
        }
    }

    async loadDatabases(datasourceName) {
        try {
            // 先连接数据源
            const connectResponse = await fetch(`/api/datasources/${datasourceName}/connect`, {
                method: 'POST'
            });
            const connectResult = await connectResponse.json();

            if (!connectResult.success) {
                this.showMessage('连接数据源失败: ' + connectResult.error, 'danger');
                return;
            }

            const connectionId = connectResult.connectionId;

            // 获取数据库列表
            const response = await fetch(`/api/databases/${connectionId}`);
            const result = await response.json();

            if (result.success) {
                this.renderDatabases(datasourceName, result.data, connectionId);
            } else {
                this.showMessage('获取数据库列表失败: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showMessage('加载数据库失败: ' + error.message, 'danger');
        }
    }

    renderDatabases(datasourceName, databases, connectionId) {
        const container = document.getElementById(`db-${datasourceName}`);
        container.style.display = 'block';

        if (databases.length === 0) {
            container.innerHTML = '<div class="text-muted small">无数据库</div>';
            return;
        }

        const html = databases.map(db => `
            <div class="database-item" onclick="queryConsole.selectDatabase('${connectionId}', '${db}')">
                <i class="fas fa-database"></i> ${db}
            </div>
        `).join('');

        container.innerHTML = html;
    }

    selectDatabase(connectionId, database) {
        // 更新选中状态
        document.querySelectorAll('.database-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget.classList.add('active');

        this.currentDatabase = database;
        this.currentConnectionId = connectionId;

        // 加载数据表
        this.loadTables(connectionId, database);
    }

    async loadTables(connectionId, database) {
        try {
            const response = await fetch(`/api/tables/${connectionId}/${database}`);
            const result = await response.json();

            if (result.success) {
                this.renderTables(database, result.data);
            } else {
                console.error('获取表列表失败:', result.error);
            }
        } catch (error) {
            console.error('加载表失败:', error);
        }
    }

    renderTables(database, tables) {
        const dbElement = document.querySelector(`.database-item.active`);
        if (!dbElement) return;

        let tablesContainer = dbElement.nextElementSibling;
        if (!tablesContainer || !tablesContainer.classList.contains('tables-container')) {
            tablesContainer = document.createElement('div');
            tablesContainer.className = 'tables-container';
            dbElement.parentNode.insertBefore(tablesContainer, dbElement.nextSibling);
        }

        if (tables.length === 0) {
            tablesContainer.innerHTML = '';
            return;
        }

        const html = tables.map(table => `
            <div class="table-item" onclick="queryConsole.insertTableName('${table}')">
                <i class="fas fa-table"></i> ${table}
            </div>
        `).join('');

        tablesContainer.innerHTML = html;
    }

    insertTableName(tableName) {
        const cursor = this.editor.getCursor();
        const text = this.editor.getValue();
        const line = this.editor.getLine(cursor.line);

        // 在当前行末尾插入表名
        const newText = line + ' ' + tableName;
        this.editor.replaceRange(newText, {line: cursor.line, ch: 0}, {line: cursor.line, ch: line.length});

        // 移动光标到行尾
        this.editor.setCursor({line: cursor.line, ch: newText.length});
        this.editor.focus();
    }

    async executeQuery() {
        if (!this.currentConnectionId) {
            this.showMessage('请先选择数据源和数据库', 'warning');
            return;
        }

        const sql = this.editor.getValue().trim();
        if (!sql) {
            this.showMessage('请输入SQL查询', 'warning');
            return;
        }

        this.showLoading(true);
        const startTime = Date.now();

        try {
            const response = await fetch(`/api/query/${this.currentConnectionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql })
            });

            const result = await response.json();
            const executionTime = Date.now() - startTime;

            if (result.success) {
                this.displayResult(result.data, executionTime);
                this.addToHistory(sql, executionTime, result.data);
            } else {
                this.displayError(result.error);
            }

            document.getElementById('executionTime').textContent = `执行时间: ${executionTime}ms`;
            document.getElementById('rowCount').textContent = `影响行数: ${result.meta?.rowLength || 0}`;
        } catch (error) {
            this.displayError('执行失败: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async explainQuery() {
        if (!this.currentConnectionId) {
            this.showMessage('请先选择数据源和数据库', 'warning');
            return;
        }

        const sql = this.editor.getValue().trim();
        if (!sql) {
            this.showMessage('请输入SQL查询', 'warning');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(`/api/explain/${this.currentConnectionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql })
            });

            const result = await response.json();

            if (result.success) {
                this.displayExplainPlan(result.data);
            } else {
                this.showMessage('获取执行计划失败: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showMessage('获取执行计划失败: ' + error.message, 'danger');
        } finally {
            this.showLoading(false);
        }
    }

    displayResult(data, executionTime) {
        const resultContent = document.getElementById('resultContent');

        if (!data || data.length === 0) {
            resultContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle text-success"></i>
                    <div>查询执行成功</div>
                    <small class="text-muted">执行时间: ${executionTime}ms，无返回数据</small>
                </div>
            `;
            return;
        }

        // 处理Redis多命令结果
        if (Array.isArray(data) && data.length > 0 && (data[0].hasOwnProperty('success') || data[0].hasOwnProperty('data'))) {
            // 这是Redis的多命令结果格式
            let resultHtml = '';

            data.forEach((result, index) => {
                if (result.success === false) {
                    resultHtml += `
                        <div class="alert alert-warning mb-3">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>命令 ${index + 1} 执行失败:</strong> ${result.error}
                        </div>
                    `;
                } else if (result.data) {
                    if (Array.isArray(result.data)) {
                        // Keys命令结果 - 使用卡片式布局
                        resultHtml += `
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
                                                            <div class="redis-key-name">${this.escapeHtml(key)}</div>
                                                            <small class="text-muted">${this.analyzeKeyPattern(key)}</small>
                                                        </div>
                                                        <div class="redis-key-actions">
                                                            <button class="btn btn-sm btn-outline-primary" onclick="queryConsole.inspectKey('${this.escapeHtml(key)}')" title="查看详情">
                                                                <i class="fas fa-eye"></i>
                                                            </button>
                                                            <button class="btn btn-sm btn-outline-danger" onclick="queryConsole.deleteKey('${this.escapeHtml(key)}')" title="删除">
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
                    } else if (typeof result.data === 'object' && result.data !== null) {
                        // JSON对象结果
                        resultHtml += `
                            <div class="mb-4">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="text-primary mb-0">
                                        <i class="fas fa-cube me-2"></i>
                                        JSON 数据
                                    </h6>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="this.previousElementSibling.nextElementSibling.classList.toggle('d-none')">
                                        <i class="fas fa-expand-arrows-alt"></i> 展开/收缩
                                    </button>
                                </div>
                                <div class="json-viewer">
                                    <pre class="mb-0">${this.escapeHtml(JSON.stringify(result.data, null, 2))}</pre>
                                </div>
                            </div>
                        `;
                    } else {
                        // 简单值结果
                        resultHtml += `
                            <div class="mb-4">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="text-primary mb-0">
                                        <i class="fas fa-database me-2"></i>
                                        查询结果
                                    </h6>
                                    <span class="badge bg-success">${typeof result.data}</span>
                                </div>
                                <div class="value-display">
                                    <pre class="mb-0 p-3 bg-light rounded">${this.escapeHtml(String(result.data))}</pre>
                                </div>
                            </div>
                        `;
                    }
                } else {
                    // 空结果或状态结果
                    resultHtml += `
                        <div class="alert alert-success mb-3">
                            <i class="fas fa-check-circle me-2"></i>
                            <strong>命令 ${index + 1} 执行成功</strong>
                            ${result.message ? `<br><small>${result.message}</small>` : ''}
                        </div>
                    `;
                }
            });

            resultContent.innerHTML = resultHtml;
        } else {
            // 处理普通的SQL结果格式
            const columns = Object.keys(data[0]);
            const tableHtml = `
                <div class="table-responsive">
                    <table class="table table-striped table-hover" id="resultTable">
                        <thead>
                            <tr>
                                ${columns.map(col => `<th>${col}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    ${columns.map(col => `<td>${this.escapeHtml(row[col] || '')}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            resultContent.innerHTML = tableHtml;

            // 初始化DataTable
            $('#resultTable').DataTable({
                pageLength: 50,
                responsive: true,
                language: {
                    url: '//cdn.datatables.net/plug-ins/1.11.5/i18n/zh.json'
                }
            });
        }

        // 切换到结果标签页
        const resultTab = new bootstrap.Tab(document.querySelector('[data-bs-target="#resultTab"]'));
        resultTab.show();
    }

    // 分析键的模式
    analyzeKeyPattern(key) {
        if (key.includes(':')) {
            const parts = key.split(':');
            if (parts.length > 1) {
                return `类型: ${parts[0]} | ID: ${parts[parts.length - 1]}`;
            }
        }
        return '简单键';
    }

    // 检查键详情（待实现）
    async inspectKey(key) {
        if (!this.currentConnectionId) return;

        try {
            const response = await fetch(`/api/query/${this.currentConnectionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: `TYPE ${key}` })
            });
            const result = await response.json();

            if (result.success) {
                this.showMessage(`键 "${key}" 的类型: ${result.data[0]?.type || 'unknown'}`, 'info');
            }
        } catch (error) {
            this.showMessage('检查键详情失败: ' + error.message, 'danger');
        }
    }

    // 删除键（待实现）
    async deleteKey(key) {
        if (!this.currentConnectionId) return;

        if (!confirm(`确定要删除键 "${key}" 吗？`)) return;

        try {
            const response = await fetch(`/api/query/${this.currentConnectionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: `DEL ${key}` })
            });
            const result = await response.json();

            if (result.success) {
                this.showMessage(`键 "${key}" 删除成功`, 'success');
                // 重新执行当前查询
                this.executeQuery();
            }
        } catch (error) {
            this.showMessage('删除键失败: ' + error.message, 'danger');
        }
    }

    displayExplainPlan(data) {
        const resultContent = document.getElementById('resultContent');

        let planHtml = '<div class="execution-plan">';
        if (Array.isArray(data)) {
            planHtml += data.map(row => JSON.stringify(row, null, 2)).join('\n\n');
        } else if (typeof data === 'object') {
            planHtml += JSON.stringify(data, null, 2);
        } else {
            planHtml += data;
        }
        planHtml += '</div>';

        resultContent.innerHTML = planHtml;

        // 切换到结果标签页
        const resultTab = new bootstrap.Tab(document.querySelector('[data-bs-target="#resultTab"]'));
        resultTab.show();
    }

    displayError(error) {
        const resultContent = document.getElementById('resultContent');
        resultContent.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>查询执行失败</strong><br>
                ${this.escapeHtml(error)}
            </div>
        `;

        // 切换到结果标签页
        const resultTab = new bootstrap.Tab(document.querySelector('[data-bs-target="#resultTab"]'));
        resultTab.show();
    }

    formatQuery() {
        const sql = this.editor.getValue();
        if (!sql.trim()) return;

        // 简单的SQL格式化
        const formatted = this.formatSql(sql);
        this.editor.setValue(formatted);
        this.showMessage('SQL已格式化', 'success');
    }

    formatSql(sql) {
        // 简单的SQL格式化逻辑
        return sql
            .toUpperCase()
            .replace(/\bSELECT\b/g, 'SELECT')
            .replace(/\bFROM\b/g, '\nFROM')
            .replace(/\bWHERE\b/g, '\nWHERE')
            .replace(/\bGROUP BY\b/g, '\nGROUP BY')
            .replace(/\bORDER BY\b/g, '\nORDER BY')
            .replace(/\bLIMIT\b/g, '\nLIMIT')
            .replace(/\bJOIN\b/g, '\nJOIN')
            .replace(/\bINNER JOIN\b/g, '\nINNER JOIN')
            .replace(/\bLEFT JOIN\b/g, '\nLEFT JOIN')
            .replace(/\bRIGHT JOIN\b/g, '\nRIGHT JOIN')
            .replace(/\bAND\b/g, '\n  AND')
            .replace(/\bOR\b/g, '\n  OR')
            .trim();
    }

    clearEditor() {
        if (confirm('确定要清空编辑器内容吗？')) {
            this.editor.setValue('');
            this.editor.focus();
        }
    }

    runSqlFile() {
        if (!this.currentConnectionId) {
            this.showMessage('请先选择数据源', 'warning');
            return;
        }
        this.showModal('runSqlFileModal');
    }

    handleFileSelect(file) {
        if (!file.name.endsWith('.sql')) {
            this.showMessage('请选择SQL文件', 'warning');
            return;
        }

        this.selectedFile = file;
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileInfo').style.display = 'block';
        document.getElementById('executeFileBtn').disabled = false;
    }

    async executeSqlFile() {
        if (!this.selectedFile) return;

        this.showLoading(true);

        try {
            const content = await this.readFileContent(this.selectedFile);
            const statements = this.splitSqlStatements(content);

            let successCount = 0;
            let errorCount = 0;
            const results = [];

            for (const sql of statements) {
                if (sql.trim()) {
                    try {
                        const response = await fetch(`/api/query/${this.currentConnectionId}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sql })
                        });

                        const result = await response.json();
                        if (result.success) {
                            successCount++;
                        } else {
                            errorCount++;
                            results.push(`错误: ${result.error}`);
                        }
                    } catch (error) {
                        errorCount++;
                        results.push(`错误: ${error.message}`);
                    }
                }
            }

            this.hideModal('runSqlFileModal');
            this.showMessage(`SQL文件执行完成: 成功 ${successCount} 条, 失败 ${errorCount} 条`,
                           errorCount > 0 ? 'warning' : 'success');

            if (results.length > 0) {
                this.displayMessages(results);
            }

        } catch (error) {
            this.showMessage('执行SQL文件失败: ' + error.message, 'danger');
        } finally {
            this.showLoading(false);
        }
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    splitSqlStatements(sql) {
        return sql.split(';').map(s => s.trim()).filter(s => s);
    }

    createDatabase() {
        if (!this.currentDatasource) {
            this.showMessage('请先选择数据源', 'warning');
            return;
        }

        if (this.currentDatasource.type !== 'mysql' && this.currentDatasource.type !== 'postgresql') {
            this.showMessage('当前数据源不支持创建数据库', 'warning');
            return;
        }

        this.showModal('createDatabaseModal');
    }

    async createNewDatabase() {
        const name = document.getElementById('databaseName').value.trim();
        const charset = document.getElementById('databaseCharset').value;
        const collation = document.getElementById('databaseCollation').value;

        if (!name) {
            this.showMessage('请输入数据库名称', 'warning');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(name)) {
            this.showMessage('数据库名称只能包含字母、数字和下划线', 'warning');
            return;
        }

        this.showLoading(true);

        try {
            const sql = this.currentDatasource.type === 'mysql'
                ? `CREATE DATABASE \`${name}\` CHARACTER SET ${charset} COLLATE ${collation}`
                : `CREATE DATABASE "${name}" WITH ENCODING '${charset}' LC_COLLATE = '${collation}'`;

            const response = await fetch(`/api/query/${this.currentConnectionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql })
            });

            const result = await response.json();

            if (result.success) {
                this.hideModal('createDatabaseModal');
                this.showMessage(`数据库 "${name}" 创建成功`, 'success');
                // 刷新数据库列表
                await this.loadDatabases(this.currentDatasource.name);
            } else {
                this.showMessage('创建数据库失败: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showMessage('创建数据库失败: ' + error.message, 'danger');
        } finally {
            this.showLoading(false);
        }
    }

    editDatasource() {
        if (!this.currentDatasource) {
            this.showMessage('请先选择数据源', 'warning');
            return;
        }

        // 跳转到数据源管理页面并编辑当前数据源
        window.location.href = `datasource-manager.html?edit=${encodeURIComponent(this.currentDatasource.name)}`;
    }

    copyDatasourceName() {
        if (!this.currentDatasource) {
            this.showMessage('请先选择数据源', 'warning');
            return;
        }

        navigator.clipboard.writeText(this.currentDatasource.name).then(() => {
            this.showMessage('连接名称已复制到剪贴板', 'success');
        }).catch(() => {
            this.showMessage('复制失败，请手动复制', 'warning');
        });
    }

    removeDatasource() {
        if (!this.currentDatasource) {
            this.showMessage('请先选择数据源', 'warning');
            return;
        }

        if (confirm(`确定要删除数据源 "${this.currentDatasource.name}" 吗？此操作不可撤销。`)) {
            // 跳转到数据源管理页面并删除数据源
            window.location.href = `datasource-manager.html?delete=${encodeURIComponent(this.currentDatasource.name)}`;
        }
    }

    saveQuery() {
        const sql = this.editor.getValue().trim();
        if (!sql) {
            this.showMessage('没有可保存的查询内容', 'warning');
            return;
        }

        this.showModal('saveQueryModal');
    }

    saveQueryToFile() {
        const name = document.getElementById('queryName').value.trim();
        const description = document.getElementById('queryDescription').value.trim();
        const tags = document.getElementById('queryTags').value.split(',').map(t => t.trim()).filter(t => t);
        const sql = this.editor.getValue().trim();

        if (!name) {
            this.showMessage('请输入查询名称', 'warning');
            return;
        }

        const query = {
            id: Date.now(),
            name,
            description,
            tags,
            sql,
            createdAt: new Date().toISOString(),
            datasource: this.currentDatasource?.name,
            database: this.currentDatabase
        };

        this.savedQueries.push(query);
        localStorage.setItem('savedQueries', JSON.stringify(this.savedQueries));

        this.hideModal('saveQueryModal');
        this.showMessage('查询已保存', 'success');
    }

    addToHistory(sql, executionTime, result) {
        const historyItem = {
            id: Date.now(),
            sql,
            executionTime,
            timestamp: new Date().toISOString(),
            datasource: this.currentDatasource?.name,
            database: this.currentDatabase,
            rowCount: result?.length || 0
        };

        this.queryHistory.unshift(historyItem);

        // 保留最近100条历史记录
        if (this.queryHistory.length > 100) {
            this.queryHistory = this.queryHistory.slice(0, 100);
        }

        localStorage.setItem('queryHistory', JSON.stringify(this.queryHistory));
        this.loadQueryHistory();
    }

    loadQueryHistory() {
        const container = document.getElementById('queryHistory');

        if (this.queryHistory.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <div>暂无历史记录</div>
                    <small class="text-muted">执行的查询将在此显示</small>
                </div>
            `;
            return;
        }

        const html = this.queryHistory.map(item => `
            <div class="history-item" onclick="queryConsole.loadHistoryItem(${item.id})">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="font-monospace small">${this.escapeHtml(item.sql.substring(0, 100))}${item.sql.length > 100 ? '...' : ''}</div>
                        <div class="text-muted">
                            ${item.datasource} / ${item.database} • ${item.executionTime}ms • ${item.rowCount} 行
                        </div>
                    </div>
                    <div class="timestamp">
                        ${new Date(item.timestamp).toLocaleString()}
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    loadHistoryItem(id) {
        const item = this.queryHistory.find(h => h.id === id);
        if (item) {
            this.editor.setValue(item.sql);
            this.showMessage('已加载历史查询', 'success');
        }
    }

    displayMessages(messages) {
        const messageContent = document.getElementById('messageContent');
        const messagesHtml = messages.map(msg => `
            <div class="alert ${msg.includes('错误') ? 'alert-danger' : 'alert-info'}" role="alert">
                ${this.escapeHtml(msg)}
            </div>
        `).join('');

        messageContent.innerHTML = messagesHtml;

        // 切换到消息标签页
        const messageTab = new bootstrap.Tab(document.querySelector('[data-bs-target="#messageTab"]'));
        messageTab.show();
    }

    showLoading(show) {
        document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
    }

    showModal(modalId) {
        const modal = new bootstrap.Modal(document.getElementById(modalId));
        modal.show();
    }

    hideModal(modalId) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
        if (modal) modal.hide();
    }

    showMessage(message, type = 'info') {
        // 在消息标签页显示消息
        const messageContent = document.getElementById('messageContent');
        const timestamp = new Date().toLocaleString();

        const messageHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <strong>${timestamp}</strong><br>
                ${this.escapeHtml(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        if (messageContent.querySelector('.empty-state')) {
            messageContent.innerHTML = messageHtml;
        } else {
            messageContent.insertAdjacentHTML('afterbegin', messageHtml);
        }

        // 切换到消息标签页
        const messageTab = new bootstrap.Tab(document.querySelector('[data-bs-target="#messageTab"]'));
        messageTab.show();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 全局变量和函数
let queryConsole;

// 工具栏函数
function executeQuery() {
    queryConsole.executeQuery();
}

function explainQuery() {
    queryConsole.explainQuery();
}

function formatQuery() {
    queryConsole.formatQuery();
}

function clearEditor() {
    queryConsole.clearEditor();
}

function runSqlFile() {
    queryConsole.runSqlFile();
}

function executeSqlFile() {
    queryConsole.executeSqlFile();
}

function createDatabase() {
    queryConsole.createDatabase();
}

function createNewDatabase() {
    queryConsole.createNewDatabase();
}

function editDatasource() {
    queryConsole.editDatasource();
}

function copyDatasourceName() {
    queryConsole.copyDatasourceName();
}

function removeDatasource() {
    queryConsole.removeDatasource();
}

function saveQuery() {
    queryConsole.saveQuery();
}

function saveQueryToFile() {
    queryConsole.saveQueryToFile();
}

function toggleHistory() {
    const historyTab = new bootstrap.Tab(document.querySelector('[data-bs-target="#historyTab"]'));
    historyTab.show();
}

function showSettings() {
    alert('设置功能开发中...');
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    queryConsole = new QueryConsole();
});