import React, {useState} from 'react';
import {api} from '../api.js';
import {Badge, Boton, CabeceraVista, Cargando, Campo, CLASE_INPUT, ErrorVista, Filtros, FormularioModal, Kpi, Modal, Tabla, fechaHora, useCargar, useNexus} from '../components/ui.jsx';

const TONO_PRIORIDAD = {alta: 'rose', media: 'amber', baja: 'slate'};
const TONO_ESTADO = {abierto: 'rose', en_curso: 'amber', resuelto: 'emerald'};

function Detalle({id, puedeEscribir, onCerrar, onCambio}) {
  const ticket = useCargar(`/api/servicios/tickets/${id}`);
  const {notificar} = useNexus();
  const [comentario, setComentario] = useState('');
  const t = ticket.datos && ticket.datos.ticket;

  const accion = async (ruta, cuerpo, metodo = 'POST') => {
    const r = await api(`/api/servicios/tickets/${id}/${ruta}`, {metodo, cuerpo});
    if (r.ok) { ticket.recargar(); onCambio(); } else notificar('rose', r.datos.mensaje);
    return r;
  };

  return (
    <Modal titulo={t ? `Orden de soporte #${t.id}` : 'Orden de soporte'} onCerrar={onCerrar} ancho="max-w-2xl">
      {!t ? <Cargando /> : (
        <div className="space-y-4 text-sm">
          <div><p className="text-base font-semibold text-slate-100">{t.asunto}</p><p className="text-slate-400">{t.clienteNombre} · creada {fechaHora(t.creado)}{t.facturaId ? ` · posventa de la factura ${t.facturaId}` : ''}</p></div>
          <div className="flex flex-wrap gap-2">
            <Badge tono={TONO_PRIORIDAD[t.prioridad]}>Prioridad {t.prioridad}</Badge><Badge tono={TONO_ESTADO[t.estado]}>{t.estado.replace('_', ' ')}</Badge>
            <Badge tono={t.estado === 'resuelto' ? (t.cumpleSla ? 'emerald' : 'rose') : t.slaVencido ? 'rose' : 'sky'}>{t.estado === 'resuelto' ? (t.cumpleSla ? 'Resuelta dentro del SLA' : 'Resuelta fuera del SLA') : t.slaVencido ? `SLA vencido hace ${Math.abs(Math.round(t.horasRestantes))} h` : `Quedan ${Math.round(t.horasRestantes)} h de ${t.slaHoras} h`}</Badge>
            <Badge>{t.asignadoA ? `Asignada a ${t.asignadoA}` : 'Sin asignar'}</Badge>
          </div>
          {puedeEscribir && (
            <div className="flex flex-wrap gap-2">
              {!t.asignadoA && <Boton pequeno variante="primario" onClick={() => accion('asignar', {})}>Tomar la orden</Boton>}
              {t.estado !== 'en_curso' && <Boton pequeno onClick={() => accion('estado', {estado: 'en_curso'}, 'PATCH')}>Marcar en curso</Boton>}
              {t.estado !== 'resuelto' && <Boton pequeno variante="exito" onClick={() => accion('estado', {estado: 'resuelto'}, 'PATCH')}>Marcar resuelta</Boton>}
              {t.estado === 'resuelto' && <Boton pequeno onClick={() => accion('estado', {estado: 'abierto'}, 'PATCH')}>Reabrir</Boton>}
            </div>
          )}
          <div>
            <p className="mb-2 font-semibold text-slate-200">Trazabilidad de la postventa</p>
            <ol className="space-y-2 border-l border-slate-700 pl-4">
              {t.historial.map((h, i) => <li key={i}><p className="text-xs text-slate-500">{fechaHora(h.ts)} · {h.tipo} · {h.autor}</p><p className="text-slate-200">{h.detalle}</p></li>)}
            </ol>
          </div>
          {puedeEscribir && (
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await accion('comentarios', {texto: comentario}); if (r.ok) setComentario(''); }}>
              <input className={CLASE_INPUT} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Agregar un comentario a la orden" required />
              <Boton type="submit" variante="primario">Comentar</Boton>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Tickets() {
  const {nivelDe, notificar, menu} = useNexus();
  const puedeEscribir = nivelDe('servicios') === 'rw';
  const [estado, setEstado] = useState('');
  const tickets = useCargar(`/api/servicios/tickets${estado ? `?estado=${estado}` : ''}`, {intervalo: 8000});
  const resumen = useCargar('/api/servicios/resumen');
  const clientes = useCargar('/api/crm/clientes', {activo: menu.visibles.includes('ventas_crm')});
  const [modal, setModal] = useState(null);

  if (tickets.error) return <ErrorVista error={tickets.error} />;
  const refrescar = () => { tickets.recargar(); resumen.recargar(); };

  return (
    <div>
      <CabeceraVista titulo="Órdenes de soporte" descripcion="Atención postventa con plazos (SLA) según la prioridad: alta 24 h, media 3 días, baja 7 días. Cada orden conserva su historial completo."
        accion={puedeEscribir ? <Boton variante="primario" onClick={() => setModal({tipo: 'nueva'})}>+ Nueva orden</Boton> : <Badge tono="amber">Solo lectura para tu rol</Badge>} />
      {resumen.datos && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi etiqueta="Abiertas" valor={resumen.datos.porEstado.abierto} tono="rose" /><Kpi etiqueta="En curso" valor={resumen.datos.porEstado.en_curso} tono="amber" />
          <Kpi etiqueta="SLA vencidos" valor={resumen.datos.slaVencidos} tono={resumen.datos.slaVencidos ? 'rose' : 'emerald'} /><Kpi etiqueta="Cumplimiento SLA" valor={resumen.datos.cumplimientoSla === null ? 'Sin datos' : `${resumen.datos.cumplimientoSla} %`} tono="emerald" />
        </div>
      )}
      <Filtros valor={estado} onCambiar={setEstado} opciones={[{valor: '', texto: 'Todas'}, {valor: 'abierto', texto: 'Abiertas'}, {valor: 'en_curso', texto: 'En curso'}, {valor: 'resuelto', texto: 'Resueltas'}]} />
      {!tickets.datos ? <Cargando /> : (
        <Tabla vacio="No hay órdenes de soporte en este estado." columnas={[
          {titulo: 'Orden', celda: (t) => <div><p className="font-medium">#{t.id} · {t.asunto}</p><p className="text-xs text-slate-500">{t.clienteNombre}</p></div>},
          {titulo: 'Prioridad', celda: (t) => <Badge tono={TONO_PRIORIDAD[t.prioridad]}>{t.prioridad}</Badge>},
          {titulo: 'Estado', celda: (t) => <Badge tono={TONO_ESTADO[t.estado]}>{t.estado.replace('_', ' ')}</Badge>},
          {titulo: 'SLA', celda: (t) => (t.estado === 'resuelto' ? <Badge tono={t.cumpleSla ? 'emerald' : 'rose'}>{t.cumpleSla ? 'Cumplido' : 'Incumplido'}</Badge> : <Badge tono={t.slaVencido ? 'rose' : 'sky'}>{t.slaVencido ? `Vencido ${Math.abs(Math.round(t.horasRestantes))} h` : `${Math.round(t.horasRestantes)} h restantes`}</Badge>)},
          {titulo: 'Responsable', celda: (t) => t.asignadoA || <span className="text-slate-500">Sin asignar</span>},
          {titulo: '', celda: (t) => <Boton pequeno onClick={() => setModal({tipo: 'detalle', id: t.id})}>Abrir</Boton>}
        ]} filas={tickets.datos.tickets} />
      )}
      {modal && modal.tipo === 'detalle' && <Detalle id={modal.id} puedeEscribir={puedeEscribir} onCerrar={() => setModal(null)} onCambio={refrescar} />}
      {modal && modal.tipo === 'nueva' && (
        <FormularioModal titulo="Nueva orden de soporte" textoGuardar="Crear orden" campos={[
          {nombre: 'clienteId', etiqueta: 'Cliente', tipo: 'select', numerico: true, requerido: true, vacio: 'Selecciona un cliente…', opciones: (clientes.datos ? clientes.datos.clientes : []).map((c) => ({valor: c.id, texto: c.razonSocial}))},
          {nombre: 'asunto', etiqueta: 'Asunto', requerido: true}, {nombre: 'prioridad', etiqueta: 'Prioridad', tipo: 'select', defecto: 'media', opciones: [{valor: 'alta', texto: 'Alta (24 h)'}, {valor: 'media', texto: 'Media (3 días)'}, {valor: 'baja', texto: 'Baja (7 días)'}]},
          {nombre: 'facturaId', etiqueta: 'Número interno de la factura (opcional)', tipo: 'number', min: 1, ayuda: 'Vincula la orden a una factura del cliente para la trazabilidad postventa.'}]}
          onGuardar={(v) => api('/api/servicios/tickets', {metodo: 'POST', cuerpo: v})}
          onCerrar={(datos) => { setModal(null); if (datos) { refrescar(); notificar('emerald', 'Orden creada.'); } }} />
      )}
    </div>
  );
}
