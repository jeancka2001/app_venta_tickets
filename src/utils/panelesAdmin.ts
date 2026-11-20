import axios from 'axios';
import { staffAuthHeaders } from './staffAuth';

/* Clientes de las páginas de administración que la app comparte con la web (mismos endpoints que TicketsWeb):
   Soporte, Devoluciones, Correos masivos, Píxeles, Permisos de páginas, y las pestañas del evento (Localidades y asientos,
   Canales y venta por personal). Todas piden la sesión del usuario: el backend revisa el permiso de cada página. */

const RAIZ = 'https://api.t-ickets.com/ms_login/api/v1';
const hdr = () => ({ ...staffAuthHeaders(), 'Content-Type': 'application/json' });

/* Las respuestas del servidor cambian de forma según la página: cada pantalla lee solo lo suyo */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Resp { success?: boolean; message?: string; [k: string]: any }

/* Hace la llamada y devuelve SIEMPRE un objeto { success, message, ... } (también cuando el servidor contesta 4xx con detalle) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pedir = async (fn: () => Promise<{ data: any }>): Promise<Resp> => {
  try {
    const { data } = await fn();
    return data ?? { success: false, message: 'Respuesta vacía del servidor.' };
  } catch (err) {
    const e = err as { response?: { data?: unknown; status?: number } };
    const cuerpo = e?.response?.data;
    if (cuerpo && typeof cuerpo === 'object') return { success: false, ...(cuerpo as object), status: e.response?.status };
    return { success: false, sinConexion: true, message: 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.' };
  }
};

/* ---------------- Soporte ---------------- */
export const soporteLista = (filtros: Record<string, string | number>) => pedir(() => axios.get(`${RAIZ}/soporte/admin`, { headers: hdr(), params: filtros }));
export const soporteDetalle = (id: number) => pedir(() => axios.get(`${RAIZ}/soporte/admin/ticket`, { headers: hdr(), params: { id } }));
export const soporteEstado = (id: number, estado: string, nota: string) => pedir(() => axios.post(`${RAIZ}/soporte/estado`, { id, estado, nota }, { headers: hdr() }));
export const soporteComentar = (id: number, comentario: string, publico: boolean) => pedir(() => axios.post(`${RAIZ}/soporte/comentar`, { id, comentario, publico }, { headers: hdr() }));
export const soporteTomar = (id: number) => pedir(() => axios.post(`${RAIZ}/soporte/tomar`, { id }, { headers: hdr() }));

/* ---------------- Devoluciones ---------------- */
export const devolucionesResumen = () => pedir(() => axios.get(`${RAIZ}/devolucion/resumen`, { headers: hdr() }));
export const devolucionAdmin = (codigoEvento: string) => pedir(() => axios.get(`${RAIZ}/devolucion/admin`, { headers: hdr(), params: { codigoEvento } }));
export const devolucionConfig = (codigoEvento: string, config: { activo: boolean; motivo: string; instrucciones: string; fecha_limite: string }) =>
  pedir(() => axios.post(`${RAIZ}/devolucion/config`, { codigoEvento, ...config }, { headers: hdr() }));
export const devolucionEstado = (codigoEvento: string, id: number, estado: string, nota: string) =>
  pedir(() => axios.post(`${RAIZ}/devolucion/estado`, { codigoEvento, id, estado, nota }, { headers: hdr() }));
export const devolucionComentar = (codigoEvento: string, id: number, comentario: string) =>
  pedir(() => axios.post(`${RAIZ}/devolucion/comentar`, { codigoEvento, id, comentario }, { headers: hdr() }));

/* ---------------- Correos masivos ---------------- */
export const correosInicio = () => pedir(() => axios.get(`${RAIZ}/correos/inicio`, { headers: hdr() }));
export const correosAudiencia = (audiencia: object) => pedir(() => axios.post(`${RAIZ}/correos/audiencia`, { audiencia }, { headers: hdr() }));
export const correosPrueba = (asunto: string, html: string, correos: string[]) => pedir(() => axios.post(`${RAIZ}/correos/prueba`, { asunto, html, correos }, { headers: hdr() }));
export const correosEnviar = (asunto: string, html: string, audiencia: object) => pedir(() => axios.post(`${RAIZ}/correos/enviar`, { asunto, html, audiencia }, { headers: hdr() }));
export const correosCampanas = () => pedir(() => axios.get(`${RAIZ}/correos/campanas`, { headers: hdr() }));
export const correosAccion = (id: number, accion: string) => pedir(() => axios.post(`${RAIZ}/correos/accion`, { id, accion }, { headers: hdr() }));

/* ---------------- Píxeles (Meta / TikTok) ---------------- */
export const metaConfig = () => pedir(() => axios.get(`${RAIZ}/meta/admin/config`, { headers: hdr() }));
export const metaGuardar = (datos: object) => pedir(() => axios.put(`${RAIZ}/meta/admin/config`, datos, { headers: hdr() }));
export const metaProbar = () => pedir(() => axios.post(`${RAIZ}/meta/admin/probar`, {}, { headers: hdr() }));
export const tiktokGuardar = (datos: object) => pedir(() => axios.put(`${RAIZ}/meta/admin/tiktok`, datos, { headers: hdr() }));
export const tiktokProbar = () => pedir(() => axios.post(`${RAIZ}/meta/admin/tiktok/probar`, {}, { headers: hdr() }));
export const pixelesEvento = () => pedir(() => axios.get(`${RAIZ}/meta/admin/pixeles_evento`, { headers: hdr() }));
export const pixelCrear = (datos: object) => pedir(() => axios.post(`${RAIZ}/meta/admin/pixeles_evento`, datos, { headers: hdr() }));
export const pixelEditar = (id: number, datos: object) => pedir(() => axios.put(`${RAIZ}/meta/admin/pixeles_evento/${id}`, datos, { headers: hdr() }));
export const pixelBorrar = (id: number) => pedir(() => axios.delete(`${RAIZ}/meta/admin/pixeles_evento/${id}`, { headers: hdr() }));
export const pixelProbar = (id: number) => pedir(() => axios.post(`${RAIZ}/meta/admin/pixeles_evento/${id}/probar`, {}, { headers: hdr() }));

/* ---------------- Permisos de páginas ---------------- */
export const permisosConfig = () => pedir(() => axios.get(`${RAIZ}/paginas/config`, { headers: hdr() }));
export const permisosGuardarRol = (perfil: string, paginas: string[] | null) => pedir(() => axios.post(`${RAIZ}/paginas/perfil`, { perfil, paginas }, { headers: hdr() }));
export const permisosGuardarUsuario = (id_usuario: number, paginas: string[] | null) => pedir(() => axios.post(`${RAIZ}/paginas/usuario`, { id_usuario, paginas }, { headers: hdr() }));
export const listarRoles = () => pedir(() => axios.get(`${RAIZ}/listar_roles`, { headers: hdr() }));
export const listarUsuarios = () => pedir(() => axios.get(`${RAIZ}/listas_user`, { headers: hdr() }));

/* ---------------- Evento: Localidades y asientos ---------------- */
export const localidadesDelEvento = (codigoEvento: string) => pedir(() => axios.get(`${RAIZ}/evento_localidades`, { headers: hdr(), params: { codigoEvento } }));

/* ---------------- Evento: Canales y venta por personal ---------------- */
export const ventaPersonalEvento = (codigoEvento: string) => pedir(() => axios.get(`${RAIZ}/venta_personal/evento`, { headers: hdr(), params: { codigoEvento } }));
export const ventaPersonalGuardarEvento = (codigoEvento: string, config: object) => pedir(() => axios.post(`${RAIZ}/venta_personal/evento`, { codigoEvento, ...config }, { headers: hdr() }));
export const canalLocalidadGuardar = (codigoEvento: string, localidad: string, venta_publica: number, venta_personal: number) =>
  pedir(() => axios.post(`${RAIZ}/venta_personal/localidad`, { codigoEvento, localidad, venta_publica, venta_personal }, { headers: hdr() }));
