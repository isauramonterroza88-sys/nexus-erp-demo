'use strict';

const crypto = require('crypto');
const {hashPasswordSync, plantillaDeRoles, rolesDeEjemplo} = require('./security');
const {ErrorHttp} = require('./http');

/* ---------------------------------------------------------------------------
   1. Catálogo de módulos comercializables
   --------------------------------------------------------------------------- */

const CATEGORIAS = [
  {id: 'ventas', nombre: 'Apps Ventas', icono: 'TrendingUp'},
  {id: 'finanzas', nombre: 'Apps Finanzas', icono: 'Wallet'},
  {id: 'cadena', nombre: 'Apps Cadena de Suministro', icono: 'Truck'},
  {id: 'marketing', nombre: 'Apps Marketing', icono: 'Megaphone'},
  {id: 'servicios', nombre: 'Apps Servicios', icono: 'LifeBuoy'},
  {id: 'rrhh', nombre: 'Apps Recursos Humanos', icono: 'Briefcase'},
  {id: 'analitica', nombre: 'Apps Analítica', icono: 'BarChart3'}
];

const CATALOGO_MODULOS = [
  {
    id: 'ventas_crm', nombre: 'CRM y Ventas', categoria: 'ventas', icono: 'Users', precioMensual: 89000, dependencias: [],
    descripcion: 'Ficha 360° de clientes con NIT y cumpleaños, oportunidades, cotizaciones e historial de interacciones.',
    menu: [
      {id: 'crm_clientes', label: 'Clientes (ficha 360°)', icono: 'Users'},
      {id: 'crm_pipeline', label: 'Flujo de ventas', icono: 'Layers'},
      {id: 'crm_cotizaciones', label: 'Cotizaciones', icono: 'FileText'}
    ]
  },
  {
    id: 'finanzas', nombre: 'Facturación y Cartera', categoria: 'finanzas', icono: 'Receipt', precioMensual: 129000, dependencias: ['ventas_crm'],
    descripcion: 'Facturación electrónica con CUFE y código QR de verificación, cartera y estados de cuenta.',
    menu: [
      {id: 'fin_facturas', label: 'Facturas digitales', icono: 'Receipt'},
      {id: 'fin_cartera', label: 'Cartera y estados de cuenta', icono: 'Wallet'}
    ]
  },
  {
    id: 'cadena_suministro', nombre: 'Inventario', categoria: 'cadena', icono: 'Package', precioMensual: 99000, dependencias: [],
    descripcion: 'Existencias en tiempo real, kárdex y descuento automático de stock al emitirse una factura.',
    menu: [
      {id: 'inv_productos', label: 'Productos y stock', icono: 'Package'},
      {id: 'inv_movimientos', label: 'Kárdex', icono: 'ArrowRightLeft'}
    ]
  },
  {
    id: 'marketing', nombre: 'Marketing', categoria: 'marketing', icono: 'Megaphone', precioMensual: 79000, dependencias: ['ventas_crm'],
    descripcion: 'Campañas comerciales con segmentación por clase RFM, tipología y zona, y cuota diaria de mensajes.',
    menu: [
      {id: 'mkt_campanas', label: 'Campañas y segmentos', icono: 'Megaphone'}
    ]
  },
  {
    id: 'servicios', nombre: 'Servicios y Soporte', categoria: 'servicios', icono: 'LifeBuoy', precioMensual: 69000, dependencias: ['ventas_crm'],
    descripcion: 'Órdenes de soporte, plazos de atención (SLA) y trazabilidad de la postventa.',
    menu: [
      {id: 'srv_tickets', label: 'Órdenes de soporte', icono: 'LifeBuoy'}
    ]
  },
  {
    id: 'recursos_humanos', nombre: 'Recursos Humanos', categoria: 'rrhh', icono: 'Briefcase', precioMensual: 59000, dependencias: [],
    descripcion: 'Perfiles del talento humano, estructura por áreas y evaluaciones de desempeño.',
    menu: [
      {id: 'rrhh_empleados', label: 'Personal y perfiles', icono: 'Briefcase'}
    ]
  },
  {
    id: 'motor_analitico', nombre: 'Motor Analítico', categoria: 'analitica', icono: 'BarChart3', precioMensual: 119000, dependencias: ['ventas_crm'],
    descripcion: 'Puntaje RFM y geográfico, segmentación AAA a C, LTV, retención, comisiones sobre recaudo e indicadores del modelo.',
    menu: [
      {id: 'ana_indicadores', label: 'Indicadores y segmentación', icono: 'BarChart3'}
    ]
  }
];

const MODULOS_BASE = CATALOGO_MODULOS.map((m) => m.id);

/* ---------------------------------------------------------------------------
   2. Utilidades de fechas y fiscales
   --------------------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');
const fechaLocalISO = (fecha = new Date()) => `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;

function sumarDias(iso, dias) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())}`;
}

function diasEntre(desdeISO, hastaISO) {
  const [a1, m1, d1] = desdeISO.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = hastaISO.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

const redondear = (n) => Math.round(n * 100) / 100;

function calcularTotales(items) {
  let subtotal = 0;
  let iva = 0;
  for (const i of items) {
    const base = i.cantidad * i.precioUnitario;
    subtotal += base;
    iva += base * (i.ivaPct / 100);
  }
  return {subtotal: redondear(subtotal), iva: redondear(iva), total: redondear(subtotal + iva)};
}

const CLAVE_TECNICA = 'nexus-clave-tecnica-demo';

function generarCufe({numero, fechaEmision, subtotal, iva, total, nitEmisor, nitCliente}) {
  const cadena = [numero, fechaEmision, subtotal.toFixed(2), '01', iva.toFixed(2), total.toFixed(2), nitEmisor, nitCliente, CLAVE_TECNICA].join('');
  return crypto.createHash('sha384').update(cadena).digest('hex');
}

function generarQr({numero, nitEmisor, nitCliente, subtotal, iva, total, cufe, codigoVerificacion}) {
  return [
    `NumFac=${numero}`, `NitFac=${nitEmisor}`, `DocAdq=${nitCliente}`, `ValFac=${subtotal.toFixed(2)}`,
    `ValIva=${iva.toFixed(2)}`, `ValTotal=${total.toFixed(2)}`, `CUFE=${cufe}`, `Verificacion=${codigoVerificacion}`
  ].join('\n');
}

const generarCodigoVerificacion = () => crypto.randomBytes(9).toString('base64url').toUpperCase();

/* ---------------------------------------------------------------------------
   3. Registro global y almacenes aislados por empresa (company_id)
   --------------------------------------------------------------------------- */

const MAX_LOGS = 600;
const MAX_SEGURIDAD = 200;

const db = {
  empresas: new Map(),
  datos: new Map(),
  usuarios: [],
  verificacion: new Map(),
  seguridad: [],
  _seqUsuario: 0,
  _seqSeguridad: 0
};

function configuracionInicial() {
  return {
    analitico: {
      wR: 0.30, wF: 0.40, wM: 0.30, wRFM: 0.85, wGeo: 0.15, ventanaSemanas: 8,
      geo: {urbana: 1, cabecera: 0.8, rural: 0.6},
      umbrales: {aaa: 0.75, aa: 0.60, a: 0.45, b: 0.30, frecuenciaMinAaa: 0.75},
      comisionPct: 2, alpha: 100, beta: 1
    },
    marketing: {capDiaria: 100, topePorCliente: 3}
  };
}

function crearAlmacen(empresa) {
  const almacen = {
    empresaId: empresa.id,
    empresa,
    clientes: [], interacciones: [], oportunidades: [], cotizaciones: [], facturas: [],
    productos: [], movimientos: [], empleados: [], evaluaciones: [], campanas: [], mensajes: [], tickets: [],
    suscripciones: [], cobros: [],
    roles: plantillaDeRoles(),
    config: configuracionInicial(),
    contadores: {preventas: 0, quiebres: 0},
    logs: [],
    _logSeq: 0,
    siguienteId(coleccion) {
      return almacen[coleccion].reduce((max, x) => Math.max(max, x.id), 0) + 1;
    },
    log(nivel, origen, mensaje, payload) {
      const entrada = {id: ++almacen._logSeq, ts: new Date().toISOString(), nivel, origen, mensaje, payload: payload === undefined ? null : payload};
      almacen.logs.push(entrada);
      if (almacen.logs.length > MAX_LOGS) almacen.logs.shift();
      if (!process.env.NEXUS_SILENT) console.log(`[${entrada.ts.slice(11, 23)}] ${empresa.id.padEnd(8)} ${nivel.toUpperCase().padEnd(5)} ${origen.padEnd(18)} ${mensaje}`);
      return entrada;
    }
  };
  return almacen;
}

function slugificar(nombre) {
  return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

function crearEmpresa({id, nombre, nit, modulos}) {
  const base = id || slugificar(nombre);
  if (!base) throw new ErrorHttp(422, 'VALIDACION', 'nombre: no genera un identificador válido');
  let slug = base;
  let n = 2;
  while (db.empresas.has(slug)) slug = `${base}-${n++}`;
  const activos = Object.fromEntries(MODULOS_BASE.map((m) => [m, modulos ? modulos.includes(m) : m === 'ventas_crm']));
  const empresa = {
    id: slug,
    nombre,
    nit,
    moneda: 'COP',
    creada: new Date().toISOString(),
    modulos: activos,
    metodoPago: {tipo: 'tarjeta', marca: 'Visa', ultimos4: '4242'}
  };
  db.empresas.set(slug, empresa);
  const almacen = crearAlmacen(empresa);
  db.datos.set(slug, almacen);
  const ahora = new Date().toISOString();
  for (const m of CATALOGO_MODULOS.filter((x) => activos[x.id])) {
    const transaccion = `TXN-ALTA-${m.id.toUpperCase()}`;
    almacen.suscripciones.push({id: almacen.siguienteId('suscripciones'), moduloId: m.id, precioMensual: m.precioMensual, estado: 'activa', inicio: ahora, proximoCobro: sumarDias(fechaLocalISO(), 30), transaccion});
    almacen.cobros.push({
      id: almacen.siguienteId('cobros'), moduloId: m.id, concepto: `Suscripción mensual: ${m.nombre}`, subtotal: m.precioMensual,
      iva: redondear(m.precioMensual * 0.19), total: redondear(m.precioMensual * 1.19), moneda: 'COP', estado: 'aprobado', transaccion, ts: ahora, medio: 'Visa •••• 4242'
    });
  }
  return empresa;
}

/* Permisos vigentes de un rol en una empresa. El administrador siempre tiene todos los módulos del catálogo. */
function permisosDelRol(almacen, rolId) {
  if (rolId === 'admin') return Object.fromEntries(CATALOGO_MODULOS.map((m) => [m.id, 'rw']));
  const rol = almacen.roles[rolId];
  return rol ? rol.permisos : {};
}

function rolDeEmpresa(empresaId, rolId) {
  const almacen = db.datos.get(String(empresaId));
  return (almacen && almacen.roles[rolId]) || {id: rolId, nombre: rolId, permisos: {}};
}

function empresaPorId(id) {
  return db.empresas.get(String(id)) || null;
}

function datosDe(empresaId) {
  const almacen = db.datos.get(String(empresaId));
  if (!almacen) throw new ErrorHttp(404, 'EMPRESA_NO_ENCONTRADA', `No existe la empresa "${empresaId}"`);
  return almacen;
}

/* Acceso a datos con comprobación de aislamiento: una empresa solo puede abrir su propio almacén */
function datosComo(empresaSolicitante, empresaObjetivo) {
  if (empresaSolicitante !== empresaObjetivo) {
    throw new ErrorHttp(403, 'AISLAMIENTO_MULTIEMPRESA', `Acceso denegado: la sesión de "${empresaSolicitante}" no puede leer datos de "${empresaObjetivo}"`);
  }
  return datosDe(empresaObjetivo);
}

const moduloActivo = (almacen, id) => almacen.empresa.modulos[id] === true;

function registrarSeguridad(nivel, mensaje, payload) {
  const entrada = {id: ++db._seqSeguridad, ts: new Date().toISOString(), nivel, mensaje, payload: payload === undefined ? null : payload};
  db.seguridad.push(entrada);
  if (db.seguridad.length > MAX_SEGURIDAD) db.seguridad.shift();
  if (!process.env.NEXUS_SILENT) console.log(`[${entrada.ts.slice(11, 23)}] SEGUR ${nivel.toUpperCase().padEnd(5)} ${mensaje}`);
  return entrada;
}

function agregarUsuario({empresaId, nombre, email, rol, hash}) {
  const usuario = {
    id: ++db._seqUsuario, empresaId, nombre, email: email.toLowerCase(), rol, hash, activo: true,
    creado: new Date().toISOString(), ultimoAcceso: null, ultimoCambioPassword: new Date().toISOString(),
    intentosFallidos: 0, bloqueadoHasta: null, debeCambiarPassword: false
  };
  db.usuarios.push(usuario);
  return usuario;
}

/* ---------------------------------------------------------------------------
   4. Bus de eventos inter-modulares (por empresa)
   --------------------------------------------------------------------------- */

const suscriptores = new Map();

function suscribir(evento, modulo, descripcion, manejador, orden = 100) {
  const lista = (suscriptores.get(evento) || []).filter((s) => s.modulo !== modulo);
  lista.push({modulo, descripcion, manejador, orden});
  suscriptores.set(evento, lista);
}

async function publicar(almacen, evento, etiqueta, payload, origen) {
  const lista = (suscriptores.get(evento) || []).slice().sort((a, b) => a.orden - b.orden);
  almacen.log('info', origen, `EVENTO ${evento}`, payload);
  const efectos = [];
  for (const s of lista) {
    if (!moduloActivo(almacen, s.modulo)) {
      almacen.log('warn', 'bus_eventos', `${etiqueta} -> omitido: el módulo ${s.modulo} no está activo en esta empresa`, {evento, modulo: s.modulo});
      efectos.push({modulo: s.modulo, estado: 'omitido', detalle: 'Módulo inactivo'});
      continue;
    }
    almacen.log('info', 'bus_eventos', `${etiqueta} -> ${s.descripcion}`, {evento, destino: s.modulo});
    try {
      efectos.push({modulo: s.modulo, estado: 'ok', detalle: await s.manejador(payload, almacen)});
    } catch (error) {
      almacen.log('error', s.modulo, `Fallo al procesar ${evento}: ${error.message}`, null);
      efectos.push({modulo: s.modulo, estado: 'error', detalle: error.message});
    }
  }
  return efectos;
}

/* ---------------------------------------------------------------------------
   5. Datos de demostración: dos empresas independientes
   --------------------------------------------------------------------------- */

const PASSWORD_DEMO = 'Nexus#2026';
const usuariosDemo = [];

function sembrarUsuarios(empresa, lista) {
  const hash = hashPasswordSync(PASSWORD_DEMO);
  for (const [nombre, email, rol] of lista) {
    agregarUsuario({empresaId: empresa.id, nombre, email, rol, hash});
    usuariosDemo.push({empresaId: empresa.id, empresa: empresa.nombre, nombre, email, rol, password: PASSWORD_DEMO});
  }
}

function registrarFactura(almacen, f) {
  db.verificacion.set(f.codigoVerificacion, {empresaId: almacen.empresaId, facturaId: f.id});
}

function sembrarAlfa() {
  const empresa = crearEmpresa({id: 'alfa', nombre: 'Distribuciones Alfa S.A.S.', nit: '900123456-8', modulos: MODULOS_BASE});
  datosDe('alfa').roles = rolesDeEjemplo();
  const A = datosDe('alfa');
  const hoy = fechaLocalISO();
  const cumple = (offset, anio) => {
    const f = new Date();
    f.setDate(f.getDate() + offset);
    return `${anio}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`;
  };
  sembrarUsuarios(empresa, [
    ['Carolina Mejía', 'carolina.mejia@alfa.test', 'admin'],
    ['Andrés Pineda', 'andres.pineda@alfa.test', 'ventas'],
    ['Laura Gómez', 'laura.gomez@alfa.test', 'finanzas'],
    ['Pedro Salas', 'pedro.salas@alfa.test', 'inventario'],
    ['Sandra Ruiz', 'sandra.ruiz@alfa.test', 'rrhh'],
    ['Diego Ríos', 'diego.rios@alfa.test', 'marketing'],
    ['Luisa Ortega', 'luisa.ortega@alfa.test', 'soporte']
  ]);

  A.clientes = [
    ['Supermercado La Gran Canasta S.A.S.', '900451236-0', 'Rosa Elena Díaz', 'Gerente de compras', cumple(0, 1982), 'Medellín', 'autoservicio', 'urbana', true],
    ['Minimercado El Ahorro Ltda.', '901128745-8', 'Pedro Salcedo', 'Propietario', '1979-02-14', 'Bogotá', 'minimercado', 'urbana', true],
    ['Restaurante Sabor Criollo S.A.S.', '800756321-6', 'Marta Vargas', 'Administradora', '1988-07-30', 'Cartagena', 'institucional', 'urbana', true],
    ['Hotel Palmeras del Caribe S.A.', '830245119-0', 'Jorge Mendoza', 'Jefe de alimentos y bebidas', cumple(3, 1975), 'Barranquilla', 'institucional', 'cabecera', true],
    ['Panadería La Espiga', '900987654-7', 'Elena Ruiz', 'Propietaria', '1991-11-05', 'Cali', 'tienda_tradicional', 'urbana', true],
    ['Cafetería Aroma Andino S.A.S.', '901345678-2', 'Carlos Pacheco', 'Gerente', cumple(12, 1986), 'Bucaramanga', 'tienda_tradicional', 'cabecera', false],
    ['Colegio San Gabriel', '800432105-0', 'Ana Lucía Gómez', 'Coordinadora administrativa', '1980-04-22', 'Bogotá', 'institucional', 'urbana', true],
    ['Clínica del Norte S.A.', '890123789-1', 'Luis Herrera', 'Jefe de compras', cumple(25, 1972), 'Medellín', 'institucional', 'urbana', true],
    ['Autoservicio Mercamás', '900765432-6', 'Julián Ortega', 'Gerente general', '1984-09-17', 'Bogotá', 'autoservicio', 'cabecera', true],
    ['Tienda Doña Rosa', '901567890-0', 'Rosa Martínez', 'Propietaria', '1990-12-01', 'Cali', 'tienda_tradicional', 'rural', false]
  ].map((c, i) => ({
    id: i + 1, razonSocial: c[0], nombreComercial: c[0].replace(/ (S\.A\.S\.|Ltda\.|S\.A\.)$/, ''), nit: c[1], contacto: c[2], cargo: c[3],
    correo: `${c[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '.')}@cliente${i + 1}.example`,
    telefono: `+57300000${String(101 + i).padStart(4, '0')}`, direccion: `Calle ${10 + i} # ${20 + i}-${30 + i}`,
    fechaCumpleanos: c[4], ciudad: c[5], tipologia: c[6], zona: c[7], canalDigital: c[8], estadoCuenta: 'activo',
    fechaRegistro: sumarDias(hoy, -(200 - i * 17))
  }));

  A.interacciones = [
    [1, 'whatsapp', 'llamada', 'Acordó ampliar el surtido de lácteos para el próximo trimestre.', 'Andrés Pineda', 6],
    [1, 'correo', 'cotizacion', 'Se envió cotización del contrato anual de abarrotes.', 'Andrés Pineda', 14],
    [4, 'visita', 'reunion', 'Reunión con el chef: interés en queso costeño por volumen.', 'Andrés Pineda', 9],
    [8, 'telefono', 'seguimiento', 'Pide ajustar la frecuencia de entrega a dos veces por semana.', 'Andrés Pineda', 4],
    [9, 'whatsapp', 'pedido', 'Pedido recurrente confirmado por mensajería.', 'Andrés Pineda', 2],
    [3, 'correo', 'posventa', 'Reporta empaques dañados en el último despacho.', 'Luisa Ortega', 3]
  ].map((x, i) => ({id: i + 1, clienteId: x[0], canal: x[1], tipo: x[2], resumen: x[3], responsable: x[4], fechaHora: new Date(Date.now() - x[5] * 86400000).toISOString()}));

  const probabilidad = {nuevo: 10, calificado: 30, propuesta: 55, negociacion: 75, ganado: 100, perdido: 0};
  A.oportunidades = [
    ['Contrato anual de abarrotes', 1, 240000000, 'negociacion', 'Andrés Pineda', 20],
    ['Surtido de lácteos trimestral', 4, 78000000, 'propuesta', 'Andrés Pineda', 15],
    ['Apertura de cuenta de cafetería', 6, 12000000, 'calificado', 'Andrés Pineda', 30],
    ['Suministro para casino institucional', 7, 64500000, 'propuesta', 'Andrés Pineda', 10],
    ['Pedido institucional escolar', 7, 31000000, 'nuevo', 'Andrés Pineda', 45],
    ['Alimentos para cafetería de clínica', 8, 110000000, 'negociacion', 'Andrés Pineda', 12],
    ['Reposición de fin de mes', 2, 18200000, 'ganado', 'Andrés Pineda', -3],
    ['Línea de panadería', 5, 22000000, 'ganado', 'Andrés Pineda', -9]
  ].map((o, i) => ({
    id: i + 1, titulo: o[0], clienteId: o[1], valorEstimado: o[2], etapa: o[3], probabilidadCierre: probabilidad[o[3]], responsable: o[4],
    fechaEstimadaCierre: sumarDias(hoy, o[5]), creada: sumarDias(hoy, -(40 - i * 3))
  }));

  A.productos = [
    ['LAC-001', 'Leche UHT entera 1 L (caja x 12)', 'Leches', 52000, 0, 480, 120],
    ['LAC-002', 'Yogurt entero 1 L (caja x 6)', 'Yogures', 41000, 19, 260, 80],
    ['LAC-003', 'Queso costeño 500 g (caja x 10)', 'Quesos', 118000, 0, 90, 40],
    ['LAC-004', 'Leche en polvo 400 g (caja x 12)', 'Leches', 176000, 0, 150, 60],
    ['LAC-005', 'Mantequilla 250 g (caja x 20)', 'Mantequillas', 94000, 19, 38, 40],
    ['LAC-006', 'Suero costeño 1 kg (caja x 8)', 'Cremas y sueros', 67000, 0, 210, 50]
  ].map((p, i) => ({id: i + 1, sku: p[0], nombre: p[1], categoria: p[2], precioUnitario: p[3], ivaPct: p[4], stock: p[5], stockMinimo: p[6], unidad: 'caja'}));

  const clientePorId = (id) => A.clientes.find((c) => c.id === id);
  const productoPorSku = (sku) => A.productos.find((p) => p.sku === sku);
  const armar = ({id, clienteId, lineas, diasEmision, credito, estado, diasPago, vendedor}) => {
    const items = lineas.map(([sku, cantidad]) => {
      const p = productoPorSku(sku);
      return {sku, descripcion: p.nombre, cantidad, precioUnitario: p.precioUnitario, ivaPct: p.ivaPct};
    });
    const totales = calcularTotales(items);
    const numero = `FE-${String(id).padStart(4, '0')}`;
    const fechaEmision = sumarDias(hoy, -diasEmision);
    const cliente = clientePorId(clienteId);
    const cufe = generarCufe({numero, fechaEmision, ...totales, nitEmisor: empresa.nit, nitCliente: cliente.nit});
    const codigoVerificacion = generarCodigoVerificacion();
    const factura = {
      id, numero, cotizacionId: null, clienteId, items, ...totales, estadoPago: estado, fechaEmision, diasCredito: credito,
      fechaVencimiento: sumarDias(fechaEmision, credito), fechaPago: estado === 'Pagada' ? sumarDias(hoy, -diasPago) : null,
      metodoPago: estado === 'Pagada' ? 'transferencia' : null, referenciaPago: estado === 'Pagada' ? `TRF-SEED-${id}` : null,
      cufe, codigoVerificacion, urlComprobante: `/api/verificar/${codigoVerificacion}`,
      qr: generarQr({numero, nitEmisor: empresa.nit, nitCliente: cliente.nit, ...totales, cufe, codigoVerificacion}),
      vendedor, emisionMs: 40 + id * 7, inventarioDescontado: true
    };
    registrarFactura(A, factura);
    return factura;
  };
  A.facturas = [
    armar({id: 1, clienteId: 1, lineas: [['LAC-001', 40]], diasEmision: 20, credito: 30, estado: 'Pagada', diasPago: 12, vendedor: 'Andrés Pineda'}),
    armar({id: 2, clienteId: 4, lineas: [['LAC-004', 6], ['LAC-003', 10]], diasEmision: 24, credito: 30, estado: 'Pagada', diasPago: 14, vendedor: 'Andrés Pineda'}),
    armar({id: 3, clienteId: 9, lineas: [['LAC-002', 30]], diasEmision: 45, credito: 30, estado: 'Pendiente', vendedor: 'Andrés Pineda'}),
    armar({id: 4, clienteId: 8, lineas: [['LAC-006', 20], ['LAC-005', 10]], diasEmision: 10, credito: 30, estado: 'Pendiente', vendedor: 'Andrés Pineda'}),
    armar({id: 5, clienteId: 3, lineas: [['LAC-001', 12]], diasEmision: 3, credito: 15, estado: 'Pendiente', vendedor: 'Andrés Pineda'}),
    armar({id: 6, clienteId: 1, lineas: [['LAC-002', 18]], diasEmision: 9, credito: 30, estado: 'Pagada', diasPago: 5, vendedor: 'Andrés Pineda'}),
    armar({id: 7, clienteId: 9, lineas: [['LAC-001', 24]], diasEmision: 6, credito: 30, estado: 'Pagada', diasPago: 2, vendedor: 'Andrés Pineda'})
  ];

  const historial = [];
  let idHistorial = A.facturas.length + 1;
  const pagadas = [
    [1, 'LAC-001', 16, [3, 10, 17, 24, 31, 38, 45]],
    [9, 'LAC-002', 12, [6, 13, 27, 41]],
    [4, 'LAC-003', 6, [4, 19]],
    [2, 'LAC-001', 30, [21]],
    [5, 'LAC-002', 10, [9]],
    [8, 'LAC-003', 12, [11, 33]],
    [7, 'LAC-004', 4, [32]]
  ];
  for (const [clienteId, sku, cantidad, dias] of pagadas) {
    for (const d of dias) {
      historial.push(armar({id: idHistorial++, clienteId, lineas: [[sku, cantidad]], diasEmision: d + 4, credito: 30, estado: 'Pagada', diasPago: d, vendedor: 'Andrés Pineda'}));
    }
  }
  A.facturas = A.facturas.concat(historial);

  const itemsCot = (lineas) => lineas.map(([sku, cantidad]) => {
    const p = productoPorSku(sku);
    return {sku, descripcion: p.nombre, cantidad, precioUnitario: p.precioUnitario, ivaPct: p.ivaPct};
  });
  A.cotizaciones = [
    {id: 1, oportunidadId: 2, numero: 'COT-0001', items: itemsCot([['LAC-003', 20], ['LAC-004', 8]]), estado: 'enviada', diasVigencia: 15},
    {id: 2, oportunidadId: 1, numero: 'COT-0002', items: itemsCot([['LAC-001', 120]]), estado: 'borrador', diasVigencia: 30},
    {id: 3, oportunidadId: 7, numero: 'COT-0003', items: itemsCot([['LAC-002', 30]]), estado: 'aceptada', diasVigencia: 15}
  ].map((c, i) => {
    const op = A.oportunidades.find((o) => o.id === c.oportunidadId);
    return {...c, clienteId: op.clienteId, ...calcularTotales(c.items), fechaEmision: sumarDias(hoy, -(8 - i * 2)), fechaVencimiento: sumarDias(hoy, c.diasVigencia - (8 - i * 2)), vendedor: op.responsable};
  });

  A.empleados = [
    ['Carolina Mejía', '52111222', 'Gerente general', 'Dirección', 'indefinido', 9800000, '1985-05-12', -1800, 'carolina.mejia@alfa.test'],
    ['Andrés Pineda', '80333444', 'Asesor comercial senior', 'Ventas', 'indefinido', 4200000, '1990-03-02', -1100, 'andres.pineda@alfa.test'],
    ['Laura Gómez', '1020555666', 'Analista financiera', 'Finanzas', 'indefinido', 3900000, '1992-08-21', -900, 'laura.gomez@alfa.test'],
    ['Pedro Salas', '79777888', 'Jefe de bodega', 'Logística', 'indefinido', 3600000, '1987-11-30', -1500, 'pedro.salas@alfa.test'],
    ['Luisa Ortega', '1030999000', 'Representante de soporte', 'Servicio al cliente', 'fijo', 2800000, '1996-01-18', -400, 'luisa.ortega@alfa.test']
  ].map((e, i) => ({id: i + 1, nombre: e[0], documento: e[1], cargo: e[2], area: e[3], contrato: e[4], salarioBase: e[5], fechaNacimiento: e[6], fechaIngreso: sumarDias(hoy, e[7]), correo: e[8], estado: 'activo'}));
  A.evaluaciones = [
    {id: 1, empleadoId: 2, periodo: '2026-S1', calificacion: 4.6, comentario: 'Supera la meta de recaudo y mantiene el pipeline al día.', evaluador: 'Carolina Mejía'},
    {id: 2, empleadoId: 5, periodo: '2026-S1', calificacion: 4.2, comentario: 'Resuelve los tickets dentro del plazo en el 94 % de los casos.', evaluador: 'Carolina Mejía'}
  ];

  A.campanas = [{
    id: 1, nombre: 'Semana del queso costeño', mensaje: 'Esta semana, 10 % menos en queso costeño por volumen. Reserva tu pedido antes de la visita.',
    descuentoPct: 10, tipologias: ['minimercado', 'autoservicio', 'institucional'], zonas: ['urbana', 'cabecera'], clases: [], estado: 'borrador', creada: hoy, creadaPor: 'Diego Ríos'
  }];

  A.tickets = [
    ['Entrega incompleta del pedido', 1, 'alta', 'abierto', null, 30],
    ['Producto con empaque dañado', 3, 'media', 'en_curso', 'Luisa Ortega', 40],
    ['Factura con NIT incorrecto', 4, 'media', 'abierto', null, 3],
    ['Solicitud de certificado de calidad', 8, 'baja', 'resuelto', 'Luisa Ortega', 140]
  ].map((t, i) => {
    const creado = Date.now() - t[5] * 3600000;
    const historial = [{ts: new Date(creado).toISOString(), tipo: 'creado', autor: 'Sistema', detalle: 'Orden de soporte registrada'}];
    if (t[4]) historial.push({ts: new Date(creado + 1800000).toISOString(), tipo: 'asignado', autor: 'Sistema', detalle: `Asignada a ${t[4]}`});
    if (t[3] === 'resuelto') historial.push({ts: new Date(creado + 7200000).toISOString(), tipo: 'estado', autor: t[4], detalle: 'Estado: resuelto'});
    return {id: i + 1, asunto: t[0], clienteId: t[1], prioridad: t[2], estado: t[3], asignadoA: t[4], creado: new Date(creado).toISOString(), resuelto: t[3] === 'resuelto' ? new Date(creado + 7200000).toISOString() : null, facturaId: null, historial};
  });

  A.log('info', 'nucleo', 'Empresa demo "Distribuciones Alfa" cargada con todos los módulos activos', {modulos: empresa.modulos});
}

function sembrarBeta() {
  const empresa = crearEmpresa({id: 'beta', nombre: 'Comercial Beta Ltda.', nit: '901777001-0', modulos: ['ventas_crm', 'servicios', 'recursos_humanos']});
  datosDe('beta').roles = rolesDeEjemplo();
  const B = datosDe('beta');
  const hoy = fechaLocalISO();
  sembrarUsuarios(empresa, [
    ['Diego Rincón', 'diego.rincon@beta.test', 'admin'],
    ['Valeria Ortiz', 'valeria.ortiz@beta.test', 'ventas'],
    ['Mateo Salazar', 'mateo.salazar@beta.test', 'soporte'],
    ['Natalia Pozo', 'natalia.pozo@beta.test', 'rrhh']
  ]);
  B.clientes = [
    ['Clínica Santa Aurora Ltda.', '900222333-5', 'Camila Reyes', 'Directora administrativa', '1983-02-09', 'Panamá', 'institucional', 'urbana'],
    ['Bufete Ramírez y Asociados', '901444555-1', 'Sofía Ramírez', 'Socia fundadora', '1978-10-03', 'Quito', 'institucional', 'urbana'],
    ['Taller Mecánico Ruedas', '800666777-4', 'Iván Cedeño', 'Propietario', '1989-06-25', 'Panamá', 'tienda_tradicional', 'cabecera'],
    ['Farmacia VidaPlus', '830888999-4', 'Lucía Mora', 'Gerente', '1992-12-14', 'San José', 'minimercado', 'urbana']
  ].map((c, i) => ({
    id: i + 1, razonSocial: c[0], nombreComercial: c[0], nit: c[1], contacto: c[2], cargo: c[3],
    correo: `${c[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '.')}@beta-cliente${i + 1}.example`,
    telefono: `+50760000${String(201 + i).padStart(4, '0')}`, direccion: `Avenida ${5 + i} # ${12 + i}`, fechaCumpleanos: c[4], ciudad: c[5],
    tipologia: c[6], zona: c[7], canalDigital: true, estadoCuenta: 'activo', fechaRegistro: sumarDias(hoy, -(120 - i * 20))
  }));
  B.oportunidades = [
    ['Plan de soporte técnico anual', 1, 24000000, 'negociacion', 'Valeria Ortiz', 14],
    ['Auditoría de seguridad', 2, 6200000, 'propuesta', 'Valeria Ortiz', 18],
    ['Mantenimiento de flota de taller', 3, 3600000, 'nuevo', 'Valeria Ortiz', 40]
  ].map((o, i) => ({id: i + 1, titulo: o[0], clienteId: o[1], valorEstimado: o[2], etapa: o[3], probabilidadCierre: {nuevo: 10, propuesta: 55, negociacion: 75}[o[3]], responsable: o[4], fechaEstimadaCierre: sumarDias(hoy, o[5]), creada: sumarDias(hoy, -(20 - i * 4))}));
  B.interacciones = [
    {id: 1, clienteId: 1, canal: 'correo', tipo: 'cotizacion', resumen: 'Se envió propuesta del plan de soporte anual.', responsable: 'Valeria Ortiz', fechaHora: new Date(Date.now() - 5 * 86400000).toISOString()}
  ];
  B.tickets = [
    ['El servidor principal no responde', 1, 'alta', 'abierto', null, 5],
    ['Correo corporativo rechazado por el filtro', 2, 'media', 'en_curso', 'Mateo Salazar', 30]
  ].map((t, i) => {
    const creado = Date.now() - t[5] * 3600000;
    const historial = [{ts: new Date(creado).toISOString(), tipo: 'creado', autor: 'Sistema', detalle: 'Orden de soporte registrada'}];
    if (t[4]) historial.push({ts: new Date(creado + 1800000).toISOString(), tipo: 'asignado', autor: 'Sistema', detalle: `Asignada a ${t[4]}`});
    return {id: i + 1, asunto: t[0], clienteId: t[1], prioridad: t[2], estado: t[3], asignadoA: t[4], creado: new Date(creado).toISOString(), resuelto: null, facturaId: null, historial};
  });
  B.empleados = [
    ['Diego Rincón', '71222333', 'Director general', 'Dirección', 'indefinido', 8500000, '1984-04-04', -2200, 'diego.rincon@beta.test'],
    ['Valeria Ortiz', '1010444555', 'Ejecutiva de cuentas', 'Ventas', 'indefinido', 4100000, '1991-09-09', -800, 'valeria.ortiz@beta.test'],
    ['Mateo Salazar', '1017888999', 'Técnico de soporte', 'Soporte', 'fijo', 3000000, '1994-02-17', -300, 'mateo.salazar@beta.test']
  ].map((e, i) => ({id: i + 1, nombre: e[0], documento: e[1], cargo: e[2], area: e[3], contrato: e[4], salarioBase: e[5], fechaNacimiento: e[6], fechaIngreso: sumarDias(hoy, e[7]), correo: e[8], estado: 'activo'}));
  B.log('info', 'nucleo', 'Empresa demo "Comercial Beta" cargada con CRM, Servicios y Recursos Humanos activos', {modulos: empresa.modulos});
}

function reiniciar() {
  db.empresas.clear();
  db.datos.clear();
  db.usuarios = [];
  db.verificacion.clear();
  db.seguridad = [];
  usuariosDemo.length = 0;
  sembrarAlfa();
  sembrarBeta();
  registrarSeguridad('info', 'Base de datos multi-empresa reiniciada con las empresas demo Alfa y Beta', {empresas: Array.from(db.empresas.keys())});
}

reiniciar();

module.exports = {
  db, CATEGORIAS, CATALOGO_MODULOS, MODULOS_BASE, PASSWORD_DEMO, usuariosDemo,
  crearEmpresa, empresaPorId, permisosDelRol, rolDeEmpresa, datosDe, datosComo, moduloActivo, agregarUsuario, registrarSeguridad, registrarFactura,
  suscribir, publicar, reiniciar,
  fechaLocalISO, sumarDias, diasEntre, redondear, calcularTotales, generarCufe, generarQr, generarCodigoVerificacion
};
