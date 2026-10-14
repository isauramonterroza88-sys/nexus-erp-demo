import React, {useEffect, useState} from 'react';
import {Lock, Plus, Save, Trash2} from 'lucide-react';
import {api} from '../api.js';
import {Aviso, Badge, Boton, Card, CabeceraVista, Cargando, CLASE_INPUT, ErrorVista, FormularioModal, useCargar, useNexus} from '../components/ui.jsx';

const NIVELES = [
  {valor: '', texto: 'Sin acceso'},
  {valor: 'r', texto: 'Solo lectura'},
  {valor: 'rw', texto: 'Lectura y edición'}
];

function TarjetaRol({rol, modulos, alGuardar, alEliminar}) {
  const [permisos, setPermisos] = useState(rol.permisos);
  const [inicio, setInicio] = useState(rol.inicio || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const bloqueado = rol.sistema;

  useEffect(() => {
    setPermisos(rol.permisos);
    setInicio(rol.inicio || '');
  }, [rol]);

  const cambios = JSON.stringify(permisos) !== JSON.stringify(rol.permisos) || (inicio || '') !== (rol.inicio || '');
  const pantallasPermitidas = modulos.filter((m) => permisos[m.id] && m.activo).flatMap((m) => m.pantallas);

  const cambiarNivel = (moduloId, nivel) => {
    const siguiente = {...permisos};
    if (nivel) siguiente[moduloId] = nivel;
    else delete siguiente[moduloId];
    setPermisos(siguiente);
    const permitidas = modulos.filter((m) => siguiente[m.id]).flatMap((m) => m.pantallas.map((p) => p.id));
    if (inicio && !permitidas.includes(inicio)) setInicio('');
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const r = await api(`/api/auth/roles/${rol.id}`, {metodo: 'PATCH', cuerpo: {permisos, inicio: inicio || null}});
    setGuardando(false);
    if (r.ok) alGuardar();
    else setError(r.datos.mensaje);
  };

  return (
    <Card
      titulo={<span className="flex items-center gap-2">{rol.nombre}{bloqueado && <Lock className="h-4 w-4 text-slate-500" aria-label="Rol protegido" />}</span>}
      subtitulo={rol.descripcion || 'Sin descripción'}
      accion={<Badge tono={rol.usuarios > 0 ? 'sky' : 'slate'}>{rol.usuarios} {rol.usuarios === 1 ? 'usuario' : 'usuarios'}</Badge>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.filter((m) => m.activo).map((m) => (
          <label key={m.id} className="block text-sm">
            <span className="mb-1 block text-slate-300">{m.nombre}</span>
            <select className={CLASE_INPUT} disabled={bloqueado} value={permisos[m.id] || ''} onChange={(e) => cambiarNivel(m.id, e.target.value)}>
              {NIVELES.map((n) => <option key={n.valor} value={n.valor}>{n.texto}</option>)}
            </select>
          </label>
        ))}
      </div>
      {!bloqueado && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Pantalla con la que inicia</span>
            <select className={CLASE_INPUT} value={inicio} onChange={(e) => setInicio(e.target.value)}>
              <option value="">La primera que tenga disponible</option>
              {pantallasPermitidas.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {error && <div className="mt-3"><Aviso tono="rose">{error}</Aviso></div>}
      {!bloqueado && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Boton variante="peligro" pequeno onClick={() => alEliminar(rol)}><Trash2 className="h-4 w-4" aria-hidden="true" />Eliminar rol</Boton>
          <Boton variante="primario" pequeno onClick={guardar} cargando={guardando} disabled={!cambios}><Save className="h-4 w-4" aria-hidden="true" />Guardar cambios</Boton>
        </div>
      )}
    </Card>
  );
}

export default function Roles() {
  const {notificar} = useNexus();
  const {datos, error, recargar} = useCargar('/api/auth/roles');
  const [nuevo, setNuevo] = useState(false);

  if (error) return <ErrorVista error={error} />;
  if (!datos) return <Cargando />;

  const eliminar = async (rol) => {
    if (!window.confirm(`¿Eliminar el rol «${rol.nombre}»? Esta acción no se puede deshacer.`)) return;
    const r = await api(`/api/auth/roles/${rol.id}`, {metodo: 'DELETE'});
    if (r.ok) notificar('emerald', r.datos.mensaje);
    else notificar('rose', r.datos.mensaje);
    recargar();
  };

  return (
    <div>
      <CabeceraVista titulo="Roles y permisos"
        descripcion="Define los cargos de tu empresa y qué puede ver o hacer cada uno. Lo que un rol no tiene queda oculto en su menú y bloqueado en el servidor. Los cambios aplican de inmediato a quienes ya tienen ese rol."
        accion={<Boton variante="primario" onClick={() => setNuevo(true)}><Plus className="h-4 w-4" aria-hidden="true" />Nuevo rol o cargo</Boton>} />
      <div className="mb-4"><Aviso tono="sky">Aquí decides, para cada cargo de tu empresa, qué módulos activos puede editar, solo consultar o no ver. Da «Solo lectura» únicamente cuando esa persona necesita el dato para decidir o evitar errores; si no, déjalo en «Sin acceso». Los módulos que aún no contratas no aparecen: se activan en la Tienda de Apps.</Aviso></div>
      {datos.roles.length === 1 && <div className="mb-4"><Aviso tono="amber">Tu empresa solo tiene el rol de administrador. Crea con «Nuevo rol» los cargos que existan en tu organización, con el nombre que ustedes usan, y luego asígnalos a tus usuarios.</Aviso></div>}
      <div className="space-y-4">
        {datos.roles.map((rol) => <TarjetaRol key={rol.id} rol={rol} modulos={datos.modulos} alGuardar={() => { notificar('emerald', `Rol «${rol.nombre}» actualizado.`); recargar(); }} alEliminar={eliminar} />)}
      </div>
      {nuevo && (
        <FormularioModal titulo="Nuevo rol o cargo" descripcion="Ponle el nombre que use tu empresa. Luego defines qué módulos edita, consulta o no ve." textoGuardar="Crear rol"
          campos={[{nombre: 'nombre', etiqueta: 'Nombre del cargo', requerido: true, placeholder: 'Por ejemplo: Auxiliar de bodega'}, {nombre: 'descripcion', etiqueta: 'Descripción (opcional)', tipo: 'textarea'}]}
          onGuardar={(v) => api('/api/auth/roles', {metodo: 'POST', cuerpo: v})}
          onCerrar={(r) => { setNuevo(false); if (r) { notificar('emerald', 'Rol creado. Ahora define sus permisos.'); recargar(); } }} />
      )}
    </div>
  );
}
