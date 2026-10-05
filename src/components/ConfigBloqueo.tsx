import { useRef } from 'react';
import { IonAlert } from '@ionic/react';
import { useLocation } from 'react-router-dom';
import { useAppLock } from '../context/AppLockContext';
import { MINUTOS_POR_DEFECTO, OPCIONES_BLOQUEO } from '../utils/bloqueoSesion';

/* Las opciones de radio de IonAlert son strings; null (nunca) viaja así. */
const NUNCA = 'nunca';
const aValor = (m: number | null) => (m === null ? NUNCA : String(m));
const deValor = (v: string) => (v === NUNCA ? null : Number(v));

/* En el login no tiene sentido preguntar. */
const RUTAS_SIN_CUADRO = ['/home'];

/* Cuadro para elegir cuándo se bloquea la app (con huella) o cuándo se
   cierra la sesión (teléfonos sin huella). Aparece solo tras el primer login
   del dispositivo y se puede volver a abrir desde Perfil. */
const ConfigBloqueo: React.FC = () => {
  const { configPendiente, modo, config, guardarConfig, cerrarConfig } = useAppLock();
  const location = useLocation();
  const elegido = useRef(false);

  const oculto = RUTAS_SIN_CUADRO.some(r => location.pathname.startsWith(r));
  const actual = config?.modo === modo ? config.minutos : MINUTOS_POR_DEFECTO[modo];
  const esHuella = modo === 'huella';

  return (
    <IonAlert
      isOpen={configPendiente && !oculto}
      backdropDismiss={false}
      header={esHuella ? 'Bloqueo con huella' : 'Cierre de sesión automático'}
      message={esHuella
        ? '¿Después de cuánto tiempo con la app cerrada o sin usar quieres que se pida tu huella?'
        : '¿Después de cuánto tiempo con la app cerrada o sin usar quieres que se cierre tu sesión? Luego ingresarás con tu usuario y contraseña.'}
      inputs={OPCIONES_BLOQUEO[modo].map(o => ({
        type: 'radio' as const,
        label: o.etiqueta,
        value: aValor(o.minutos),
        checked: o.minutos === actual,
      }))}
      buttons={[{ text: 'Guardar', handler: (v: string | undefined) => {
        elegido.current = true;
        guardarConfig(deValor(v ?? aValor(actual)));
      } }]}
      onDidDismiss={() => {
        /* Cerrado sin elegir (botón atrás): se queda con el valor marcado. */
        if (elegido.current) elegido.current = false;
        else if (!config || config.modo !== modo) guardarConfig(actual);
        else cerrarConfig();
      }}
    />
  );
};

export default ConfigBloqueo;
