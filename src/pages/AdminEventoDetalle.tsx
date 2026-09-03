import { useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner, IonText, IonBadge,
  IonInput, IonCheckbox, IonAlert, IonActionSheet, IonToast, IonModal,
} from '@ionic/react';
import {
  createOutline, swapHorizontalOutline, addOutline, trashOutline,
  saveOutline, chevronDownOutline, chevronUpOutline,
  downloadOutline, listOutline, closeOutline,
} from 'ionicons/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  listarEventosAdmin, listarLocalidadesAdmin, crearLocalidadAdmin,
  actualizarPrecioLocalidadAdmin, eliminarLocalidadAdmin, actualizarEstadoEvento,
  obtenerFacturaFinalEvento, ESTADOS_CAMBIABLES,
  type EventoAdmin, type LocalidadAdmin, type FacturaFinalEvento, type FacturaLocalidadItem,
} from '../utils/adminEventos';
import { generarYDescargarFacturaEvento } from '../utils/facturaEventoFinal';
import './AdminEventoDetalle.css';

/* Mismo criterio que normalizeIvaMultiplier() en Evetoespecifico.js: la
   columna eventos.iva guarda el multiplicador legado (1.15 = 15%), pero
   se tolera también un % entero (15) o ya-decimal (0.15) por si acaso. */
const normalizarIva = (raw?: string): number => {
  const n = parseFloat(raw ?? '');
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1 && n < 2) return n - 1;
  if (n >= 2) return n / 100;
  return n;
};

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const formatFecha = (fecha: string) => {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d} ${MESES[parseInt(m) - 1] ?? m} ${y}`;
};
const f2 = (n: number) => (Number(n) || 0).toFixed(2);

const estadoBadge: Record<string, string> = {
  ACTIVO: 'badge-activo',
  PROCESO: 'badge-proceso',
  PROXIMO: 'badge-proximo',
  CANCELADO: 'badge-cancelado',
  FINALIZADO: 'badge-finalizado',
};

const LOCALIDAD_VACIA = {
  localidad: '', precio_normal: '', precio_discapacidad: '', precio_tarjeta: '',
  precio_descuento: '', comision_boleto: '', habilitar_cortesia: '0', habilitar: '1',
};

const AdminEventoDetalle: React.FC = () => {
  const { codigoEvento } = useParams<{ codigoEvento: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [evento, setEvento] = useState<EventoAdmin | null>((location.state as { evento?: EventoAdmin } | null)?.evento ?? null);
  const [cargandoEvento, setCargandoEvento] = useState(!evento);

  const [localidades, setLocalidades] = useState<LocalidadAdmin[]>([]);
  const [cargandoLocalidades, setCargandoLocalidades] = useState(true);
  const [toast, setToast] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [elegirEstado, setElegirEstado] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState<LocalidadAdmin | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<LocalidadAdmin>>({});

  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [nueva, setNueva] = useState(LOCALIDAD_VACIA);

  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [resumen, setResumen] = useState<FacturaFinalEvento | null>(null);
  const [errorResumen, setErrorResumen] = useState('');
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [registrosModal, setRegistrosModal] = useState<FacturaLocalidadItem | null>(null);

  const cargarLocalidades = useCallback(async () => {
    if (!codigoEvento) return;
    setCargandoLocalidades(true);
    const lista = await listarLocalidadesAdmin(codigoEvento);
    setLocalidades(lista);
    setCargandoLocalidades(false);
  }, [codigoEvento]);

  useEffect(() => {
    if (!evento && codigoEvento) {
      setCargandoEvento(true);
      listarEventosAdmin().then(lista => {
        setEvento(lista.find(e => e.codigoEvento === codigoEvento) ?? null);
        setCargandoEvento(false);
      });
    }
  }, [codigoEvento, evento]);

  useEffect(() => { cargarLocalidades(); }, [cargarLocalidades]);

  const iniciarEdicion = (loc: LocalidadAdmin) => {
    setEditandoId(loc.id);
    setDraft({ ...loc });
  };

  const guardarEdicion = async () => {
    if (!draft.id) return;
    setProcesando(`editar-${draft.id}`);
    try {
      const resultado = await actualizarPrecioLocalidadAdmin({
        id_precios: draft.id,
        precio_normal: String(draft.precio_normal ?? ''),
        precio_discapacidad: String(draft.precio_discapacidad ?? ''),
        precio_tarjeta: String(draft.precio_tarjeta ?? ''),
        precio_descuento: String(draft.precio_descuento ?? ''),
        habilitar_cortesia: String(draft.habilitar_cortesia ?? '0'),
        comision_boleto: String(draft.comision_boleto ?? ''),
        mensaje_promocion: draft.mensaje_promocion,
      });
      if (resultado.success) {
        setToast('Localidad actualizada.');
        setEditandoId(null);
        await cargarLocalidades();
      } else {
        setToast(resultado.message ?? 'No se pudo actualizar la localidad.');
      }
    } finally {
      setProcesando(null);
    }
  };

  const eliminarLocalidad = async () => {
    if (!confirmarEliminar || !codigoEvento) return;
    setProcesando(`eliminar-${confirmarEliminar.id}`);
    try {
      const resultado = await eliminarLocalidadAdmin(codigoEvento, confirmarEliminar.localidad);
      if (resultado.success) { setToast('Localidad eliminada.'); await cargarLocalidades(); }
      else setToast(resultado.message ?? 'No se pudo eliminar la localidad.');
    } finally {
      setProcesando(null);
      setConfirmarEliminar(null);
    }
  };

  const agregarLocalidad = async () => {
    if (!codigoEvento) return;
    if (!nueva.localidad.trim() || !nueva.precio_normal.trim()) {
      setToast('Ingresa al menos el nombre y el precio normal.');
      return;
    }
    setProcesando('nueva');
    try {
      const resultado = await crearLocalidadAdmin({
        codigoEvento,
        localidad: nueva.localidad.trim(),
        precio_normal: nueva.precio_normal.trim(),
        precio_discapacidad: nueva.precio_discapacidad.trim() || nueva.precio_normal.trim(),
        precio_tarjeta: nueva.precio_tarjeta.trim() || nueva.precio_normal.trim(),
        precio_descuento: nueva.precio_descuento.trim() || nueva.precio_normal.trim(),
        habilitar_cortesia: nueva.habilitar_cortesia,
        comision_boleto: nueva.comision_boleto.trim() || '0',
        habilitar: nueva.habilitar,
      });
      if (resultado.success) {
        setToast('Localidad agregada.');
        setNueva(LOCALIDAD_VACIA);
        setMostrarNueva(false);
        await cargarLocalidades();
      } else {
        setToast(resultado.message ?? 'No se pudo agregar la localidad.');
      }
    } finally {
      setProcesando(null);
    }
  };

  const cambiarEstado = async (estado: string) => {
    if (!codigoEvento) return;
    setProcesando('estado');
    try {
      const resultado = await actualizarEstadoEvento(codigoEvento, estado);
      if (resultado.success) {
        setToast(`Estado cambiado a ${estado}.`);
        setEvento(prev => prev ? { ...prev, estado } : prev);
      } else {
        setToast(resultado.message ?? 'No se pudo cambiar el estado.');
      }
    } finally {
      setProcesando(null);
      setElegirEstado(false);
    }
  };

  const generarResumen = async () => {
    if (!evento) return;
    setCargandoResumen(true);
    setErrorResumen('');
    setResumen(null);
    try {
      const data = await obtenerFacturaFinalEvento(evento.codigoEvento);
      if (data.porFormaPago.length === 0 && data.porLocalidad.length === 0 && data.porOperador.length === 0) {
        setErrorResumen('Todavía no hay ventas pagadas registradas para este evento.');
        return;
      }
      setResumen(data);
    } catch {
      setErrorResumen('Error de conexión al generar el resumen.');
    } finally {
      setCargandoResumen(false);
    }
  };

  const ivaMultiplier = normalizarIva(evento?.iva);
  const ivaPercent = Math.round(ivaMultiplier * 100);

  const filasFactura = resumen?.porLocalidad ?? [];
  const totalBoletosFactura = filasFactura.reduce((acc, f) => acc + (f.cantidad || 0), 0);
  const subtotalFactura = filasFactura.reduce((acc, f) => acc + (f.subtotal_sin_iva || 0), 0);
  const ivaFactura = ivaMultiplier > 0 ? subtotalFactura * ivaMultiplier : 0;
  const totalFinalFactura = subtotalFactura + ivaFactura;

  const descargarPdf = async () => {
    if (!evento) return;
    setDescargandoPdf(true);
    try {
      const resultado = await generarYDescargarFacturaEvento({
        codigoEvento: evento.codigoEvento,
        nombreEvento: evento.nombreConcierto,
        ivaPercent,
        filas: filasFactura,
        totalBoletos: totalBoletosFactura,
        subtotal: subtotalFactura,
        iva: ivaFactura,
        total: totalFinalFactura,
      });
      setToast(resultado.ok ? 'Factura guardada en Documentos del teléfono.' : (resultado.mensaje ?? 'No se pudo generar la factura.'));
    } finally {
      setDescargandoPdf(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/admin" text="" />
          </IonButtons>
          <IonTitle>Detalle del evento</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        {cargandoEvento && (
          <div className="admin-loading"><IonSpinner name="crescent" /></div>
        )}

        {!cargandoEvento && !evento && (
          <div className="admin-loading"><IonText color="danger"><p>No se encontró el evento.</p></IonText></div>
        )}

        {!cargandoEvento && evento && (
          <div className="admin-detalle-container">

            {/* ── Resumen del evento ── */}
            <div className="admin-card">
              <div className="admin-evento-header">
                <h2 className="admin-evento-titulo">{evento.nombreConcierto}</h2>
                <IonBadge className={`badge-estado-evento ${estadoBadge[evento.estado] ?? 'badge-proceso'}`}>{evento.estado}</IonBadge>
              </div>
              <div className="admin-fila">
                <span className="admin-lbl">Fecha</span>
                <span className="admin-val">{formatFecha(evento.fechaConcierto)} · {evento.horaConcierto}</span>
              </div>
              <div className="admin-fila">
                <span className="admin-lbl">Lugar</span>
                <span className="admin-val">{evento.lugarConcierto}, {evento.cuidadConcert}</span>
              </div>
              <div className="admin-fila">
                <span className="admin-lbl">Código</span>
                <span className="admin-val">{evento.codigoEvento}</span>
              </div>

              <div className="admin-botones-fila">
                <IonButton fill="outline" size="small" className="btn-admin-accion"
                  onClick={() => navigate(`/admin/evento/${evento.codigoEvento}/editar`, { state: { evento } })}>
                  <IonIcon icon={createOutline} slot="start" /> Editar
                </IonButton>
                <IonButton fill="outline" size="small" className="btn-admin-accion"
                  onClick={() => setElegirEstado(true)} disabled={procesando === 'estado'}>
                  <IonIcon icon={swapHorizontalOutline} slot="start" /> Cambiar estado
                </IonButton>
              </div>
            </div>

            {/* ── Localidades ── */}
            <div className="admin-card">
              <h3 className="admin-card-titulo">Localidades ({localidades.length})</h3>

              {cargandoLocalidades && <div className="admin-loading-mini"><IonSpinner name="crescent" /></div>}

              {!cargandoLocalidades && localidades.length === 0 && (
                <p className="admin-sin-datos">Este evento todavía no tiene localidades.</p>
              )}

              {!cargandoLocalidades && localidades.map(loc => {
                const abierto = editandoId === loc.id;
                return (
                  <div key={loc.id} className="localidad-item">
                    <div className="localidad-header" onClick={() => abierto ? setEditandoId(null) : iniciarEdicion(loc)}>
                      <div className="localidad-info">
                        <span className="localidad-nombre">{loc.localidad}</span>
                        <span className="localidad-precio">${parseFloat(loc.precio_normal || '0').toFixed(2)}</span>
                      </div>
                      <IonIcon icon={abierto ? chevronUpOutline : chevronDownOutline} />
                    </div>

                    {abierto && (
                      <div className="localidad-editor">
                        <div className="admin-form-row">
                          <div className="admin-form-campo">
                            <label>Precio normal</label>
                            <input type="number" step="0.01" value={draft.precio_normal ?? ''}
                              onChange={(e) => setDraft(d => ({ ...d, precio_normal: e.target.value }))} />
                          </div>
                          <div className="admin-form-campo">
                            <label>Precio tarjeta</label>
                            <input type="number" step="0.01" value={draft.precio_tarjeta ?? ''}
                              onChange={(e) => setDraft(d => ({ ...d, precio_tarjeta: e.target.value }))} />
                          </div>
                        </div>
                        <div className="admin-form-row">
                          <div className="admin-form-campo">
                            <label>Precio discapacidad</label>
                            <input type="number" step="0.01" value={draft.precio_discapacidad ?? ''}
                              onChange={(e) => setDraft(d => ({ ...d, precio_discapacidad: e.target.value }))} />
                          </div>
                          <div className="admin-form-campo">
                            <label>Precio descuento</label>
                            <input type="number" step="0.01" value={draft.precio_descuento ?? ''}
                              onChange={(e) => setDraft(d => ({ ...d, precio_descuento: e.target.value }))} />
                          </div>
                        </div>
                        <div className="admin-form-campo">
                          <label>Comisión por boleto</label>
                          <input type="number" step="0.01" value={draft.comision_boleto ?? ''}
                            onChange={(e) => setDraft(d => ({ ...d, comision_boleto: e.target.value }))} />
                        </div>
                        <IonCheckbox
                          checked={draft.habilitar_cortesia === '1'}
                          onIonChange={(e) => setDraft(d => ({ ...d, habilitar_cortesia: e.detail.checked ? '1' : '0' }))}>
                          Habilitar cortesías
                        </IonCheckbox>

                        <div className="localidad-editor-acciones">
                          <IonButton size="small" className="btn-localidad-guardar" onClick={guardarEdicion}
                            disabled={procesando === `editar-${loc.id}`}>
                            {procesando === `editar-${loc.id}` ? <IonSpinner name="crescent" /> : <><IonIcon icon={saveOutline} slot="start" /> Guardar</>}
                          </IonButton>
                          <IonButton size="small" fill="outline" className="btn-localidad-eliminar"
                            onClick={() => setConfirmarEliminar(loc)} disabled={procesando === `eliminar-${loc.id}`}>
                            <IonIcon icon={trashOutline} slot="start" /> Eliminar
                          </IonButton>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {!mostrarNueva && (
                <IonButton expand="block" fill="outline" className="btn-agregar-localidad"
                  onClick={() => setMostrarNueva(true)}>
                  <IonIcon icon={addOutline} slot="start" /> Agregar localidad
                </IonButton>
              )}

              {mostrarNueva && (
                <div className="localidad-editor localidad-nueva">
                  <IonInput className="admin-input" fill="outline" label="Nombre de la localidad" labelPlacement="floating"
                    value={nueva.localidad} onIonInput={(e) => setNueva(n => ({ ...n, localidad: e.detail.value ?? '' }))} />
                  <div className="admin-form-row">
                    <div className="admin-form-campo">
                      <label>Precio normal</label>
                      <input type="number" step="0.01" value={nueva.precio_normal}
                        onChange={(e) => setNueva(n => ({ ...n, precio_normal: e.target.value }))} />
                    </div>
                    <div className="admin-form-campo">
                      <label>Comisión por boleto</label>
                      <input type="number" step="0.01" value={nueva.comision_boleto}
                        onChange={(e) => setNueva(n => ({ ...n, comision_boleto: e.target.value }))} />
                    </div>
                  </div>
                  <p className="admin-form-hint">Los precios de tarjeta/discapacidad/descuento usan el precio normal si los dejas vacíos.</p>
                  <div className="localidad-editor-acciones">
                    <IonButton size="small" className="btn-localidad-guardar" onClick={agregarLocalidad} disabled={procesando === 'nueva'}>
                      {procesando === 'nueva' ? <IonSpinner name="crescent" /> : 'Crear localidad'}
                    </IonButton>
                    <IonButton size="small" fill="clear" onClick={() => { setMostrarNueva(false); setNueva(LOCALIDAD_VACIA); }}>
                      Cancelar
                    </IonButton>
                  </div>
                </div>
              )}
            </div>

            {/* ── Factura de Venta Final ── */}
            <div className="admin-card">
              <div className="factura-header">
                <div>
                  <h3 className="factura-titulo">Factura de Venta Final</h3>
                  {resumen && (
                    <>
                      <p className="factura-sub">Evento: {evento.nombreConcierto}</p>
                      <p className="factura-sub">IVA aplicado a boletos: {ivaPercent}%</p>
                    </>
                  )}
                </div>
                {resumen && (
                  <IonButton size="small" className="btn-descargar-pdf" onClick={descargarPdf} disabled={descargandoPdf}>
                    {descargandoPdf ? <IonSpinner name="crescent" /> : <><IonIcon icon={downloadOutline} slot="start" /> Descargar PDF</>}
                  </IonButton>
                )}
              </div>

              {!resumen && (
                <IonButton expand="block" className="btn-generar-resumen" onClick={generarResumen} disabled={cargandoResumen}>
                  {cargandoResumen ? <IonSpinner name="crescent" /> : 'Generar factura final'}
                </IonButton>
              )}

              {errorResumen && <p className="admin-form-error">{errorResumen}</p>}

              {resumen && (
                <>
                  <h4 className="resumen-subtitulo factura-detalle-titulo">Detalle del evento</h4>

                  {filasFactura.length === 0 && <p className="admin-sin-datos">No hay boletos pagados todavía para este evento.</p>}

                  {filasFactura.map((f, i) => (
                    <div key={`${f.localidad}-${f.tarifa}-${i}`} className="factura-fila">
                      <div className="factura-fila-info">
                        <span className="factura-fila-nombre">{f.localidad} · {f.tarifa}</span>
                        <span className="factura-fila-sub">{f.cantidad} boletos × ${f2(f.precio_unitario_base)}</span>
                      </div>
                      <div className="factura-fila-derecha">
                        <span className="factura-fila-monto">${f2(f.subtotal_sin_iva)}</span>
                        {!!f.registros_origen?.length && (
                          <button className="btn-ver-registros" onClick={() => setRegistrosModal(f)}>
                            <IonIcon icon={listOutline} /> Ver registros
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {filasFactura.length > 0 && (
                    <div className="factura-totales">
                      <div className="factura-total-fila">
                        <span>TOTAL BOLETOS</span>
                        <span>{totalBoletosFactura} · ${f2(subtotalFactura)}</span>
                      </div>
                      {ivaFactura > 0 && (
                        <div className="factura-total-fila">
                          <span>IVA ({ivaPercent}%)</span>
                          <span>${f2(ivaFactura)}</span>
                        </div>
                      )}
                      <div className="factura-total-fila factura-total-final">
                        <span>TOTAL FINAL</span>
                        <span>${f2(totalFinalFactura)}</span>
                      </div>
                    </div>
                  )}

                  {(resumen.porFormaPago.length > 0 || resumen.porOperador.length > 0) && (
                    <>
                      <h4 className="resumen-subtitulo">Por método de pago</h4>
                      {resumen.porFormaPago.map(fp => (
                        <div key={fp.forma_pago} className="resumen-fila">
                          <div className="resumen-fila-info">
                            <span className="resumen-fila-nombre">{fp.forma_pago}</span>
                            <span className="resumen-fila-sub">{fp.cantidad} compras · {fp.boleto} boletos · IVA ${f2(fp.iva)}</span>
                          </div>
                          <span className="resumen-fila-monto">${f2(fp.total)}</span>
                        </div>
                      ))}

                      <h4 className="resumen-subtitulo">Por vendedor</h4>
                      {resumen.porOperador.length === 0 && <p className="admin-sin-datos">Sin ventas asignadas a un operador (autogestión / bot).</p>}
                      {resumen.porOperador.map((op, i) => (
                        <div key={`${op.operador}-${op.forma_pago}-${i}`} className="resumen-fila">
                          <div className="resumen-fila-info">
                            <span className="resumen-fila-nombre">{op.operador}</span>
                            <span className="resumen-fila-sub">{op.forma_pago} · {op.cantidad} compras · {op.boleto} boletos</span>
                          </div>
                          <span className="resumen-fila-monto">${f2(op.total)}</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </IonContent>

      <IonActionSheet
        isOpen={elegirEstado}
        header="Cambiar estado del evento"
        buttons={[
          ...ESTADOS_CAMBIABLES.map(e => ({ text: e, handler: () => cambiarEstado(e) })),
          { text: 'Cancelar', role: 'cancel' },
        ]}
        onDidDismiss={() => setElegirEstado(false)}
      />

      <IonAlert
        isOpen={!!confirmarEliminar}
        header="¿Eliminar esta localidad?"
        message={`Se eliminará "${confirmarEliminar?.localidad}" de este evento. Si ya hay boletos vendidos con esta localidad, no se tocan, pero quedarán sin precio asociado. Esta acción no se puede deshacer.`}
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setConfirmarEliminar(null) },
          { text: 'Sí, eliminar', role: 'destructive', handler: eliminarLocalidad },
        ]}
        onDidDismiss={() => setConfirmarEliminar(null)}
      />

      <IonToast isOpen={!!toast} message={toast} duration={2500} position="top" onDidDismiss={() => setToast('')} />

      <IonModal isOpen={!!registrosModal} onDidDismiss={() => setRegistrosModal(null)}
        breakpoints={[0, 0.6, 0.9]} initialBreakpoint={0.6}>
        <IonHeader>
          <IonToolbar className="admin-toolbar">
            <IonTitle>{registrosModal?.localidad} · {registrosModal?.tarifa}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setRegistrosModal(null)}>
                <IonIcon icon={closeOutline} slot="icon-only" />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="admin-content">
          <div className="registros-origen-lista">
            {(registrosModal?.registros_origen ?? []).map((r, i) => (
              <button key={`${r.id_registraCompra}-${i}`} className="registro-origen-item"
                onClick={() => { setRegistrosModal(null); navigate(`/detalle-compra/${r.id_registraCompra}`); }}>
                <div className="registro-origen-info">
                  <span className="registro-origen-id">Compra #{r.id_registraCompra}</span>
                  <span className="registro-origen-sub">{r.cedula || '—'} · {r.cantidad} boleto{r.cantidad === 1 ? '' : 's'}</span>
                </div>
                <span className="registro-origen-monto">${f2(r.subtotal_item)}</span>
              </button>
            ))}
          </div>
        </IonContent>
      </IonModal>
    </IonPage>
  );
};

export default AdminEventoDetalle;
