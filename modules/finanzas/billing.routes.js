'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const controller = require('./billing.controller');

const router = express.Router();

router.get('/facturas', asyncHandler(controller.listar));
router.post('/facturas', asyncHandler(controller.crear));
router.get('/facturas/:id', asyncHandler(controller.obtener));
router.get('/facturas/:id/documento', asyncHandler(controller.documento));
router.post('/facturas/:id/pagar', asyncHandler(controller.pagar));
router.get('/cartera', asyncHandler(controller.cartera));
router.get('/estado-cuenta/:clienteId', asyncHandler(controller.estadoDeCuenta));

module.exports = router;
