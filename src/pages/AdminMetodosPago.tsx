import { useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonIcon, IonSpinner, IonText, IonToggle, IonBadge, IonToast,
} from '@ionic/react';
import { cardOutline, cashOutline, alertCircleOutline } from 'ionicons/icons';
import {
  listarMetodosPagoAdmin, toggleMetodoPagoActivo,
  METODOS_CONFIGURABLES, type MetodoPagoActivo,
} from '../utils/metodosPago';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './AdminMetodosPago.css';

/* Vista de solo-consulta/activación para el admin -- credenciales y
   webhooks de cada pasarela siguen gestionándose únicamente desde
   TicketsWeb (Ajustes > Métodos de Pago); acá solo se ve el estado
   (Activo/Desactivado) y el % de comisión de cada uno, y se puede
   activar/desactivar igual que en la web. */
const AdminMetodosPago: React.FC = () => {
  const [estados, setEstados] = useState<Record<string, MetodoPagoActivo>>({});
  const [cargando, setCargando] = useState(true);
  const [sesionExpirada, setSesionExpirada] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const resp = await listarMetodosPagoAdmin();
    const mapa: Record<string, MetodoPagoActivo> = {};
    resp.data.forEach((m) => { mapa[m.metodo] = m; });
    setEstados(mapa);
    setSesionExpirada(resp.sesionExpirada);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarEstado = async (metodo: string, activo: boolean) => {
    setCambiando(metodo);
    const resp = await toggleMetodoPagoActivo(metodo, activo);
    setToast(resp.success
      ? (activo ? `${metodo} activado` : `${metodo} desactivado`)
      : (resp.message || 'No se pudo cambiar el estado'));
    if (resp.success) await cargar();
    setCambiando(null);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/admin" text="" />
          </IonButtons>
          <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          <IonTitle size="small">Métodos de Pago</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        <div className="metpago-container">
          {sesionExpirada ? (
            <div className="admin-card metpago-aviso">
              <IonIcon icon={alertCircleOutline} />
              <span>Tu sesión expiró. Cierra sesión y vuelve a iniciar sesión para ver esta página.</span>
            </div>
          ) : cargando ? (
            <div className="metpago-cargando"><IonSpinner name="crescent" /></div>
          ) : (
            METODOS_CONFIGURABLES.map((m) => {
              const estado = estados[m.key];
              const activo = !!estado?.activo;
              return (
                <div key={m.key} className="admin-card metpago-card">
                  <div className="metpago-info">
                    <IonIcon icon={m.categoria === 'local' ? cashOutline : cardOutline} className="metpago-icono" />
                    <div className="metpago-textos">
                      <span className="metpago-nombre">{m.label}</span>
                      <span className="metpago-comision">
                        Comisión: {((estado?.comision_porcentaje ?? m.pctDefault) * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <div className="metpago-estado">
                    <IonBadge className={activo ? 'badge-activo' : 'badge-inactivo'}>
                      {activo ? 'Activo' : 'Desactivado'}
                    </IonBadge>
                    <IonToggle
                      checked={activo}
                      disabled={cambiando === m.key}
                      onIonChange={(e) => cambiarEstado(m.key, e.detail.checked)}
                    />
                  </div>
                </div>
              );
            })
          )}

          {!cargando && !sesionExpirada && (
            <IonText color="medium">
              <p className="metpago-nota">
                Las credenciales y el webhook de cada pasarela se configuran desde la página web (Ajustes → Métodos de Pago).
              </p>
            </IonText>
          )}
        </div>
      </IonContent>

      <IonToast isOpen={!!toast} message={toast} duration={2500} position="top" onDidDismiss={() => setToast('')} />
    </IonPage>
  );
};

export default AdminMetodosPago;
