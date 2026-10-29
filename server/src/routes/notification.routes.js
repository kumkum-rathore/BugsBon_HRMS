const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/notification.controller');

router.use(authenticate);
router.get('/', controller.list);
router.patch('/:id/read', controller.markRead);

module.exports = router;
