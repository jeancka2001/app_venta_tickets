import axios from 'axios';

/* "Escanear boleto" -- consulta el endpoint de flasapi_speed_comnet que ya
   usa la app de canje de la puerta (Boleteria/info-boleto/:codigo), pensado
   para digital Y físico: el código escaneado siempre termina siendo el
   id_registra_compra de la fila en localidades_items (para un boleto físico
   ya asignado, ese valor es el código de barras impreso -- ver
   AsignarBoletoFisico en MS-LOGIN-BOLETERIA/BoletosFisicos.controller.js).
   Si no hay ningún asiento con ese código, el backend prueba como boleto
   físico sin asignar (recién importado, "Disponible") o Anulado. No exige
   autenticación (mismo criterio que el resto de rutas "Boleteria/*" que ya
   usa esta app para OCR y comprobantes). */
const URL_MIKROTI = 'https://api.t-ickets.com/mikroti';

export interface InfoBoletoAsiento {
  id_item: number;
  id_localidades: number;
  silla: string | null;
  mesa: string | null;
  fila: string | null;
  sillas: string | null;
  boleto_numero: number | null;
  boleto_total: number | null;
  estado: string;
  cedula: string | null;
  fecha_ocupado: string | null;
  id_registraCompra: number | null;
  id_registra_compra: string | null;
  espacio: string | null;
  typo: string | null;
  pasado: string | null;
  localidad_nombre: string | null;
  localidad_descripcion: string | null;
  localidad_espacio: string | null;
  nombreCompleto: string | null;
  email: string | null;
  movil: string | null;
  ciudad: string | null;
  direccion: string | null;
  forma_pago: string | null;
  estado_pago: string | null;
  fecha_compra: string | null;
  total: string | null;
  cedula_compra: string | null;
  nombreConcierto: string | null;
}

export interface InfoBoletoFisico {
  codigoEvento: string;
  seccion: string;
  codigo_barras: string;
  fila_asiento: string | null;
  estado: string;
  id_registraCompra: number | null;
  fecha_venta: string | null;
  forma_pago: string | null;
  estado_pago: string | null;
  fecha_compra: string | null;
  total: string | null;
  cedula_compra: string | null;
  nombreCompleto: string | null;
  email: string | null;
  movil: string | null;
  ciudad: string | null;
  direccion: string | null;
}

export type ResultadoInfoBoleto =
  | { ok: true; tipo: 'asiento'; data: InfoBoletoAsiento }
  | { ok: true; tipo: 'fisico'; data: InfoBoletoFisico }
  | { ok: false; mensaje: string };

export const obtenerInfoBoleto = async (codigo: string): Promise<ResultadoInfoBoleto> => {
  try {
    const { data } = await axios.get(
      `${URL_MIKROTI}/Boleteria/info-boleto/${encodeURIComponent(codigo)}`
    );
    if (data?.estado && data?.data) {
      return { ok: true, tipo: data.tipo === 'fisico' ? 'fisico' : 'asiento', data: data.data };
    }
    return { ok: false, mensaje: data?.mensaje || 'Boleto no encontrado.' };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return { ok: false, mensaje: 'No se encontró ningún boleto con ese código.' };
    }
    return { ok: false, mensaje: 'Error de conexión al buscar el boleto.' };
  }
};
