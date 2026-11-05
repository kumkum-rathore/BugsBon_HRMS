const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const forgotPasswordLimiter = require('../middleware/forgotPasswordLimiter');

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);
router.post('/forgot-password', forgotPasswordLimiter, controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);

module.exports = router;