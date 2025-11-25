const cron = require('node-cron');
const { processPendingEmails } = require('./emailSender');

// Schedule email processing every 10 minutes
function startScheduler() {
  // Run every 10 minutes to send emails gradually throughout the day
  // 4000 emails/day = ~167/hour = ~28 every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    console.log('Running scheduled email processor...');
    
    const result = await processPendingEmails();
    
    console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
    
    if (result.quota_reached) {
      console.log('Daily quota reached. Will resume tomorrow.');
    }
  });
  
  console.log('✅ Email scheduler started (runs every 10 minutes)');
}

module.exports = { startScheduler };

