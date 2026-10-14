'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const {autenticar, soloAdmin} = require('../../core/guards');
const controller = require('./auth.controller');

const router = express.Router();

router.get('/empresas', asyncHandler(controller.listarEmpresas));
router.get('/demo', asyncHandler(controller.credencialesDemo));
router.post('/registro', asyncHandler(controller.registro));
router.post('/login', asyncHandler(controller.login));

router.get('/yo', autenticar, asyncHandler(controller.yo));
router.post('/logout', autenticar, asyncHandler(controller.logout));
router.post('/cambiar-password', autenticar, asyncHandler(controller.cambiarPassword));
router.get('/roles', autenticar, soloAdmin, asyncHandler(controller.roles));
router.post('/roles', autenticar, soloAdmin, asyncHandler(controller.crearRol));
router.patch('/roles/:id', autenticar, soloAdmin, asyncHandler(controller.actualizarRol));
router.delete('/roles/:id', autenticar, soloAdmin, asyncHandler(controller.eliminarRol));

router.get('/usuarios', autenticar, soloAdmin, asyncHandler(controller.listarUsuarios));
router.post('/usuarios', autenticar, soloAdmin, asyncHandler(controller.crearUsuario));
router.patch('/usuarios/:id', autenticar, soloAdmin, asyncHandler(controller.actualizarUsuario));
router.post('/usuarios/:id/restablecer', autenticar, soloAdmin, asyncHandler(controller.restablecer));

module.exports = router;
