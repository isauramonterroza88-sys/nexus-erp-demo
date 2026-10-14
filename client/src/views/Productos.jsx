import React, {useState} from 'react';
import {api} from '../api.js';
import {Badge, Boton, CabeceraVista, Cargando, ErrorVista, FormularioModal, Kpi, Tabla, cop, numero, useCargar, useNexus} from '../components/ui.jsx';

const TONO = {ok: 'emerald', bajo: 'amber', agotado: 'rose'};

export default function Productos() {
  const {nivelDe, notificar} = useNexus();
  const puedeEscribir = nivelDe('cadena_suministro') === 'rw';
  const productos = useCargar('/api/inventario/productos', {intervalo: 5000});
  const [modal, setModal] = useState(null);
  if (productos.error) return <ErrorVista error={productos.error} />;
  if (!productos.datos) return <Cargando />;
  const {resumen} = productos.datos;
  const cerrar = (mensaje) => (datos) => { setModal(null); if (datos) { productos.recargar(); notificar('emerald', mensaje); } };

  return (
    <div>
      <CabeceraVista titulo="Productos y stock" descripcion="Existencias en tiempo real. Cuando Finanzas emite una factura, el stock se descuenta automáticamente y queda en el kárdex."
        accion={puedeEscribir ? <Boton variante="primario" onClick={() => setModal({tipo: 'nuevo'})}>+ Nuevo producto</Boton> : <Badge tono="amber">Solo lectura para tu rol</Badge>} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Kpi etiqueta="Unidades en bodega" valor={numero(resumen.unidades)} />
        <Kpi etiqueta="Valor del inventario" valor={cop(resumen.valorInventario)} tono="emerald" />
        <Kpi etiqueta="Productos en alerta" valor={resumen.enAlerta} tono={resumen.enAlerta ? 'rose' : 'emerald'} />
      </div>
      <Tabla vacio="Tu empresa aún no tiene productos. Crea el primero con «Nuevo producto»." columnas={[
        {titulo: 'Producto', celda: (p) => <div><p className="font-medium">{p.nombre}</p><p className="font-mono text-xs text-slate-500">{p.sku} · {p.categoria}</p></div>},
        {titulo: 'Precio', derecha: true, celda: (p) => cop(p.precioUnitario)},
        {titulo: 'Stock', derecha: true, celda: (p) => <span className="font-mono">{numero(p.stock)}</span>},
        {titulo: 'Mínimo', derecha: true, celda: (p) => <span className="font-mono text-slate-500">{numero(p.stockMinimo)}</span>},
        {titulo: 'Estado', celda: (p) => <Badge tono={TONO[p.estadoStock]}>{p.estadoStock === 'ok' ? 'Suficiente' : p.estadoStock === 'bajo' ? 'Stock bajo' : 'Agotado'}</Badge>},
        {titulo: '', celda: (p) => puedeEscribir && <div className="flex gap-1.5"><Boton pequeno onClick={() => setModal({tipo: 'entrada', producto: p})}>Entrada</Boton><Boton pequeno onClick={() => setModal({tipo: 'editar', producto: p})}>Editar</Boton></div>}
      ]} filas={productos.datos.productos} />

      {modal && modal.tipo === 'nuevo' && (
        <FormularioModal titulo="Nuevo producto" textoGuardar="Crear producto" campos={[
          {nombre: 'sku', etiqueta: 'Código (SKU)', requerido: true}, {nombre: 'nombre', etiqueta: 'Nombre', requerido: true}, {nombre: 'categoria', etiqueta: 'Categoría'},
          {nombre: 'precioUnitario', etiqueta: 'Precio unitario (COP)', tipo: 'number', requerido: true, min: 0}, {nombre: 'ivaPct', etiqueta: 'IVA (%)', tipo: 'number', defecto: 19, min: 0, max: 100},
          {nombre: 'stock', etiqueta: 'Existencias iniciales', tipo: 'number', defecto: 0, min: 0}, {nombre: 'stockMinimo', etiqueta: 'Stock mínimo', tipo: 'number', defecto: 0, min: 0}]}
          onGuardar={(v) => api('/api/inventario/productos', {metodo: 'POST', cuerpo: v})} onCerrar={cerrar('Producto creado.')} />
      )}
      {modal && modal.tipo === 'entrada' && (
        <FormularioModal titulo={`Entrada de mercancía: ${modal.producto.sku}`} descripcion={`Stock actual: ${modal.producto.stock}`} textoGuardar="Registrar entrada" campos={[
          {nombre: 'cantidad', etiqueta: 'Cantidad que ingresa', tipo: 'number', requerido: true, min: 1}, {nombre: 'referencia', etiqueta: 'Referencia (proveedor o remisión)'}]}
          onGuardar={(v) => api(`/api/inventario/productos/${modal.producto.id}/entrada`, {metodo: 'POST', cuerpo: v})} onCerrar={cerrar('Entrada registrada en el kárdex.')} />
      )}
      {modal && modal.tipo === 'editar' && (
        <FormularioModal titulo={`Editar ${modal.producto.sku}`} inicial={modal.producto} textoGuardar="Guardar cambios" campos={[
          {nombre: 'nombre', etiqueta: 'Nombre', requerido: true}, {nombre: 'precioUnitario', etiqueta: 'Precio unitario (COP)', tipo: 'number', min: 0}, {nombre: 'ivaPct', etiqueta: 'IVA (%)', tipo: 'number', min: 0, max: 100}, {nombre: 'stockMinimo', etiqueta: 'Stock mínimo', tipo: 'number', min: 0}]}
          onGuardar={(v) => api(`/api/inventario/productos/${modal.producto.id}`, {metodo: 'PATCH', cuerpo: v})} onCerrar={cerrar('Producto actualizado.')} />
      )}
    </div>
  );
}
