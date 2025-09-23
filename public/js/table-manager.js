// 表管理器主类
class TableManager {
    constructor() {
        this.currentDatabase = null;
        this.currentTable = null;
        this.pinnedTables = JSON.parse(localStorage.getItem('pinnedTables') || '[]');
        this.init();
    }

    init() {
        this.loadDatabases();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 监听模态框事件
        document.addEventListener('shown.bs.modal', (e) => {
            if (e.target.id === 'copyTableModal') {
                this.setupCopyTableModal();
            }
        });
    }

    async loadDatabases() {
        try {
            const response = await fetch('/api/datasources');
            const dataSources = await response.json();

            const databaseList = document.getElementById('databaseList');
            databaseList.innerHTML = '';

            for (const dataSource of dataSources) {
                if (dataSource.status !== 'connected') continue;

                const dbElement = document.createElement('div');
                dbElement.className = 'database-item';
                dbElement.innerHTML = `
                    <div class="p-3 border-bottom">
                        <h6 class="mb-0">
                            <i class="fas fa-database text-primary"></i> ${dataSource.name}
                        </h6>
                        <small class="text-muted">${dataSource.database}</small>
                    </div>
                `;
                databaseList.appendChild(dbElement);

                // 加载表
                await this.loadTables(dataSource, dbElement);
            }
        } catch (error) {
            console.error('加载数据库失败:', error);
            this.showToast('加载数据库失败', 'error');
        }
    }

    async loadTables(dataSource, parentElement) {
        try {
            const response = await fetch(`/api/mysql/tables?database=${dataSource.database}`);
            const tables = await response.json();

            const tablesContainer = document.createElement('div');
            tablesContainer.className = 'tables-container';
            tablesContainer.style.display = 'none';

            for (const table of tables) {
                const tableItem = document.createElement('div');
                tableItem.className = 'table-item';
                tableItem.dataset.database = dataSource.database;
                tableItem.dataset.table = table;

                const isPinned = this.pinnedTables.some(t =>
                    t.database === dataSource.database && t.table === table
                );

                tableItem.innerHTML = `
                    <div>
                        <i class="fas fa-table text-success me-2"></i>
                        ${table}
                        ${isPinned ? '<i class="fas fa-thumbtack text-warning ms-2"></i>' : ''}
                    </div>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="tableManager.quickViewTable('${dataSource.database}', '${table}')" title="快速查看">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                `;

                tableItem.addEventListener('click', (e) => {
                    if (!e.target.closest('.table-actions')) {
                        this.selectTable(dataSource.database, table, tableItem);
                    }
                });

                tablesContainer.appendChild(tableItem);
            }

            parentElement.appendChild(tablesContainer);

            // 点击数据库标题展开/折叠表列表
            const dbHeader = parentElement.querySelector('.database-item > div');
            dbHeader.addEventListener('click', () => {
                tablesContainer.style.display =
                    tablesContainer.style.display === 'none' ? 'block' : 'none';
            });
        } catch (error) {
            console.error('加载表失败:', error);
        }
    }

    async selectTable(database, table, element) {
        // 更新选中状态
        document.querySelectorAll('.table-item').forEach(item => {
            item.classList.remove('active');
        });
        element.classList.add('active');

        this.currentDatabase = database;
        this.currentTable = table;

        // 更新标题
        document.getElementById('currentTableTitle').textContent = `${database}.${table}`;

        // 加载表信息
        await this.loadTableStructure();
        await this.loadTableData();
        await this.loadTableDDL();
        await this.loadTableIndexes();
    }

    async loadTableStructure() {
        if (!this.currentDatabase || !this.currentTable) return;

        try {
            const response = await fetch(`/api/mysql/table-structure?database=${this.currentDatabase}&table=${this.currentTable}`);
            const structure = await response.json();

            const structureContainer = document.getElementById('tableStructure');
            structureContainer.innerHTML = `
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>字段名</th>
                                <th>类型</th>
                                <th>长度</th>
                                <th>允许NULL</th>
                                <th>默认值</th>
                                <th>主键</th>
                                <th>注释</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${structure.map(col => `
                                <tr>
                                    <td><strong>${col.Field}</strong></td>
                                    <td class="column-type">${col.Type}</td>
                                    <td>${this.extractLength(col.Type)}</td>
                                    <td class="${col.Null === 'YES' ? 'column-nullable' : ''}">
                                        ${col.Null === 'YES' ? 'YES' : 'NO'}
                                    </td>
                                    <td>${col.Default || '-'}</td>
                                    <td class="${col.Key === 'PRI' ? 'column-primary' : ''}">
                                        ${col.Key === 'PRI' ? 'PRI' : '-'}
                                    </td>
                                    <td>${col.Comment || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            console.error('加载表结构失败:', error);
            this.showToast('加载表结构失败', 'error');
        }
    }

    async loadTableData() {
        if (!this.currentDatabase || !this.currentTable) return;

        try {
            const response = await fetch(`/api/mysql/table-data?database=${this.currentDatabase}&table=${this.currentTable}`);
            const data = await response.json();

            const dataContainer = document.getElementById('tableData');
            if (data.length === 0) {
                dataContainer.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3"></i>
                        <p>表中暂无数据</p>
                    </div>
                `;
                return;
            }

            const columns = Object.keys(data[0]);
            dataContainer.innerHTML = `
                <div class="data-table">
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
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
                </div>
            `;
        } catch (error) {
            console.error('加载表数据失败:', error);
            this.showToast('加载表数据失败', 'error');
        }
    }

    async loadTableDDL() {
        if (!this.currentDatabase || !this.currentTable) return;

        try {
            const response = await fetch(`/api/mysql/table-ddl?database=${this.currentDatabase}&table=${this.currentTable}`);
            const ddl = await response.json();

            const ddlContainer = document.getElementById('tableDDL');
            ddlContainer.innerHTML = `
                <div class="table-structure">
                    <pre class="bg-light p-3 rounded"><code>${this.escapeHtml(ddl.ddl)}</code></pre>
                </div>
            `;
        } catch (error) {
            console.error('加载表DDL失败:', error);
            this.showToast('加载表DDL失败', 'error');
        }
    }

    async loadTableIndexes() {
        if (!this.currentDatabase || !this.currentTable) return;

        try {
            const response = await fetch(`/api/mysql/table-indexes?database=${this.currentDatabase}&table=${this.currentTable}`);
            const indexes = await response.json();

            const indexesContainer = document.getElementById('tableIndexes');
            if (indexes.length === 0) {
                indexesContainer.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="fas fa-list-ol fa-3x mb-3"></i>
                        <p>表中暂无索引</p>
                    </div>
                `;
                return;
            }

            indexesContainer.innerHTML = `
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>索引名</th>
                                <th>类型</th>
                                <th>字段</th>
                                <th>唯一</th>
                                <th>注释</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${indexes.map(index => `
                                <tr>
                                    <td><strong>${index.Key_name}</strong></td>
                                    <td>${index.Index_type || '-'}</td>
                                    <td>${index.Column_name}</td>
                                    <td>${index.Non_unique === 0 ? '是' : '否'}</td>
                                    <td>${index.Comment || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            console.error('加载表索引失败:', error);
            this.showToast('加载表索引失败', 'error');
        }
    }

    async quickViewTable(database, table) {
        this.currentDatabase = database;
        this.currentTable = table;
        document.getElementById('currentTableTitle').textContent = `${database}.${table}`;

        // 切换到数据标签页
        document.getElementById('data-tab').click();
        await this.loadTableData();
    }

    async refreshTable() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        await this.loadTableStructure();
        await this.loadTableData();
        await this.loadTableDDL();
        await this.loadTableIndexes();

        this.showToast('表信息已刷新', 'success');
    }

    async pinTable() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        const tableKey = `${this.currentDatabase}.${this.currentTable}`;
        const existingIndex = this.pinnedTables.findIndex(t =>
            t.database === this.currentDatabase && t.table === this.currentTable
        );

        if (existingIndex >= 0) {
            this.pinnedTables.splice(existingIndex, 1);
            this.showToast('已取消固定表', 'info');
        } else {
            this.pinnedTables.push({
                database: this.currentDatabase,
                table: this.currentTable,
                timestamp: Date.now()
            });
            this.showToast('已固定表', 'success');
        }

        localStorage.setItem('pinnedTables', JSON.stringify(this.pinnedTables));
        await this.loadDatabases(); // 重新加载以更新固定状态
    }

    async copyTableName() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        const tableName = `${this.currentDatabase}.${this.currentTable}`;
        try {
            await navigator.clipboard.writeText(tableName);
            this.showToast('表名已复制到剪贴板', 'success');
        } catch (error) {
            console.error('复制表名失败:', error);
            this.showToast('复制表名失败', 'error');
        }
    }

    async copyTable() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        const newTableName = document.getElementById('newTableName').value;
        const copyStructure = document.getElementById('copyStructure').checked;
        const copyData = document.getElementById('copyData').checked;
        const copyIndexes = document.getElementById('copyIndexes').checked;

        if (!newTableName) {
            this.showToast('请输入新表名', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/mysql/copy-table', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    database: this.currentDatabase,
                    table: this.currentTable,
                    newTable: newTableName,
                    copyStructure,
                    copyData,
                    copyIndexes
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('表复制成功', 'success');
                bootstrap.Modal.getInstance(document.getElementById('copyTableModal')).hide();
                await this.loadDatabases(); // 刷新表列表
            } else {
                this.showToast(`复制失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('复制表失败:', error);
            this.showToast('复制表失败', 'error');
        }
    }

    async truncateTable() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        if (!confirm(`确定要清空表 ${this.currentDatabase}.${this.currentTable} 的所有数据吗？此操作不可恢复！`)) {
            return;
        }

        try {
            const response = await fetch('/api/mysql/truncate-table', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    database: this.currentDatabase,
                    table: this.currentTable
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('表数据已清空', 'success');
                await this.loadTableData();
            } else {
                this.showToast(`清空失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('清空表失败:', error);
            this.showToast('清空表失败', 'error');
        }
    }

    async deleteTable() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        if (!confirm(`确定要删除表 ${this.currentDatabase}.${this.currentTable} 吗？此操作不可恢复！`)) {
            return;
        }

        try {
            const response = await fetch('/api/mysql/drop-table', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    database: this.currentDatabase,
                    table: this.currentTable
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('表已删除', 'success');
                this.currentDatabase = null;
                this.currentTable = null;
                document.getElementById('currentTableTitle').textContent = '请选择表';
                await this.loadDatabases(); // 刷新表列表

                // 清空内容
                document.getElementById('tableStructure').innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-table fa-3x mb-3"></i><p>请选择一个表查看结构</p></div>';
                document.getElementById('tableData').innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-database fa-3x mb-3"></i><p>请选择一个表查看数据</p></div>';
                document.getElementById('tableDDL').innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-code fa-3x mb-3"></i><p>请选择一个表查看DDL</p></div>';
                document.getElementById('tableIndexes').innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-list-ol fa-3x mb-3"></i><p>请选择一个表查看索引</p></div>';
            } else {
                this.showToast(`删除失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('删除表失败:', error);
            this.showToast('删除表失败', 'error');
        }
    }

    async generateTestData() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        const rowCount = parseInt(document.getElementById('generateRowCount').value);
        const dataType = document.getElementById('generateDataType').value;
        const truncateBeforeGenerate = document.getElementById('truncateBeforeGenerate').checked;

        try {
            const response = await fetch('/api/mysql/generate-test-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    database: this.currentDatabase,
                    table: this.currentTable,
                    rowCount,
                    dataType,
                    truncateBeforeGenerate
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast(`成功生成 ${result.generatedRows} 条测试数据`, 'success');
                bootstrap.Modal.getInstance(document.getElementById('generateDataModal')).hide();
                await this.loadTableData();
            } else {
                this.showToast(`生成测试数据失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('生成测试数据失败:', error);
            this.showToast('生成测试数据失败', 'error');
        }
    }

    async exportAsSQL() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/mysql/export-table-sql?database=${this.currentDatabase}&table=${this.currentTable}`);
            const result = await response.json();

            if (result.success) {
                this.downloadFile(`${this.currentTable}.sql`, result.sql);
            } else {
                this.showToast(`导出失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('导出SQL失败:', error);
            this.showToast('导出SQL失败', 'error');
        }
    }

    async exportAsCSV() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/mysql/export-table-csv?database=${this.currentDatabase}&table=${this.currentTable}`);
            const blob = await response.blob();

            this.downloadFile(`${this.currentTable}.csv`, blob);
        } catch (error) {
            console.error('导出CSV失败:', error);
            this.showToast('导出CSV失败', 'error');
        }
    }

    async exportAsExcel() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/mysql/export-table-excel?database=${this.currentDatabase}&table=${this.currentTable}`);
            const blob = await response.blob();

            this.downloadFile(`${this.currentTable}.xlsx`, blob);
        } catch (error) {
            console.error('导出Excel失败:', error);
            this.showToast('导出Excel失败', 'error');
        }
    }

    async importData() {
        if (!this.currentDatabase || !this.currentTable) {
            this.showToast('请先选择一个表', 'warning');
            return;
        }

        const fileInput = document.getElementById('importDataFile');
        const file = fileInput.files[0];
        if (!file) {
            this.showToast('请选择要导入的文件', 'warning');
            return;
        }

        const format = document.getElementById('importDataFormat').value;
        const headerRow = document.getElementById('importHeaderRow').checked;
        const truncateTable = document.getElementById('importTruncateTable').checked;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('database', this.currentDatabase);
        formData.append('table', this.currentTable);
        formData.append('format', format);
        formData.append('headerRow', headerRow);
        formData.append('truncateTable', truncateTable);

        try {
            const response = await fetch('/api/mysql/import-data', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showToast(`成功导入 ${result.importedRows} 条数据`, 'success');
                bootstrap.Modal.getInstance(document.getElementById('importDataModal')).hide();
                await this.loadTableData();
            } else {
                this.showToast(`导入失败: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('导入数据失败:', error);
            this.showToast('导入数据失败', 'error');
        }
    }

    // 辅助方法
    extractLength(type) {
        const match = type.match(/\((\d+)\)/);
        return match ? match[1] : '-';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    downloadFile(filename, content) {
        const blob = content instanceof Blob ? content : new Blob([content]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    showToast(message, type = 'info') {
        // 创建toast容器
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            toastContainer.style.zIndex = '9999';
            document.body.appendChild(toastContainer);
        }

        const toastId = 'toast-' + Date.now();
        const bgClass = {
            'success': 'bg-success',
            'error': 'bg-danger',
            'warning': 'bg-warning',
            'info': 'bg-info'
        }[type] || 'bg-info';

        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast ${bgClass} text-white`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="toast-body">
                ${message}
            </div>
        `;

        toastContainer.appendChild(toast);

        const bsToast = new bootstrap.Toast(toast, {
            autohide: true,
            delay: 3000
        });

        bsToast.show();

        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    setupCopyTableModal() {
        if (this.currentTable) {
            document.getElementById('newTableName').value = this.currentTable + '_copy';
        }
    }
}

// 全局函数
let tableManager;

document.addEventListener('DOMContentLoaded', () => {
    tableManager = new TableManager();
});

// 全局函数供HTML调用
function showCopyTableModal() {
    if (!tableManager.currentDatabase || !tableManager.currentTable) {
        tableManager.showToast('请先选择一个表', 'warning');
        return;
    }
    new bootstrap.Modal(document.getElementById('copyTableModal')).show();
}

function showGenerateDataModal() {
    if (!tableManager.currentDatabase || !tableManager.currentTable) {
        tableManager.showToast('请先选择一个表', 'warning');
        return;
    }
    new bootstrap.Modal(document.getElementById('generateDataModal')).show();
}

function showImportDataModal() {
    if (!tableManager.currentDatabase || !tableManager.currentTable) {
        tableManager.showToast('请先选择一个表', 'warning');
        return;
    }
    new bootstrap.Modal(document.getElementById('importDataModal')).show();
}

function showImportSQLModal() {
    tableManager.showToast('SQL导入功能开发中', 'info');
}

function showEditTableModal() {
    tableManager.showToast('编辑表功能开发中', 'info');
}