/* Arma el HTML del correo masivo a partir de las partes del editor (imagen, título, cuerpo, botón, pie): es la MISMA plantilla de la web
   (TicketsWeb, Pages/CorreosMasivos/plantilla.js). Estilos en línea y tablas: es lo que soportan Gmail, Outlook y los celulares. */

export interface PartesCorreo {
  imagen: string;
  imagenLink: string;
  titulo: string;
  colorTitulo: string;
  /* Texto del cuerpo: línea en blanco = párrafo nuevo; **así** = negrita; {{nombre}} = nombre del cliente */
  cuerpo: string;
  botonActivo: boolean;
  botonTexto: string;
  botonLink: string;
  botonColor: string;
  botonTextoColor: string;
  pie: string;
  fondo: string;
}

export const PARTES_INICIALES: PartesCorreo = {
  imagen: '',
  imagenLink: '',
  titulo: '',
  colorTitulo: '#1f2d4d',
  cuerpo: 'Hola {{nombre}} 👋\n\nEscribe aquí tu mensaje…',
  botonActivo: false,
  botonTexto: 'Comprar entradas',
  botonLink: '',
  botonColor: '#1f2d4d',
  botonTextoColor: '#ffffff',
  pie: 'Recibiste este correo por ser parte de la comunidad de Tickets.com.ec.',
  fondo: '#f2f4f7',
};

export const escapar = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

/* Solo http(s) (y mailto en el botón): nada de javascript: */
export const urlSegura = (u: unknown): string => {
  const t = String(u ?? '').trim();
  return /^(https?:\/\/|mailto:)/i.test(t) ? t : '';
};

const colorSeguro = (c: unknown, porDefecto: string): string => (/^#[0-9a-f]{3,8}$/i.test(String(c ?? '').trim()) ? String(c).trim() : porDefecto);

/* Texto simple -> HTML del cuerpo: párrafos, saltos de línea y **negrita** (todo escapado) */
export const cuerpoAHtml = (texto: string): string =>
  String(texto ?? '')
    .trim()
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 14px;">${escapar(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`)
    .join('');

export function construirCorreo(parcial: Partial<PartesCorreo>): string {
  const a = { ...PARTES_INICIALES, ...parcial };
  const imagen = urlSegura(a.imagen);
  const imagenLink = urlSegura(a.imagenLink);
  const img = imagen ? `<img src="${escapar(imagen)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;">` : '';
  const imgBloque = img ? `<tr><td style="padding:0;">${imagenLink ? `<a href="${escapar(imagenLink)}" target="_blank">${img}</a>` : img}</td></tr>` : '';
  const titulo = String(a.titulo || '').trim()
    ? `<h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;color:${colorSeguro(a.colorTitulo, '#1f2d4d')};text-align:center;">${escapar(a.titulo)}</h1>`
    : '';
  const boton = a.botonActivo && urlSegura(a.botonLink) && String(a.botonTexto || '').trim()
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 8px;"><tr><td align="center" bgcolor="${colorSeguro(a.botonColor, '#1f2d4d')}" style="border-radius:8px;">`
      + `<a href="${escapar(urlSegura(a.botonLink))}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:${colorSeguro(a.botonTextoColor, '#ffffff')};text-decoration:none;">${escapar(a.botonTexto)}</a>`
      + '</td></tr></table>'
    : '';
  const pie = String(a.pie || '').trim()
    ? `<p style="margin:28px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#888888;text-align:center;">${escapar(a.pie)}</p>`
    : '';
  return `<div style="margin:0;padding:24px 12px;background:${colorSeguro(a.fondo, '#f2f4f7')};">`
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;">'
    + imgBloque
    + '<tr><td style="padding:28px 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#333333;">'
    + titulo + `<div>${cuerpoAHtml(a.cuerpo)}</div>` + boton + pie
    + '</td></tr></table></div>';
}
