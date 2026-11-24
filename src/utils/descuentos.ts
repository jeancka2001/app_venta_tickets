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

/* Código de descuento (el mismo que se escribe en la página de usuarios): GET /api/v1/descuento_link/:codigo.
   Puede ser un % (sobre precio base o final) o un monto fijo en dólares (por entrada o por compra). El backend lo vuelve
   a validar al registrar la compra (vigencia, usos máximos y usos por cédula). */
export interface CodigoDescuento {
  codigo: string;
  id: number;
  nombre: string;
  mensaje_motivo?: string | null;
  tipo: 'porcentaje' | 'monto';
  porcentaje: number;
  monto: number;
  montoPor: 'entrada' | 'compra';
  aplica_sobre: 'base' | 'final';
}

export const validarCodigoDescuento = async (
  codigo: string,
  codigoEvento: string,
  cedula?: string,
): Promise<{ ok: true; descuento: CodigoDescuento } | { ok: false; motivo: string }> => {
  const cod = codigo.trim();
  if (!cod) return { ok: false, motivo: 'Escribe el código de descuento.' };
  try {
    const { data } = await axios.get(`${URL_BASE}/descuento_link/${encodeURIComponent(cod)}`, {
      headers: API_HDR,
      params: { codigoEvento, ...(cedula ? { cedula } : {}) },
    });
    const d = data?.data;
    if (!data?.success || !d?.valido) return { ok: false, motivo: d?.motivo || 'Código de descuento no válido' };
    const esMonto = d.tipo_descuento === 'monto';
    return {
      ok: true,
      descuento: {
        codigo: cod,
        id: Number(d.id),
        nombre: String(d.nombre || 'Código de descuento'),
        mensaje_motivo: d.mensaje_motivo || null,
        tipo: esMonto ? 'monto' : 'porcentaje',
        porcentaje: esMonto ? 0 : Number(d.porcentaje) || 0,
        monto: esMonto ? Number(d.monto_descuento) || 0 : 0,
        montoPor: d.monto_por === 'compra' ? 'compra' : 'entrada',
        aplica_sobre: !esMonto && d.aplica_sobre === 'base' ? 'base' : 'final',
      },
    };
  } catch {
    return { ok: false, motivo: 'No se pudo validar el código. Revisa tu conexión e intenta de nuevo.' };
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
