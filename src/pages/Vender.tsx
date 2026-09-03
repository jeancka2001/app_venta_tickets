import { useState, useEffect } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonIcon, IonButton, IonButtons, IonSearchbar, IonSpinner, IonText,
} from '@ionic/react';
import {
  calendarNumberOutline, locationOutline, pricetagOutline,
  chevronDownOutline, chevronUpOutline, calculatorOutline,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { staffAuthHeaders } from '../utils/staffAuth';
import {
  obtenerMetodosPagoActivos, METODOS_CONFIGURABLES, calcularTotalConComision,
  type MetodoPagoActivo,
} from '../utils/metodosPago';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './Vender.css';

interface Evento {
  id: number;
  nombreConcierto: string;
  fechaConcierto: string;
  horaConcierto: string;
  lugarConcierto: string;
  cuidadConcert: string;
  imagenConcierto: string;
  mapaConcierto: string;
  codigoEvento: string;
  iva?: string;
}

interface Localidad {
  id: number;
  id_localidad: number;
  localidad: string;
  precio_normal: string;
  cantidad_disponible: number;
  tipo_localidad: string;
  comision_boleto?: string;
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const formatFecha = (fecha: string) => {
  const [y, m, d] = fecha.split('-');
  return `${d} ${MESES[parseInt(m) - 1]} ${y}`;
};

const Vender: React.FC = () => {
  const navigate = useNavigate();
  const [eventos, setEventos]   = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [busqueda, setBusqueda] = useState('');

  /* ── "Ver precios" desplegable por evento ── */
  const [expandido, setExpandido] = useState<Set<number>>(new Set());
  const [preciosPorEvento, setPreciosPorEvento] = useState<Record<number, Localidad[]>>({});
  const [cargandoPrecios, setCargandoPrecios] = useState<Set<number>>(new Set());

  /* "Sumar comisiones": null = no pedido todavía, 'cargando' = en curso,
     array = métodos activos ya traídos para ese evento. */
  const [metodosPorEvento, setMetodosPorEvento] =
    useState<Record<number, MetodoPagoActivo[] | 'cargando' | undefined>>({});

  const cargarEventos = async () => {
    setCargando(true);
    setError('');
    try {
      // Cabeceras con el JWT del vendedor logueado (no el token de
      // servicio): el backend filtra listareventos por lo que ese usuario
      // tiene asignado en usuario_evento, salvo perfil admin/super_admin.
      const { data } = await axios.get(
        'https://api.t-ickets.com/ms_login/listareventos/ACTIVO/',
        { headers: staffAuthHeaders() }
      );
      if (data.success) {
        const hoy = new Date();
        const soloFuturos = (data.data as Evento[]).filter(
          (ev) => new Date(ev.fechaConcierto + 'T23:59:59') > hoy
        );
        setEventos(soloFuturos);
      } else setError('No se pudieron cargar los eventos');
    } catch {
      setError('Error al conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarEventos(); }, []);

  const eventosFiltrados = eventos.filter((ev) =>
    ev.nombreConcierto.toLowerCase().includes(busqueda.toLowerCase())
  );

  const alternarPrecios = async (ev: Evento) => {
    setExpandido(prev => {
      const next = new Set(prev);
      if (next.has(ev.id)) next.delete(ev.id);
      else next.add(ev.id);
      return next;
    });
    if (preciosPorEvento[ev.id]) return;

    setCargandoPrecios(prev => new Set(prev).add(ev.id));
    try {
      const { data } = await axios.get(
        `https://api.t-ickets.com/ms_login/ListaPreciosLocaDispo/${ev.codigoEvento}`,
        { headers: staffAuthHeaders() }
      );
      if (data.success) setPreciosPorEvento(prev => ({ ...prev, [ev.id]: data.data }));
    } catch { /* silent */ }
    finally {
      setCargandoPrecios(prev => { const n = new Set(prev); n.delete(ev.id); return n; });
    }
  };

  const sumarComisiones = async (ev: Evento) => {
    setMetodosPorEvento(prev => ({ ...prev, [ev.id]: 'cargando' }));
    const activos = await obtenerMetodosPagoActivos(ev.codigoEvento);
    setMetodosPorEvento(prev => ({ ...prev, [ev.id]: activos }));
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="vender-toolbar">
          <IonButtons slot="start">
            <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          </IonButtons>
          <IonTitle>Vender</IonTitle>
        </IonToolbar>
        <IonToolbar className="vender-toolbar">
          <IonSearchbar
            placeholder="Buscar evento…"
            value={busqueda}
            onIonInput={(e) => setBusqueda(e.detail.value ?? '')}
          />
        </IonToolbar>
      </IonHeader>

      <IonContent className="vender-content">
        {cargando && (
          <div className="loading-state">
            <IonSpinner name="crescent" />
            <IonText><p>Cargando eventos…</p></IonText>
          </div>
        )}

        {!cargando && error && (
          <div className="loading-state">
            <IonText color="danger"><p>{error}</p></IonText>
          </div>
        )}

        {!cargando && !error && eventosFiltrados.length === 0 && (
          <div className="loading-state">
            <IonText color="medium"><p>No hay eventos activos</p></IonText>
          </div>
        )}

        {!cargando && !error && (
          <div className="eventos-list">
            {eventosFiltrados.map((ev) => {
              const abierto  = expandido.has(ev.id);
              const precios  = preciosPorEvento[ev.id];
              const metodos  = metodosPorEvento[ev.id];
              const ivaRate  = parseFloat((ev.iva || '1.00').replace('1.', '0.'));

              return (
                <div key={ev.id} className="evento-card">
                  <div className="evento-banner">
                    <img src={ev.imagenConcierto} alt={ev.nombreConcierto} className="evento-img" />
                  </div>
                  <div className="evento-body">
                    <h2 className="evento-nombre">{ev.nombreConcierto}</h2>
                    <div className="evento-detalle">
                      <IonIcon icon={calendarNumberOutline} />
                      <span>{formatFecha(ev.fechaConcierto)} · {ev.horaConcierto}</span>
                    </div>
                    <div className="evento-detalle">
                      <IonIcon icon={locationOutline} />
                      <span>{ev.lugarConcierto}, {ev.cuidadConcert}</span>
                    </div>

                    <button className="btn-ver-precios" onClick={() => alternarPrecios(ev)}>
                      <IonIcon icon={pricetagOutline} />
                      <span>Ver precios</span>
                      <IonIcon icon={abierto ? chevronUpOutline : chevronDownOutline} className="chevron" />
                    </button>

                    {abierto && (
                      <div className="precios-panel">
                        {cargandoPrecios.has(ev.id) && (
                          <div className="precios-cargando"><IonSpinner name="crescent" /></div>
                        )}

                        {!cargandoPrecios.has(ev.id) && precios?.length === 0 && (
                          <p className="precios-vacio">No hay localidades disponibles.</p>
                        )}

                        {(precios ?? []).map((p) => {
                          const precioNum = parseFloat(p.precio_normal) || 0;
                          const comBoleto = parseFloat(p.comision_boleto || '0') || 0;
                          return (
                            <div key={p.id} className="precio-localidad-bloque">
                              <div className="precio-localidad-header">
                                <span className="precio-localidad-nombre">
                                  {p.localidad.replace(/__+/g, '').trim()}
                                </span>
                                <span className="precio-localidad-base">${precioNum.toFixed(2)}</span>
                              </div>

                              {metodos === 'cargando' && (
                                <div className="precios-cargando"><IonSpinner name="crescent" /></div>
                              )}

                              {Array.isArray(metodos) && (
                                <div className="precio-metodos-lista">
                                  {METODOS_CONFIGURABLES
                                    .filter(m => metodos.length === 0 ||
                                      metodos.find(a => a.metodo === m.key)?.activo)
                                    .map(m => {
                                      const cfg = metodos.find(a => a.metodo === m.key);
                                      const pct = cfg?.comision_porcentaje ?? m.pctDefault;
                                      const { total } = calcularTotalConComision(precioNum, 1, comBoleto, ivaRate, pct);
                                      return (
                                        <div key={m.key} className="precio-metodo-fila">
                                          <span className="precio-metodo-nombre">{m.label}</span>
                                          <span className="precio-metodo-final">${total.toFixed(2)}</span>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {(precios?.length ?? 0) > 0 && metodos === undefined && (
                          <IonButton fill="outline" size="small" className="btn-sumar-comisiones"
                            onClick={() => sumarComisiones(ev)}>
                            <IonIcon icon={calculatorOutline} slot="start" />
                            Sumar comisiones
                          </IonButton>
                        )}
                      </div>
                    )}

                    <IonButton
                      expand="block"
                      className="btn-vender"
                      onClick={() => navigate(`/venta/${ev.codigoEvento}`, { state: { evento: ev } })}
                    >
                      <IonIcon icon={pricetagOutline} slot="start" />
                      Vender entrada
                    </IonButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Vender;
