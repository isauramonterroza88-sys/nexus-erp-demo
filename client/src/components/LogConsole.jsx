import React, {useEffect, useRef, useState} from 'react';
import {Pause, Play, Trash2, Terminal, Braces} from 'lucide-react';
import {api} from '../api.js';
import {Boton, cx} from './ui.jsx';

const COLOR_NIVEL = {info: 'text-emerald-400', warn: 'text-amber-300', error: 'text-rose-400'};
const COLOR_ORIGEN = {
  auth: 'text-fuchsia-300', api_gateway: 'text-sky-300', bus_eventos: 'text-violet-300', aislamiento: 'text-rose-300',
  canal_digital: 'text-teal-300', app_store: 'text-amber-300', finanzas: 'text-emerald-300', cadena_suministro: 'text-orange-300'
};
const MAX_LINEAS = 300;

/* Consola técnica en vivo: muestra el JSON que intercambian el cliente, la API y los módulos de la empresa autenticada */
export default function LogConsole({altura = 'h-96'}) {
  const [lineas, setLineas] = useState([]);
  const [pausado, setPausado] = useState(false);
  const [verJson, setVerJson] = useState(true);
  const [seguir, setSeguir] = useState(true);
  const cursor = useRef(0);
  const pausadoRef = useRef(false);
  const panel = useRef(null);
  pausadoRef.current = pausado;

  useEffect(() => {
    let vivo = true;
    const traer = async () => {
      if (pausadoRef.current) return;
      const respuesta = await api(`/api/trazabilidad/logs?desde=${cursor.current}`, {traza: false});
      if (!vivo || !respuesta.ok) return;
      const {logs, ultimoId} = respuesta.datos;
      if (ultimoId < cursor.current) setLineas([]);
      cursor.current = ultimoId;
      if (logs.length) setLineas((previas) => [...previas, ...logs].slice(-MAX_LINEAS));
    };
    traer();
    const temporizador = setInterval(traer, 1200);
    return () => {
      vivo = false;
      clearInterval(temporizador);
    };
  }, []);

  useEffect(() => {
    if (seguir && panel.current) panel.current.scrollTop = panel.current.scrollHeight;
  }, [lineas, verJson, seguir]);

  const alDesplazar = () => {
    const el = panel.current;
    setSeguir(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Terminal className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <span className="font-mono">nexus@trazabilidad</span>
          <span className={cx('inline-block h-2 w-2 rounded-full', pausado ? 'bg-amber-400' : 'animate-pulse bg-emerald-400')} />
          <span className="text-xs text-slate-500">{pausado ? 'en pausa' : 'en vivo'} · {lineas.length} eventos</span>
        </div>
        <div className="flex gap-2">
          <Boton pequeno onClick={() => setVerJson((v) => !v)} aria-pressed={verJson}><Braces className="h-3.5 w-3.5" aria-hidden="true" />{verJson ? 'Ocultar JSON' : 'Mostrar JSON'}</Boton>
          <Boton pequeno onClick={() => setPausado((p) => !p)}>{pausado ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}{pausado ? 'Reanudar' : 'Pausar'}</Boton>
          <Boton pequeno onClick={() => setLineas([])}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Limpiar</Boton>
        </div>
      </div>
      <div ref={panel} onScroll={alDesplazar} className={cx('overflow-y-auto p-3 font-mono text-xs leading-relaxed', altura)} aria-live="off" data-testid="consola">
        {lineas.length === 0 && <p className="text-slate-500">Esperando actividad… Realiza una acción en cualquier módulo y verás aquí el intercambio de datos.</p>}
        {lineas.map((l) => (
          <div key={l.id} className="mb-1.5">
            <p className="break-words">
              <span className="text-slate-500">[{l.ts.slice(11, 23)}]</span>{' '}
              <span className={COLOR_NIVEL[l.nivel] || 'text-slate-300'}>LOG:</span>{' '}
              <span className={COLOR_ORIGEN[l.origen] || 'text-slate-400'}>{l.origen}</span>{' '}
              <span className="text-slate-200">{l.mensaje}</span>
            </p>
            {verJson && l.payload !== null && (
              <pre className="ml-4 mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-words border-l border-slate-700 pl-3 text-slate-500">{JSON.stringify(l.payload, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
