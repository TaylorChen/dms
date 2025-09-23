#!/usr/bin/env node

// 测试表结构API响应
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/structure/test_conn_1/crypto_tweets/tweets',
    method: 'GET'
};

const req = http.request(options, (res) => {
    console.log(`状态码: ${res.statusCode}`);
    console.log(`响应头: ${JSON.stringify(res.headers, null, 2)}`);

    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            console.log('\n响应内容:');
            console.log(JSON.stringify(response, null, 2));

            // 检查响应结构
            if (response.success && response.data) {
                console.log('\n✅ API响应结构正确');
                if (response.data.columns) {
                    console.log(`✅ 找到 ${response.data.columns.length} 个列`);
                } else {
                    console.log('❌ 没有找到列信息');
                }
                if (response.data.indexes) {
                    console.log(`✅ 找到 ${response.data.indexes.length} 个索引`);
                }
                if (response.data.foreignKeys) {
                    console.log(`✅ 找到 ${response.data.foreignKeys.length} 个外键`);
                }
            } else {
                console.log('\n❌ API响应结构错误');
                console.log('错误信息:', response.error);
            }
        } catch (e) {
            console.log('解析JSON失败:', e.message);
            console.log('原始数据:', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`请求遇到问题: ${e.message}`);
});

req.end();