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
import AdminLocalidadAsientos from './pages/AdminLocalidadAsientos';
import AdminMetodosPago from './pages/AdminMetodosPago';
import AdminDescuentos from './pages/AdminDescuentos';
import AdminSincronizarFisicos from './pages/AdminSincronizarFisicos';
import AdminMoverCortesias from './pages/AdminMoverCortesias';
import Comisiones from './pages/Comisiones'; 
import EscanearBoleto from './pages/EscanearBoleto';
import CanjearEntradas from './pages/CanjearEntradas';
import { obtenerStaffData } from './utils/staffAuth';
import { AppLockProvider } from './context/AppLockContext';
import LockScreen from './components/LockScreen';
import ConfigBloqueo from './components/ConfigBloqueo';
import MenuPaginas, { ID_CONTENIDO } from './components/MenuPaginas';
import Soporte from './pages/Soporte';
import Devoluciones from './pages/Devoluciones';
import CorreosMasivos from './pages/CorreosMasivos';
import Pixeles from './pages/Pixeles';
import PermisosPaginas from './pages/PermisosPaginas';
import { puedoVer } from './utils/permisosPaginas';

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

/* Páginas que se abren desde el menú: solo si el usuario la tiene habilitada en "Permisos de páginas" (admin ve lo que su
   configuración diga; sin configuración, los roles de siempre). Si no puede, se lo manda a Vender. */
const RutaPagina: React.FC<{ clave: string; children: React.ReactNode }> = ({ clave, children }) => {
  const staff = obtenerStaffData();
  if (!staff) return <Navigate to="/home" replace />;
  return puedoVer(clave) ? <>{children}</> : <Navigate to="/dashboard/vender" replace />;
};

const App: React.FC = () => (
  <IonApp>
    <AppLockProvider>
    <IonReactRouter>
      <MenuPaginas />
      <IonRouterOutlet id={ID_CONTENIDO}>
        <Route path="/home" element={<Home />} />
        <Route path="/dashboard/*" element={<RutaProtegida><Dashboard /></RutaProtegida>} />
        <Route path="/venta/:codigoEvento" element={<RutaProtegida><VentaEvento /></RutaProtegida>} />
        <Route path="/localidad/:id" element={<RutaProtegida><Localidad /></RutaProtegida>} />
        <Route path="/pago" element={<RutaProtegida><Pago /></RutaProtegida>} />
        <Route path="/detalle-compra/:id" element={<RutaProtegida><DetalleCompra /></RutaProtegida>} />
        <Route path="/comisiones" element={<RutaProtegida><Comisiones /></RutaProtegida>} />
        <Route path="/escanear-boleto" element={<RutaProtegida><EscanearBoleto /></RutaProtegida>} />
        <Route path="/canjear-entradas" element={<RutaProtegida><CanjearEntradas /></RutaProtegida>} />
        <Route path="/soporte" element={<RutaPagina clave="soporte"><Soporte /></RutaPagina>} />
        <Route path="/devoluciones" element={<RutaPagina clave="devoluciones"><Devoluciones /></RutaPagina>} />
        <Route path="/correos-masivos" element={<RutaPagina clave="correos"><CorreosMasivos /></RutaPagina>} />
        <Route path="/pixeles" element={<RutaPagina clave="meta_pixel"><Pixeles /></RutaPagina>} />
        <Route path="/permisos-paginas" element={<RutaPagina clave="permisos"><PermisosPaginas /></RutaPagina>} />
        <Route path="/admin/evento-nuevo" element={<RutaAdmin><AdminEventoForm /></RutaAdmin>} />
        <Route path="/admin/evento/:codigoEvento/editar" element={<RutaAdmin><AdminEventoForm /></RutaAdmin>} />
        <Route path="/admin/evento/:codigoEvento" element={<RutaAdmin><AdminEventoDetalle /></RutaAdmin>} />
        <Route path="/admin/reporte-usuarios" element={<RutaAdmin><AdminReportePorUsuario /></RutaAdmin>} />
        <Route path="/admin/metodos-pago" element={<RutaAdmin><AdminMetodosPago /></RutaAdmin>} />
        <Route path="/admin/evento/:codigoEvento/localidad/:idLocalidad/asientos" element={<RutaAdmin><AdminLocalidadAsientos /></RutaAdmin>} />
        <Route path="/admin/evento/:codigoEvento/descuentos" element={<RutaAdmin><AdminDescuentos /></RutaAdmin>} />
        <Route path="/admin/evento/:codigoEvento/sincronizar-fisicos" element={<RutaAdmin><AdminSincronizarFisicos /></RutaAdmin>} />
        <Route path="/admin/evento/:codigoEvento/mover-cortesias" element={<RutaAdmin><AdminMoverCortesias /></RutaAdmin>} />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </IonRouterOutlet>
      <LockScreen />
      <ConfigBloqueo />
    </IonReactRouter>
    </AppLockProvider>
  </IonApp>
);

export default App;
