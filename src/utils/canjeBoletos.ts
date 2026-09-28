import axios from 'axios';

/* Canje de entradas en puerta -- flasapi_speed_comnet (mikroti):

   1. Consulta: GET Boleteria/BoletoScan/:codigo
      El QR (digital) o el código de barras (físico ya asignado) es
      localidades_items.id_registra_compra; el servicio devuelve la fila de
      ticket_usuarios de ESE asiento (tu.id_localidades_items = li.id), con
      su estado `canje` ('CANJEADO' / 'NO CANJEADO').
      Ojo: localidades_items.pasado = 'PASADO' se marca al PAGAR, no al
      entrar -- no sirve para saber si la entrada ya fue canjeada.

   2. Canje: POST Boleteria/canjeticke2/:id_ticket  { cedula, info }
      Canjea UNA sola entrada (ticket_usuarios.id) y responde 409 si ya
      estaba canjeada, así que dos puertas escaneando la misma entrada no
      la canjean dos veces. Queda registrado en infoLog.

   NO se usa Boleteria/canjear-qr (-> ms_login canje_boleto): ese marca
   como canjeadas TODAS las entradas de la compra (WHERE id_registraCompra)
   y no avisa si ya estaban canjeadas. */
const URL_MIKROTI = 'https://api.t-ickets.com/mikroti';

export interface BoletoCanje {
  id_ticket: number | null;
  cedula: string | null;
  localidad: string | null;
  numero_entrada: string | null;
  valor: string | number | null;
  canje: string | null;
  codigoEvento: string | null;
  concierto: string | null;
  estado_boleto: string | null;
  id_item: number;
  silla: string | null;
  fila: string | null;
  correlativo: number | null;
  estado_asiento: string | null;
  id_registra_compra: string;
  nombre_localidad: string | null;
  /* Completados con Boleteria/info-boleto (BoletoScan no los trae):
     la orden de compra y el nombre del comprador. */
  id_registraCompra?: number | null;
  nombreCompleto?: string | null;
}

export type ResultadoConsultaCanje =
  | { ok: true; boleto: BoletoCanje }
  | { ok: false; mensaje: string };

export const consultarBoletoCanje = async (codigo: string): Promise<ResultadoConsultaCanje> => {
  const cod = encodeURIComponent(codigo);
  try {
    const [{ data }, info] = await Promise.all([
      axios.get(`${URL_MIKROTI}/Boleteria/BoletoScan/${cod}`),
      // Solo para la orden de compra: si falla, la entrada se puede canjear igual.
      axios.get(`${URL_MIKROTI}/Boleteria/info-boleto/${cod}`).then((r) => r.data).catch(() => null),
    ]);
    if (data?.estado && data?.boleto) {
      const extra = info?.estado && info?.tipo === 'asiento' ? info.data : null;
      return {
        ok: true,
        boleto: {
          ...data.boleto,
          id_registraCompra: extra?.id_registraCompra ?? null,
          nombreCompleto: extra?.nombreCompleto ?? null,
        },
      };
    }
    return { ok: false, mensaje: data?.mensaje || 'No se encontró ninguna entrada con ese código.' };
  } catch {
    return { ok: false, mensaje: 'Error de conexión al consultar la entrada.' };
  }
};

export const estaCanjeado = (b: BoletoCanje) => String(b.canje || '').trim().toUpperCase() === 'CANJEADO';

export type ResultadoCanje = { ok: true } | { ok: false; yaCanjeado: boolean; mensaje: string };

export const canjearEntrada = async (
  idTicket: number,
  cedula: string,
  info: Record<string, unknown>,
): Promise<ResultadoCanje> => {
  try {
    const { data } = await axios.post(`${URL_MIKROTI}/Boleteria/canjeticke2/${idTicket}`, { cedula, info });
    if (data?.estado) return { ok: true };
    return { ok: false, yaCanjeado: false, mensaje: data?.mensaje || 'No se pudo canjear.' };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      return { ok: false, yaCanjeado: true, mensaje: 'Ya fue canjeada.' };
    }
    return { ok: false, yaCanjeado: false, mensaje: 'Error de conexión al canjear.' };
  }
};

/* Descanje de UNA entrada: POST Boleteria/descanjeticke/:id_ticket
   (flasapi_speed_comnet, Descanjear_ticket). Vuelve la entrada a
   'NO CANJEADO' solo si estaba canjeada (si no, 409) y queda en infoLog
   con el operador y el motivo. */
export const descanjearEntrada = async (
  idTicket: number,
  cedula: string,
  motivo: string,
  info: Record<string, unknown>,
): Promise<ResultadoCanje> => {
  try {
    const { data } = await axios.post(`${URL_MIKROTI}/Boleteria/descanjeticke/${idTicket}`, { cedula, motivo, info });
    if (data?.estado) return { ok: true };
    return { ok: false, yaCanjeado: false, mensaje: data?.mensaje || 'No se pudo descanjear.' };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      return { ok: false, yaCanjeado: false, mensaje: 'No estaba canjeada.' };
    }
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return { ok: false, yaCanjeado: false, mensaje: 'Servicio de descanje no disponible (falta desplegar el backend).' };
    }
    return { ok: false, yaCanjeado: false, mensaje: 'Error de conexión al descanjear.' };
  }
};
