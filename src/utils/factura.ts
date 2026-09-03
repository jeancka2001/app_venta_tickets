import { jsPDF } from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';

/* Copiado de app_tickets/src/utils/factura.ts -- mismo formato y misma
   fuente de datos que el botón de la impresora en el detalle de la orden
   en la web (VenderTiket.js/Aprobar/Detalleregistro.js -> generaComprobante).
   Se guarda directo en el almacenamiento del teléfono (no abre la hoja de
   compartir). */

export interface LocalidadFactura {
  nombre: string;
  cantidad: string | number;
}

export interface InfoTarjetaFactura {
  cardholder: string;
  transmitter: string;
  displayNumber: string;
  paymentDate: string;
}

export interface DatosFactura {
  id: number;
  nombreConcierto: string;
  localidades: LocalidadFactura[];
  formaPago: string;
  total: number;
  cliente: string;
  correo: string;
  cedula: string;
  fechaRegistro: string;
  /** numerTransacion — solo aplica y se muestra cuando formaPago === 'Deposito' */
  numeroComprobante?: string;
  /** solo aplica y se muestra cuando formaPago === 'Tarjeta' */
  infoTarjeta?: InfoTarjetaFactura;
}

/* Datos fijos de la empresa — no cambian por orden. */
const EMPRESA = {
  nombre: 'T-ICKETS (TICKETSECUADOR S.A.)',
  ruc: '0993377293001',
  direccion: 'Edificio City Office Oficina 310',
};

const ANCHO = 240;
const MARGEN = 14;
const CENTRO = ANCHO / 2;

const dosDigitos = (n: number) => String(n).padStart(2, '0');
const fechaImpresion = (): string => {
  const d = new Date();
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}, ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;
};

export const generarYDescargarFactura = async (
  d: DatosFactura
): Promise<{ ok: boolean; mensaje?: string }> => {
  try {
    const doc = new jsPDF({ unit: 'pt', format: [ANCHO, 680] });
    doc.setFont('courier', 'normal');
    doc.setTextColor(0, 0, 0);

    let y = 24;
    const centrado = (texto: string, negrita = false, tam = 9) => {
      doc.setFont('courier', negrita ? 'bold' : 'normal');
      doc.setFontSize(tam);
      doc.text(texto, CENTRO, y, { align: 'center' });
      y += tam + 5;
    };
    const separador = () => { centrado('*'.repeat(34), false, 8); };
    const izquierda = (texto: string, negrita = false, tam = 9) => {
      doc.setFont('courier', negrita ? 'bold' : 'normal');
      doc.setFontSize(tam);
      doc.text(texto, MARGEN, y);
      y += tam + 5;
    };
    const filaDosLados = (izq: string, der: string, tam = 9) => {
      doc.setFont('courier', 'normal');
      doc.setFontSize(tam);
      doc.text(izq, MARGEN, y);
      doc.text(der, ANCHO - MARGEN, y, { align: 'right' });
      y += tam + 5;
    };
    const salto = (n = 1) => { y += (9 + 5) * n; };

    centrado(EMPRESA.nombre, true, 10);
    y += 4;
    centrado(`RUC ${EMPRESA.ruc}`);
    centrado(EMPRESA.direccion);
    centrado(`Fecha:${fechaImpresion()}`);
    separador();
    centrado('DESCRIPCIÓN', true);
    separador();

    salto();
    izquierda(`Evento: ${d.nombreConcierto}`);
    (d.localidades.length ? d.localidades : [{ nombre: '—', cantidad: '' }]).forEach((loc) => {
      salto();
      filaDosLados(`Localidad:${loc.nombre || '—'}`, `Cantidad:${loc.cantidad}`);
    });

    salto(2);
    centrado(`TOTAL: ${d.total.toFixed(2)}`, false, 10);
    centrado('SALDO: $0.00', false, 10);

    salto();
    izquierda('CLIENTE', true);
    izquierda(`Nombres: ${(d.cliente || '—').toUpperCase()}`);
    izquierda(`Correo: ${d.correo || '—'}`);
    izquierda(`Cédula: ${d.cedula || '—'}`);

    salto();
    izquierda(`Fecha registro: ${d.fechaRegistro || '—'}`);

    salto();
    centrado(`Impresión:${fechaImpresion()}`);
    separador();

    if (d.formaPago === 'Tarjeta' && d.infoTarjeta) {
      izquierda('Información de tarjeta');
      izquierda(`Forma de pago: ${d.formaPago}`);
      izquierda(d.infoTarjeta.cardholder || '—');
      izquierda(d.infoTarjeta.transmitter || '—');
      izquierda(d.infoTarjeta.displayNumber || '—');
      izquierda(`Fecha pago: ${d.infoTarjeta.paymentDate || '—'}`);
      separador();
    } else if (d.formaPago === 'Deposito') {
      salto();
      centrado(`Número de comprobante ${d.numeroComprobante || '—'}`);
      salto();
      centrado(`Forma de pago: ${d.formaPago}`);
      separador();
    } else {
      salto();
      centrado(`Forma de pago: ${d.formaPago || '—'}`);
      separador();
    }

    salto();
    izquierda('Recibí conforme:');
    salto(2);
    izquierda('_______________________');

    const dataUri = doc.output('datauristring');
    const base64 = dataUri.split('base64,')[1];
    const nombreArchivo = `comprobante_tickets_${d.id}.pdf`;

    await Filesystem.writeFile({
      path: nombreArchivo,
      data: base64,
      directory: Directory.Documents,
    });

    return { ok: true };
  } catch (e) {
    console.warn('[factura] no se pudo generar/descargar', e);
    return { ok: false, mensaje: 'No se pudo generar el comprobante. Intenta de nuevo.' };
  }
};
