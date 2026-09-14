import axios from 'axios';
import { staffAuthHeaders } from './staffAuth';

/* Misma consulta que usa TicketsWeb/app_tickets para saber qué pasarelas
   están activas y su comisión configurada desde el panel admin (global o
   por evento vía codigoEvento). Copiado tal cual de app_tickets. */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export interface MetodoPagoActivo {
  metodo: string;
  activo: boolean;
  comision_porcentaje: number;
}

export const obtenerMetodosPagoActivos = async (codigoEvento?: string): Promise<MetodoPagoActivo[]> => {
  try {
    // Con el JWT del vendedor logueado (no el token de servicio a secas):
    // el backend decodifica req.userData de ahí para aplicar la
    // restricción por usuario (usuario_metodos_pago) si el admin le
    // asignó un subconjunto -- sin esto, cualquier vendedor veía TODOS
    // los métodos activos sin importar lo que se le configuró en la web.
    const { data } = await axios.get(`${URL_BASE}/metodos_pago_activos`, {
      headers: staffAuthHeaders(),
      params: codigoEvento ? { codigoEvento } : undefined,
    });
    return Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
  }
};

/* Para la pantalla de Admin > Métodos de pago: a diferencia de
   obtenerMetodosPagoActivos() (que traga errores para no romper la venta),
   acá se necesita saber SI falló y por qué -- mismo bug que tenía la web
   (ver ConfiguracionPagos/index.js): con el JWT de admin vencido (dura 1h)
   el switch de activar/desactivar parecía "no hacer nada" sin avisar. */
export const listarMetodosPagoAdmin = async (): Promise<{
  success: boolean;
  data: MetodoPagoActivo[];
  sesionExpirada: boolean;
}> => {
  try {
    const { data } = await axios.get(`${URL_BASE}/metodos_pago_activos`, {
      headers: staffAuthHeaders(),
    });
    return { success: !!data?.success, data: Array.isArray(data?.data) ? data.data : [], sesionExpirada: false };
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    return { success: false, data: [], sesionExpirada: status === 401 || status === 403 };
  }
};

export const toggleMetodoPagoActivo = async (
  metodo: string,
  activo: boolean
): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data } = await axios.patch(
      `${URL_BASE}/configuracion_pagos/${encodeURIComponent(metodo)}/activo`,
      { activo },
      { headers: staffAuthHeaders() }
    );
    return { success: !!data?.success, message: data?.message };
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    return {
      success: false,
      message: status === 401 || status === 403
        ? 'Tu sesión expiró. Cierra sesión y vuelve a iniciar sesión para poder activar/desactivar métodos.'
        : 'No se pudo cambiar el estado (error de conexión).',
    };
  }
};

/* Compartido entre Pago.tsx (venta real) y Vender.tsx (vista previa "Sumar
   comisiones" en la lista de eventos) para que el cálculo del total final
   sea siempre el mismo, sin duplicar la fórmula en dos lados. */
export type CategoriaMetodo = 'gateway' | 'local' | 'transferencia';
export interface MetodoConfigurable {
  key: string;
  label: string;
  pctDefault: number;
  categoria: CategoriaMetodo;
}

/* Mismo set completo de métodos que ofrece VenderTiket.js en la web para
   venta presencial, todos configurables desde Ajustes > Métodos de Pago.
   Quedan afuera a propósito Stripe/PayPal (no conectados de punta a punta
   ni en la web) y "Recaudación Terceros" (oculto también en la web). */
export const METODOS_CONFIGURABLES: MetodoConfigurable[] = [
  { key: 'Efectivo-Local', label: 'Efectivo',                 pctDefault: 0,    categoria: 'local' },
  // 0.15 -- mismo respaldo que GetValores() en CarritoLocalStorang.js (web):
  // si por lo que sea el backend no devuelve el % configurado para este
  // método, ANTES esto caía a 0 acá (pero a 0.15 en la web), lo que hacía
  // que la app cobrara de menos en una venta con Tarjeta física.
  { key: 'Tarjeta-Local',  label: 'Tarjeta física (POS)',      pctDefault: 0.15, categoria: 'local' },
  { key: 'Efectivo-QR',    label: 'Efectivo (QR recaudación)', pctDefault: 0,    categoria: 'local' },
  { key: 'Efectivo',       label: 'Efectivo (Speed/Comnet)',   pctDefault: 0.08, categoria: 'local' },
  { key: 'PagoPlux',       label: 'Link de pago (Tarjeta)',    pctDefault: 0.11, categoria: 'gateway' },
  { key: 'Payphone',       label: 'Payphone',                  pctDefault: 0.11, categoria: 'gateway' },
  { key: 'Duna',           label: 'Duna / Banco Pichincha',    pctDefault: 0.11, categoria: 'gateway' },
  { key: 'Transferencia',  label: 'Transferencia / Depósito',  pctDefault: 0.08, categoria: 'transferencia' },
];

export interface DesgloseTotal {
  subtotal: number;
  comisionServicio: number;
  ivaImporte: number;
  comisionBancaria: number;
  total: number;
}

/* subtotal = precio*cantidad; iva y comisión bancaria se calculan sobre
   (subtotal + comisión de servicio ya incluida en el iva base) -- misma
   fórmula que usa Pago.tsx para la venta real. */
export const calcularTotalConComision = (
  precioUnitario: number,
  cantidad: number,
  comisionBoletoUnitario: number,
  ivaRate: number,
  pctComisionBancaria: number
): DesgloseTotal => {
  const subtotal = precioUnitario * cantidad;
  const comisionServicio = comisionBoletoUnitario * cantidad;
  const ivaImporte = subtotal * ivaRate;
  const comisionBancaria = (subtotal + ivaImporte) * pctComisionBancaria;
  return {
    subtotal,
    comisionServicio,
    ivaImporte,
    comisionBancaria,
    total: subtotal + comisionServicio + ivaImporte + comisionBancaria,
  };
};
