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
  id_nivel1?: number | null;
  comision_nivel1?: number;
  comision_total?: number;
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
  totales?: { boletos: number; total: number; comision: number; comision_nivel1: number; comision_total: number; neto: number };
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

export const obtenerVentasSinRegistro = async (fechaInit: string, fechaFin: string, codigoEvento = ''): Promise<ReporteSinRegistroResp | null> => {
  try {
    const { data } = await axios.get(`${URL_BASE}/ventas_sin_registro`, {
      headers: staffAuthHeaders(),
      params: { fecha_init: fechaInit, fecha_fin: fechaFin, ...(codigoEvento ? { codigoEvento } : {}) },
    });
    return data;
  } catch {
    return null;
  }
};

export interface OpcionEvento { codigo: string; nombre: string; }

/* Eventos entre los que puede elegir el usuario: aquellos donde vendio (con registro, por nombre) o tiene ventas sin
   registro (por codigo). `todos` = admin, que ve todos los eventos del rango. */
export const opcionesEventos = (
  nombresPropios: string[],
  disponibles: { codigoEvento: string; nombreConcierto: string }[] | undefined,
  sr: ReporteSinRegistroResp | null | undefined,
  todos = false,
): OpcionEvento[] => {
  const mapa = new Map<string, string>();
  const propios = new Set(nombresPropios);
  (disponibles ?? []).forEach((e) => {
    if (todos || propios.has(e.nombreConcierto)) mapa.set(e.codigoEvento, e.nombreConcierto);
  });
  (sr?.vendedores ?? []).forEach((v) => (v.localidades ?? []).forEach((l) => { if (l.codigoEvento) mapa.set(l.codigoEvento, l.evento || l.codigoEvento); }));
  return [...mapa.entries()].map(([codigo, nombre]) => ({ codigo, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
};

export interface SrDeVendedor { boletos: number; total: number; comisionPropia: number; comisionNivel2: number; comisionTotal: number; }

/* Ventas sin registro de un vendedor (para sumarlas a su fila de "Comisiones"). Un admin recibe a todos los vendedores
   (la comision de nivel 2 sale de los que tienen a este como nivel 1); un vendedor recibe solo lo suyo y el total que
   le generan sus nivel 2. */
export const srDeVendedor = (resp: ReporteSinRegistroResp | null | undefined, id: number, esAdmin: boolean): SrDeVendedor | null => {
  if (!resp || !resp.success) return null;
  const mio = (resp.vendedores ?? []).find((v) => v.id_vendedor === id);
  const nivel2 = esAdmin
    ? r2((resp.vendedores ?? []).filter((v) => v.id_nivel1 === id).reduce((a, v) => a + num(v.comision_nivel1), 0))
    : r2(num(resp.comision_nivel2_total));
  if (!mio && nivel2 <= 0) return null;
  const comisionPropia = r2(num(mio?.comision));
  return { boletos: num(mio?.boletos), total: r2(num(mio?.total)), comisionPropia, comisionNivel2: nivel2, comisionTotal: r2(comisionPropia + nivel2) };
};
