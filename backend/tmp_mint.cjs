require('dotenv').config({ path: '.env' });
(async () => {
  const repo = require('./services/supabaseRepository.cjs');
  const jwt = require('jsonwebtoken');
  const customers = await repo.getAll('customers', { limit: 5 });
  const c = customers[0];
  const token = jwt.sign(
    { id: c.id, customer_id: c.id, email: c.email || null, full_name: c.name || null, role: 'portal_customer' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  require('fs').writeFileSync('tmp_diag_token.txt', token);
  console.log('OK CUSTOMER=' + c.id);
})().catch(e => { console.error(e.message); process.exit(1); });
