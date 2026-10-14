import React, {useState} from 'react';
import {Cake, Search} from 'lucide-react';
import {api} from '../api.js';
import {Aviso, Badge, Boton, Card, CabeceraVista, Cargando, ErrorVista, FormularioModal, Modal, Tabla, TONO_CLASE, TIPOLOGIAS, ZONAS, nombreOpcion, cop, fecha, fechaHora, useCargar, useNexus, CLASE_INPUT} from '../components/ui.jsx';

const CAMPOS = [
  {nombre: 'razonSocial', etiqueta: 'Razón social', requerido: true},
  {nombre: 'nit', etiqueta: 'NIT', requerido: true, ayuda: 'Con o sin dígito de verificación. Ejemplo: 900123456-8'},
  {nombre: 'contacto', etiqueta: 'Persona de contacto', requerido: true},
  {nombre: 'cargo', etiqueta: 'Cargo del contacto'},
  {nombre: 'correo', etiqueta: 'Correo', tipo: 'email', requerido: true},
  {nombre: 'telefono', etiqueta: 'Teléfono (formato internacional)', requerido: true, placeholder: '+573001234567'},
  {nombre: 'fechaCumpleanos', etiqueta: 'Fecha de cumpleaños del contacto', tipo: 'date', requerido: true, ayuda: 'Se usa para la fidelización con felicitaciones automáticas.'},
  {nombre: 'ciudad', etiqueta: 'Ciudad', requerido: true},
  {nombre: 'direccion', etiqueta: 'Dirección'},
  {nombre: 'tipologia', etiqueta: 'Tipología del negocio', tipo: 'select', opciones: TIPOLOGIAS, defecto: 'tienda_tradicional'},
  {nombre: 'zona', etiqueta: 'Zona geográfica', tipo: 'select', opciones: ZONAS, defecto: 'urbana'},
  {nombre: 'canalDigital', etiqueta: 'Tiene canal digital validado (WhatsApp)', tipo: 'checkbox', defecto: true}
];

const textoCumple = (dias) => (dias === 0 ? '¡Hoy!' : dias === 1 ? 'Mañana' : `En ${dias} días`);

function Ficha({id, onCerrar, puedeEscribir}) {
  const {datos, error, cargando, recargar} = useCargar(`/api/crm/clientes/${id}/ficha`);
  const {notificar} = useNexus();
  const [nueva, setNueva] = useState({canal: 'whatsapp', tipo: 'seguimiento', resumen: ''});
  const [enviando, setEnviando] = useState(false);

  const registrar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    const r = await api(`/api/crm/clientes/${id}/interacciones`, {metodo: 'POST', cuerpo: nueva});
    setEnviando(false);
    if (r.ok) {
      setNueva({...nueva, resumen: ''});
      notificar('emerald', 'Interacción registrada.');
      recargar();
    } else notificar('rose', r.datos.mensaje);
  };

  return (
    <Modal titulo="Ficha 360° del cliente" onCerrar={onCerrar} ancho="max-w-3xl">
      {cargando && !datos ? <Cargando /> : error ? <ErrorVista error={error} /> : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold text-slate-100">{datos.cliente.razonSocial}</h4>
              <p className="text-slate-400">NIT {datos.cliente.nit} · {datos.cliente.ciudad} · {datos.cliente.direccion || 'sin dirección'}</p>
              <p className="text-slate-400">{datos.cliente.contacto} ({datos.cliente.cargo || 'contacto'}) · {datos.cliente.correo} · {datos.cliente.telefono}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tono="sky">{nombreOpcion(TIPOLOGIAS, datos.cliente.tipologia)}</Badge>
              <Badge>{nombreOpcion(ZONAS, datos.cliente.zona)}</Badge>
              <Badge tono={datos.cliente.canalDigital ? 'emerald' : 'amber'}>{datos.cliente.canalDigital ? 'Canal digital' : 'Sin canal digital'}</Badge>
              <Badge tono="violet"><Cake className="h-3 w-3" aria-hidden="true" />{textoCumple(datos.cliente.diasParaCumple)}</Badge>
            </div>
          </div>
          {datos.metricas && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[['Segmento', <Badge key="s" tono={TONO_CLASE[datos.metricas.clase]}>{datos.metricas.clase}</Badge>], ['Score', datos.metricas.score], ['LTV', cop(datos.metricas.ltv)], ['Retención', `${Math.round(datos.metricas.tasaRetencion * 100)} %`]].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-800 p-3"><p className="text-xs text-slate-500">{k}</p><p className="mt-0.5 text-base font-semibold text-slate-100">{v}</p></div>
              ))}
            </div>
          )}
          {datos.seccionesNoDisponibles.length > 0 && (
            <Aviso tono="amber">Secciones no disponibles: {datos.seccionesNoDisponibles.map((s) => `${s.seccion} (${s.motivo.toLowerCase()})`).join('; ')}.</Aviso>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h5 className="mb-2 font-semibold text-slate-200">Oportunidades y cotizaciones</h5>
              <ul className="space-y-1 text-slate-300">
                {datos.oportunidades.map((o) => <li key={`o${o.id}`}>• {o.titulo} <span className="text-slate-500">({o.etapa}, {cop(o.valorEstimado)})</span></li>)}
                {datos.cotizaciones.map((c) => <li key={`c${c.id}`}>• {c.numero} <span className="text-slate-500">({c.estado}, {cop(c.total)})</span></li>)}
                {datos.oportunidades.length + datos.cotizaciones.length === 0 && <li className="text-slate-500">Sin registros.</li>}
              </ul>
              {datos.facturas && (<><h5 className="mb-2 mt-4 font-semibold text-slate-200">Facturas</h5><ul className="space-y-1 text-slate-300">{datos.facturas.map((f) => <li key={f.id}>• {f.numero} <span className="text-slate-500">({f.estadoPago}, {cop(f.total)})</span></li>)}{datos.facturas.length === 0 && <li className="text-slate-500">Sin facturas.</li>}</ul></>)}
              {datos.tickets && (<><h5 className="mb-2 mt-4 font-semibold text-slate-200">Órdenes de soporte</h5><ul className="space-y-1 text-slate-300">{datos.tickets.map((t) => <li key={t.id}>• {t.asunto} <span className="text-slate-500">({t.estado})</span></li>)}{datos.tickets.length === 0 && <li className="text-slate-500">Sin órdenes.</li>}</ul></>)}
            </div>
            <div>
              <h5 className="mb-2 font-semibold text-slate-200">Historial de interacciones</h5>
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {datos.interacciones.map((i) => (
                  <li key={i.id} className="rounded-lg border border-slate-800 p-2"><p className="text-xs text-slate-500">{fechaHora(i.fechaHora)} · {i.canal} · {i.tipo} · {i.responsable}</p><p className="text-slate-200">{i.resumen}</p></li>
                ))}
                {datos.interacciones.length === 0 && <li className="text-slate-500">Aún no hay interacciones.</li>}
              </ul>
              {puedeEscribir && (
                <form onSubmit={registrar} className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select className={CLASE_INPUT} value={nueva.canal} onChange={(e) => setNueva({...nueva, canal: e.target.value})} aria-label="Canal">{['whatsapp', 'correo', 'telefono', 'visita', 'presencial'].map((c) => <option key={c}>{c}</option>)}</select>
                    <select className={CLASE_INPUT} value={nueva.tipo} onChange={(e) => setNueva({...nueva, tipo: e.target.value})} aria-label="Tipo">{['llamada', 'reunion', 'cotizacion', 'pedido', 'seguimiento', 'posventa'].map((c) => <option key={c}>{c}</option>)}</select>
                  </div>
                  <input className={CLASE_INPUT} placeholder="Resumen del acuerdo o conversación" value={nueva.resumen} onChange={(e) => setNueva({...nueva, resumen: e.target.value})} required />
                  <Boton variante="primario" pequeno type="submit" cargando={enviando}>Registrar interacción</Boton>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Clientes() {
  const {nivelDe, notificar} = useNexus();
  const puedeEscribir = nivelDe('ventas_crm') === 'rw';
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const clientes = useCargar(`/api/crm/clientes?q=${encodeURIComponent(consulta)}`);
  const cumples = useCargar('/api/crm/clientes/cumpleanos?dias=30');
  const [modal, setModal] = useState(null);

  if (clientes.error) return <ErrorVista error={clientes.error} />;
  const lista = clientes.datos ? clientes.datos.clientes : [];

  return (
    <div>
      <CabeceraVista titulo="Clientes (ficha 360°)" descripcion="Directorio de cuentas comerciales con NIT, tipología, zona, canal digital y fecha de cumpleaños para fidelización."
        accion={puedeEscribir ? <Boton variante="primario" onClick={() => setModal({tipo: 'nuevo'})}>+ Nuevo cliente</Boton> : <Badge tono="amber">Solo lectura para tu rol</Badge>} />
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setConsulta(busqueda); }}>
            <input className={CLASE_INPUT} placeholder="Buscar por nombre, NIT, contacto o ciudad" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar clientes" />
            <Boton type="submit"><Search className="h-4 w-4" aria-hidden="true" />Buscar</Boton>
          </form>
          {clientes.cargando && !clientes.datos ? <Cargando /> : (
            <Tabla vacio="Tu empresa aún no tiene clientes. Crea el primero con «Nuevo cliente»." columnas={[
              {titulo: 'Cliente', celda: (c) => <div><p className="font-medium">{c.razonSocial}</p><p className="text-xs text-slate-500">NIT {c.nit}</p></div>},
              {titulo: 'Contacto', celda: (c) => <div><p>{c.contacto}</p><p className="text-xs text-slate-500">{c.ciudad}</p></div>},
              {titulo: 'Perfil', celda: (c) => <div className="flex flex-wrap gap-1"><Badge tono="sky">{nombreOpcion(TIPOLOGIAS, c.tipologia)}</Badge><Badge>{nombreOpcion(ZONAS, c.zona)}</Badge></div>},
              {titulo: 'Canal', celda: (c) => <Badge tono={c.canalDigital ? 'emerald' : 'amber'}>{c.canalDigital ? 'Digital' : 'Sin canal'}</Badge>},
              {titulo: 'Cumpleaños', celda: (c) => <span className={c.diasParaCumple <= 7 ? 'text-violet-300' : 'text-slate-400'}>{fecha(c.fechaCumpleanos).replace(/ \d{4}$/, '')} · {textoCumple(c.diasParaCumple)}</span>},
              {titulo: '', celda: (c) => <div className="flex gap-1.5"><Boton pequeno onClick={() => setModal({tipo: 'ficha', id: c.id})}>Ficha</Boton>{puedeEscribir && <Boton pequeno onClick={() => setModal({tipo: 'editar', cliente: c})}>Editar</Boton>}</div>}
            ]} filas={lista} />
          )}
        </div>
        <Card titulo="Próximos cumpleaños" subtitulo="Fidelización: próximos 30 días">
          {cumples.datos ? (
            <ul className="space-y-2 text-sm">
              {cumples.datos.cumpleanos.slice(0, 6).map((c) => (
                <li key={c.clienteId} className="flex items-center gap-2"><Cake className="h-4 w-4 flex-none text-violet-400" aria-hidden="true" /><div><p className="text-slate-200">{c.contacto}</p><p className="text-xs text-slate-500">{c.razonSocial} · {textoCumple(c.diasRestantes)} · cumple {c.cumpleAnios}</p></div></li>
              ))}
              {cumples.datos.cumpleanos.length === 0 && <li className="text-slate-500">Ningún cumpleaños próximo.</li>}
            </ul>
          ) : <Cargando />}
        </Card>
      </div>

      {modal && modal.tipo === 'ficha' && <Ficha id={modal.id} puedeEscribir={puedeEscribir} onCerrar={() => setModal(null)} />}
      {modal && (modal.tipo === 'nuevo' || modal.tipo === 'editar') && (
        <FormularioModal ancho="max-w-xl" titulo={modal.tipo === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'} inicial={modal.cliente || {}} campos={CAMPOS}
          onGuardar={(v) => (modal.tipo === 'nuevo' ? api('/api/crm/clientes', {metodo: 'POST', cuerpo: v}) : api(`/api/crm/clientes/${modal.cliente.id}`, {metodo: 'PATCH', cuerpo: v}))}
          onCerrar={(datos) => { setModal(null); if (datos) { clientes.recargar(); cumples.recargar(); notificar('emerald', 'Cliente guardado.'); } }} />
      )}
    </div>
  );
}
