const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const { emitToOutboundUser } = require('./socketService');

let monitorTask = null;

/**
 * Check for completed campaigns and update their status
 */
async function checkCompletedCampaigns() {
  try {
    // Find active campaigns where all calls have been made
    const campaigns = await Campaign.find({
      status: 'active',
      'stats.calls_remaining': { $lte: 0 }
    });

    for (const campaign of campaigns) {
      console.log(`Campaign ${campaign._id} (${campaign.name}) completed`);

      // Update campaign status
      campaign.status = 'completed';
      campaign.completed_at = new Date();
      await campaign.save();

      // Emit event to user
      emitToOutboundUser(campaign.user_id.toString(), 'campaign:completed', {
        campaign_id: campaign._id,
        campaign_name: campaign.name,
        stats: campaign.stats,
        completed_at: campaign.completed_at
      });

      console.log(`Emitted campaign:completed event to user ${campaign.user_id}`);
    }

    if (campaigns.length > 0) {
      console.log(`Checked campaigns: ${campaigns.length} campaign(s) marked as completed`);
    }
  } catch (error) {
    console.error('Error checking completed campaigns:', error);
  }
}

/**
 * Start the campaign monitor cron job
 */
function startCampaignMonitor() {
  if (monitorTask) {
    console.log('Campaign monitor already running');
    return;
  }

  // Run every 5 minutes
  monitorTask = cron.schedule('*/5 * * * *', async () => {
    await checkCompletedCampaigns();
  });

  console.log('Campaign monitor started (runs every 5 minutes)');

  // Run once immediately
  checkCompletedCampaigns();
}

/**
 * Stop the campaign monitor
 */
function stopCampaignMonitor() {
  if (monitorTask) {
    monitorTask.stop();
    monitorTask = null;
    console.log('Campaign monitor stopped');
  }
}

module.exports = {
  startCampaignMonitor,
  stopCampaignMonitor,
  checkCompletedCampaigns
};

