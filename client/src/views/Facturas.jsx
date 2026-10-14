import React, {useState} from 'react';
import {QrCode, ShieldCheck} from 'lucide-react';
import {api} from '../api.js';
import {Aviso, Badge, Boton, Cargando, CabeceraVista, Campo, Card, CLASE_INPUT, EditorItems, ErrorVista, Filtros, FormularioModal, Modal, Tabla, cop, fecha, itemsAPayload, useCargar, useNexus} from '../components/ui.jsx';

const TONO_DESPACHO = {enviado: 'emerald', en_cola: 'amber', sin_canal: 'slate', pendiente: 'slate'};
const TEXTO_DESPACHO = {enviado: 'Enviado al cliente', en_cola: 'En cola (sin cuota)', sin_canal: 'Sin canal digital', pendiente: 'Pendiente'};

function ResultadoEfectos({efectos}) {
  return (
    <ul className="space-y-1.5 text-sm">
      {efectos.map((e, i) => (
        <li key={i} className="flex items-start gap-2"><Badge tono={e.estado === 'ok' ? 'emerald' : e.estado === 'omitido' ? 'amber' : 'rose'}>{e.estado}</Badge>
          <span className="text-slate-300"><b>{e.modulo}</b>{e.detalle && typeof e.detalle === 'object' ? <span className="text-slate-500"> · {JSON.stringify(e.detalle).slice(0, 140)}</span> : e.detalle ? <span className="text-slate-500"> · {e.detalle}</span> : null}</span></li>
      ))}
    </ul>
  );
}

function NuevaFactura({onCerrar}) {
  const {menu, notificar} = useNexus();
  const conInventario = menu.visibles.includes('cadena_suministro');
  const clientes = useCargar('/api/crm/clientes');
  const aceptadas = useCargar('/api/crm/cotizaciones?estado=aceptada');
  const productos = useCargar('/api/inventario/productos', {activo: conInventario});
  const [modo, setModo] = useState('directa');
  const [clienteId, setClienteId] = useState('');
  const [cotizacionId, setCotizacionId] = useState('');
  const [dias, setDias] = useState(30);
  const [items, setItems] = useState([{sku: '', descripcion: '', cantidad: 1, precioUnitario: 0, ivaPct: 19}]);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const sinFacturar = aceptadas.datos ? aceptadas.datos.cotizaciones.filter((c) => !c.facturada) : [];

  const guardar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const cuerpo = modo === 'cotizacion' ? {cotizacionId: Number(cotizacionId), diasCredito: Number(dias)} : {clienteId: Number(clienteId), diasCredito: Number(dias), items: itemsAPayload(items)};
    const r = await api('/api/finanzas/facturas', {metodo: 'POST', cuerpo});
    setEnviando(false);
    if (r.ok) {
      notificar('emerald', `Factura ${r.datos.factura.numero} emitida.`);
      setResultado(r.datos);
    } else setError(r.datos.mensaje);
  };

  if (resultado) {
    return (
      <Modal titulo={`Factura ${resultado.factura.numero} emitida`} onCerrar={() => onCerrar(true)}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-300">Total <b>{cop(resultado.factura.total)}</b>. El cliente puede comprobarla con el código QR de la factura.</p>
          <p className="text-slate-400">Efectos en los demás módulos de tu empresa:</p>
          <ResultadoEfectos efectos={resultado.efectos} />
          <div className="flex justify-end"><Boton variante="primario" onClick={() => onCerrar(true)}>Listo</Boton></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Nueva factura electrónica" onCerrar={() => onCerrar(false)} ancho="max-w-3xl">
      <form onSubmit={guardar} className="space-y-4">
        <Filtros valor={modo} onCambiar={setModo} opciones={[{valor: 'directa', texto: 'Venta directa'}, {valor: 'cotizacion', texto: 'Desde una cotización aceptada'}]} />
        {modo === 'cotizacion' ? (
          <Campo etiqueta="Cotización aceptada" ayuda={sinFacturar.length === 0 ? 'No hay cotizaciones aceptadas pendientes de facturar.' : undefined}>
            <select className={CLASE_INPUT} value={cotizacionId} onChange={(e) => setCotizacionId(e.target.value)} required>
              <option value="">Selecciona una cotización…</option>
              {sinFacturar.map((c) => <option key={c.id} value={c.id}>{c.numero} · {c.clienteNombre} · {cop(c.total)}</option>)}
            </select>
          </Campo>
        ) : (
          <>
            <Campo etiqueta="Cliente">
              <select className={CLASE_INPUT} value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
                <option value="">Selecciona un cliente…</option>
                {(clientes.datos ? clientes.datos.clientes : []).map((c) => <option key={c.id} value={c.id}>{c.razonSocial} · NIT {c.nit}</option>)}
              </select>
            </Campo>
            <EditorItems items={items} onCambiar={setItems} productos={conInventario && productos.datos ? productos.datos.productos : undefined} />
          </>
        )}
        <Campo etiqueta="Días de crédito"><input className={CLASE_INPUT} type="number" min="0" max="120" value={dias} onChange={(e) => setDias(e.target.value)} /></Campo>
        {conInventario && <p className="text-xs text-slate-500">Al emitir, el módulo Inventario descontará el stock automáticamente.</p>}
        {error && <Aviso tono="rose">{error}</Aviso>}
        <div className="flex justify-end gap-2"><Boton onClick={() => onCerrar(false)}>Cancelar</Boton><Boton variante="primario" type="submit" cargando={enviando}>Emitir factura</Boton></div>
      </form>
    </Modal>
  );
}

function Documento({id, onCerrar}) {
  const doc = useCargar(`/api/finanzas/facturas/${id}/documento`);
  const [verificacion, setVerificacion] = useState(null);
  const verificar = async () => {
    const r = await api(`/api/verificar/${doc.datos.codigoVerificacion}`, {conToken: false});
    setVerificacion(r);
  };
  return (
    <Modal titulo="Comprobante digital" onCerrar={onCerrar} ancho="max-w-2xl">
      {!doc.datos ? <Cargando /> : (
        <div className="space-y-4 text-sm">
          <div className="flex justify-between gap-3"><div><p className="text-lg font-semibold text-slate-100">{doc.datos.numero}</p><p className="text-slate-400">{doc.datos.tipo} · emitida {fecha(doc.datos.fechaEmision)} · vence {fecha(doc.datos.fechaVencimiento)}</p></div><QrCode className="h-10 w-10 text-slate-500" aria-hidden="true" /></div>
          <div className="grid gap-2 text-slate-300 md:grid-cols-2">
            <p><span className="text-slate-500">Emisor:</span> {doc.datos.emisor.razonSocial} (NIT {doc.datos.emisor.nit})</p>
            <p><span className="text-slate-500">Adquiriente:</span> {doc.datos.adquiriente ? `${doc.datos.adquiriente.razonSocial} (NIT ${doc.datos.adquiriente.nit})` : '—'}</p>
          </div>
          <Tabla claveFila={(i) => i.descripcion} columnas={[{titulo: 'Ítem', celda: (i) => i.descripcion}, {titulo: 'Cant.', derecha: true, celda: (i) => i.cantidad}, {titulo: 'Precio', derecha: true, celda: (i) => cop(i.precioUnitario)}, {titulo: 'IVA', derecha: true, celda: (i) => `${i.ivaPct} %`}]} filas={doc.datos.items} />
          <p className="text-right text-slate-300">Subtotal {cop(doc.datos.totales.subtotal)} · IVA {cop(doc.datos.totales.iva)} · <b className="text-slate-100">Total {cop(doc.datos.totales.total)}</b></p>
          <details className="text-xs"><summary className="cursor-pointer select-none text-slate-400">Contenido del código QR</summary><pre className="mt-1 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-400">{doc.datos.codigoQr}</pre></details>
          <details className="text-xs text-slate-500"><summary className="cursor-pointer select-none text-slate-400">Datos técnicos de la factura</summary><p className="mt-1 break-all">CUFE: {doc.datos.cufe}</p><p className="mt-1 break-all">Código de verificación: {doc.datos.codigoVerificacion}</p></details>
          <div className="flex items-center gap-3"><Boton onClick={verificar}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Verificar sin iniciar sesión</Boton><span className="text-xs text-slate-500">Cualquier persona puede comprobar la factura sin iniciar sesión.</span></div>
          {verificacion && <Aviso tono={verificacion.ok ? 'emerald' : 'rose'}>{verificacion.ok ? `Comprobante válido: ${verificacion.datos.numero} de ${verificacion.datos.emisor} por ${cop(verificacion.datos.total)} (${verificacion.datos.estadoPago}).` : verificacion.datos.mensaje}</Aviso>}
        </div>
      )}
    </Modal>
  );
}

export default function Facturas() {
  const {nivelDe, notificar} = useNexus();
  const puedeEscribir = nivelDe('finanzas') === 'rw';
  const [filtro, setFiltro] = useState('');
  const facturas = useCargar(`/api/finanzas/facturas${filtro ? `?estado=${filtro}` : ''}`);
  const [modal, setModal] = useState(null);
  const [efectos, setEfectos] = useState(null);

  if (facturas.error) return <ErrorVista error={facturas.error} />;

  return (
    <div>
      <CabeceraVista titulo="Facturas digitales" descripcion="Facturas electrónicas con código QR para que tu cliente pueda verificarlas. Cada emisión y cada pago sincronizan Inventario, Marketing y el Motor Analítico."
        accion={puedeEscribir ? <Boton variante="primario" onClick={() => setModal({tipo: 'nueva'})}>+ Nueva factura</Boton> : <Badge tono="amber">Solo lectura para tu rol</Badge>} />
      <Filtros valor={filtro} onCambiar={setFiltro} opciones={[{valor: '', texto: 'Todas'}, {valor: 'Pendiente', texto: 'Pendientes'}, {valor: 'Pagada', texto: 'Pagadas'}]} />
      {!facturas.datos ? <Cargando /> : (
        <Tabla vacio="No hay facturas todavía." columnas={[
          {titulo: 'Factura', celda: (f) => <div><p className="font-medium">{f.numero}</p><p className="text-xs text-slate-500">{fecha(f.fechaEmision)}</p></div>},
          {titulo: 'Cliente', celda: (f) => <div><p>{f.clienteNombre}</p><p className="text-xs text-slate-500">NIT {f.clienteNit}</p></div>},
          {titulo: 'Total', derecha: true, celda: (f) => cop(f.total)},
          {titulo: 'Vencimiento', celda: (f) => <div><p className="text-xs">{fecha(f.fechaVencimiento)}</p>{f.vencida && <Badge tono="rose">Vencida hace {f.diasVencida} d</Badge>}</div>},
          {titulo: 'Pago', celda: (f) => <Badge tono={f.estadoPago === 'Pagada' ? 'emerald' : 'amber'}>{f.estadoPago}</Badge>},
          {titulo: 'Comprobante', celda: (f) => <Badge tono={TONO_DESPACHO[f.despachoDigital] || 'slate'}>{TEXTO_DESPACHO[f.despachoDigital] || '—'}</Badge>},
          {titulo: '', celda: (f) => <div className="flex gap-1.5"><Boton pequeno onClick={() => setModal({tipo: 'documento', id: f.id})}>Ver</Boton>{puedeEscribir && f.estadoPago === 'Pendiente' && <Boton pequeno variante="exito" onClick={() => setModal({tipo: 'pagar', factura: f})}>Registrar pago</Boton>}</div>}
        ]} filas={facturas.datos.facturas} />
      )}
      {modal && modal.tipo === 'nueva' && <NuevaFactura onCerrar={(creada) => { setModal(null); if (creada) facturas.recargar(); }} />}
      {modal && modal.tipo === 'documento' && <Documento id={modal.id} onCerrar={() => setModal(null)} />}
      {modal && modal.tipo === 'pagar' && (
        <FormularioModal titulo={`Registrar pago de ${modal.factura.numero}`} descripcion={`Total ${cop(modal.factura.total)}. Al registrar el pago se actualizan las métricas del cliente y se envía la confirmación si Marketing está activo.`} textoGuardar="Confirmar pago"
          campos={[{nombre: 'metodoPago', etiqueta: 'Método de pago', tipo: 'select', opciones: ['transferencia', 'efectivo', 'tarjeta', 'pse'].map((m) => ({valor: m, texto: m})), defecto: 'transferencia'}, {nombre: 'referencia', etiqueta: 'Referencia del pago'}]}
          onGuardar={(v) => api(`/api/finanzas/facturas/${modal.factura.id}/pagar`, {metodo: 'POST', cuerpo: v})}
          onCerrar={(datos) => { setModal(null); if (datos) { facturas.recargar(); notificar('emerald', `Factura ${datos.factura.numero} pagada.`); setEfectos(datos); } }} />
      )}
      {efectos && (
        <Modal titulo={`Factura ${efectos.factura.numero} pagada`} onCerrar={() => setEfectos(null)}>
          <div className="space-y-3 text-sm"><p className="text-slate-400">Efectos del pago en los módulos de tu empresa:</p><ResultadoEfectos efectos={efectos.efectos} /><div className="flex justify-end"><Boton variante="primario" onClick={() => setEfectos(null)}>Listo</Boton></div></div>
        </Modal>
      )}
    </div>
  );
}
