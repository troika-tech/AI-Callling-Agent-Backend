const express = require('express');

const requireGetMethod = require('../../middleware/requireGet');
const { requireAuth, requireRoles } = require('../../middleware/auth');
const overviewCtrl = require('../../controllers/dashboard/overview.controller');
const agentsCtrl = require('../../controllers/dashboard/agents.controller');
const callsCtrl = require('../../controllers/dashboard/calls.controller');
const campaignsCtrl = require('../../controllers/dashboard/campaigns.controller');
const phonesCtrl = require('../../controllers/dashboard/phones.controller');

const router = express.Router();

router.use(requireGetMethod);
router.use(requireAuth);
router.use(requireRoles(['owner', 'admin']));

router.get('/auth/me', overviewCtrl.currentUser);
router.get('/me', overviewCtrl.overview);

router.get('/agents', agentsCtrl.list);

router.get('/call-logs', callsCtrl.list);
router.get('/call-logs/:sessionId/recording', callsCtrl.recording);
router.get('/call-logs/:sessionId', callsCtrl.detail);

router.get('/campaigns/:id/info', campaignsCtrl.info);
router.get('/campaigns/:id', campaignsCtrl.detail);
router.get('/campaigns', campaignsCtrl.list);

router.get('/phones/:phone', phonesCtrl.detail);
router.get('/phones', phonesCtrl.list);

router.get('/exports/calls.csv', callsCtrl.exportCsv);

module.exports = router;