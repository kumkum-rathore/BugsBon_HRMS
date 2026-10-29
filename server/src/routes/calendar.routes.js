const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/calendar.controller');

router.use(authenticate);
router.get('/', controller.list);
router.post('/meetings', controller.createMeeting);
router.delete('/meetings/:id', controller.cancelMeeting);
router.post('/holidays', controller.createHoliday);
router.delete('/holidays/:id', controller.deleteHoliday);
router.post('/shifts', controller.createShift);
router.patch('/shifts/assign', controller.assignShift);

module.exports = router;
