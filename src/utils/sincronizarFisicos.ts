import axios from 'axios';
import { staffAuthHeaders, obtenerStaffData } from './staffAuth';
import { obtenerInfoBoleto } from './infoBoleto';

/* "Sincronizar boletos físicos" (solo admin) -- vincula un boleto impreso
   con número correlativo a un asiento de una localidad NUMERADA (fila/mesa)
   del mapa digital, sin pasar por una compra:

   - El asiento queda Ocupado; si se le escribe una cédula (o cualquier
     texto) se guarda en localidades_items.cedula y el mapa lo pinta en rojo.
   - Si se escanea el QR/código del boleto físico, ese código queda como
     localidades_items.id_registra_compra del asiento -- mismo criterio que
     AsignarBoletoFisico (BoletosFisicos.controller.js): así, al escanear el
     papel en "Escanear boleto" o en la puerta, sale ESTE asiento.
   - id_registraCompra queda NULL: es lo que distingue una asignación
     manual de una venta real (ver EscanearBoleto.tsx).

   El endpoint vive en MS-LOGIN-BOLETERIA; el contrato completo está en
   docs/sincronizar-boletos-fisicos.md. */
const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

const jsonHeaders = () => ({ ...staffAuthHeaders(), 'Content-Type': 'application/json' });

export interface AsientoSincronizar {
  id_localidades_items: number;
  codigo_barras: string | null;
  cedula: string | null;
  /* Sección del inventario de boletos_fisicos donde está el código, para
     marcarlo como usado allí -- null si no está en el inventario. */
  seccion: string | null;
}

export interface ResultadoAsientoSincronizado {
  id_localidades_items: number;
  ok: boolean;
  message?: string;
}

export type ResultadoSincronizacion =
  | { ok: true; resultados: ResultadoAsientoSincronizado[] }
  | { ok: false; mensaje: string };

export const sincronizarAsientosFisicos = async (
  codigoEvento: string,
  idLocalidad: number,
  asientos: AsientoSincronizar[],
): Promise<ResultadoSincronizacion> => {
  try {
    const { data } = await axios.post(`${URL_BASE}/boletos_fisicos/sincronizar_asientos`, {
      codigoEvento,
      id_localidad: idLocalidad,
      id_operador: obtenerStaffData()?.id || 0,
      asientos,
    }, { headers: jsonHeaders() });
    const resultados: ResultadoAsientoSincronizado[] = Array.isArray(data?.resultados) ? data.resultados : [];
    if (!data?.success && resultados.length === 0) {
      return { ok: false, mensaje: data?.message || 'No se pudo sincronizar.' };
    }
    return { ok: true, resultados };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return { ok: false, mensaje: 'Servicio de sincronización no disponible (falta desplegar el backend).' };
    }
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      return { ok: false, mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
    }
    return {
      ok: false,
      mensaje: (axios.isAxiosError(err) && err.response?.data?.message) || 'Error de conexión al sincronizar.',
    };
  }
};

/* Revisa un código escaneado ANTES de guardarlo, para no vincular un
   boleto que ya pertenece a otro asiento o que ya se vendió/anuló:
   - info-boleto: si el código ya es el QR de algún asiento, se rechaza.
   - boletos_fisicos/buscar: si está en el inventario se toma su sección
     (y el número impreso, solo para mostrarlo); si en alguna sección ya
     no está "Disponible", se rechaza. Si no está en el inventario se
     permite igual (boletos impresos sin importar). */
export type VerificacionCodigo =
  | { ok: true; seccion: string | null; filaAsiento: string | null; aviso?: string }
  | { ok: false; mensaje: string };

export const verificarCodigoFisico = async (codigoEvento: string, codigo: string): Promise<VerificacionCodigo> => {
  const [info, inventario] = await Promise.all([
    obtenerInfoBoleto(codigo),
    axios.get(`${URL_BASE}/boletos_fisicos/buscar`, {
      headers: staffAuthHeaders(),
      params: { codigoEvento, codigo_barras: codigo },
    }).then(r => (r.data?.success && Array.isArray(r.data.data) ? r.data.data : [])).catch(() => null),
  ]);

  if (info.ok && info.tipo === 'asiento') {
    const d = info.data;
    const donde = [d.localidad_nombre?.replace(/__+/g, '').trim(), d.fila ? `Fila ${d.fila}` : null, d.silla ? `Silla ${d.silla}` : null]
      .filter(Boolean).join(' · ');
    return { ok: false, mensaje: `Ese código ya está vinculado a ${donde || `el asiento #${d.id_item}`}.` };
  }

  if (inventario === null) {
    return { ok: true, seccion: null, filaAsiento: null, aviso: 'No se pudo revisar el inventario -- se sincroniza igual.' };
  }
  const filas = inventario as { seccion: string; fila_asiento?: string | null; estado?: string; id_registraCompra?: number | null }[];
  const usado = filas.find(f => f.estado && f.estado !== 'Disponible');
  if (usado) {
    const motivo = usado.estado === 'Anulado' ? 'fue anulado' : 'ya fue vendido';
    return { ok: false, mensaje: `Este código ${motivo}${usado.id_registraCompra ? ` (compra #${usado.id_registraCompra})` : ''}.` };
  }
  if (filas.length === 1) {
    return { ok: true, seccion: filas[0].seccion, filaAsiento: filas[0].fila_asiento || null };
  }
  if (filas.length > 1) {
    return { ok: true, seccion: null, filaAsiento: null, aviso: `Existe en ${filas.length} secciones del inventario -- no se descontará.` };
  }
  return { ok: true, seccion: null, filaAsiento: null, aviso: 'No está en el inventario de boletos físicos.' };
};
