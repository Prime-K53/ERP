const http = require('http');

async function testEndpoint(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5001,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'admin'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json, contentType: res.headers['content-type'] });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, contentType: res.headers['content-type'], parseError: e.message });
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    console.log('--- STARTING API ERROR HANDLING TESTS ---');

    // 1. Test 404 Not Found (Standardized)
    console.log('\n[Test 1] 404 Not Found');
    try {
        const res = await testEndpoint('/api/documents/non-existent-id/preview');
        console.log(`Status: ${res.status}`);
        console.log(`Content-Type: ${res.contentType}`);
        console.log(`Body:`, JSON.stringify(res.data, null, 2));
        if (res.status === 404 && res.data.status === 'error' && res.data.code) {
            console.log('[PASS] 404 response is standardized JSON');
        } else {
            console.log('[FAIL] 404 response is not standardized');
        }
    } catch (e) {
        console.error('[ERROR] Test 1 failed:', e.message);
    }

    // 2. Test 403 Access Denied (Standardized)
    // We need a voided document ID. Let's assume one or just hit the endpoint and expect a 404 if not found, 
    // but the logic for 403 is already tested in the previous step's logic.
    // Let's try to finalize without a blueprint to trigger a 400.
    console.log('\n[Test 2] 400 Missing Blueprint');
    try {
        const res = await testEndpoint('/api/documents/some-id/finalize', 'POST', {});
        console.log(`Status: ${res.status}`);
        console.log(`Body:`, JSON.stringify(res.data, null, 2));
        if (res.status === 400 && res.data.status === 'error' && res.data.code === 'MISSING_BLUEPRINT') {
            console.log('[PASS] 400 response is standardized JSON');
        } else {
            console.log('[FAIL] 400 response is not standardized');
        }
    } catch (e) {
        console.error('[ERROR] Test 2 failed:', e.message);
    }

    // 3. Test Invalid JSON Body to POST (Standardized 500 or 400 depending on middleware)
    console.log('\n[Test 3] Invalid JSON to POST');
    try {
        // We'll send raw string that is not JSON
        const res = await new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: 5001,
                path: '/api/documents',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, data }));
            });
            req.write('not-a-json');
            req.end();
        });
        console.log(`Status: ${res.status}`);
        console.log(`Body: ${res.data}`);
        // Express body-parser might return an HTML error by default for invalid JSON
        // but our sendError should handle it if it reaches our routes.
    } catch (e) {
        console.error('[ERROR] Test 3 failed:', e.message);
    }

    console.log('\n--- API ERROR HANDLING TESTS COMPLETE ---');
}

runTests();