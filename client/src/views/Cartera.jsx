import React, {useState} from 'react';
import {Badge, Boton, Card, CabeceraVista, Cargando, ErrorVista, Kpi, Modal, Tabla, cop, fecha, useCargar} from '../components/ui.jsx';

const EDADES = [['vigente', 'Vigente'], ['d1_30', '1 a 30 días'], ['d31_60', '31 a 60 días'], ['d61_90', '61 a 90 días'], ['mas90', 'Más de 90 días']];

function EstadoCuenta({clienteId, onCerrar}) {
  const cuenta = useCargar(`/api/finanzas/estado-cuenta/${clienteId}`);
  return (
    <Modal titulo="Estado de cuenta" onCerrar={onCerrar} ancho="max-w-2xl">
      {!cuenta.datos ? <Cargando /> : (
        <div className="space-y-4 text-sm">
          <p className="text-slate-300"><b>{cuenta.datos.cliente.razonSocial}</b> · NIT {cuenta.datos.cliente.nit} · corte {fecha(cuenta.datos.corte)}</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[['Facturado', cuenta.datos.totales.facturado], ['Pagado', cuenta.datos.totales.pagado], ['Saldo', cuenta.datos.totales.saldo], ['Vencido', cuenta.datos.totales.vencido]].map(([k, v]) => <div key={k} className="rounded-lg border border-slate-800 p-3"><p className="text-xs text-slate-500">{k}</p><p className="font-semibold text-slate-100">{cop(v)}</p></div>)}
          </div>
          <Tabla claveFila={(m) => `${m.fecha}${m.concepto}`} columnas={[{titulo: 'Fecha', celda: (m) => fecha(m.fecha)}, {titulo: 'Concepto', celda: (m) => m.concepto}, {titulo: 'Cargo', derecha: true, celda: (m) => (m.cargo ? cop(m.cargo) : '—')}, {titulo: 'Abono', derecha: true, celda: (m) => (m.abono ? cop(m.abono) : '—')}, {titulo: 'Saldo', derecha: true, celda: (m) => cop(m.saldo)}]} filas={cuenta.datos.movimientos} />
        </div>
      )}
    </Modal>
  );
}

export default function Cartera() {
  const cartera = useCargar('/api/finanzas/cartera');
  const [cliente, setCliente] = useState(null);
  if (cartera.error) return <ErrorVista error={cartera.error} />;
  if (!cartera.datos) return <Cargando />;
  const c = cartera.datos;
  const maximo = Math.max(1, ...EDADES.map(([k]) => c.edadCartera[k].total));
  return (
    <div>
      <CabeceraVista titulo="Cartera y estados de cuenta" descripcion="Seguimiento de lo facturado, lo cobrado y lo que está en mora. Las comisiones del Motor Analítico se calculan solo sobre lo recaudado." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Facturado" valor={cop(c.totalFacturado)} />
        <Kpi etiqueta="Recaudado" valor={cop(c.totalCobrado)} tono="emerald" />
        <Kpi etiqueta="Por cobrar" valor={cop(c.totalPendiente)} nota={`${c.facturasPendientes} facturas`} tono="amber" />
        <Kpi etiqueta="Vencido" valor={cop(c.totalVencido)} tono="rose" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Edad de la cartera">
          <div className="space-y-3">
            {EDADES.map(([k, texto]) => (
              <div key={k}><div className="mb-1 flex justify-between text-sm"><span className="text-slate-300">{texto}</span><span className="text-slate-400">{c.edadCartera[k].facturas} · {cop(c.edadCartera[k].total)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={k === 'vigente' ? 'h-full bg-emerald-500' : 'h-full bg-rose-500'} style={{width: `${Math.round(c.edadCartera[k].total / maximo * 100)}%`}} /></div></div>
            ))}
          </div>
        </Card>
        <Card titulo="Saldo por cliente">
          <Tabla claveFila={(f) => f.clienteId} vacio="No hay saldos pendientes." columnas={[{titulo: 'Cliente', celda: (f) => f.razonSocial}, {titulo: 'Saldo', derecha: true, celda: (f) => cop(f.total)}, {titulo: 'Vencido', derecha: true, celda: (f) => (f.vencido ? <Badge tono="rose">{cop(f.vencido)}</Badge> : '—')}, {titulo: '', celda: (f) => <Boton pequeno onClick={() => setCliente(f.clienteId)}>Estado de cuenta</Boton>}]} filas={c.porCliente} />
        </Card>
      </div>
      {cliente && <EstadoCuenta clienteId={cliente} onCerrar={() => setCliente(null)} />}
    </div>
  );
}
