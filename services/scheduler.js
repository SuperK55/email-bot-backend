const cron = require('node-cron');
const { processPendingEmails } = require('./emailSender');

let isProcessing = false;

async function processAllPendingEmails() {
  if (isProcessing) {
    console.log('Already processing emails, skipping...');
    return;
  }
  
  isProcessing = true;
  let totalSent = 0;
  let totalFailed = 0;
  
  try {
    while (true) {
      const result = await processPendingEmails();
      
      totalSent += result.sent;
      totalFailed += result.failed;
      
      if (result.quota_reached) {
        console.log('Daily quota reached. Will resume tomorrow.');
        break;
      }
      
      if (result.sent === 0 && result.failed === 0) {
        break;
      }
      
      console.log(`Batch complete - Sent: ${result.sent}, Failed: ${result.failed}`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (totalSent > 0 || totalFailed > 0) {
      console.log(`Processing complete - Total Sent: ${totalSent}, Total Failed: ${totalFailed}`);
    }
  } finally {
    isProcessing = false;
  }
}

function startScheduler() {
  cron.schedule('*/2 * * * *', async () => {
    console.log('Running scheduled email processor...');
    await processAllPendingEmails();
  });
  
  console.log('✅ Email scheduler started (runs every 2 minutes)');
}

module.exports = { startScheduler, processAllPendingEmails };

