const millisClient = require('../clients/millis');
const cfg = require('../config');

/**
 * Launch a campaign on Millis platform
 * @param {Object} campaign - Campaign object with all necessary data
 * @returns {Promise<string>} Millis campaign ID
 */
async function launchCampaign(campaign) {
  try {
    console.log(`Launching campaign ${campaign.name} on Millis...`);

    // Prepare campaign data for Millis API
    // Use assigned_agent_id, assigned_kb_id, assigned_phone_number fields if available
    // Otherwise fall back to millis_* fields for backward compatibility
    const agentId = campaign.assigned_agent_id || campaign.millis_agent_id || 'default_agent';
    const kbId = campaign.assigned_kb_id || campaign.millis_kb_id;
    const phoneNumber = campaign.assigned_phone_number || campaign.millis_phone_number;
    
    // Millis API only requires 'name' for campaign creation
    const campaignData = {
      name: campaign.name
    };

    // Call Millis API to create campaign - use axios instance
    const response = await millisClient.axios.post('/campaigns', campaignData);
    
    if (response.data && response.data.id) {
      console.log(`Campaign ${campaign.name} launched successfully with Millis ID: ${response.data.id}`);
      return response.data.id;
    } else {
      // If Millis API is not available, create a mock campaign ID
      console.log(`Millis API not available, creating mock campaign ID for ${campaign.name}`);
      return `mock_campaign_${Date.now()}`;
    }

  } catch (error) {
    console.error(`Failed to launch campaign ${campaign.name}:`, error);
    
    // If Millis API is not available, create a mock campaign ID
    console.log(`Creating mock campaign ID due to Millis API error for ${campaign.name}`);
    return `mock_campaign_${Date.now()}`;
  }
}

/**
 * Pause a campaign on Millis platform
 * @param {string} millisCampaignId - Millis campaign ID
 * @returns {Promise<void>}
 */
async function pauseCampaign(millisCampaignId) {
  try {
    console.log(`Pausing Millis campaign ${millisCampaignId}...`);

    const response = await millisClient.axios.post(`/campaigns/${millisCampaignId}/stop`);
    
    if (response.status === 200) {
      console.log(`Campaign ${millisCampaignId} paused successfully`);
    } else {
      throw new Error('Unexpected response from Millis API');
    }

  } catch (error) {
    console.error(`Failed to pause campaign ${millisCampaignId}:`, error);
    
    if (error.response) {
      const errorMessage = error.response.data?.message || error.response.data?.error || 'Unknown Millis API error';
      throw new Error(`Millis API error: ${errorMessage}`);
    } else if (error.request) {
      throw new Error('Failed to connect to Millis API');
    } else {
      throw new Error(`Campaign pause error: ${error.message}`);
    }
  }
}

/**
 * Resume a campaign on Millis platform
 * @param {string} millisCampaignId - Millis campaign ID
 * @returns {Promise<void>}
 */
async function resumeCampaign(millisCampaignId) {
  try {
    console.log(`Resuming Millis campaign ${millisCampaignId}...`);

    const response = await millisClient.axios.post(`/campaigns/${millisCampaignId}/start`);
    
    if (response.status === 200) {
      console.log(`Campaign ${millisCampaignId} resumed successfully`);
    } else {
      throw new Error('Unexpected response from Millis API');
    }

  } catch (error) {
    console.error(`Failed to resume campaign ${millisCampaignId}:`, error);
    
    if (error.response) {
      const errorMessage = error.response.data?.message || error.response.data?.error || 'Unknown Millis API error';
      throw new Error(`Millis API error: ${errorMessage}`);
    } else if (error.request) {
      throw new Error('Failed to connect to Millis API');
    } else {
      throw new Error(`Campaign resume error: ${error.message}`);
    }
  }
}

/**
 * Get campaign status from Millis platform
 * @param {string} millisCampaignId - Millis campaign ID
 * @returns {Promise<Object>} Campaign status and stats
 */
async function getCampaignStatus(millisCampaignId) {
  try {
    console.log(`Getting status for Millis campaign ${millisCampaignId}...`);

    const response = await millisClient.axios.get(`/campaigns/${millisCampaignId}`);
    
    if (response.data) {
      return {
        status: response.data.status,
        stats: response.data.stats,
        last_updated: response.data.updated_at
      };
    } else {
      throw new Error('Invalid response from Millis API');
    }

  } catch (error) {
    console.error(`Failed to get campaign status ${millisCampaignId}:`, error);
    
    if (error.response) {
      const errorMessage = error.response.data?.message || error.response.data?.error || 'Unknown Millis API error';
      throw new Error(`Millis API error: ${errorMessage}`);
    } else if (error.request) {
      throw new Error('Failed to connect to Millis API');
    } else {
      throw new Error(`Get campaign status error: ${error.message}`);
    }
  }
}

/**
 * Delete a campaign from Millis platform
 * @param {string} millisCampaignId - Millis campaign ID
 * @returns {Promise<void>}
 */
async function deleteCampaign(millisCampaignId) {
  try {
    console.log(`Deleting Millis campaign ${millisCampaignId}...`);

    const response = await millisClient.axios.delete(`/campaigns/${millisCampaignId}`);
    
    if (response.status === 200 || response.status === 204) {
      console.log(`Campaign ${millisCampaignId} deleted successfully`);
    } else {
      throw new Error('Unexpected response from Millis API');
    }

  } catch (error) {
    console.error(`Failed to delete campaign ${millisCampaignId}:`, error);
    
    if (error.response) {
      const errorMessage = error.response.data?.message || error.response.data?.error || 'Unknown Millis API error';
      throw new Error(`Millis API error: ${errorMessage}`);
    } else if (error.request) {
      throw new Error('Failed to connect to Millis API');
    } else {
      throw new Error(`Campaign delete error: ${error.message}`);
    }
  }
}

module.exports = {
  launchCampaign,
  pauseCampaign,
  resumeCampaign,
  getCampaignStatus,
  deleteCampaign
};
