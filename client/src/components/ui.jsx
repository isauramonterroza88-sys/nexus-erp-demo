import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {
  LayoutDashboard, Store, Users, Layers, FileText, Receipt, Wallet, Package, ArrowRightLeft, Megaphone, LifeBuoy, Briefcase,
  BarChart3, TrendingUp, Truck, ShieldCheck, KeyRound, LogOut, Terminal, X, Lock, Building2, AlertTriangle, CheckCircle2, XCircle, Loader2
} from 'lucide-react';
import {api} from '../api.js';

export const ICONOS = {
  LayoutDashboard, Store, Users, Layers, FileText, Receipt, Wallet, Package, ArrowRightLeft, Megaphone, LifeBuoy, Briefcase,
  BarChart3, TrendingUp, Truck, ShieldCheck, KeyRound, LogOut, Terminal, Lock, Building2
};

export function Icono({nombre, className = 'h-4 w-4'}) {
  const Componente = ICONOS[nombre] || Layers;
  return <Componente className={className} aria-hidden="true" />;
}

export const cx = (...clases) => clases.filter(Boolean).join(' ');

/* ------------------------------ Formatos ------------------------------ */

export const cop = (n) => new Intl.NumberFormat('es-CO', {style: 'currency', currency: 'COP', maximumFractionDigits: 0}).format(n || 0);
export const numero = (n) => new Intl.NumberFormat('es-CO').format(n || 0);
export const fecha = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', {day: 'numeric', month: 'short', year: 'numeric'}) : '—');
export const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-CO', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—');

/* ------------------------------ Contexto de la aplicación ------------------------------ */

export const NexusContexto = createContext(null);
export const useNexus = () => useContext(NexusContexto);

/* ------------------------------ Carga de datos ------------------------------ */

/* Carga una ruta de la API y permite recargarla. Con "intervalo" se actualiza sola (sin dejar rastro en la consola). */
export function useCargar(ruta, {intervalo = 0, activo = true} = {}) {
  const [estado, setEstado] = useState({datos: null, error: null, cargando: true});
  const rutaRef = useRef(ruta);
  rutaRef.current = ruta;

  const cargar = useCallback(async (silencioso) => {
    if (!rutaRef.current) return;
    const respuesta = await api(rutaRef.current, {traza: !silencioso});
    setEstado({datos: respuesta.ok ? respuesta.datos : null, error: respuesta.ok ? null : {status: respuesta.status, ...(respuesta.datos || {})}, cargando: false});
  }, []);

  useEffect(() => {
    if (!activo || !ruta) return undefined;
    setEstado((previo) => ({...previo, cargando: true}));
    cargar(false);
    if (!intervalo) return undefined;
    const temporizador = setInterval(() => cargar(true), intervalo);
    return () => clearInterval(temporizador);
  }, [ruta, intervalo, activo, cargar]);

  return {...estado, recargar: () => cargar(false)};
}

/* ------------------------------ Componentes básicos ------------------------------ */

const TONOS = {
  slate: 'bg-slate-800 text-slate-300 ring-slate-700',
  emerald: 'bg-emerald-950 text-emerald-300 ring-emerald-800',
  amber: 'bg-amber-950 text-amber-300 ring-amber-800',
  rose: 'bg-rose-950 text-rose-300 ring-rose-800',
  sky: 'bg-sky-950 text-sky-300 ring-sky-800',
  violet: 'bg-violet-950 text-violet-300 ring-violet-800'
};

export function Badge({tono = 'slate', children, className}) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONOS[tono], className)}>{children}</span>;
}

export function Card({titulo, subtitulo, accion, children, className}) {
  return (
    <section className={cx('rounded-xl border border-slate-800 bg-slate-900 p-5', className)}>
      {(titulo || accion) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {titulo && <h2 className="text-base font-semibold text-slate-100">{titulo}</h2>}
            {subtitulo && <p className="mt-0.5 text-sm text-slate-400">{subtitulo}</p>}
          </div>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({etiqueta, valor, nota, icono, tono = 'sky'}) {
  const colores = {sky: 'text-sky-400', emerald: 'text-emerald-400', amber: 'text-amber-400', rose: 'text-rose-400', violet: 'text-violet-400'};
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>{etiqueta}</span>
        {icono && <Icono nombre={icono} className={cx('h-4 w-4', colores[tono])} />}
      </div>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}

const VARIANTES = {
  primario: 'bg-sky-600 text-white hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-400',
  secundario: 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50',
  peligro: 'border border-rose-800 bg-rose-950 text-rose-200 hover:bg-rose-900 disabled:opacity-50',
  exito: 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400',
  fantasma: 'text-slate-300 hover:bg-slate-800 disabled:opacity-50'
};

export function Boton({variante = 'secundario', pequeno, cargando, className, children, ...props}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || cargando}
      className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500', pequeno ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm', VARIANTES[variante], className)}
    >
      {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export const CLASE_INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';

export function Campo({etiqueta, ayuda, children, className}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-300">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  );
}

export function Aviso({tono = 'sky', icono, children}) {
  const estilos = {
    sky: 'border-sky-800 bg-sky-950/60 text-sky-200', amber: 'border-amber-800 bg-amber-950/60 text-amber-200',
    rose: 'border-rose-800 bg-rose-950/60 text-rose-200', emerald: 'border-emerald-800 bg-emerald-950/60 text-emerald-200'
  };
  const Mapa = {sky: CheckCircle2, amber: AlertTriangle, rose: XCircle, emerald: CheckCircle2}[tono];
  return (
    <div className={cx('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', estilos[tono])} role="alert">
      {icono || <Mapa className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}

export function Cargando({texto = 'Cargando…'}) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {texto}
    </div>
  );
}

export function Vacio({children}) {
  return <div className="rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

/* Error de una vista: explica por qué la API rechazó la petición (módulo inactivo, rol, etc.) */
const MENSAJES_AMIGABLES = {
  MODULO_INACTIVO: 'Esta aplicación no está activa en tu empresa. Pide a un administrador que la active en la Tienda de Apps.',
  ROL_SIN_ACCESO: 'Tu rol no tiene permiso para entrar a esta sección. Si la necesitas, pídele acceso a un administrador.',
  SIN_CONEXION: 'No hay conexión con el servidor. Revisa tu internet o avisa a quien administra el sistema.',
  ERROR_INTERNO: 'Algo salió mal de nuestro lado. Intenta de nuevo en unos segundos.',
  RUTA_NO_ENCONTRADA: 'No encontramos lo que buscas. Vuelve al panel e intenta de nuevo.'
};

/* Texto sencillo para el usuario. Los mensajes que ya vienen redactados por el servidor se respetan. */
export const mensajeAmigable = (error) => (error && MENSAJES_AMIGABLES[error.error]) || (error && error.mensaje) || 'No se pudo cargar la información.';

export function ErrorVista({error}) {
  const {irA, modoTecnico} = useNexus();
  if (!error) return null;
  const bloqueado = error.error === 'MODULO_INACTIVO' || error.error === 'ROL_SIN_ACCESO';
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-rose-900 bg-rose-950/40 p-6 text-center">
      <Lock className="mx-auto h-8 w-8 text-rose-400" aria-hidden="true" />
      {modoTecnico && <p className="mt-2 text-xs font-mono text-rose-300">HTTP {error.status} · {error.error || 'ERROR'}</p>}
      <p className="mt-2 text-sm text-slate-200">{mensajeAmigable(error)}</p>
      {bloqueado && <Boton className="mt-4" variante="primario" onClick={() => irA('panel')}>Volver al panel</Boton>}
    </div>
  );
}

export function Tabla({columnas, filas, vacio = 'No hay registros para mostrar.', claveFila = (f) => f.id}) {
  if (!filas || filas.length === 0) return <Vacio>{vacio}</Vacio>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-800/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>{columnas.map((c) => <th key={c.titulo} className={cx('px-3 py-2 font-medium', c.derecha && 'text-right')}>{c.titulo}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {filas.map((fila) => (
            <tr key={claveFila(fila)} className="hover:bg-slate-800/40">
              {columnas.map((c) => <td key={c.titulo} className={cx('px-3 py-2 align-middle text-slate-200', c.derecha && 'text-right')}>{c.celda(fila)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({titulo, onCerrar, ancho = 'max-w-lg', children}) {
  useEffect(() => {
    const manejar = (e) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', manejar);
    return () => window.removeEventListener('keydown', manejar);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pt-12" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className={cx('w-full rounded-xl border border-slate-700 bg-slate-900 shadow-2xl', ancho)}>
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h3 className="text-base font-semibold text-slate-100">{titulo}</h3>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Cerrar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* Formulario genérico dentro de un modal. onGuardar(valores) debe devolver la respuesta de api(). */
export function FormularioModal({titulo, campos, inicial = {}, onGuardar, onCerrar, textoGuardar = 'Guardar', ancho, descripcion}) {
  const [valores, setValores] = useState(() => {
    const base = {};
    for (const c of campos) base[c.nombre] = inicial[c.nombre] !== undefined ? inicial[c.nombre] : c.defecto !== undefined ? c.defecto : c.tipo === 'multi' ? [] : c.tipo === 'checkbox' ? false : '';
    return base;
  });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (nombre, valor) => setValores((v) => ({...v, [nombre]: valor}));

  const enviar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const salida = {};
    for (const c of campos) {
      const v = valores[c.nombre];
      if (c.tipo === 'number') salida[c.nombre] = v === '' ? undefined : Number(v);
      else if (c.tipo === 'select' && c.numerico) salida[c.nombre] = v === '' ? undefined : Number(v);
      else if (c.tipo === 'multi' || c.tipo === 'checkbox') salida[c.nombre] = v;
      else salida[c.nombre] = v === '' ? undefined : v;
    }
    const respuesta = await onGuardar(salida);
    setEnviando(false);
    if (respuesta && respuesta.ok) onCerrar(respuesta.datos);
    else setError((respuesta && respuesta.datos && respuesta.datos.mensaje) || 'No se pudo guardar.');
  };

  return (
    <Modal titulo={titulo} onCerrar={() => onCerrar()} ancho={ancho}>
      <form onSubmit={enviar} className="space-y-4">
        {descripcion && <p className="text-sm text-slate-400">{descripcion}</p>}
        {campos.map((c) => (
          <Campo key={c.nombre} etiqueta={c.etiqueta} ayuda={c.ayuda}>
            {c.tipo === 'select' ? (
              <select className={CLASE_INPUT} value={valores[c.nombre]} onChange={(e) => cambiar(c.nombre, e.target.value)} required={c.requerido}>
                {c.vacio && <option value="">{c.vacio}</option>}
                {c.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
              </select>
            ) : c.tipo === 'textarea' ? (
              <textarea className={CLASE_INPUT} rows={3} value={valores[c.nombre]} onChange={(e) => cambiar(c.nombre, e.target.value)} required={c.requerido} />
            ) : c.tipo === 'checkbox' ? (
              <input type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-950" checked={valores[c.nombre]} onChange={(e) => cambiar(c.nombre, e.target.checked)} />
            ) : c.tipo === 'multi' ? (
              <div className="flex flex-wrap gap-2">
                {c.opciones.map((o) => {
                  const marcada = valores[c.nombre].includes(o.valor);
                  return (
                    <button key={o.valor} type="button" aria-pressed={marcada} onClick={() => cambiar(c.nombre, marcada ? valores[c.nombre].filter((x) => x !== o.valor) : [...valores[c.nombre], o.valor])}
                      className={cx('rounded-full border px-3 py-1 text-xs', marcada ? 'border-sky-500 bg-sky-950 text-sky-200' : 'border-slate-700 text-slate-400 hover:bg-slate-800')}>
                      {o.texto}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input className={CLASE_INPUT} type={c.tipo || 'text'} value={valores[c.nombre]} onChange={(e) => cambiar(c.nombre, e.target.value)} required={c.requerido} placeholder={c.placeholder} step={c.paso} min={c.min} max={c.max} autoComplete="off" />
            )}
          </Campo>
        ))}
        {error && <Aviso tono="rose">{error}</Aviso>}
        <div className="flex justify-end gap-2 pt-1">
          <Boton onClick={() => onCerrar()}>Cancelar</Boton>
          <Boton variante="primario" type="submit" cargando={enviando}>{textoGuardar}</Boton>
        </div>
      </form>
    </Modal>
  );
}

/* Editor de ítems para cotizaciones y facturas. Con productos del inventario permite elegir por SKU. */
export function EditorItems({items, onCambiar, productos}) {
  const actualizar = (indice, cambios) => onCambiar(items.map((it, i) => (i === indice ? {...it, ...cambios} : it)));
  const elegirProducto = (indice, sku) => {
    const p = productos && productos.find((x) => x.sku === sku);
    actualizar(indice, p ? {sku, descripcion: p.nombre, precioUnitario: p.precioUnitario, ivaPct: p.ivaPct} : {sku: ''});
  };
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-slate-800 p-2">
          {productos ? (
            <div className="col-span-12 md:col-span-5">
              <select className={CLASE_INPUT} value={it.sku || ''} onChange={(e) => elegirProducto(i, e.target.value)} aria-label="Producto">
                <option value="">Selecciona un producto…</option>
                {productos.map((p) => <option key={p.sku} value={p.sku}>{p.sku} · {p.nombre} (stock {p.stock})</option>)}
              </select>
            </div>
          ) : (
            <div className="col-span-12 md:col-span-5">
              <input className={CLASE_INPUT} placeholder="Descripción del bien o servicio" value={it.descripcion || ''} onChange={(e) => actualizar(i, {descripcion: e.target.value})} aria-label="Descripción" />
            </div>
          )}
          <input className={cx(CLASE_INPUT, 'col-span-3 md:col-span-2')} type="number" min="1" value={it.cantidad} onChange={(e) => actualizar(i, {cantidad: Number(e.target.value)})} aria-label="Cantidad" />
          <input className={cx(CLASE_INPUT, 'col-span-4 md:col-span-3')} type="number" min="0" value={it.precioUnitario} onChange={(e) => actualizar(i, {precioUnitario: Number(e.target.value)})} aria-label="Precio unitario" />
          <input className={cx(CLASE_INPUT, 'col-span-3 md:col-span-1')} type="number" min="0" max="100" value={it.ivaPct} onChange={(e) => actualizar(i, {ivaPct: Number(e.target.value)})} aria-label="IVA %" />
          <button type="button" className="col-span-2 md:col-span-1 rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-rose-300" onClick={() => onCambiar(items.filter((_, n) => n !== i))} aria-label="Quitar ítem" disabled={items.length === 1}>
            <X className="mx-auto h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <Boton pequeno onClick={() => onCambiar([...items, {sku: '', descripcion: '', cantidad: 1, precioUnitario: 0, ivaPct: 19}])}>+ Agregar ítem</Boton>
      <p className="text-xs text-slate-500">Cantidad, precio unitario e IVA (%) por ítem.</p>
    </div>
  );
}

export const itemsAPayload = (items) => items.map((it) => ({
  sku: it.sku || undefined, descripcion: it.descripcion || undefined, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), ivaPct: Number(it.ivaPct)
}));

export function CabeceraVista({titulo, descripcion, accion}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-3xl text-sm text-slate-400">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

export function Filtros({opciones, valor, onCambiar}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button key={o.valor} type="button" aria-pressed={valor === o.valor} onClick={() => onCambiar(o.valor)}
          className={cx('rounded-full border px-3 py-1 text-xs', valor === o.valor ? 'border-sky-500 bg-sky-950 text-sky-200' : 'border-slate-700 text-slate-400 hover:bg-slate-800')}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export const TONO_CLASE = {AAA: 'violet', AA: 'sky', A: 'emerald', B: 'amber', C: 'slate'};
export const TIPOLOGIAS = [{valor: 'tienda_tradicional', texto: 'Tienda tradicional'}, {valor: 'minimercado', texto: 'Minimercado'}, {valor: 'autoservicio', texto: 'Autoservicio'}, {valor: 'institucional', texto: 'Institucional'}];
export const ZONAS = [{valor: 'urbana', texto: 'Urbana'}, {valor: 'cabecera', texto: 'Cabecera municipal'}, {valor: 'rural', texto: 'Rural'}];
export const nombreOpcion = (lista, valor) => (lista.find((o) => o.valor === valor) || {texto: valor}).texto;
