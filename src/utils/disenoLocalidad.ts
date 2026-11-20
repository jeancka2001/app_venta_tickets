import type { Diseno } from './panelesAdmin';

/* Ayudas del editor de asientos del evento (las mismas de la web, LocalidadesAsientosPanel.js). Aquí solo se arma el diseño que se
   manda al servidor; quien decide qué se puede cambiar sin perder ventas es el servidor (siempre se revisa antes de aplicar). */

export const letra = (n: number): string => {
  let s = '';
  let x = n;
  do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0);
  return s;
};

export const siguienteLetra = (usadas: string[]): string => {
  const set = new Set(usadas.map((u) => String(u).toUpperCase()));
  for (let i = 0; i < 2000; i++) if (!set.has(letra(i))) return letra(i);
  return `F${usadas.length + 1}`;
};

export const numeroFinal = (t: string): number => { const m = String(t || '').match(/(\d+)\s*$/); return m ? Number(m[1]) : 0; };
export const mostrarMesa = (m: string): string => String(m || '').split('__')[0];
export const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const aEntero = (v: unknown): number => Math.max(0, parseInt(String(v ?? ''), 10) || 0);

export const totalDe = (d: Diseno): number => {
  if (d.tipo === 'correlativo') return Number(d.cantidad) || 0;
  return (d.filas || []).reduce((s, f) => s + (d.tipo === 'fila' ? Number(f.sillas) || 0 : (f.mesas || []).reduce((a, m) => a + (Number(m.sillas) || 0), 0)), 0);
};

export const disenoBase = (tipo: Diseno['tipo'], actual?: Diseno | null): Diseno => {
  const total = actual ? totalDe(actual) : 0;
  if (tipo === 'correlativo') return { tipo, cantidad: total || 100 };
  if (tipo === 'fila') return { tipo, filas: [{ fila: 'A', sillas: 10 }] };
  return { tipo, filas: [{ fila: 'A', mesas: [{ mesa: 'A1', sillas: 6 }] }] };
};

/* Diseño editable a partir del real (con "ocupados" para no dejar quitar lo vendido). */
export const disenoInicial = (tipo: Diseno['tipo'], actual?: Diseno | null): Diseno => {
  const factor = (actual && actual.factor) || 1;
  if (actual && actual.tipo === tipo) return clonar(actual);
  return { ...disenoBase(tipo, actual), factor };
};

/* Lo que se manda al servidor (sin "ocupados") */
export const limpiarDiseno = (d: Diseno) => ({
  ...(d.tipo === 'correlativo' ? { tipo: d.tipo, cantidad: Number(d.cantidad) }
    : d.tipo === 'fila' ? { tipo: d.tipo, filas: (d.filas || []).map((f) => ({ fila: f.fila, sillas: Number(f.sillas) })) }
      : { tipo: d.tipo, filas: (d.filas || []).map((f) => ({ fila: f.fila, mesas: (f.mesas || []).map((m) => ({ mesa: m.mesa, sillas: Number(m.sillas) })) })) }),
  factor: Number(d.factor) || 1,
});

/* Con x2 (o x3...) en numeradas: filas / mesas cuyas sillas no se pueden repartir en grupos completos */
export const gruposIncompletos = (d: Diseno): string[] => {
  const f = Number(d.factor) || 1;
  if (f <= 1 || d.tipo === 'correlativo') return [];
  if (d.tipo === 'fila') return (d.filas || []).filter((x) => Number(x.sillas) % f !== 0).map((x) => `fila ${x.fila}`);
  return (d.filas || []).flatMap((x) => (x.mesas || []).filter((m) => Number(m.sillas) % f !== 0).map((m) => `mesa ${mostrarMesa(m.mesa)}`));
};
