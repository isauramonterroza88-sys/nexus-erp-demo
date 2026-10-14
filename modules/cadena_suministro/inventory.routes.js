'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const controller = require('./inventory.controller');

const router = express.Router();

router.get('/productos', asyncHandler(controller.listar));
router.post('/productos', asyncHandler(controller.crear));
router.patch('/productos/:id', asyncHandler(controller.actualizar));
router.post('/productos/:id/entrada', asyncHandler(controller.entrada));
router.get('/movimientos', asyncHandler(controller.movimientos));
router.get('/alertas', asyncHandler(controller.alertas));

module.exports = router;
