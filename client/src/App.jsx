import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {LogOut, Menu as IconoMenu, PanelBottomClose, PanelBottomOpen, Terminal, UserCircle, X} from 'lucide-react';
import {alSesionExpirada, api, fijarToken, guardarSesion, leerSesionGuardada} from './api.js';
import {Aviso, Badge, Boton, Cargando, cx, Icono, mensajeAmigable, NexusContexto} from './components/ui.jsx';
import LogConsole from './components/LogConsole.jsx';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import AppStore from './views/AppStore.jsx';
import Usuarios from './views/Usuarios.jsx';
import Cuenta from './views/Cuenta.jsx';
import Roles from './views/Roles.jsx';
import Demostracion from './views/Demostracion.jsx';
import Clientes from './views/Clientes.jsx';
import Pipeline from './views/Pipeline.jsx';
import Cotizaciones from './views/Cotizaciones.jsx';
import Facturas from './views/Facturas.jsx';
import Cartera from './views/Cartera.jsx';
import Productos from './views/Productos.jsx';
import Kardex from './views/Kardex.jsx';
import Campanas from './views/Campanas.jsx';
import Tickets from './views/Tickets.jsx';
import Empleados from './views/Empleados.jsx';
import Indicadores from './views/Indicadores.jsx';

/* Cada ítem del menú que entrega el servidor (/api/store/menu) se resuelve a una vista de este mapa */
const VISTAS = {
  panel: Dashboard,
  tienda: AppStore,
  usuarios: Usuarios,
  roles: Roles,
  demo: Demostracion,
  cuenta: Cuenta,
  crm_clientes: Clientes,
  crm_pipeline: Pipeline,
  crm_cotizaciones: Cotizaciones,
  fin_facturas: Facturas,
  fin_cartera: Cartera,
  inv_productos: Productos,
  inv_movimientos: Kardex,
  mkt_campanas: Campanas,
  srv_tickets: Tickets,
  rrhh_empleados: Empleados,
  ana_indicadores: Indicadores
};

const COLOR_TOAST = {
  emerald: 'border-emerald-700 bg-emerald-950 text-emerald-200',
  amber: 'border-amber-700 bg-amber-950 text-amber-200',
  rose: 'border-rose-700 bg-rose-950 text-rose-200',
  sky: 'border-sky-700 bg-sky-950 text-sky-200'
};

/* Si una vista falla al dibujarse, se muestra el motivo en pantalla en lugar de dejar toda la aplicación en blanco */
class LimiteDeError extends React.Component {
  constructor(props) {
    super(props);
    this.state = {error: null};
  }

  static getDerivedStateFromError(error) {
    return {error};
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-rose-900 bg-rose-950/40 p-6">
        <p className="text-sm font-semibold text-rose-300">Esta pantalla tuvo un error al mostrarse</p>
        <p className="mt-2 text-sm text-slate-300">Intenta volver al panel. Si el problema se repite, avisa a quien administra el sistema.</p>
        <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">Detalle técnico</summary><p className="mt-1 break-words font-mono">{String(this.state.error && this.state.error.message)}</p></details>
        <button type="button" className="mt-4 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white" onClick={() => this.props.alVolver()}>Volver al panel</button>
      </div>
    );
  }
}

function BotonMenu({activo, onClick, icono, children, insignia}) {
  return (
    <button type="button" onClick={onClick} aria-current={activo ? 'page' : undefined}
      className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        activo ? 'bg-sky-950 text-sky-200 ring-1 ring-sky-800' : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100')}>
      <Icono nombre={icono} className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{children}</span>
      {insignia}
    </button>
  );
}

function BarraLateral({sesion, menu, vista, irA, onSalir, cerrarMovil}) {
  const esAdmin = sesion.usuario.rol === 'admin';
  const ir = (id) => {
    irA(id);
    cerrarMovil();
  };
  return (
    <nav aria-label="Navegación principal" className="flex h-full flex-col bg-slate-900">
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white">N</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-slate-100">NEXUS ERP CORE</p>
            <p className="truncate text-xs text-slate-400">{sesion.empresa.nombre}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <div className="space-y-1">
          <BotonMenu activo={vista === 'panel'} onClick={() => ir('panel')} icono="LayoutDashboard">Panel general</BotonMenu>
        </div>

        {!menu && <Cargando texto="Cargando aplicaciones…" />}
        {menu && menu.categorias.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-400">
            Esta empresa aún no tiene aplicaciones activas. {esAdmin ? 'Actívalas desde la Tienda de Apps.' : 'Pide a un administrador que active las aplicaciones.'}
          </p>
        )}
        {menu && menu.categorias.map((categoria) => (
          <div key={categoria.id}>
            <p className="mb-1 flex items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Icono nombre={categoria.icono} className="h-3.5 w-3.5" />{categoria.nombre}
            </p>
            <div className="space-y-1">
              {categoria.apps.flatMap((app) => app.items.map((item) => (
                <BotonMenu key={item.id} activo={vista === item.id} onClick={() => ir(item.id)} icono={item.icono}
                  insignia={app.nivel === 'r' ? <Badge tono="slate">Solo lectura</Badge> : null}>
                  {item.label}
                </BotonMenu>
              )))}
            </div>
          </div>
        ))}

        <div>
          <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Administración</p>
          <div className="space-y-1">
            {esAdmin && <BotonMenu activo={vista === 'tienda'} onClick={() => ir('tienda')} icono="Store">Tienda de Apps</BotonMenu>}
            {esAdmin && <BotonMenu activo={vista === 'usuarios'} onClick={() => ir('usuarios')} icono="Users">Usuarios</BotonMenu>}
            {esAdmin && <BotonMenu activo={vista === 'roles'} onClick={() => ir('roles')} icono="ShieldCheck">Roles y permisos</BotonMenu>}
            {esAdmin && menu && menu.demo && <BotonMenu activo={vista === 'demo'} onClick={() => ir('demo')} icono="Megaphone">Guía de demostración</BotonMenu>}
            <BotonMenu activo={vista === 'cuenta'} onClick={() => ir('cuenta')} icono="KeyRound">Mi cuenta</BotonMenu>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 p-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <UserCircle className="h-8 w-8 shrink-0 text-slate-500" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-100">{sesion.usuario.nombre}</p>
            <p className="truncate text-xs text-slate-400">{sesion.usuario.rolNombre}</p>
          </div>
        </div>
        <Boton variante="secundario" className="w-full" onClick={onSalir}><LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión</Boton>
      </div>
    </nav>
  );
}

function Toasts({avisos, cerrar}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className={cx('pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg', COLOR_TOAST[a.tono] || COLOR_TOAST.sky)}>
          <span className="flex-1">{a.texto}</span>
          <button type="button" onClick={() => cerrar(a.id)} aria-label="Cerrar aviso" className="opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function Aplicacion({sesion, onSalir, onActualizarUsuario}) {
  const [menu, setMenu] = useState(null);
  const [errorMenu, setErrorMenu] = useState(null);
  const [vista, setVista] = useState('panel');
  const [avisos, setAvisos] = useState([]);
  const [consolaAbierta, setConsolaAbierta] = useState(false);
  const [menuMovil, setMenuMovil] = useState(false);
  const esAdmin = sesion.usuario.rol === 'admin';
  const [tecnicoActivado, setTecnicoActivado] = useState(() => {
    try {
      return localStorage.getItem('nexus.modoTecnico') === '1';
    } catch (error) {
      return false;
    }
  });
  /* Solo un administrador puede ver las herramientas técnicas, y siempre arrancan apagadas hasta que las activa */
  const modoTecnico = esAdmin && tecnicoActivado;
  const alternarTecnico = useCallback(() => {
    setTecnicoActivado((actual) => {
      try {
        localStorage.setItem('nexus.modoTecnico', actual ? '0' : '1');
      } catch (error) {
        /* Sin almacenamiento local la preferencia solo dura mientras la pestaña esté abierta */
      }
      return !actual;
    });
  }, []);

  const recargarMenu = useCallback(async () => {
    const r = await api('/api/store/menu', {traza: false});
    if (r.ok) {
      setMenu(r.datos);
      setErrorMenu(null);
    } else setErrorMenu(r.datos);
    return r.ok ? r.datos : null;
  }, []);

  useEffect(() => {
    recargarMenu();
  }, [recargarMenu, sesion.token]);

  const notificar = useCallback((tono, texto) => {
    const id = `${Date.now()}-${Math.random()}`;
    setAvisos((previos) => [...previos.slice(-3), {id, tono, texto}]);
    setTimeout(() => setAvisos((previos) => previos.filter((a) => a.id !== id)), 6000);
  }, []);

  const cerrarAviso = useCallback((id) => setAvisos((previos) => previos.filter((a) => a.id !== id)), []);

  /* Nivel de acceso del rol sobre un módulo: 'rw', 'r' o null si el módulo no está activo o el rol no lo ve */
  const nivelDe = useCallback((moduloId) => {
    if (!menu) return null;
    for (const categoria of menu.categorias) {
      const app = categoria.apps.find((a) => a.id === moduloId);
      if (app) return app.nivel;
    }
    return null;
  }, [menu]);

  /* Ítems que el menú permite abrir. Si un módulo se desactiva mientras se está en él, se vuelve al panel. */
  const itemsPermitidos = useMemo(() => {
    const ids = new Set(['panel', 'cuenta']);
    if (sesion.usuario.rol === 'admin') {
      ids.add('tienda');
      ids.add('usuarios');
      ids.add('roles');
      if (menu && menu.demo) ids.add('demo');
    }
    if (menu) menu.categorias.forEach((c) => c.apps.forEach((a) => a.items.forEach((i) => ids.add(i.id))));
    return ids;
  }, [menu, sesion.usuario.rol]);

  useEffect(() => {
    if (menu && !itemsPermitidos.has(vista)) setVista('panel');
  }, [menu, itemsPermitidos, vista]);

  /* Al cargar el menú por primera vez, cada rol aterriza directo en su pantalla de trabajo */
  const [aterrizado, setAterrizado] = useState(false);
  useEffect(() => {
    if (!menu || aterrizado) return;
    setAterrizado(true);
    /* La pantalla de inicio la define el administrador para cada rol; si no hay una, se usa la primera disponible */
    const primera = menu.categorias.flatMap((c) => c.apps.flatMap((a) => a.items))[0];
    const destino = menu.inicio || (sesion.usuario.rol === 'admin' ? 'panel' : primera && primera.id);
    if (destino && itemsPermitidos.has(destino)) setVista(destino);
  }, [menu, aterrizado, itemsPermitidos, sesion.usuario.rol]);

  /* Módulo al que pertenece la pantalla actual, para avisar cuando el rol solo puede consultarla */
  const nivelDeVista = useMemo(() => {
    if (!menu) return null;
    for (const categoria of menu.categorias) {
      for (const app of categoria.apps) if (app.items.some((i) => i.id === vista)) return app.nivel;
    }
    return null;
  }, [menu, vista]);

  const contexto = useMemo(() => ({
    sesion, menu: menu || {categorias: [], activos: [], visibles: []}, nivelDe, irA: setVista, notificar, recargarMenu, actualizarUsuario: onActualizarUsuario, modoTecnico
  }), [sesion, menu, nivelDe, notificar, recargarMenu, onActualizarUsuario, modoTecnico]);

  const Vista = VISTAS[vista] || Dashboard;

  return (
    <NexusContexto.Provider value={contexto}>
      <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-200">
        <aside className="hidden w-64 shrink-0 border-r border-slate-800 lg:block">
          <BarraLateral sesion={sesion} menu={menu} vista={vista} irA={setVista} onSalir={onSalir} cerrarMovil={() => {}} />
        </aside>

        {menuMovil && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="w-72 max-w-[85vw] border-r border-slate-800 shadow-xl">
              <BarraLateral sesion={sesion} menu={menu} vista={vista} irA={setVista} onSalir={onSalir} cerrarMovil={() => setMenuMovil(false)} />
            </div>
            <button type="button" aria-label="Cerrar menú" className="flex-1 bg-slate-950/70" onClick={() => setMenuMovil(false)} />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
            <button type="button" className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 lg:hidden" aria-label="Abrir menú" onClick={() => setMenuMovil(true)}>
              <IconoMenu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
              <span className="truncate font-medium text-slate-100">{sesion.empresa.nombre}</span>
              <Badge tono="sky">{sesion.usuario.rolNombre}</Badge>
              {modoTecnico && <Badge tono="emerald">Sesión JWT · empresa {sesion.empresa.id}</Badge>}
            </div>
            {esAdmin && (
              <Boton variante={modoTecnico ? 'primario' : 'fantasma'} pequeno onClick={alternarTecnico} aria-pressed={modoTecnico}>
                <Terminal className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Modo técnico {modoTecnico ? 'activado' : 'apagado'}</span>
              </Boton>
            )}
            {modoTecnico && (
              <Boton variante={consolaAbierta ? 'primario' : 'secundario'} pequeno onClick={() => setConsolaAbierta((a) => !a)} aria-pressed={consolaAbierta}>
                <span className="hidden sm:inline">Consola de trazabilidad</span>
                {consolaAbierta ? <PanelBottomClose className="h-4 w-4" aria-hidden="true" /> : <PanelBottomOpen className="h-4 w-4" aria-hidden="true" />}
              </Boton>
            )}
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {sesion.usuario.debeCambiarPassword && vista !== 'cuenta' && (
              <div className="mb-4">
                <Aviso tono="amber">Tu contraseña es temporal. <button type="button" className="underline" onClick={() => setVista('cuenta')}>Cámbiala ahora</button> para proteger tu cuenta.</Aviso>
              </div>
            )}
            {errorMenu && <div className="mb-4"><Aviso tono="rose">No se pudo cargar el menú: {mensajeAmigable(errorMenu)}</Aviso></div>}
            {nivelDeVista === 'r' && <div className="mb-4"><Aviso tono="sky">Solo lectura: puedes consultar esta información, pero no modificarla.</Aviso></div>}
            {menu ? <LimiteDeError key={vista} alVolver={() => setVista('panel')}><Vista /></LimiteDeError> : <Cargando texto="Preparando tu espacio de trabajo…" />}
          </main>

          {modoTecnico && consolaAbierta && (
            <section aria-label="Consola de trazabilidad" className="border-t border-slate-800 bg-slate-950 p-3">
              <LogConsole altura="h-64" />
            </section>
          )}
        </div>
      </div>
      <Toasts avisos={avisos} cerrar={cerrarAviso} />
    </NexusContexto.Provider>
  );
}

export default function App() {
  const [sesion, setSesion] = useState(() => {
    const guardada = leerSesionGuardada();
    if (guardada) fijarToken(guardada.token);
    return guardada;
  });
  const [motivo, setMotivo] = useState(null);

  const cerrar = useCallback((mensaje) => {
    fijarToken(null);
    guardarSesion(null);
    setSesion(null);
    setMotivo(mensaje || null);
  }, []);

  useEffect(() => {
    alSesionExpirada((datos) => cerrar((datos && datos.mensaje) || 'Tu sesión expiró. Inicia sesión de nuevo.'));
    return () => alSesionExpirada(null);
  }, [cerrar]);

  const iniciar = useCallback((nueva) => {
    fijarToken(nueva.token);
    guardarSesion(nueva);
    setMotivo(null);
    setSesion(nueva);
  }, []);

  const salir = useCallback(async () => {
    await api('/api/auth/logout', {metodo: 'POST'});
    cerrar(null);
  }, [cerrar]);

  const actualizarUsuario = useCallback((usuario) => {
    setSesion((actual) => {
      if (!actual) return actual;
      const siguiente = {...actual, usuario: {...actual.usuario, ...usuario}};
      guardarSesion(siguiente);
      return siguiente;
    });
  }, []);

  if (!sesion) {
    return (
      <>
        {motivo && <div className="mx-auto max-w-md px-4 pt-6"><Aviso tono="amber">{motivo}</Aviso></div>}
        <Login onSesion={iniciar} />
      </>
    );
  }
  return <Aplicacion sesion={sesion} onSalir={salir} onActualizarUsuario={actualizarUsuario} />;
}
