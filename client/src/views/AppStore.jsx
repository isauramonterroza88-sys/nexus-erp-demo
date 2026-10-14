import React, {useState} from 'react';
import {Boton, Badge, Card, CabeceraVista, Cargando, ErrorVista, Icono, Tabla, Aviso, cop, fechaHora, useCargar, useNexus, cx} from '../components/ui.jsx';
import {api} from '../api.js';

const ORDEN_ACTIVACION = ['ventas_crm', 'finanzas', 'cadena_suministro', 'marketing', 'servicios', 'recursos_humanos', 'motor_analitico'];

function Interruptor({activo, ocupado, onCambiar, etiqueta}) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={ocupado} onClick={onCambiar}
      className={cx('relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50', activo ? 'bg-emerald-600' : 'bg-slate-700')}>
      <span className={cx('inline-block h-5 w-5 transform rounded-full bg-white transition-transform', activo ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

export default function AppStore() {
  const {recargarMenu, notificar} = useNexus();
  const tienda = useCargar('/api/store/apps');
  const cobros = useCargar('/api/store/cobros');
  const [ocupado, setOcupado] = useState(null);
  const [simularRechazo, setSimularRechazo] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const refrescar = async () => {
    await Promise.all([tienda.recargar(), cobros.recargar(), recargarMenu()]);
  };

  const cambiar = async (app) => {
    setOcupado(app.id);
    setMensaje(null);
    const r = await api(`/api/store/apps/${app.id}/${app.activo ? 'desactivar' : 'activar'}`, {metodo: 'POST', cuerpo: app.activo ? {} : {simularRechazo}});
    if (r.ok) notificar('emerald', r.datos.mensaje);
    else setMensaje({tono: r.status === 402 ? 'rose' : 'amber', texto: r.datos.mensaje});
    await refrescar();
    setOcupado(null);
  };

  const lote = async (ids, accion) => {
    setOcupado('lote');
    setMensaje(null);
    for (const id of ids) {
      const app = tienda.datos.apps.find((a) => a.id === id);
      const estaActivo = (await api('/api/store/apps', {traza: false})).datos.apps.find((a) => a.id === id).activo;
      if (accion === 'activar' && !estaActivo) await api(`/api/store/apps/${app.id}/activar`, {metodo: 'POST', cuerpo: {}});
      if (accion === 'desactivar' && estaActivo) await api(`/api/store/apps/${app.id}/desactivar`, {metodo: 'POST', cuerpo: {}});
    }
    notificar('emerald', accion === 'activar' ? 'Suite completa activada.' : 'Módulos opcionales desactivados.');
    await refrescar();
    setOcupado(null);
  };

  if (tienda.error) return <ErrorVista error={tienda.error} />;
  if (!tienda.datos) return <Cargando />;
  const {apps, categorias, totalMensual, metodoPago, empresa} = tienda.datos;

  return (
    <div>
      <CabeceraVista titulo="Tienda de Apps" descripcion={`Activa o desactiva módulos solo para ${empresa}. Al activar uno, aparece de inmediato en el menú lateral y sus rutas se habilitan; al desactivarlo, desaparece y sus rutas quedan bloqueadas.`}
        accion={<div className="flex gap-2"><Boton onClick={() => lote([...ORDEN_ACTIVACION], 'activar')} disabled={ocupado !== null}>Activar suite completa</Boton><Boton onClick={() => lote(['motor_analitico', 'marketing', 'servicios', 'finanzas', 'cadena_suministro', 'recursos_humanos'], 'desactivar')} disabled={ocupado !== null}>Dejar solo CRM</Boton></div>} />
      {mensaje && <div className="mb-4"><Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso></div>}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card titulo="Suscripción mensual" className="lg:col-span-1">
          <p className="text-3xl font-semibold text-slate-100">{cop(totalMensual)}</p>
          <p className="mt-1 text-sm text-slate-400">Antes de IVA · pago con {metodoPago}</p>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={simularRechazo} onChange={(e) => setSimularRechazo(e.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-950" />
            Simular rechazo de la tarjeta al activar
          </label>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          {categorias.map((categoria) => {
            const delGrupo = apps.filter((a) => a.categoria === categoria.id);
            if (delGrupo.length === 0) return null;
            return delGrupo.map((app) => (
              <div key={app.id} className={cx('rounded-xl border p-4', app.activo ? 'border-emerald-800 bg-slate-900' : 'border-slate-800 bg-slate-900/60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={cx('rounded-lg p-2', app.activo ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400')}><Icono nombre={app.icono} className="h-5 w-5" /></span>
                    <div><p className="font-semibold text-slate-100">{app.nombre}</p><p className="text-xs text-slate-500">{app.categoriaNombre}</p></div>
                  </div>
                  <Interruptor activo={app.activo} ocupado={ocupado !== null} onCambiar={() => cambiar(app)} etiqueta={`${app.activo ? 'Desactivar' : 'Activar'} ${app.nombre}`} />
                </div>
                <p className="mt-3 text-sm text-slate-400">{app.descripcion}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tono={app.activo ? 'emerald' : 'slate'}>{app.activo ? 'Activo' : 'No contratado'}</Badge>
                  <span className="text-slate-300">{cop(app.precioMensual)} / mes</span>
                  {app.dependencias.length > 0 && <span className="text-slate-500">Requiere: {app.dependencias.map((d) => (apps.find((a) => a.id === d) || {nombre: d}).nombre).join(', ')}</span>}
                </div>
              </div>
            ));
          })}
        </div>
      </div>
      <Card titulo="Historial de cobros">
        {cobros.datos ? (
          <Tabla columnas={[
            {titulo: 'Fecha', celda: (c) => fechaHora(c.ts)}, {titulo: 'Concepto', celda: (c) => c.concepto}, {titulo: 'Medio', celda: (c) => c.medio},
            {titulo: 'Transacción', celda: (c) => <span className="font-mono text-xs">{c.transaccion}</span>}, {titulo: 'Total', derecha: true, celda: (c) => cop(c.total)},
            {titulo: 'Estado', celda: (c) => <Badge tono={c.estado === 'aprobado' ? 'emerald' : 'rose'}>{c.estado}</Badge>}
          ]} filas={cobros.datos.cobros} />
        ) : <Cargando />}
      </Card>
    </div>
  );
}
