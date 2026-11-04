/* Identificacion del comprador: cedula (10 digitos) o RUC (13 digitos). Misma regla que la pagina (TicketsWeb/src/utils/identificacion.js)
   y el backend (MS-LOGIN-BOLETERIA/src/function/identificacionEc.js). La cedula no se valida aqui (solo el largo, como siempre); el RUC si:
   13 digitos, provincia 01-24 o 30, tercer digito 0-6 o 9, establecimiento 001 o mayor y, en persona natural (tercer digito 0-5),
   la cedula de los 10 primeros digitos valida (modulo 10). Sociedades (9) y entidades publicas (6): solo la estructura. */
const provinciaValida = (valor: string): boolean => {
  const p = Number(valor.slice(0, 2));
  return (p >= 1 && p <= 24) || p === 30;
};

export const cedulaModulo10 = (valor: string): boolean => {
  const v = String(valor ?? '').trim();
  if (!/^\d{10}$/.test(v) || !provinciaValida(v) || Number(v[2]) > 5) return false;
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const suma = coef.reduce((s, c, i) => {
    const p = c * Number(v[i]);
    return s + (p > 9 ? p - 9 : p);
  }, 0);
  return (10 - (suma % 10)) % 10 === Number(v[9]);
};

export const rucValido = (valor: string): boolean => {
  const v = String(valor ?? '').trim();
  if (!/^\d{13}$/.test(v) || !provinciaValida(v)) return false;
  const tercero = Number(v[2]);
  if (tercero === 7 || tercero === 8) return false;
  if (Number(v.slice(10)) < 1) return false;
  return tercero < 6 ? cedulaModulo10(v.slice(0, 10)) : true;
};

export type TipoIdentificacion = 'CEDULA' | 'RUC' | 'OTRO';
export const tipoIdentificacion = (valor: string): TipoIdentificacion => {
  const v = String(valor ?? '').trim();
  if (/^\d{13}$/.test(v)) return 'RUC';
  if (/^\d{10}$/.test(v)) return 'CEDULA';
  return 'OTRO';
};

export const MENSAJE_RUC_INVALIDO = 'El RUC ingresado no es válido: revisa los 13 dígitos (termina en 001 o mayor).';
/* null si esta bien (o si no es un RUC: lo demas no se toca); si es un RUC invalido, el mensaje para mostrar */
export const errorDeRuc = (valor: string): string | null =>
  (tipoIdentificacion(valor) === 'RUC' && !rucValido(valor) ? MENSAJE_RUC_INVALIDO : null);
