const nodemailer = require('nodemailer');
const pool = require('../config/database');
require('dotenv').config();

// Create SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // use STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Replace variables in template
function replaceVariables(content, variables) {
  let result = content;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, variables[key] || '');
  });
  return result;
}

// Send single email
async function sendEmail(emailSendId, toEmail, subject, htmlContent, textContent) {
  try {
    const mailOptions = {
      from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, '')
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // Update send record
    await pool.query(
      `UPDATE email_sends 
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [emailSendId]
    );
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Send email error:', error);
    
    // Update send record with error
    await pool.query(
      `UPDATE email_sends 
       SET status = 'failed', error_message = $1, attempts = attempts + 1 
       WHERE id = $2`,
      [error.message, emailSendId]
    );
    
    return { success: false, error: error.message };
  }
}

// Process pending emails for active campaigns
async function processPendingEmails() {
  try {
    // Check daily quota
    const quotaResult = await pool.query(
      `SELECT COALESCE(emails_sent, 0) as emails_sent, quota_limit
       FROM daily_quota 
       WHERE date = CURRENT_DATE`,
      []
    );
    
    let emailsSentToday = 0;
    let quotaLimit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 4000;
    
    if (quotaResult.rows.length > 0) {
      emailsSentToday = quotaResult.rows[0].emails_sent;
      quotaLimit = quotaResult.rows[0].quota_limit;
    } else {
      // Create today's quota entry
      await pool.query(
        `INSERT INTO daily_quota (date, emails_sent, quota_limit) 
         VALUES (CURRENT_DATE, 0, $1)`,
        [quotaLimit]
      );
    }
    
    // Calculate how many emails can be sent
    const remainingQuota = quotaLimit - emailsSentToday;
    
    if (remainingQuota <= 0) {
      console.log('Daily quota reached');
      return { sent: 0, failed: 0, quota_reached: true };
    }
    
    // Get batch of pending emails (limit to batch size or remaining quota)
    const batchSize = Math.min(
      parseInt(process.env.BATCH_SIZE) || 50,
      remainingQuota
    );
    
    const emailsToSend = await pool.query(
      `SELECT es.id, es.email, es.campaign_id, c.template_id
       FROM email_sends es
       JOIN campaigns c ON es.campaign_id = c.id
       WHERE es.status = 'pending' AND c.status = 'active'
       ORDER BY es.created_at ASC
       LIMIT $1`,
      [batchSize]
    );
    
    let sent = 0;
    let failed = 0;
    
    // Process each email
    for (const email of emailsToSend.rows) {
      // Get template
      const templateResult = await pool.query(
        'SELECT * FROM templates WHERE id = $1',
        [email.template_id]
      );
      
      if (templateResult.rows.length === 0) {
        continue;
      }
      
      const template = templateResult.rows[0];
      
      // Send email
      const result = await sendEmail(
        email.id,
        email.email,
        template.subject,
        template.html_content,
        template.text_content
      );
      
      if (result.success) {
        sent++;
        
        // Update campaign sent count
        await pool.query(
          'UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $1',
          [email.campaign_id]
        );
        
        // Update daily quota
        await pool.query(
          `UPDATE daily_quota 
           SET emails_sent = emails_sent + 1 
           WHERE date = CURRENT_DATE`
        );
      } else {
        failed++;
        
        // Update campaign failed count
        await pool.query(
          'UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1',
          [email.campaign_id]
        );
      }
      
      // Small delay between emails to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Check if any campaigns are complete
    await pool.query(
      `UPDATE campaigns 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE status = 'active' 
       AND sent_count + failed_count >= total_recipients`
    );
    
    return { sent, failed, quota_reached: false };
  } catch (error) {
    console.error('Process pending emails error:', error);
    return { sent: 0, failed: 0, error: error.message };
  }
}

module.exports = {
  sendEmail,
  processPendingEmails,
  replaceVariables
};

