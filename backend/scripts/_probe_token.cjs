const fs = require('fs');
const path = require('path');
const jwt = require(path.join(__dirname, '..', 'node_modules', 'jsonwebtoken'));
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const match = env.match(/^JWT_SECRET\s*=\s*(.+)$/m);
if (!match) { console.error('no JWT_SECRET'); process.exit(1); }
const secret = match[1].trim();
const t = jwt.sign({ id: 'test-user-' + Date.now(), customer_id: 'CUST-0001', email: 't@x.com', role: 'portal_customer' }, secret, { expiresIn: '5m' });
fs.writeFileSync(path.join(process.env.TEMP || '/tmp', 'opencode', 'tok.txt'), t);
console.log('token written');