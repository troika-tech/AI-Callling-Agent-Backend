const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testBackendConnection() {
  try {
    console.log('🧪 Testing backend connection...');
    
    // Test health endpoint first
    console.log('\n1. Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:5000/api/v1/health');
    console.log('Health status:', healthResponse.status);
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('Health data:', healthData);
    }

    // Test if we can get users (this requires admin auth)
    console.log('\n2. Testing users endpoint (should fail without auth)...');
    const usersResponse = await fetch('http://localhost:5000/api/v1/admin/users');
    console.log('Users status:', usersResponse.status);
    if (!usersResponse.ok) {
      const usersData = await usersResponse.json();
      console.log('Users error (expected):', usersData);
    }

    // Test login with a simple user first
    console.log('\n3. Testing login with admin credentials...');
    const loginResponse = await fetch('http://localhost:5000/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'pratik.yesare68@gmail.com',
        password: 'Pratik@2001'
      })
    });

    console.log('Login status:', loginResponse.status);
    const loginData = await loginResponse.json();
    console.log('Login response:', JSON.stringify(loginData, null, 2));

    if (loginResponse.ok) {
      console.log('✅ Login successful!');
    } else {
      console.log('❌ Login failed');
    }

  } catch (error) {
    console.error('❌ Error testing backend:', error.message);
  }
}

testBackendConnection();
