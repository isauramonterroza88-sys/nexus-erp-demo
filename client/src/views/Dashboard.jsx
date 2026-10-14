import React, {useEffect, useState} from 'react';
import {Fingerprint, Network, Zap, ShieldAlert} from 'lucide-react';
import {api, decodificarJwt} from '../api.js';
import {Aviso, Badge, Boton, Card, CabeceraVista, Cargando, Icono, Kpi, useCargar, useNexus} from '../components/ui.jsx';
import LogConsole from '../components/LogConsole.jsx';

const ETIQUETAS = {clientes: 'Clientes', oportunidades: 'Oportunidades', facturas: 'Facturas', productos: 'Productos', tickets: 'Órdenes de soporte', empleados: 'Personal', mensajes: 'Mensajes enviados'};

function SegundosRestantes({expira}) {
  const [ahora, setAhora] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setAhora(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const restante = Math.max(0, expira - ahora);
  const h = Math.floor(restante / 3600);
  const m = Math.floor((restante % 3600) / 60);
  return <span className="font-mono text-emerald-300">{h} h {String(m).padStart(2, '0')} min {String(restante % 60).padStart(2, '0')} s</span>;
}

function InspectorJwt({token}) {
  const [mostrarCompleto, setMostrarCompleto] = useState(false);
  const partes = decodificarJwt(token);
  if (!partes) return <Aviso tono="rose">No se pudo decodificar el token.</Aviso>;
  const [cab, cuerpo, firma] = token.split('.');
  return (
    <div className="space-y-3 text-xs">
      <div className="break-all font-mono leading-relaxed">
        <span className="text-rose-300">{cab}</span>.<span className="text-violet-300">{cuerpo}</span>.<span className="text-sky-300">{mostrarCompleto ? firma : `${firma.slice(0, 12)}…`}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <pre className="overflow-auto rounded-md bg-slate-950 p-2 font-mono text-rose-200">{JSON.stringify(partes.cabecera, null, 2)}</pre>
        <pre className="overflow-auto rounded-md bg-slate-950 p-2 font-mono text-violet-200">{JSON.stringify(partes.payload, null, 2)}</pre>
      </div>
      <p className="text-slate-400">Expira en <SegundosRestantes expira={partes.payload.exp} />. El servidor verifica la firma HS256 y la empresa (<b className="text-slate-200">cid = {partes.payload.cid}</b>) en cada petición.</p>
      <Boton pequeno onClick={() => setMostrarCompleto((m) => !m)}>{mostrarCompleto ? 'Ocultar firma' : 'Ver firma completa'}</Boton>
    </div>
  );
}

function PruebaAislamiento({empresaPropia}) {
  const [empresas, setEmpresas] = useState([]);
  const [resultado, setResultado] = useState(null);
  useEffect(() => {
    api('/api/auth/empresas', {conToken: false, traza: false}).then((r) => r.ok && setEmpresas(r.datos.empresas));
  }, []);
  const otras = empresas.filter((e) => e.id !== empresaPropia);
  const probar = async (objetivo) => {
    const r = await api('/api/trazabilidad/prueba-aislamiento', {metodo: 'POST', cuerpo: {empresaObjetivo: objetivo}});
    setResultado({status: r.status, datos: r.datos, objetivo});
  };
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-400">Tu sesión pertenece a <b className="text-slate-100">{empresaPropia}</b>. Intenta abrir los datos de otra empresa para comprobar que el servidor lo impide.</p>
      <div className="flex flex-wrap gap-2">
        {otras.map((e) => <Boton key={e.id} variante="peligro" pequeno onClick={() => probar(e.id)}><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />Leer datos de «{e.id}»</Boton>)}
        <Boton pequeno onClick={() => probar(empresaPropia)}>Leer mis propios datos</Boton>
      </div>
      {resultado && (
        <Aviso tono={resultado.status === 403 ? 'amber' : 'emerald'}>
          <span className="font-mono text-xs">HTTP {resultado.status} · {resultado.datos.error || 'OK'}</span><br />{resultado.datos.mensaje}
        </Aviso>
      )}
    </div>
  );
}

function DemoFlujo({onTerminado}) {
  const {menu, nivelDe, notificar} = useNexus();
  const [ejecutando, setEjecutando] = useState(false);
  const [efectos, setEfectos] = useState(null);
  const puede = nivelDe('finanzas') === 'rw' && menu.visibles.includes('ventas_crm');

  const ejecutar = async () => {
    setEjecutando(true);
    setEfectos(null);
    const clientes = await api('/api/crm/clientes');
    if (!clientes.ok || clientes.datos.clientes.length === 0) {
      notificar('amber', 'Necesitas al menos un cliente en el CRM para facturar.');
      setEjecutando(false);
      return;
    }
    const cliente = clientes.datos.clientes.find((c) => c.estadoCuenta === 'activo') || clientes.datos.clientes[0];
    let items = [{descripcion: 'Servicio de demostración de integración', cantidad: 1, precioUnitario: 250000, ivaPct: 19}];
    if (menu.visibles.includes('cadena_suministro')) {
      const productos = await api('/api/inventario/productos');
      const producto = productos.ok && productos.datos.productos.find((p) => p.stock >= 2);
      if (producto) items = [{sku: producto.sku, cantidad: 2}];
    }
    const factura = await api('/api/finanzas/facturas', {metodo: 'POST', cuerpo: {clienteId: cliente.id, items}});
    if (!factura.ok) {
      notificar('rose', factura.datos.mensaje);
      setEjecutando(false);
      return;
    }
    const pago = await api(`/api/finanzas/facturas/${factura.datos.factura.id}/pagar`, {metodo: 'POST', cuerpo: {metodoPago: 'transferencia', referencia: 'DEMO-INTEGRACION'}});
    setEfectos({emision: factura.datos.efectos, pago: pago.ok ? pago.datos.efectos : []});
    notificar('emerald', `Factura ${factura.datos.factura.numero} emitida y pagada. Mira la consola.`);
    setEjecutando(false);
    if (onTerminado) onTerminado();
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-400">Emite una factura y la paga: Finanzas publica eventos y los módulos activos reaccionan (stock, comprobante digital, métricas, confirmación).</p>
      <Boton variante="primario" onClick={ejecutar} cargando={ejecutando} disabled={!puede}><Zap className="h-4 w-4" aria-hidden="true" />Facturar y pagar</Boton>
      {!puede && <p className="text-xs text-amber-300">Requiere el módulo Facturación activo y un rol con escritura en Finanzas (administrador o finanzas).</p>}
      {efectos && (
        <ul className="space-y-1 text-xs">
          {[...efectos.emision.map((e) => ({...e, evento: 'Factura emitida'})), ...efectos.pago.map((e) => ({...e, evento: 'Factura pagada'}))].map((e, i) => (
            <li key={i} className="flex items-center gap-2"><Badge tono={e.estado === 'ok' ? 'emerald' : e.estado === 'omitido' ? 'amber' : 'rose'}>{e.estado}</Badge><span className="text-slate-300">{e.evento} → {e.modulo}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccesosRapidos() {
  const {menu, irA} = useNexus();
  const items = menu.categorias.flatMap((c) => c.apps.flatMap((a) => a.items));
  if (items.length === 0) return <p className="text-sm text-slate-400">Todavía no hay aplicaciones activas. Un administrador puede activarlas en la Tienda de Apps.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => irA(item.id)} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-left text-sm text-slate-200 hover:border-sky-600 hover:bg-slate-800">
          <Icono nombre={item.icono} className="h-5 w-5 shrink-0 text-sky-400" />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const {sesion, modoTecnico} = useNexus();
  const {datos, cargando, recargar} = useCargar('/api/trazabilidad/estado', {intervalo: 6000});
  return (
    <div>
      <CabeceraVista titulo={`Panel de ${sesion.empresa.nombre}`} descripcion={modoTecnico ? 'Resumen de tu empresa y panel de trazabilidad: sesión JWT, aislamiento multi-empresa y sincronización entre módulos en tiempo real.' : 'Resumen de tu empresa y accesos directos a tus aplicaciones.'} />
      {cargando && !datos ? <Cargando /> : datos && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi etiqueta="Módulos activos" valor={`${datos.modulosActivos.length} de 7`} nota="Contratados por tu empresa" icono="Store" tono="violet" />
            {Object.entries(datos.registros).filter(([, n]) => n > 0).slice(0, 3).map(([k, n]) => <Kpi key={k} etiqueta={ETIQUETAS[k]} valor={n} nota="Solo de tu empresa" icono="Users" />)}
          </div>
          <div className="mb-5">
            <Card titulo="Accesos rápidos" subtitulo="Entra directo a lo que usas todos los días"><AccesosRapidos /></Card>
          </div>
          {modoTecnico && (<>
          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <Card titulo="Seguridad de la sesión" subtitulo="JSON Web Token emitido al iniciar sesión">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><Fingerprint className="h-4 w-4 text-sky-400" aria-hidden="true" /> {datos.sesion.usuario} · <Badge tono="sky">{datos.sesion.rol}</Badge></div>
              <InspectorJwt token={sesion.token} />
            </Card>
            <Card titulo="Aislamiento multi-empresa" subtitulo={`${datos.aislamiento.almacenesEnElServidor} empresas en el servidor, ${datos.aislamiento.almacenesVisiblesParaTi} visible para ti`}>
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><Network className="h-4 w-4 text-emerald-400" aria-hidden="true" /> company_id de tu sesión: <span className="font-mono text-emerald-300">{datos.empresa.id}</span></div>
              <PruebaAislamiento empresaPropia={datos.empresa.id} />
            </Card>
          </div>
          <div className="mb-5 grid gap-4 lg:grid-cols-3">
            <Card titulo="Sincronización inter-modular" className="lg:col-span-1"><DemoFlujo onTerminado={recargar} /></Card>
            <div className="lg:col-span-2">
              <LogConsole altura="h-80" />
            </div>
          </div>
          </>)}
        </>
      )}
    </div>
  );
}
