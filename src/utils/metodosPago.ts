import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from './msLoginAuth';

/* Misma consulta que usa TicketsWeb/app_tickets para saber qué pasarelas
   están activas y su comisión configurada desde el panel admin (global o
   por evento vía codigoEvento). Copiado tal cual de app_tickets. */

const API_HDR = MS_LOGIN_AUTH_HEADERS;
const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export interface MetodoPagoActivo {
  metodo: string;
  activo: boolean;
  comision_porcentaje: number;
}

export const obtenerMetodosPagoActivos = async (codigoEvento?: string): Promise<MetodoPagoActivo[]> => {
  try {
    const { data } = await axios.get(`${URL_BASE}/metodos_pago_activos`, {
      headers: API_HDR,
      params: codigoEvento ? { codigoEvento } : undefined,
    });
    return Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
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
  { key: 'Tarjeta-Local',  label: 'Tarjeta física (POS)',      pctDefault: 0,    categoria: 'local' },
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
