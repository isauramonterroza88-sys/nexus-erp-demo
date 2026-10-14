import React, {useEffect, useState} from 'react';
import {Calculator, Save} from 'lucide-react';
import {api} from '../api.js';
import {Aviso, Badge, Boton, Campo, Card, CabeceraVista, Cargando, CLASE_INPUT, cop, ErrorVista, Filtros, Kpi, numero, Tabla, TONO_CLASE, useCargar, useNexus} from '../components/ui.jsx';

const CLASES = ['AAA', 'AA', 'A', 'B', 'C'];
const OPCIONES_CLASE = [{valor: '', texto: 'Todas'}, ...CLASES.map((c) => ({valor: c, texto: c}))];

function Meta({cumple, texto}) {
  return <Badge tono={cumple ? 'emerald' : 'amber'}>{texto}</Badge>;
}

function TablaIndicadores({ind}) {
  const filas = [
    {id: 'dif', nombre: 'Difusión comercial', detalle: ind.difusionComercial.indicador, valor: `${ind.difusionComercial.porcentaje} %`, meta: `${ind.difusionComercial.meta} %`, cumple: ind.difusionComercial.porcentaje >= ind.difusionComercial.meta, base: `${ind.difusionComercial.clientesConCanal} de ${ind.difusionComercial.clientesActivos} clientes`},
    {id: 'doc', nombre: 'Gestión documental', detalle: ind.gestionDocumental.indicador, valor: `${ind.gestionDocumental.porcentaje} %`, meta: `${ind.gestionDocumental.meta} %`, cumple: ind.gestionDocumental.facturasEmitidas > 0 && ind.gestionDocumental.porcentaje >= ind.gestionDocumental.meta, base: `${ind.gestionDocumental.facturasDigitales} de ${ind.gestionDocumental.facturasEmitidas} facturas · ${numero(ind.gestionDocumental.hojasEvitadas)} hojas evitadas`},
    {id: 'efi', nombre: 'Eficiencia de procesos', detalle: ind.eficienciaProcesos.indicador, valor: `${ind.eficienciaProcesos.tiempoMedioSeg} s (máx. ${ind.eficienciaProcesos.tiempoMaxSeg} s)`, meta: `< ${ind.eficienciaProcesos.metaSeg} s`, cumple: ind.eficienciaProcesos.cumpleMeta, base: 'Tiempo medio de emisión'},
    {id: 'sto', nombre: 'Sincronización de stock', detalle: ind.sincronizacionStock.indicador, valor: `${ind.sincronizacionStock.tasaPorcentaje} %`, meta: `< ${ind.sincronizacionStock.metaPorcentaje} %`, cumple: ind.sincronizacionStock.cumpleMeta, base: `${ind.sincronizacionStock.quiebres} quiebres en ${ind.sincronizacionStock.preventas} preventas`},
    {id: 'fin', nombre: 'Gestión financiera', detalle: ind.gestionFinanciera.indicador, valor: `${ind.gestionFinanciera.porcentajeRecaudo} % recaudado`, meta: `Comisión ${ind.gestionFinanciera.comisionPct} %`, cumple: ind.gestionFinanciera.totalRecaudado > 0, base: `${cop(ind.gestionFinanciera.totalRecaudado)} de ${cop(ind.gestionFinanciera.totalFacturado)} · comisiones ${cop(ind.gestionFinanciera.comisionesGeneradas)}`}
  ];
  return (
    <Tabla
      columnas={[
        {titulo: 'Dimensión', celda: (f) => <div><p className="font-medium text-slate-100">{f.nombre}</p><p className="text-xs text-slate-500">{f.detalle}</p></div>},
        {titulo: 'Resultado', celda: (f) => <span className="text-slate-100">{f.valor}</span>},
        {titulo: 'Meta', celda: (f) => <span className="text-slate-300">{f.meta}</span>},
        {titulo: 'Base de cálculo', celda: (f) => <span className="text-xs text-slate-400">{f.base}</span>},
        {titulo: 'Estado', celda: (f) => <Meta cumple={f.cumple} texto={f.cumple ? 'Cumple' : 'En seguimiento'} />}
      ]}
      filas={filas}
    />
  );
}

function Segmentacion() {
  const [clase, setClase] = useState('');
  const {datos, error, cargando} = useCargar(`/api/analitica/clientes${clase ? `?clase=${clase}` : ''}`);
  return (
    <Card titulo="Segmentación de clientes" subtitulo="Score = peso RFM × (recencia, frecuencia, monto) + peso geográfico × factor de zona. Clases AAA a C según los umbrales del modelo.">
      <div className="mb-3 flex flex-wrap gap-2">
        {datos && CLASES.map((k) => <Badge key={k} tono={TONO_CLASE[k]}>{k}: {datos.distribucion[k]}</Badge>)}
      </div>
      <Filtros opciones={OPCIONES_CLASE} valor={clase} onCambiar={setClase} />
      {cargando && !datos && <Cargando />}
      {error && <ErrorVista error={error} />}
      {datos && (
        <Tabla
          claveFila={(f) => f.clienteId}
          vacio="No hay clientes en esta clase."
          columnas={[
            {titulo: 'Cliente', celda: (f) => <div><p className="font-medium text-slate-100">{f.razonSocial}</p><p className="text-xs text-slate-500">{f.tipologia} · {f.zona}</p></div>},
            {titulo: 'Clase', celda: (f) => <Badge tono={TONO_CLASE[f.clase]}>{f.clase}</Badge>},
            {titulo: 'Score', celda: (f) => <span className="font-mono text-slate-100">{f.score.toFixed(3)}</span>},
            {titulo: 'R · F · M', celda: (f) => <span className="font-mono text-xs text-slate-400">{f.recenciaNorm.toFixed(2)} · {f.frecuenciaNorm.toFixed(2)} · {f.montoNorm.toFixed(2)}</span>},
            {titulo: 'Última compra', celda: (f) => (f.diasUltimaCompra === null ? <span className="text-slate-500">Sin compras</span> : `hace ${f.diasUltimaCompra} d`)},
            {titulo: 'Semanas con compra', celda: (f) => f.semanasConCompra},
            {titulo: 'Ticket', celda: (f) => cop(f.ticketPromedio)},
            {titulo: 'LTV', celda: (f) => cop(f.ltv)},
            {titulo: 'Retención', celda: (f) => `${Math.round(f.tasaRetencion * 100)} %`}
          ]}
          filas={datos.clientes}
        />
      )}
    </Card>
  );
}

function Comisiones() {
  const {datos, error, cargando} = useCargar('/api/analitica/comisiones');
  return (
    <Card titulo="Comisiones sobre recaudo efectivo" subtitulo="Solo se comisiona el dinero ya cobrado. Lo pendiente queda retenido hasta el pago.">
      {cargando && !datos && <Cargando />}
      {error && <ErrorVista error={error} />}
      {datos && (
        <Tabla
          claveFila={(f) => f.vendedor}
          columnas={[
            {titulo: 'Vendedor', celda: (f) => f.vendedor},
            {titulo: 'Facturado', celda: (f) => cop(f.facturado)},
            {titulo: 'Recaudado', celda: (f) => cop(f.recaudado)},
            {titulo: 'Pendiente', celda: (f) => cop(f.pendienteRecaudo)},
            {titulo: `Comisión (${datos.comisionPct} %)`, celda: (f) => <span className="text-emerald-300">{cop(f.comisionGenerada)}</span>},
            {titulo: 'Retenida', celda: (f) => <span className="text-amber-300">{cop(f.comisionRetenida)}</span>}
          ]}
          filas={datos.vendedores}
        />
      )}
    </Card>
  );
}

const CAMPOS_PESOS = [
  {clave: 'wR', etiqueta: 'Peso de recencia (wR)'}, {clave: 'wF', etiqueta: 'Peso de frecuencia (wF)'}, {clave: 'wM', etiqueta: 'Peso de monto (wM)'},
  {clave: 'wRFM', etiqueta: 'Peso RFM (wRFM)'}, {clave: 'wGeo', etiqueta: 'Peso geográfico (wGeo)'}
];

function Modelo({puedeEscribir, alGuardar}) {
  const {datos, error, cargando} = useCargar('/api/analitica/modelo');
  const {notificar} = useNexus();
  const [form, setForm] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (datos) setForm({...datos.analitico, umbrales: {...datos.analitico.umbrales}});
  }, [datos]);

  if (cargando && !form) return <Cargando />;
  if (error) return <ErrorVista error={error} />;
  if (!form) return null;

  const cambiar = (clave, valor) => setForm({...form, [clave]: valor});
  const cambiarUmbral = (clave, valor) => setForm({...form, umbrales: {...form.umbrales, [clave]: valor}});

  const guardar = async (evento) => {
    evento.preventDefault();
    setMensaje(null);
    setGuardando(true);
    const cuerpo = {
      wR: Number(form.wR), wF: Number(form.wF), wM: Number(form.wM), wRFM: Number(form.wRFM), wGeo: Number(form.wGeo),
      ventanaSemanas: Number(form.ventanaSemanas), comisionPct: Number(form.comisionPct),
      umbrales: Object.fromEntries(Object.entries(form.umbrales).map(([k, v]) => [k, Number(v)]))
    };
    const r = await api('/api/analitica/modelo', {metodo: 'PUT', cuerpo});
    setGuardando(false);
    if (r.ok) {
      notificar('emerald', 'Parámetros del modelo guardados. La segmentación se recalculó.');
      alGuardar();
    } else setMensaje(r.datos.mensaje);
  };

  return (
    <Card titulo="Parámetros del modelo" subtitulo="Los pesos de R, F y M deben sumar 1, igual que wRFM y wGeo. Los umbrales deben ser decrecientes (AAA > AA > A > B).">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPOS_PESOS.map((c) => (
            <Campo key={c.clave} etiqueta={c.etiqueta}>
              <input className={CLASE_INPUT} type="number" step="0.05" min="0" max="1" value={form[c.clave]} disabled={!puedeEscribir} onChange={(e) => cambiar(c.clave, e.target.value)} />
            </Campo>
          ))}
          <Campo etiqueta="Ventana (semanas)"><input className={CLASE_INPUT} type="number" min="4" max="12" value={form.ventanaSemanas} disabled={!puedeEscribir} onChange={(e) => cambiar('ventanaSemanas', e.target.value)} /></Campo>
          <Campo etiqueta="Comisión sobre recaudo (%)"><input className={CLASE_INPUT} type="number" step="0.5" min="0" max="20" value={form.comisionPct} disabled={!puedeEscribir} onChange={(e) => cambiar('comisionPct', e.target.value)} /></Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[['aaa', 'Umbral AAA'], ['aa', 'Umbral AA'], ['a', 'Umbral A'], ['b', 'Umbral B'], ['frecuenciaMinAaa', 'Frecuencia mínima AAA']].map(([k, e]) => (
            <Campo key={k} etiqueta={e}><input className={CLASE_INPUT} type="number" step="0.01" min="0" max="1" value={form.umbrales[k]} disabled={!puedeEscribir} onChange={(ev) => cambiarUmbral(k, ev.target.value)} /></Campo>
          ))}
        </div>
        {mensaje && <Aviso tono="rose">{mensaje}</Aviso>}
        {puedeEscribir
          ? <Boton variante="primario" type="submit" cargando={guardando}><Save className="h-4 w-4" aria-hidden="true" />Guardar parámetros</Boton>
          : <Aviso tono="amber">Tu rol puede consultar los parámetros, pero no modificarlos.</Aviso>}
      </form>
    </Card>
  );
}

function Planificador({puedeEscribir}) {
  const [cuota, setCuota] = useState(100);
  const [tope, setTope] = useState('');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [calculando, setCalculando] = useState(false);

  const calcular = async () => {
    setCalculando(true);
    setError(null);
    const cuerpo = {cuota: Number(cuota)};
    if (tope !== '') cuerpo.topePorCliente = Number(tope);
    const r = await api('/api/analitica/planificar', {metodo: 'POST', cuerpo});
    setCalculando(false);
    if (r.ok) setPlan(r.datos.plan);
    else setError(r.datos.mensaje);
  };

  return (
    <Card titulo="Planificador de envíos bajo cuota" subtitulo="Maximiza α·(facturas enviadas) + β·(score de promociones) con α > β. Primero se reservan las facturas por despachar y el cupo restante se reparte por score, sin repetir promoción por cliente y campaña.">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo etiqueta="Cuota diaria de mensajes"><input className={CLASE_INPUT} type="number" min="0" value={cuota} onChange={(e) => setCuota(e.target.value)} /></Campo>
        <Campo etiqueta="Tope por cliente y día (opcional)"><input className={CLASE_INPUT} type="number" min="1" max="20" value={tope} onChange={(e) => setTope(e.target.value)} placeholder="Sin tope" /></Campo>
        <Boton variante="primario" onClick={calcular} cargando={calculando} disabled={!puedeEscribir}><Calculator className="h-4 w-4" aria-hidden="true" />Calcular plan</Boton>
      </div>
      {error && <Aviso tono="rose">{error}</Aviso>}
      {plan && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi etiqueta="Facturas reservadas" valor={plan.facturas.length} nota="Prioridad máxima del cupo" icono="Receipt" tono="emerald" />
            <Kpi etiqueta="Promociones asignadas" valor={plan.promociones.length} nota={`${plan.candidatas} candidatas, ${plan.sinCupo} sin cupo`} icono="Megaphone" tono="sky" />
            <Kpi etiqueta="Cupo libre" valor={plan.cupoLibre} nota={`de ${plan.cap} mensajes`} icono="Layers" tono="amber" />
            <Kpi etiqueta="Valor del objetivo" valor={plan.objetivo} nota="α·facturas + β·scores" icono="TrendingUp" tono="violet" />
          </div>
          {plan.excluidasPorR2.length > 0 && (
            <Aviso tono="amber">{plan.excluidasPorR2.length} factura(s) no se pueden enviar porque el cliente no tiene canal digital validado: {plan.excluidasPorR2.map((x) => `#${x.facturaId}`).join(', ')}.</Aviso>
          )}
          <Tabla
            claveFila={(f) => `${f.clienteId}-${f.campanaId}`}
            vacio="No hay promociones asignadas con este cupo."
            columnas={[
              {titulo: 'Cliente', celda: (f) => f.clienteNombre || `Cliente ${f.clienteId}`},
              {titulo: 'Campaña', celda: (f) => `#${f.campanaId}`},
              {titulo: 'Score', celda: (f) => <span className="font-mono">{Number(f.score).toFixed(3)}</span>}
            ]}
            filas={plan.promociones.slice(0, 25)}
          />
          {plan.promociones.length > 25 && <p className="text-xs text-slate-500">Se muestran las 25 promociones de mayor score de {plan.promociones.length}.</p>}
        </div>
      )}
    </Card>
  );
}

export default function Indicadores() {
  const {nivelDe} = useNexus();
  const puedeEscribir = nivelDe('motor_analitico') === 'rw';
  const [version, setVersion] = useState(0);
  const {datos, error, cargando} = useCargar(`/api/analitica/indicadores?v=${version}`);

  return (
    <div className="space-y-5">
      <CabeceraVista titulo="Indicadores y segmentación" descripcion="Motor analítico del modelo: segmentación RFM con factor geográfico, LTV, retención, comisiones sobre recaudo e indicadores de desempeño." />
      {cargando && !datos && <Cargando />}
      {error && <ErrorVista error={error} />}
      {datos && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi etiqueta="LTV total" valor={cop(datos.indicadores.segmentacion.ltvTotal)} nota="Valor acumulado de la cartera" icono="TrendingUp" tono="emerald" />
            <Kpi etiqueta="Retención promedio" valor={`${Math.round(datos.indicadores.segmentacion.retencionPromedio * 100)} %`} nota="Semanas activas sobre la ventana" icono="Users" tono="sky" />
            <Kpi etiqueta="Clientes AAA" valor={datos.indicadores.segmentacion.porClase.AAA} nota="Segmento de máxima prioridad" icono="ShieldCheck" tono="violet" />
            <Kpi etiqueta="Recaudo" valor={`${datos.indicadores.gestionFinanciera.porcentajeRecaudo} %`} nota="Base de las comisiones" icono="Wallet" tono="amber" />
          </div>
          <Card titulo="Indicadores de desempeño" subtitulo="Tabla de evaluación de impacto del documento científico, calculada con datos reales de tu empresa.">
            <TablaIndicadores ind={datos.indicadores} />
          </Card>
        </>
      )}
      <Segmentacion key={`seg-${version}`} />
      <Comisiones key={`com-${version}`} />
      <Modelo puedeEscribir={puedeEscribir} alGuardar={() => setVersion((v) => v + 1)} />
      <Planificador puedeEscribir={puedeEscribir} />
    </div>
  );
}
