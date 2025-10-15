const cfg = require('./src/config');
const axios = require('axios');

async function testAgents() {
  try {
    console.log('Testing Millis Agents API...\n');

    const response = await axios.get(cfg.millis.baseURL + '/agents', {
      headers: {
        'Authorization': cfg.millis.apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Response status:', response.status);
    console.log('\n📊 Agents data:');
    console.log(JSON.stringify(response.data, null, 2));

    if (Array.isArray(response.data)) {
      console.log('\n📝 Summary:');
      console.log('Total agents:', response.data.length);
      response.data.forEach((agent, index) => {
        console.log(`\nAgent ${index + 1}:`);
        console.log('  - ID:', agent.id);
        console.log('  - Name:', agent.name || agent.title || 'N/A');
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testAgents();
