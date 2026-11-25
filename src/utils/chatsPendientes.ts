import { useEffect, useState } from 'react';
import { chatsPendientes } from './panelesAdmin';
import { obtenerStaffData } from './staffAuth';
import { puedoVer } from './permisosPaginas';

/* Contador de chats por atender (el cliente escribió y el equipo todavía no le contesta) para el menú de la app.
   Un solo sondeo compartido: lo arranca el menú lateral (siempre montado) y lo leen el botón de las 3 rayitas y la fila "Chats".
   Solo consulta si la persona tiene la página Chats habilitada; se pausa con la app en segundo plano. */

const EVENTO = 'chats-pendientes';
const CADA_MS = 30000;
let valor = 0;

export const pendientesChats = () => valor;
const poner = (n: number) => {
  if (n === valor) return;
  valor = n;
  window.dispatchEvent(new CustomEvent(EVENTO));
};

/* "dependencias" solo para poder probarlo sin red: por defecto usa la sesión, el permiso y el servidor reales */
export interface DepsChats { habilitado: () => boolean; leer: () => Promise<{ success?: boolean; status?: number; pendientes?: { sin_responder?: number } }> }
const DEPS_REALES: DepsChats = { habilitado: () => !!obtenerStaffData() && puedoVer('chats'), leer: chatsPendientes };

export const consultarChatsPendientes = async (deps: DepsChats = DEPS_REALES) => {
  if (!deps.habilitado()) { poner(0); return; }
  const r = await deps.leer();
  if (r.success && r.pendientes) poner(Math.max(0, Number(r.pendientes.sin_responder) || 0));
  else if (r.status === 401 || r.status === 403) poner(0); // sin sesion o sin permiso: no hay nada que contar
};

/* Arranca el sondeo (devuelve la funcion que lo detiene). Al cambiar de usuario se vuelve a consultar. */
export const iniciarSondeoChats = (): (() => void) => {
  const tic = () => { if (document.visibilityState === 'visible') consultarChatsPendientes(); };
  consultarChatsPendientes();
  const i = window.setInterval(tic, CADA_MS);
  document.addEventListener('visibilitychange', tic);
  return () => { window.clearInterval(i); document.removeEventListener('visibilitychange', tic); };
};

export const usePendientesChats = (): number => {
  const [n, setN] = useState(valor);
  useEffect(() => {
    const alCambiar = () => setN(valor);
    window.addEventListener(EVENTO, alCambiar);
    alCambiar();
    return () => window.removeEventListener(EVENTO, alCambiar);
  }, []);
  return n;
};
