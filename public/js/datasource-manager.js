class DataSourceManager {
    constructor() {
        this.dataSources = [];
        this.filteredDataSources = [];
        this.selectedType = 'all';
        this.selectedStatus = 'all';
        this.selectedTag = '';
        this.searchQuery = '';
        this.editingDatasource = null;
        this.selectedDatasources = new Set();

        this.init();
    }

    async init() {
        await this.loadDataSources();
        this.setupEventListeners();
        this.startAutoRefresh();
        this.handleUrlParameters();
    }

    setupEventListeners() {
        // 设置模态框事件
        const datasourceModal = new bootstrap.Modal(document.getElementById('datasourceModal'));
        const importModal = new bootstrap.Modal(document.getElementById('importModal'));
        const batchModal = new bootstrap.Modal(document.getElementById('batchModal'));

        // 搜索框回车事件
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchDataSources();
            }
        });
    }

    async loadDataSources() {
        try {
            const response = await fetch('/api/datasources');
            const result = await response.json();

            if (result.success) {
                this.dataSources = result.data;
                this.filteredDataSources = [...this.dataSources];
                this.renderDataSources();
                this.updateStats();
                this.loadTags();
            } else {
                this.showError('加载数据源失败: ' + result.error);
            }
        } catch (error) {
            this.showError('加载数据源失败: ' + error.message);
        }
    }

    renderDataSources() {
        const container = document.getElementById('datasourceContainer');

        if (this.filteredDataSources.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="empty-state">
                        <i class="fas fa-database"></i>
                        <h5>暂无数据源</h5>
                        <p>点击"新建数据源"按钮创建您的第一个数据源</p>
                    </div>
                </div>
            `;
            return;
        }

        const html = this.filteredDataSources.map(ds => this.renderDatasourceCard(ds)).join('');
        container.innerHTML = `<div class="col-12">${html}</div>`;
    }

    renderDatasourceCard(datasource) {
        const isSelected = this.selectedDatasources.has(datasource.name);

        return `
            <div class="datasource-card fade-in ${isSelected ? 'border-primary' : ''}" id="card-${datasource.name}">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <input type="checkbox" class="form-check-input me-3"
                                   ${isSelected ? 'checked' : ''}
                                   onchange="toggleDatasourceSelection('${datasource.name}')">
                            <div>
                                <h6 class="mb-1">${datasource.name}</h6>
                                <span class="datasource-type ${datasource.type}">${datasource.type}</span>
                            </div>
                        </div>
                        <div class="d-flex align-items-center">
                            <span class="status-badge ${datasource.status}">
                                <i class="fas fa-circle fa-xs"></i>
                                ${datasource.status === 'connected' ? '已连接' : '未连接'}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8">
                            ${datasource.description ? `<p class="text-muted mb-2">${datasource.description}</p>` : ''}
                            ${datasource.tags.length > 0 ? `
                                <div class="mb-2">
                                    ${datasource.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                                </div>
                            ` : ''}
                            <div class="connection-stats">
                                <small>
                                    <i class="fas fa-clock"></i> 响应时间: ${datasource.connectionStats.avgResponseTime.toFixed(0)}ms |
                                    <i class="fas fa-link"></i> 连接次数: ${datasource.connectionStats.totalConnections} |
                                    <i class="fas fa-times-circle"></i> 失败次数: ${datasource.connectionStats.failedConnections}
                                </small>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="action-buttons text-end">
                                ${datasource.status === 'connected' ? `
                                    <button class="btn btn-outline-danger btn-sm" onclick="disconnectDatasource('${datasource.name}')" title="断开连接">
                                        <i class="fas fa-unlink"></i>
                                    </button>
                                ` : `
                                    <button class="btn btn-outline-success btn-sm" onclick="connectDatasource('${datasource.name}')" title="连接">
                                        <i class="fas fa-link"></i>
                                    </button>
                                `}
                                <button class="btn btn-outline-primary btn-sm" onclick="editDatasource('${datasource.name}')" title="编辑">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-outline-warning btn-sm" onclick="testDatasource('${datasource.name}')" title="测试连接">
                                    <i class="fas fa-plug"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-sm" onclick="deleteDatasource('${datasource.name}')" title="删除">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    updateStats() {
        const stats = this.dataSources.reduce((acc, ds) => {
            acc.total++;
            if (ds.status === 'connected') acc.connected++;
            else acc.disconnected++;
            acc.totalResponseTime += ds.connectionStats.avgResponseTime;
            return acc;
        }, { total: 0, connected: 0, disconnected: 0, totalResponseTime: 0 });

        document.getElementById('totalDatasources').textContent = stats.total;
        document.getElementById('connectedDatasources').textContent = stats.connected;
        document.getElementById('disconnectedDatasources').textContent = stats.disconnected;
        document.getElementById('avgResponseTime').textContent =
            stats.total > 0 ? `${(stats.totalResponseTime / stats.total).toFixed(0)}ms` : '0ms';
    }

    loadTags() {
        const allTags = new Set();
        this.dataSources.forEach(ds => {
            ds.tags.forEach(tag => allTags.add(tag));
        });

        const select = document.getElementById('tagFilter');
        select.innerHTML = '<option value="">按标签筛选</option>';
        Array.from(allTags).sort().forEach(tag => {
            select.innerHTML += `<option value="${tag}">${tag}</option>`;
        });
    }

    showCreateModal() {
        this.editingDatasource = null;
        document.getElementById('modalTitle').textContent = '新建数据源';
        document.getElementById('datasourceForm').reset();
        document.querySelectorAll('.config-form').forEach(form => form.style.display = 'none');
        this.showModal('datasourceModal');
    }

    async editDatasource(name) {
        const datasource = this.dataSources.find(ds => ds.name === name);
        if (!datasource) return;

        this.editingDatasource = datasource;
        document.getElementById('modalTitle').textContent = '编辑数据源';

        // 填充基本信息
        document.getElementById('dsName').value = datasource.name;
        document.getElementById('dsType').value = datasource.type;
        document.getElementById('dsDescription').value = datasource.description || '';
        document.getElementById('dsTags').value = datasource.tags.join(', ');

        // 显示对应的配置表单
        this.showConfigForm();

        // 填充配置信息
        this.fillConfigForm(datasource);

        this.showModal('datasourceModal');
    }

    showConfigForm() {
        const type = document.getElementById('dsType').value;
        document.querySelectorAll('.config-form').forEach(form => form.style.display = 'none');

        if (type) {
            document.getElementById(`${type}Config`).style.display = 'block';
        }
    }

    fillConfigForm(datasource) {
        const config = datasource.config;

        switch (datasource.type) {
            case 'mysql':
                document.getElementById('mysqlHost').value = config.host || '';
                document.getElementById('mysqlPort').value = config.port || '';
                document.getElementById('mysqlUser').value = config.user || '';
                document.getElementById('mysqlPassword').value = config.password || '';
                document.getElementById('mysqlDatabase').value = config.database || '';
                break;
            case 'postgresql':
                document.getElementById('pgHost').value = config.host || '';
                document.getElementById('pgPort').value = config.port || '';
                document.getElementById('pgUser').value = config.user || '';
                document.getElementById('pgPassword').value = config.password || '';
                document.getElementById('pgDatabase').value = config.database || '';
                break;
            case 'mongodb':
                document.getElementById('mongodbUrl').value = config.url || '';
                document.getElementById('mongodbDatabase').value = config.database || '';
                break;
            case 'redis':
                document.getElementById('redisHost').value = config.host || '';
                document.getElementById('redisPort').value = config.port || '';
                document.getElementById('redisPassword').value = config.password || '';
                document.getElementById('redisDb').value = config.db || 0;
                break;
        }
    }

    getConfigFromForm() {
        const type = document.getElementById('dsType').value;
        let config = {};

        switch (type) {
            case 'mysql':
                config = {
                    host: document.getElementById('mysqlHost').value,
                    port: parseInt(document.getElementById('mysqlPort').value),
                    user: document.getElementById('mysqlUser').value,
                    password: document.getElementById('mysqlPassword').value,
                    database: document.getElementById('mysqlDatabase').value || undefined
                };
                break;
            case 'postgresql':
                config = {
                    host: document.getElementById('pgHost').value,
                    port: parseInt(document.getElementById('pgPort').value),
                    user: document.getElementById('pgUser').value,
                    password: document.getElementById('pgPassword').value,
                    database: document.getElementById('pgDatabase').value || undefined
                };
                break;
            case 'mongodb':
                config = {
                    url: document.getElementById('mongodbUrl').value,
                    database: document.getElementById('mongodbDatabase').value
                };
                break;
            case 'redis':
                config = {
                    host: document.getElementById('redisHost').value,
                    port: parseInt(document.getElementById('redisPort').value),
                    password: document.getElementById('redisPassword').value || undefined,
                    db: parseInt(document.getElementById('redisDb').value) || 0
                };
                break;
        }

        return config;
    }

    async testConnection() {
        const type = document.getElementById('dsType').value;
        const config = this.getConfigFromForm();

        if (!type || !config) {
            this.showError('请填写完整的配置信息');
            return;
        }

        const testBtn = document.getElementById('testBtn');
        testBtn.disabled = true;
        testBtn.innerHTML = '<div class="loading-spinner"></div> 测试中...';

        try {
            const response = await fetch('/api/datasources/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, config })
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(`连接测试成功，响应时间: ${result.responseTime}ms`);
            } else {
                this.showError('连接测试失败: ' + result.error);
            }
        } catch (error) {
            this.showError('连接测试失败: ' + error.message);
        } finally {
            testBtn.disabled = false;
            testBtn.innerHTML = '<i class="fas fa-plug"></i> 测试连接';
        }
    }

    async saveDatasource() {
        const name = document.getElementById('dsName').value.trim();
        const type = document.getElementById('dsType').value;
        const description = document.getElementById('dsDescription').value.trim();
        const tags = document.getElementById('dsTags').value.split(',').map(t => t.trim()).filter(t => t);
        const config = this.getConfigFromForm();

        if (!name || !type || !config) {
            this.showError('请填写完整的配置信息');
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="loading-spinner"></div> 保存中...';

        try {
            const url = this.editingDatasource ? `/api/datasources/${this.editingDatasource.name}` : '/api/datasources';
            const method = this.editingDatasource ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, config, description, tags })
            });

            const result = await response.json();

            if (result.success) {
                this.hideModal('datasourceModal');
                await this.loadDataSources();
                this.showSuccess(this.editingDatasource ? '数据源更新成功' : '数据源创建成功');
            } else {
                this.showError('保存失败: ' + result.error);
            }
        } catch (error) {
            this.showError('保存失败: ' + error.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
        }
    }

    async connectDatasource(name) {
        try {
            const response = await fetch(`/api/datasources/${name}/connect`, { method: 'POST' });
            const result = await response.json();

            if (result.success) {
                await this.loadDataSources();
                this.showSuccess('连接成功: ' + result.message);
            } else {
                this.showError('连接失败: ' + result.error);
            }
        } catch (error) {
            this.showError('连接失败: ' + error.message);
        }
    }

    async disconnectDatasource(name) {
        try {
            const response = await fetch(`/api/datasources/${name}/disconnect`, { method: 'POST' });
            const result = await response.json();

            if (result.success) {
                await this.loadDataSources();
                this.showSuccess('断开连接成功');
            } else {
                this.showError('断开连接失败: ' + result.error);
            }
        } catch (error) {
            this.showError('断开连接失败: ' + error.message);
        }
    }

    async testDatasource(name) {
        const datasource = this.dataSources.find(ds => ds.name === name);
        if (!datasource) return;

        try {
            const response = await fetch('/api/datasources/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: datasource.type, config: datasource.config })
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(`连接测试成功，响应时间: ${result.responseTime}ms`);
            } else {
                this.showError('连接测试失败: ' + result.error);
            }
        } catch (error) {
            this.showError('连接测试失败: ' + error.message);
        }
    }

    async deleteDatasource(name) {
        if (!confirm(`确定要删除数据源 "${name}" 吗？`)) return;

        try {
            const response = await fetch(`/api/datasources/${name}`, { method: 'DELETE' });
            const result = await response.json();

            if (result.success) {
                await this.loadDataSources();
                this.showSuccess('删除成功');
            } else {
                this.showError('删除失败: ' + result.error);
            }
        } catch (error) {
            this.showError('删除失败: ' + error.message);
        }
    }

    filterByType(type) {
        this.selectedType = type;
        document.querySelectorAll('[onclick^="filterByType"]').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        this.applyFilters();
    }

    filterByStatus(status) {
        this.selectedStatus = status;
        document.querySelectorAll('[onclick^="filterByStatus"]').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        this.applyFilters();
    }

    filterByTag() {
        this.selectedTag = document.getElementById('tagFilter').value;
        this.applyFilters();
    }

    searchDataSources() {
        this.searchQuery = document.getElementById('searchInput').value.toLowerCase();
        this.applyFilters();
    }

    applyFilters() {
        this.filteredDataSources = this.dataSources.filter(ds => {
            // 类型过滤
            if (this.selectedType !== 'all' && ds.type !== this.selectedType) return false;

            // 状态过滤
            if (this.selectedStatus !== 'all' && ds.status !== this.selectedStatus) return false;

            // 标签过滤
            if (this.selectedTag && !ds.tags.includes(this.selectedTag)) return false;

            // 搜索过滤
            if (this.searchQuery) {
                const query = this.searchQuery;
                return ds.name.toLowerCase().includes(query) ||
                       (ds.description && ds.description.toLowerCase().includes(query)) ||
                       ds.type.toLowerCase().includes(query) ||
                       ds.tags.some(tag => tag.toLowerCase().includes(query));
            }

            return true;
        });

        this.renderDataSources();
    }

    toggleDatasourceSelection(name) {
        if (this.selectedDatasources.has(name)) {
            this.selectedDatasources.delete(name);
        } else {
            this.selectedDatasources.add(name);
        }

        // 更新卡片边框样式
        const card = document.getElementById(`card-${name}`);
        if (card) {
            card.classList.toggle('border-primary', this.selectedDatasources.has(name));
        }
    }

    showBatchModal() {
        if (this.selectedDatasources.size === 0) {
            this.showError('请先选择要操作的数据源');
            return;
        }

        const selectedDiv = document.getElementById('selectedDatasources');
        selectedDiv.innerHTML = Array.from(this.selectedDatasources).map(name =>
            `<small class="d-block mb-1"><i class="fas fa-database"></i> ${name}</small>`
        ).join('');

        this.showModal('batchModal');
    }

    async executeBatchOperation() {
        const operation = document.getElementById('batchOperation').value;
        const names = Array.from(this.selectedDatasources);

        if (!confirm(`确定要对选中的 ${names.length} 个数据源执行${operation === 'delete' ? '删除' : operation === 'connect' ? '连接' : '断开'}操作吗？`)) {
            return;
        }

        try {
            const response = await fetch('/api/datasources/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation, names })
            });

            const result = await response.json();

            if (result.success) {
                this.hideModal('batchModal');
                this.selectedDatasources.clear();
                await this.loadDataSources();

                const successCount = result.data.filter(r => r.success).length;
                this.showSuccess(`批量操作完成，成功: ${successCount}/${names.length}`);
            } else {
                this.showError('批量操作失败: ' + result.error);
            }
        } catch (error) {
            this.showError('批量操作失败: ' + error.message);
        }
    }

    async exportDatasources() {
        try {
            const response = await fetch('/api/datasources/export');
            const data = await response.json();

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `datasources_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);

            this.showSuccess('导出成功');
        } catch (error) {
            this.showError('导出失败: ' + error.message);
        }
    }

    showImportModal() {
        document.getElementById('importForm').reset();
        this.showModal('importModal');
    }

    async importDatasources() {
        const fileInput = document.getElementById('importFile');
        const file = fileInput.files[0];

        if (!file) {
            this.showError('请选择要导入的文件');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/datasources/import', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.hideModal('importModal');
                await this.loadDataSources();

                const successCount = result.data.filter(r => r.success).length;
                this.showSuccess(`导入完成，成功: ${successCount}/${result.data.length}`);
            } else {
                this.showError('导入失败: ' + result.error);
            }
        } catch (error) {
            this.showError('导入失败: ' + error.message);
        }
    }

    handleUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const editName = urlParams.get('edit');
        const deleteName = urlParams.get('delete');

        if (editName) {
            setTimeout(() => {
                this.editDatasource(editName);
            }, 500);
        }

        if (deleteName) {
            setTimeout(() => {
                this.deleteDatasource(deleteName);
            }, 500);
        }
    }

    async refreshDataSources() {
        await this.loadDataSources();
        this.showSuccess('刷新成功');
    }

    showModal(modalId) {
        const modal = new bootstrap.Modal(document.getElementById(modalId));
        modal.show();
    }

    hideModal(modalId) {
        const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
        if (modal) modal.hide();
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'danger');
    }

    showToast(message, type = 'info') {
        const toastHtml = `
            <div class="toast align-items-center text-white bg-${type} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;

        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }

        const toastElement = document.createElement('div');
        toastElement.innerHTML = toastHtml;
        toastContainer.appendChild(toastElement);

        const toast = new bootstrap.Toast(toastElement.querySelector('.toast'));
        toast.show();

        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }

    startAutoRefresh() {
        // 每30秒自动刷新一次状态
        setInterval(() => {
            this.loadDataSources();
        }, 30000);
    }
}

// 全局函数
let dataSourceManager;

function showCreateModal() {
    dataSourceManager.showCreateModal();
}

function showImportModal() {
    dataSourceManager.showImportModal();
}

function editDatasource(name) {
    dataSourceManager.editDatasource(name);
}

function testConnection() {
    dataSourceManager.testConnection();
}

function saveDatasource() {
    dataSourceManager.saveDatasource();
}

function connectDatasource(name) {
    dataSourceManager.connectDatasource(name);
}

function disconnectDatasource(name) {
    dataSourceManager.disconnectDatasource(name);
}

function testDatasource(name) {
    dataSourceManager.testDatasource(name);
}

function deleteDatasource(name) {
    dataSourceManager.deleteDatasource(name);
}

function filterByType(type) {
    dataSourceManager.filterByType(type);
}

function filterByStatus(status) {
    dataSourceManager.filterByStatus(status);
}

function filterByTag() {
    dataSourceManager.filterByTag();
}

function searchDataSources() {
    dataSourceManager.searchDataSources();
}

function toggleDatasourceSelection(name) {
    dataSourceManager.toggleDatasourceSelection(name);
}

function exportDatasources() {
    dataSourceManager.exportDatasources();
}

function importDatasources() {
    dataSourceManager.importDatasources();
}

function executeBatchOperation() {
    dataSourceManager.executeBatchOperation();
}

function refreshDataSources() {
    dataSourceManager.refreshDataSources();
}

function showSettings() {
    alert('设置功能开发中...');
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    dataSourceManager = new DataSourceManager();
});

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    dataSourceManager?.showError('发生错误: ' + event.message);
});