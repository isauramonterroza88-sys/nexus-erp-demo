'use strict';

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {db, datosComo, usuariosDemo, reiniciar} = require('./core/database');
const {ErrorHttp, asyncHandler, v} = require('./core/http');
const {autenticar, permiso, soloAdmin, trazas} = require('./core/guards');

const authRoutes = require('./modules/auth/auth.routes');
const storeRoutes = require('./modules/app_store/store.routes');
const crmRoutes = require('./modules/ventas_crm/crm.routes');
const billing = require('./modules/finanzas/billing.controller');
const billingRoutes = require('./modules/finanzas/billing.routes');
const inventory = require('./modules/cadena_suministro/inventory.controller');
const inventoryRoutes = require('./modules/cadena_suministro/inventory.routes');
const hrRoutes = require('./modules/recursos_humanos/hr.routes');
const marketing = require('./modules/marketing/marketing.controller');
const marketingRoutes = require('./modules/marketing/marketing.routes');
const serviceRoutes = require('./modules/servicios/service.routes');
const analytics = require('./modules/motor_analitico/analytics.controller');
const analyticsRoutes = require('./modules/motor_analitico/analytics.routes');

/* Registro de módulos: cada uno se monta detrás de la autenticación y del control de módulo activo y rol */
const MODULOS = [
  {id: 'ventas_crm', ruta: '/api/crm', router: crmRoutes},
  {id: 'finanzas', ruta: '/api/finanzas', router: billingRoutes, init: billing.init},
  {id: 'cadena_suministro', ruta: '/api/inventario', router: inventoryRoutes, init: inventory.init},
  {id: 'recursos_humanos', ruta: '/api/rrhh', router: hrRoutes},
  {id: 'marketing', ruta: '/api/marketing', router: marketingRoutes, init: marketing.init},
  {id: 'servicios', ruta: '/api/servicios', router: serviceRoutes},
  {id: 'motor_analitico', ruta: '/api/analitica', router: analyticsRoutes, init: analytics.init}
];

function origenesPermitidos() {
  const configurados = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((o) => o.trim()).filter(Boolean);
  return new Set(configurados);
}

function rutasDeTrazabilidad() {
  const router = express.Router();
  router.use(autenticar);

  router.get('/logs', asyncHandler((req, res) => {
    const desde = Number(req.query.desde) || 0;
    const limite = v.entero(req.query.limite === undefined ? 200 : Number(req.query.limite), 'limite', {min: 1, max: 500});
    const logs = req.datos.logs.filter((l) => l.id > desde).slice(-limite);
    res.json({logs, ultimoId: req.datos._logSeq, empresa: req.datos.empresaId});
  }));

  router.get('/estado', asyncHandler((req, res) => {
    const {payload, usuario} = req.auth;
    const datos = req.datos;
    res.json({
      empresa: {id: datos.empresaId, nombre: datos.empresa.nombre, nit: datos.empresa.nit},
      sesion: {usuario: usuario.email, rol: usuario.rol, claims: payload, expiraEnSeg: payload.exp - Math.floor(Date.now() / 1000)},
      modulosActivos: Object.entries(datos.empresa.modulos).filter(([, activo]) => activo).map(([id]) => id),
      registros: {
        clientes: datos.clientes.length, oportunidades: datos.oportunidades.length, facturas: datos.facturas.length, productos: datos.productos.length,
        tickets: datos.tickets.length, empleados: datos.empleados.length, mensajes: datos.mensajes.length
      },
      aislamiento: {almacenesEnElServidor: db.datos.size, almacenesVisiblesParaTi: 1}
    });
  }));

  /* Demuestra el aislamiento: intenta abrir el almacén de otra empresa con la sesión actual */
  router.post('/prueba-aislamiento', asyncHandler((req, res) => {
    const objetivo = v.texto((req.body || {}).empresaObjetivo, 'empresaObjetivo', {max: 60});
    req.datos.log('warn', 'aislamiento', `Prueba de aislamiento: la sesión de "${req.datos.empresaId}" intenta leer datos de "${objetivo}"`, {solicitante: req.datos.empresaId, objetivo});
    const almacen = datosComo(req.datos.empresaId, objetivo);
    res.json({permitido: true, empresa: objetivo, clientes: almacen.clientes.length, mensaje: 'Es tu propia empresa: acceso permitido'});
  }));
  return router;
}

/* En modo demostración se aceptan también los celulares de la misma red local (192.168.x.x, 10.x.x.x, 172.16-31.x.x) */
const ORIGEN_RED_LOCAL = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{2,5}$/;

const demoActiva = () => process.env.NEXUS_DEMO !== 'false';

function direccionesDeRed() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

/* Herramientas para presentar el sistema: solo el administrador y solo mientras NEXUS_DEMO no sea "false" */
function rutasDeDemostracion() {
  const router = express.Router();
  router.use(autenticar, soloAdmin, (req, res, next) => (demoActiva() ? next() : next(new ErrorHttp(404, 'NO_DISPONIBLE', 'Las herramientas de demostración están deshabilitadas'))));

  router.get('/acceso', asyncHandler((req, res) => {
    res.json({direcciones: direccionesDeRed(), aviso: 'Los celulares deben estar conectados a la misma red Wi-Fi que este computador.'});
  }));

  router.post('/reiniciar', asyncHandler((req, res) => {
    reiniciar();
    res.json({mensaje: 'Demostración reiniciada: las empresas de ejemplo volvieron a su estado inicial y se borró lo que se registró durante la presentación.'});
  }));
  return router;
}

function crearApp() {
  for (const m of MODULOS) if (m.init) m.init();

  const app = express();
  app.disable('x-powered-by');
  const permitidos = origenesPermitidos();
  app.use(cors({
    origin(origen, callback) {
      callback(null, !origen || permitidos.has(origen) || (demoActiva() && ORIGEN_RED_LOCAL.test(origen)));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Nexus-Trace']
  }));
  app.use(express.json({limit: '200kb'}));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(trazas);

  app.get('/api/sistema/salud', (req, res) => {
    res.json({ok: true, sistema: 'NEXUS ERP CORE', version: '2.0.0', multiEmpresa: true, empresas: db.empresas.size, tiempoActivoSeg: Math.round(process.uptime())});
  });
  app.use('/api/auth', authRoutes);
  app.get('/api/verificar/:codigo', asyncHandler(billing.verificarPublico));
  app.use('/api/trazabilidad', rutasDeTrazabilidad());
  app.use('/api/demo', rutasDeDemostracion());
  app.use('/api/store', autenticar, storeRoutes);
  for (const m of MODULOS) app.use(m.ruta, autenticar, permiso(m.id), m.router);

  /* Si el cliente fue compilado (client/dist), el mismo servidor lo entrega: una sola dirección sirve la API y la interfaz,
     y así funciona desde cualquier celular o computador que pueda llegar al servidor */
  const carpetaCliente = path.join(__dirname, 'client', 'dist');
  if (fs.existsSync(path.join(carpetaCliente, 'index.html'))) {
    app.use(express.static(carpetaCliente, {index: 'index.html'}));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(carpetaCliente, 'index.html')));
  }

  app.use((req, res, next) => next(new ErrorHttp(404, 'RUTA_NO_ENCONTRADA', `No existe la ruta ${req.method} ${req.originalUrl}`)));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ErrorHttp) return res.status(error.status).json({error: error.codigo, mensaje: error.message, detalle: error.detalle});
    if (error && error.type === 'entity.parse.failed') return res.status(400).json({error: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es un JSON válido'});
    if (error && error.type === 'entity.too.large') return res.status(413).json({error: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El cuerpo de la petición supera el límite permitido'});
    if (req.datos) req.datos.log('error', 'servidor', `Error interno: ${error.message}`, {pila: String(error.stack).split('\n').slice(0, 3)});
    else console.error(error);
    return res.status(500).json({error: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado en el servidor'});
  });
  return app;
}

if (require.main === module) {
  const puerto = Number(process.env.PORT) || 5000;
  crearApp().listen(puerto, () => {
    console.log(`\nNEXUS ERP CORE multi-empresa escuchando en http://localhost:${puerto}`);
    for (const ip of direccionesDeRed()) console.log(`Desde un celular conectado al mismo Wi-Fi: http://${ip}:${puerto}`);
    console.log('Empresas demo: alfa (todos los módulos) y beta (CRM, Servicios y RR. HH.)');
    if (process.env.NEXUS_DEMO !== 'false') console.log(`Usuarios demo: ${usuariosDemo.length}. Contraseña común: Nexus#2026 (ver GET /api/auth/demo)\n`);
    if (!process.env.JWT_SECRET) console.log('Aviso: JWT_SECRET no está definido; se usa un secreto aleatorio que cambia en cada arranque.\n');
  });
}

module.exports = {crearApp, MODULOS};
