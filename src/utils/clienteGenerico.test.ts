import { describe, expect, it } from 'vitest';
import { celularFalta, correoFalta, correoSintetico, esCelularGenerico, esCorreoSintetico, sufijoAleatorio } from './clienteGenerico';

describe('datos de relleno del cliente', () => {
  it('arma el correo con el nombre, sin tildes ni espacios', () => {
    expect(correoSintetico('María José  Pérez Ñ.', '0912345678', '4821')).toBe('maria.jose.perez.n.4821@sincorreo.t-ickets.com');
  });

  it('sin nombre usa los últimos dígitos de la cédula', () => {
    expect(correoSintetico('  ', '0912345678', '0007')).toBe('cliente.5678.0007@sincorreo.t-ickets.com');
  });

  it('reconoce lo que falta y lo que es de relleno', () => {
    expect(correoFalta('')).toBe(true);
    expect(correoFalta('sin correo')).toBe(true);
    expect(correoFalta('ana@x.com')).toBe(false);
    expect(celularFalta('0')).toBe(true);
    expect(celularFalta('0987654321')).toBe(false);
    expect(esCorreoSintetico(' Ana.1234@SinCorreo.t-ickets.com ')).toBe(true);
    expect(esCorreoSintetico('ana@t-ickets.com')).toBe(false);
    expect(esCelularGenerico('099 999 9999')).toBe(true);
    expect(sufijoAleatorio()).toMatch(/^\d{4}$/);
  });
});
