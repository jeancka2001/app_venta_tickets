import axios from 'axios';
import { staffAuthHeaders } from './staffAuth';

/* Mismo servicio que usa TicketsWeb en "Comisiones de vendedores"
   (ReporteComisiones/index.js) -- el backend ya filtra por quién pregunta
   (ver ReporteComisionesVendedores en User.controller.js): admin/super_admin
   reciben la lista completa; cualquier otro perfil recibe SOLO su propia
   fila (que, si es nivel 1, ya trae sus nivel 2 embebidos en `nivel2`). */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export interface DetalleEventoComision {
  evento: string;
  origen: 'propio' | 'nivel2';
  nivel2_nombre?: string;
  monto: number;
  cantidad: number;
  porcentaje: number;
  comision: number;
}

export interface Nivel2Resumen {
  id: number;
  name: string;
  ventas: number;
  cantidad_ventas: number;
  comision_porcentaje: number | null;
  comision_directa: number;
  comision_nivel1_porcentaje: number | null;
  comision_generada_nivel1: number;
}

export interface FilaComision {
  id: number;
  name: string;
  username?: string;
  perfil: string;
  id_nivel1: number | null;
  comision_porcentaje: number | null;
  ventas_propias: number;
  cantidad_ventas_propias: number;
  comision_directa: number;
  comision_nivel1_porcentaje: number | null;
  comision_generada_nivel1: number;
  nivel2: Nivel2Resumen[];
  comision_nivel1_total: number;
  comision_total: number;
  detalle_por_evento: DetalleEventoComision[];
}

export interface ReporteComisionesResp {
  success: boolean;
  message?: string;
  sesion_expirada?: boolean;
  rango?: { fecha_init: string | null; fecha_fin: string | null; codigoEvento: string | null };
  data: FilaComision[];
}

export const obtenerReporteComisiones = async (
  fechaInit?: string,
  fechaFin?: string,
  codigoEvento?: string
): Promise<ReporteComisionesResp> => {
  try {
    const { data } = await axios.get(`${URL_BASE}/reporte_comisiones_vendedores`, {
      headers: staffAuthHeaders(),
      params: { fecha_init: fechaInit, fecha_fin: fechaFin, codigoEvento: codigoEvento || undefined },
    });
    return data;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    return {
      success: false,
      sesion_expirada: status === 401,
      message: status === 401 ? 'Tu sesión expiró.' : 'Error de conexión al generar el reporte.',
      data: [],
    };
  }
};
