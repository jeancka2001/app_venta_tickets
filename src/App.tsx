import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import VentaEvento from './pages/VentaEvento';
import Localidad from './pages/Localidad';
import Pago from './pages/Pago';
import DetalleCompra from './pages/DetalleCompra';
import AdminEventoForm from './pages/AdminEventoForm';
import AdminEventoDetalle from './pages/AdminEventoDetalle';
import AdminReportePorUsuario from './pages/AdminReportePorUsuario';
import { obtenerStaffData } from './utils/staffAuth';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';

setupIonicReact();

/* Igual que en app_tickets: Localidad y Pago se navegan como rutas de
   nivel superior (fuera de los tabs), para que se vean a pantalla
   completa por encima de la barra de tabs — solo /dashboard/* usa tabs. */
const RutaProtegida: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const staff = obtenerStaffData();
  return staff ? <>{children}</> : <Navigate to="/home" replace />;
};

/* Igual que RutaProtegida pero además exige perfil admin/super_admin --
   mismo criterio que la pestaña "Admin" en Dashboard.tsx. Si alguien sin
   ese perfil entra a una URL de admin a mano, se lo manda a Vender en
   vez de al detalle. */
const RutaAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const staff = obtenerStaffData();
  if (!staff) return <Navigate to="/home" replace />;
  const esAdmin = staff.perfil === 'admin' || staff.perfil === 'super_admin';
  return esAdmin ? <>{children}</> : <Navigate to="/dashboard/vender" replace />;
};

const App: React.FC = () => (
  <IonApp>
    <IonReactRouter>
      <IonRouterOutlet>
        <Route path="/home" element={<Home />} />
        <Route path="/dashboard/*" element={<RutaProtegida><Dashboard /></RutaProtegida>} />
        <Route path="/venta/:codigoEvento" element={<RutaProtegida><VentaEvento /></RutaProtegida>} />
        <Route path="/localidad/:id" element={<RutaProtegida><Localidad /></RutaProtegida>} />
        <Route path="/pago" element={<RutaProtegida><Pago /></RutaProtegida>} />
        <Route path="/detalle-compra/:id" element={<RutaProtegida><DetalleCompra /></RutaProtegida>} />
        <Route path="/admin/evento-nuevo" element={<RutaAdmin><AdminEventoForm /></RutaAdmin>} />
        <Route path="/admin/evento/:codigoEvento/editar" element={<RutaAdmin><AdminEventoForm /></RutaAdmin>} />
        <Route path="/admin/evento/:codigoEvento" element={<RutaAdmin><AdminEventoDetalle /></RutaAdmin>} />
        <Route path="/admin/reporte-usuarios" element={<RutaAdmin><AdminReportePorUsuario /></RutaAdmin>} />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </IonRouterOutlet>
    </IonReactRouter>
  </IonApp>
);

export default App;
