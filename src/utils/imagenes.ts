/* Elegir una foto o un PDF del teléfono y dejarlo listo para mandar al servidor (base64). Las fotos se reducen para que no pesen
   (el servidor acepta hasta 4 MB por archivo). */

export interface ArchivoBase64 { nombre: string; datos: string; tipo: string }

const MAX_PDF_BYTES = 3.5 * 1024 * 1024;

const leerComoDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(file);
  });

const cargarImagen = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
    img.src = src;
  });

/* Foto -> JPEG de máximo `lado` px (por defecto 1600) con calidad 0.82; PDF -> tal cual si pesa menos de 3.5 MB */
export async function archivoABase64(file: File, lado = 1600, calidad = 0.82): Promise<ArchivoBase64> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('El PDF pesa demasiado (máximo 3.5 MB).');
    const url = await leerComoDataUrl(file);
    return { nombre: file.name, datos: url.split(',')[1] || '', tipo: file.type };
  }
  if (!file.type.startsWith('image/')) throw new Error('Elige una foto o un PDF.');
  const original = await leerComoDataUrl(file);
  const img = await cargarImagen(original);
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * escala));
  canvas.height = Math.max(1, Math.round(img.height * escala));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL('image/jpeg', calidad);
  const nombre = (file.name || 'comprobante').replace(/\.[A-Za-z0-9]{1,5}$/, '') + '.jpg';
  return { nombre, datos: jpeg.split(',')[1] || '', tipo: 'image/jpeg' };
}
