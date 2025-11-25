const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { auth } = require('../middleware/auth');

router.get('/', auth, campaignController.getCampaigns);
router.get('/:id', auth, campaignController.getCampaign);
router.post('/', auth, campaignController.createCampaign);
router.post('/:id/start', auth, campaignController.startCampaign);
router.post('/:id/pause', auth, campaignController.pauseCampaign);
router.post('/:id/resume', auth, campaignController.resumeCampaign);
router.delete('/:id', auth, campaignController.deleteCampaign);

module.exports = router;

