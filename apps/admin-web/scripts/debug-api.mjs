// Test what the backend actually returns for the sandbox supervisor
const API = 'http://localhost:4000';

// Step 1: request OTP
console.log('--- POST /auth/otp/request ---');
const r1 = await fetch(`${API}/auth/otp/request`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '+919999999999' }),
});
console.log('Status:', r1.status);
const b1 = await r1.json();
console.log('Body:', JSON.stringify(b1));

// Step 2: verify with bypass code
console.log('\n--- POST /auth/otp/verify ---');
const r2 = await fetch(`${API}/auth/otp/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '+919999999999', code: '123456' }),
});
console.log('Status:', r2.status);
const b2 = await r2.json();
console.log('Body:', JSON.stringify(b2, null, 2));
