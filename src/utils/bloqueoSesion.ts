import { biometriaActivaLocalmente } from './biometricAuth';
import { logoutStaff, obtenerStaffData, sesionStaffPorRenovar } from './staffAuth';

/* ── Bloqueo / cierre de sesión por tiempo sin uso ──
   Cada usuario elige cuánto tiempo puede estar la app cerrada o sin tocarse
   antes de volver a pedir acceso:
   - "huella": teléfonos donde se guardó el login con huella → se bloquea y
     se desbloquea con la huella (la sesión sigue viva).
   - "sesion": teléfonos sin huella (o sin login guardado) → se cierra la
     sesión y se vuelve a entrar con usuario y contraseña.
   Todo es síncrono (localStorage) para poder decidir en el primer render y
   en la transición a segundo plano, que es demasiado corta para esperar al
   puente nativo. */

export type ModoBloqueo = 'huella' | 'sesion';

export interface ConfigBloqueo {
  modo: ModoBloqueo;
  /** null = nunca: no pide nada hasta cerrar sesión desde la app.
      (0 = al salir de la app: solo lo usan sesiones antiguas sin config.) */
  minutos: number | null;
}

export interface OpcionBloqueo {
  minutos: number | null;
  etiqueta: string;
}

export const OPCIONES_BLOQUEO: Record<ModoBloqueo, OpcionBloqueo[]> = {
  huella: [
    { minutos: 2, etiqueta: '2 minutos' },
    { minutos: 5, etiqueta: '5 minutos' },
    { minutos: 15, etiqueta: '15 minutos' },
    { minutos: 30, etiqueta: '30 minutos' },
    { minutos: 60, etiqueta: '1 hora' },
    { minutos: null, etiqueta: 'Nunca (hasta cerrar sesión)' },
  ],
  sesion: [
    { minutos: 2, etiqueta: '2 minutos' },
    { minutos: 5, etiqueta: '5 minutos' },
    { minutos: 15, etiqueta: '15 minutos' },
    { minutos: 30, etiqueta: '30 minutos' },
    { minutos: 60, etiqueta: '1 hora' },
    { minutos: null, etiqueta: 'Nunca (hasta cerrar sesión)' },
  ],
};

export const MINUTOS_POR_DEFECTO: Record<ModoBloqueo, number | null> = { huella: 2, sesion: null };

export const etiquetaBloqueo = (config: ConfigBloqueo | null): string =>
  OPCIONES_BLOQUEO[config?.modo ?? 'sesion'].find(o => o.minutos === config?.minutos)?.etiqueta ?? 'Sin configurar';

/* Sesión propia de esta app (personal de venta): el JWT de staffAuth.
   obtenerStaffData() ya descarta el token si venció (dura 1 h). */
export const haySesion = (): boolean => obtenerStaffData() !== null;
export const cerrarSesionLocal = (): void => logoutStaff({ renovable: false });

/* La sesión venció (o está por vencer) y se puede renovar con la huella. */
export const sesionPorRenovar = (): boolean => sesionStaffPorRenovar();

/* Si el teléfono tiene login con huella guardado, el bloqueo es con huella;
   si no, es por cierre de sesión. La bandera solo se enciende cuando
   setCredentials funcionó, así que en teléfonos sin huella nunca es "huella". */
export const modoDelDispositivo = (): ModoBloqueo => (biometriaActivaLocalmente() ? 'huella' : 'sesion');

const KEY_CONFIG = 'configBloqueo';
const KEY_ACTIVIDAD = 'ultimaActividad';

export const leerConfigBloqueo = (): ConfigBloqueo | null => {
  try {
    const c = JSON.parse(localStorage.getItem(KEY_CONFIG) || 'null');
    if (c && (c.modo === 'huella' || c.modo === 'sesion') && (c.minutos === null || typeof c.minutos === 'number')) return c;
  } catch { /* valor corrupto: se trata como sin configurar */ }
  return null;
};

export const guardarConfigBloqueo = (config: ConfigBloqueo): void =>
  localStorage.setItem(KEY_CONFIG, JSON.stringify(config));

export const borrarConfigBloqueo = (): void => {
  localStorage.removeItem(KEY_CONFIG);
  localStorage.removeItem(KEY_ACTIVIDAD);
};

export const registrarActividad = (ts = Date.now()): void =>
  localStorage.setItem(KEY_ACTIVIDAD, String(ts));

const ultimaActividad = (): number | null => {
  const n = Number(localStorage.getItem(KEY_ACTIVIDAD));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* Config que realmente aplica. Sesiones con huella de antes de que existiera
   esta opción (sin config guardada) siguen bloqueándose al salir, como antes. */
export const configEfectiva = (): ConfigBloqueo | null =>
  leerConfigBloqueo() ?? (biometriaActivaLocalmente() ? { modo: 'huella', minutos: 0 } : null);

export type AccionBloqueo = 'nada' | 'bloquear' | 'expirar';

/* motivo:
   - 'inicio'      → la app arrancó de cero (proceso nuevo).
   - 'reanudar'    → volvió de segundo plano.
   - 'inactividad' → chequeo periódico con la app abierta; "al salir de la
                     app" (0 min) no aplica aquí, solo al cerrar/salir. */
export const evaluarBloqueo = (motivo: 'inicio' | 'reanudar' | 'inactividad'): AccionBloqueo => {
  if (!haySesion()) return 'nada';
  const config = configEfectiva();
  if (!config || config.minutos === null) return 'nada';
  if (motivo === 'inactividad' && config.minutos === 0) return 'nada';

  const ultima = ultimaActividad();
  const transcurrido = ultima === null ? Infinity : Date.now() - ultima;
  if (transcurrido < config.minutos * 60 * 1000) return 'nada';

  /* Config de huella pero ya no hay login con huella guardado en el
     teléfono: no hay forma de desbloquear, así que se cierra la sesión. */
  if (config.modo === 'huella' && biometriaActivaLocalmente()) return 'bloquear';
  return 'expirar';
};

/* Operaciones que abren otra pantalla nativa (cámara, escáner…) mandan la
   app a segundo plano sin que el usuario haya "salido". Mientras dure una,
   el regreso no cuenta como salida (sí cuenta el tiempo sin uso). */
let operacionesExternas = 0;

export const hayOperacionExterna = (): boolean => operacionesExternas > 0;

export const sinBloqueo = async <T,>(fn: () => Promise<T>): Promise<T> => {
  operacionesExternas++;
  try {
    return await fn();
  } finally {
    operacionesExternas--;
    registrarActividad();
  }
};
