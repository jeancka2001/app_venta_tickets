import { useState, useEffect } from 'react';
import {
  IonContent, IonPage, IonInput, IonInputPasswordToggle,
  IonButton, IonToast, IonSpinner, IonIcon, IonCheckbox, IonAlert,
} from '@ionic/react';
import { fingerPrintOutline, logInOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { loginStaff, puedeVender } from '../utils/staffAuth';
import {
  biometriaDisponible,
  hayCredencialesGuardadas,
  guardarCredencialesBiometricas,
  obtenerCredencialesBiometricas,
  guardadoBiometricoNoSoportado,
} from '../utils/biometricAuth';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './Home.css';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [usuario, setUsuario]       = useState('');
  const [contrasena, setContrasena] = useState('');
  const [guardarSesion, setGuardarSesion] = useState(true);
  const [cargando, setCargando]     = useState(false);
  const [error, setError]           = useState('');
  const [avisoHuella, setAvisoHuella] = useState('');

  /* ── Huella digital ── (mismo mecanismo probado en app_tickets)
     Nada automático: la huella solo se pide si el vendedor toca el botón
     "Huella" o si guarda una nueva sesión al iniciar con usuario/contraseña. */
  const [biometriaLista, setBiometriaLista]   = useState(false);
  const [verificandoHuella, setVerificandoHuella] = useState(false);
  const [confirmarReemplazo, setConfirmarReemplazo] = useState<{ usuario: string; contrasena: string } | null>(null);

  const finalizarLogin = (esperarMs: number) => {
    if (esperarMs) setTimeout(() => navigate('/dashboard/vender', { replace: true }), esperarMs);
    else navigate('/dashboard/vender', { replace: true });
  };

  const loginConCredenciales = async (usuarioIn: string, contrasenaIn: string, guardar: boolean) => {
    setCargando(true);
    setError('');
    try {
      const resultado = await loginStaff(usuarioIn, contrasenaIn);
      if (!resultado.success || !resultado.data) {
        setError(resultado.message ?? 'No se pudo iniciar sesión.');
        return;
      }
      if (!puedeVender(resultado.data.perfil)) {
        setError('Esta cuenta no tiene permiso para vender entradas.');
        return;
      }

      if (guardar && !guardadoBiometricoNoSoportado()) {
        const yaHabiaGuardada = await hayCredencialesGuardadas();
        if (yaHabiaGuardada) {
          /* Ya hay una cuenta con huella guardada en este teléfono — no se
             sobreescribe sin preguntar (podría ser la de otro vendedor que
             comparte el dispositivo). La alerta de abajo decide cómo sigue. */
          setConfirmarReemplazo({ usuario: usuarioIn, contrasena: contrasenaIn });
          return;
        }
        // Primera vez en este dispositivo: se guarda directo, sin preguntar.
        const resGuardado = await guardarCredencialesBiometricas(usuarioIn, contrasenaIn);
        if (!resGuardado.ok && resGuardado.mensaje) {
          setAvisoHuella(resGuardado.mensaje);
          finalizarLogin(2600); // deja ver el aviso antes de salir de esta pantalla
          return;
        }
      }
      finalizarLogin(0);
    } finally {
      setCargando(false);
    }
  };

  const iniciarSesion = () => {
    if (!usuario || !contrasena) {
      setError('Ingresa tu usuario y contraseña');
      return;
    }
    loginConCredenciales(usuario, contrasena, guardarSesion);
  };

  const ingresarConHuella = async () => {
    setVerificandoHuella(true);
    setError('');
    try {
      const creds = await obtenerCredencialesBiometricas();
      /* guardar=false: estas credenciales ya vienen del almacenamiento seguro
         del teléfono (por eso pudimos leerlas con la huella) — no hay nada
         nuevo que guardar. */
      if (creds) await loginConCredenciales(creds.usuario, creds.contrasena, false);
    } finally {
      setVerificandoHuella(false);
    }
  };

  /* Sí quiere reemplazar la huella guardada: guarda las nuevas credenciales
     (pisando las anteriores) y recién ahí entra. */
  const confirmarReemplazoSi = async () => {
    if (!confirmarReemplazo) return;
    const { usuario: u, contrasena: c } = confirmarReemplazo;
    setConfirmarReemplazo(null);
    const resultado = await guardarCredencialesBiometricas(u, c);
    if (!resultado.ok && resultado.mensaje) {
      setAvisoHuella(resultado.mensaje);
      finalizarLogin(2600);
    } else {
      finalizarLogin(0);
    }
  };

  /* No quiere reemplazarla: la huella guardada anteriormente se queda tal
     cual, y este vendedor entra normal, sin guardarse para huella. */
  const confirmarReemplazoNo = () => {
    setConfirmarReemplazo(null);
    finalizarLogin(0);
  };

  /* Solo determina si mostrar el botón "Huella" — no dispara nada solo. */
  useEffect(() => {
    (async () => {
      const disponible = await biometriaDisponible();
      const guardado = disponible && (await hayCredencialesGuardadas());
      setBiometriaLista(guardado);
    })();
  }, []);

  return (
    <IonPage>
      <IonContent fullscreen className="login-content">
        <div className="login-container">
          <div className="logo-wrapper">
            <img src={marcaTickets} alt="T-ickets" className="logo" />
            <p className="app-brand-tag">Panel de Ventas</p>
          </div>

          <div className="form-card">
            <h2 className="form-title">Iniciar Sesión</h2>
            <p className="form-subtitle">Acceso de personal de venta</p>

            <IonInput
              className="login-input"
              label="Usuario"
              labelPlacement="floating"
              fill="outline"
              type="text"
              autocomplete="username"
              value={usuario}
              onIonInput={(e) => setUsuario(e.detail.value!)}
            />

            <IonInput
              className="login-input"
              label="Contraseña"
              labelPlacement="floating"
              fill="outline"
              type="password"
              autocomplete="current-password"
              value={contrasena}
              onIonInput={(e) => setContrasena(e.detail.value!)}
            >
              <IonInputPasswordToggle slot="end" />
            </IonInput>

            <IonCheckbox
              className="login-checkbox"
              checked={guardarSesion}
              onIonChange={(e) => setGuardarSesion(e.detail.checked)}
            >
              Recordar acceso en este dispositivo
            </IonCheckbox>

            <div className="acciones-row">
              {biometriaLista && (
                <IonButton
                  fill="outline"
                  className="btn-cuadrado"
                  onClick={ingresarConHuella}
                  disabled={verificandoHuella || cargando}
                >
                  <div className="btn-cuadrado-inner">
                    {verificandoHuella
                      ? <IonSpinner name="crescent" />
                      : <IonIcon icon={fingerPrintOutline} />}
                    <span>{verificandoHuella ? 'Verificando…' : 'Huella'}</span>
                  </div>
                </IonButton>
              )}

              <IonButton
                className="btn-cuadrado btn-cuadrado-primary"
                onClick={iniciarSesion}
                disabled={cargando}
              >
                <div className="btn-cuadrado-inner">
                  <IonIcon icon={logInOutline} />
                  <span>{cargando ? 'Ingresando…' : 'Iniciar Sesión'}</span>
                </div>
              </IonButton>
            </div>
          </div>
        </div>

        <IonToast
          isOpen={!!error}
          message={error}
          duration={3000}
          color="danger"
          position="bottom"
          onDidDismiss={() => setError('')}
        />

        <IonToast
          isOpen={!!avisoHuella}
          message={avisoHuella}
          duration={2600}
          color="warning"
          position="top"
          onDidDismiss={() => setAvisoHuella('')}
        />

        <IonAlert
          isOpen={!!confirmarReemplazo}
          header="¿Reemplazar sesión guardada?"
          message="Ya hay una cuenta guardada con huella en este dispositivo. Si continúas, se reemplazará por esta cuenta."
          buttons={[
            { text: 'No, mantener la anterior', role: 'cancel', handler: confirmarReemplazoNo },
            { text: 'Sí, reemplazar', role: 'destructive', handler: confirmarReemplazoSi },
          ]}
          onDidDismiss={() => setConfirmarReemplazo(null)}
        />
      </IonContent>
    </IonPage>
  );
};

export default Home;
