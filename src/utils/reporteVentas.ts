import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from './msLoginAuth';

/* Mismo endpoint que usa la web en "Reporte por Usuario"
   (ReportePorUsuario/index.js -> ReporteVentasUsuario en Queripagos.js).
   El backend agrupa TODO el rango por operador (quién vendió) y por
   autogestión (clientes que compraron solos). Reporte.tsx (pestaña "Mi
   Reporte") filtra client-side la fila del vendedor logueado;
   AdminReportePorUsuario.tsx (solo admin) muestra el array completo. */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export interface BucketVentas {
  compras: number;
  boletos: number;
  monto: number;
  comision?: number;
}
export interface EventoAgg { evento: string; compras: number; boletos: number; monto: number; }
export interface LocalidadAgg { localidad: string; boletos: number; }
export interface FormaPagoAgg { forma: string; compras: number; boletos: number; monto: number; }

export interface UsuarioAgg {
  id: number | null;
  nombre: string;
  perfil: string | null;
  pagado: BucketVentas;
  pendiente: BucketVentas;
  comprobar: BucketVentas;
  expirado: BucketVentas;
  n_eventos?: number;
  n_localidades?: number;
  eventos?: EventoAgg[];
  localidades?: LocalidadAgg[];
  formas_pago?: FormaPagoAgg[];
}

export interface ReporteVentasUsuarioResponse {
  success: boolean;
  message?: string;
  rango?: { fecha_init: string | null; fecha_fin: string | null };
  total_registros?: number;
  operadores: UsuarioAgg[];
  autogestion?: { resumen: UsuarioAgg; clientes: UsuarioAgg[] };
  sin_identificar?: UsuarioAgg;
}

export const obtenerReporteVentas = async (
  fechaInit: string,
  fechaFin: string
): Promise<ReporteVentasUsuarioResponse> => {
  const qs = new URLSearchParams({ fecha_init: fechaInit, fecha_fin: fechaFin }).toString();
  const { data } = await axios.post(
    `${URL_BASE}/reporte_ventas_usuario?${qs}`,
    {},
    { headers: { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' } }
  );
  return data;
};
