const User = require('../../models/User');
const Campaign = require('../../models/Campaign');
const Call = require('../../models/Call');

/**
 * Get overview statistics for admin dashboard
 * GET /api/v1/admin/stats/overview
 */
async function getOverviewStats(req, res, next) {
  try {
    // Get user statistics
    const [totalUsers, inboundUsers, outboundUsers, adminUsers, activeUsers, suspendedUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'inbound' }),
      User.countDocuments({ role: 'outbound' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'suspended' })
    ]);

    // Get call statistics
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      callsToday,
      callsThisWeek,
      callsThisMonth,
      inboundCalls,
      outboundCalls
    ] = await Promise.all([
      Call.countDocuments({ createdAt: { $gte: todayStart } }),
      Call.countDocuments({ createdAt: { $gte: weekStart } }),
      Call.countDocuments({ createdAt: { $gte: monthStart } }),
      Call.countDocuments({ type: 'inbound' }),
      Call.countDocuments({ type: 'outbound' })
    ]);

    // Get campaign statistics
    const [
      activeCampaigns,
      pendingApprovalCampaigns,
      totalCampaigns
    ] = await Promise.all([
      Campaign.countDocuments({ status: 'active' }),
      Campaign.countDocuments({ status: 'pending_approval' }),
      Campaign.countDocuments()
    ]);

    // Calculate revenue (this is simplified - you may want to add actual billing records)
    const thisMonthCalls = await Call.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: null, totalCost: { $sum: '$cost' } } }
    ]);

    const thisYearStart = new Date(now.getFullYear(), 0, 1);
    const thisYearCalls = await Call.aggregate([
      { $match: { createdAt: { $gte: thisYearStart } } },
      { $group: { _id: null, totalCost: { $sum: '$cost' } } }
    ]);

    const stats = {
      users: {
        total: totalUsers,
        inbound: inboundUsers,
        outbound: outboundUsers,
        admin: adminUsers,
        active: activeUsers,
        suspended: suspendedUsers
      },
      calls: {
        today: callsToday,
        this_week: callsThisWeek,
        this_month: callsThisMonth,
        inbound: inboundCalls,
        outbound: outboundCalls
      },
      campaigns: {
        active: activeCampaigns,
        pending_approval: pendingApprovalCampaigns,
        total: totalCampaigns
      },
      revenue: {
        this_month: thisMonthCalls[0]?.totalCost || 0,
        this_year: thisYearCalls[0]?.totalCost || 0
      }
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
}

/**
 * Get call statistics with time series data
 * GET /api/v1/admin/stats/calls
 */
async function getCallStats(req, res, next) {
  try {
    const { period = 'week', date_from, date_to } = req.query;

    // Determine date range
    let startDate;
    const endDate = date_to ? new Date(date_to) : new Date();

    if (date_from) {
      startDate = new Date(date_from);
    } else {
      const now = new Date();
      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
    }

    // Aggregate calls by date
    const callsByDate = await Call.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type',
            status: '$status'
          },
          count: { $sum: 1 },
          totalDuration: { $sum: '$duration_seconds' },
          totalCost: { $sum: '$cost' }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    // Get overall stats for the period
    const overallStats = await Call.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalDuration: { $sum: '$duration_seconds' },
          totalCost: { $sum: '$cost' },
          avgDuration: { $avg: '$duration_seconds' }
        }
      }
    ]);

    res.json({
      period: {
        start: startDate,
        end: endDate
      },
      overall: overallStats[0] || {
        totalCalls: 0,
        totalDuration: 0,
        totalCost: 0,
        avgDuration: 0
      },
      by_date: callsByDate
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get system health status
 * GET /api/v1/admin/stats/system-health
 */
async function getSystemHealth(req, res, next) {
  try {
    const mongoose = require('mongoose');

    // Database status
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Get error rate (calls with status 'failed' in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [totalRecentCalls, failedRecentCalls] = await Promise.all([
      Call.countDocuments({ createdAt: { $gte: oneHourAgo } }),
      Call.countDocuments({ createdAt: { $gte: oneHourAgo }, status: 'failed' })
    ]);

    const errorRate = totalRecentCalls > 0
      ? ((failedRecentCalls / totalRecentCalls) * 100).toFixed(2)
      : 0;

    // Total calls processed (all time)
    const totalCallsProcessed = await Call.countDocuments();

    // Get latest calls
    const latestCalls = await Call.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('type status createdAt duration_seconds')
      .lean();

    res.json({
      api_uptime: process.uptime(), // Uptime in seconds
      database_status: dbStatus,
      total_calls_processed: totalCallsProcessed,
      error_rate: parseFloat(errorRate),
      recent_activity: {
        last_hour_calls: totalRecentCalls,
        last_hour_failures: failedRecentCalls
      },
      latest_calls: latestCalls,
      memory_usage: process.memoryUsage(),
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverviewStats,
  getCallStats,
  getSystemHealth
};
