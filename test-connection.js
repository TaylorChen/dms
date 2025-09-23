// 测试连接数据
const testConnections = [
    {
        id: 'test_conn_1',
        name: '本地MySQL测试',
        type: 'mysql',
        config: {
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: '',
            database: 'test'
        },
        lastConnected: new Date().toISOString(),
        autoConnect: false
    },
    {
        id: 'test_conn_2',
        name: '远程PostgreSQL',
        type: 'postgresql',
        config: {
            host: '192.168.1.100',
            port: 5432,
            user: 'postgres',
            password: 'password',
            database: 'postgres'
        },
        lastConnected: new Date(Date.now() - 3600000).toISOString(),
        autoConnect: false
    }
];

// 在浏览器控制台中运行这个脚本来添加测试数据
function addTestConnections() {
    localStorage.setItem('savedConnections', JSON.stringify(testConnections));
    console.log('测试连接数据已添加到localStorage');
    console.log('请刷新页面查看效果');
}

// 清理测试数据
function clearTestConnections() {
    localStorage.removeItem('savedConnections');
    localStorage.removeItem('connections');
    localStorage.removeItem('dbConnections');
    console.log('测试连接数据已清理');
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { addTestConnections, clearTestConnections, testConnections };
} else {
    window.addTestConnections = addTestConnections;
    window.clearTestConnections = clearTestConnections;
}