import React, {useState} from 'react';
import {api} from '../api.js';
import {Aviso, Badge, Boton, Card, CabeceraVista, Cargando, ErrorVista, FormularioModal, Kpi, Modal, Tabla, TONO_CLASE, TIPOLOGIAS, ZONAS, fechaHora, useCargar, useNexus} from '../components/ui.jsx';

const CLASES = ['AAA', 'AA', 'A', 'B', 'C'].map((c) => ({valor: c, texto: `Clase ${c}`}));

export default function Campanas() {
  const {nivelDe, notificar} = useNexus();
  const puedeEscribir = nivelDe('marketing') === 'rw';
  const segmentos = useCargar('/api/marketing/segmentos');
  const campanas = useCargar('/api/marketing/campanas');
  const cuota = useCargar('/api/marketing/cuota', {intervalo: 4000});
  const mensajes = useCargar('/api/marketing/mensajes?limite=25', {intervalo: 4000});
  const [modal, setModal] = useState(null);
  const [ejecutando, setEjecutando] = useState(null);

  if (campanas.error) return <ErrorVista error={campanas.error} />;
  if (!campanas.datos || !segmentos.datos || !cuota.datos) return <Cargando />;
  const q = cuota.datos.cuota;
  const s = segmentos.datos;

  const refrescar = () => { campanas.recargar(); cuota.recargar(); mensajes.recargar(); segmentos.recargar(); };

  const ejecutar = async (campana) => {
    setEjecutando(campana.id);
    const r = await api(`/api/marketing/campanas/${campana.id}/ejecutar`, {metodo: 'POST', cuerpo: {}});
    setEjecutando(null);
    if (r.ok) setModal({tipo: 'resultado', datos: r.datos});
    else notificar('rose', r.datos.mensaje);
    refrescar();
  };

  const cerrar = async (campana) => {
    const r = await api(`/api/marketing/campanas/${campana.id}/cerrar`, {metodo: 'POST', cuerpo: {}});
    if (r.ok) notificar('emerald', 'Campaña cerrada.');
    refrescar();
  };

  return (
    <div>
      <CabeceraVista titulo="Campañas y segmentos" descripcion="Campañas dirigidas por clase RFM, tipología y zona. Cada envío usa la cuota diaria: primero se reserva el cupo de las facturas y el resto se reparte entre los clientes de mayor Score."
        accion={puedeEscribir ? <Boton variante="primario" onClick={() => setModal({tipo: 'nueva'})}>+ Nueva campaña</Boton> : <Badge tono="amber">Solo lectura para tu rol</Badge>} />
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card titulo="Cuota diaria de mensajes" accion={puedeEscribir && <Boton pequeno onClick={() => setModal({tipo: 'cuota'})}>Ajustar</Boton>}>
          <p className="text-3xl font-semibold text-slate-100">{q.usadoHoy}<span className="text-lg text-slate-500"> / {q.capDiaria}</span></p>
          <div className="my-3 flex h-3 overflow-hidden rounded-full bg-slate-800" role="img" aria-label="Uso de la cuota">
            <div className="bg-sky-500" style={{width: `${q.usadoFacturas / q.capDiaria * 100}%`}} title="Facturas" />
            <div className="bg-emerald-500" style={{width: `${q.usadoPromociones / q.capDiaria * 100}%`}} title="Promociones" />
          </div>
          <ul className="space-y-1 text-xs text-slate-400">
            <li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />Facturas enviadas hoy: {q.usadoFacturas}</li>
            <li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Promociones y confirmaciones: {q.usadoPromociones}</li>
            <li>Reservado para facturas por despachar: <b className="text-slate-200">{q.reservadoParaFacturas}</b></li>
            <li>Disponible: <b className="text-slate-200">{q.disponible}</b></li>
          </ul>
        </Card>
        <Card titulo="Segmentación de clientes" subtitulo={`${s.totalClientes} clientes · canal digital ${s.coberturaCanalDigital} %`} className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">{Object.entries(s.porClase).map(([k, n]) => <Badge key={k} tono={TONO_CLASE[k]}>Clase {k}: {n}</Badge>)}</div>
          <div className="grid gap-3 text-xs text-slate-400 md:grid-cols-2">
            <div><p className="mb-1 font-medium text-slate-300">Por tipología</p>{TIPOLOGIAS.map((t) => <p key={t.valor}>{t.texto}: {s.porTipologia[t.valor]}</p>)}</div>
            <div><p className="mb-1 font-medium text-slate-300">Por zona</p>{ZONAS.map((z) => <p key={z.valor}>{z.texto}: {s.porZona[z.valor]}</p>)}</div>
          </div>
          {s.cumplenHoy.length > 0 && <div className="mt-3"><Aviso tono="sky">Cumplen años hoy: {s.cumplenHoy.map((c) => `${c.contacto} (${c.razonSocial})`).join(', ')}.</Aviso></div>}
        </Card>
      </div>
      <Card titulo="Campañas" className="mb-5">
        <Tabla vacio="Aún no hay campañas. Crea la primera con «Nueva campaña»." columnas={[
          {titulo: 'Campaña', celda: (c) => <div><p className="font-medium">{c.nombre}</p><p className="max-w-md text-xs text-slate-500">{c.mensaje}</p></div>},
          {titulo: 'Segmento', celda: (c) => <div className="flex flex-wrap gap-1">{[...c.tipologias, ...c.zonas, ...c.clases].map((x) => <Badge key={x}>{x}</Badge>)}{[...c.tipologias, ...c.zonas, ...c.clases].length === 0 && <Badge tono="sky">Todos los clientes</Badge>}</div>},
          {titulo: 'Alcance', celda: (c) => <span className="text-xs text-slate-400">{c.alcance.conCanalDigital} con canal de {c.alcance.pertinentes}</span>},
          {titulo: 'Enviados', derecha: true, celda: (c) => c.enviados},
          {titulo: 'Estado', celda: (c) => <Badge tono={c.estado === 'activa' ? 'emerald' : c.estado === 'cerrada' ? 'slate' : 'amber'}>{c.estado}</Badge>},
          {titulo: '', celda: (c) => puedeEscribir && c.estado !== 'cerrada' && <div className="flex gap-1.5"><Boton pequeno variante="primario" cargando={ejecutando === c.id} onClick={() => ejecutar(c)}>Ejecutar</Boton><Boton pequeno onClick={() => cerrar(c)}>Cerrar</Boton></div>}
        ]} filas={campanas.datos.campanas} />
      </Card>
      <Card titulo="Últimos mensajes enviados" subtitulo="Cada fila conserva el JSON enviado con el formato de la WhatsApp Cloud API">
        {mensajes.datos && <Tabla vacio="Aún no se han enviado mensajes." columnas={[
          {titulo: 'Fecha', celda: (m) => fechaHora(m.ts)}, {titulo: 'Tipo', celda: (m) => <Badge tono={m.tipo === 'factura' ? 'sky' : m.tipo === 'promocion' ? 'emerald' : 'violet'}>{m.tipo}</Badge>},
          {titulo: 'Cliente', celda: (m) => m.clienteNombre}, {titulo: 'Score', derecha: true, celda: (m) => (m.score === null ? '—' : m.score)},
          {titulo: 'Mensaje', celda: (m) => <span className="text-xs text-slate-400">{m.texto.slice(0, 90)}{m.texto.length > 90 ? '…' : ''}</span>},
          {titulo: '', celda: (m) => <Boton pequeno onClick={() => setModal({tipo: 'json', mensaje: m})}>JSON</Boton>}
        ]} filas={mensajes.datos.mensajes} />}
      </Card>

      {modal && modal.tipo === 'nueva' && (
        <FormularioModal ancho="max-w-xl" titulo="Nueva campaña" textoGuardar="Crear campaña" campos={[
          {nombre: 'nombre', etiqueta: 'Nombre de la campaña', requerido: true}, {nombre: 'mensaje', etiqueta: 'Mensaje para el cliente', tipo: 'textarea', requerido: true},
          {nombre: 'descuentoPct', etiqueta: 'Descuento (%)', tipo: 'number', defecto: 0, min: 0, max: 60},
          {nombre: 'tipologias', etiqueta: 'Tipologías (vacío = todas)', tipo: 'multi', opciones: TIPOLOGIAS}, {nombre: 'zonas', etiqueta: 'Zonas (vacío = todas)', tipo: 'multi', opciones: ZONAS},
          {nombre: 'clases', etiqueta: 'Clases RFM (vacío = todas)', tipo: 'multi', opciones: CLASES}]}
          onGuardar={(v) => api('/api/marketing/campanas', {metodo: 'POST', cuerpo: v})}
          onCerrar={(datos) => { setModal(null); if (datos) { refrescar(); notificar('emerald', 'Campaña creada.'); } }} />
      )}
      {modal && modal.tipo === 'cuota' && (
        <FormularioModal titulo="Ajustar la cuota de mensajes" descripcion="La cuota refleja el límite diario contratado con el canal digital." campos={[
          {nombre: 'capDiaria', etiqueta: 'Mensajes por día', tipo: 'number', requerido: true, min: 1, defecto: q.capDiaria},
          {nombre: 'topePorCliente', etiqueta: 'Máximo de promociones por cliente y día', tipo: 'select', numerico: true, vacio: 'Sin tope', opciones: [1, 2, 3, 4, 5].map((n) => ({valor: n, texto: String(n)})), defecto: 3}]}
          onGuardar={(v) => api('/api/marketing/cuota', {metodo: 'PATCH', cuerpo: {capDiaria: v.capDiaria, topePorCliente: v.topePorCliente === undefined ? null : v.topePorCliente}})}
          onCerrar={(datos) => { setModal(null); if (datos) { refrescar(); notificar('emerald', 'Cuota actualizada.'); } }} />
      )}
      {modal && modal.tipo === 'resultado' && (
        <Modal titulo={`Campaña «${modal.datos.campana.nombre}» ejecutada`} onCerrar={() => setModal(null)} ancho="max-w-2xl">
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[['Cuota disponible', modal.datos.plan.cuotaDisponible], ['Reservado para facturas', modal.datos.plan.cuposReservadosParaFacturas], ['Promociones enviadas', modal.datos.plan.promocionesEnviadas], ['Pares sin cupo', modal.datos.plan.paresSinCupo]].map(([k, v]) => <div key={k} className="rounded-lg border border-slate-800 p-3"><p className="text-xs text-slate-500">{k}</p><p className="text-xl font-semibold text-slate-100">{v}</p></div>)}
            </div>
            <p className="text-slate-400">Se priorizó el cupo de las facturas y el resto se repartió entre los clientes de mayor Score. Una misma promoción no se repite al mismo cliente.</p>
            <ul className="max-h-48 overflow-y-auto text-xs text-slate-300">{modal.datos.mensajes.map((m) => <li key={m.id}>• {m.clienteNombre} <span className="text-slate-500">(score {m.score})</span></li>)}{modal.datos.mensajes.length === 0 && <li className="text-slate-500">No se envió ninguna promoción: ya se enviaron antes o no hay cupo.</li>}</ul>
            <div className="flex justify-end"><Boton variante="primario" onClick={() => setModal(null)}>Listo</Boton></div>
          </div>
        </Modal>
      )}
      {modal && modal.tipo === 'json' && (
        <Modal titulo="POST /v16.0/{phone-number-id}/messages" onCerrar={() => setModal(null)} ancho="max-w-xl"><pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-emerald-300">{JSON.stringify(modal.mensaje.payload, null, 2)}</pre></Modal>
      )}
    </div>
  );
}
