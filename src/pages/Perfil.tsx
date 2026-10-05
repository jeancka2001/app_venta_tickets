import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonIcon, IonButton, IonAlert } from '@ionic/react';
import { useState } from 'react';
import { logOutOutline, personCircleOutline, lockClosedOutline, chevronForwardOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { obtenerStaffData, logoutStaff } from '../utils/staffAuth';
import { eliminarCredencialesBiometricas } from '../utils/biometricAuth';
import marcaTickets from '../images/MARCA_TICKETS.png';
import { LegalLinks } from '../components/Legal';
import { useAppLock } from '../context/AppLockContext';
import { borrarConfigBloqueo, etiquetaBloqueo } from '../utils/bloqueoSesion';
import './Perfil.css';

const Perfil: React.FC = () => {
  const navigate = useNavigate();
  const staff = obtenerStaffData();
  const [alertLogout, setAlertLogout] = useState(false);
  const { modo, config, abrirConfig } = useAppLock();
  const inicial = (staff?.name ?? staff?.username ?? '?').charAt(0);

  const cerrarSesion = () => {
    logoutStaff({ renovable: false });
    /* Cerrar sesión también borra la huella guardada en este dispositivo --
       así el siguiente login siempre pide credenciales, no queda la puerta
       abierta con la huella de quien acaba de salir. */
    eliminarCredencialesBiometricas();
    borrarConfigBloqueo();
    navigate('/home', { replace: true });
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="perfil-toolbar">
          <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          <IonTitle size="small">Mi Perfil</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="perfil-content">
        <div className="perfil-avatar-section">
          <div className="avatar-circle">
            <span className="avatar-inicial">{inicial}</span>
          </div>
          <h2 className="perfil-nombre">{staff?.name ?? staff?.username ?? 'Vendedor'}</h2>
          <p className="perfil-rol">
            <IonIcon icon={personCircleOutline} /> {staff?.perfil ?? '—'}
          </p>
        </div>

        <div className="perfil-items">
          <div className="perfil-item">
            <span className="item-label">Usuario</span>
            <h3 className="item-value">{staff?.username ?? '—'}</h3>
          </div>
          <div className="perfil-item">
            <span className="item-label">Perfil</span>
            <h3 className="item-value">{staff?.perfil ?? '—'}</h3>
          </div>
        </div>

        <div className="perfil-items">
          <button type="button" className="perfil-item perfil-item-accion" onClick={abrirConfig}>
            <IonIcon icon={lockClosedOutline} className="perfil-item-icono" />
            <span className="perfil-item-texto">
              <span className="item-label">{modo === 'huella' ? 'Pedir huella después de' : 'Cerrar sesión después de'}</span>
              <h3 className="item-value">{config?.modo === modo ? etiquetaBloqueo(config) : 'Sin configurar'}</h3>
            </span>
            <IonIcon icon={chevronForwardOutline} className="perfil-item-icono" />
          </button>
        </div>

        <div className="perfil-logout">
          <IonButton expand="block" className="btn-logout" onClick={() => setAlertLogout(true)}>
            <IonIcon icon={logOutOutline} slot="start" />
            Cerrar Sesión
          </IonButton>
          <LegalLinks />
        </div>
      </IonContent>

      <IonAlert
        isOpen={alertLogout}
        header="Cerrar sesión"
        message="¿Estás seguro de que deseas cerrar sesión?"
        buttons={[
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Sí, salir', role: 'confirm', handler: cerrarSesion },
        ]}
        onDidDismiss={() => setAlertLogout(false)}
      />
    </IonPage>
  );
};

export default Perfil;
