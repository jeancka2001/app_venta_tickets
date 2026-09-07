import { useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonIcon, IonSpinner, IonText, IonToast, IonActionSheet,
} from '@ionic/react';
import { refreshOutline } from 'ionicons/icons';
import { useLocation, useParams } from 'react-router-dom';
import {
  obtenerConfiguracionLocalidad, obtenerMapaLocalidad, claseAlineacion, enOrdenVisual,
  type ItemMapaLocalidad,
} from '../utils/localidadConfig';
import { cambiarEstadoAsiento, liberarAsientosAdmin } from '../utils/adminEventos';
import '../pages/Localidad.css';
import './AdminLocalidadAsientos.css';

/* Mismo mapa visual (agrupación por fila/mesa, alineación y orden desde
   la config del espacio, clases .fila-map/.mesa-map/.seat de Localidad.css)
   que usa el vendedor al comprar (Localidad.tsx) -- así el admin ve
   exactamente la misma estructura, no una lista aparte. La diferencia es
   la acción al tocar un asiento: acá abre un ActionSheet para
   bloquear/liberar en vez de agregarlo al carrito. */

interface EstadoState {
  localidadNombre?: string;
  tipoLocalidad?: string;
}

const sillaNum = (item: ItemMapaLocalidad, idx: number) =>
  item.silla?.split('-s-')[1] ?? String(idx + 1);

const agruparMesas = (items: ItemMapaLocalidad[]) => {
  const r: Record<string, Record<string, ItemMapaLocalidad[]>> = {};
  items.forEach(item => {
    const f = item.fila || 'A';
    const m = item.mesa || 'M1';
    if (!r[f]) r[f] = {};
    if (!r[f][m]) r[f][m] = [];
    r[f][m].push(item);
  });
  return r;
};

const agruparFilas = (items: ItemMapaLocalidad[]) => {
  const r: Record<string, ItemMapaLocalidad[]> = {};
  items.forEach((item, i) => {
    const k = item.fila || String.fromCharCode(65 + Math.floor(i / 20));
    if (!r[k]) r[k] = [];
    r[k].push(item);
  });
  return r;
};

const colsMesa = (n: number) => (n <= 6 ? n : n <= 10 ? 5 : 6);

const claseSeat = (item: ItemMapaLocalidad): string => {
  if (item.estado === 'disponible') return 'sc-disp';
  if (item.estado === 'reservado') return 'sc-res';
  if (item.estado === 'ocupado' && !item.cedula) return 'sc-bloq';
  return 'sc-ocp'; // ocupado con cédula -- venta real, bloqueado
};

const AdminLocalidadAsientos: React.FC = () => {
  const { idLocalidad } = useParams<{ codigoEvento: string; idLocalidad: string }>();
  const location = useLocation();
  const st = (location.state as EstadoState) ?? {};

  const [items, setItems] = useState<ItemMapaLocalidad[]>([]);
  const [resumen, setResumen] = useState({ total: 0, disponibles: 0, ocupadas: 0 });
  const [alineacionFilas, setAlineacionFilas] = useState<Record<string, string>>({});
  const [ordenSillasFilas, setOrdenSillasFilas] = useState<Record<string, boolean>>({});
  const [idEspacio, setIdEspacio] = useState<number | null>(null);
  const [zoom, setZoom] = useState(0.8);

  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [toast, setToast] = useState('');
  const [seleccionado, setSeleccionado] = useState<ItemMapaLocalidad | null>(null);

  const esMesa = st.tipoLocalidad === 'mesa';

  const cargar = useCallback(async (espacio: number) => {
    setCargando(true);
    const r = await obtenerMapaLocalidad(espacio, idLocalidad!);
    setItems(r.items);
    setResumen(r.resumen);
    setCargando(false);
  }, [idLocalidad]);

  useEffect(() => {
    if (!idLocalidad) return;
    obtenerConfiguracionLocalidad(idLocalidad).then(cfg => {
      setAlineacionFilas(cfg.alineacion);
      setOrdenSillasFilas(cfg.ordenSillas);
      setIdEspacio(cfg.idEspacio);
    });
  }, [idLocalidad]);

  useEffect(() => {
    if (idEspacio != null) cargar(idEspacio);
  }, [idEspacio, cargar]);

  const tocarAsiento = (item: ItemMapaLocalidad) => {
    if (item.estado === 'ocupado' && item.cedula) {
      setToast('No puedes editar este asiento: está ocupado por un cliente.');
      return;
    }
    setSeleccionado(item);
  };

  const bloquear = async () => {
    if (!seleccionado) return;
    setProcesando(true);
    try {
      const { ok } = await cambiarEstadoAsiento(seleccionado.idsilla, 'Ocupado');
      setToast(ok ? 'Asiento bloqueado.' : 'No se pudo bloquear el asiento.');
      if (ok && idEspacio != null) await cargar(idEspacio);
    } finally {
      setProcesando(false);
      setSeleccionado(null);
    }
  };

  const liberar = async () => {
    if (!seleccionado) return;
    setProcesando(true);
    try {
      const resultado = await liberarAsientosAdmin([seleccionado.idsilla]);
      if (resultado.success) {
        setToast('Asiento liberado.');
        if (idEspacio != null) await cargar(idEspacio);
      } else {
        setToast(resultado.message ?? 'No se pudo liberar el asiento.');
      }
    } finally {
      setProcesando(false);
      setSeleccionado(null);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/admin" text="" />
          </IonButtons>
          <IonTitle size="small">{st.localidadNombre || 'Asientos'}</IonTitle>
          <IonButtons slot="end">
            <button className="btn-refrescar-asientos" onClick={() => idEspacio != null && cargar(idEspacio)} disabled={cargando}>
              <IonIcon icon={refreshOutline} />
            </button>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="loc-content">
        {cargando && (
          <div className="loc-loading">
            <IonSpinner name="crescent" /><IonText><p>Cargando mapa...</p></IonText>
          </div>
        )}

        {!cargando && items.length === 0 && (
          <div className="loc-loading"><IonText color="medium"><p>No se encontraron asientos para esta localidad.</p></IonText></div>
        )}

        {!cargando && items.length > 0 && (
          <div className="map-section admin-seat-map">
            <div className="map-topbar">
              <p className="corr-desc">{resumen.disponibles} de {resumen.total} disponibles. Toca un asiento para bloquearlo o liberarlo.</p>
              <div className="legend">
                <span className="leg l-disp">Disponible</span>
                <span className="leg l-res">Reservada</span>
                <span className="leg leg-bloq">Bloqueada</span>
                <span className="leg l-ocp">Vendida</span>
              </div>
              <div className="zoom-bar">
                <button className="z-btn" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.15).toFixed(2)))}>−</button>
                <span className="z-pct">{Math.round(zoom * 100)}%</span>
                <button className="z-btn" onClick={() => setZoom(z => Math.min(3, +(z + 0.15).toFixed(2)))}>+</button>
              </div>
            </div>

            <div className="map-scroll">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <div className="map-canvas" style={{ zoom } as any}>

                {!esMesa && (
                  <div className="fila-map">
                    <div className="escenario">▲ ESCENARIO ▲</div>
                    {Object.entries(agruparFilas(items)).map(([f, filaItems]) => {
                      const disp = filaItems.filter(i => i.estado === 'disponible').length;
                      return (
                        <div key={f} className="fila-strip">
                          <div className="fila-tag">
                            <span>Fila {f}</span>
                            <small>{disp} disp.</small>
                          </div>
                          <div className="seats-inline" style={{ justifyContent: claseAlineacion(alineacionFilas, f) }}>
                            {enOrdenVisual(ordenSillasFilas, f, filaItems).map((item, idx) => (
                              <button key={item.idsilla}
                                className={`seat ${claseSeat(item)}`}
                                onClick={() => tocarAsiento(item)}
                                disabled={item.estado === 'ocupado' && !!item.cedula}>
                                {sillaNum(item, idx)}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {esMesa && (
                  <div className="mesa-map">
                    {Object.entries(agruparMesas(items)).map(([fila, mesas]) => (
                      <div key={fila} className="fila-section">
                        <div className="fila-title">Fila {fila}</div>
                        <div className="mesas-row">
                          {Object.entries(mesas).map(([mk, mesaItems]) => {
                            const disp = mesaItems.filter(i => i.estado === 'disponible').length;
                            const cols = colsMesa(mesaItems.length);
                            const llena = disp === 0;
                            return (
                              <div key={mk} className={`mesa-box ${llena ? 'mesa-box-llena' : ''}`}>
                                <div className="mesa-box-head">
                                  <span className="mesa-lbl">{mk}</span>
                                  <span className={`mesa-disp-cnt ${llena ? 'cnt-llena' : ''}`}>{llena ? 'Llena' : disp}</span>
                                </div>
                                <div className="mesa-seats" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                                  {mesaItems.map((item, idx) => (
                                    <button key={item.idsilla}
                                      className={`seat seat-sm ${claseSeat(item)}`}
                                      onClick={() => tocarAsiento(item)}
                                      disabled={item.estado === 'ocupado' && !!item.cedula}
                                      title={item.silla ?? mk}>
                                      {sillaNum(item, idx)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        <IonToast isOpen={!!toast} message={toast} duration={2500} position="top" onDidDismiss={() => setToast('')} />
      </IonContent>

      <IonActionSheet
        isOpen={!!seleccionado}
        header={seleccionado ? `Asiento ${seleccionado.silla} · ${seleccionado.estado}` : ''}
        buttons={[
          ...(seleccionado?.estado === 'disponible'
            ? [{ text: 'Bloquear (reservar sin venta)', handler: bloquear }]
            : [{ text: 'Liberar asiento', handler: liberar }]),
          { text: 'Cancelar', role: 'cancel' },
        ]}
        onDidDismiss={() => !procesando && setSeleccionado(null)}
      />
    </IonPage>
  );
};

export default AdminLocalidadAsientos;
