import React from 'react';
import {Badge, CabeceraVista, Cargando, ErrorVista, Tabla, fechaHora, numero, useCargar} from '../components/ui.jsx';

export default function Kardex() {
  const movimientos = useCargar('/api/inventario/movimientos?limite=150', {intervalo: 4000});
  if (movimientos.error) return <ErrorVista error={movimientos.error} />;
  if (!movimientos.datos) return <Cargando />;
  return (
    <div>
      <CabeceraVista titulo="Kárdex de movimientos" descripcion="Historial de entradas y salidas. Las salidas con origen «finanzas:FE-…» las genera automáticamente el módulo de Facturación al emitir una factura." />
      <Tabla vacio="Aún no hay movimientos. Emite una factura o registra una entrada de mercancía." columnas={[
        {titulo: 'Fecha', celda: (m) => fechaHora(m.ts)},
        {titulo: 'Tipo', celda: (m) => <Badge tono={m.tipo === 'salida' ? 'rose' : 'emerald'}>{m.tipo}</Badge>},
        {titulo: 'Producto', celda: (m) => <div><p>{m.producto}</p><p className="font-mono text-xs text-slate-500">{m.sku}</p></div>},
        {titulo: 'Cantidad', derecha: true, celda: (m) => <span className="font-mono">{m.tipo === 'salida' ? '-' : '+'}{numero(m.cantidad)}</span>},
        {titulo: 'Saldo', derecha: true, celda: (m) => <span className="font-mono text-slate-400">{numero(m.saldoAnterior)} → {numero(m.saldo)}</span>},
        {titulo: 'Origen', celda: (m) => <span className={m.origen.startsWith('finanzas') ? 'font-mono text-xs text-sky-300' : 'text-xs text-slate-400'}>{m.origen}</span>}
      ]} filas={movimientos.datos.movimientos} />
    </div>
  );
}
