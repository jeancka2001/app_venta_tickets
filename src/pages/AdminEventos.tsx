import { useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonIcon, IonButton, IonButtons, IonSearchbar, IonSpinner, IonText, IonBadge,
} from '@ionic/react';
import {
  addOutline, calendarNumberOutline, locationOutline, chevronForwardOutline, barChartOutline,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { listarEventosAdmin, type EventoAdmin } from '../utils/adminEventos';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './AdminEventos.css';

const estadoBadge: Record<string, string> = {
  ACTIVO: 'badge-activo',
  PROCESO: 'badge-proceso',
  PROXIMO: 'badge-proximo',
  CANCELADO: 'badge-cancelado',
  FINALIZADO: 'badge-finalizado',
};

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const formatFecha = (fecha: string) => {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d} ${MESES[parseInt(m) - 1] ?? m} ${y}`;
};

const AdminEventos: React.FC = () => {
  const navigate = useNavigate();
  const [eventos, setEventos]   = useState<EventoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const lista = await listarEventosAdmin();
      setEventos(lista);
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = eventos.filter(ev =>
    ev.nombreConcierto?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          </IonButtons>
          <IonTitle>Admin · Eventos</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => navigate('/admin/reporte-usuarios')}>
              <IonIcon icon={barChartOutline} slot="icon-only" />
            </IonButton>
            <IonButton onClick={() => navigate('/admin/evento-nuevo')}>
              <IonIcon icon={addOutline} slot="icon-only" />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar className="admin-toolbar">
          <IonSearchbar
            placeholder="Buscar evento…"
            value={busqueda}
            onIonInput={(e) => setBusqueda(e.detail.value ?? '')}
          />
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        {cargando && (
          <div className="loading-state">
            <IonSpinner name="crescent" />
            <IonText><p>Cargando eventos…</p></IonText>
          </div>
        )}

        {!cargando && error && (
          <div className="loading-state"><IonText color="danger"><p>{error}</p></IonText></div>
        )}

        {!cargando && !error && filtrados.length === 0 && (
          <div className="loading-state">
            <IonText color="medium"><p>No hay eventos.</p></IonText>
          </div>
        )}

        {!cargando && !error && (
          <div className="admin-eventos-lista">
            {filtrados.map(ev => (
              <div key={ev.codigoEvento} className="admin-evento-card"
                onClick={() => navigate(`/admin/evento/${ev.codigoEvento}`)}>
                <div className="admin-evento-top">
                  <span className="admin-evento-nombre">{ev.nombreConcierto}</span>
                  <IonBadge className={`badge-estado-evento ${estadoBadge[ev.estado] ?? 'badge-proceso'}`}>
                    {ev.estado}
                  </IonBadge>
                </div>
                <div className="admin-evento-detalle">
                  <IonIcon icon={calendarNumberOutline} />
                  <span>{formatFecha(ev.fechaConcierto)} · {ev.horaConcierto}</span>
                </div>
                <div className="admin-evento-detalle">
                  <IonIcon icon={locationOutline} />
                  <span>{ev.lugarConcierto}, {ev.cuidadConcert}</span>
                </div>
                <IonIcon icon={chevronForwardOutline} className="admin-evento-chevron" />
              </div>
            ))}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default AdminEventos;
