import { useState, useCallback, useEffect } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonSpinner, IonText, IonIcon,
} from '@ionic/react';
import {
  calendarNumberOutline, chevronDownOutline, chevronUpOutline, peopleOutline, cashOutline,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { obtenerReporteComisiones, type FilaComision } from '../utils/comisiones';
import { obtenerReporteVentas } from '../utils/reporteVentas';
import { obtenerVentasSinRegistro, opcionesEventos, srDeVendedor, type OpcionEvento, type ReporteSinRegistroResp } from '../utils/ventasSinRegistro';
import { obtenerStaffData, logoutStaff } from '../utils/staffAuth';
import './Comisiones.css';

const hoyStr = () => new Date().toISOString().slice(0, 10);
const inicioMesStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const RANGOS_RAPIDOS = [
  { label: 'Hoy', calc: (): [string, string] => [hoyStr(), hoyStr()] },
  { label: 'Últimos 7 días', calc: (): [string, string] => [new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), hoyStr()] },
  { label: 'Este mes', calc: (): [string, string] => [inicioMesStr(), hoyStr()] },
];

const f2 = (n: number | undefined | null) => (Number(n) || 0).toFixed(2);
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n}%`);
const tituloIdFor = (fila: FilaComision) => `f-${fila.id}`;

const filaVacia = (id: number, name: string, idNivel1: number | null | undefined, porcentaje: number | null | undefined): FilaComision => ({
  id, name, perfil: '', id_nivel1: idNivel1 ?? null, comision_porcentaje: porcentaje ?? null,
  ventas_propias: 0, cantidad_ventas_propias: 0, comision_directa: 0, comision_nivel1_porcentaje: null,
  comision_generada_nivel1: 0, nivel2: [], comision_nivel1_total: 0, comision_total: 0, detalle_por_evento: [],
});

/* "Comisiones de vendedores" -- misma fuente que TicketsWeb
   (ReporteComisiones/index.js), pero el backend ya devuelve solo lo que
   este usuario puede ver: admin/super_admin reciben TODOS los vendedores
   (árbol nivel1/nivel2, igual que la web); cualquier otro perfil recibe
   nada más que su propia fila -- si es nivel 1 (tiene hijos y % propio
   configurado) esa fila ya trae embebidos los nivel 2 a su cargo; si es
   nivel 2, solo su propia comisión. Un vendedor sin nada de esto configurado
   simplemente no aparece (estado vacío). */
const Comisiones: React.FC = () => {
  const navigate = useNavigate();
  const staff = obtenerStaffData();
  const esAdmin = staff?.perfil === 'admin' || staff?.perfil === 'super_admin';

  const [desde, setDesde] = useState(inicioMesStr());
  const [hasta, setHasta] = useState(hoyStr());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [filas, setFilas] = useState<FilaComision[]>([]);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  // Ventas de boletos fisicos sin registro (las carga un admin): tambien suman a las comisiones
  const [sr, setSr] = useState<ReporteSinRegistroResp | null>(null);
  const [codigoEvento, setCodigoEvento] = useState('');
  const [eventosOpc, setEventosOpc] = useState<OpcionEvento[]>([]);

  const generar = useCallback(async (d = desde, h = hasta, ev = codigoEvento) => {
    setCargando(true);
    setError('');
    setBuscado(false);
    const [resp, srResp, ventas] = await Promise.all([
      obtenerReporteComisiones(d, h, ev),
      obtenerVentasSinRegistro(d, h, ev),
      ev ? Promise.resolve(null) : obtenerReporteVentas(d, h).catch(() => null),
    ]);
    setSr(srResp && srResp.success ? srResp : null);
    if (!ev) {
      const nombres = ((ventas?.operadores ?? []).find(o => o.id === staff?.id)?.eventos ?? []).map(e => e.evento);
      setEventosOpc(opcionesEventos(nombres, ventas?.eventos_disponibles, srResp, esAdmin));
    }
    if (resp.sesion_expirada) {
      logoutStaff();
      navigate('/home', { replace: true });
      return;
    }
    if (!resp.success) {
      setError(resp.message || 'No se pudo generar el reporte.');
      setFilas([]);
    } else {
      setFilas(resp.data);
      setBuscado(true);
    }
    setCargando(false);
  }, [desde, hasta, codigoEvento, navigate, esAdmin, staff?.id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generar(inicioMesStr(), hoyStr(), ''); }, []);

  const aplicarRango = (d: string, h: string) => { setDesde(d); setHasta(h); setCodigoEvento(''); generar(d, h, ''); };
  const cambiarEvento = (ev: string) => { setCodigoEvento(ev); generar(desde, hasta, ev); };

  // Vendedores que solo tienen ventas sin registro no vienen en `filas`: se agregan para que tambien salgan
  const filasTodas: FilaComision[] = (() => {
    if (!sr) return filas;
    const ya = new Set(filas.map(f => f.id));
    const extra: FilaComision[] = [];
    if (esAdmin) {
      sr.vendedores.forEach(v => { if (!ya.has(v.id_vendedor) && (v.comision || 0) + (v.comision_nivel1 || 0) > 0) extra.push(filaVacia(v.id_vendedor, v.nombre, v.id_nivel1, v.comision_porcentaje)); });
    } else if (staff?.id && !ya.has(staff.id) && srDeVendedor(sr, staff.id, false)) {
      extra.push(filaVacia(staff.id, staff.name ?? 'Yo', null, null));
    }
    return [...filas, ...extra];
  })();
  const raices = esAdmin ? filasTodas.filter(f => !f.id_nivel1) : filasTodas;
  const sinRegistroDe = (id: number) => srDeVendedor(sr, id, esAdmin);
  const totalSinRegistro = esAdmin ? (sr?.totales?.comision_total ?? 0) : (staff?.id ? (sinRegistroDe(staff.id)?.comisionTotal ?? 0) : 0);
  const totalGeneral = filas.reduce((acc, f) => acc + (f.comision_total || 0), 0) + totalSinRegistro;
  // Lo que genera cada nivel 2 en ventas sin registro (admin: de la lista completa; vendedor: de su lista de nivel 2)
  const srNivel2 = (id: number) => {
    const v = sr?.vendedores.find(x => x.id_vendedor === id);
    if (v && esAdmin) return { total: v.total, genera: v.comision_nivel1 || 0, propia: v.comision };
    const n = sr?.nivel2.find(x => x.id_vendedor === id);
    return n ? { total: n.total, genera: n.comision_nivel1, propia: null as number | null } : null;
  };

  const renderNivel2 = (nivel2: FilaComision['nivel2']) => (
    <div className="comisiones-nivel2-lista">
      <h4 className="comisiones-subtitulo">
        <IonIcon icon={peopleOutline} /> Vendedores nivel 2 a cargo
      </h4>
      {nivel2.map(n2 => {
        const x = srNivel2(n2.id);
        return (
        <div key={n2.id} className="comisiones-nivel2-fila">
          <div className="comisiones-nivel2-info">
            <span className="comisiones-nivel2-nombre">{n2.name}</span>
            <span className="comisiones-nivel2-sub">
              Ventas propias: ${f2(n2.ventas)} ({n2.cantidad_ventas}) · {pct(n2.comision_porcentaje)}
            </span>
          </div>
          <div className="comisiones-nivel2-montos">
            <span>Comisión propia: ${f2(n2.comision_directa)}</span>
            <span className="comisiones-nivel2-genera">
              Te genera ({pct(n2.comision_nivel1_porcentaje)}): ${f2(n2.comision_generada_nivel1)}
            </span>
            {x && x.total > 0 && (
              <span className="comisiones-nivel2-genera">
                Sin registro: ${f2(x.total)} · te genera ${f2(x.genera)}
              </span>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );

  const renderFila = (fila: FilaComision, esRaiz: boolean) => {
    const abierto = !!expandido[tituloIdFor(fila)];
    const srf = sinRegistroDe(fila.id);
    return (
      <div key={fila.id} className="admin-card comisiones-card">
        <div className="comisiones-header">
          <div>
            {esAdmin && (
              <span className={`comisiones-badge ${esRaiz ? 'badge-nivel1' : 'badge-nivel2'}`}>
                {esRaiz ? 'Nivel 1' : 'Nivel 2'}
              </span>
            )}
            <strong className="comisiones-nombre">{fila.name}</strong>
            <span className="comisiones-perfil">{fila.perfil}</span>
          </div>
          <span className="comisiones-total-pill">${f2((fila.comision_total || 0) + (srf?.comisionTotal || 0))}</span>
        </div>

        <div className="comisiones-kpis">
          <div className="comisiones-kpi">
            <span className="comisiones-kpi-label">% propio</span>
            <span className="comisiones-kpi-valor">{pct(fila.comision_porcentaje)}</span>
          </div>
          <div className="comisiones-kpi">
            <span className="comisiones-kpi-label">Ventas propias</span>
            <span className="comisiones-kpi-valor">${f2(fila.ventas_propias)} <small>({fila.cantidad_ventas_propias})</small></span>
          </div>
          <div className="comisiones-kpi">
            <span className="comisiones-kpi-label">Comisión directa</span>
            <span className="comisiones-kpi-valor">${f2(fila.comision_directa)}</span>
          </div>
          {fila.nivel2.length > 0 && (
            <div className="comisiones-kpi">
              <span className="comisiones-kpi-label">Por nivel 2</span>
              <span className="comisiones-kpi-valor">${f2(fila.comision_nivel1_total)}</span>
            </div>
          )}
          {srf && (
            <>
              <div className="comisiones-kpi">
                <span className="comisiones-kpi-label">Ventas sin registro</span>
                <span className="comisiones-kpi-valor">${f2(srf.total)} <small>({srf.boletos} boletos)</small></span>
              </div>
              <div className="comisiones-kpi">
                <span className="comisiones-kpi-label">Comisión sin registro</span>
                <span className="comisiones-kpi-valor">${f2(srf.comisionTotal)}{srf.comisionNivel2 > 0 && <small> (incl. ${f2(srf.comisionNivel2)} por nivel 2)</small>}</span>
              </div>
            </>
          )}
        </div>

        {fila.nivel2.length > 0 && (
          <>
            <button className="comisiones-toggle" onClick={() => setExpandido(ex => ({ ...ex, [tituloIdFor(fila)]: !ex[tituloIdFor(fila)] }))}>
              {abierto ? 'Ocultar' : 'Ver'} vendedores nivel 2 ({fila.nivel2.length})
              <IonIcon icon={abierto ? chevronUpOutline : chevronDownOutline} />
            </button>
            {abierto && renderNivel2(fila.nivel2)}
          </>
        )}
      </div>
    );
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/reporte" text="" />
          </IonButtons>
          <IonTitle size="small">Comisiones</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        <div className="comisiones-container">
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

          {eventosOpc.length >= 2 && (
            <div className="admin-card">
              <h3 className="admin-card-titulo">Evento</h3>
              <select className="comisiones-select-evento" value={codigoEvento} disabled={cargando} onChange={(e) => cambiarEvento(e.target.value)}>
                <option value="">Todos los eventos ({eventosOpc.length})</option>
                {eventosOpc.map(e => <option key={e.codigo} value={e.codigo}>{e.nombre}</option>)}
              </select>
            </div>
          )}

          {buscado && filasTodas.length === 0 && !error && (
            <div className="admin-sin-datos-bloque">
              <IonText color="medium"><p>No hay comisiones registradas en este rango.</p></IonText>
            </div>
          )}

          {filasTodas.length > 0 && (
            <div className="admin-card">
              <h3 className="admin-card-titulo">
                <IonIcon icon={cashOutline} /> Total {esAdmin ? '(todos los niveles)' : 'a cobrar'}
              </h3>
              <span className="comisiones-total-general">${f2(totalGeneral)}</span>
              {totalSinRegistro > 0 && <small className="comisiones-nivel2-sub">Incluye ${f2(totalSinRegistro)} de ventas sin registro</small>}
            </div>
          )}

          {raices.map(f => renderFila(f, !f.id_nivel1))}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Comisiones;
