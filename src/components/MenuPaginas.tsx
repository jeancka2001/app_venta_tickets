import { useCallback, useEffect, useState } from 'react';
import {
  IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonIcon, IonLabel, IonListHeader, IonButton, IonButtons,
} from '@ionic/react';
import { menuController } from '@ionic/core';
import {
  menuOutline, pricetagOutline, statsChartOutline, shieldCheckmarkOutline, peopleOutline, cashOutline, cardOutline, returnDownBackOutline,
  helpBuoyOutline, mailOutline, analyticsOutline, keyOutline, searchOutline, timeOutline, personCircleOutline,
} from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { obtenerStaffData } from '../utils/staffAuth';
import { actualizarMisPaginas, EVENTO_PAGINAS, paginasVisibles, type PaginaApp } from '../utils/permisosPaginas';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './MenuPaginas.css';

export const ID_MENU = 'menu-paginas';
export const ID_CONTENIDO = 'contenido-app';

const ICONOS: Record<string, string> = {
  pricetag: pricetagOutline, stats: statsChartOutline, shield: shieldCheckmarkOutline, people: peopleOutline, cash: cashOutline, card: cardOutline,
  return: returnDownBackOutline, help: helpBuoyOutline, mail: mailOutline, analytics: analyticsOutline, key: keyOutline,
};

/* Estas tres siempre están (son pestañas de abajo) */
const FIJAS = [
  { nombre: 'Buscar cliente', ruta: '/dashboard/buscar', icono: searchOutline },
  { nombre: 'Mis ventas', ruta: '/dashboard/misventas', icono: timeOutline },
  { nombre: 'Mi perfil', ruta: '/dashboard/perfil', icono: personCircleOutline },
];

/* Botón de las 3 rayitas (arriba a la izquierda) que abre el menú */
export const BotonMenu: React.FC = () => (
  <IonButtons slot="start" className="boton-menu-wrap">
    <IonButton onClick={() => menuController.open(ID_MENU)} aria-label="Abrir el menú" className="boton-menu">
      <IonIcon icon={menuOutline} slot="icon-only" />
    </IonButton>
  </IonButtons>
);

/* Menú lateral con TODAS las páginas que el usuario tiene habilitadas (según "Permisos de páginas"). Se actualiza solo:
   al abrirlo, al volver a la app y cada 5 minutos — si le habilitan o quitan una página, el menú cambia sin cerrar sesión. */
const MenuPaginas: React.FC = () => {
  const navigate = useNavigate();
  const ubicacion = useLocation();
  const staff = obtenerStaffData();
  const [paginas, setPaginas] = useState<PaginaApp[]>(() => paginasVisibles());

  const recalcular = useCallback(() => setPaginas(paginasVisibles()), []);

  useEffect(() => {
    const alCambiar = () => recalcular();
    window.addEventListener(EVENTO_PAGINAS, alCambiar);
    const alVolver = () => { if (document.visibilityState === 'visible') actualizarMisPaginas(); };
    document.addEventListener('visibilitychange', alVolver);
    actualizarMisPaginas();
    const cada = window.setInterval(actualizarMisPaginas, 5 * 60 * 1000);
    return () => {
      window.removeEventListener(EVENTO_PAGINAS, alCambiar);
      document.removeEventListener('visibilitychange', alVolver);
      window.clearInterval(cada);
    };
  }, [recalcular, staff?.id]);

  // Si cambia de usuario (cerró sesión y entró otro), se vuelve a leer
  useEffect(() => { recalcular(); actualizarMisPaginas(); }, [staff?.id, recalcular]);

  const ir = async (ruta: string) => {
    await menuController.close(ID_MENU);
    navigate(ruta);
  };

  const activa = (ruta: string) => ubicacion.pathname === ruta || (ruta.length > 12 && ubicacion.pathname.startsWith(ruta));
  const principal = paginas.filter((p) => p.seccion === 'Principal');
  const admin = paginas.filter((p) => p.seccion === 'Administración');
  const fila = (nombre: string, ruta: string, icono: string) => (
    <IonItem key={ruta} button detail={false} lines="none" className={`menu-item ${activa(ruta) ? 'menu-item-activo' : ''}`} onClick={() => ir(ruta)}>
      <IonIcon slot="start" icon={icono} />
      <IonLabel>{nombre}</IonLabel>
    </IonItem>
  );

  return (
    <IonMenu menuId={ID_MENU} contentId={ID_CONTENIDO} type="overlay" disabled={!staff} swipeGesture={false} className="menu-paginas"
      onIonWillOpen={() => { recalcular(); actualizarMisPaginas(); }}>
      <IonHeader>
        <IonToolbar className="menu-toolbar">
          <img src={marcaTickets} alt="T-ickets" className="menu-logo" />
          <IonTitle size="small">Menú</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="menu-content">
        {staff && (
          <div className="menu-usuario">
            <div className="menu-usuario-nombre">{String(staff.name || staff.username || 'Usuario')}</div>
            <div className="menu-usuario-perfil">{String(staff.perfil || '').replace('_', ' ')}</div>
          </div>
        )}
        <IonList lines="none" className="menu-lista">
          <IonListHeader>Principal</IonListHeader>
          {principal.map((p) => fila(p.nombre, p.ruta, ICONOS[p.icono] || menuOutline))}
          {FIJAS.map((f) => fila(f.nombre, f.ruta, f.icono))}
          {admin.length > 0 && <IonListHeader>Administración</IonListHeader>}
          {admin.map((p) => fila(p.nombre, p.ruta, ICONOS[p.icono] || menuOutline))}
        </IonList>
      </IonContent>
    </IonMenu>
  );
};

export default MenuPaginas;
