/* En producción la interfaz la sirve el propio servidor, por eso la API está en la misma dirección. En desarrollo se usa el puerto 5000 del mismo equipo. */
export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? `http://${window.location.hostname}:5000` : '');

const CLAVE_SESION = 'nexus.sesion';
let tokenActual = null;
let alSesionInvalida = null;

export function fijarToken(token) {
  tokenActual = token;
}

export function alSesionExpirada(manejador) {
  alSesionInvalida = manejador;
}

export function guardarSesion(sesion) {
  try {
    if (sesion) sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    else sessionStorage.removeItem(CLAVE_SESION);
  } catch (error) {
    /* El almacenamiento de sesión puede estar bloqueado: la sesión vive solo en memoria */
  }
}

export function leerSesionGuardada() {
  try {
    const texto = sessionStorage.getItem(CLAVE_SESION);
    return texto ? JSON.parse(texto) : null;
  } catch (error) {
    return null;
  }
}

export function decodificarJwt(token) {
  try {
    const decodificar = (parte) => JSON.parse(decodeURIComponent(escape(atob(parte.replace(/-/g, '+').replace(/_/g, '/')))));
    const [cabecera, payload] = token.split('.');
    return {cabecera: decodificar(cabecera), payload: decodificar(payload)};
  } catch (error) {
    return null;
  }
}

/* Cliente HTTP con fetch nativo. Nunca lanza por errores HTTP: devuelve {ok, status, datos}. */
export async function api(ruta, {metodo = 'GET', cuerpo, traza = true, conToken = true} = {}) {
  const cabeceras = {};
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (conToken && tokenActual) cabeceras.Authorization = `Bearer ${tokenActual}`;
  if (traza) cabeceras['X-Nexus-Trace'] = '1';
  try {
    const respuesta = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
    let datos = null;
    try {
      datos = await respuesta.json();
    } catch (error) {
      datos = null;
    }
    if (respuesta.status === 401 && conToken && tokenActual && alSesionInvalida) alSesionInvalida(datos);
    return {ok: respuesta.ok, status: respuesta.status, datos};
  } catch (error) {
    return {ok: false, status: 0, datos: {error: 'SIN_CONEXION', mensaje: `No se pudo conectar con el servidor en ${API_URL}. ¿Está corriendo "npm start"?`}};
  }
}
