import axios from 'axios';
import { staffAuthHeaders } from './staffAuth';
import type { ItemMapaLocalidad } from './localidadConfig';

/* "Mover cortesías" (solo admin): una silla ocupada SIN compra (cortesía con nombre, con boleto físico o digital)
   pasa a otra silla LIBRE de la MISMA localidad con su nombre, su código / QR y su boleto de la puerta. Se pueden
   mover varias a la vez (van a las sillas siguientes del mismo grupo). El servidor revisa todo y es "todo o nada":
   con aplicar=false solo revisa (vista previa). Endpoint: POST boletos_fisicos/mover_cortesias (MS-LOGIN-BOLETERIA). */
const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export interface MovimientoCortesia {
  id_origen: number;
  id_destino: number;
  de: string;
  a: string;
  nombre: string;
  codigo: string;
  tipo: 'fisico' | 'digital' | 'bloqueo' | '';
  ok: boolean;
  message: string;
}

export type RespuestaMover =
  | { ok: true; aplicado: boolean; mensaje: string; movimientos: MovimientoCortesia[] }
  | { ok: false; mensaje: string; movimientos: MovimientoCortesia[] };

const numeroSilla = (it: ItemMapaLocalidad) => {
  const m = String(it.silla ?? '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
};
const natural = (a: string, b: string) => String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' });
export const ordenSillas = (a: ItemMapaLocalidad, b: ItemMapaLocalidad) =>
  natural(a.fila, b.fila) || natural(a.mesa ?? '', b.mesa ?? '') || numeroSilla(a) - numeroSilla(b);

// "Fila R silla 19" / "Mesa A1 silla 2"
export const etiquetaSilla = (it: ItemMapaLocalidad) =>
  it.mesa
    ? `Mesa ${String(it.mesa).split('__')[0]} silla ${numeroSilla(it)}`
    : `Fila ${it.fila} silla ${numeroSilla(it)}`;

/* Cortesía = ocupada sin compra y con nombre; con conNombre=false entran también las bloqueadas sin nombre */
export const esCortesia = (it: ItemMapaLocalidad, conNombre = true) =>
  it.estado.toLowerCase() === 'ocupado'
  && !Number(it.id_registraCompra)
  && (!conNombre || String(it.cedula ?? '').trim() !== '');

export const esLibre = (it: ItemMapaLocalidad) =>
  ['', 'disponible'].includes(it.estado.toLowerCase()) && !Number(it.id_registraCompra);

export const cortesiasDe = (items: ItemMapaLocalidad[], conNombre: boolean, busqueda: string) => {
  const q = busqueda.trim().toLowerCase();
  return items
    .filter(it => esCortesia(it, conNombre))
    .filter(it => !q || [etiquetaSilla(it), it.cedula, it.id_registra_compra, it.silla].some(v => String(v ?? '').toLowerCase().includes(q)))
    .sort(ordenSillas);
};

export const libresDe = (items: ItemMapaLocalidad[]) => items.filter(esLibre).sort(ordenSillas);

export const moverCortesias = async (
  idLocalidad: number,
  origenes: number[],
  destinoInicial: number,
  aplicar: boolean,
): Promise<RespuestaMover> => {
  try {
    const { data } = await axios.post(
      `${URL_BASE}/boletos_fisicos/mover_cortesias`,
      { id_localidad: idLocalidad, origenes, destino_inicial: destinoInicial, aplicar },
      { headers: { ...staffAuthHeaders(), 'Content-Type': 'application/json' } },
    );
    const movimientos: MovimientoCortesia[] = Array.isArray(data?.movimientos) ? data.movimientos : [];
    if (data?.success) return { ok: true, aplicado: !!data.aplicado, mensaje: String(data.message ?? ''), movimientos };
    return { ok: false, mensaje: String(data?.message || 'No se pudo mover.'), movimientos };
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status === 404) return { ok: false, mensaje: 'Servicio no disponible (falta desplegar el backend).', movimientos: [] };
    if (status === 401 || status === 403) return { ok: false, mensaje: 'Solo un administrador puede mover cortesías (o tu sesión expiró).', movimientos: [] };
    return { ok: false, mensaje: 'No se pudo conectar. Intenta de nuevo.', movimientos: [] };
  }
};
