const pool = require('../config/database');

exports.getStats = async (req, res) => {
  try {
    // Total campaigns
    const campaignsResult = await pool.query(
      'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM campaigns'
    );
    
    // Total lists
    const listsResult = await pool.query(
      'SELECT COUNT(*) as total, SUM(valid_count) as total_contacts FROM email_lists'
    );
    
    // Total templates
    const templatesResult = await pool.query(
      'SELECT COUNT(*) as total FROM templates'
    );
    
    // Today's quota
    const quotaResult = await pool.query(
      `SELECT emails_sent, quota_limit 
       FROM daily_quota 
       WHERE date = CURRENT_DATE`
    );
    
    const todayQuota = quotaResult.rows.length > 0 
      ? quotaResult.rows[0] 
      : { emails_sent: 0, quota_limit: parseInt(process.env.DAILY_EMAIL_LIMIT) || 4000 };
    
    // Recent sends (last 7 days)
    const recentSendsResult = await pool.query(
      `SELECT date, emails_sent 
       FROM daily_quota 
       WHERE date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY date DESC`
    );
    
    // Recent campaigns
    const recentCampaignsResult = await pool.query(
      `SELECT c.*, t.name as template_name, l.name as list_name
       FROM campaigns c
       LEFT JOIN templates t ON c.template_id = t.id
       LEFT JOIN email_lists l ON c.list_id = l.id
       ORDER BY c.created_at DESC
       LIMIT 5`
    );
    
    res.json({
      campaigns: campaignsResult.rows[0],
      lists: listsResult.rows[0],
      templates: templatesResult.rows[0],
      todayQuota,
      recentSends: recentSendsResult.rows,
      recentCampaigns: recentCampaignsResult.rows
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

