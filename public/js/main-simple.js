// 简化版本用于测试
console.log('Main-simple.js loaded');

// 全局变量
let currentConnectionId = null;
let connections = [];
let connectionGroups = [];

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
    console.log('showNewConnectionModal function:', typeof showNewConnectionModal);
});

// 显示新建连接模态框
function showNewConnectionModal() {
    console.log('showNewConnectionModal called');
    try {
        $('#newConnectionModal').modal('show');
        console.log('Modal shown successfully');
    } catch (error) {
        console.error('Error showing modal:', error);
        alert('显示模态框时出错: ' + error.message);
    }
}

// 测试函数
function testLibraries() {
    console.log('=== 测试库函数 ===');
    console.log('jQuery:', typeof $ !== 'undefined' ? '✓ 已加载' : '✗ 未加载');
    console.log('jQuery版本:', $.fn.jquery);
    console.log('Bootstrap:', typeof $.fn.modal !== 'undefined' ? '✓ 已加载' : '✗ 未加载');
    console.log('新建连接模态框:', $('#newConnectionModal').length > 0 ? '✓ 找到' : '✗ 未找到');
    alert('库测试完成，请查看控制台获取详细信息。');
}

function simpleModalTest() {
    console.log('Simple modal test called');
    alert('测试：JavaScript函数可以正常调用！');
    try {
        $('#newConnectionModal').modal('show');
        console.log('Modal show method called');
    } catch (error) {
        console.error('Modal test failed:', error);
        alert('模态框测试失败: ' + error.message);
    }
}

console.log('Main-simple.js functions defined');