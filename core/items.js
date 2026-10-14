'use strict';

const {moduloActivo} = require('./database');
const {ErrorHttp, invalido, v} = require('./http');

/* Valida los ítems de una cotización o factura. Si el módulo de Inventario está activo y el ítem
   trae SKU, aplica la reserva lógica: rechaza la venta cuando no hay existencias suficientes. */
function validarItems(datos, items, {registrarPreventa = false} = {}) {
  if (!Array.isArray(items) || items.length === 0) throw invalido('items', 'debe incluir al menos un ítem');
  if (items.length > 30) throw invalido('items', 'se admiten máximo 30 ítems');
  const inventarioActivo = moduloActivo(datos, 'cadena_suministro');
  if (registrarPreventa) datos.contadores.preventas += 1;
  const solicitado = {};
  return items.map((item, i) => {
    const campo = `items[${i}]`;
    const it = item || {};
    const sku = v.texto(it.sku, `${campo}.sku`, {max: 30, opcional: true});
    const cantidad = v.entero(it.cantidad, `${campo}.cantidad`, {min: 1, max: 100000});
    let descripcion = v.texto(it.descripcion, `${campo}.descripcion`, {max: 160, opcional: true});
    let precio = v.numero(it.precioUnitario, `${campo}.precioUnitario`, {min: 0, opcional: true});
    let ivaPct = v.numero(it.ivaPct, `${campo}.ivaPct`, {min: 0, max: 100, opcional: true});

    if (sku && inventarioActivo) {
      const producto = datos.productos.find((p) => p.sku === sku);
      if (!producto) throw new ErrorHttp(422, 'SKU_DESCONOCIDO', `${campo}: el SKU ${sku} no existe en el inventario`, {sku});
      descripcion = descripcion || producto.nombre;
      if (precio === undefined) precio = producto.precioUnitario;
      if (ivaPct === undefined) ivaPct = producto.ivaPct;
      solicitado[sku] = (solicitado[sku] || 0) + cantidad;
      if (solicitado[sku] > producto.stock) {
        if (registrarPreventa) datos.contadores.quiebres += 1;
        datos.log('warn', 'cadena_suministro', `Reserva lógica rechazada: ${producto.sku} tiene ${producto.stock} unidades y se piden ${solicitado[sku]}. Se evita la sobreventa`, {sku, disponible: producto.stock, solicitado: solicitado[sku]});
        throw new ErrorHttp(409, 'STOCK_INSUFICIENTE', `Stock insuficiente de ${producto.nombre}: hay ${producto.stock} y se piden ${solicitado[sku]}`, {sku, disponible: producto.stock, solicitado: solicitado[sku]});
      }
    }
    if (!descripcion) throw invalido(`${campo}.descripcion`, 'es obligatorio cuando el ítem no tiene un SKU del inventario');
    if (precio === undefined) throw invalido(`${campo}.precioUnitario`, 'es obligatorio');
    return {sku: sku || null, descripcion, cantidad, precioUnitario: precio, ivaPct: ivaPct === undefined ? 19 : ivaPct};
  });
}

module.exports = {validarItems};
