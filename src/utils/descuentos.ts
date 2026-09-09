import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from './msLoginAuth';

/* Tipos de descuento (%) por evento que ESTE vendedor puede aplicar a
   mano (backend MS-LOGIN-BOLETERIA: /api/v1/evento_descuentos con
   id_operador -> filtra por evento_descuento_usuarios). El % se aplica
   sobre el total final; el backend revalida y recalcula al registrar la
   compra (RegistrarCompra + function/descuentos.js). */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';
const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };

export interface DescuentoVendedor {
  id: number;
  nombre: string;
  porcentaje: number;
  mensaje_motivo?: string | null;
}

export const obtenerDescuentosVendedor = async (
  codigoEvento?: string,
  idOperador?: number,
): Promise<DescuentoVendedor[]> => {
  if (!codigoEvento || !idOperador) return [];
  try {
    const { data } = await axios.get(`${URL_BASE}/evento_descuentos`, {
      headers: API_HDR,
      params: { codigoEvento, id_operador: idOperador },
    });
    return Array.isArray(data?.data)
      ? data.data.map((d: DescuentoVendedor) => ({ ...d, porcentaje: Number(d.porcentaje) }))
      : [];
  } catch {
    return [];
  }
};

/* Total con el % de descuento aplicado (mismo criterio que el backend:
   sobre el total final). Devuelve total neto y monto descontado. */
export const aplicarDescuento = (total: number, porcentaje: number) => {
  const pct = Number(porcentaje) || 0;
  const neto = Math.round((total * (1 - pct / 100) + Number.EPSILON) * 100) / 100;
  return { neto, monto: Math.round((total - neto + Number.EPSILON) * 100) / 100 };
};
