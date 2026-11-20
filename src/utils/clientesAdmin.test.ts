import { describe, expect, it } from 'vitest';
import { clienteDeRespuesta, correoValido, hayCambios, type ClienteDatos } from './clientesAdmin';
import { puedeVerClave } from './permisosPaginas';

const BASE: ClienteDatos = { id: 1, cedula: '0912345678', nombreCompleto: 'ANA PEREZ', email: 'ana@correo.com', movil: '0987654321', ciudad: 'Manta', direccion: '' };

describe('editar cliente (app)', () => {
  it('lo que llega del servidor se vuelve texto sin nulls', () => {
    expect(clienteDeRespuesta({ id: 5, cedula: '0911', nombreCompleto: 'X', email: null, movil: undefined })).toEqual({ id: 5, cedula: '0911', nombreCompleto: 'X', email: '', movil: '', ciudad: '', direccion: '' });
    expect(clienteDeRespuesta(null)).toBeNull();
    expect(clienteDeRespuesta({ nombreCompleto: 'sin id' })).toBeNull();
  });

  it('solo hay cambios si algo es realmente distinto (correo sin mayúsculas, celular sin formato, espacios)', () => {
    expect(hayCambios(BASE, { ...BASE, email: ' ANA@Correo.com ', movil: '0987 654 321', nombreCompleto: 'ANA   PEREZ' })).toBe(false);
    expect(hayCambios(BASE, { ...BASE, email: 'otra@correo.com' })).toBe(true);
    expect(hayCambios(BASE, { ...BASE, ciudad: 'Quito' })).toBe(true);
    expect(hayCambios(BASE, { ...BASE, direccion: 'Calle 1' })).toBe(true);
  });

  it('valida el correo', () => {
    expect(correoValido('a@b.co')).toBe(true);
    expect(['a@b', 'a b@c.com', '@x.com', ''].some(correoValido)).toBe(false);
  });

  it('el botón Editar datos es de admin y super_admin, o de quien tenga la página "suscriptores" (por usuario o por rol)', () => {
    expect(puedeVerClave('suscriptores', 'admin', null)).toBe(true);
    expect(puedeVerClave('suscriptores', 'super_admin', null)).toBe(true);
    expect(puedeVerClave('suscriptores', 'vendedores', null)).toBe(false);
    expect(puedeVerClave('suscriptores', 'vendedores', ['vender', 'suscriptores'])).toBe(true);
    expect(puedeVerClave('suscriptores', 'admin', ['vender'])).toBe(false);
  });
});
