import React, {useState} from 'react';
import {Boton, Badge, Card, CabeceraVista, Cargando, ErrorVista, FormularioModal, Modal, Tabla, Aviso, fechaHora, useCargar, useNexus} from '../components/ui.jsx';
import {api} from '../api.js';

export default function Usuarios() {
  const {notificar, sesion, irA} = useNexus();
  const usuarios = useCargar('/api/auth/usuarios');
  const roles = useCargar('/api/auth/roles');
  const [modal, setModal] = useState(null);
  const [credencial, setCredencial] = useState(null);

  if (usuarios.error) return <ErrorVista error={usuarios.error} />;
  if (!usuarios.datos || !roles.datos) return <Cargando />;
  const opcionesRol = roles.datos.roles.map((r) => ({valor: r.id, texto: r.nombre}));

  const alternar = async (u) => {
    const r = await api(`/api/auth/usuarios/${u.id}`, {metodo: 'PATCH', cuerpo: {activo: !u.activo}});
    if (r.ok) notificar('emerald', `${u.nombre} ${u.activo ? 'desactivado' : 'activado'}.`);
    else notificar('rose', r.datos.mensaje);
    usuarios.recargar();
  };

  const restablecer = async (u) => {
    const r = await api(`/api/auth/usuarios/${u.id}/restablecer`, {metodo: 'POST', cuerpo: {}});
    if (r.ok) setCredencial({nombre: u.nombre, email: u.email, password: r.datos.passwordTemporal, titulo: 'Contraseña restablecida'});
    else notificar('rose', r.datos.mensaje);
    usuarios.recargar();
  };

  return (
    <div>
      <CabeceraVista titulo="Usuarios y roles" descripcion="Cada trabajador tiene su propio usuario. El sistema genera una contraseña inicial y la persona puede cambiarla desde «Mi cuenta»."
        accion={<Boton variante="primario" onClick={() => setModal({tipo: 'nuevo'})}>+ Nuevo usuario</Boton>} />
      {roles.datos.roles.length === 1 && <div className="mb-4"><Aviso tono="amber">Antes de crear usuarios, define los cargos de tu empresa en «Roles y permisos». <button type="button" className="underline" onClick={() => irA('roles')}>Ir a roles y permisos</button></Aviso></div>}
      <Card className="mb-5">
        <Tabla columnas={[
          {titulo: 'Usuario', celda: (u) => <div><p className="font-medium">{u.nombre}</p><p className="text-xs text-slate-500">{u.email}</p></div>},
          {titulo: 'Rol', celda: (u) => <Badge tono="sky">{u.rolNombre}</Badge>},
          {titulo: 'Estado', celda: (u) => <Badge tono={u.activo ? 'emerald' : 'slate'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>},
          {titulo: 'Contraseña', celda: (u) => (u.debeCambiarPassword ? <Badge tono="amber">Temporal</Badge> : <Badge tono="emerald">Personalizada</Badge>)},
          {titulo: 'Último acceso', celda: (u) => <span className="text-xs text-slate-400">{fechaHora(u.ultimoAcceso)}</span>},
          {titulo: 'Acciones', celda: (u) => u.id === sesion.usuario.id ? <span className="text-xs text-slate-500">Eres tú</span> : (
            <div className="flex flex-wrap gap-1.5">
              <Boton pequeno onClick={() => setModal({tipo: 'editar', usuario: u})}>Editar rol</Boton>
              <Boton pequeno onClick={() => restablecer(u)}>Nueva clave</Boton>
              <Boton pequeno variante={u.activo ? 'peligro' : 'exito'} onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}</Boton>
            </div>)}
        ]} filas={usuarios.datos.usuarios} />
      </Card>
      <Card titulo="Roles y permisos" subtitulo="Cada empresa define qué ve y qué puede hacer cada rol.">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>Hay {roles.datos.roles.length} roles en tu empresa. Puedes ajustar los permisos o crear roles nuevos.</span>
          <Boton variante="primario" onClick={() => irA('roles')}>Administrar roles y permisos</Boton>
        </div>
      </Card>

      {modal && modal.tipo === 'nuevo' && (
        <FormularioModal titulo="Nuevo usuario" descripcion="Si dejas la contraseña vacía, el sistema genera una temporal que verás una sola vez." textoGuardar="Crear usuario"
          campos={[{nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true}, {nombre: 'email', etiqueta: 'Correo', tipo: 'email', requerido: true}, {nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: opcionesRol, defecto: (opcionesRol.find((o) => o.valor === 'ventas') || opcionesRol[0]).valor}, {nombre: 'password', etiqueta: 'Contraseña (opcional)', tipo: 'password', ayuda: 'Mínimo 8 caracteres con letras y números.'}]}
          onGuardar={(v) => api('/api/auth/usuarios', {metodo: 'POST', cuerpo: v})}
          onCerrar={(datos) => {
            setModal(null);
            if (datos) {
              usuarios.recargar();
              if (datos.passwordTemporal) setCredencial({nombre: datos.usuario.nombre, email: datos.usuario.email, password: datos.passwordTemporal, titulo: 'Usuario creado'});
              else notificar('emerald', 'Usuario creado.');
            }
          }} />
      )}
      {modal && modal.tipo === 'editar' && (
        <FormularioModal titulo={`Editar a ${modal.usuario.nombre}`} inicial={{rol: modal.usuario.rol, nombre: modal.usuario.nombre}} textoGuardar="Guardar cambios"
          campos={[{nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true}, {nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: opcionesRol}]}
          onGuardar={(v) => api(`/api/auth/usuarios/${modal.usuario.id}`, {metodo: 'PATCH', cuerpo: v})}
          onCerrar={(datos) => { setModal(null); if (datos) { usuarios.recargar(); notificar('emerald', 'Usuario actualizado.'); } }} />
      )}
      {credencial && (
        <Modal titulo={credencial.titulo} onCerrar={() => setCredencial(null)}>
          <div className="space-y-3 text-sm">
            <Aviso tono="amber">Entrégale estas credenciales a {credencial.nombre}. La contraseña temporal no se vuelve a mostrar y deberá cambiarla en «Mi cuenta».</Aviso>
            <p className="text-slate-400">Usuario</p><p className="rounded-lg bg-slate-950 px-3 py-2 font-mono text-slate-100">{credencial.email}</p>
            <p className="text-slate-400">Contraseña temporal</p><p className="rounded-lg bg-slate-950 px-3 py-2 font-mono text-lg text-emerald-300">{credencial.password}</p>
            <div className="flex justify-end"><Boton variante="primario" onClick={() => setCredencial(null)}>Listo</Boton></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
