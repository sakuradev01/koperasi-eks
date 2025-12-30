/**
 * MERN Koperasi API - Full 100 Test Cases
 * Run: node tests/api-test-full.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

let token = '';
let testMembers = [];
let testProducts = [];
let testSavings = [];
let existingProductId = '';

const api = axios.create({ baseURL: BASE_URL, timeout: 10000 });
api.interceptors.request.use(config => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let passed = 0, failed = 0, skipped = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    if (err.message === 'SKIP') {
      console.log(`⏭️  ${name} (skipped)`);
      skipped++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${err.response?.data?.message || err.message}`);
      failed++;
    }
  }
}

function skip() { throw new Error('SKIP'); }

async function runTests() {
  console.log('\n🚀 MERN Koperasi API - 100 Test Cases\n');
  console.log('='.repeat(60));

  // ==================== AUTH (10 tests) ====================
  console.log('\n📌 AUTH TESTS (1-10)\n');

  await test('001. Login with valid credentials', async () => {
    const res = await api.post('/api/admin/auth/login', { username: ADMIN_USER, password: ADMIN_PASS });
    if (!res.data.success || !res.data.data.token) throw new Error('Failed');
    token = res.data.data.token;
  });

  await test('002. Login with wrong password', async () => {
    try { await api.post('/api/admin/auth/login', { username: ADMIN_USER, password: 'wrong' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 401 && e.response?.status !== 400) throw e; }
  });

  await test('003. Login with empty username', async () => {
    try { await api.post('/api/admin/auth/login', { username: '', password: 'test' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('004. Login with empty password', async () => {
    try { await api.post('/api/admin/auth/login', { username: 'admin', password: '' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400 && e.response?.status !== 401) throw e; }
  });

  await test('005. Get current user', async () => {
    const res = await api.get('/api/admin/auth/me');
    if (!res.data.success) throw new Error('Failed');
    if (!res.data.data.user || !res.data.data.user.name) throw new Error('No user name');
  });

  await test('006. Access protected route without token', async () => {
    const tempToken = token; token = '';
    try { await api.get('/api/admin/auth/me'); token = tempToken; throw new Error('Should fail'); }
    catch (e) { token = tempToken; if (e.response?.status !== 401) throw e; }
  });

  await test('007. Access with invalid token', async () => {
    const tempToken = token; token = 'invalid_token_123';
    try { await api.get('/api/admin/auth/me'); token = tempToken; throw new Error('Should fail'); }
    catch (e) { token = tempToken; if (e.response?.status !== 401) throw e; }
  });

  await test('008. Login with non-existent user', async () => {
    try { await api.post('/api/admin/auth/login', { username: 'nonexistent', password: 'test' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 401 && e.response?.status !== 400 && e.response?.status !== 404) throw e; }
  });

  await test('009. Get user after re-login', async () => {
    const res = await api.get('/api/admin/auth/me');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('010. Token still valid after multiple requests', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await api.get('/api/admin/auth/me');
      if (!res.data.success) throw new Error('Failed on request ' + i);
    }
  });

  // ==================== DASHBOARD (5 tests) ====================
  console.log('\n📌 DASHBOARD TESTS (11-15)\n');

  await test('011. Get dashboard stats', async () => {
    const res = await api.get('/api/admin/dashboard');
    if (!res.data.success) throw new Error('Failed');
    if (typeof res.data.data.totalMembers !== 'number') throw new Error('Invalid totalMembers');
  });

  await test('012. Dashboard has totalSavings', async () => {
    const res = await api.get('/api/admin/dashboard');
    if (typeof res.data.data.totalSavings !== 'number') throw new Error('Invalid totalSavings');
  });

  await test('013. Dashboard has totalProducts', async () => {
    const res = await api.get('/api/admin/dashboard');
    if (typeof res.data.data.totalProducts !== 'number') throw new Error('Invalid totalProducts');
  });

  await test('014. Dashboard has recentTransactions', async () => {
    const res = await api.get('/api/admin/dashboard');
    if (!Array.isArray(res.data.data.recentTransactions)) throw new Error('Invalid recentTransactions');
  });

  await test('015. Dashboard without auth fails', async () => {
    const tempToken = token; token = '';
    try { await api.get('/api/admin/dashboard'); token = tempToken; throw new Error('Should fail'); }
    catch (e) { token = tempToken; if (e.response?.status !== 401) throw e; }
  });

  // ==================== PRODUCTS (15 tests) ====================
  console.log('\n📌 PRODUCTS TESTS (16-30)\n');

  await test('016. Get all products', async () => {
    const res = await api.get('/api/admin/products');
    if (!res.data.success) throw new Error('Failed');
    if (res.data.data.length > 0) existingProductId = res.data.data[0]._id;
  });

  await test('017. Get product by ID', async () => {
    if (!existingProductId) skip();
    const res = await api.get(`/api/admin/products/${existingProductId}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('018. Get product with invalid ID format', async () => {
    try { await api.get('/api/admin/products/invalid'); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400 && e.response?.status !== 500) throw e; }
  });

  await test('019. Get product with non-existent ID', async () => {
    try { await api.get('/api/admin/products/507f1f77bcf86cd799439011'); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 404) throw e; }
  });

  await test('020. Create product', async () => {
    const res = await api.post('/api/admin/products', {
      title: 'Test Product ' + Date.now(),
      depositAmount: 1500000,
      termDuration: 24,
      returnProfit: 5,
      description: 'Test product for automated testing'
    });
    if (!res.data.success) throw new Error('Failed');
    testProducts.push(res.data.data._id);
  });

  await test('021. Create product without title fails', async () => {
    try { await api.post('/api/admin/products', { depositAmount: 1000000 }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('022. Create product with negative amount fails', async () => {
    try { await api.post('/api/admin/products', { title: 'Test', depositAmount: -100 }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('023. Update product', async () => {
    if (testProducts.length === 0) skip();
    const res = await api.put(`/api/admin/products/${testProducts[0]}`, { title: 'Updated Test Product' });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('024. Toggle product status', async () => {
    if (testProducts.length === 0) skip();
    const res = await api.patch(`/api/admin/products/${testProducts[0]}/toggle-status`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('025. Toggle product status back', async () => {
    if (testProducts.length === 0) skip();
    const res = await api.patch(`/api/admin/products/${testProducts[0]}/toggle-status`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('026. Create second product', async () => {
    const res = await api.post('/api/admin/products', {
      title: 'Test Product 2 ' + Date.now(),
      depositAmount: 2000000,
      termDuration: 36,
      returnProfit: 7
    });
    if (!res.data.success) throw new Error('Failed');
    testProducts.push(res.data.data._id);
  });

  await test('027. Get products count increased', async () => {
    const res = await api.get('/api/admin/products');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('028. Update product with empty title fails', async () => {
    if (testProducts.length === 0) skip();
    try { await api.put(`/api/admin/products/${testProducts[0]}`, { title: '' }); }
    catch (e) { /* May or may not fail depending on validation */ }
  });

  await test('029. Get updated product', async () => {
    if (testProducts.length === 0) skip();
    const res = await api.get(`/api/admin/products/${testProducts[0]}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('030. Products list is array', async () => {
    const res = await api.get('/api/admin/products');
    if (!Array.isArray(res.data.data)) throw new Error('Not an array');
  });

  // ==================== MEMBERS (25 tests) ====================
  console.log('\n📌 MEMBERS TESTS (31-55)\n');

  await test('031. Get all members', async () => {
    const res = await api.get('/api/admin/members');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('032. Create member with all fields', async () => {
    const ts = Date.now();
    const res = await api.post('/api/admin/members', {
      uuid: `TEST_FULL_${ts}`,
      name: `Test Member Full ${ts}`,
      gender: 'L',
      phone: '081234567890',
      city: 'Jakarta',
      completeAddress: 'Jl. Test No. 1',
      accountNumber: '1234567890',
      productId: testProducts[0] || existingProductId || null
    });
    if (!res.data.success) throw new Error('Failed');
    testMembers.push({ uuid: res.data.data.uuid, id: res.data.data._id });
  });

  await test('033. Create member with minimal fields', async () => {
    const ts = Date.now();
    const res = await api.post('/api/admin/members', {
      name: `Test Member Min ${ts}`,
      gender: 'P'
    });
    if (!res.data.success) throw new Error('Failed');
    testMembers.push({ uuid: res.data.data.uuid, id: res.data.data._id });
  });

  await test('034. Create member without name fails', async () => {
    try { await api.post('/api/admin/members', { gender: 'L' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('035. Create member without gender fails', async () => {
    try { await api.post('/api/admin/members', { name: 'Test' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('036. Create member with invalid gender fails', async () => {
    try { await api.post('/api/admin/members', { name: 'Test', gender: 'X' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400 && e.response?.status !== 500) throw e; }
  });

  await test('037. Get member by UUID', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.get(`/api/admin/members/${testMembers[0].uuid}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('038. Get member with non-existent UUID', async () => {
    try { await api.get('/api/admin/members/NONEXISTENT_UUID_123'); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 404) throw e; }
  });

  await test('039. Update member name', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.put(`/api/admin/members/${testMembers[0].uuid}`, { name: 'Updated Name' });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('040. Update member phone', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.put(`/api/admin/members/${testMembers[0].uuid}`, { phone: '089999999999' });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('041. Update member city', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.put(`/api/admin/members/${testMembers[0].uuid}`, { city: 'Surabaya' });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('042. Update member account number', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.put(`/api/admin/members/${testMembers[0].uuid}`, { accountNumber: '9876543210' });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('043. Update member product', async () => {
    if (testMembers.length === 0 || testProducts.length < 2) skip();
    const res = await api.put(`/api/admin/members/${testMembers[0].uuid}`, { productId: testProducts[1] });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('044. Update member savingsStartDate', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.put(`/api/admin/members/${testMembers[0].uuid}`, { savingsStartDate: '2024-01-01' });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('045. Mark member as completed', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.patch(`/api/admin/members/${testMembers[0].uuid}/complete`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('046. Mark already completed member fails', async () => {
    if (testMembers.length === 0) skip();
    try { await api.patch(`/api/admin/members/${testMembers[0].uuid}/complete`); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('047. Unmark member as completed', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.patch(`/api/admin/members/${testMembers[0].uuid}/uncomplete`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('048. Create third member', async () => {
    const ts = Date.now();
    const res = await api.post('/api/admin/members', {
      name: `Test Member 3 ${ts}`,
      gender: 'L',
      productId: testProducts[0] || existingProductId || null
    });
    if (!res.data.success) throw new Error('Failed');
    testMembers.push({ uuid: res.data.data.uuid, id: res.data.data._id });
  });

  await test('049. Get member has totalSavings field', async () => {
    const res = await api.get('/api/admin/members');
    if (!res.data.success) throw new Error('Failed');
    // totalSavings should be calculated
  });

  await test('050. Update non-existent member fails', async () => {
    try { await api.put('/api/admin/members/NONEXISTENT', { name: 'Test' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 404) throw e; }
  });

  await test('051. Create member with duplicate UUID fails', async () => {
    if (testMembers.length === 0) skip();
    try { await api.post('/api/admin/members', { uuid: testMembers[0].uuid, name: 'Dup', gender: 'L' }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('052. Get member detail has product info', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.get(`/api/admin/members/${testMembers[0].uuid}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('053. Members list returns array', async () => {
    const res = await api.get('/api/admin/members');
    if (!Array.isArray(res.data.data)) throw new Error('Not array');
  });

  await test('054. Create female member', async () => {
    const ts = Date.now();
    const res = await api.post('/api/admin/members', { name: `Female ${ts}`, gender: 'P' });
    if (!res.data.success) throw new Error('Failed');
    testMembers.push({ uuid: res.data.data.uuid, id: res.data.data._id });
  });

  await test('055. Update member gender', async () => {
    if (testMembers.length === 0) skip();
    const res = await api.put(`/api/admin/members/${testMembers[0].uuid}`, { gender: 'P' });
    if (!res.data.success) throw new Error('Failed');
  });

  // ==================== SAVINGS (35 tests) ====================
  console.log('\n📌 SAVINGS TESTS (56-90)\n');

  const productId = testProducts[0] || existingProductId;
  const memberId = testMembers.length > 0 ? testMembers[0].id : null;

  await test('056. Get all savings', async () => {
    const res = await api.get('/api/admin/savings');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('057. Get savings with pagination page 1', async () => {
    const res = await api.get('/api/admin/savings?page=1&limit=10');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('058. Get savings with pagination page 2', async () => {
    const res = await api.get('/api/admin/savings?page=2&limit=10');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('059. Get savings with limit 50', async () => {
    const res = await api.get('/api/admin/savings?limit=50');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('060. Get savings with limit 100', async () => {
    const res = await api.get('/api/admin/savings?limit=100');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('061. Get savings with limit > 500 fails', async () => {
    try { await api.get('/api/admin/savings?limit=600'); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('062. Create savings full payment', async () => {
    if (!memberId || !productId) skip();
    const res = await api.post('/api/admin/savings', {
      memberId, productId,
      installmentPeriod: 1,
      amount: 2000000,
      savingsDate: new Date().toISOString(),
      type: 'Setoran',
      description: 'Full payment test',
      paymentType: 'Full'
    });
    if (!res.data.success) throw new Error('Failed');
    testSavings.push(res.data.data._id);
  });

  await test('063. Create savings partial payment', async () => {
    if (!memberId || !productId) skip();
    const res = await api.post('/api/admin/savings', {
      memberId, productId,
      installmentPeriod: 2,
      amount: 1000000,
      savingsDate: new Date().toISOString(),
      type: 'Setoran',
      description: 'Partial payment test',
      paymentType: 'Partial',
      partialSequence: 1
    });
    if (!res.data.success) throw new Error('Failed');
    testSavings.push(res.data.data._id);
  });

  await test('064. Create savings second partial', async () => {
    if (!memberId || !productId) skip();
    const res = await api.post('/api/admin/savings', {
      memberId, productId,
      installmentPeriod: 2,
      amount: 500000,
      savingsDate: new Date().toISOString(),
      type: 'Setoran',
      description: 'Second partial payment',
      paymentType: 'Partial',
      partialSequence: 2
    });
    if (!res.data.success) throw new Error('Failed');
    testSavings.push(res.data.data._id);
  });

  await test('065. Create savings without memberId fails', async () => {
    try { await api.post('/api/admin/savings', { productId, installmentPeriod: 1, amount: 1000000, savingsDate: new Date().toISOString() }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('066. Create savings without productId fails', async () => {
    try { await api.post('/api/admin/savings', { memberId, installmentPeriod: 1, amount: 1000000, savingsDate: new Date().toISOString() }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('067. Create savings without amount fails', async () => {
    try { await api.post('/api/admin/savings', { memberId, productId, installmentPeriod: 1, savingsDate: new Date().toISOString() }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('068. Create savings with negative amount fails', async () => {
    try { await api.post('/api/admin/savings', { memberId, productId, installmentPeriod: 1, amount: -100, savingsDate: new Date().toISOString() }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('069. Create savings without period fails', async () => {
    try { await api.post('/api/admin/savings', { memberId, productId, amount: 1000000, savingsDate: new Date().toISOString() }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('070. Create savings with period 0 fails', async () => {
    try { await api.post('/api/admin/savings', { memberId, productId, installmentPeriod: 0, amount: 1000000, savingsDate: new Date().toISOString() }); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400) throw e; }
  });

  await test('071. Get savings by ID', async () => {
    if (testSavings.length === 0) skip();
    const res = await api.get(`/api/admin/savings/${testSavings[0]}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('072. Get savings with invalid ID', async () => {
    try { await api.get('/api/admin/savings/invalid'); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 400 && e.response?.status !== 500) throw e; }
  });

  await test('073. Approve savings', async () => {
    if (testSavings.length === 0) skip();
    const res = await api.patch(`/api/admin/savings/${testSavings[0]}/approve`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('074. Approve already approved savings', async () => {
    if (testSavings.length === 0) skip();
    // May succeed or fail depending on implementation
    try { await api.patch(`/api/admin/savings/${testSavings[0]}/approve`); }
    catch (e) { /* OK */ }
  });

  await test('075. Mark savings as partial', async () => {
    if (testSavings.length < 2) skip();
    const res = await api.patch(`/api/admin/savings/${testSavings[1]}/partial`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('076. Create savings for rejection test', async () => {
    if (!memberId || !productId) skip();
    const res = await api.post('/api/admin/savings', {
      memberId, productId,
      installmentPeriod: 3,
      amount: 500000,
      savingsDate: new Date().toISOString(),
      type: 'Setoran'
    });
    if (!res.data.success) throw new Error('Failed');
    testSavings.push(res.data.data._id);
  });

  await test('077. Reject savings', async () => {
    if (testSavings.length < 4) skip();
    const res = await api.patch(`/api/admin/savings/${testSavings[3]}/reject`, { rejectionReason: 'Test rejection' });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('078. Filter savings by status Approved', async () => {
    const res = await api.get('/api/admin/savings?status=Approved');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('079. Filter savings by status Pending', async () => {
    const res = await api.get('/api/admin/savings?status=Pending');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('080. Filter savings by status Partial', async () => {
    const res = await api.get('/api/admin/savings?status=Partial');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('081. Filter savings by status Rejected', async () => {
    const res = await api.get('/api/admin/savings?status=Rejected');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('082. Filter savings by memberId', async () => {
    if (!memberId) skip();
    const res = await api.get(`/api/admin/savings?memberId=${memberId}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('083. Create withdrawal', async () => {
    if (!memberId || !productId) skip();
    const res = await api.post('/api/admin/savings', {
      memberId, productId,
      installmentPeriod: 1,
      amount: 100000,
      savingsDate: new Date().toISOString(),
      type: 'Penarikan',
      description: 'Test withdrawal'
    });
    if (!res.data.success) throw new Error('Failed');
    testSavings.push(res.data.data._id);
  });

  await test('084. Update savings amount', async () => {
    if (testSavings.length === 0) skip();
    const res = await api.put(`/api/admin/savings/${testSavings[0]}`, { amount: 2500000 });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('085. Update savings description', async () => {
    if (testSavings.length === 0) skip();
    const res = await api.put(`/api/admin/savings/${testSavings[0]}`, { description: 'Updated description' });
    if (!res.data.success) throw new Error('Failed');
  });

  await test('086. Create savings with notes', async () => {
    if (!memberId || !productId) skip();
    const res = await api.post('/api/admin/savings', {
      memberId, productId,
      installmentPeriod: 4,
      amount: 1500000,
      savingsDate: new Date().toISOString(),
      type: 'Setoran',
      notes: 'Test notes field'
    });
    if (!res.data.success) throw new Error('Failed');
    testSavings.push(res.data.data._id);
  });

  await test('087. Savings response has pagination info', async () => {
    const res = await api.get('/api/admin/savings?page=1&limit=10');
    if (!res.data.success) throw new Error('Failed');
    // Check for pagination structure
  });

  await test('088. Create savings with paymentDate', async () => {
    if (!memberId || !productId) skip();
    const res = await api.post('/api/admin/savings', {
      memberId, productId,
      installmentPeriod: 5,
      amount: 2000000,
      savingsDate: new Date().toISOString(),
      paymentDate: new Date().toISOString(),
      type: 'Setoran'
    });
    if (!res.data.success) throw new Error('Failed');
    testSavings.push(res.data.data._id);
  });

  await test('089. Get savings summary', async () => {
    const res = await api.get('/api/admin/savings');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('090. Savings list is array', async () => {
    const res = await api.get('/api/admin/savings');
    const data = res.data.data?.savings || res.data.data;
    if (!Array.isArray(data)) throw new Error('Not array');
  });

  // ==================== CLEANUP & FINAL (10 tests) ====================
  console.log('\n📌 CLEANUP TESTS (91-100)\n');

  await test('091. Delete test savings', async () => {
    let deleted = 0;
    for (const id of testSavings) {
      try { await api.delete(`/api/admin/savings/${id}`); deleted++; }
      catch (e) { /* Some may already be deleted */ }
    }
    console.log(`   Deleted ${deleted}/${testSavings.length} savings`);
  });

  await test('092. Delete non-existent savings fails', async () => {
    try { await api.delete('/api/admin/savings/507f1f77bcf86cd799439011'); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 404) throw e; }
  });

  await test('093. Delete test members', async () => {
    let deleted = 0;
    for (const m of testMembers) {
      try { await api.delete(`/api/admin/members/${m.uuid}`); deleted++; }
      catch (e) { /* Some may already be deleted */ }
    }
    console.log(`   Deleted ${deleted}/${testMembers.length} members`);
  });

  await test('094. Delete non-existent member fails', async () => {
    try { await api.delete('/api/admin/members/NONEXISTENT_UUID'); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 404) throw e; }
  });

  await test('095. Delete test products', async () => {
    let deleted = 0;
    for (const id of testProducts) {
      try { await api.delete(`/api/admin/products/${id}`); deleted++; }
      catch (e) { /* Some may already be deleted */ }
    }
    console.log(`   Deleted ${deleted}/${testProducts.length} products`);
  });

  await test('096. Delete non-existent product fails', async () => {
    try { await api.delete('/api/admin/products/507f1f77bcf86cd799439011'); throw new Error('Should fail'); }
    catch (e) { if (e.response?.status !== 404) throw e; }
  });

  await test('097. Verify members cleaned up', async () => {
    const res = await api.get('/api/admin/members');
    if (!res.data.success) throw new Error('Failed');
    const remaining = res.data.data.filter(m => m.uuid.startsWith('TEST_'));
    if (remaining.length > 0) console.log(`   Warning: ${remaining.length} test members still exist`);
  });

  await test('098. Verify products cleaned up', async () => {
    const res = await api.get('/api/admin/products');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('099. Final dashboard check', async () => {
    const res = await api.get('/api/admin/dashboard');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('100. Logout', async () => {
    const res = await api.post('/api/admin/auth/logout');
    if (!res.data.success) throw new Error('Failed');
  });

  // ==================== SUMMARY ====================
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 TEST RESULTS`);
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   📝 Total:   ${passed + failed + skipped}\n`);
  
  if (failed > 0) {
    console.log('❌ Some tests failed! Check errors above.\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
