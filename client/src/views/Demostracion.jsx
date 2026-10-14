import React, {useState} from 'react';
import {RotateCcw, Smartphone} from 'lucide-react';
import {api, guardarSesion, fijarToken} from '../api.js';
import {Aviso, Badge, Boton, Card, CabeceraVista, Cargando, ErrorVista, useCargar, useNexus} from '../components/ui.jsx';

/* Recorrido sugerido de unos 3 minutos. "ir" abre la pantalla relacionada y "decir" es la idea que conviene explicar. */
const GUION = [
  {titulo: 'Una empresa, su panel y sus aplicaciones', ir: 'panel', etiqueta: 'Ver el panel', decir: 'Cada empresa tiene su propio espacio, separado del de las demás. Los accesos rápidos muestran solo las aplicaciones que contrató.'},
  {titulo: 'La empresa contrata solo lo que necesita', ir: 'tienda', etiqueta: 'Abrir la Tienda de Apps', decir: 'Activa o desactiva un módulo y mira cómo aparece o desaparece del menú al instante. Cada módulo tiene su precio y se cobra al activarlo. Solo el administrador puede hacerlo.'},
  {titulo: 'Cada empresa define sus propios cargos', ir: 'roles', etiqueta: 'Abrir Roles y permisos', decir: 'Crea un cargo, por ejemplo «Auxiliar de bodega», y elige por módulo si lo edita, solo lo consulta o no lo ve. Cada empresa le pone los nombres que use.'},
  {titulo: 'Se lo asigna a un trabajador', ir: 'usuarios', etiqueta: 'Abrir Usuarios', decir: 'Crea el usuario con ese cargo. El sistema genera una contraseña temporal que la persona cambia en su primer ingreso.'},
  {titulo: 'El trabajador solo ve lo suyo', ir: null, etiqueta: null, decir: 'Cierra sesión y entra con ese usuario: su menú solo muestra lo permitido, las pantallas de solo lectura no tienen botones de editar, y lo demás está bloqueado también en el servidor. Funciona igual desde un celular.'},
  {titulo: 'Un proceso conecta a todos los módulos', ir: 'fin_facturas', etiqueta: 'Abrir Facturas', decir: 'Al emitir una factura, el inventario baja solo, se genera el código QR para verificarla y se envía el comprobante digital por WhatsApp. Revisa «Productos y stock» para ver el cambio.'},
  {titulo: 'El sistema analiza a los clientes', ir: 'ana_indicadores', etiqueta: 'Abrir Indicadores', decir: 'Clasifica a los clientes de AAA a C según qué tan recientes, frecuentes y valiosas son sus compras, calcula comisiones solo sobre lo recaudado y reparte los mensajes diarios de WhatsApp a quienes más valen la pena.'},
  {titulo: 'Para quien quiera ver cómo funciona por dentro', ir: 'panel', etiqueta: 'Volver al panel', decir: 'Activa «Modo técnico» arriba: se ven la sesión cifrada (JWT), la prueba de aislamiento entre empresas y la consola con todo lo que intercambian los módulos en tiempo real.'}
];

function Pasos() {
  const {irA} = useNexus();
  const [hecho, setHecho] = useState({});
  return (
    <ol className="space-y-3">
      {GUION.map((paso, i) => (
        <li key={paso.titulo} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
          <button type="button" aria-pressed={!!hecho[i]} aria-label={`Marcar el paso ${i + 1} como hecho`} onClick={() => setHecho({...hecho, [i]: !hecho[i]})}
            className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-semibold ${hecho[i] ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-600 text-slate-400'}`}>
            {hecho[i] ? '✓' : i + 1}
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-100">{paso.titulo}</p>
            <p className="mt-1 text-sm text-slate-400">{paso.decir}</p>
            {paso.ir && <div className="mt-2"><Boton pequeno onClick={() => irA(paso.ir)}>{paso.etiqueta}</Boton></div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function Demostracion() {
  const {notificar} = useNexus();
  const acceso = useCargar('/api/demo/acceso');
  const [reiniciando, setReiniciando] = useState(false);

  if (acceso.error) return <ErrorVista error={acceso.error} />;
  if (!acceso.datos) return <Cargando />;

  const puerto = window.location.port ? `:${window.location.port}` : '';
  const direcciones = acceso.datos.direcciones.map((ip) => `${window.location.protocol}//${ip}${puerto}`);

  const reiniciar = async () => {
    if (!window.confirm('Se borrará todo lo creado durante la presentación y las empresas de ejemplo volverán a su estado inicial. Tendrás que iniciar sesión de nuevo. ¿Continuar?')) return;
    setReiniciando(true);
    const r = await api('/api/demo/reiniciar', {metodo: 'POST'});
    setReiniciando(false);
    if (!r.ok) {
      notificar('rose', r.datos.mensaje);
      return;
    }
    fijarToken(null);
    guardarSesion(null);
    window.location.reload();
  };

  return (
    <div className="space-y-5">
      <CabeceraVista titulo="Guía de demostración" descripcion="Herramientas para presentar el sistema: el recorrido de unos 3 minutos, el acceso desde celulares y el reinicio entre un visitante y otro. Solo la ve el administrador mientras el modo demostración esté activo." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Que los visitantes lo prueben en su celular" subtitulo="Deben estar conectados a la misma red Wi-Fi que este computador.">
          {direcciones.length === 0 ? (
            <Aviso tono="amber">Este computador no está conectado a ninguna red. Conéctalo al Wi-Fi o crea una zona con cobertura desde tu celular y recarga esta pantalla.</Aviso>
          ) : (
            <ul className="space-y-2">
              {direcciones.map((d) => <li key={d} className="flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2"><Smartphone className="h-4 w-4 text-sky-400" aria-hidden="true" /><span className="break-all font-mono text-lg text-slate-100">{d}</span></li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Escribe esa dirección en el navegador del celular, o pégala en cualquier generador de código QR gratuito y muéstralo en pantalla. Si no carga, revisa que el firewall de Windows permita el acceso a Node.js.</p>
        </Card>
        <Card titulo="Empezar de cero con cada visitante" subtitulo="Devuelve las empresas de ejemplo a su estado inicial.">
          <p className="mb-3 text-sm text-slate-400">Borra lo que se creó durante la presentación: cargos, usuarios, facturas, módulos activados y empresas registradas. Cierra todas las sesiones abiertas.</p>
          <Boton variante="peligro" onClick={reiniciar} cargando={reiniciando}><RotateCcw className="h-4 w-4" aria-hidden="true" />Reiniciar demostración</Boton>
        </Card>
      </div>
      <Card titulo="Recorrido de 3 minutos" subtitulo="Marca cada paso a medida que lo presentas.">
        <Pasos />
      </Card>
      <Card titulo="Antes de presentar">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>No dependas del Wi-Fi del lugar: usa la zona con cobertura de tu celular.</li>
          <li>Entra como administrador de <b>alfa</b> (todos los módulos) para el recorrido, y usa <b>beta</b> para mostrar una empresa con menos módulos.</li>
          <li>Ten un video corto de respaldo por si falla el computador o la red.</li>
          <li>Deja abierta la ventana negra del servidor durante toda la presentación.</li>
        </ul>
      </Card>
    </div>
  );
}
