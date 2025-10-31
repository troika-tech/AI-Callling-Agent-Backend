const express = require('express');
const Call = require('../../models/Call');
const Lead = require('../../models/Lead');
const { requireAuth } = require('../../middleware/auth');
const asyncHandler = require('../../middleware/asyncHandler');

const router = express.Router();

// Apply authentication to all routes
router.use(requireAuth);

// GET /api/v1/inbound/analytics/overview
router.get('/overview', asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query;

  // Build date filter
  const dateFilter = {};
  if (date_from || date_to) {
    dateFilter.created_at = {};
    if (date_from) {
      dateFilter.created_at.$gte = new Date(date_from);
    }
    if (date_to) {
      dateFilter.created_at.$lte = new Date(date_to);
    }
  }

  // Base filter for user's inbound calls
  const baseFilter = {
    user_id: req.user.id,
    type: 'inbound',
    ...dateFilter
  };

  // Performance: Use MongoDB aggregation instead of fetching all data
  // This is much faster for large datasets
  const [callStats, leadStats, sentimentStats] = await Promise.all([
    // Get call statistics using aggregation
    Call.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalDuration: { $sum: { $ifNull: ['$duration_seconds', 0] } },
          avgDuration: { $avg: { $ifNull: ['$duration_seconds', 0] } }
        }
      }
    ]),
    // Get lead count
    Lead.countDocuments({
      user_id: req.user.id,
      campaign_id: null,
      ...dateFilter
    }),
    // Get sentiment breakdown using aggregation
    Call.aggregate([
      { $match: { ...baseFilter, sentiment_score: { $exists: true } } },
      {
        $group: {
          _id: null,
          positive: {
            $sum: { $cond: [{ $gte: ['$sentiment_score', 0.6] }, 1, 0] }
          },
          neutral: {
            $sum: { $cond: [
              { $and: [
                { $gte: ['$sentiment_score', 0.4] },
                { $lt: ['$sentiment_score', 0.6] }
              ]}, 1, 0
            ]}
          },
          negative: {
            $sum: { $cond: [{ $lt: ['$sentiment_score', 0.4] }, 1, 0] }
          }
        }
      }
    ])
  ]);

  const stats = callStats[0] || { totalCalls: 0, totalDuration: 0, avgDuration: 0 };
  const totalCalls = stats.totalCalls;
  const totalDuration = stats.totalDuration;
  const avgDurationSeconds = stats.avgDuration || 0;

  const leadsGenerated = leadStats;
  const conversionRate = totalCalls > 0 ? (leadsGenerated / totalCalls) * 100 : 0;

  const sentiment = sentimentStats[0] || { positive: 0, neutral: 0, negative: 0 };
  const sentimentBreakdown = {
    positive: totalCalls > 0 ? (sentiment.positive / totalCalls) * 100 : 0,
    neutral: totalCalls > 0 ? (sentiment.neutral / totalCalls) * 100 : 0,
    negative: totalCalls > 0 ? (sentiment.negative / totalCalls) * 100 : 0
  };

  res.json({
    success: true,
    data: {
      total_calls: totalCalls,
      avg_duration_seconds: Math.round(avgDurationSeconds),
      leads_generated: leadsGenerated,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      sentiment_breakdown: sentimentBreakdown
    }
  });
}));

// GET /api/v1/inbound/analytics/trends
router.get('/trends', asyncHandler(async (req, res) => {
  const { period = 'day', date_from, date_to } = req.query;

  // Build date filter
  const dateFilter = {};
  if (date_from || date_to) {
    dateFilter.created_at = {};
    if (date_from) {
      dateFilter.created_at.$gte = new Date(date_from);
    }
    if (date_to) {
      dateFilter.created_at.$lte = new Date(date_to);
    }
  }

  // Base filter for user's inbound calls
  const baseFilter = {
    user_id: req.user.id,
    type: 'inbound',
    ...dateFilter
  };

  // Get calls grouped by period
  const calls = await Call.find(baseFilter).sort({ created_at: 1 });
  
  // Group calls by period
  const groupedData = {};
  
  calls.forEach(call => {
    let groupKey;
    const date = new Date(call.created_at);
    
    switch (period) {
      case 'day':
        groupKey = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        groupKey = date.toISOString().split('T')[0];
    }
    
    if (!groupedData[groupKey]) {
      groupedData[groupKey] = {
        calls: 0,
        totalDuration: 0,
        leads: 0
      };
    }
    
    groupedData[groupKey].calls++;
    groupedData[groupKey].totalDuration += call.duration_seconds || 0;
  });

  // Get leads grouped by same period
  const leads = await Lead.find({
    user_id: req.user.id,
    campaign_id: null,
    ...dateFilter
  }).sort({ created_at: 1 });

  leads.forEach(lead => {
    let groupKey;
    const date = new Date(lead.created_at);
    
    switch (period) {
      case 'day':
        groupKey = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        groupKey = date.toISOString().split('T')[0];
    }
    
    if (groupedData[groupKey]) {
      groupedData[groupKey].leads++;
    }
  });

  // Convert to array format
  const trends = Object.entries(groupedData).map(([date, data]) => ({
    date,
    calls: data.calls,
    leads: data.leads,
    avg_duration: data.calls > 0 ? Math.round(data.totalDuration / data.calls) : 0
  }));

  res.json({
    success: true,
    data: trends
  });
}));

// GET /api/v1/inbound/analytics/phone-numbers
router.get('/phone-numbers', asyncHandler(async (req, res) => {
  // Get user's phone numbers
  const user = await User.findById(req.user.id).select('phone_numbers');
  
  if (!user || !user.phone_numbers || user.phone_numbers.length === 0) {
    return res.json({
      success: true,
      data: []
    });
  }

  // Get call statistics for each phone number
  const phoneStats = await Promise.all(
    user.phone_numbers.map(async (phoneNumber) => {
      const calls = await Call.find({
        user_id: req.user.id,
        type: 'inbound',
        phone_to: phoneNumber
      });

      const totalCalls = calls.length;
      const totalDuration = calls.reduce((sum, call) => sum + (call.duration_seconds || 0), 0);
      const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

      // Count leads generated from calls to this number
      const callIds = calls.map(call => call._id);
      const leadsGenerated = await Lead.countDocuments({
        call_id: { $in: callIds }
      });

      const conversionRate = totalCalls > 0 ? (leadsGenerated / totalCalls) * 100 : 0;

      return {
        phone_number: phoneNumber,
        total_calls: totalCalls,
        avg_duration: Math.round(avgDuration),
        leads_generated: leadsGenerated,
        conversion_rate: Math.round(conversionRate * 100) / 100
      };
    })
  );

  // Sort by total calls descending
  phoneStats.sort((a, b) => b.total_calls - a.total_calls);

  res.json({
    success: true,
    data: phoneStats
  });
}));

module.exports = router;
