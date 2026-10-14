import React, {useState} from 'react';
import {KeyRound} from 'lucide-react';
import {api, decodificarJwt} from '../api.js';
import {Aviso, Badge, Boton, Campo, Card, CabeceraVista, CLASE_INPUT, fechaHora, useNexus} from '../components/ui.jsx';

export default function Cuenta() {
  const {sesion, notificar, actualizarUsuario} = useNexus();
  const [form, setForm] = useState({actual: '', nueva: '', confirmar: ''});
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const jwt = decodificarJwt(sesion.token);
  const u = sesion.usuario;

  const guardar = async (evento) => {
    evento.preventDefault();
    setError(null);
    setExito(false);
    if (form.nueva !== form.confirmar) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }
    setEnviando(true);
    const r = await api('/api/auth/cambiar-password', {metodo: 'POST', cuerpo: {actual: form.actual, nueva: form.nueva}});
    setEnviando(false);
    if (r.ok) {
      setExito(true);
      setForm({actual: '', nueva: '', confirmar: ''});
      actualizarUsuario(r.datos.usuario);
      notificar('emerald', 'Contraseña actualizada.');
    } else setError(r.datos.mensaje);
  };

  return (
    <div>
      <CabeceraVista titulo="Mi cuenta" descripcion="Consulta tus datos de acceso y cambia tu contraseña cuando quieras. Tu contraseña se guarda cifrada con scrypt y nunca se puede mostrar." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Mi perfil">
          <dl className="space-y-2 text-sm">
            {[['Nombre', u.nombre], ['Correo', u.email], ['Rol', u.rolNombre], ['Empresa', sesion.empresa.nombre], ['Último cambio de contraseña', fechaHora(u.ultimoCambioPassword)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-800 pb-2"><dt className="text-slate-400">{k}</dt><dd className="text-right text-slate-100">{v}</dd></div>
            ))}
          </dl>
          {u.debeCambiarPassword && <div className="mt-3"><Aviso tono="amber">Estás usando una contraseña temporal. Cámbiala ahora.</Aviso></div>}
          {jwt && <p className="mt-4 text-xs text-slate-500">Token: <Badge tono="sky">{jwt.cabecera.alg}</Badge> emitido para <b className="text-slate-300">{jwt.payload.cid}</b>, rol <b className="text-slate-300">{jwt.payload.rol}</b>.</p>}
        </Card>
        <Card titulo="Cambiar contraseña" subtitulo="Mínimo 8 caracteres, con letras y números, distinta de la actual.">
          <form onSubmit={guardar} className="space-y-3">
            <Campo etiqueta="Contraseña actual"><input className={CLASE_INPUT} type="password" value={form.actual} onChange={(e) => setForm({...form, actual: e.target.value})} required autoComplete="current-password" /></Campo>
            <Campo etiqueta="Contraseña nueva"><input className={CLASE_INPUT} type="password" value={form.nueva} onChange={(e) => setForm({...form, nueva: e.target.value})} required autoComplete="new-password" /></Campo>
            <Campo etiqueta="Repite la contraseña nueva"><input className={CLASE_INPUT} type="password" value={form.confirmar} onChange={(e) => setForm({...form, confirmar: e.target.value})} required autoComplete="new-password" /></Campo>
            {error && <Aviso tono="rose">{error}</Aviso>}
            {exito && <Aviso tono="emerald">Contraseña actualizada. Úsala la próxima vez que inicies sesión.</Aviso>}
            <Boton variante="primario" type="submit" cargando={enviando}><KeyRound className="h-4 w-4" aria-hidden="true" />Actualizar contraseña</Boton>
          </form>
        </Card>
      </div>
    </div>
  );
}
