import axios from 'axios';
import { staffAuthHeaders } from './staffAuth';

/* Ventas de boletos fisicos SIN registro de cliente (las registra un admin a nombre de un vendedor desde la pagina:
   Ventas > Ventas sin registro). El backend (VentasSinRegistro.controller.js) devuelve a un usuario que no es admin
   SOLO lo suyo, con su comision ya calculada (sobre el subtotal sin IVA) y, si es nivel 1, lo que le generan sus
   vendedores nivel 2. */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export interface MetodoSinRegistro { metodo: string; boletos: number; total: number; }
export interface LocalidadSinRegistro { codigoEvento: string; evento: string; localidad: string; boletos: number; total: number; }
export interface VendedorSinRegistro {
  id_vendedor: number;
  nombre: string;
  ventas: number;
  boletos: number;
  subtotal: number;
  iva: number;
  total: number;
  comision_porcentaje: number;
  comision: number;
  neto: number;
  metodos: MetodoSinRegistro[];
  localidades: LocalidadSinRegistro[];
}
export interface Nivel2SinRegistro { id_vendedor: number; nombre: string; boletos: number; total: number; comision_nivel1_porcentaje: number; comision_nivel1: number; }
export interface ReporteSinRegistroResp {
  success: boolean;
  message?: string;
  sin_migracion?: boolean;
  vendedores: VendedorSinRegistro[];
  nivel2: Nivel2SinRegistro[];
  comision_nivel2_total: number;
}

export interface ResumenSinRegistro {
  ventas: number;
  boletos: number;
  total: number;
  porcentaje: number;
  comisionPropia: number;
  comisionNivel2: number;
  comisionTotal: number;
  neto: number;
  metodos: MetodoSinRegistro[];
  localidades: LocalidadSinRegistro[];
}

const num = (n: unknown) => Number(n) || 0;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Lo del usuario logueado a partir de la respuesta. null = no tiene nada (ni propio ni de su nivel 2).
export const resumenPropio = (resp: ReporteSinRegistroResp | null | undefined, idUsuario: number | null | undefined): ResumenSinRegistro | null => {
  if (!resp || !resp.success) return null;
  const mio = (resp.vendedores ?? []).find((v) => v.id_vendedor === idUsuario) ?? null;
  const comisionNivel2 = r2(num(resp.comision_nivel2_total));
  if (!mio && comisionNivel2 <= 0) return null;
  const comisionPropia = r2(num(mio?.comision));
  return {
    ventas: num(mio?.ventas),
    boletos: num(mio?.boletos),
    total: r2(num(mio?.total)),
    porcentaje: num(mio?.comision_porcentaje),
    comisionPropia,
    comisionNivel2,
    comisionTotal: r2(comisionPropia + comisionNivel2),
    neto: r2(num(mio?.total) - comisionPropia),
    metodos: mio?.metodos ?? [],
    localidades: mio?.localidades ?? [],
  };
};

export const obtenerVentasSinRegistro = async (fechaInit: string, fechaFin: string): Promise<ReporteSinRegistroResp | null> => {
  try {
    const { data } = await axios.get(`${URL_BASE}/ventas_sin_registro`, {
      headers: staffAuthHeaders(),
      params: { fecha_init: fechaInit, fecha_fin: fechaFin },
    });
    return data;
  } catch {
    return null;
  }
};
