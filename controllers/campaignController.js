const pool = require('../config/database');
const { processAllPendingEmails } = require('../services/scheduler');

exports.createCampaign = async (req, res) => {
  try {
    const { name, template_id, list_id, daily_limit } = req.body;
    
    // Get list count
    const listResult = await pool.query(
      'SELECT valid_count FROM email_lists WHERE id = $1',
      [list_id]
    );
    
    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    const totalRecipients = listResult.rows[0].valid_count;
    
    const result = await pool.query(
      `INSERT INTO campaigns (name, template_id, list_id, total_recipients, daily_limit, created_by, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'draft') 
       RETURNING *`,
      [name, template_id, list_id, totalRecipients, daily_limit || 4000, req.user.id]
    );
    
    res.status(201).json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, t.name as template_name, l.name as list_name, u.full_name as created_by_name
       FROM campaigns c
       LEFT JOIN templates t ON c.template_id = t.id
       LEFT JOIN email_lists l ON c.list_id = l.id
       LEFT JOIN users u ON c.created_by = u.id
       ORDER BY c.created_at DESC`
    );
    
    res.json({ campaigns: result.rows });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
};

exports.getCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT c.*, t.name as template_name, l.name as list_name
       FROM campaigns c
       LEFT JOIN templates t ON c.template_id = t.id
       LEFT JOIN email_lists l ON c.list_id = l.id
       WHERE c.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Get send stats
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'sent') as sent,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'pending') as pending
       FROM email_sends
       WHERE campaign_id = $1`,
      [id]
    );
    
    res.json({ 
      campaign: result.rows[0],
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
};

exports.startCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get campaign details
    const campaignResult = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1',
      [id]
    );
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const campaign = campaignResult.rows[0];
    
    // Check if already started
    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Campaign already started or completed' });
    }
    
    // Get all valid contacts from the list
    const contactsResult = await pool.query(
      `SELECT id, email FROM list_contacts 
       WHERE list_id = $1 AND is_valid = true AND is_unsubscribed = false`,
      [campaign.list_id]
    );
    
    // Create email send entries using parameterized queries
    if (contactsResult.rows.length > 0) {
      const values = [];
      const params = [];
      let paramIndex = 1;
      
      for (const contact of contactsResult.rows) {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, 'pending')`);
        params.push(id, contact.id, contact.email);
        paramIndex += 3;
      }
      
      const insertResult = await pool.query(
        `INSERT INTO email_sends (campaign_id, contact_id, email, status) 
         VALUES ${values.join(', ')}`,
        params
      );
      console.log(`Created ${contactsResult.rows.length} email_sends entries for campaign ${id}`);
    } else {
      console.log(`No valid contacts found for campaign ${id}`);
    }
    
    // Update campaign status
    await pool.query(
      `UPDATE campaigns 
       SET status = 'active', started_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [id]
    );
    
    console.log('Triggering email processing after campaign start...');
    processAllPendingEmails().catch(err => {
      console.error('Error processing emails after campaign start:', err);
    });
    
    res.json({ message: 'Campaign started successfully' });
  } catch (error) {
    console.error('Start campaign error:', error);
    res.status(500).json({ error: 'Failed to start campaign' });
  }
};

exports.pauseCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      `UPDATE campaigns SET status = 'paused' WHERE id = $1`,
      [id]
    );
    
    res.json({ message: 'Campaign paused successfully' });
  } catch (error) {
    console.error('Pause campaign error:', error);
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
};

exports.resumeCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      `UPDATE campaigns SET status = 'active' WHERE id = $1`,
      [id]
    );
    
    console.log('Triggering email processing after campaign resume...');
    processAllPendingEmails().catch(err => {
      console.error('Error processing emails after campaign resume:', err);
    });
    
    res.json({ message: 'Campaign resumed successfully' });
  } catch (error) {
    console.error('Resume campaign error:', error);
    res.status(500).json({ error: 'Failed to resume campaign' });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
    
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
};

