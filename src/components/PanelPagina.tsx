import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonToast, IonSpinner } from '@ionic/react';
import { arrowBackOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { BotonMenu } from './MenuPaginas';
import '../pages/Paneles.css';

/* Marco común de las páginas de administración (Soporte, Devoluciones, Correos, Píxeles, Permisos):
   barra azul con menú (izquierda) + título + acciones, y el fondo gris claro del resto de la app. */
interface Props {
  titulo: string;
  /* Si se da, aparece una flecha para volver (en vez de depender del menú) */
  volverA?: string;
  acciones?: React.ReactNode;
  toast?: string;
  onToastCerrado?: () => void;
  cargando?: boolean;
  children: React.ReactNode;
  /* Contenido fijo debajo de la barra (filtros, buscador) */
  encabezado?: React.ReactNode;
}

const PanelPagina: React.FC<Props> = ({ titulo, volverA, acciones, toast, onToastCerrado, cargando, children, encabezado }) => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          {volverA ? (
            <IonButtons slot="start">
              <IonButton onClick={() => navigate(volverA)} aria-label="Volver"><IonIcon icon={arrowBackOutline} slot="icon-only" /></IonButton>
            </IonButtons>
          ) : <BotonMenu />}
          <IonTitle size="small">{titulo}</IonTitle>
          {acciones && <IonButtons slot="end">{acciones}</IonButtons>}
        </IonToolbar>
        {encabezado}
      </IonHeader>
      <IonContent className="admin-content">
        {cargando ? <div className="pn-cargando"><IonSpinner name="crescent" /></div> : <div className="pn-contenedor">{children}</div>}
      </IonContent>
      <IonToast isOpen={!!toast} message={toast} duration={3200} position="bottom" onDidDismiss={onToastCerrado} />
    </IonPage>
  );
};

export default PanelPagina;
