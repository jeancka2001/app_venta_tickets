import { describe, expect, it } from 'vitest';
import { resumenPropio, type ReporteSinRegistroResp } from './ventasSinRegistro';

const base = (extra: Partial<ReporteSinRegistroResp> = {}): ReporteSinRegistroResp => ({
  success: true, nivel2: [], comision_nivel2_total: 0,
  vendedores: [{
    id_vendedor: 7, nombre: 'Ana', ventas: 2, boletos: 30, subtotal: 300, iva: 45, total: 345,
    comision_porcentaje: 10, comision: 30, neto: 315, metodos: [{ metodo: 'Efectivo', boletos: 30, total: 345 }], localidades: [],
  }],
  ...extra,
});

describe('resumenPropio', () => {
  it('toma la fila del usuario y calcula lo que cobra y lo que queda sin comision', () => {
    const r = resumenPropio(base(), 7)!;
    expect(r).toMatchObject({ boletos: 30, total: 345, porcentaje: 10, comisionPropia: 30, comisionNivel2: 0, comisionTotal: 30, neto: 315 });
  });
  it('suma lo que le generan sus vendedores nivel 2', () => {
    expect(resumenPropio(base({ comision_nivel2_total: 5 }), 7)!.comisionTotal).toBe(35);
  });
  it('un nivel 1 sin ventas propias igual ve la comision de su nivel 2', () => {
    const r = resumenPropio(base({ vendedores: [], comision_nivel2_total: 5 }), 7)!;
    expect(r).toMatchObject({ boletos: 0, total: 0, comisionTotal: 5 });
  });
  it('sin nada o con error devuelve null', () => {
    expect(resumenPropio(base({ vendedores: [] }), 7)).toBeNull();
    expect(resumenPropio(null, 7)).toBeNull();
    expect(resumenPropio({ ...base(), success: false }, 7)).toBeNull();
  });
  it('no toma la fila de otro usuario', () => {
    expect(resumenPropio(base(), 99)).toBeNull();
  });
});

import { opcionesEventos, srDeVendedor } from './ventasSinRegistro';

describe('opcionesEventos', () => {
  const disp = [
    { codigoEvento: 'A', nombreConcierto: 'Evento A' },
    { codigoEvento: 'B', nombreConcierto: 'Evento B' },
    { codigoEvento: 'C', nombreConcierto: 'Evento C' },
  ];
  it('lista solo los eventos donde vendio el usuario y suma los de ventas sin registro', () => {
    const sr = base({ vendedores: [{ ...base().vendedores[0], localidades: [{ codigoEvento: 'C', evento: 'Evento C', localidad: 'G', boletos: 1, total: 1 }] }] });
    expect(opcionesEventos(['Evento B'], disp, sr).map((e) => e.codigo)).toEqual(['B', 'C']);
  });
  it('un admin ve todos los eventos del rango', () => {
    expect(opcionesEventos([], disp, null, true)).toHaveLength(3);
  });
  it('sin ventas no hay opciones', () => {
    expect(opcionesEventos([], disp, null)).toEqual([]);
  });
});

describe('srDeVendedor', () => {
  const admin = base({
    vendedores: [
      { ...base().vendedores[0], id_vendedor: 3, comision: 10, comision_nivel1: 0, id_nivel1: null },
      { ...base().vendedores[0], id_vendedor: 8, comision: 4, comision_nivel1: 2.5, id_nivel1: 3 },
    ],
  });
  it('un admin suma al nivel 1 lo que le generan sus nivel 2', () => {
    expect(srDeVendedor(admin, 3, true)).toMatchObject({ comisionPropia: 10, comisionNivel2: 2.5, comisionTotal: 12.5 });
    expect(srDeVendedor(admin, 8, true)).toMatchObject({ comisionPropia: 4, comisionNivel2: 0 });
    expect(srDeVendedor(admin, 99, true)).toBeNull();
  });
  it('un vendedor nivel 1 sin ventas propias igual recibe lo de su nivel 2', () => {
    expect(srDeVendedor(base({ vendedores: [], comision_nivel2_total: 5 }), 7, false)).toMatchObject({ comisionPropia: 0, comisionTotal: 5 });
  });
});
