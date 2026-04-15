const express = require('express');
const router = express.Router();
const cameraController = require('../controllers/cameraController');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

router.get(
  '/',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  cameraController.getCameras
);

router.get(
  '/active',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  cameraController.getActiveCamera
);

router.get(
  '/:id/snapshot',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  cameraController.getCameraSnapshot
);

router.post(
  '/',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  cameraController.saveCameraConfig
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  cameraController.updateCameraConfig
);

router.post(
  '/process-frame',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  cameraController.processCameraFrame
);

module.exports = router;
