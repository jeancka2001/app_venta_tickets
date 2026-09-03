import { useState, useEffect, useRef } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonIcon, IonButton, IonSpinner, IonAlert,
  IonText, IonToast, IonModal, useIonViewWillLeave, useIonViewWillEnter,
} from '@ionic/react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { addOutline, removeOutline, cartOutline, chevronBackOutline, gridOutline, closeOutline, timeOutline } from 'ionicons/icons';
import axios from 'axios';
import { obtenerConfiguracionLocalidad, obtenerMapaLocalidad, claseAlineacion, enOrdenVisual } from '../utils/localidadConfig';
import { MS_LOGIN_AUTH_HEADERS } from '../utils/msLoginAuth';
import { obtenerStaffData } from '../utils/staffAuth';
import type { Cliente } from './VentaEvento';
import ZoomableImage from '../components/ZoomableImage';
import './Localidad.css';

/* Adaptado de app_tickets/src/pages/Localidad.tsx: mismo mapa de asientos,
   mismo temporizador de 3 min + refresco en vivo. Diferencia: acá quien
   "sostiene" la reserva es el CLIENTE que se buscó/creó en VentaEvento
   (st.cliente), no un usuario logueado en esta app — el logueado es el
   vendedor (staffAuth), que se manda como id_operador. */

const MAX_SEL = 10;
const TIEMPO_SELECCION_SEG = 180;
const POLL_MS = 15000;

const formatMMSS = (seg: number) => {
  const s = Math.max(0, seg);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const API_HDR = {
  ...MS_LOGIN_AUTH_HEADERS,
  'Content-Type': 'application/json',
};

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

interface SillaItem {
  numero?: string;
  fila?: string;
  mesa?: string;
  silla?: string;
  estado: string;
  idsilla: number;
  cedula?: string;
  id_registra_compra: string;
  detalle?: null;
}
interface Resumen { total: number; disponibles: number; ocupadas: number; }
interface LocalidadData {
  id: number;
  nombre: string;
  tipo: string;
  resumen: Resumen;
  items: SillaItem[];
}
interface NavState {
  nombre: string;
  precio: string;
  tipo: string;
  nombreEvento?: string;
  mapaConcierto?: string;
  codigoEvento?: string;
  idPrecio?: number;
  comisionBoleto?: string;
  iva?: string;
  cliente: Cliente | null;
}

const sillaNum = (item: SillaItem, idx: number) =>
  item.silla?.split('-s-')[1] ?? item.numero ?? String(idx + 1);

const agruparMesas = (items: SillaItem[]) => {
  const r: Record<string, Record<string, SillaItem[]>> = {};
  items.forEach(item => {
    const f = item.fila ?? 'A';
    const m = item.mesa ?? 'M1';
    if (!r[f]) r[f] = {};
    if (!r[f][m]) r[f][m] = [];
    r[f][m].push(item);
  });
  return r;
};

const agruparFilas = (items: SillaItem[]) => {
  const r: Record<string, SillaItem[]> = {};
  items.forEach((item, i) => {
    const k = item.fila ?? String.fromCharCode(65 + Math.floor(i / 20));
    if (!r[k]) r[k] = [];
    r[k].push(item);
  });
  return r;
};

const colsMesa = (n: number) => (n <= 6 ? n : n <= 10 ? 5 : 6);

const Localidad: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate  = useNavigate();
  const st = (location.state as NavState) ?? ({ cliente: null } as NavState);
  const cliente = st.cliente;
  const staff = obtenerStaffData();

  const [localidad, setLocalidad] = useState<LocalidadData | null>(null);
  const [cargando, setCargando]   = useState(true);
  const [sel, setSel]             = useState<SillaItem[]>([]);
  const [cantidad, setCantidad]   = useState(1);
  const [zoom, setZoom]           = useState(0.7);
  const [procesando, setProcesando] = useState<Set<number>>(new Set());
  const [toast, setToast]         = useState('');
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  const [alineacionFilas, setAlineacionFilas] = useState<Record<string, string>>({});
  const [ordenSillasFilas, setOrdenSillasFilas] = useState<Record<string, boolean>>({});
  const [idEspacio, setIdEspacio] = useState<number | null>(null);
  const [imagenBloques, setImagenBloques] = useState<string | null>(null);
  const [showBloques, setShowBloques] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(TIEMPO_SELECCION_SEG);

  const selRef        = useRef<SillaItem[]>([]);
  const corrActivoRef = useRef(false);
  const pagandoRef    = useRef(false);
  const idEspacioRef  = useRef<number | null>(null);
  const cargandoRef   = useRef(true);

  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const salioPorTiempoRef = useRef(false);

  useEffect(() => { selRef.current   = sel;      }, [sel]);
  useEffect(() => { idEspacioRef.current = idEspacio; }, [idEspacio]);
  useEffect(() => { cargandoRef.current = cargando; }, [cargando]);

  const precio = parseFloat(st.precio || '0');
  const tipo   = (st.tipo || 'correlativo').toLowerCase();
  const nombre = (st.nombre || '').replace(/__+/g, '').trim();

  const haySeleccionActiva = () =>
    tipo === 'correlativo' ? corrActivoRef.current : selRef.current.length > 0;

  const intentarSalir = () => {
    if (haySeleccionActiva()) setConfirmarSalir(true);
    else navigate(-1);
  };

  useEffect(() => {
    const handler = (ev: Event) => {
      (ev as CustomEvent<{ register: (priority: number, cb: () => void) => void }>)
        .detail.register(10, intentarSalir);
    };
    document.addEventListener('ionBackButton', handler);
    return () => document.removeEventListener('ionBackButton', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarLocalidad = (reconcile = false, silencioso = false) => {
    const esCorrelativo = tipo === 'correlativo';
    if (!esCorrelativo && idEspacioRef.current == null) return;
    if (silencioso && cargandoRef.current) return;

    if (!silencioso) setCargando(true);

    const promesa: Promise<LocalidadData | null> = esCorrelativo
      ? axios
          .get(`https://api.t-ickets.com/mikroti/Boleteria/localidades/${id}/todo`, {
            headers: { Authorization: 'Basic Ym9sZXRlcmlhOmJvbGV0ZXJpYQ==' },
          })
          .then(({ data }) => (data.estado ? (data.data as LocalidadData) : null))
      : obtenerMapaLocalidad(idEspacioRef.current!, id!).then((r) => ({
          id: Number(id),
          nombre: '',
          tipo,
          resumen: r.resumen,
          items: r.items,
        }));

    promesa
      .then((data) => {
        if (!data) return;
        setLocalidad(data);
        if (reconcile) {
          const freshItems: SillaItem[] = data.items ?? [];
          setSel(prev => prev.filter(s => {
            const fresh = freshItems.find(fi => fi.idsilla === s.idsilla);
            return fresh && fresh.estado !== 'disponible' && fresh.cedula === (cliente?.cedula ?? '');
          }));
        }
      })
      .catch(() => {})
      .finally(() => { if (!silencioso) setCargando(false); });
  };

  const detenerTemporizadores = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
  };

  const iniciarTemporizadores = () => {
    detenerTemporizadores();
    salioPorTiempoRef.current = false;
    setSegundosRestantes(TIEMPO_SELECCION_SEG);
    timerRef.current = setInterval(() => {
      setSegundosRestantes(s => Math.max(0, s - 1));
    }, 1000);
    pollRef.current = setInterval(() => {
      cargarLocalidad(true, true);
    }, POLL_MS);
  };

  useEffect(() => {
    if (segundosRestantes > 0 || salioPorTiempoRef.current) return;
    salioPorTiempoRef.current = true;
    detenerTemporizadores();
    setToast('Se acabó el tiempo para completar la selección. Vuelve a intentarlo.');
    navigate(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segundosRestantes]);

  useEffect(() => detenerTemporizadores, []);

  useEffect(() => {
    if (tipo === 'correlativo') cargarLocalidad(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tipo]);

  useEffect(() => {
    if (!st.codigoEvento) return;
    axios.get(`${URL_BASE}/imagenBloques/${st.codigoEvento}`, { headers: API_HDR })
      .then(({ data }) => {
        if (data?.success && data?.imagen_bloques) setImagenBloques(data.imagen_bloques);
      })
      .catch(() => {});
  }, [st.codigoEvento]);

  useEffect(() => {
    if (tipo === 'correlativo') return;
    obtenerConfiguracionLocalidad(id!).then(cfg => {
      setAlineacionFilas(cfg.alineacion);
      setOrdenSillasFilas(cfg.ordenSillas);
      setIdEspacio(cfg.idEspacio);
    });
  }, [id, tipo]);

  useEffect(() => {
    if (tipo === 'correlativo' || idEspacio == null) return;
    cargarLocalidad(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idEspacio, tipo]);

  useIonViewWillEnter(() => {
    pagandoRef.current = false;
    cargarLocalidad(true);
    iniciarTemporizadores();
  });

  useIonViewWillLeave(() => {
    detenerTemporizadores();
    if (pagandoRef.current) return;

    const cedulaPayload = cliente?.cedula || '';
    const cur = selRef.current;

    cur.forEach(item => {
      axios.post(
        `${URL_BASE}/selecionar_localidad_correlativa`,
        {
          cedula:   cedulaPayload,
          estado:   'disponible',
          id,
          cantidad: 1,
          mas:      'mas',
          mesa: [{
            id_silla: item.idsilla,
            id,
            cedula:   cedulaPayload,
            ...item,
            estado:   '',
          }],
        },
        { headers: API_HDR }
      ).catch(() => {});
    });

    if (corrActivoRef.current) {
      axios.post(
        `${URL_BASE}/selecionar_localidad_correlativa`,
        {
          id,
          cedula:      cedulaPayload,
          estado:      'reservado',
          cantidad:    0,
          mas:         'eliminar',
          id_usuario:  cliente?.id || 0,
          id_operador: staff?.id || 0,
        },
        { headers: API_HDR }
      ).catch(() => {});
      corrActivoRef.current = false;
    }
  });

  const toggleSilla = async (item: SillaItem) => {
    const cedulaPayload = cliente?.cedula || '';

    const { data } = await axios.post(
      `${URL_BASE}/selecionar_localidad_correlativa`,
      {
        cedula:   cedulaPayload,
        estado:   'disponible',
        id,
        cantidad: 1,
        mas:      'mas',
        mesa: [
          {
            id_silla: item.idsilla,
            id,
            cedula:   cedulaPayload,
            ...item,
            estado:   '',
          }
        ],
      },
      { headers: API_HDR }
    );

    if (data.success) {
      const reserved = Array.isArray(data.insert) && (data.insert as number[]).includes(item.idsilla);
      const released = Array.isArray(data.update) && (data.update as number[]).includes(item.idsilla);
      if (reserved) setSel(p => [...p, item]);
      if (released) setSel(p => p.filter(s => s.idsilla !== item.idsilla));
    } else {
      throw new Error(data.message ?? 'Error al reservar');
    }
  };

  const toggle = async (item: SillaItem) => {
    const isSel = sel.some(s => s.idsilla === item.idsilla);
    if (!isSel && item.estado !== 'disponible') return;
    if (procesando.has(item.idsilla)) return;
    if (!isSel && sel.length >= MAX_SEL) return;

    setProcesando(p => new Set([...p, item.idsilla]));
    try {
      await toggleSilla(item);
    } catch {
      setToast('Este asiento ya no está disponible. El mapa se ha actualizado.');
      cargarLocalidad(true);
    } finally {
      setProcesando(p => { const n = new Set(p); n.delete(item.idsilla); return n; });
    }
  };

  const cambiarCantidad = async (delta: 1 | -1) => {
    if (!localidad) return;
    const max  = Math.min(localidad.resumen.disponibles, MAX_SEL);
    const next = cantidad + delta;
    if (next < 1 || next > max) return;

    const mas: 'mas' | 'menos' = delta === 1 ? 'mas' : 'menos';
    setCantidad(next);

    try {
      await axios.post(
        `${URL_BASE}/selecionar_localidad_correlativa`,
        {
          id,
          cedula:      cliente?.cedula || '',
          estado:      'reservado',
          cantidad:    1,
          mas,
          id_usuario:  cliente?.id || 0,
          id_operador: staff?.id || 0,
        },
        { headers: API_HDR }
      );
      corrActivoRef.current = true;
    } catch {
      setCantidad(cantidad);
      setToast('Error al actualizar la reserva. Intenta de nuevo.');
    }
  };

  const seatClass = (item: SillaItem) => {
    if (sel.some(s => s.idsilla === item.idsilla)) return 'sc-sel';
    if (item.estado === 'disponible') return 'sc-disp';
    if (item.estado === 'reservado') return 'sc-res';
    return 'sc-ocp';
  };

  const bloqueada = (item: SillaItem) => {
    if (sel.some(s => s.idsilla === item.idsilla)) return false;
    return item.estado !== 'disponible' || sel.length >= MAX_SEL;
  };

  const cantCarrito  = tipo === 'correlativo' ? cantidad : sel.length;
  const totalCarrito = cantCarrito * precio;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="loc-toolbar">
          <IonButtons slot="start">
            <IonButton onClick={intentarSalir}>
              <IonIcon icon={chevronBackOutline} slot="icon-only" />
            </IonButton>
          </IonButtons>
          <IonTitle size="small">{nombre || 'Seleccionar asientos'}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="loc-content">

        <div className="cliente-chip">
          <span>Vendiendo a:</span> <strong>{cliente?.nombreCompleto || cliente?.cedula || '—'}</strong>
        </div>

        <div className={`temporizador-chip ${segundosRestantes <= 30 ? 'temporizador-critico' : ''}`}>
          <IonIcon icon={timeOutline} />
          <span>Tienes {formatMMSS(segundosRestantes)} para completar la selección</span>
        </div>

        {st.mapaConcierto && (
          <div className="venue-map">
            <p className="venue-label">Mapa del lugar</p>
            <img src={st.mapaConcierto} alt="Mapa" className="venue-img" />
          </div>
        )}

        {(imagenBloques || st.mapaConcierto) && (
          <div className="venue-bloques">
            <IonButton fill="outline" size="small" onClick={() => setShowBloques(true)}>
              <IonIcon icon={gridOutline} slot="start" />
              Ver bloques en el mapa
            </IonButton>
          </div>
        )}

        {cargando && (
          <div className="loc-loading">
            <IonSpinner name="crescent" /><IonText><p>Cargando...</p></IonText>
          </div>
        )}

        {!cargando && localidad && (
          <>
            {tipo === 'correlativo' && (
              <div className="corr-view">
                <p className="corr-desc">Boletos asignados automáticamente. Máx. {MAX_SEL}.</p>
                <div className="qty-row">
                  <button className="qty-btn" onClick={() => cambiarCantidad(-1)}>
                    <IonIcon icon={removeOutline} />
                  </button>
                  <span className="qty-num">{cantidad}</span>
                  <button className="qty-btn" onClick={() => cambiarCantidad(1)}>
                    <IonIcon icon={addOutline} />
                  </button>
                </div>
                <p className="price-line">
                  ${precio.toFixed(2)} × {cantidad} = <strong>${totalCarrito.toFixed(2)}</strong>
                </p>
              </div>
            )}

            {(tipo === 'fila' || tipo === 'mesa') && (
              <div className="map-section">
                <div className="map-topbar">
                  <p className="corr-desc">Seleccione boletos. Máx. {MAX_SEL}.</p>
                  <div className="legend">
                    <span className="leg l-disp">Disponible</span>
                    <span className="leg l-res">Reservada</span>
                    <span className="leg l-ocp">Ocupada</span>
                    <span className="leg l-sel">Seleccionada</span>
                  </div>
                  <div className="zoom-bar">
                    <button className="z-btn" onClick={() => setZoom(z => Math.max(0.4, +(z-0.15).toFixed(2)))}>−</button>
                    <span className="z-pct">{Math.round(zoom * 100)}%</span>
                    <button className="z-btn" onClick={() => setZoom(z => Math.min(3, +(z+0.15).toFixed(2)))}>+</button>
                  </div>
                </div>

                {sel.length >= MAX_SEL && (
                  <p className="max-warn">Máximo {MAX_SEL} asientos por venta</p>
                )}

                <div className="map-scroll">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <div className="map-canvas" style={{ zoom } as any}>

                    {tipo === 'fila' && (
                      <div className="fila-map">
                        <div className="escenario">▲ ESCENARIO ▲</div>
                        {Object.entries(agruparFilas(localidad.items)).map(([f, items]) => {
                          const disp = items.filter(i => i.estado === 'disponible').length;
                          return (
                            <div key={f} className="fila-strip">
                              <div className="fila-tag">
                                <span>Fila {f}</span>
                                <small>{disp} disp.</small>
                              </div>
                              <div className="seats-inline" style={{ justifyContent: claseAlineacion(alineacionFilas, f) }}>
                                {enOrdenVisual(ordenSillasFilas, f, items).map((item, idx) => (
                                  <button key={item.idsilla}
                                    className={`seat ${seatClass(item)} ${bloqueada(item) && item.estado === 'disponible' ? 'seat-blocked' : ''} ${procesando.has(item.idsilla) ? 'seat-loading' : ''}`}
                                    onClick={() => toggle(item)}
                                    disabled={bloqueada(item) || procesando.has(item.idsilla)}>
                                    {procesando.has(item.idsilla) ? '…' : sillaNum(item, idx)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {tipo === 'mesa' && (
                      <div className="mesa-map">
                        {Object.entries(agruparMesas(localidad.items)).map(([fila, mesas]) => (
                          <div key={fila} className="fila-section">
                            <div className="fila-title">Fila {fila}</div>
                            <div className="mesas-row">
                              {Object.entries(mesas).map(([mk, items]) => {
                                const disp   = items.filter(i => i.estado === 'disponible').length;
                                const selCnt = items.filter(i => sel.some(s => s.idsilla === i.idsilla)).length;
                                const cols   = colsMesa(items.length);
                                const llena  = disp === 0;
                                return (
                                  <div key={mk} className={`mesa-box ${llena ? 'mesa-box-llena' : selCnt > 0 ? 'mesa-box-sel' : ''}`}>
                                    <div className="mesa-box-head">
                                      <span className="mesa-lbl">{mk}</span>
                                      {selCnt > 0
                                        ? <span className="mesa-sel-cnt">{selCnt}★</span>
                                        : <span className={`mesa-disp-cnt ${llena ? 'cnt-llena' : ''}`}>
                                            {llena ? 'Llena' : `${disp}`}
                                          </span>
                                      }
                                    </div>
                                    <div className="mesa-seats"
                                      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                                      {items.map((item, idx) => (
                                        <button key={item.idsilla}
                                          className={`seat seat-sm ${seatClass(item)} ${bloqueada(item) && item.estado === 'disponible' ? 'seat-blocked' : ''} ${procesando.has(item.idsilla) ? 'seat-loading' : ''}`}
                                          onClick={() => toggle(item)}
                                          disabled={bloqueada(item) || procesando.has(item.idsilla)}
                                          title={item.silla ?? mk}>
                                          {procesando.has(item.idsilla) ? '…' : sillaNum(item, idx)}
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
          </>
        )}

        <div style={{ height: cantCarrito > 0 ? '88px' : '20px' }} />
      </IonContent>

      {cantCarrito > 0 && (
        <div className="cart-footer">
          <div className="cart-left">
            <IonIcon icon={cartOutline} className="cart-ico" />
            <div>
              <span className="cart-q">{cantCarrito}/{MAX_SEL} asientos</span>
              <span className="cart-t">${totalCarrito.toFixed(2)}</span>
            </div>
          </div>
          <IonButton className="btn-pay" onClick={() => {
            pagandoRef.current = true;
            navigate('/pago', {
              state: {
                idLocalidad:     id,
                codigoEvento:    st.codigoEvento   || '',
                idPrecio:        st.idPrecio        ?? 0,
                nombreEvento:    st.nombreEvento    || '',
                localidadNombre: nombre,
                precio,
                cantidad:        cantCarrito,
                idSillas:        tipo === 'correlativo' ? [] : sel.map(s => s.idsilla),
                comisionBoleto:  parseFloat(st.comisionBoleto || '0'),
                iva:             st.iva || '1.00',
                cliente,
              },
            });
          }}>
            Pagar
          </IonButton>
        </div>
      )}

      <IonToast
        isOpen={!!toast}
        message={toast}
        duration={3000}
        position="top"
        color="danger"
        onDidDismiss={() => setToast('')}
      />

      <IonModal isOpen={showBloques} onDidDismiss={() => setShowBloques(false)}
        breakpoints={[0, 1]} initialBreakpoint={1}>
        <IonHeader>
          <IonToolbar className="loc-toolbar">
            <IonTitle>División por bloques</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setShowBloques(false)}>
                <IonIcon icon={closeOutline} slot="icon-only" />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="loc-content" scrollY={false}>
          {(imagenBloques || st.mapaConcierto) && (
            <ZoomableImage src={imagenBloques || st.mapaConcierto || ''} alt="División por bloques" />
          )}
        </IonContent>
      </IonModal>

      <IonAlert
        isOpen={confirmarSalir}
        header="¿Salir sin terminar?"
        message="Vas a perder los asientos que seleccionaste."
        buttons={[
          { text: 'Seguir eligiendo', role: 'cancel' },
          { text: 'Salir', role: 'destructive', handler: () => navigate(-1) },
        ]}
        onDidDismiss={() => setConfirmarSalir(false)}
      />
    </IonPage>
  );
};

export default Localidad;
