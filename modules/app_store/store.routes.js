'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const {soloAdmin} = require('../../core/guards');
const controller = require('./store.controller');

const router = express.Router();

router.get('/menu', asyncHandler(controller.menu));
router.get('/apps', soloAdmin, asyncHandler(controller.listar));
router.post('/cotizar', soloAdmin, asyncHandler(controller.cotizar));
router.post('/comprar', soloAdmin, asyncHandler(controller.comprar));
router.post('/apps/:id/activar', soloAdmin, asyncHandler(controller.activar));
router.post('/apps/:id/desactivar', soloAdmin, asyncHandler(controller.desactivar));
router.get('/cobros', soloAdmin, asyncHandler(controller.cobros));

module.exports = router;
