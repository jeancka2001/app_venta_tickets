import { describe, expect, it } from 'vitest';
import { PAGINAS_APP, puedeVerClave } from './permisosPaginas';

/* Misma regla que la web (Ajustes > Permisos de páginas): con lista configurada se ve SOLO esa lista; sin configuración (null),
   los roles de siempre; y el admin nunca pierde "Permisos de páginas". */
describe('permisos de páginas de la app', () => {
  it('sin configuración, el admin ve todas las páginas del menú', () => {
    PAGINAS_APP.forEach((p) => expect(puedeVerClave(p.clave, 'admin', null), p.clave).toBe(true));
  });

  it('sin configuración, un vendedor solo ve vender y su reporte', () => {
    const vistas = PAGINAS_APP.filter((p) => puedeVerClave(p.clave, 'vendedores', null)).map((p) => p.clave);
    expect(vistas.sort()).toEqual(['mi_reporte', 'vender']);
  });

  it('super_admin sin configuración ve Soporte pero no Devoluciones ni Permisos (como en la web)', () => {
    expect(puedeVerClave('soporte', 'super_admin', null)).toBe(true);
    expect(puedeVerClave('devoluciones', 'super_admin', null)).toBe(false);
    expect(puedeVerClave('permisos', 'super_admin', null)).toBe(false);
  });

  it('con una lista configurada se ve SOLO lo de la lista, también el admin', () => {
    expect(puedeVerClave('soporte', 'vendedores', ['soporte'])).toBe(true);
    expect(puedeVerClave('vender', 'vendedores', ['soporte'])).toBe(false);
    expect(puedeVerClave('devoluciones', 'admin', ['soporte'])).toBe(false);
  });

  it('el admin nunca pierde Permisos de páginas, aunque la lista no lo traiga', () => {
    expect(puedeVerClave('permisos', 'admin', [])).toBe(true);
    expect(puedeVerClave('permisos', 'super_admin', [])).toBe(false);
  });

  it('un usuario habilitado en una página que su rol no tenía la ve (se habilita para ese usuario)', () => {
    expect(puedeVerClave('devoluciones', 'vendedores', null)).toBe(false);
    expect(puedeVerClave('devoluciones', 'vendedores', ['vender', 'devoluciones'])).toBe(true);
  });

  it('sin perfil o con perfil desconocido no ve nada por defecto', () => {
    expect(puedeVerClave('vender', undefined, null)).toBe(false);
    expect(puedeVerClave('vender', 'otro_rol', null)).toBe(false);
  });

  it('las rutas del menú son únicas y las claves no se repiten', () => {
    expect(new Set(PAGINAS_APP.map((p) => p.clave)).size).toBe(PAGINAS_APP.length);
    expect(new Set(PAGINAS_APP.map((p) => p.ruta)).size).toBe(PAGINAS_APP.length);
  });
  it('Chats es una página propia: admin la ve por defecto y con configuración solo si se marca', () => {
    expect(puedeVerClave('chats', 'admin', null)).toBe(true);
    expect(puedeVerClave('chats', 'vendedores', null)).toBe(false);
    expect(puedeVerClave('chats', 'vendedores', ['chats'])).toBe(true);
    expect(puedeVerClave('chats', 'admin', ['soporte'])).toBe(false);
  });
});
