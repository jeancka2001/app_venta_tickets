import { NativeBiometric, AccessControl } from '@capgo/capacitor-native-biometric';

/* Copiado de app_tickets/src/utils/biometricAuth.ts (ya probado y corregido
   en dispositivos reales) -- mismo mecanismo, solo cambia el "server" para
   que las credenciales de staff queden aisladas de las de cliente (aunque
   cada app ya tiene su propio Keystore por ser paquetes Android distintos,
   usar un nombre propio deja más claro qué guarda cada una). */
const SERVER = 'ec.ticketsEC.ventas';

/* Bandera NO sensible (no es la contraseña, solo un "sí/no") en localStorage.
   Sirve para saber sincrónicamente, sin llamar al plugin nativo, si hay que
   bloquear la app al pasar a segundo plano/reanudar. */
const FLAG_BIOMETRIA_ACTIVA = 'biometriaActiva';

export const biometriaActivaLocalmente = (): boolean =>
  localStorage.getItem(FLAG_BIOMETRIA_ACTIVA) === '1';

/* Si este dispositivo ya demostró (con reintento incluido, ver más abajo)
   que no puede cifrar/guardar credenciales por huella -- bug de Keystore
   propio del fabricante -- se deja de insistir en cada login para no
   repetir el mismo aviso una y otra vez. El login normal (usuario y
   contraseña) nunca depende de esto ni se ve afectado. */
const FLAG_GUARDADO_NO_SOPORTADO = 'biometriaGuardadoNoSoportado';

export const guardadoBiometricoNoSoportado = (): boolean =>
  localStorage.getItem(FLAG_GUARDADO_NO_SOPORTADO) === '1';

export const biometriaDisponible = async (): Promise<boolean> => {
  try {
    const r = await NativeBiometric.isAvailable({ useFallback: false });
    console.log('[biometria] isAvailable →', r);
    return r.isAvailable;
  } catch (e) {
    console.warn('[biometria] isAvailable falló', e);
    return false;
  }
};

export const hayCredencialesGuardadas = async (): Promise<boolean> => {
  try {
    const r = await NativeBiometric.isCredentialsSaved({ server: SERVER });
    console.log('[biometria] isCredentialsSaved →', r);
    return r.isSaved;
  } catch (e) {
    console.warn('[biometria] isCredentialsSaved falló', e);
    return false;
  }
};

export interface ResultadoGuardadoBiometrico {
  ok: boolean;
  /** Mensaje listo para mostrarle al usuario. Vacío si no aplica mostrar nada. */
  mensaje: string;
}

/* Traduce el código de error del plugin (ver BiometricAuthError en sus
   definitions.d.ts) a un mensaje entendible. Los códigos de "el usuario
   canceló a propósito" no generan mensaje — no hay nada que avisar ahí. */
const CODIGOS_SIN_AVISO = new Set(['11', '15', '16', '17']); // APP/SYSTEM/USER cancel, USER_FALLBACK

const MENSAJES_ERROR_BIOMETRIA: Record<string, string> = {
  '0': 'No se pudo proteger tu acceso con huella en este dispositivo (posible cambio reciente en las huellas registradas del teléfono). Intenta cerrar la app por completo y vuelve a intentarlo la próxima vez que inicies sesión.',
  '1': 'Este dispositivo no tiene sensor de huella disponible.',
  '2': 'El sensor de huella quedó bloqueado por intentos fallidos. Desbloquea tu teléfono con tu PIN o patrón e inténtalo de nuevo la próxima vez.',
  '3': 'No tienes ninguna huella configurada en este dispositivo. Actívala en Ajustes para poder usarla aquí.',
  '4': 'El sensor de huella está bloqueado temporalmente por varios intentos fallidos. Espera unos segundos e inténtalo de nuevo la próxima vez que inicies sesión.',
  '10': 'No se reconoció tu huella. Inténtalo de nuevo la próxima vez que inicies sesión.',
  '14': 'Tu teléfono no tiene PIN, patrón ni contraseña configurado, así que no se puede proteger el inicio de sesión con huella.',
};

const describirErrorGuardado = (e: unknown): ResultadoGuardadoBiometrico => {
  const code = String((e as { code?: string | number })?.code ?? '');
  if (CODIGOS_SIN_AVISO.has(code)) return { ok: false, mensaje: '' };
  const mensaje = MENSAJES_ERROR_BIOMETRIA[code]
    || 'No se pudo activar el inicio de sesión con huella. Puedes intentarlo de nuevo la próxima vez que inicies sesión.';
  return { ok: false, mensaje };
};

/* authValidityDuration>0 cambia el modo de la clave del Keystore: en vez de
   atar el cifrado al instante exacto de la huella (CryptoObject "por
   operación"), la huella desbloquea la clave por esta cantidad de segundos.
   Confirmado con un dispositivo real (Infinix/Android 14): el modo "por
   operación" falla ahí con KEY_USER_NOT_AUTHENTICATED — un bug conocido del
   Keystore2 (Android 12+) al atar la operación criptográfica al CryptoObject,
   no un problema del sensor de huella. Misma ventana que app_tickets. */
const VENTANA_VALIDEZ_HUELLA_SEG = 30;

/* Guarda usuario/contraseña protegidos por huella (Android Keystore / iOS Keychain).
   No se guarda nada en localStorage: solo vive en el almacenamiento seguro del OS. */
export const guardarCredencialesBiometricas = async (
  usuario: string,
  contrasena: string,
  reintentando = false
): Promise<ResultadoGuardadoBiometrico> => {
  try {
    await NativeBiometric.setCredentials({
      username: usuario,
      password: contrasena,
      server: SERVER,
      accessControl: AccessControl.BIOMETRY_ANY,
      authValidityDuration: VENTANA_VALIDEZ_HUELLA_SEG,
      title: 'Proteger inicio de sesión',
    });
    localStorage.setItem(FLAG_BIOMETRIA_ACTIVA, '1');
    console.log('[biometria] setCredentials OK' + (reintentando ? ' (reintento)' : ''));
    return { ok: true, mensaje: '' };
  } catch (e) {
    console.warn('[biometria] setCredentials falló' + (reintentando ? ' (reintento)' : ''), e);
    if (!reintentando) {
      try { await NativeBiometric.deleteCredentials({ server: SERVER }); } catch { /* no había nada que borrar */ }
      await new Promise(resolve => setTimeout(resolve, 300));
      return guardarCredencialesBiometricas(usuario, contrasena, true);
    }
    localStorage.setItem(FLAG_GUARDADO_NO_SOPORTADO, '1');
    return describirErrorGuardado(e);
  }
};

export const eliminarCredencialesBiometricas = async (): Promise<void> => {
  localStorage.removeItem(FLAG_BIOMETRIA_ACTIVA);
  localStorage.removeItem(FLAG_GUARDADO_NO_SOPORTADO);
  try {
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch (e) {
    console.warn('[biometria] deleteCredentials falló (no había nada guardado)', e);
  }
};

/* Dispara el prompt nativo de huella y, si el usuario se autentica,
   devuelve las credenciales guardadas. null si cancela, falla o no hay nada guardado. */
export const obtenerCredencialesBiometricas = async (): Promise<{ usuario: string; contrasena: string } | null> => {
  try {
    const creds = await NativeBiometric.getSecureCredentials({
      server: SERVER,
      reason: 'Inicia sesión en T-ickets Ventas',
      title: 'Iniciar sesión',
      subtitle: 'Usa tu huella para continuar',
      negativeButtonText: 'Usar usuario y contraseña',
    });
    return { usuario: creds.username, contrasena: creds.password };
  } catch (e) {
    console.warn('[biometria] getSecureCredentials falló/cancelado', e);
    return null;
  }
};
