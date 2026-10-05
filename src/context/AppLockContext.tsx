import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import {
  AccionBloqueo, ConfigBloqueo, ModoBloqueo,
  cerrarSesionLocal, configEfectiva, evaluarBloqueo, guardarConfigBloqueo,
  haySesion, hayOperacionExterna, leerConfigBloqueo, modoDelDispositivo, registrarActividad,
  sesionPorRenovar,
} from '../utils/bloqueoSesion';

interface AppLockCtx {
  locked: boolean;
  /** El bloqueo es para renovar una sesión vencida (no por tiempo sin uso). */
  renovando: boolean;
  unlock: () => void;
  /** La sesión se cerró por tiempo sin uso (teléfonos sin huella). */
  sesionExpirada: boolean;
  confirmarExpiracion: () => void;
  /** Llamar al terminar un login exitoso. */
  sesionIniciada: () => void;
  modo: ModoBloqueo;
  config: ConfigBloqueo | null;
  guardarConfig: (minutos: number | null) => void;
  /** Hay que mostrar el cuadro de configuración (primera vez o pedido desde Perfil). */
  configPendiente: boolean;
  abrirConfig: () => void;
  cerrarConfig: () => void;
}

const AppLockContext = createContext<AppLockCtx>({} as AppLockCtx);

/* Cada cuánto se revisa el tiempo sin uso con la app abierta, y cada cuánto
   como máximo se persiste un toque (no hace falta escribir en cada uno). */
const INTERVALO_CHEQUEO_MS = 15 * 1000;
const INTERVALO_GUARDAR_ACTIVIDAD_MS = 5 * 1000;

/* Bloqueo estilo banco según el tiempo que eligió el usuario (ver
   bloqueoSesion.ts): con huella se bloquea la pantalla, sin huella se cierra
   la sesión. */
export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /* Decisión síncrona en el primer render: si el proceso arranca de cero y
     ya pasó el tiempo, se bloquea (o se cierra la sesión) antes de que las
     rutas lleguen a mostrar contenido. */
  const [accionInicial] = useState<AccionBloqueo | 'renovar'>(() => {
    if (sesionPorRenovar()) return 'renovar';
    const accion = evaluarBloqueo('inicio');
    if (accion === 'expirar') cerrarSesionLocal();
    return accion;
  });
  const [locked, setLocked] = useState(accionInicial === 'bloquear' || accionInicial === 'renovar');
  const [renovando, setRenovando] = useState(accionInicial === 'renovar');
  const [sesionExpirada, setSesionExpirada] = useState(false);
  const [config, setConfig] = useState<ConfigBloqueo | null>(leerConfigBloqueo);
  const [modo, setModo] = useState<ModoBloqueo>(modoDelDispositivo);
  const [configManual, setConfigManual] = useState(false);

  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  /* null = la app no pasó por segundo plano. Distinguir esto importa: el
     prompt de huella del plugin es otra Activity transparente, dispara
     "resume" sin un "pause" previo y no debe contar como salida. */
  const pausa = useRef<'normal' | 'externa' | null>(null);
  const ultimoGuardado = useRef(0);

  /* Vale en cualquier opción de tiempo (incluida "Nunca"): la sesión del
     servidor venció y solo la huella puede renovarla sin pedir contraseña. */
  const revisarRenovacion = useCallback((): boolean => {
    if (lockedRef.current || !sesionPorRenovar()) return false;
    setRenovando(true);
    setLocked(true);
    return true;
  }, []);

  const aplicar = useCallback((accion: AccionBloqueo) => {
    if (accion === 'bloquear') setLocked(true);
    if (accion === 'expirar') {
      cerrarSesionLocal();
      setSesionExpirada(true);
    }
  }, []);

  useEffect(() => {
    const marcar = () => {
      if (lockedRef.current || !haySesion()) return;
      const ahora = Date.now();
      if (ahora - ultimoGuardado.current < INTERVALO_GUARDAR_ACTIVIDAD_MS) return;
      ultimoGuardado.current = ahora;
      registrarActividad(ahora);
    };
    document.addEventListener('pointerdown', marcar, { capture: true, passive: true });
    document.addEventListener('keydown', marcar, { capture: true, passive: true });

    const intervalo = setInterval(() => {
      if (lockedRef.current || hayOperacionExterna()) return;
      if (!revisarRenovacion()) aplicar(evaluarBloqueo('inactividad'));
    }, INTERVALO_CHEQUEO_MS);

    const subPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        if (lockedRef.current || !haySesion()) return;
        if (hayOperacionExterna()) { pausa.current = 'externa'; return; }
        pausa.current = 'normal';
        registrarActividad();
        /* "Al salir de la app": se bloquea ya, no al volver, para que la
           vista previa de apps recientes muestre la pantalla de bloqueo y
           no el contenido. */
        const c = configEfectiva();
        if (c?.modo === 'huella' && c.minutos === 0) aplicar(evaluarBloqueo('reanudar'));
        return;
      }
      const tipo = pausa.current;
      pausa.current = null;
      if (lockedRef.current || revisarRenovacion() || !tipo) return;
      if (tipo === 'externa') {
        /* Volvió de la cámara/escáner: solo cuenta si se pasó del tiempo sin uso. */
        const accion = evaluarBloqueo('inactividad');
        if (accion === 'nada') registrarActividad(); else aplicar(accion);
        return;
      }
      aplicar(evaluarBloqueo('reanudar'));
    });

    return () => {
      document.removeEventListener('pointerdown', marcar, { capture: true });
      document.removeEventListener('keydown', marcar, { capture: true });
      clearInterval(intervalo);
      subPromise.then(h => h.remove());
    };
  }, [aplicar, revisarRenovacion]);

  const unlock = useCallback(() => {
    registrarActividad();
    setLocked(false);
    setRenovando(false);
  }, []);

  const sesionIniciada = useCallback(() => {
    registrarActividad();
    setLocked(false);
    setRenovando(false);
    setSesionExpirada(false);
    setModo(modoDelDispositivo());
    setConfig(leerConfigBloqueo());
  }, []);

  const guardarConfig = useCallback((minutos: number | null) => {
    const nueva: ConfigBloqueo = { modo: modoDelDispositivo(), minutos };
    guardarConfigBloqueo(nueva);
    registrarActividad();
    setConfig(nueva);
    setModo(nueva.modo);
    setConfigManual(false);
  }, []);

  /* Primera vez (o cambió el tipo de teléfono/login: p.ej. activó la huella)
     → se pide elegir. Nunca con la app bloqueada o sin sesión. */
  const configPendiente = !locked && haySesion() && (configManual || !config || config.modo !== modo);

  return (
    <AppLockContext.Provider value={{
      locked, renovando, unlock,
      sesionExpirada, confirmarExpiracion: () => setSesionExpirada(false),
      sesionIniciada,
      modo, config, guardarConfig,
      configPendiente,
      abrirConfig: () => setConfigManual(true),
      cerrarConfig: () => setConfigManual(false),
    }}>
      {children}
    </AppLockContext.Provider>
  );
};

export const useAppLock = () => useContext(AppLockContext);
