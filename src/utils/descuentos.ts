import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from './msLoginAuth';

/* Tipos de descuento (%) por evento que ESTE vendedor puede aplicar a
   mano (backend MS-LOGIN-BOLETERIA: /api/v1/evento_descuentos con
   id_operador -> filtra por evento_descuento_usuarios). El backend
   revalida y recalcula al registrar la compra (RegistraCompra +
   function/descuentos.js) -- mismo criterio que TicketsWeb
   (CarritoLocalStorang.js GetValores()). */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';
const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };

export interface DescuentoVendedor {
  id: number;
  nombre: string;
  porcentaje: number;
  mensaje_motivo?: string | null;
  // 'base' = el % se resta del precio del boleto ANTES de IVA/comisión
  // bancaria (la comisión de boletería, al ser un monto fijo por boleto,
  // no cambia). 'final' (default) = el % se resta del total ya armado.
  // Configurable por tipo de descuento en TicketsWeb (DescuentosPanel.js).
  aplica_sobre: 'base' | 'final';
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
      ? data.data.map((d: DescuentoVendedor) => ({
          ...d,
          porcentaje: Number(d.porcentaje),
          aplica_sobre: d.aplica_sobre === 'base' ? 'base' : 'final',
        }))
      : [];
  } catch {
    return [];
  }
};

/* Total con el % de descuento aplicado sobre el TOTAL FINAL (el otro modo,
   "sobre precio base", no es un simple % sobre el total -- reduce el precio
   unitario antes de recalcular IVA/comisión bancaria, ver su uso en
   Pago.tsx). Devuelve total neto y monto descontado. */
export const aplicarDescuento = (total: number, porcentaje: number) => {
  const pct = Number(porcentaje) || 0;
  const neto = Math.round((total * (1 - pct / 100) + Number.EPSILON) * 100) / 100;
  return { neto, monto: Math.round((total - neto + Number.EPSILON) * 100) / 100 };
};
