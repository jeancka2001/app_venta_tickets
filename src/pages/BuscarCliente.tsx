import { useState } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonInput, IonButton, IonIcon, IonSpinner, IonText, IonBadge,
} from '@ionic/react';
import { searchOutline, chevronForwardOutline, ticketOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from '../utils/msLoginAuth';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './BuscarCliente.css';

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';
const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };

interface InfoConcierto {
  nombreConcierto: string;
  localidad_nombre: string;
  cantidad: string;
}
interface TicketUsuario {
  estado: string;
  canje: string;
}
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

const BuscarCliente: React.FC = () => {
  const navigate = useNavigate();
  const [cedula, setCedula]       = useState('');
  const [buscando, setBuscando]   = useState(false);
  const [buscado, setBuscado]     = useState(false);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nombreCliente, setNombreCliente] = useState('');
  const [error, setError]         = useState('');

  const buscar = async () => {
    const ced = cedula.trim();
    if (!ced) { setError('Ingresa una cédula.'); return; }
    setBuscando(true);
    setError('');
    setBuscado(false);
    try {
      const [{ data: regs }, { data: cli }] = await Promise.all([
        axios.post(`${URL_BASE}/listarRegistros`, { cedula: ced }, { headers: API_HDR }),
        axios.post(`${URL_BASE}/consultar_cedula`, { cedula: ced, email: '' }, { headers: API_HDR }),
      ]);
      setRegistros(Array.isArray(regs?.data) ? regs.data : []);
      setNombreCliente(cli?.success ? (cli.data?.nombreCompleto ?? '') : '');
      setBuscado(true);
    } catch {
      setError('Error de conexión al buscar el cliente.');
    } finally {
      setBuscando(false);
    }
  };

  const boletosGenerados = (reg: Registro) => (reg.ticket_usuarios ?? []).length;
  const boletosEsperados = (reg: Registro) =>
    (reg.info_concierto ?? []).reduce((acc, c) => acc + (parseInt(c.cantidad) || 0), 0);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="buscar-toolbar">
          <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          <IonTitle>Buscar Cliente</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="buscar-content">
        <div className="buscar-container">

          <div className="buscar-row">
            <IonInput
              className="buscar-input"
              fill="outline"
              placeholder="Cédula del cliente"
              inputmode="numeric"
              value={cedula}
              onIonInput={(e) => setCedula(e.detail.value ?? '')}
              onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
            />
            <IonButton className="btn-buscar" onClick={buscar} disabled={buscando}>
              {buscando ? <IonSpinner name="crescent" /> : <IonIcon icon={searchOutline} />}
            </IonButton>
          </div>

          {error && <p className="buscar-error">{error}</p>}

          {buscado && (
            <>
              {nombreCliente && (
                <p className="buscar-nombre-cliente">{nombreCliente} · {cedula}</p>
              )}

              {registros.length === 0 && (
                <div className="buscar-vacio">
                  <IonText color="medium"><p>Este cliente no tiene compras registradas.</p></IonText>
                </div>
              )}

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
                        <span>{reg.info_concierto?.[0]?.localidad_nombre ?? ''}</span>
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
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default BuscarCliente;
