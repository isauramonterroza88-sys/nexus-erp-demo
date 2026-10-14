'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const controller = require('./marketing.controller');

const router = express.Router();

router.get('/segmentos', asyncHandler(controller.segmentos));
router.get('/campanas', asyncHandler(controller.listar));
router.post('/campanas', asyncHandler(controller.crear));
router.patch('/campanas/:id', asyncHandler(controller.actualizar));
router.post('/campanas/:id/cerrar', asyncHandler(controller.cerrar));
router.post('/campanas/:id/ejecutar', asyncHandler(controller.ejecutar));
router.get('/mensajes', asyncHandler(controller.mensajes));
router.get('/cuota', asyncHandler(controller.verCuota));
router.patch('/cuota', asyncHandler(controller.actualizarCuota));

module.exports = router;
