import axios from 'axios';
import { staffAuthHeaders, obtenerStaffData } from './staffAuth';

/* Módulo de administración de eventos y localidades -- solo lo usa el
   apartado "Admin" (visible solo para perfil admin/super_admin). Mismos
   endpoints que usa TicketsWeb en Evento/index.js, ModalnewEvento.js y
   ModalupdateEvento.js, todos bajo ms_login (sin /api/v1 salvo donde se
   indica), filtrados server-side por usuario_evento salvo perfil global. */

const URL_ROOT = 'https://api.t-ickets.com/ms_login';
const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';
const URL_UPLOAD_IMG = 'https://codigomarret.online/upload/api/img';

/* "Factura final del evento" -- este reporte SÍ existe como endpoint
   propio (no hay que armarlo a mano con reporte_ventas_usuario): vive en
   flasapi_speed_comnet (gateway "mikroti"), lo mismo que ya usan
   Evetoespecifico.js en la web (Obtener_valores) y el OCR de
   comprobantes que ya usa esta app. No pide autorization-ticket/JWT --
   ese servicio no tiene guard de auth en estas rutas. */
const URL_MIKROTI = 'https://api.t-ickets.com/mikroti';

const jsonHeaders = () => ({ ...staffAuthHeaders(), 'Content-Type': 'application/json' });

export interface EventoAdmin {
  id: number;
  nombreConcierto: string;
  fechaConcierto: string;
  horaConcierto: string;
  lugarConcierto: string;
  cuidadConcert: string;
  descripcionConcierto: string;
  imagenConcierto: string;
  mapaConcierto: string;
  codigoEvento: string;
  estado: string;
  iva: string;
  fechaCreacion: string;
}

export interface LocalidadAdmin {
  id: number;
  codigoEvento: string;
  localidad: string;
  precio_normal: string;
  precio_discapacidad: string;
  precio_tarjeta: string;
  precio_descuento: string;
  habilitar_cortesia: string;
  comision_boleto: string;
  habilitar: string;
  mensaje_promocion?: string;
}

/* No hay un "TODOS" real en el backend -- se piden los estados conocidos
   en paralelo y se fusionan (mismo patrón que GetEventos en
   TicketsWeb/Evento/index.js), agregando FINALIZADO además de los 4 que
   usa la web para no dejar eventos viejos invisibles. */
const ESTADOS_EVENTO = ['ACTIVO', 'PROCESO', 'PROXIMO', 'CANCELADO', 'FINALIZADO'];

export const listarEventosAdmin = async (): Promise<EventoAdmin[]> => {
  const headers = staffAuthHeaders();
  const resultados = await Promise.all(
    ESTADOS_EVENTO.map(estado =>
      axios.get(`${URL_ROOT}/listareventos/${estado}/`, { headers })
        .then(r => (r.data?.success && Array.isArray(r.data?.data)) ? r.data.data as EventoAdmin[] : [])
        .catch(() => [] as EventoAdmin[])
    )
  );
  const mapa = new Map<string, EventoAdmin>();
  resultados.flat().forEach(ev => mapa.set(ev.codigoEvento, ev));
  return Array.from(mapa.values()).sort((a, b) => (b.fechaConcierto || '').localeCompare(a.fechaConcierto || ''));
};

export const subirImagenEvento = async (file: File): Promise<string | null> => {
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await axios.post(URL_UPLOAD_IMG, form);
    return (data?.success && data?.url) ? data.url as string : null;
  } catch {
    return null;
  }
};

export interface CrearEventoPayload {
  nombreConcierto: string;
  fechaConcierto: string;
  horaConcierto: string;
  lugarConcierto: string;
  cuidadConcert: string;
  descripcionConcierto: string;
  imagenConcierto: string;
  mapaConcierto: string;
  iva: string;
  estado: string;
}

export const crearEventoAdmin = async (payload: CrearEventoPayload): Promise<{ success: boolean; message?: string }> => {
  try {
    const staff = obtenerStaffData();
    const { data } = await axios.post(`${URL_ROOT}/crearevento`, {
      ...payload,
      idUsuario: String(staff?.id || 0),
      LocalodadPrecios: [],
    }, { headers: jsonHeaders() });
    return data;
  } catch (err: unknown) {
    return { success: false, message: axios.isAxiosError(err) ? err.response?.data?.message : undefined };
  }
};

/* Edición de datos básicos -- mismo endpoint que usa el modal de edición
   real de la web (ModalupdateEvento.js), NO el /actualizarevento
   genérico (ese exige mandar TODAS las localidades otra vez o las borra). */
export interface ActualizarDescripcionPayload {
  id_evento: number;
  nombreConcierto: string;
  fechaConcierto: string;
  horaConcierto: string;
  lugarConcierto: string;
  cuidadConcert: string;
  descripcionConcierto: string;
  imagenConcierto?: string;
  mapaConcierto?: string;
}

export const actualizarDescripcionEvento = async (payload: ActualizarDescripcionPayload): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data } = await axios.post(`${URL_BASE}/actualisar_descripcion_evento`, payload, { headers: jsonHeaders() });
    return data;
  } catch (err: unknown) {
    return { success: false, message: axios.isAxiosError(err) ? err.response?.data?.message : undefined };
  }
};

export const ESTADOS_CAMBIABLES = ['PROCESO', 'PROXIMO', 'ACTIVO', 'CANCELADO'];

export const actualizarEstadoEvento = async (codigoEvento: string, estado: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const staff = obtenerStaffData();
    const { data } = await axios.put(`${URL_ROOT}/actualizarevento_estado/${codigoEvento}`,
      { estado, id_usuario: 0, id_operador: staff?.id || 0 }, { headers: jsonHeaders() });
    return data;
  } catch (err: unknown) {
    return { success: false, message: axios.isAxiosError(err) ? err.response?.data?.message : undefined };
  }
};

export const listarLocalidadesAdmin = async (codigoEvento: string): Promise<LocalidadAdmin[]> => {
  try {
    const { data } = await axios.get(`${URL_ROOT}/ListaPreciosLocalidades/${codigoEvento}`, { headers: staffAuthHeaders() });
    return data?.success && Array.isArray(data.data) ? data.data : [];
  } catch {
    return [];
  }
};

export interface CrearLocalidadPayload {
  codigoEvento: string;
  localidad: string;
  precio_normal: string;
  precio_discapacidad: string;
  precio_tarjeta: string;
  precio_descuento: string;
  habilitar_cortesia: string;
  comision_boleto: string;
  habilitar: string;
}

export const crearLocalidadAdmin = async (payload: CrearLocalidadPayload): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data } = await axios.post(`${URL_ROOT}/crear_localidad_precio_evento`, payload, { headers: jsonHeaders() });
    return data;
  } catch (err: unknown) {
    return { success: false, message: axios.isAxiosError(err) ? err.response?.data?.message : undefined };
  }
};

export interface ActualizarPrecioPayload {
  id_precios: number;
  precio_normal: string;
  precio_discapacidad: string;
  precio_tarjeta: string;
  precio_descuento: string;
  habilitar_cortesia: string;
  comision_boleto: string;
  mensaje_promocion?: string;
}

export const actualizarPrecioLocalidadAdmin = async (payload: ActualizarPrecioPayload): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data } = await axios.post(`${URL_BASE}/actualisar_precio_localidad`, payload, { headers: jsonHeaders() });
    return data;
  } catch (err: unknown) {
    return { success: false, message: axios.isAxiosError(err) ? err.response?.data?.message : undefined };
  }
};

/* Elimina la fila de precio de la localidad para el evento -- el backend
   NO valida si ya hay boletos vendidos con esa localidad, así que se
   pide confirmación fuerte en la UI antes de llamar a esto. */
export const eliminarLocalidadAdmin = async (codigoEvento: string, localidad: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data } = await axios.delete(
      `${URL_ROOT}/eliminarevento/${encodeURIComponent(codigoEvento)}/${encodeURIComponent(localidad)}`,
      { headers: staffAuthHeaders() }
    );
    return data;
  } catch (err: unknown) {
    return { success: false, message: axios.isAxiosError(err) ? err.response?.data?.message : undefined };
  }
};

/* ── Factura final del evento (resumen de cierre) ── */
export interface ResumenFormaPago {
  forma_pago: string;
  subtotal_neto: number;
  total: number;
  comision_bancaria: number;
  subtotal: number;
  iva: number;
  comision_boleto: number;
  boleto: number;
  cantidad: number;
}
export interface RegistroOrigenFactura {
  id_registraCompra: number;
  cedula: string;
  cantidad: number;
  precio_unitario: number;
  subtotal_item: number;
}
export interface FacturaLocalidadItem {
  localidad: string;
  tarifa: string; // NORMAL | DISCAPACIDAD | PROMOCION | DESCUENTO
  precio_unitario_base: number;
  precio_actual_catalogo: number;
  cantidad: number;
  subtotal_sin_iva: number;
  registros_origen?: RegistroOrigenFactura[];
}
export interface ResumenOperador {
  operador: string;
  forma_pago: string;
  total: number;
  subtotal: number;
  iva: number;
  comision_bancaria: number;
  comision_boleto: number;
  boleto: number;
  cantidad: number;
}
export interface FacturaFinalEvento {
  porFormaPago: ResumenFormaPago[];
  porLocalidad: FacturaLocalidadItem[];
  porOperador: ResumenOperador[];
}

export const obtenerFacturaFinalEvento = async (codigoEvento: string): Promise<FacturaFinalEvento> => {
  const headers = { 'Content-Type': 'application/json' };
  const pedir = <T,>(path: string): Promise<T[]> =>
    axios.post(`${URL_MIKROTI}/Boleteria/${path}`, { nombre: codigoEvento }, { headers })
      .then(r => Array.isArray(r.data?.data) ? r.data.data as T[] : [])
      .catch(() => [] as T[]);

  const [porFormaPago, porLocalidad, porOperador] = await Promise.all([
    pedir<ResumenFormaPago>('evento_valor'),
    pedir<FacturaLocalidadItem>('factura_localidades_v3'),
    pedir<ResumenOperador>('evento_user'),
  ]);
  return { porFormaPago, porLocalidad, porOperador };
};
