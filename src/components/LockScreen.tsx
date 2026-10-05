import { useEffect, useRef, useState } from 'react';
import { IonButton, IonIcon, IonSpinner, IonToast } from '@ionic/react';
import { fingerPrintOutline, lockClosedOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import marcaTickets from '../images/MARCA_TICKETS.png';
import { obtenerCredencialesBiometricas } from '../utils/biometricAuth';
import { loginStaff, obtenerStaffData, puedeVender } from '../utils/staffAuth';
import { cerrarSesionLocal } from '../utils/bloqueoSesion';
import { useAppLock } from '../context/AppLockContext';
import './LockScreen.css';

/* Mismo bloqueo que app_tickets, con una diferencia: el JWT de personal dura
   solo 1 h, así que al desbloquear con huella se vuelve a hacer login con las
   credenciales guardadas para renovar el token. Por eso también aparece
   (renovando=true) cuando el token vence o está por vencer, aunque el
   usuario haya elegido "Nunca": es la única forma de renovarlo sin pedirle
   la contraseña. */
const LockScreen: React.FC = () => {
  const { locked, renovando, unlock, sesionExpirada, confirmarExpiracion } = useAppLock();
  const navigate = useNavigate();
  const location = useLocation();
  const [verificando, setVerificando] = useState(false);
  const intentadoAuto = useRef(false);
  const [aviso, setAviso] = useState('');

  const irAlLogin = (mensaje = '') => {
    cerrarSesionLocal();
    unlock();
    navigate('/home', { replace: true });
    if (mensaje) setAviso(mensaje);
  };

  const intentarHuella = async () => {
    setVerificando(true);
    try {
      const creds = await obtenerCredencialesBiometricas();
      if (!creds) return;
      const r = await loginStaff(creds.usuario, creds.contrasena);
      if (r.success && r.data && puedeVender(r.data.perfil)) {
        unlock();
        /* Si el token ya se había caído, las pantallas mandaron al login
           por debajo del bloqueo: se vuelve al panel. */
        if (location.pathname.startsWith('/home')) navigate('/dashboard/vender', { replace: true });
      } else if (r.sinConexion) {
        /* Sin conexión: si el token aún sirve, la huella ya confirmó
           identidad; si no, se queda bloqueado para reintentar. */
        if (!renovando && obtenerStaffData()) unlock();
        else setAviso('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
      } else {
        /* El servidor rechazó las credenciales guardadas (contraseña
           cambiada o cuenta sin permiso): hay que entrar a mano. */
        irAlLogin('No se pudo renovar tu sesión. Inicia sesión con tu usuario y contraseña.');
      }
    } finally {
      setVerificando(false);
    }
  };

  useEffect(() => {
    if (locked && !intentadoAuto.current) {
      intentadoAuto.current = true;
      /* Pequeña espera: al volver de segundo plano o en arranque en frío el
         sensor a veces aún no está listo y el primer intento falla solo. */
      const t = setTimeout(intentarHuella, 400);
      return () => clearTimeout(t);
    }
    if (!locked) intentadoAuto.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  /* Teléfonos sin huella: pasó el tiempo elegido y se cerró la sesión. */
  useEffect(() => {
    if (!sesionExpirada) return;
    confirmarExpiracion();
    irAlLogin('Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionExpirada]);

  const toast = (
    <IonToast
      isOpen={!!aviso}
      message={aviso}
      duration={3000}
      position="top"
      onDidDismiss={() => setAviso('')}
    />
  );

  if (!locked) return toast;

  return (
    <div className="lock-screen">
      <img src={marcaTickets} alt="T-ickets" className="lock-logo" />
      <div className="lock-card">
        <IonIcon icon={lockClosedOutline} className="lock-icon" />
        <h2 className="lock-title">{renovando ? 'Tu sesión venció' : 'Sesión bloqueada'}</h2>
        <p className="lock-sub">{renovando ? 'Confirma con tu huella para seguir trabajando' : 'Usa tu huella para continuar'}</p>

        <IonButton expand="block" className="lock-btn-huella" onClick={intentarHuella} disabled={verificando}>
          {verificando
            ? <><IonSpinner name="crescent" className="btn-spinner" /> Verificando…</>
            : <><IonIcon icon={fingerPrintOutline} slot="start" /> Ingresar con huella</>
          }
        </IonButton>

        {/* Cierra la sesión (no solo oculta el bloqueo) para que el botón
            atrás no devuelva al contenido. La huella queda guardada. */}
        <IonButton expand="block" fill="clear" className="lock-btn-clave" onClick={() => irAlLogin()}>
          Usar usuario y contraseña
        </IonButton>
      </div>
      {toast}
    </div>
  );
};

export default LockScreen;
