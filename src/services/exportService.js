const { Parser } = require('json2csv');

/**
 * Export calls to CSV format
 * @param {Array} calls - Array of call objects
 * @returns {String} CSV string
 */
function exportCallsToCSV(calls) {
  const fields = [
    { label: 'Timestamp', value: 'created_at' },
    { label: 'Type', value: 'type' },
    { label: 'Phone From', value: 'phone_from' },
    { label: 'Phone To', value: 'phone_to' },
    { label: 'Duration (seconds)', value: 'duration_seconds' },
    { label: 'Status', value: 'status' },
    { label: 'Sentiment Score', value: 'sentiment_score' },
    { label: 'Disposition', value: 'disposition' },
    { label: 'Lead Extracted', value: 'lead_extracted' },
    { label: 'Recording URL', value: 'recording_url' }
  ];

  const parser = new Parser({ fields });
  return parser.parse(calls);
}

/**
 * Export leads to CSV format
 * @param {Array} leads - Array of lead objects (populated with call data)
 * @returns {String} CSV string
 */
function exportLeadsToCSV(leads) {
  // Flatten the lead data for CSV export
  const flattenedLeads = leads.map(lead => ({
    lead_id: lead._id?.toString() || lead.id,
    name: lead.contact?.name || '',
    phone: lead.contact?.phone || '',
    email: lead.contact?.email || '',
    company: lead.contact?.company || '',
    title: lead.contact?.title || '',
    intent: lead.intent || '',
    urgency: lead.urgency || '',
    status: lead.status || '',
    created_at: lead.created_at,
    follow_up_date: lead.follow_up_date || '',
    assigned_to: lead.assigned_to || '',
    conversion_value: lead.conversion_value || 0,
    notes: lead.notes || '',
    call_phone: lead.call_id?.phone_from || '',
    call_timestamp: lead.call_id?.created_at || '',
    keywords: Array.isArray(lead.keywords) ? lead.keywords.join(', ') : ''
  }));

  const fields = [
    { label: 'Lead ID', value: 'lead_id' },
    { label: 'Name', value: 'name' },
    { label: 'Phone', value: 'phone' },
    { label: 'Email', value: 'email' },
    { label: 'Company', value: 'company' },
    { label: 'Title', value: 'title' },
    { label: 'Intent', value: 'intent' },
    { label: 'Urgency', value: 'urgency' },
    { label: 'Status', value: 'status' },
    { label: 'Created At', value: 'created_at' },
    { label: 'Follow Up Date', value: 'follow_up_date' },
    { label: 'Assigned To', value: 'assigned_to' },
    { label: 'Conversion Value', value: 'conversion_value' },
    { label: 'Notes', value: 'notes' },
    { label: 'Call Phone', value: 'call_phone' },
    { label: 'Call Timestamp', value: 'call_timestamp' },
    { label: 'Keywords', value: 'keywords' }
  ];

  const parser = new Parser({ fields });
  return parser.parse(flattenedLeads);
}

/**
 * Export campaign report to CSV format
 * @param {Object} campaign - Campaign object
 * @param {Array} calls - Array of call objects for the campaign
 * @returns {String} CSV string
 */
function exportCampaignReportToCSV(campaign, calls) {
  // First, create a summary section
  const summary = [
    { field: 'Campaign Name', value: campaign.name },
    { field: 'Campaign ID', value: campaign._id?.toString() || campaign.id },
    { field: 'Status', value: campaign.status },
    { field: 'Total Numbers', value: campaign.stats?.total_numbers || 0 },
    { field: 'Calls Made', value: campaign.stats?.calls_made || 0 },
    { field: 'Calls Answered', value: campaign.stats?.calls_answered || 0 },
    { field: 'Calls Remaining', value: campaign.stats?.calls_remaining || 0 },
    { field: 'Total Duration (seconds)', value: campaign.stats?.total_duration_seconds || 0 },
    { field: 'Created At', value: campaign.created_at },
    { field: 'Launched At', value: campaign.launched_at || 'Not launched' },
    { field: 'Completed At', value: campaign.completed_at || 'Not completed' },
    { field: '', value: '' }, // Empty row
    { field: 'CALL DETAILS', value: '' } // Section header
  ];

  const summaryParser = new Parser({ fields: ['field', 'value'] });
  const summaryCSV = summaryParser.parse(summary);

  // Then add call details
  const callsCSV = exportCallsToCSV(calls);

  return summaryCSV + '\n\n' + callsCSV;
}

/**
 * Generate filename for export
 * @param {String} type - Type of export (calls, leads, campaign)
 * @param {String} format - Format (csv, pdf)
 * @param {String} identifier - Optional identifier (campaign_id, user_id)
 * @returns {String} Filename
 */
function generateExportFilename(type, format, identifier = '') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const id = identifier ? `_${identifier}` : '';
  return `${type}${id}_${timestamp}.${format}`;
}

module.exports = {
  exportCallsToCSV,
  exportLeadsToCSV,
  exportCampaignReportToCSV,
  generateExportFilename
};

