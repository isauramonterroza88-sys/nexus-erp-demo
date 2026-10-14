import React, {useState} from 'react';
import {api} from '../api.js';
import {Aviso, Badge, Boton, Cargando, CabeceraVista, Campo, CLASE_INPUT, EditorItems, ErrorVista, Filtros, Modal, Tabla, cop, fecha, itemsAPayload, useCargar, useNexus} from '../components/ui.jsx';

const TONO = {borrador: 'slate', enviada: 'sky', aceptada: 'emerald', rechazada: 'rose'};

function NuevaCotizacion({onCerrar}) {
  const {menu, notificar} = useNexus();
  const oportunidades = useCargar('/api/crm/oportunidades');
  const conInventario = menu.visibles.includes('cadena_suministro');
  const productos = useCargar('/api/inventario/productos', {activo: conInventario});
  const [oportunidadId, setOportunidadId] = useState('');
  const [dias, setDias] = useState(15);
  const [items, setItems] = useState([{sku: '', descripcion: '', cantidad: 1, precioUnitario: 0, ivaPct: 19}]);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const abiertas = oportunidades.datos ? oportunidades.datos.oportunidades.filter((o) => o.etapa !== 'perdido') : [];
  const guardar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const r = await api('/api/crm/cotizaciones', {metodo: 'POST', cuerpo: {oportunidadId: Number(oportunidadId), diasVigencia: Number(dias), items: itemsAPayload(items)}});
    setEnviando(false);
    if (r.ok) {
      notificar('emerald', `Cotización ${r.datos.cotizacion.numero} creada con reserva lógica de stock.`);
      onCerrar(true);
    } else setError(r.datos.mensaje);
  };

  return (
    <Modal titulo="Nueva cotización" onCerrar={() => onCerrar(false)} ancho="max-w-3xl">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Campo etiqueta="Oportunidad" className="md:col-span-2">
            <select className={CLASE_INPUT} value={oportunidadId} onChange={(e) => setOportunidadId(e.target.value)} required>
              <option value="">Selecciona una oportunidad…</option>
              {abiertas.map((o) => <option key={o.id} value={o.id}>{o.titulo} · {o.clienteNombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Vigencia (días)"><input className={CLASE_INPUT} type="number" min="1" max="180" value={dias} onChange={(e) => setDias(e.target.value)} /></Campo>
        </div>
        <EditorItems items={items} onCambiar={setItems} productos={conInventario && productos.datos ? productos.datos.productos : undefined} />
        {conInventario && <p className="text-xs text-slate-500">Con el módulo Inventario activo, al cotizar se verifica la existencia de stock (reserva lógica) para evitar sobreventas.</p>}
        {error && <Aviso tono="rose">{error}</Aviso>}
        <div className="flex justify-end gap-2"><Boton onClick={() => onCerrar(false)}>Cancelar</Boton><Boton variante="primario" type="submit" cargando={enviando}>Crear cotización</Boton></div>
      </form>
    </Modal>
  );
}

export default function Cotizaciones() {
  const {nivelDe, menu, notificar} = useNexus();
  const puedeEscribir = nivelDe('ventas_crm') === 'rw';
  const puedeFacturar = nivelDe('finanzas') === 'rw';
  const [filtro, setFiltro] = useState('');
  const cotizaciones = useCargar(`/api/crm/cotizaciones${filtro ? `?estado=${filtro}` : ''}`);
  const [nueva, setNueva] = useState(false);
  const [ocupado, setOcupado] = useState(null);

  if (cotizaciones.error) return <ErrorVista error={cotizaciones.error} />;

  const cambiar = async (c, estado) => {
    setOcupado(c.id);
    const r = await api(`/api/crm/cotizaciones/${c.id}/estado`, {metodo: 'PATCH', cuerpo: {estado}});
    if (r.ok) notificar('emerald', `Cotización ${c.numero}: ${estado}.`);
    else notificar('rose', r.datos.mensaje);
    setOcupado(null);
    cotizaciones.recargar();
  };

  const facturar = async (c) => {
    setOcupado(c.id);
    const r = await api('/api/finanzas/facturas', {metodo: 'POST', cuerpo: {cotizacionId: c.id}});
    if (r.ok) notificar('emerald', `Factura ${r.datos.factura.numero} emitida. Stock, comprobante digital y métricas sincronizados.`);
    else notificar('rose', r.datos.mensaje);
    setOcupado(null);
    cotizaciones.recargar();
  };

  return (
    <div>
      <CabeceraVista titulo="Cotizaciones" descripcion="Propuestas comerciales con cálculo tributario. Una cotización aceptada cierra la oportunidad como ganada y puede facturarse."
        accion={puedeEscribir ? <Boton variante="primario" onClick={() => setNueva(true)}>+ Nueva cotización</Boton> : <Badge tono="amber">Solo lectura para tu rol</Badge>} />
      <Filtros valor={filtro} onCambiar={setFiltro} opciones={[{valor: '', texto: 'Todas'}, {valor: 'borrador', texto: 'Borrador'}, {valor: 'enviada', texto: 'Enviadas'}, {valor: 'aceptada', texto: 'Aceptadas'}, {valor: 'rechazada', texto: 'Rechazadas'}]} />
      {!cotizaciones.datos ? <Cargando /> : (
        <Tabla vacio="No hay cotizaciones en este estado." columnas={[
          {titulo: 'Número', celda: (c) => <div><p className="font-medium">{c.numero}</p><p className="text-xs text-slate-500">{fecha(c.fechaEmision)} · vence {fecha(c.fechaVencimiento)}</p></div>},
          {titulo: 'Cliente y oportunidad', celda: (c) => <div><p>{c.clienteNombre}</p><p className="text-xs text-slate-500">{c.oportunidadTitulo}</p></div>},
          {titulo: 'Ítems', celda: (c) => <span className="text-xs text-slate-400">{c.items.map((i) => `${i.cantidad} × ${i.descripcion}`).join('; ')}</span>},
          {titulo: 'Total', derecha: true, celda: (c) => cop(c.total)},
          {titulo: 'Estado', celda: (c) => <div className="flex flex-wrap gap-1"><Badge tono={TONO[c.estado]}>{c.estado}</Badge>{c.facturada && <Badge tono="violet">Facturada</Badge>}</div>},
          {titulo: 'Acciones', celda: (c) => (
            <div className="flex flex-wrap gap-1.5">
              {puedeEscribir && c.estado === 'borrador' && <Boton pequeno variante="primario" disabled={ocupado === c.id} onClick={() => cambiar(c, 'enviada')}>Enviar</Boton>}
              {puedeEscribir && c.estado === 'enviada' && (<><Boton pequeno variante="exito" disabled={ocupado === c.id} onClick={() => cambiar(c, 'aceptada')}>Aceptada</Boton><Boton pequeno variante="peligro" disabled={ocupado === c.id} onClick={() => cambiar(c, 'rechazada')}>Rechazada</Boton></>)}
              {c.estado === 'aceptada' && !c.facturada && puedeFacturar && <Boton pequeno variante="primario" disabled={ocupado === c.id} onClick={() => facturar(c)}>Facturar</Boton>}
              {c.estado === 'aceptada' && !c.facturada && !menu.visibles.includes('finanzas') && <span className="text-xs text-slate-500">Activa Facturación para facturar</span>}
            </div>)}
        ]} filas={cotizaciones.datos.cotizaciones} />
      )}
      {nueva && <NuevaCotizacion onCerrar={(creada) => { setNueva(false); if (creada) cotizaciones.recargar(); }} />}
    </div>
  );
}
