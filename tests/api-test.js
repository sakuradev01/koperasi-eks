/**
 * MERN Koperasi API - Full Automated Test Suite
 * Run: node tests/api-test.js
 * 
 * Tests 25+ API endpoints including:
 * - Auth (login, logout, get user)
 * - Members (CRUD, mark complete)
 * - Products (CRUD)
 * - Savings (CRUD, approve, reject, partial)
 * - Dashboard stats
 * - Reports
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

let token = '';
let testMemberUuid = '';
let testMemberId = '';
let testProductId = '';
let testSavingsId = '';
let testSavingsId2 = '';

const api = axios.create({ baseURL: BASE_URL });

// Add auth header
api.interceptors.request.use(config => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${err.response?.data?.message || err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🚀 MERN Koperasi API Test Suite\n');
  console.log('='.repeat(50));

  // ========== AUTH TESTS ==========
  console.log('\n📌 AUTH TESTS\n');

  await test('01. Login with valid credentials', async () => {
    const res = await api.post('/api/admin/auth/login', {
      username: ADMIN_USER,
      password: ADMIN_PASS
    });
    if (!res.data.success) throw new Error('Login failed');
    if (!res.data.data.token) throw new Error('No token returned');
    token = res.data.data.token;
  });

  await test('02. Login with invalid credentials (should fail)', async () => {
    try {
      await api.post('/api/admin/auth/login', {
        username: 'wrong',
        password: 'wrong'
      });
      throw new Error('Should have failed');
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 400) return;
      throw err;
    }
  });

  await test('03. Get current user', async () => {
    const res = await api.get('/api/admin/auth/me');
    if (!res.data.success) throw new Error('Failed');
    if (!res.data.data.name) throw new Error('No user name');
  });

  // ========== DASHBOARD TESTS ==========
  console.log('\n📌 DASHBOARD TESTS\n');

  await test('04. Get dashboard stats', async () => {
    const res = await api.get('/api/admin/dashboard');
    if (!res.data.success) throw new Error('Failed');
    if (typeof res.data.data.totalMembers !== 'number') throw new Error('Invalid data');
  });

  // ========== PRODUCTS TESTS ==========
  console.log('\n📌 PRODUCTS TESTS\n');

  await test('05. Get all products', async () => {
    const res = await api.get('/api/admin/products');
    if (!res.data.success) throw new Error('Failed');
    if (res.data.data.length > 0) {
      testProductId = res.data.data[0]._id;
    }
  });

  await test('06. Get product by ID', async () => {
    if (!testProductId) {
      console.log('   Skipped - no product available');
      return;
    }
    const res = await api.get(`/api/admin/products/${testProductId}`);
    if (!res.data.success) throw new Error('Failed');
  });

  // ========== MEMBERS TESTS ==========
  console.log('\n📌 MEMBERS TESTS\n');

  await test('07. Get all members', async () => {
    const res = await api.get('/api/admin/members');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('08. Create new member', async () => {
    const timestamp = Date.now();
    const res = await api.post('/api/admin/members', {
      uuid: `TEST_${timestamp}`,
      name: `Test Member ${timestamp}`,
      gender: 'L',
      phone: '081234567890',
      city: 'Jakarta',
      completeAddress: 'Jl. Test No. 123',
      accountNumber: '1234567890',
      productId: testProductId || null
    });
    if (!res.data.success) throw new Error('Failed');
    testMemberUuid = res.data.data.uuid;
    testMemberId = res.data.data._id;
  });

  await test('09. Get member by UUID', async () => {
    const res = await api.get(`/api/admin/members/${testMemberUuid}`);
    if (!res.data.success) throw new Error('Failed');
    if (res.data.data.uuid !== testMemberUuid) throw new Error('UUID mismatch');
  });

  await test('10. Update member', async () => {
    const res = await api.put(`/api/admin/members/${testMemberUuid}`, {
      name: 'Updated Test Member',
      phone: '089876543210'
    });
    if (!res.data.success) throw new Error('Failed');
    if (res.data.data.name !== 'Updated Test Member') throw new Error('Name not updated');
  });

  await test('11. Mark member as completed', async () => {
    const res = await api.patch(`/api/admin/members/${testMemberUuid}/complete`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('12. Unmark member as completed', async () => {
    const res = await api.patch(`/api/admin/members/${testMemberUuid}/uncomplete`);
    if (!res.data.success) throw new Error('Failed');
  });

  // ========== SAVINGS TESTS ==========
  console.log('\n📌 SAVINGS TESTS\n');

  await test('13. Get all savings', async () => {
    const res = await api.get('/api/admin/savings');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('14. Get savings with pagination', async () => {
    const res = await api.get('/api/admin/savings?page=1&limit=10');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('15. Create savings (full payment)', async () => {
    if (!testMemberId || !testProductId) {
      console.log('   Skipped - no member/product');
      return;
    }
    const res = await api.post('/api/admin/savings', {
      memberId: testMemberId,
      productId: testProductId,
      installmentPeriod: 1,
      amount: 2000000,
      savingsDate: new Date().toISOString(),
      type: 'Setoran',
      description: 'Test full payment periode 1',
      paymentType: 'Full'
    });
    if (!res.data.success) throw new Error('Failed');
    testSavingsId = res.data.data._id;
  });

  await test('16. Create savings (partial payment)', async () => {
    if (!testMemberId || !testProductId) {
      console.log('   Skipped - no member/product');
      return;
    }
    const res = await api.post('/api/admin/savings', {
      memberId: testMemberId,
      productId: testProductId,
      installmentPeriod: 2,
      amount: 1000000,
      savingsDate: new Date().toISOString(),
      type: 'Setoran',
      description: 'Test partial payment periode 2',
      paymentType: 'Partial',
      partialSequence: 1
    });
    if (!res.data.success) throw new Error('Failed');
    testSavingsId2 = res.data.data._id;
  });

  await test('17. Get savings by ID', async () => {
    if (!testSavingsId) {
      console.log('   Skipped - no savings');
      return;
    }
    const res = await api.get(`/api/admin/savings/${testSavingsId}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('18. Approve savings', async () => {
    if (!testSavingsId) {
      console.log('   Skipped - no savings');
      return;
    }
    const res = await api.patch(`/api/admin/savings/${testSavingsId}/approve`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('19. Mark savings as partial', async () => {
    if (!testSavingsId2) {
      console.log('   Skipped - no savings');
      return;
    }
    const res = await api.patch(`/api/admin/savings/${testSavingsId2}/partial`);
    if (!res.data.success) throw new Error('Failed');
  });

  // ========== VALIDATION TESTS ==========
  console.log('\n📌 VALIDATION TESTS\n');

  await test('20. Create member without name (should fail)', async () => {
    try {
      await api.post('/api/admin/members', {
        gender: 'L'
      });
      throw new Error('Should have failed');
    } catch (err) {
      if (err.response?.status === 400) return;
      throw err;
    }
  });

  await test('21. Create savings with invalid amount (should fail)', async () => {
    try {
      await api.post('/api/admin/savings', {
        memberId: testMemberId,
        productId: testProductId,
        installmentPeriod: 1,
        amount: -100,
        savingsDate: new Date().toISOString()
      });
      throw new Error('Should have failed');
    } catch (err) {
      if (err.response?.status === 400) return;
      throw err;
    }
  });

  await test('22. Get savings with invalid limit (should fail)', async () => {
    try {
      await api.get('/api/admin/savings?limit=1000');
      throw new Error('Should have failed');
    } catch (err) {
      if (err.response?.status === 400) return;
      throw err;
    }
  });

  await test('23. Access without token (should fail)', async () => {
    try {
      const tempToken = token;
      token = '';
      await api.get('/api/admin/members');
      token = tempToken;
      throw new Error('Should have failed');
    } catch (err) {
      token = token || err.config?.headers?.Authorization?.replace('Bearer ', '');
      if (err.response?.status === 401) return;
      throw err;
    }
  });

  // ========== FILTER TESTS ==========
  console.log('\n📌 FILTER TESTS\n');

  await test('24. Filter savings by status', async () => {
    const res = await api.get('/api/admin/savings?status=Approved');
    if (!res.data.success) throw new Error('Failed');
  });

  await test('25. Filter savings by member', async () => {
    if (!testMemberId) {
      console.log('   Skipped - no member');
      return;
    }
    const res = await api.get(`/api/admin/savings?memberId=${testMemberId}`);
    if (!res.data.success) throw new Error('Failed');
  });

  // ========== CLEANUP ==========
  console.log('\n📌 CLEANUP\n');

  await test('26. Delete test savings 1', async () => {
    if (!testSavingsId) {
      console.log('   Skipped - no savings');
      return;
    }
    const res = await api.delete(`/api/admin/savings/${testSavingsId}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('27. Delete test savings 2', async () => {
    if (!testSavingsId2) {
      console.log('   Skipped - no savings');
      return;
    }
    const res = await api.delete(`/api/admin/savings/${testSavingsId2}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('28. Delete test member', async () => {
    if (!testMemberUuid) {
      console.log('   Skipped - no member');
      return;
    }
    const res = await api.delete(`/api/admin/members/${testMemberUuid}`);
    if (!res.data.success) throw new Error('Failed');
  });

  await test('29. Logout', async () => {
    const res = await api.post('/api/admin/auth/logout');
    if (!res.data.success) throw new Error('Failed');
  });

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 TEST RESULTS: ${passed} passed, ${failed} failed\n`);
  
  if (failed > 0) {
    console.log('❌ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
