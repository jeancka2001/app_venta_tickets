import { useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonSearchbar, IonButton, IonIcon,
  IonSpinner, IonText, IonBadge,
} from '@ionic/react';
import { ticketOutline, chevronForwardOutline, calendarNumberOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from '../utils/msLoginAuth';
import { obtenerStaffData } from '../utils/staffAuth';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './MisVentas.css';

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';
const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };
const SIZE = 20;

const hoyStr = () => new Date().toISOString().slice(0, 10);
const fechaStr = (d: Date) => d.toISOString().slice(0, 10);

const RANGOS_RAPIDOS = [
  { label: 'Hoy', calc: (): [string, string] => [hoyStr(), hoyStr()] },
  {
    label: 'Ayer',
    calc: (): [string, string] => {
      const ayer = fechaStr(new Date(Date.now() - 86400000));
      return [ayer, ayer];
    },
  },
  {
    label: 'Últimos 7 días',
    calc: (): [string, string] => [fechaStr(new Date(Date.now() - 6 * 86400000)), hoyStr()],
  },
];

interface InfoConcierto {
  nombreConcierto: string;
  localidad_nombre: string;
  cantidad: string;
}
interface TicketUsuario { estado: string; canje: string; }
interface Registro {
  id: number;
  cedula: string;
  forma_pago: string;
  total_pago: string;
  info_concierto: InfoConcierto[];
  estado_pago: string;
  fechaCreacion: string;
  ticket_usuarios?: TicketUsuario[];
}

const estadoColor: Record<string, string> = {
  Pagado:    'badge-pagado',
  Pendiente: 'badge-pendiente',
  Comprobar: 'badge-comprobar',
  Anulado:   'badge-anulado',
  Expirado:  'badge-expirado',
};

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const formatFecha = (fecha: string) => {
  if (!fecha) return '—';
  const solo = fecha.split(' ')[0].split('T')[0];
  const [y, m, d] = solo.split('-');
  if (!y || !m || !d) return fecha;
  return `${d} ${MESES[parseInt(m) - 1] ?? m} ${y}`;
};

/* Historial de ventas del vendedor logueado -- muestra solo lo que ESE
   usuario registró (registraCompra.id_operador), no todas las ventas de
   un evento ni de otros operadores, y por defecto solo las de HOY (como
   un cierre de caja del día) -- se puede ampliar el rango con los chips
   o las fechas de abajo. */
const MisVentas: React.FC = () => {
  const navigate = useNavigate();
  const staff = obtenerStaffData();

  const [desde, setDesde]           = useState(hoyStr());
  const [hasta, setHasta]           = useState(hoyStr());
  const [registros, setRegistros]   = useState<Registro[]>([]);
  const [total, setTotal]           = useState(0);
  const [cargando, setCargando]     = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError]           = useState('');
  const [hasNext, setHasNext]       = useState(false);
  const [nextInit, setNextInit]     = useState(0);
  const [cedula, setCedula]         = useState('');

  const cargar = useCallback(async (init: number, reset: boolean, cedulaFiltro: string, d: string, h: string) => {
    if (!staff?.id) { setCargando(false); setError('No se pudo identificar al vendedor.'); return; }
    if (reset) { setCargando(true); setError(''); } else { setCargandoMas(true); }
    try {
      const params: Record<string, string | number> = {
        id_operador: staff.id, init, size: SIZE,
        ...(d && h ? { fecha_init: d, fecha_fin: h } : {}),
      };
      const body = cedulaFiltro.trim() ? { cedula: cedulaFiltro.trim() } : {};
      const { data } = await axios.post(`${URL_BASE}/listarRegistros`, body, { headers: API_HDR, params });
      const nuevos: Registro[] = Array.isArray(data?.data) ? data.data : [];
      setRegistros(prev => reset ? nuevos : [...prev, ...nuevos]);
      setTotal(data?.total ?? 0);
      setHasNext(!!data?.hasNext);
      setNextInit(data?.next_init ?? 0);
    } catch {
      if (reset) setError('Error al conectar con el servidor.');
    } finally {
      setCargando(false);
      setCargandoMas(false);
    }
  }, [staff?.id]);

  useEffect(() => { cargar(0, true, '', desde, hasta); }, [cargar]); // eslint-disable-line react-hooks/exhaustive-deps

  const buscar = () => cargar(0, true, cedula, desde, hasta);

  const aplicarRango = (d: string, h: string) => {
    setDesde(d);
    setHasta(h);
    cargar(0, true, cedula, d, h);
  };

  const boletosGenerados = (reg: Registro) => (reg.ticket_usuarios ?? []).length;
  const boletosEsperados = (reg: Registro) =>
    (reg.info_concierto ?? []).reduce((acc, c) => acc + (parseInt(c.cantidad) || 0), 0);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="misventas-toolbar">
          <IonButtons slot="start">
            <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          </IonButtons>
          <IonTitle>Mis ventas</IonTitle>
        </IonToolbar>
        <IonToolbar className="misventas-toolbar">
          <IonSearchbar
            placeholder="Filtrar por cédula del cliente…"
            value={cedula}
            onIonInput={(e) => setCedula(e.detail.value ?? '')}
            onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
            onIonClear={() => cargar(0, true, '', desde, hasta)}
          />
        </IonToolbar>
      </IonHeader>

      <IonContent className="misventas-content">
        <div className="misventas-container">

          <div className="misventas-fechas-card">
            <h3 className="misventas-fechas-title">
              <IonIcon icon={calendarNumberOutline} /> Rango de fechas
            </h3>
            <div className="fechas-row">
              <div className="fecha-campo">
                <label>Desde</label>
                <input type="date" value={desde} max={hasta}
                  onChange={(e) => aplicarRango(e.target.value, hasta)} />
              </div>
              <div className="fecha-campo">
                <label>Hasta</label>
                <input type="date" value={hasta} min={desde} max={hoyStr()}
                  onChange={(e) => aplicarRango(desde, e.target.value)} />
              </div>
            </div>
            <div className="rangos-rapidos">
              {RANGOS_RAPIDOS.map((r) => (
                <button key={r.label} className="chip-rango" disabled={cargando}
                  onClick={() => { const [d, h] = r.calc(); aplicarRango(d, h); }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {!cargando && !error && (
            <p className="misventas-total">
              {total} venta{total === 1 ? '' : 's'} tuya{total === 1 ? '' : 's'}
              {desde === hoyStr() && hasta === hoyStr() ? ' hoy' : ` del ${formatFecha(desde)} al ${formatFecha(hasta)}`}
            </p>
          )}

          {cargando && (
            <div className="loading-state">
              <IonSpinner name="crescent" />
              <IonText><p>Cargando tus ventas…</p></IonText>
            </div>
          )}

          {!cargando && error && (
            <div className="loading-state"><IonText color="danger"><p>{error}</p></IonText></div>
          )}

          {!cargando && !error && registros.length === 0 && (
            <div className="misventas-vacio">
              <IonText color="medium"><p>No registraste ventas en este rango de fechas.</p></IonText>
            </div>
          )}

          {!cargando && !error && registros.length > 0 && (
            <>
              <div className="registros-lista">
                {registros.map((reg) => {
                  const generados = boletosGenerados(reg);
                  const esperados = boletosEsperados(reg);
                  const faltan = reg.estado_pago === 'Pagado' && generados < esperados;
                  return (
                    <div key={reg.id} className="registro-card"
                      onClick={() => navigate(`/detalle-compra/${reg.id}`)}>
                      <div className="registro-top">
                        <span className="registro-evento">
                          {reg.info_concierto?.[0]?.nombreConcierto ?? '—'}
                        </span>
                        <IonBadge className={`badge-reg ${estadoColor[reg.estado_pago] ?? 'badge-anulado'}`}>
                          {reg.estado_pago}
                        </IonBadge>
                      </div>
                      <div className="registro-detalle">
                        <span>{reg.info_concierto?.[0]?.localidad_nombre ?? ''} · {reg.forma_pago || '—'}</span>
                        <span>{formatFecha(reg.fechaCreacion)}</span>
                      </div>
                      <div className="registro-bottom">
                        <span className="registro-total">${parseFloat(reg.total_pago || '0').toFixed(2)}</span>
                        <span className={`registro-boletos ${faltan ? 'boletos-falta' : ''}`}>
                          <IonIcon icon={ticketOutline} />
                          {generados}/{esperados} generados
                          {faltan && ' ⚠'}
                        </span>
                        <IonIcon icon={chevronForwardOutline} className="registro-chevron" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasNext && (
                <IonButton fill="outline" expand="block" className="btn-cargar-mas"
                  onClick={() => cargar(nextInit, false, cedula, desde, hasta)} disabled={cargandoMas}>
                  {cargandoMas ? <IonSpinner name="crescent" /> : 'Cargar más ventas'}
                </IonButton>
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default MisVentas;
