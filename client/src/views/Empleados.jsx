import React, {useState} from 'react';
import {Star} from 'lucide-react';
import {api} from '../api.js';
import {Badge, Boton, CabeceraVista, Card, Cargando, ErrorVista, FormularioModal, Kpi, Modal, Tabla, cop, fecha, useCargar, useNexus} from '../components/ui.jsx';

const CONTRATOS = ['indefinido', 'fijo', 'prestacion_servicios', 'aprendizaje'].map((c) => ({valor: c, texto: c.replace('_', ' ')}));

function Perfil({id, puedeEscribir, onCerrar, onCambio}) {
  const perfil = useCargar(`/api/rrhh/empleados/${id}`);
  const {notificar} = useNexus();
  const [evaluar, setEvaluar] = useState(false);
  const e = perfil.datos && perfil.datos.empleado;
  return (
    <Modal titulo="Perfil del talento humano" onCerrar={onCerrar} ancho="max-w-2xl">
      {!e ? <Cargando /> : (
        <div className="space-y-4 text-sm">
          <div><p className="text-lg font-semibold text-slate-100">{e.nombre}</p><p className="text-slate-400">{e.cargo} · {e.area} · {e.correo}</p></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[['Contrato', e.contrato.replace('_', ' ')], ['Salario base', cop(e.salarioBase)], ['Antigüedad', `${e.antiguedadAnios} años`], ['Desempeño', e.promedioDesempeno === null ? 'Sin evaluar' : `${e.promedioDesempeno} / 5`]].map(([k, v]) => <div key={k} className="rounded-lg border border-slate-800 p-3"><p className="text-xs text-slate-500">{k}</p><p className="font-semibold text-slate-100">{v}</p></div>)}
          </div>
          <p className="text-slate-400">Documento {e.documento} · ingreso {fecha(e.fechaIngreso)} · nacimiento {fecha(e.fechaNacimiento)} · <Badge tono={e.estado === 'activo' ? 'emerald' : 'amber'}>{e.estado}</Badge></p>
          <div>
            <div className="mb-2 flex items-center justify-between"><p className="font-semibold text-slate-200">Evaluaciones de desempeño</p>{puedeEscribir && <Boton pequeno onClick={() => setEvaluar(true)}>+ Evaluar</Boton>}</div>
            <ul className="space-y-2">{perfil.datos.evaluaciones.map((x) => <li key={x.id} className="rounded-lg border border-slate-800 p-2"><p className="flex items-center gap-1 text-xs text-slate-500">{x.periodo} · <Star className="h-3 w-3 text-amber-400" aria-hidden="true" />{x.calificacion} · {x.evaluador}</p><p className="text-slate-200">{x.comentario || 'Sin comentarios.'}</p></li>)}{perfil.datos.evaluaciones.length === 0 && <li className="text-slate-500">Aún no hay evaluaciones.</li>}</ul>
          </div>
        </div>
      )}
      {evaluar && (
        <FormularioModal titulo="Nueva evaluación" textoGuardar="Registrar" campos={[{nombre: 'periodo', etiqueta: 'Periodo', requerido: true, placeholder: '2026-S2'}, {nombre: 'calificacion', etiqueta: 'Calificación (1 a 5)', tipo: 'number', requerido: true, min: 1, max: 5, paso: '0.1'}, {nombre: 'comentario', etiqueta: 'Comentario', tipo: 'textarea'}]}
          onGuardar={(v) => api(`/api/rrhh/empleados/${id}/evaluaciones`, {metodo: 'POST', cuerpo: v})}
          onCerrar={(datos) => { setEvaluar(false); if (datos) { perfil.recargar(); onCambio(); notificar('emerald', 'Evaluación registrada.'); } }} />
      )}
    </Modal>
  );
}

export default function Empleados() {
  const {nivelDe, notificar} = useNexus();
  const puedeEscribir = nivelDe('recursos_humanos') === 'rw';
  const empleados = useCargar('/api/rrhh/empleados');
  const resumen = useCargar('/api/rrhh/resumen');
  const [modal, setModal] = useState(null);
  if (empleados.error) return <ErrorVista error={empleados.error} />;
  if (!empleados.datos || !resumen.datos) return <Cargando />;
  const r = resumen.datos;
  const refrescar = () => { empleados.recargar(); resumen.recargar(); };

  return (
    <div>
      <CabeceraVista titulo="Personal y perfiles" descripcion="Perfiles del talento humano de tu empresa, estructura por áreas y evaluaciones de desempeño."
        accion={puedeEscribir ? <Boton variante="primario" onClick={() => setModal({tipo: 'nuevo'})}>+ Nuevo empleado</Boton> : <Badge tono="amber">Solo lectura para tu rol</Badge>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Personal activo" valor={`${r.activos} de ${r.totalPersonal}`} /><Kpi etiqueta="Nómina mensual base" valor={cop(r.nominaMensual)} tono="emerald" />
        <Kpi etiqueta="Antigüedad promedio" valor={`${r.antiguedadPromedio} años`} tono="violet" /><Kpi etiqueta="Áreas" valor={r.porArea.length} tono="amber" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabla vacio="Tu empresa aún no tiene personal registrado." columnas={[
            {titulo: 'Persona', celda: (e) => <div><p className="font-medium">{e.nombre}</p><p className="text-xs text-slate-500">{e.cargo}</p></div>},
            {titulo: 'Área', celda: (e) => e.area}, {titulo: 'Contrato', celda: (e) => <Badge>{e.contrato.replace('_', ' ')}</Badge>},
            {titulo: 'Desempeño', celda: (e) => (e.promedioDesempeno === null ? <span className="text-slate-500">—</span> : <span className="text-amber-300">★ {e.promedioDesempeno}</span>)},
            {titulo: 'Estado', celda: (e) => <Badge tono={e.estado === 'activo' ? 'emerald' : 'amber'}>{e.estado}</Badge>},
            {titulo: '', celda: (e) => <Boton pequeno onClick={() => setModal({tipo: 'perfil', id: e.id})}>Perfil</Boton>}
          ]} filas={empleados.datos.empleados} />
        </div>
        <Card titulo="Estructura por áreas">
          <ul className="space-y-2 text-sm">{r.porArea.map((a) => <li key={a.area} className="flex justify-between"><span className="text-slate-300">{a.area}</span><span className="text-slate-400">{a.personas} · {cop(a.nomina)}</span></li>)}</ul>
        </Card>
      </div>
      {modal && modal.tipo === 'perfil' && <Perfil id={modal.id} puedeEscribir={puedeEscribir} onCerrar={() => setModal(null)} onCambio={refrescar} />}
      {modal && modal.tipo === 'nuevo' && (
        <FormularioModal ancho="max-w-xl" titulo="Nuevo empleado" textoGuardar="Registrar empleado" campos={[
          {nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true}, {nombre: 'documento', etiqueta: 'Documento de identidad', requerido: true}, {nombre: 'cargo', etiqueta: 'Cargo', requerido: true}, {nombre: 'area', etiqueta: 'Área', requerido: true},
          {nombre: 'contrato', etiqueta: 'Tipo de contrato', tipo: 'select', opciones: CONTRATOS, defecto: 'indefinido'}, {nombre: 'salarioBase', etiqueta: 'Salario base (COP)', tipo: 'number', requerido: true, min: 0},
          {nombre: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'date', requerido: true}, {nombre: 'correo', etiqueta: 'Correo', tipo: 'email', requerido: true}]}
          onGuardar={(v) => api('/api/rrhh/empleados', {metodo: 'POST', cuerpo: v})}
          onCerrar={(datos) => { setModal(null); if (datos) { refrescar(); notificar('emerald', 'Empleado registrado.'); } }} />
      )}
    </div>
  );
}
