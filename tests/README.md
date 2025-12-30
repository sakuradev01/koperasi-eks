# MERN Koperasi API Test Suite

## Quick Start

```bash
# Install dependencies (from mern-koperasi folder)
npm install

# Make sure server is running
npm run dev:server

# Run tests (in another terminal)
npm run test:api
```

## Test Cases (29 Tests)

### Auth Tests
1. Login with valid credentials
2. Login with invalid credentials (should fail)
3. Get current user

### Dashboard Tests
4. Get dashboard stats

### Products Tests
5. Get all products
6. Get product by ID

### Members Tests
7. Get all members
8. Create new member
9. Get member by UUID
10. Update member
11. Mark member as completed
12. Unmark member as completed

### Savings Tests
13. Get all savings
14. Get savings with pagination
15. Create savings (full payment)
16. Create savings (partial payment)
17. Get savings by ID
18. Approve savings
19. Mark savings as partial

### Validation Tests
20. Create member without name (should fail)
21. Create savings with invalid amount (should fail)
22. Get savings with invalid limit (should fail)
23. Access without token (should fail)

### Filter Tests
24. Filter savings by status
25. Filter savings by member

### Cleanup
26. Delete test savings 1
27. Delete test savings 2
28. Delete test member
29. Logout

## Environment Variables

```bash
API_URL=http://localhost:5000  # Default
```

## Expected Output

```
🚀 MERN Koperasi API Test Suite

==================================================

📌 AUTH TESTS

✅ 01. Login with valid credentials
✅ 02. Login with invalid credentials (should fail)
✅ 03. Get current user

...

==================================================

📊 TEST RESULTS: 29 passed, 0 failed

✅ All tests passed!
```
