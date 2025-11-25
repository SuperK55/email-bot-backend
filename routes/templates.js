const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { auth } = require('../middleware/auth');

router.get('/', auth, templateController.getTemplates);
router.get('/:id', auth, templateController.getTemplate);
router.post('/', auth, templateController.createTemplate);
router.put('/:id', auth, templateController.updateTemplate);
router.delete('/:id', auth, templateController.deleteTemplate);

module.exports = router;

