import axios from 'axios';
import { staffAuthHeaders } from './staffAuth';

/* Editar los datos de un cliente desde "Buscar cliente" (backend MS-LOGIN-BOLETERIA, ClienteEditar.controller.js).
   Solo lo puede hacer quien tiene la página "suscriptores" (por defecto admin y super_admin). La cédula NO se edita:
   es lo que une al cliente con sus compras y boletos. */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1/suscriptor';
const hdr = () => ({ ...staffAuthHeaders(), 'Content-Type': 'application/json' });

export interface ClienteDatos {
  id: number;
  cedula: string;
  nombreCompleto: string;
  email: string;
  movil: string;
  ciudad: string;
  direccion: string;
}

export interface OtroCliente { id: number; nombre: string; cedula: string }
export interface RespCorreo { valido: boolean; repetido: boolean; con?: OtroCliente; error?: string }
export interface RespEditar { success: boolean; message: string; repetido?: boolean; con?: OtroCliente; sinCambios?: boolean; cambios?: string[] }

/* Lo que llega del servidor (tabla suscriptor) -> lo que edita la pantalla (todo texto, nunca null) */
export const clienteDeRespuesta = (c: Record<string, unknown> | null | undefined): ClienteDatos | null => {
  if (!c || !c.id) return null;
  const t = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return { id: Number(c.id), cedula: t(c.cedula), nombreCompleto: t(c.nombreCompleto), email: t(c.email), movil: t(c.movil), ciudad: t(c.ciudad), direccion: t(c.direccion) };
};

export const correoValido = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/* ¿Hay algo distinto? (el correo se compara sin mayúsculas ni espacios) */
export const hayCambios = (a: ClienteDatos, b: ClienteDatos): boolean => {
  const n = (v: string) => v.replace(/\s+/g, ' ').trim();
  return n(a.nombreCompleto) !== n(b.nombreCompleto) || n(a.email).toLowerCase() !== n(b.email).toLowerCase()
    || a.movil.replace(/\D/g, '') !== b.movil.replace(/\D/g, '') || n(a.ciudad) !== n(b.ciudad) || n(a.direccion) !== n(b.direccion);
};

export const verificarCorreo = async (id: number, email: string): Promise<RespCorreo> => {
  try {
    const { data } = await axios.post(`${URL_BASE}/verificar_correo`, { id, email }, { headers: hdr(), timeout: 12000 });
    return { valido: !!data?.valido, repetido: !!data?.repetido, con: data?.con };
  } catch (err) {
    const e = err as { response?: { data?: { message?: string } } };
    return { valido: true, repetido: false, error: e?.response?.data?.message || 'No se pudo revisar el correo.' };
  }
};

export const guardarCliente = async (c: ClienteDatos): Promise<RespEditar> => {
  try {
    const { data } = await axios.post(`${URL_BASE}/editar`, {
      id: c.id, nombreCompleto: c.nombreCompleto, email: c.email, movil: c.movil, ciudad: c.ciudad, direccion: c.direccion,
    }, { headers: hdr(), timeout: 20000 });
    return { success: !!data?.success, message: data?.message || 'Listo', sinCambios: data?.sinCambios, cambios: data?.cambios };
  } catch (err) {
    const e = err as { response?: { data?: { message?: string; repetido?: boolean; con?: OtroCliente } } };
    const d = e?.response?.data;
    if (d) return { success: false, message: d.message || 'No se pudo guardar', repetido: d.repetido, con: d.con };
    return { success: false, message: 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.' };
  }
};
