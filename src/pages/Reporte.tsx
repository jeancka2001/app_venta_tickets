import { useState } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButton, IonSpinner, IonText, IonIcon,
} from '@ionic/react';
import {
  statsChartOutline, cashOutline, ticketOutline, receiptOutline,
  pricetagOutline, calendarNumberOutline, timeOutline,
} from 'ionicons/icons';
import { obtenerReporteVentas, UsuarioAgg } from '../utils/reporteVentas';
import { obtenerStaffData } from '../utils/staffAuth';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './Reporte.css';

const hoyStr = () => new Date().toISOString().slice(0, 10);
const fechaStr = (d: Date) => d.toISOString().slice(0, 10);
const inicioMesStr = () => {
  const d = new Date();
  return fechaStr(new Date(d.getFullYear(), d.getMonth(), 1));
};

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
  { label: 'Este mes', calc: (): [string, string] => [inicioMesStr(), hoyStr()] },
];

const f2 = (n: number | undefined) => (Number(n) || 0).toFixed(2);

const Reporte: React.FC = () => {
  const staff = obtenerStaffData();
  const [desde, setDesde] = useState(inicioMesStr());
  const [hasta, setHasta] = useState(hoyStr());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [miReporte, setMiReporte] = useState<UsuarioAgg | null>(null);

  const generar = async (d = desde, h = hasta) => {
    setCargando(true);
    setError('');
    setBuscado(false);
    try {
      const data = await obtenerReporteVentas(d, h);
      if (!data.success) {
        setError(data.message ?? 'No se pudo generar el reporte.');
        setMiReporte(null);
      } else {
        const propia = (data.operadores ?? []).find(o => o.id === staff?.id) ?? null;
        setMiReporte(propia);
        setBuscado(true);
      }
    } catch {
      setError('Error de conexión al generar el reporte.');
      setMiReporte(null);
    } finally {
      setCargando(false);
    }
  };

  const aplicarRango = (d: string, h: string) => {
    setDesde(d);
    setHasta(h);
    generar(d, h);
  };

  const otrosCompras = miReporte
    ? (miReporte.pendiente.compras || 0) + (miReporte.comprobar.compras || 0) + (miReporte.expirado.compras || 0)
    : 0;
  const otrosMonto = miReporte
    ? (miReporte.pendiente.monto || 0) + (miReporte.comprobar.monto || 0) + (miReporte.expirado.monto || 0)
    : 0;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="reporte-toolbar">
          <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          <IonTitle>Mi Reporte</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="reporte-content">
        <div className="reporte-container">

          <div className="reporte-card">
            <h3 className="reporte-card-title">
              <IonIcon icon={calendarNumberOutline} /> Rango de fechas
            </h3>
            <div className="fechas-row">
              <div className="fecha-campo">
                <label>Desde</label>
                <input type="date" value={desde} max={hasta}
                  onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="fecha-campo">
                <label>Hasta</label>
                <input type="date" value={hasta} min={desde} max={hoyStr()}
                  onChange={(e) => setHasta(e.target.value)} />
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

            <IonButton expand="block" className="btn-generar"
              onClick={() => generar()} disabled={cargando || !desde || !hasta}>
              {cargando
                ? <><IonSpinner name="crescent" className="btn-spinner" /> Generando…</>
                : <><IonIcon icon={statsChartOutline} slot="start" /> Generar reporte</>}
            </IonButton>

            {error && <p className="reporte-error">{error}</p>}
          </div>

          {buscado && !miReporte && (
            <div className="reporte-vacio">
              <IonText color="medium"><p>No tienes ventas registradas en este rango de fechas.</p></IonText>
            </div>
          )}

          {miReporte && (
            <>
              <div className="kpis-row">
                <div className="kpi-card">
                  <IonIcon icon={cashOutline} className="kpi-icon" />
                  <span className="kpi-valor">${f2(miReporte.pagado.monto)}</span>
                  <span className="kpi-label">Total vendido</span>
                </div>
                <div className="kpi-card">
                  <IonIcon icon={receiptOutline} className="kpi-icon" />
                  <span className="kpi-valor">{miReporte.pagado.compras}</span>
                  <span className="kpi-label">Compras pagadas</span>
                </div>
                <div className="kpi-card">
                  <IonIcon icon={ticketOutline} className="kpi-icon" />
                  <span className="kpi-valor">{miReporte.pagado.boletos}</span>
                  <span className="kpi-label">Boletos</span>
                </div>
                <div className="kpi-card">
                  <IonIcon icon={pricetagOutline} className="kpi-icon" />
                  <span className="kpi-valor">${f2(miReporte.pagado.comision)}</span>
                  <span className="kpi-label">Comisión</span>
                </div>
              </div>

              {otrosCompras > 0 && (
                <div className="reporte-aviso-otros">
                  <IonIcon icon={timeOutline} />
                  <span>
                    Además tienes {otrosCompras} compra{otrosCompras > 1 ? 's' : ''} pendiente(s)/por comprobar
                    por ${f2(otrosMonto)}, que no suman al total (aún no están pagadas).
                  </span>
                </div>
              )}

              <div className="reporte-card">
                <h3 className="reporte-card-title">Por método de pago</h3>
                {(miReporte.formas_pago ?? []).length === 0 && (
                  <p className="reporte-sin-datos">Sin datos.</p>
                )}
                {(miReporte.formas_pago ?? []).map((fp, i) => (
                  <div key={i} className="reporte-fila">
                    <div className="reporte-fila-info">
                      <span className="reporte-fila-nombre">{fp.forma}</span>
                      <span className="reporte-fila-sub">{fp.compras} compras · {fp.boletos} boletos</span>
                    </div>
                    <span className="reporte-fila-monto">${f2(fp.monto)}</span>
                  </div>
                ))}
              </div>

              <div className="reporte-card">
                <h3 className="reporte-card-title">Por evento</h3>
                {(miReporte.eventos ?? []).length === 0 && (
                  <p className="reporte-sin-datos">Sin datos.</p>
                )}
                {(miReporte.eventos ?? []).map((ev, i) => (
                  <div key={i} className="reporte-fila">
                    <div className="reporte-fila-info">
                      <span className="reporte-fila-nombre">{ev.evento}</span>
                      <span className="reporte-fila-sub">{ev.compras} compras · {ev.boletos} boletos</span>
                    </div>
                    <span className="reporte-fila-monto">${f2(ev.monto)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!buscado && !cargando && !miReporte && (
            <div className="reporte-vacio">
              <IonText color="medium"><p>Elige un rango de fechas y toca "Generar reporte".</p></IonText>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Reporte;
