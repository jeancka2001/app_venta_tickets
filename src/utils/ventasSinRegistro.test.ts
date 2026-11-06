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
