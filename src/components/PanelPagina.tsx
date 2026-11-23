import { createContext, useContext } from 'react';
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

/* Páginas que cambian entre lista y detalle (Devoluciones, Soporte) NO deben cambiar de <IonPage> en la misma ruta: Ionic deja la nueva
   en blanco. Se envuelven en <PaginaFija> (un solo IonPage) y cada vista dibuja solo su cabecera y contenido. */
const DentroDePagina = createContext(false);
export const PaginaFija: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <IonPage><DentroDePagina.Provider value>{children}</DentroDePagina.Provider></IonPage>
);

const Fragmento: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

const PanelPagina: React.FC<Props> = ({ titulo, volverA, acciones, toast, onToastCerrado, cargando, children, encabezado }) => {
  const navigate = useNavigate();
  const fija = useContext(DentroDePagina);
  const Marco = fija ? Fragmento : IonPage;
  return (
    <Marco>
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
    </Marco>
  );
};

export default PanelPagina;
