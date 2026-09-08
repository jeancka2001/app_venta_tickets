import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/* Escaneo de código de barras/QR con la cámara del celular, para el flujo
   de "boleto físico" (Pago.tsx y DetalleCompra.tsx). Usa el método `scan()`
   del plugin -- la interfaz de escaneo lista para usar de Google (pantalla
   completa nativa de Android/Google Play Services), sin tener que armar UI
   de cámara propia ni pedir permiso de cámara a mano en la mayoría de
   dispositivos. Se complementa (no reemplaza) al lector de código de
   barras por teclado y al tecleo manual, que ya funcionan sin esto. */

export interface ResultadoEscaneo {
  ok: boolean;
  codigo?: string;
  mensaje?: string;
}

export const escanearBoletoFisico = async (): Promise<ResultadoEscaneo> => {
  try {
    // En Android, `scan()` requiere el modulo de Google Barcode Scanner
    // (se instala solo, bajo demanda, la primera vez que hace falta).
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
      return { ok: false, mensaje: 'Preparando el escáner por primera vez, intenta de nuevo en unos segundos.' };
    }

    const { camera } = await BarcodeScanner.checkPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      const solicitado = await BarcodeScanner.requestPermissions();
      if (solicitado.camera !== 'granted' && solicitado.camera !== 'limited') {
        return { ok: false, mensaje: 'Se necesita permiso de cámara para escanear.' };
      }
    }

    const { barcodes } = await BarcodeScanner.scan();
    const valor = barcodes[0]?.displayValue || barcodes[0]?.rawValue;
    if (!valor) return { ok: false, mensaje: 'No se detectó ningún código.' };
    return { ok: true, codigo: valor };
  } catch {
    return { ok: false, mensaje: 'No se pudo abrir la cámara.' };
  }
};
