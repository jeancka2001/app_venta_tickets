import type { ItemMapaLocalidad } from './localidadConfig';

/* Agrupación del mapa de asientos para las pantallas de admin
   (AdminLocalidadAsientos y AdminSincronizarFisicos) -- misma estructura
   que Localidad.tsx usa para el vendedor: por fila, o por fila > mesa. */

export const sillaNum = (item: ItemMapaLocalidad, idx: number) =>
  item.silla?.split('-s-')[1] ?? String(idx + 1);

export const agruparMesas = (items: ItemMapaLocalidad[]) => {
  const r: Record<string, Record<string, ItemMapaLocalidad[]>> = {};
  items.forEach(item => {
    const f = item.fila || 'A';
    const m = item.mesa || 'M1';
    if (!r[f]) r[f] = {};
    if (!r[f][m]) r[f][m] = [];
    r[f][m].push(item);
  });
  return r;
};

export const agruparFilas = (items: ItemMapaLocalidad[]) => {
  const r: Record<string, ItemMapaLocalidad[]> = {};
  items.forEach((item, i) => {
    const k = item.fila || String.fromCharCode(65 + Math.floor(i / 20));
    if (!r[k]) r[k] = [];
    r[k].push(item);
  });
  return r;
};

export const colsMesa = (n: number) => (n <= 6 ? n : n <= 10 ? 5 : 6);

export const claseSeat = (item: ItemMapaLocalidad): string => {
  if (item.estado === 'disponible') return 'sc-disp';
  if (item.estado === 'reservado') return 'sc-res';
  if (item.estado === 'ocupado' && !item.cedula) return 'sc-bloq';
  return 'sc-ocp'; // ocupado con cédula -- venta real o asignación con cédula
};

/* "Fila A · Silla 5" / "Fila A · Mesa M2 · Silla 3" -- lo que el admin
   escribe a mano en los campos fila/silla del boleto físico impreso. */
export const etiquetaAsiento = (item: ItemMapaLocalidad, esMesa: boolean): string => {
  const numero = item.silla?.split('-s-')[1] ?? item.silla;
  return [
    item.fila ? `Fila ${item.fila}` : null,
    esMesa && item.mesa ? `Mesa ${item.mesa}` : null,
    numero ? `Silla ${numero}` : null,
  ].filter(Boolean).join(' · ') || `Asiento #${item.idsilla}`;
};
