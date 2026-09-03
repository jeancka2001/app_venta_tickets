import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from './msLoginAuth';

/* Misma consulta que usa TicketsWeb (Modallocalida.js y AsignarAsiento/index.js)
   para traer cómo se configuró cada fila en el editor del admin: hacia dónde
   se alinea (izquierda/derecha/centro) y si el orden visual de las sillas
   va invertido. Sin esto, el mapa de la app no coincide con lo que se ve
   configurado en la web. Solo aplica a localidades tipo "fila", no "mesa"
   (así es también en la web). Copiado tal cual de app_tickets. */

const API_HDR = MS_LOGIN_AUTH_HEADERS;
const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export interface ConfiguracionLocalidad {
  alineacion: Record<string, string>;
  ordenSillas: Record<string, boolean>;
  idEspacio: number | null;
}

export const obtenerConfiguracionLocalidad = async (
  idLocalidad: number | string
): Promise<ConfiguracionLocalidad> => {
  try {
    const { data } = await axios.get(`${URL_BASE}/listar_localidades/${idLocalidad}`, { headers: API_HDR });
    const row = Array.isArray(data?.data) ? data.data[0] : data?.data;
    const ma = JSON.parse(row?.mesas_array || '{}');
    return {
      alineacion: ma.alineacion || {},
      ordenSillas: ma.ordenSillas || {},
      idEspacio: row?.id_espacio ?? null,
    };
  } catch {
    return { alineacion: {}, ordenSillas: {}, idEspacio: null };
  }
};

export interface ItemMapaLocalidad {
  fila: string;
  mesa?: string;
  silla: string;
  estado: string;
  idsilla: number;
  cedula?: string;
  id_registra_compra: string;
}

export interface ResumenLocalidad {
  total: number;
  disponibles: number;
  ocupadas: number;
}

export const obtenerMapaLocalidad = async (
  idEspacio: number,
  idLocalidad: number | string
): Promise<{ items: ItemMapaLocalidad[]; resumen: ResumenLocalidad }> => {
  try {
    const { data } = await axios.get(
      `${URL_BASE}/listar_localidades_id_espacio/${idEspacio}/${idLocalidad}`,
      { headers: API_HDR }
    );
    const raw: Array<Record<string, unknown>> = Array.isArray(data?.data) ? data.data : [];
    const items: ItemMapaLocalidad[] = raw.map((r) => ({
      fila: String(r.fila ?? ''),
      mesa: r.mesa != null ? String(r.mesa) : undefined,
      silla: String(r.silla ?? ''),
      estado: String(r.estado ?? '').toLowerCase(),
      idsilla: Number(r.id),
      cedula: r.cedula != null ? String(r.cedula) : undefined,
      id_registra_compra: String(r.id_registra_compra ?? ''),
    }));
    const disponibles = items.filter((i) => i.estado === 'disponible').length;
    return { items, resumen: { total: items.length, disponibles, ocupadas: items.length - disponibles } };
  } catch {
    return { items: [], resumen: { total: 0, disponibles: 0, ocupadas: 0 } };
  }
};

export const claseAlineacion = (alineacion: Record<string, string>, fila: string): 'flex-start' | 'flex-end' | 'center' => {
  if (alineacion[fila] === 'izquierda') return 'flex-start';
  if (alineacion[fila] === 'derecha') return 'flex-end';
  return 'center';
};

export const enOrdenVisual = <T,>(ordenSillas: Record<string, boolean>, fila: string, items: T[]): T[] =>
  ordenSillas[fila] ? [...items].reverse() : items;
