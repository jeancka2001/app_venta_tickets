import { useState } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonSpinner, IonText, IonIcon,
} from '@ionic/react';
import {
  calendarNumberOutline, chevronDownOutline, chevronUpOutline,
  cashOutline, ticketOutline, receiptOutline, peopleOutline,
} from 'ionicons/icons';
import { obtenerReporteVentas, type UsuarioAgg } from '../utils/reporteVentas';
import './AdminReportePorUsuario.css';

const hoyStr = () => new Date().toISOString().slice(0, 10);
const fechaStr = (d: Date) => d.toISOString().slice(0, 10);
const inicioMesStr = () => {
  const d = new Date();
  return fechaStr(new Date(d.getFullYear(), d.getMonth(), 1));
};

const RANGOS_RAPIDOS = [
  { label: 'Hoy', calc: (): [string, string] => [hoyStr(), hoyStr()] },
  { label: 'Ayer', calc: (): [string, string] => { const a = fechaStr(new Date(Date.now() - 86400000)); return [a, a]; } },
  { label: 'Últimos 7 días', calc: (): [string, string] => [fechaStr(new Date(Date.now() - 6 * 86400000)), hoyStr()] },
  { label: 'Este mes', calc: (): [string, string] => [inicioMesStr(), hoyStr()] },
];

const f2 = (n: number | undefined) => (Number(n) || 0).toFixed(2);

/* Reporte por usuario para admin -- a diferencia de "Mi Reporte" (Reporte.tsx,
   que filtra a la fila del propio vendedor), acá se listan TODOS los
   operadores del rango, igual que ReportePorUsuario/index.js en la web. */
const AdminReportePorUsuario: React.FC = () => {
  const [desde, setDesde] = useState(inicioMesStr());
  const [hasta, setHasta] = useState(hoyStr());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [operadores, setOperadores] = useState<UsuarioAgg[]>([]);
  const [autogestionResumen, setAutogestionResumen] = useState<UsuarioAgg | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const generar = async (d = desde, h = hasta) => {
    setCargando(true);
    setError('');
    setBuscado(false);
    try {
      const data = await obtenerReporteVentas(d, h);
      if (!data.success) {
        setError(data.message ?? 'No se pudo generar el reporte.');
        setOperadores([]);
        setAutogestionResumen(null);
      } else {
        const ordenados = [...(data.operadores ?? [])].sort((a, b) => (b.pagado.monto || 0) - (a.pagado.monto || 0));
        setOperadores(ordenados);
        setAutogestionResumen(data.autogestion?.resumen ?? null);
        setBuscado(true);
      }
    } catch {
      setError('Error de conexión al generar el reporte.');
      setOperadores([]);
    } finally {
      setCargando(false);
    }
  };

  const aplicarRango = (d: string, h: string) => { setDesde(d); setHasta(h); generar(d, h); };

  const totalGeneral = operadores.reduce((acc, o) => ({
    boletos: acc.boletos + (o.pagado.boletos || 0),
    monto: acc.monto + (o.pagado.monto || 0),
    compras: acc.compras + (o.pagado.compras || 0),
  }), { boletos: 0, monto: 0, compras: 0 });

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/admin" text="" />
          </IonButtons>
          <IonTitle>Reporte por usuario</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        <div className="reporteusr-container">
          <div className="admin-card">
            <h3 className="admin-card-titulo">
              <IonIcon icon={calendarNumberOutline} /> Rango de fechas
            </h3>
            <div className="admin-form-row">
              <div className="admin-form-campo">
                <label>Desde</label>
                <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="admin-form-campo">
                <label>Hasta</label>
                <input type="date" value={hasta} min={desde} max={hoyStr()} onChange={(e) => setHasta(e.target.value)} />
              </div>
            </div>
            <div className="rangos-rapidos">
              {RANGOS_RAPIDOS.map(r => (
                <button key={r.label} className="chip-rango" disabled={cargando}
                  onClick={() => { const [d, h] = r.calc(); aplicarRango(d, h); }}>
                  {r.label}
                </button>
              ))}
            </div>
            <IonButton expand="block" className="btn-generar-resumen" onClick={() => generar()} disabled={cargando || !desde || !hasta}>
              {cargando ? <IonSpinner name="crescent" /> : 'Generar reporte'}
            </IonButton>
            {error && <p className="admin-form-error">{error}</p>}
          </div>

          {buscado && operadores.length === 0 && !autogestionResumen && (
            <div className="admin-sin-datos-bloque">
              <IonText color="medium"><p>No hay ventas registradas en este rango.</p></IonText>
            </div>
          )}

          {operadores.length > 0 && (
            <div className="admin-card">
              <h3 className="admin-card-titulo">
                <IonIcon icon={peopleOutline} /> Total combinado ({operadores.length} operadores)
              </h3>
              <div className="resumen-kpis">
                <div className="resumen-kpi">
                  <IonIcon icon={ticketOutline} />
                  <span className="resumen-kpi-valor">{totalGeneral.boletos}</span>
                  <span className="resumen-kpi-label">Boletos pagados</span>
                </div>
                <div className="resumen-kpi">
                  <IonIcon icon={cashOutline} />
                  <span className="resumen-kpi-valor">${f2(totalGeneral.monto)}</span>
                  <span className="resumen-kpi-label">Recaudado</span>
                </div>
                <div className="resumen-kpi">
                  <IonIcon icon={receiptOutline} />
                  <span className="resumen-kpi-valor">{totalGeneral.compras}</span>
                  <span className="resumen-kpi-label">Compras</span>
                </div>
              </div>
            </div>
          )}

          {operadores.map((op, i) => {
            const idOp = `${op.id ?? 'sin-id'}-${i}`;
            const abierto = expandidoId === idOp;
            return (
              <div key={idOp} className="admin-card operador-card">
                <div className="operador-header" onClick={() => setExpandidoId(abierto ? null : idOp)}>
                  <div className="operador-info">
                    <span className="operador-nombre">{op.nombre || 'Sin nombre'}</span>
                    <span className="operador-perfil">{op.perfil || '—'}</span>
                  </div>
                  <div className="operador-totales">
                    <span className="operador-monto">${f2(op.pagado.monto)}</span>
                    <span className="operador-boletos">{op.pagado.boletos} boletos</span>
                  </div>
                  <IonIcon icon={abierto ? chevronUpOutline : chevronDownOutline} />
                </div>

                {abierto && (
                  <div className="operador-detalle">
                    {(op.pendiente.compras > 0 || op.comprobar.compras > 0) && (
                      <p className="operador-aviso">
                        Además tiene {op.pendiente.compras + op.comprobar.compras} compra(s) pendiente(s)/por comprobar
                        por ${f2((op.pendiente.monto || 0) + (op.comprobar.monto || 0))} (no incluidas arriba).
                      </p>
                    )}

                    {(op.eventos ?? []).length > 0 && (
                      <>
                        <h4 className="resumen-subtitulo">Por evento</h4>
                        {(op.eventos ?? []).map((ev, j) => (
                          <div key={j} className="resumen-fila">
                            <div className="resumen-fila-info">
                              <span className="resumen-fila-nombre">{ev.evento}</span>
                              <span className="resumen-fila-sub">{ev.compras} compras · {ev.boletos} boletos</span>
                            </div>
                            <span className="resumen-fila-monto">${f2(ev.monto)}</span>
                          </div>
                        ))}
                      </>
                    )}

                    {(op.formas_pago ?? []).length > 0 && (
                      <>
                        <h4 className="resumen-subtitulo">Por método de pago</h4>
                        {(op.formas_pago ?? []).map((fp, j) => (
                          <div key={j} className="resumen-fila">
                            <div className="resumen-fila-info">
                              <span className="resumen-fila-nombre">{fp.forma}</span>
                              <span className="resumen-fila-sub">{fp.compras} compras · {fp.boletos} boletos</span>
                            </div>
                            <span className="resumen-fila-monto">${f2(fp.monto)}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {autogestionResumen && (
            <div className="admin-card">
              <h3 className="admin-card-titulo">Autogestión (clientes que compraron solos)</h3>
              <div className="resumen-fila">
                <div className="resumen-fila-info">
                  <span className="resumen-fila-nombre">Pagado</span>
                  <span className="resumen-fila-sub">{autogestionResumen.pagado.compras} compras · {autogestionResumen.pagado.boletos} boletos</span>
                </div>
                <span className="resumen-fila-monto">${f2(autogestionResumen.pagado.monto)}</span>
              </div>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminReportePorUsuario;
