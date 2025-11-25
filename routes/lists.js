const express = require('express');
const router = express.Router();
const multer = require('multer');
const listController = require('../controllers/listController');
const { auth } = require('../middleware/auth');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

router.get('/', auth, listController.getLists);
router.get('/:id', auth, listController.getListDetails);
router.post('/', auth, upload.single('file'), listController.uploadList);
router.delete('/:id', auth, listController.deleteList);

module.exports = router;

