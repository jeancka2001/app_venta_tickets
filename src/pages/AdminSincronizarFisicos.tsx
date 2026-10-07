import { useState, useEffect, useCallback, useRef } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonFooter,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner, IonText, IonToast, IonAlert,
} from '@ionic/react';
import {
  refreshOutline, scanOutline, closeOutline, checkmarkCircleOutline,
  alertCircleOutline, warningOutline, saveOutline, playForwardOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import {
  obtenerConfiguracionLocalidad, obtenerMapaLocalidad, claseAlineacion, enOrdenVisual,
  type ItemMapaLocalidad,
} from '../utils/localidadConfig';
import { listarLocalidadesAdmin, type LocalidadAdmin } from '../utils/adminEventos';
import { sillaNum, agruparMesas, agruparFilas, colsMesa, claseSeat, etiquetaAsiento } from '../utils/mapaAsientos';
import { usePinchZoom, ZOOM_MAX, ZOOM_MIN } from '../utils/usePinchZoom';
import { escanearBoletoFisico } from '../utils/barcodeScanner';
import { sincronizarAsientosFisicos, verificarCodigoFisico } from '../utils/sincronizarFisicos';
import '../pages/Localidad.css';
import './AdminLocalidadAsientos.css';
import './AdminSincronizarFisicos.css';

/* "Sincronizar boletos físicos" (solo admin): el admin elige una localidad
   numerada, marca en el mapa los asientos que corresponden a boletos
   impresos con número correlativo y, en la lista de abajo, a cada asiento
   le escribe una cédula/texto (opcional) y le escanea el QR del boleto
   físico (opcional). Al guardar, cada asiento queda Ocupado -- en rojo si
   lleva cédula -- y con el mismo código del papel, sin crear una compra
   (ver utils/sincronizarFisicos.ts). */

interface FilaSync {
  item: ItemMapaLocalidad;
  cedula: string;
  codigo: string;
  verificando: boolean;
  /* Código ya revisado contra info-boleto + inventario (el que se manda). */
  codigoVerificado: string | null;
  seccion: string | null;
  filaAsiento: string | null;
  aviso: string;
  error: string;
}

const nuevaFila = (item: ItemMapaLocalidad): FilaSync => ({
  item, cedula: '', codigo: '', verificando: false, codigoVerificado: null,
  seccion: null, filaAsiento: null, aviso: '', error: '',
});

const esNumerada = (loc: LocalidadAdmin) =>
  !!loc.id_localidad && (loc.tipo_localidad === 'fila' || loc.tipo_localidad === 'mesa');

const AdminSincronizarFisicos: React.FC = () => {
  const { codigoEvento } = useParams<{ codigoEvento: string }>();

  const [localidades, setLocalidades] = useState<LocalidadAdmin[]>([]);
  const [cargandoLocalidades, setCargandoLocalidades] = useState(true);
  const [localidad, setLocalidad] = useState<LocalidadAdmin | null>(null);
  const [cambiarA, setCambiarA] = useState<LocalidadAdmin | null>(null);

  const [items, setItems] = useState<ItemMapaLocalidad[]>([]);
  const [alineacionFilas, setAlineacionFilas] = useState<Record<string, string>>({});
  const [ordenSillasFilas, setOrdenSillasFilas] = useState<Record<string, boolean>>({});
  const [idEspacio, setIdEspacio] = useState<number | null>(null);
  const [cargandoMapa, setCargandoMapa] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const mapScrollRef = useRef<HTMLDivElement>(null);

  const [filas, setFilas] = useState<FilaSync[]>([]);
  const filasRef = useRef<FilaSync[]>([]);
  filasRef.current = filas;
  const inputsCodigo = useRef<Record<number, HTMLInputElement | null>>({});

  const [escaneandoSecuencia, setEscaneandoSecuencia] = useState(false);
  const [confirmarGuardar, setConfirmarGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState('');
  const [resumenGuardado, setResumenGuardado] = useState<{ ok: number; fallidos: { etiqueta: string; mensaje: string }[] } | null>(null);

  const esMesa = localidad?.tipo_localidad === 'mesa';

  usePinchZoom(mapScrollRef, zoom, setZoom, !!localidad && !cargandoMapa && items.length > 0);

  useEffect(() => {
    if (!codigoEvento) return;
    setCargandoLocalidades(true);
    listarLocalidadesAdmin(codigoEvento).then(locs => {
      const numeradas = locs.filter(esNumerada);
      setLocalidades(numeradas);
      if (numeradas.length === 1) setLocalidad(numeradas[0]);
      setCargandoLocalidades(false);
    });
  }, [codigoEvento]);

  const cargarMapa = useCallback(async (espacio: number, idLocalidad: number) => {
    setCargandoMapa(true);
    const r = await obtenerMapaLocalidad(espacio, idLocalidad);
    setItems(r.items);
    setCargandoMapa(false);
  }, []);

  useEffect(() => {
    if (!localidad?.id_localidad) return;
    const idLocalidad = localidad.id_localidad;
    setItems([]);
    setIdEspacio(null);
    setCargandoMapa(true);
    obtenerConfiguracionLocalidad(idLocalidad).then(cfg => {
      setAlineacionFilas(cfg.alineacion);
      setOrdenSillasFilas(cfg.ordenSillas);
      setIdEspacio(cfg.idEspacio);
      if (cfg.idEspacio != null) cargarMapa(cfg.idEspacio, idLocalidad);
      else setCargandoMapa(false);
    });
  }, [localidad, cargarMapa]);

  const recargarMapa = () => {
    if (idEspacio != null && localidad?.id_localidad) cargarMapa(idEspacio, localidad.id_localidad);
  };

  const elegirLocalidad = (loc: LocalidadAdmin) => {
    if (loc.id === localidad?.id) return;
    if (filas.length > 0) { setCambiarA(loc); return; }
    setLocalidad(loc);
  };

  /* ── Selección en el mapa ── */
  const estaSeleccionado = (idsilla: number) => filas.some(f => f.item.idsilla === idsilla);

  const tocarAsiento = (item: ItemMapaLocalidad) => {
    if (estaSeleccionado(item.idsilla)) {
      setFilas(prev => prev.filter(f => f.item.idsilla !== item.idsilla));
      return;
    }
    if (item.estado !== 'disponible') {
      const detalle = [
        etiquetaAsiento(item, esMesa),
        item.estado,
        item.cedula ? `cédula ${item.cedula}` : null,
        item.id_registra_compra ? `código ${item.id_registra_compra}` : null,
      ].filter(Boolean).join(' · ');
      setToast(`${detalle} -- no se puede sincronizar.`);
      return;
    }
    setFilas(prev => [...prev, nuevaFila(item)]);
  };

  /* Tocar la etiqueta de una fila selecciona todos sus asientos libres (o
     los quita si ya estaban todos elegidos). */
  const tocarFila = (filaItems: ItemMapaLocalidad[]) => {
    const libres = filaItems.filter(i => i.estado === 'disponible');
    if (libres.length === 0) return;
    const todos = libres.every(i => estaSeleccionado(i.idsilla));
    if (todos) {
      const ids = new Set(libres.map(i => i.idsilla));
      setFilas(prev => prev.filter(f => !ids.has(f.item.idsilla)));
    } else {
      setFilas(prev => [...prev, ...libres.filter(i => !prev.some(f => f.item.idsilla === i.idsilla)).map(nuevaFila)]);
    }
  };

  const claseSeatSync = (item: ItemMapaLocalidad) =>
    estaSeleccionado(item.idsilla) ? 'sc-sel' : claseSeat(item);

  /* ── Lista de asientos elegidos ── */
  const actualizarFila = (idsilla: number, cambios: Partial<FilaSync>) =>
    setFilas(prev => prev.map(f => (f.item.idsilla === idsilla ? { ...f, ...cambios } : f)));

  const quitarFila = (idsilla: number) =>
    setFilas(prev => prev.filter(f => f.item.idsilla !== idsilla));

  const enfocarSiguienteSinCodigo = (despuesDe: number) => {
    const lista = filasRef.current;
    const idx = lista.findIndex(f => f.item.idsilla === despuesDe);
    const siguiente = lista.slice(idx + 1).find(f => !f.codigo.trim());
    if (siguiente) setTimeout(() => inputsCodigo.current[siguiente.item.idsilla]?.focus(), 50);
  };

  /* Revisa el código (duplicado en la lista, ya vinculado a otro asiento,
     vendido/anulado en el inventario) y lo deja listo para guardar.
     Devuelve true si quedó aceptado. */
  const asignarCodigo = async (idsilla: number, codigoCrudo: string): Promise<boolean> => {
    const codigo = codigoCrudo.trim();
    if (!codigo) {
      actualizarFila(idsilla, { codigo: '', codigoVerificado: null, seccion: null, filaAsiento: null, aviso: '', error: '' });
      return false;
    }
    const fila = filasRef.current.find(f => f.item.idsilla === idsilla);
    if (fila?.codigoVerificado === codigo && !fila.error) return true;
    if (fila?.verificando && fila.codigo.trim() === codigo) return false;

    const repetido = filasRef.current.find(f => f.item.idsilla !== idsilla && f.codigo.trim() === codigo);
    if (repetido) {
      actualizarFila(idsilla, {
        codigo, codigoVerificado: null, seccion: null, filaAsiento: null, aviso: '',
        error: `Ya lo escaneaste para ${etiquetaAsiento(repetido.item, esMesa)}.`,
      });
      return false;
    }

    actualizarFila(idsilla, { codigo, verificando: true, codigoVerificado: null, aviso: '', error: '' });
    const r = await verificarCodigoFisico(codigoEvento!, codigo);
    // Si mientras tanto se cambió o quitó el código de esta fila, se descarta.
    const actual = filasRef.current.find(f => f.item.idsilla === idsilla);
    if (!actual || actual.codigo.trim() !== codigo) return false;
    if (r.ok) {
      actualizarFila(idsilla, {
        verificando: false, codigoVerificado: codigo, seccion: r.seccion, filaAsiento: r.filaAsiento, aviso: r.aviso || '', error: '',
      });
      return true;
    }
    actualizarFila(idsilla, { verificando: false, codigoVerificado: null, seccion: null, filaAsiento: null, aviso: '', error: r.mensaje });
    return false;
  };

  const confirmarCodigoTecleado = async (idsilla: number, valor: string) => {
    const ok = await asignarCodigo(idsilla, valor);
    if (ok) enfocarSiguienteSinCodigo(idsilla);
  };

  const escanearParaFila = async (idsilla: number) => {
    const r = await escanearBoletoFisico();
    if (r.ok && r.codigo) {
      const ok = await asignarCodigo(idsilla, r.codigo);
      if (ok) enfocarSiguienteSinCodigo(idsilla);
    } else if (r.mensaje) {
      setToast(r.mensaje);
    }
  };

  /* Abre la cámara para cada asiento que todavía no tiene código, uno tras
     otro en el orden de la lista, hasta cerrar la cámara o terminar. */
  const escanearEnSecuencia = async () => {
    setEscaneandoSecuencia(true);
    try {
      for (;;) {
        const siguiente = filasRef.current.find(f => !f.codigo.trim());
        if (!siguiente) { setToast('Todos los asientos tienen código.'); break; }
        setToast(`Escanea el boleto para ${etiquetaAsiento(siguiente.item, esMesa)}`);
        const r = await escanearBoletoFisico();
        if (!r.ok || !r.codigo) { if (r.mensaje) setToast(r.mensaje); break; }
        const ok = await asignarCodigo(siguiente.item.idsilla, r.codigo);
        if (!ok) { setToast('Código rechazado -- revisa la lista.'); break; }
      }
    } finally {
      setEscaneandoSecuencia(false);
    }
  };

  /* ── Guardar ── */
  const pendientesVerificar = filas.some(f => f.verificando);
  const conError = filas.filter(f => !!f.error || (f.codigo.trim() !== '' && f.codigoVerificado !== f.codigo.trim()));
  const puedeGuardar = filas.length > 0 && !pendientesVerificar && conError.length === 0 && !guardando;
  const conCodigo = filas.filter(f => f.codigoVerificado).length;
  const conCedula = filas.filter(f => f.cedula.trim()).length;

  const guardar = async () => {
    if (!localidad?.id_localidad || !codigoEvento) return;
    setGuardando(true);
    const enviados = filasRef.current;
    const r = await sincronizarAsientosFisicos(codigoEvento, localidad.id_localidad, enviados.map(f => ({
      id_localidades_items: f.item.idsilla,
      codigo_barras: f.codigoVerificado,
      cedula: f.cedula.trim() || null,
      seccion: f.seccion,
    })));
    setGuardando(false);
    // Error de toda la petición (red, HTTP, sesión): en el diálogo, no en
    // un toast, para que se alcance a leer el detalle completo.
    if (!r.ok) {
      setResumenGuardado({ ok: 0, fallidos: [{ etiqueta: 'Petición', mensaje: r.mensaje }] });
      return;
    }

    // Sin detalle por asiento = todos OK (respuesta success:true plana).
    const porId = new Map(r.resultados.map(x => [Number(x.id_localidades_items), x]));
    const fallidos = enviados.filter(f => porId.size > 0 && !porId.get(f.item.idsilla)?.ok);
    const idsFallidos = new Set(fallidos.map(f => f.item.idsilla));
    // Mensaje del backend + en qué sentencia SQL falló (si la hubo).
    const mensajeDe = (idsilla: number) => {
      const res = porId.get(idsilla);
      const base = res?.message || 'No se pudo guardar este asiento (el backend no devolvió motivo).';
      return res?.detalle?.paso ? `${base} [paso: ${res.detalle.paso}]` : base;
    };
    setFilas(prev => prev
      .filter(f => idsFallidos.has(f.item.idsilla))
      .map(f => ({ ...f, error: mensajeDe(f.item.idsilla) })));
    setResumenGuardado({
      ok: enviados.length - fallidos.length,
      fallidos: fallidos.map(f => ({
        etiqueta: etiquetaAsiento(f.item, esMesa),
        mensaje: mensajeDe(f.item.idsilla),
      })),
    });
    recargarMapa();
  };

  /* ── Render ── */
  const renderEstadoFila = (f: FilaSync) => {
    if (f.verificando) return <span className="sync-estado sync-estado-cargando"><IonSpinner name="dots" /> Verificando código…</span>;
    if (f.error) return <span className="sync-estado sync-estado-error"><IonIcon icon={alertCircleOutline} /> {f.error}</span>;
    if (f.codigoVerificado) {
      const impreso = [f.seccion, f.filaAsiento ? `N.º ${f.filaAsiento}` : null].filter(Boolean).join(' · ');
      return (
        <>
          <span className="sync-estado sync-estado-ok">
            <IonIcon icon={checkmarkCircleOutline} /> QR listo{impreso ? ` · Impreso: ${impreso}` : ''}
          </span>
          {f.aviso && <span className="sync-estado sync-estado-aviso"><IonIcon icon={warningOutline} /> {f.aviso}</span>}
        </>
      );
    }
    return <span className="sync-estado">{f.cedula.trim() ? 'Se guardará con cédula (rojo), sin QR.' : 'Sin QR ni cédula: solo se marcará ocupado.'}</span>;
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/admin/evento/${codigoEvento}`} text="" />
          </IonButtons>
          <IonTitle size="small">Sincronizar boletos físicos</IonTitle>
          <IonButtons slot="end">
            <button className="btn-refrescar-asientos" onClick={recargarMapa} disabled={cargandoMapa || !localidad}>
              <IonIcon icon={refreshOutline} />
            </button>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="loc-content">
        <div className="sync-wrap">
          <p className="sync-intro">
            Elige la localidad numerada y marca en el mapa los asientos que vas a asignar a boletos físicos.
            Luego, en la lista, escribe la cédula (opcional) y escanea el QR de cada boleto impreso.
          </p>

          {/* ── 1. Localidad ── */}
          <div className="sync-card">
            <h3 className="sync-card-titulo">1. Localidad</h3>
            {cargandoLocalidades && <div className="sync-centro"><IonSpinner name="crescent" /></div>}
            {!cargandoLocalidades && localidades.length === 0 && (
              <p className="sync-vacio">Este evento no tiene localidades numeradas (fila/mesa) con mapa de asientos.</p>
            )}
            <div className="sync-chips">
              {localidades.map(loc => (
                <button key={loc.id}
                  className={`sync-chip ${localidad?.id === loc.id ? 'sync-chip-activo' : ''}`}
                  onClick={() => elegirLocalidad(loc)}>
                  {loc.localidad}
                  <small>{loc.tipo_localidad}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 2. Mapa ── */}
        {localidad && (
          <div className="map-section admin-seat-map sync-mapa">
            <h3 className="sync-card-titulo sync-titulo-mapa">2. Asientos en el mapa</h3>

            {cargandoMapa && (
              <div className="loc-loading"><IonSpinner name="crescent" /><IonText><p>Cargando mapa...</p></IonText></div>
            )}
            {!cargandoMapa && items.length === 0 && (
              <div className="loc-loading"><IonText color="medium"><p>No se encontraron asientos para esta localidad.</p></IonText></div>
            )}

            {!cargandoMapa && items.length > 0 && (
              <>
                <div className="map-topbar">
                  <div className="legend">
                    <span className="leg l-disp">Disponible</span>
                    <span className="leg l-sel">Elegida</span>
                    <span className="leg leg-bloq">Ocupada</span>
                    <span className="leg l-ocp">Con cédula</span>
                  </div>
                  <div className="zoom-bar">
                    <button className="z-btn" onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - 0.15).toFixed(2)))}>−</button>
                    <span className="z-pct">{Math.round(zoom * 100)}%</span>
                    <button className="z-btn" onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + 0.15).toFixed(2)))}>+</button>
                  </div>
                </div>
                <p className="corr-desc">
                  Toca los asientos para elegirlos (toca la fila para elegirla completa). Pellizca para hacer zoom.
                  {filas.length > 0 && <strong> {filas.length} elegido{filas.length > 1 ? 's' : ''}.</strong>}
                </p>

                <div className="map-scroll" ref={mapScrollRef}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <div className="map-canvas" style={{ zoom } as any}>
                    {!esMesa && (
                      <div className="fila-map">
                        <div className="escenario">▲ ESCENARIO ▲</div>
                        {Object.entries(agruparFilas(items)).map(([f, filaItems]) => {
                          const disp = filaItems.filter(i => i.estado === 'disponible').length;
                          return (
                            <div key={f} className="fila-strip">
                              <div className="fila-tag sync-fila-tag" onClick={() => tocarFila(filaItems)}>
                                <span>Fila {f}</span>
                                <small>{disp} disp.</small>
                              </div>
                              <div className="seats-inline" style={{ justifyContent: claseAlineacion(alineacionFilas, f) }}>
                                {enOrdenVisual(ordenSillasFilas, f, filaItems).map((item, idx) => (
                                  <button key={item.idsilla}
                                    className={`seat ${claseSeatSync(item)}`}
                                    onClick={() => tocarAsiento(item)}>
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
                                return (
                                  <div key={mk} className={`mesa-box ${disp === 0 ? 'mesa-box-llena' : ''}`}>
                                    <div className="mesa-box-head sync-fila-tag" onClick={() => tocarFila(mesaItems)}>
                                      <span className="mesa-lbl">{mk}</span>
                                      <span className={`mesa-disp-cnt ${disp === 0 ? 'cnt-llena' : ''}`}>{disp === 0 ? 'Llena' : disp}</span>
                                    </div>
                                    <div className="mesa-seats" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                                      {mesaItems.map((item, idx) => (
                                        <button key={item.idsilla}
                                          className={`seat seat-sm ${claseSeatSync(item)}`}
                                          onClick={() => tocarAsiento(item)}
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
              </>
            )}
          </div>
        )}

        {/* ── 3. Lista de asientos elegidos ── */}
        {localidad && filas.length > 0 && (
          <div className="sync-wrap">
            <div className="sync-card">
              <div className="sync-lista-head">
                <h3 className="sync-card-titulo">3. Boletos ({filas.length})</h3>
                <button className="sync-link" onClick={() => setFilas([])}>Quitar todos</button>
              </div>
              <p className="sync-hint">
                Escribe en el boleto impreso la fila y silla que indica cada tarjeta. La cédula pinta el asiento en rojo;
                el QR hace que el boleto físico abra este asiento al escanearlo.
              </p>
              <IonButton expand="block" fill="outline" size="small" onClick={escanearEnSecuencia}
                disabled={escaneandoSecuencia || guardando || filas.every(f => f.codigo.trim())}>
                <IonIcon icon={playForwardOutline} slot="start" />
                Escanear QR en secuencia
              </IonButton>

              {filas.map((f, i) => (
                <div key={f.item.idsilla} className={`sync-fila ${f.error ? 'sync-fila-error' : f.codigoVerificado ? 'sync-fila-ok' : ''}`}>
                  <div className="sync-fila-head">
                    <span className="sync-num">#{i + 1}</span>
                    <span className="sync-etiqueta">{etiquetaAsiento(f.item, esMesa)}</span>
                    <button className="sync-quitar" onClick={() => quitarFila(f.item.idsilla)} aria-label="Quitar">
                      <IonIcon icon={closeOutline} />
                    </button>
                  </div>
                  <input
                    className="sync-input"
                    type="text"
                    placeholder="Cédula o texto (opcional)"
                    value={f.cedula}
                    maxLength={60}
                    onChange={(e) => actualizarFila(f.item.idsilla, { cedula: e.target.value })}
                  />
                  <div className="sync-codigo-row">
                    <input
                      ref={(el) => { inputsCodigo.current[f.item.idsilla] = el; }}
                      className="sync-input"
                      type="text"
                      inputMode="text"
                      placeholder="QR / código del boleto físico (opcional)"
                      value={f.codigo}
                      disabled={f.verificando}
                      onChange={(e) => actualizarFila(f.item.idsilla, { codigo: e.target.value, codigoVerificado: null, error: '', aviso: '' })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarCodigoTecleado(f.item.idsilla, e.currentTarget.value); } }}
                      onBlur={(e) => { if (e.currentTarget.value.trim()) asignarCodigo(f.item.idsilla, e.currentTarget.value); }}
                    />
                    <IonButton className="sync-btn-camara" onClick={() => escanearParaFila(f.item.idsilla)} disabled={f.verificando || escaneandoSecuencia}>
                      <IonIcon icon={scanOutline} slot="icon-only" />
                    </IonButton>
                  </div>
                  <div className="sync-estado-wrap">{renderEstadoFila(f)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <IonToast isOpen={!!toast} message={toast} duration={2500} position="top" onDidDismiss={() => setToast('')} />
      </IonContent>

      {localidad && filas.length > 0 && (
        <IonFooter className="sync-footer">
          <IonButton expand="block" onClick={() => setConfirmarGuardar(true)} disabled={!puedeGuardar}>
            {guardando ? <IonSpinner name="crescent" /> : <><IonIcon icon={saveOutline} slot="start" /> Guardar {filas.length} asiento{filas.length > 1 ? 's' : ''}</>}
          </IonButton>
          {conError.length > 0 && !pendientesVerificar && (
            <p className="sync-footer-aviso">Corrige o borra los códigos marcados en rojo para poder guardar.</p>
          )}
        </IonFooter>
      )}

      <IonAlert
        isOpen={confirmarGuardar}
        header="Sincronizar asientos"
        message={`${filas.length} asiento(s) de ${localidad?.localidad ?? ''} quedarán ocupados: ${conCodigo} con QR del boleto físico y ${conCedula} con cédula.`}
        buttons={[
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Guardar', handler: () => { guardar(); } },
        ]}
        onDidDismiss={() => setConfirmarGuardar(false)}
      />

      <IonAlert
        isOpen={!!cambiarA}
        header="Cambiar de localidad"
        message="Se quitarán los asientos elegidos que todavía no guardaste."
        buttons={[
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Cambiar', handler: () => { setFilas([]); setLocalidad(cambiarA); } },
        ]}
        onDidDismiss={() => setCambiarA(null)}
      />

      <IonAlert
        isOpen={!!resumenGuardado}
        header={resumenGuardado?.fallidos.length ? 'Sincronización parcial' : 'Asientos sincronizados'}
        message={resumenGuardado
          ? `${resumenGuardado.ok} asiento(s) guardado(s).` + (resumenGuardado.fallidos.length
            ? ` No se guardaron: ${resumenGuardado.fallidos.map(x => `${x.etiqueta} (${x.mensaje})`).join('; ')}`
            : '')
          : ''}
        buttons={['OK']}
        onDidDismiss={() => setResumenGuardado(null)}
      />
    </IonPage>
  );
};

export default AdminSincronizarFisicos;
