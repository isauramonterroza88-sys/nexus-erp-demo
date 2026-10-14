'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const controller = require('./hr.controller');

const router = express.Router();

router.get('/empleados', asyncHandler(controller.listar));
router.post('/empleados', asyncHandler(controller.crear));
router.get('/empleados/:id', asyncHandler(controller.perfil));
router.patch('/empleados/:id', asyncHandler(controller.actualizar));
router.post('/empleados/:id/evaluaciones', asyncHandler(controller.evaluar));
router.get('/resumen', asyncHandler(controller.resumen));

module.exports = router;
