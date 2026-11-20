import { describe, expect, it } from 'vitest';
import { disenoBase, disenoInicial, gruposIncompletos, letra, limpiarDiseno, siguienteLetra, totalDe } from './disenoLocalidad';
import type { Diseno } from './panelesAdmin';

describe('diseño de localidades (editor de asientos)', () => {
  it('las filas se nombran A, B, ... Z, AA y no repiten una usada', () => {
    expect([0, 1, 25, 26, 27].map(letra)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
    expect(siguienteLetra(['A', 'B', 'D'])).toBe('C');
    expect(siguienteLetra(['a', 'b'])).toBe('C');
  });

  it('el total cuenta sillas de filas, de mesas o la cantidad correlativa', () => {
    expect(totalDe({ tipo: 'correlativo', cantidad: 150 })).toBe(150);
    expect(totalDe({ tipo: 'fila', filas: [{ fila: 'A', sillas: 10 }, { fila: 'B', sillas: 12 }] })).toBe(22);
    expect(totalDe({ tipo: 'mesa', filas: [{ fila: 'A', mesas: [{ mesa: 'A1', sillas: 6 }, { mesa: 'A2', sillas: 4 }] }] })).toBe(10);
  });

  it('al cambiar de tipo se propone el mismo total y se conserva el factor (x2)', () => {
    const actual: Diseno = { tipo: 'fila', factor: 2, filas: [{ fila: 'A', sillas: 30 }] };
    expect(disenoInicial('correlativo', actual)).toEqual({ tipo: 'correlativo', cantidad: 30, factor: 2 });
    expect(disenoInicial('fila', actual)).toEqual(actual);                 // mismo tipo: es el real, con sus ocupados
    expect(disenoBase('mesa').filas?.[0].mesas?.[0]).toEqual({ mesa: 'A1', sillas: 6 });
  });

  it('lo que se manda al servidor no lleva los "ocupados" ni textos sueltos', () => {
    const d: Diseno = { tipo: 'mesa', factor: 2, filas: [{ fila: 'A', mesas: [{ mesa: 'A1', sillas: 6, ocupados: 2 }] }] };
    expect(limpiarDiseno(d)).toEqual({ tipo: 'mesa', filas: [{ fila: 'A', mesas: [{ mesa: 'A1', sillas: 6 }] }], factor: 2 });
    expect(limpiarDiseno({ tipo: 'correlativo', cantidad: 80, ocupados: 10 })).toEqual({ tipo: 'correlativo', cantidad: 80, factor: 1 });
  });

  it('con x2 avisa las filas y mesas que no se pueden vender completas', () => {
    expect(gruposIncompletos({ tipo: 'fila', factor: 2, filas: [{ fila: 'A', sillas: 10 }, { fila: 'B', sillas: 9 }] })).toEqual(['fila B']);
    expect(gruposIncompletos({ tipo: 'mesa', factor: 3, filas: [{ fila: 'A', mesas: [{ mesa: 'A1', sillas: 6 }, { mesa: 'A2__x', sillas: 5 }] }] })).toEqual(['mesa A2']);
    expect(gruposIncompletos({ tipo: 'fila', factor: 1, filas: [{ fila: 'A', sillas: 9 }] })).toEqual([]);
    expect(gruposIncompletos({ tipo: 'correlativo', factor: 2, cantidad: 7 })).toEqual([]);
  });
});
