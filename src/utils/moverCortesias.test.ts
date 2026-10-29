import { describe, expect, it } from 'vitest';
import { cortesiasDe, esCortesia, esLibre, etiquetaSilla, libresDe } from './moverCortesias';
import type { ItemMapaLocalidad } from './localidadConfig';

const s = (idsilla: number, n: number, extra: Partial<ItemMapaLocalidad> = {}): ItemMapaLocalidad => ({
  fila: 'R', silla: `R-s-${n}`, estado: 'disponible', idsilla, cedula: '', id_registra_compra: `qr-${idsilla}`, id_registraCompra: null, ...extra,
});
const ITEMS = [
  s(103, 22, { estado: 'ocupado', cedula: 'CLIENTE', id_registraCompra: 71986 }),
  s(101, 20, { estado: 'ocupado', cedula: 'ALCALDIA' }),
  s(100, 19, { estado: 'ocupado', cedula: 'SPORT GARDEN', id_registra_compra: '8137644647' }),
  s(102, 21, { estado: 'ocupado', cedula: '' }),
  s(201, 31), s(200, 30),
];

describe('mover cortesías', () => {
  it('cortesía = ocupada sin compra y con nombre; las bloqueadas sin nombre solo si se pide', () => {
    expect(ITEMS.filter(i => esCortesia(i)).map(i => i.idsilla).sort()).toEqual([100, 101]);
    expect(ITEMS.filter(i => esCortesia(i, false)).map(i => i.idsilla).sort()).toEqual([100, 101, 102]);
    expect(esLibre(ITEMS[4])).toBe(true);
    expect(esLibre(ITEMS[1])).toBe(false);
  });
  it('en orden de silla y con búsqueda por nombre, silla o código', () => {
    expect(cortesiasDe(ITEMS, true, '').map(i => i.idsilla)).toEqual([100, 101]);
    expect(cortesiasDe(ITEMS, true, 'sport').map(i => i.idsilla)).toEqual([100]);
    expect(cortesiasDe(ITEMS, true, '8137644647').map(i => i.idsilla)).toEqual([100]);
    expect(libresDe(ITEMS).map(i => i.idsilla)).toEqual([200, 201]);
  });
  it('etiqueta de la silla', () => {
    expect(etiquetaSilla(ITEMS[2])).toBe('Fila R silla 19');
    expect(etiquetaSilla({ ...ITEMS[2], mesa: 'A1__2', silla: 'A1-s-3' })).toBe('Mesa A1 silla 3');
  });
});
