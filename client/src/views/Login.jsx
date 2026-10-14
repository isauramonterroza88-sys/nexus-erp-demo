import React, {useEffect, useState} from 'react';
import {Building2, Eye, EyeOff, KeyRound, ShieldCheck, Fingerprint} from 'lucide-react';
import {api, API_URL} from '../api.js';
import {Aviso, Boton, Campo, CLASE_INPUT, cx} from '../components/ui.jsx';

const NOMBRE_ROL = {admin: 'Administrador', ventas: 'Ventas', finanzas: 'Finanzas', inventario: 'Inventario', rrhh: 'Talento Humano', marketing: 'Marketing', soporte: 'Soporte'};

export default function Login({onSesion}) {
  const [pestana, setPestana] = useState('ingresar');
  const [empresas, setEmpresas] = useState([]);
  const [demo, setDemo] = useState([]);
  const [conexion, setConexion] = useState('verificando');
  const [empresaId, setEmpresaId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [registro, setRegistro] = useState({empresa: '', nit: '', nombre: '', email: '', password: '', confirmar: ''});

  useEffect(() => {
    (async () => {
      const [e, d] = await Promise.all([api('/api/auth/empresas', {conToken: false, traza: false}), api('/api/auth/demo', {conToken: false, traza: false})]);
      setConexion(e.ok ? 'conectado' : 'sin_conexion');
      if (e.ok) {
        setEmpresas(e.datos.empresas);
        if (e.datos.empresas.length) setEmpresaId((actual) => actual || e.datos.empresas[0].id);
      }
      if (d.ok) setDemo(d.datos.usuarios);
    })();
  }, []);

  const entrar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const respuesta = await api('/api/auth/login', {metodo: 'POST', cuerpo: {empresaId, email, password}, conToken: false});
    setEnviando(false);
    if (respuesta.ok) onSesion(respuesta.datos);
    else setError(respuesta.datos);
  };

  const registrar = async (evento) => {
    evento.preventDefault();
    setError(null);
    if (registro.password !== registro.confirmar) {
      setError({mensaje: 'Las dos contraseñas no coinciden.'});
      return;
    }
    setEnviando(true);
    const respuesta = await api('/api/auth/registro', {
      metodo: 'POST', conToken: false,
      cuerpo: {empresa: {nombre: registro.empresa, nit: registro.nit}, admin: {nombre: registro.nombre, email: registro.email, password: registro.password}}
    });
    setEnviando(false);
    if (respuesta.ok) onSesion(respuesta.datos);
    else setError(respuesta.datos);
  };

  const usuariosDeLaEmpresa = demo.filter((u) => u.empresaId === empresaId);

  return (
    <div className="grid min-h-screen bg-slate-950 lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 p-10 lg:flex">
        <div>
          <div className="flex items-center gap-2 text-sky-400"><Building2 className="h-6 w-6" aria-hidden="true" /><span className="text-lg font-semibold tracking-wide">NEXUS ERP CORE</span></div>
          <h1 className="mt-16 max-w-md text-4xl font-semibold leading-tight text-slate-100">Un ERP modular donde cada empresa compra solo lo que necesita.</h1>
          <p className="mt-4 max-w-md text-slate-400">Datos aislados por empresa, acceso por roles y módulos que se activan bajo demanda desde la Tienda de Apps.</p>
        </div>
        <ul className="space-y-4 text-sm text-slate-300">
          <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-400" aria-hidden="true" /><span><b className="text-slate-100">Aislamiento multi-empresa.</b> Cada empresa solo ve sus propios datos, verificado en el servidor en cada petición.</span></li>
          <li className="flex gap-3"><Fingerprint className="mt-0.5 h-5 w-5 flex-none text-sky-400" aria-hidden="true" /><span><b className="text-slate-100">Sesión con JWT y contraseñas cifradas.</b> Las claves se guardan con scrypt y nunca se muestran.</span></li>
          <li className="flex gap-3"><KeyRound className="mt-0.5 h-5 w-5 flex-none text-amber-400" aria-hidden="true" /><span><b className="text-slate-100">Menú según tu rol.</b> Lo que tu cargo no puede usar no aparece ni se puede abrir.</span></li>
        </ul>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-5 flex rounded-lg border border-slate-800 bg-slate-900 p-1" role="tablist">
            {[['ingresar', 'Iniciar sesión'], ['registrar', 'Registrar mi empresa']].map(([id, texto]) => (
              <button key={id} type="button" role="tab" aria-selected={pestana === id} onClick={() => { setPestana(id); setError(null); }}
                className={cx('flex-1 rounded-md px-3 py-2 text-sm font-medium', pestana === id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200')}>{texto}</button>
            ))}
          </div>

          {conexion === 'sin_conexion' && <div className="mb-4"><Aviso tono="rose">No hay conexión con el servidor{API_URL ? ` en ${API_URL}` : ''}. Inicia el backend con <code>npm start</code>.</Aviso></div>}

          {pestana === 'ingresar' ? (
            <form onSubmit={entrar} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold text-slate-100">Selecciona tu empresa</h2>
              <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Empresa">
                {empresas.map((e) => (
                  <button key={e.id} type="button" role="radio" aria-checked={empresaId === e.id} onClick={() => setEmpresaId(e.id)}
                    className={cx('flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm', empresaId === e.id ? 'border-sky-500 bg-sky-950/50 text-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800')}>
                    <Building2 className="h-4 w-4 text-sky-400" aria-hidden="true" /> {e.nombre} <span className="ml-auto font-mono text-xs text-slate-500">{e.id}</span>
                  </button>
                ))}
                {empresas.length === 0 && <p className="text-sm text-slate-500">Aún no hay empresas registradas. Crea la tuya en la otra pestaña.</p>}
              </div>
              <Campo etiqueta="Correo"><input className={CLASE_INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></Campo>
              <Campo etiqueta="Contraseña">
                <div className="flex gap-2">
                  <input className={CLASE_INPUT} type={verPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                  <Boton onClick={() => setVerPassword((v) => !v)} aria-label="Mostrar u ocultar contraseña">{verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Boton>
                </div>
              </Campo>
              {error && <Aviso tono="rose">{error.mensaje}</Aviso>}
              <Boton variante="primario" type="submit" className="w-full" cargando={enviando} disabled={!empresaId}>Entrar al sistema</Boton>

              {usuariosDeLaEmpresa.length > 0 && (
                <div className="border-t border-slate-800 pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Usuarios de demostración de esta empresa</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {usuariosDeLaEmpresa.map((u) => (
                      <button key={u.email} type="button" onClick={() => { setEmail(u.email); setPassword(u.password); }}
                        className="flex items-center justify-between rounded-md border border-slate-800 px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800">
                        <span>{u.nombre}</span><span className="text-sky-300">{NOMBRE_ROL[u.rol] || u.rol}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Al elegir uno se rellenan el correo y la contraseña de la prueba piloto.</p>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={registrar} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold text-slate-100">Crea una empresa nueva</h2>
              <p className="text-sm text-slate-400">Se crea un entorno aislado y vacío, con el módulo CRM y tu usuario administrador.</p>
              <Campo etiqueta="Nombre de la empresa"><input className={CLASE_INPUT} value={registro.empresa} onChange={(e) => setRegistro({...registro, empresa: e.target.value})} required /></Campo>
              <Campo etiqueta="NIT" ayuda="Con o sin dígito de verificación. Ejemplo: 900123456-8"><input className={CLASE_INPUT} value={registro.nit} onChange={(e) => setRegistro({...registro, nit: e.target.value})} required /></Campo>
              <Campo etiqueta="Nombre del administrador"><input className={CLASE_INPUT} value={registro.nombre} onChange={(e) => setRegistro({...registro, nombre: e.target.value})} required /></Campo>
              <Campo etiqueta="Correo del administrador"><input className={CLASE_INPUT} type="email" value={registro.email} onChange={(e) => setRegistro({...registro, email: e.target.value})} required /></Campo>
              <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres, con letras y números."><input className={CLASE_INPUT} type="password" value={registro.password} onChange={(e) => setRegistro({...registro, password: e.target.value})} required autoComplete="new-password" /></Campo>
              <Campo etiqueta="Repite la contraseña"><input className={CLASE_INPUT} type="password" value={registro.confirmar} onChange={(e) => setRegistro({...registro, confirmar: e.target.value})} required autoComplete="new-password" /></Campo>
              {error && <Aviso tono="rose">{error.mensaje}</Aviso>}
              <Boton variante="primario" type="submit" className="w-full" cargando={enviando}>Crear empresa y entrar</Boton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
