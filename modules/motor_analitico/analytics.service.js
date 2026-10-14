'use strict';

const {fechaLocalISO, diasEntre} = require('../../core/database');
const {cupoDisponible} = require('../../core/mensajeria');

const CLASES = ['AAA', 'AA', 'A', 'B', 'C'];

const redondear4 = (x) => Math.floor(x * 1e4 + 0.5) / 1e4;
const acotar = (x) => Math.min(1, Math.max(0, x));
const minMax = (x, lo, hi) => (hi === lo ? 0.5 : acotar((x - lo) / (hi - lo)));

/* Clasificación AAA, AA, A, B o C a partir del Score_i (ver documento, sección 4.2) */
function clasificar(score, frecuencia, semanasConCompra, umbrales) {
  if (semanasConCompra === 0) return 'C';
  if (score >= umbrales.aaa && frecuencia >= umbrales.frecuenciaMinAaa) return 'AAA';
  if (score >= umbrales.aa) return 'AA';
  if (score >= umbrales.a) return 'A';
  if (score >= umbrales.b) return 'B';
  return 'C';
}

/* Una compra efectiva es una factura con recaudo confirmado (estado Pagada) */
function comprasPorCliente(datos) {
  const mapa = new Map();
  for (const f of datos.facturas) {
    if (f.estadoPago !== 'Pagada' || !f.fechaPago) continue;
    if (!mapa.has(f.clienteId)) mapa.set(f.clienteId, []);
    mapa.get(f.clienteId).push(f);
  }
  return mapa;
}

/*  Score_i = wRFM * Score_RFM + wGeo * G_i
    Score_RFM = wR * R + wF * F + wM * M
    R: recencia normalizada (1 = compra más reciente), F: semanas con compra / ventana, M: ticket promedio normalizado.
    Las métricas de LTV, retención e inactividad completan la ficha MetricasCliente del documento. */
function calcularMetricas(datos, hoy = fechaLocalISO()) {
  const cfg = datos.config.analitico;
  const compras = comprasPorCliente(datos);
  const base = datos.clientes.filter((c) => c.estadoCuenta === 'activo').map((cliente) => {
    const lista = compras.get(cliente.id) || [];
    if (!lista.length) return {cliente, tiene: false, semanas: 0, ltv: 0, compras: 0, retencion: 0};
    const dias = lista.map((f) => diasEntre(f.fechaPago, hoy));
    const total = lista.reduce((s, f) => s + f.total, 0);
    return {
      cliente,
      tiene: true,
      recencia: Math.min(...dias),
      ticket: total / lista.length,
      semanas: new Set(dias.filter((d) => d < cfg.ventanaSemanas * 7).map((d) => Math.floor(d / 7))).size,
      ltv: total,
      compras: lista.length,
      retencion: [0, 1, 2].filter((k) => dias.some((d) => d >= k * 30 && d < (k + 1) * 30)).length / 3
    };
  });
  const con = base.filter((b) => b.tiene);
  const rMin = Math.min(...con.map((b) => b.recencia));
  const rMax = Math.max(...con.map((b) => b.recencia));
  const mMin = Math.min(...con.map((b) => b.ticket));
  const mMax = Math.max(...con.map((b) => b.ticket));

  return base.map((b) => {
    const r = b.tiene ? redondear4(1 - minMax(b.recencia, rMin, rMax)) : 0;
    const f = redondear4(acotar(b.semanas / cfg.ventanaSemanas));
    const m = b.tiene ? redondear4(minMax(b.ticket, mMin, mMax)) : 0;
    const scoreRfm = redondear4(cfg.wR * r + cfg.wF * f + cfg.wM * m);
    const g = cfg.geo[b.cliente.zona] === undefined ? 0.6 : cfg.geo[b.cliente.zona];
    const score = redondear4(cfg.wRFM * scoreRfm + cfg.wGeo * g);
    const clase = clasificar(score, f, b.semanas, cfg.umbrales);
    return {
      clienteId: b.cliente.id,
      razonSocial: b.cliente.razonSocial,
      tipologia: b.cliente.tipologia,
      zona: b.cliente.zona,
      canalDigital: b.cliente.canalDigital,
      recenciaNorm: r,
      frecuenciaNorm: f,
      montoNorm: m,
      scoreRfm,
      factorGeo: g,
      score,
      clase,
      segmentoComercial: clase,
      diasUltimaCompra: b.tiene ? b.recencia : null,
      diasInactividad: b.tiene ? b.recencia : null,
      semanasConCompra: b.semanas,
      comprasEfectivas: b.compras,
      ticketPromedio: b.tiene ? Math.round(b.ticket) : 0,
      ltv: Math.round(b.ltv),
      tasaRetencion: redondear4(b.retencion)
    };
  });
}

function metricasDeCliente(datos, clienteId) {
  return calcularMetricas(datos).find((m) => m.clienteId === clienteId) || null;
}

/* Comisiones: solo se generan sobre el recaudo efectivo, no sobre la cartera impaga */
function comisiones(datos) {
  const pct = datos.config.analitico.comisionPct;
  const porVendedor = new Map();
  for (const f of datos.facturas) {
    const v = f.vendedor || 'Sin asignar';
    if (!porVendedor.has(v)) porVendedor.set(v, {vendedor: v, facturado: 0, recaudado: 0, pendienteRecaudo: 0});
    const fila = porVendedor.get(v);
    fila.facturado += f.total;
    if (f.estadoPago === 'Pagada') fila.recaudado += f.total;
    else fila.pendienteRecaudo += f.total;
  }
  const filas = Array.from(porVendedor.values()).map((x) => ({
    ...x,
    comisionPct: pct,
    comisionGenerada: Math.round(x.recaudado * pct / 100),
    comisionRetenida: Math.round(x.pendienteRecaudo * pct / 100)
  }));
  return {comisionPct: pct, vendedores: filas.sort((a, b) => b.recaudado - a.recaudado)};
}

/* Indicadores de desempeño de la Tabla 5 del documento (evaluación de impacto) */
function indicadores(datos) {
  const activos = datos.clientes.filter((c) => c.estadoCuenta === 'activo');
  const conCanal = activos.filter((c) => c.canalDigital).length;
  const facturas = datos.facturas;
  const digitales = facturas.filter((f) => f.codigoVerificacion && f.qr).length;
  const tiempos = facturas.map((f) => f.emisionMs).filter((t) => typeof t === 'number');
  const medioMs = tiempos.length ? tiempos.reduce((s, t) => s + t, 0) / tiempos.length : 0;
  const maxMs = tiempos.length ? Math.max(...tiempos) : 0;
  const {preventas, quiebres} = datos.contadores;
  const total = facturas.reduce((s, f) => s + f.total, 0);
  const recaudado = facturas.filter((f) => f.estadoPago === 'Pagada').reduce((s, f) => s + f.total, 0);
  const metricas = calcularMetricas(datos);
  const porClase = Object.fromEntries(CLASES.map((k) => [k, metricas.filter((m) => m.clase === k).length]));
  const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
  const tasaQuiebres = pct(quiebres, preventas);
  return {
    difusionComercial: {indicador: 'Clientes con canal digital validado', clientesActivos: activos.length, clientesConCanal: conCanal, porcentaje: pct(conCanal, activos.length), meta: 100},
    gestionDocumental: {indicador: 'Facturas digitales con código QR', facturasEmitidas: facturas.length, facturasDigitales: digitales, porcentaje: facturas.length ? pct(digitales, facturas.length) : 0, hojasEvitadas: digitales, meta: 100},
    eficienciaProcesos: {indicador: 'Tiempo de emisión de la factura digital', tiempoMedioSeg: Math.round(medioMs) / 1000, tiempoMaxSeg: Math.round(maxMs) / 1000, metaSeg: 10, cumpleMeta: tiempos.length > 0 && maxMs < 10000},
    sincronizacionStock: {indicador: 'Quiebres de inventario en preventa', preventas, quiebres, tasaPorcentaje: tasaQuiebres, metaPorcentaje: 1.5, cumpleMeta: preventas > 0 && tasaQuiebres < 1.5},
    gestionFinanciera: {indicador: 'Comisiones calculadas sobre recaudo efectivo', totalFacturado: total, totalRecaudado: recaudado, porcentajeRecaudo: pct(recaudado, total), comisionPct: datos.config.analitico.comisionPct, comisionesGeneradas: Math.round(recaudado * datos.config.analitico.comisionPct / 100)},
    segmentacion: {porClase, ltvTotal: metricas.reduce((s, m) => s + m.ltv, 0), retencionPromedio: metricas.length ? redondear4(metricas.reduce((s, m) => s + m.tasaRetencion, 0) / metricas.length) : 0}
  };
}

/* Asignación diaria bajo cuota (equivalente al MILP del documento para un periodo):
     max  alpha * sum(w_it) + beta * sum(Score_i * z_ict)
     R1 facturas + promociones <= Cap     R2 w <= delta * phi     R3 z <= phi * b
     R4 una promoción por cliente en el ciclo     R6 tope de promociones por cliente y día (extensión)
   Como alpha > beta y Score <= 1, el cupo de las facturas se reserva primero; el remanente se reparte por Score.
   Con R1 y R6 el problema es la intersección de dos matroides, por lo que el orden voraz por Score es óptimo. */
function planificarEnvios({clientes, campanas, facturasPorDespachar, yaEnviados = new Set(), cap, topePorCliente = null, alpha = 100, beta = 1}) {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const excluidasPorR2 = [];
  const elegiblesFactura = [];
  for (const f of facturasPorDespachar) {
    const c = porId.get(f.clienteId);
    if (!c || !c.canalDigital) {
      excluidasPorR2.push({facturaId: f.facturaId, clienteId: f.clienteId, motivo: 'Sin canal digital validado (phi = 0)'});
    } else {
      elegiblesFactura.push({...f, score: c.score});
    }
  }
  elegiblesFactura.sort((a, b) => b.score - a.score || a.facturaId - b.facturaId);
  const facturas = elegiblesFactura.slice(0, Math.max(0, cap));
  let restante = Math.max(0, cap) - facturas.length;

  const pertinente = (c, camp) =>
    (!camp.tipologias.length || camp.tipologias.includes(c.tipologia)) &&
    (!camp.zonas.length || camp.zonas.includes(c.zona)) &&
    (!camp.clases.length || camp.clases.includes(c.clase));
  const pares = [];
  for (const c of clientes) {
    if (!c.canalDigital) continue;
    for (const camp of campanas) {
      if (pertinente(c, camp) && !yaEnviados.has(`${c.id}-${camp.id}`)) pares.push({clienteId: c.id, campanaId: camp.id, score: c.score});
    }
  }
  pares.sort((a, b) => b.score - a.score || a.clienteId - b.clienteId || a.campanaId - b.campanaId);
  const promociones = [];
  const porCliente = {};
  let sinCupo = 0;
  for (const par of pares) {
    const usados = porCliente[par.clienteId] || 0;
    if (restante > 0 && (topePorCliente === null || usados < topePorCliente)) {
      promociones.push(par);
      porCliente[par.clienteId] = usados + 1;
      restante -= 1;
    } else if (restante === 0) {
      sinCupo += 1;
    }
  }
  const objetivo = alpha * facturas.length + beta * promociones.reduce((s, p) => s + p.score, 0);
  return {
    cap,
    facturas,
    promociones,
    excluidasPorR2,
    candidatas: pares.length,
    sinCupo,
    cupoLibre: restante,
    objetivo: Math.round(objetivo * 10000) / 10000
  };
}

/* Arma las entradas del planificador con el estado real de la empresa: clientes con su Score, cotizaciones
   aceptadas que aún no tienen factura (facturas por despachar), campañas y promociones ya enviadas (R4). */
function contextoPlanificacion(datos, campanas) {
  const facturadas = new Set(datos.facturas.map((f) => f.cotizacionId).filter(Boolean));
  const metricas = calcularMetricas(datos);
  return {
    clientes: metricas.map((m) => ({id: m.clienteId, score: m.score, clase: m.clase, canalDigital: m.canalDigital, tipologia: m.tipologia, zona: m.zona, razonSocial: m.razonSocial})),
    campanas,
    facturasPorDespachar: datos.cotizaciones.filter((c) => c.estado === 'aceptada' && !facturadas.has(c.id)).map((c) => ({facturaId: c.id, clienteId: c.clienteId, numero: c.numero})),
    yaEnviados: new Set(datos.mensajes.filter((m) => m.tipo === 'promocion' && m.campanaId).map((m) => `${m.clienteId}-${m.campanaId}`)),
    cap: cupoDisponible(datos),
    topePorCliente: datos.config.marketing.topePorCliente,
    alpha: datos.config.analitico.alpha,
    beta: datos.config.analitico.beta
  };
}

module.exports = {CLASES, clasificar, calcularMetricas, metricasDeCliente, comisiones, indicadores, planificarEnvios, contextoPlanificacion};
