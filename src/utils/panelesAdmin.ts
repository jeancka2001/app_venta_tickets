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

/* ---------------- Chats (conversación en vivo con los clientes de la página) ---------------- */
export const chatsLista = (filtros: Record<string, string | number>) => pedir(() => axios.get(`${RAIZ}/soporte/chats/admin`, { headers: hdr(), params: filtros }));
export const chatsMensajes = (id: number, despues = 0) => pedir(() => axios.get(`${RAIZ}/soporte/chats/admin/mensajes`, { headers: hdr(), params: { id, ...(despues ? { despues } : {}) } }));
/* Solo los pendientes (sin 'desde' el servidor no devuelve avisos viejos): { pendientes: { sin_responder, mios, sin_asignar } } */
export const chatsPendientes = () => pedir(() => axios.get(`${RAIZ}/soporte/chats/admin/novedades`, { headers: hdr() }));
export const chatsClientes = (q: string) => pedir(() => axios.get(`${RAIZ}/soporte/chats/admin/clientes`, { headers: hdr(), params: { q } }));
export const chatsIniciar = (cedula: string, texto: string) => pedir(() => axios.post(`${RAIZ}/soporte/chats/admin/iniciar`, { cedula, texto }, { headers: hdr() }));
export const chatsResponder = (id: number, texto: string, imagen?: string) => pedir(() => axios.post(`${RAIZ}/soporte/chats/admin/responder`, { id, texto, ...(imagen ? { imagen } : {}) }, { headers: hdr() }));
/* Sube una imagen al servidor de imágenes de siempre (el mismo de los comprobantes) y devuelve su URL */
export const subirImagenChat = async (archivo: File): Promise<string> => {
  try {
    const form = new FormData();
    form.append('file', archivo);
    const { data } = await axios.post('https://codigomarret.online/upload/api/img', form);
    return data?.success && data?.url ? String(data.url) : '';
  } catch {
    return '';
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
export const devolucionesDeCliente = (cedula: string) => pedir(() => axios.get(`${RAIZ}/devolucion/cliente`, { headers: hdr(), params: { cedula } }));
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

/* ---------------- Devoluciones: resolver con comprobante y anular compra ---------------- */
export const devolucionResolver = (codigoEvento: string, id: number, datos: { nota?: string; monto?: number | string | null; mensaje?: string; notificar?: boolean; comprobantes?: { nombre: string; datos: string }[] }) =>
  pedir(() => axios.post(`${RAIZ}/devolucion/resolver`, { codigoEvento, id, ...datos }, { headers: hdr(), timeout: 60000 }));
export const devolucionAnularCompra = (codigoEvento: string, id: number, compras?: number[]) =>
  pedir(() => axios.post(`${RAIZ}/devolucion/anular-compra`, { codigoEvento, id, ...(compras && compras.length ? { compras } : {}) }, { headers: hdr(), timeout: 60000 }));

/* ---------------- Evento: diseño de localidades, localidades nuevas y opciones de compra ---------------- */
export interface Diseno {
  tipo: 'correlativo' | 'fila' | 'mesa';
  cantidad?: number;
  ocupados?: number;
  factor?: number;
  filas?: { fila: string; sillas?: number; ocupados?: number; mesas?: { mesa: string; sillas: number; ocupados?: number }[] }[];
}
export const disenoRevisar = (codigoEvento: string, id_localidades: number, diseno: object) =>
  pedir(() => axios.post(`${RAIZ}/evento_localidades/diseno`, { codigoEvento, id_localidades, diseno, aplicar: false }, { headers: hdr() }));
export const disenoAplicar = (codigoEvento: string, id_localidades: number, diseno: object) =>
  pedir(() => axios.post(`${RAIZ}/evento_localidades/diseno`, { codigoEvento, id_localidades, diseno, aplicar: true }, { headers: hdr(), timeout: 120000 }));
export const localidadNueva = (codigoEvento: string, datos: object) =>
  pedir(() => axios.post(`${RAIZ}/evento_localidades/nueva`, { codigoEvento, ...datos }, { headers: hdr(), timeout: 120000 }));
export const opcionCompraGuardar = (codigoEvento: string, id_localidades: number, datos: object) =>
  pedir(() => axios.post(`${RAIZ}/evento_localidades/modalidad`, { codigoEvento, id_localidades, ...datos }, { headers: hdr() }));

/* ---------------- Evento: usuarios por localidad y vendedores sin comisiones ---------------- */
export const canalUsuariosLocalidad = (codigoEvento: string, localidad: string, usuarios: number[]) =>
  pedir(() => axios.post(`${RAIZ}/venta_personal/localidad_usuarios`, { codigoEvento, localidad, usuarios }, { headers: hdr() }));
export const usuarioSinComisiones = (id_usuario: number, sin_comisiones: boolean) =>
  pedir(() => axios.post(`${RAIZ}/venta_personal/usuario`, { id_usuario, sin_comisiones }, { headers: hdr() }));
