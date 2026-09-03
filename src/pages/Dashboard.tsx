import { Navigate, Route } from 'react-router-dom';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet } from '@ionic/react';
import {
  pricetagOutline, searchOutline, timeOutline, statsChartOutline,
  personCircleOutline, shieldCheckmarkOutline,
} from 'ionicons/icons';
import Vender from './Vender';
import BuscarCliente from './BuscarCliente';
import MisVentas from './MisVentas';
import Reporte from './Reporte';
import Perfil from './Perfil';
import AdminEventos from './AdminEventos';
import { obtenerStaffData } from '../utils/staffAuth';

/* El apartado "Admin" (gestión de eventos/localidades) solo lo puede ver
   un perfil admin/super_admin -- mismo criterio que GLOBAL_PROFILES en
   el backend (CrearEvento.controller.js/User.controller.js). Se oculta
   tanto el botón de la pestaña como la ruta: si un perfil sin acceso
   entra a /dashboard/admin a mano, se lo manda de vuelta a Vender. */
const esAdmin = (perfil?: string) => perfil === 'admin' || perfil === 'super_admin';

const Dashboard: React.FC = () => {
  const staff = obtenerStaffData();
  const puedeAdministrar = esAdmin(staff?.perfil);

  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route path="vender" element={<Vender />} />
        <Route path="buscar" element={<BuscarCliente />} />
        <Route path="misventas" element={<MisVentas />} />
        <Route path="reporte" element={<Reporte />} />
        <Route path="admin" element={puedeAdministrar ? <AdminEventos /> : <Navigate to="vender" replace />} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="" element={<Navigate to="vender" replace />} />
      </IonRouterOutlet>

      <IonTabBar slot="bottom" className="main-tab-bar">
        <IonTabButton tab="vender" href="/dashboard/vender">
          <IonIcon icon={pricetagOutline} />
          <IonLabel>Vender</IonLabel>
        </IonTabButton>

        <IonTabButton tab="buscar" href="/dashboard/buscar">
          <IonIcon icon={searchOutline} />
          <IonLabel>Buscar Cliente</IonLabel>
        </IonTabButton>

        <IonTabButton tab="misventas" href="/dashboard/misventas">
          <IonIcon icon={timeOutline} />
          <IonLabel>Mis Ventas</IonLabel>
        </IonTabButton>

        <IonTabButton tab="reporte" href="/dashboard/reporte">
          <IonIcon icon={statsChartOutline} />
          <IonLabel>Reporte</IonLabel>
        </IonTabButton>

        {puedeAdministrar && (
          <IonTabButton tab="admin" href="/dashboard/admin">
            <IonIcon icon={shieldCheckmarkOutline} />
            <IonLabel>Admin</IonLabel>
          </IonTabButton>
        )}

        <IonTabButton tab="perfil" href="/dashboard/perfil">
          <IonIcon icon={personCircleOutline} />
          <IonLabel>Perfil</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
};

export default Dashboard;
