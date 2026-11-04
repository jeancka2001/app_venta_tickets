import { describe, expect, it } from 'vitest';
import { cedulaModulo10, errorDeRuc, rucValido, tipoIdentificacion } from './identificacion';

// 1710034065 es una cedula con digito verificador correcto; su RUC de persona natural es 1710034065001
describe('identificacion ecuatoriana', () => {
  it('cedula modulo 10', () => {
    expect(cedulaModulo10('1710034065')).toBe(true);
    expect(cedulaModulo10('1710034066')).toBe(false);
    expect(cedulaModulo10('9910034065')).toBe(false);
  });

  it('RUC de persona natural: cedula valida + establecimiento 001 o mayor', () => {
    expect(rucValido('1710034065001')).toBe(true);
    expect(rucValido('1710034065002')).toBe(true);
    expect(rucValido('1710034065000')).toBe(false);
    expect(rucValido('1710034066001')).toBe(false);
  });

  it('RUC de sociedades (9) y publicas (6): solo estructura; 7 y 8 no existen', () => {
    expect(rucValido('1790012345001')).toBe(true);
    expect(rucValido('0160001230001')).toBe(true);
    expect(rucValido('1770012345001')).toBe(false);
    expect(rucValido('9990012345001')).toBe(false);
  });

  it('solo un RUC invalido da error; cedulas y pasaportes no se tocan', () => {
    expect(tipoIdentificacion('1710034065001')).toBe('RUC');
    expect(tipoIdentificacion('1710034065')).toBe('CEDULA');
    expect(tipoIdentificacion('AB123')).toBe('OTRO');
    expect(errorDeRuc('1710034066001')).toContain('RUC');
    expect(errorDeRuc('1710034065001')).toBeNull();
    expect(errorDeRuc('1710034066')).toBeNull();
    expect(errorDeRuc('pasaporte')).toBeNull();
  });
});
