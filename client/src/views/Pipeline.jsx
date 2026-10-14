import React, {useState} from 'react';
import {api} from '../api.js';
import {Badge, Boton, Cargando, CabeceraVista, ErrorVista, FormularioModal, Kpi, cop, fecha, useCargar, useNexus} from '../components/ui.jsx';

const SIGUIENTE = {nuevo: 'calificado', calificado: 'propuesta', propuesta: 'negociacion', negociacion: 'ganado'};
const ANTERIOR = {calificado: 'nuevo', propuesta: 'calificado', negociacion: 'propuesta'};
const COLOR = {nuevo: 'border-slate-600', calificado: 'border-sky-600', propuesta: 'border-violet-600', negociacion: 'border-amber-500', ganado: 'border-emerald-500', perdido: 'border-rose-600'};

export default function Pipeline() {
  const {nivelDe, notificar} = useNexus();
  const puedeEscribir = nivelDe('ventas_crm') === 'rw';
  const pipeline = useCargar('/api/crm/pipeline');
  const clientes = useCargar('/api/crm/clientes');
  const [nuevo, setNuevo] = useState(false);

  if (pipeline.error) return <ErrorVista error={pipeline.error} />;
  if (!pipeline.datos) return <Cargando />;
  const {columnas, resumen} = pipeline.datos;

  const mover = async (op, etapa) => {
    const r = await api(`/api/crm/oportunidades/${op.id}/etapa`, {metodo: 'PATCH', cuerpo: {etapa}});
    if (r.ok) notificar('emerald', `«${op.titulo}» pasó a ${etapa}.`);
    else notificar('rose', r.datos.mensaje);
    pipeline.recargar();
  };

  return (
    <div>
      <CabeceraVista titulo="Flujo de ventas" descripcion="Embudo de oportunidades por etapa comercial. Al cerrar una oportunidad como ganada queda lista para cotizar y facturar."
        accion={puedeEscribir ? <Boton variante="primario" onClick={() => setNuevo(true)}>+ Nueva oportunidad</Boton> : <Badge tono="amber">Solo lectura para tu rol</Badge>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Pipeline abierto" valor={cop(resumen.pipelineAbierto)} />
        <Kpi etiqueta="Pronóstico ponderado" valor={cop(resumen.pronosticoPonderado)} tono="violet" />
        <Kpi etiqueta="Ganado" valor={cop(resumen.ganado)} tono="emerald" />
        <Kpi etiqueta="Tasa de cierre" valor={`${resumen.tasaCierre} %`} tono="amber" />
      </div>
      <div className="grid auto-cols-[260px] grid-flow-col gap-3 overflow-x-auto pb-3">
        {columnas.map((c) => (
          <div key={c.id} className={`rounded-xl border-t-4 bg-slate-900 p-3 ${COLOR[c.id]}`}>
            <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold text-slate-100">{c.nombre}</span><span className="text-xs text-slate-500">{c.cantidad} · {cop(c.valor)}</span></div>
            <div className="space-y-2">
              {c.oportunidades.map((o) => (
                <div key={o.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                  <p className="font-medium text-slate-100">{o.titulo}</p>
                  <p className="text-xs text-slate-500">{o.clienteNombre}</p>
                  <p className="mt-1 text-slate-200">{cop(o.valorEstimado)}</p>
                  <p className="text-xs text-slate-500">Cierre {fecha(o.fechaEstimadaCierre)} · {o.probabilidadCierre} %</p>
                  {puedeEscribir && o.etapa !== 'ganado' && o.etapa !== 'perdido' && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ANTERIOR[o.etapa] && <Boton pequeno onClick={() => mover(o, ANTERIOR[o.etapa])} aria-label="Etapa anterior">‹</Boton>}
                      <Boton pequeno onClick={() => mover(o, SIGUIENTE[o.etapa])} aria-label="Etapa siguiente">{o.etapa === 'negociacion' ? 'Cerrar ganada' : '›'}</Boton>
                      <Boton pequeno variante="peligro" onClick={() => mover(o, 'perdido')}>Perdida</Boton>
                    </div>
                  )}
                </div>
              ))}
              {c.oportunidades.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-600">Sin oportunidades</p>}
            </div>
          </div>
        ))}
      </div>
      {nuevo && (
        <FormularioModal titulo="Nueva oportunidad" textoGuardar="Crear oportunidad"
          campos={[
            {nombre: 'titulo', etiqueta: 'Título de la oportunidad', requerido: true},
            {nombre: 'clienteId', etiqueta: 'Cliente', tipo: 'select', numerico: true, requerido: true, vacio: 'Selecciona un cliente…', opciones: (clientes.datos ? clientes.datos.clientes : []).map((c) => ({valor: c.id, texto: c.razonSocial}))},
            {nombre: 'valorEstimado', etiqueta: 'Valor estimado (COP)', tipo: 'number', requerido: true, min: 0}
          ]}
          onGuardar={(v) => api('/api/crm/oportunidades', {metodo: 'POST', cuerpo: v})}
          onCerrar={(datos) => { setNuevo(false); if (datos) { pipeline.recargar(); notificar('emerald', 'Oportunidad creada.'); } }} />
      )}
    </div>
  );
}
