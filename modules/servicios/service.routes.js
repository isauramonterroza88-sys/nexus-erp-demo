'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const controller = require('./service.controller');

const router = express.Router();

router.get('/resumen', asyncHandler(controller.resumen));
router.get('/tickets', asyncHandler(controller.listar));
router.post('/tickets', asyncHandler(controller.crear));
router.get('/tickets/:id', asyncHandler(controller.obtener));
router.post('/tickets/:id/asignar', asyncHandler(controller.asignar));
router.patch('/tickets/:id/estado', asyncHandler(controller.cambiarEstado));
router.post('/tickets/:id/comentarios', asyncHandler(controller.comentar));

module.exports = router;
