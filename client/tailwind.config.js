/* Tema claro. Las vistas se escribieron con la escala oscura de Tailwind (por ejemplo bg-slate-900 y text-slate-100).
   En lugar de reescribir cada clase, aquí se invierte la escala: los tonos 950 pasan a ser casi blancos y los 50 casi negros.
   Los tonos de acento 500 y 600 (botones) se mantienen, y el 400 se oscurece para que los íconos y textos se lean sobre fondo claro. */
const escalas = {
  slate: {50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617'},
  sky: {50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e', 950: '#082f49'},
  emerald: {50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22'},
  amber: {50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03'},
  rose: {50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519'},
  violet: {50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065'},
  fuchsia: {300: '#f0abfc', 700: '#a21caf'},
  teal: {300: '#5eead4', 700: '#0f766e'},
  orange: {300: '#fdba74', 700: '#c2410c'}
};

function invertir(escala, esNeutra) {
  const par = {50: 950, 100: 900, 200: 800, 300: 700, 700: 300, 800: 200, 900: 100, 950: 50};
  const resultado = {};
  for (const tono of Object.keys(escala)) {
    const origen = par[tono];
    if (origen && escala[origen]) resultado[tono] = escala[origen];
    else if (tono === '400') resultado[tono] = esNeutra ? escala['600'] : escala['600'];
    else resultado[tono] = escala[tono];
  }
  return resultado;
}

const colores = {};
for (const [nombre, escala] of Object.entries(escalas)) colores[nombre] = invertir(escala, nombre === 'slate');

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: colores,
      fontFamily: {mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']}
    }
  },
  plugins: []
};
