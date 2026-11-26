/* Datos de relleno para vender a un cliente del que no se tiene correo o celular. Mismo formato que el backend
   (MS-LOGIN-BOLETERIA, function/clienteGenerico.js): a los correos de este dominio el servidor NO les envía nada. */

export const DOMINIO_SINTETICO = 'sincorreo.t-ickets.com';
export const CELULAR_GENERICO = '0999999999';

export const esCorreoSintetico = (correo?: string): boolean =>
  (correo || '').trim().toLowerCase().endsWith(`@${DOMINIO_SINTETICO}`);

export const correoFalta = (correo?: string): boolean => !(correo || '').includes('@');
export const celularFalta = (movil?: string): boolean => (movil || '').replace(/\D/g, '').length < 7;
export const esCelularGenerico = (movil?: string): boolean => (movil || '').replace(/\D/g, '') === CELULAR_GENERICO;

export const sufijoAleatorio = (): string => String(Math.floor(Math.random() * 10000)).padStart(4, '0');

/* "María José Pérez" -> maria.jose.perez.4821@…  Sin nombre: cliente.<últimos 4 de la cédula>.4821@… */
export const correoSintetico = (nombre: string, cedula: string, sufijo: string): string => {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40).replace(/\.+$/, '')
    || `cliente.${cedula.replace(/\D/g, '').slice(-4) || '0000'}`;
  return `${base}.${sufijo}@${DOMINIO_SINTETICO}`;
};
