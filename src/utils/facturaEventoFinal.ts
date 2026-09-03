import { jsPDF } from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import type { FacturaLocalidadItem } from './adminEventos';

/* PDF de la "Factura de Venta Final" de un evento -- misma estructura que
   descargarFacturaFinalPDF en Evetoespecifico.js (sección "DETALLE DEL
   EVENTO" + totales), armado a mano con las primitivas de jsPDF (rect/
   line/text) igual que la web, en vez de una librería de tablas. */

export interface DatosFacturaEvento {
  codigoEvento: string;
  nombreEvento: string;
  ivaPercent: number;
  filas: FacturaLocalidadItem[];
  totalBoletos: number;
  subtotal: number;
  iva: number;
  total: number;
}

const f2 = (n: number) => `$ ${(Number(n) || 0).toFixed(2)}`;

export const generarYDescargarFacturaEvento = async (
  d: DatosFacturaEvento
): Promise<{ ok: boolean; mensaje?: string }> => {
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' }); // 595 x 842 pt
    const left = 40;
    const right = 555;
    const cols = [
      { label: 'Localidad',  x: left,       w: 155 },
      { label: 'Tarifa',     x: left + 155, w: 70 },
      { label: 'P. Unit.',   x: left + 225, w: 70 },
      { label: 'Cant.',      x: left + 295, w: 55 },
      { label: 'Subtotal',   x: left + 350, w: right - (left + 350) },
    ];
    let y = 50;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Factura de Venta Final', left, y);
    y += 22;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Evento: ${d.nombreEvento}`, left, y); y += 14;
    doc.text(`Código: ${d.codigoEvento}`, left, y); y += 14;
    doc.text(`IVA aplicado a boletos: ${d.ivaPercent}%`, left, y); y += 14;
    doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, left, y); y += 20;

    const encabezadoTabla = () => {
      doc.setFillColor(44, 62, 80);
      doc.setTextColor(255, 255, 255);
      doc.rect(left, y, right - left, 20, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('DETALLE DEL EVENTO', left + 6, y + 14);
      doc.setTextColor(0, 0, 0);
      y += 28;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      cols.forEach(c => doc.text(c.label, c.x + 2, y));
      y += 5;
      doc.setDrawColor(180, 180, 180);
      doc.line(left, y, right, y);
      y += 12;
      doc.setFont('helvetica', 'normal');
    };
    encabezadoTabla();

    d.filas.forEach((f, i) => {
      if (y > 780) {
        doc.addPage();
        y = 50;
        encabezadoTabla();
      }
      if (i % 2 === 0) {
        doc.setFillColor(245, 246, 250);
        doc.rect(left, y - 9, right - left, 15, 'F');
      }
      doc.setFontSize(8.5);
      doc.text(String(f.localidad || '—'), cols[0].x + 2, y, { maxWidth: cols[0].w - 4 });
      doc.text(String(f.tarifa || '—'), cols[1].x + 2, y);
      doc.text(f2(f.precio_unitario_base), cols[2].x + 2, y);
      doc.text(String(f.cantidad), cols[3].x + 2, y);
      doc.text(f2(f.subtotal_sin_iva), cols[4].x + 2, y);
      y += 15;
    });

    y += 6;
    doc.setDrawColor(180, 180, 180);
    doc.rect(left, y - 12, right - left, d.iva > 0 ? 54 : 38);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TOTAL BOLETOS', left + 6, y);
    doc.text(String(d.totalBoletos), cols[3].x + 2, y);
    doc.text(f2(d.subtotal), cols[4].x + 2, y);
    y += 16;

    if (d.iva > 0) {
      doc.text(`IVA (${d.ivaPercent}%)`, left + 6, y);
      doc.text(f2(d.iva), cols[4].x + 2, y);
      y += 16;
    }

    doc.setFontSize(10.5);
    doc.text('TOTAL FINAL', left + 6, y);
    doc.text(f2(d.total), cols[4].x + 2, y);

    const dataUri = doc.output('datauristring');
    const base64 = dataUri.split('base64,')[1];
    const nombreArchivo = `factura_final_${d.codigoEvento}.pdf`;

    await Filesystem.writeFile({
      path: nombreArchivo,
      data: base64,
      directory: Directory.Documents,
    });

    return { ok: true };
  } catch (e) {
    console.warn('[facturaEventoFinal] no se pudo generar/descargar', e);
    return { ok: false, mensaje: 'No se pudo generar la factura. Intenta de nuevo.' };
  }
};
