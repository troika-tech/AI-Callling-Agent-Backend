const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testPhonesEndpoint() {
  try {
    console.log('🧪 Testing Phones Endpoint...\n');

    // Step 1: Login
    console.log('1. Logging in...');
    const loginResponse = await fetch('http://localhost:5000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pratik.yesare68@gmail.com',
        password: 'Pratik@2001'
      }),
      credentials: 'include'
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    console.log('✅ Login successful');
    console.log('   User:', loginData.user.name, `(${loginData.user.role})`);

    // Extract cookies
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('   Cookies received:', cookies ? 'Yes' : 'No');

    // Step 2: Get phones
    console.log('\n2. Fetching phones...');
    const phonesResponse = await fetch('http://localhost:5000/api/v1/admin/phones?page=1&pageSize=50', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || ''
      },
      credentials: 'include'
    });

    if (!phonesResponse.ok) {
      const errorData = await phonesResponse.json();
      throw new Error(`Phones request failed: ${phonesResponse.status} - ${JSON.stringify(errorData)}`);
    }

    const phonesData = await phonesResponse.json();
    console.log('✅ Phones fetched successfully\n');
    console.log('📊 Response:');
    console.log(JSON.stringify(phonesData, null, 2));

    console.log('\n📱 Phone Details:');
    if (phonesData.items && phonesData.items.length > 0) {
      phonesData.items.forEach((phone, index) => {
        console.log(`\n   Phone ${index + 1}:`);
        console.log(`   - Number: ${phone.id || phone.number || 'N/A'}`);
        console.log(`   - Agent ID: ${phone.agent_id || phone.agentId || 'Not assigned'}`);
        console.log(`   - Status: ${phone.status || 'N/A'}`);
        console.log(`   - Created: ${phone.create_at ? new Date(phone.create_at * 1000).toISOString() : 'N/A'}`);
      });
    } else {
      console.log('   ⚠️  No phones found');
    }

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

testPhonesEndpoint();
