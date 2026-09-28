import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonFooter,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner, IonModal, IonToggle,
  IonSegment, IonSegmentButton, IonLabel, IonTextarea,
  useIonViewDidEnter, useIonViewWillLeave,
} from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import {
  scanOutline, ticketOutline, trashOutline, closeOutline, checkmarkCircle,
  alertCircle, warning, closeCircle, checkmarkDoneOutline, receiptOutline, chevronForwardOutline,
  keypadOutline, arrowUndoOutline,
} from 'ionicons/icons';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { escanearBoletoFisico } from '../utils/barcodeScanner';
import {
  consultarBoletoCanje, canjearEntrada, descanjearEntrada, estaCanjeado, type BoletoCanje,
} from '../utils/canjeBoletos';
import { obtenerStaffData } from '../utils/staffAuth';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './EscanearBoleto.css';
import './CanjearEntradas.css';

/* La misma pantalla sirve para canjear y para descanjear (selector arriba).
   Cada modo tiene su propia lista.
   Canjear -> pendiente: lista para canjear · yaCanjeado: estaba canjeada al
     escanear (o la canjeó otra puerta mientras tanto) · canjeado: hecho aquí
   Descanjear -> pendiente: canjeada, lista para descanjear · noCanjeado: no
     estaba canjeada · descanjeado: hecho aquí */
type Modo = 'canjear' | 'descanjear';
type EstadoItem = 'pendiente' | 'yaCanjeado' | 'canjeado' | 'noCanjeado' | 'descanjeado' | 'error';

interface ItemEscaneado {
  modo: Modo;
  codigo: string;
  boleto: BoletoCanje;
  estado: EstadoItem;
  mensaje?: string;
}

interface Aviso {
  tipo: 'rojo' | 'amarillo';
  titulo: string;
  mensaje: string;
}

const descripcionEntrada = (b: BoletoCanje): string => {
  const partes = [
    b.fila ? `Fila ${b.fila}` : null,
    b.silla ? `Silla ${b.silla}` : null,
  ].filter(Boolean);
  if (partes.length) return partes.join(' · ');
  if (b.numero_entrada) return `Entrada N.º ${b.numero_entrada}`;
  if (b.correlativo != null) return `Entrada N.º ${b.correlativo}`;
  return `Asiento #${b.id_item}`;
};

const localidadDe = (b: BoletoCanje) =>
  (b.nombre_localidad || b.localidad || '').replace(/__+/g, '').trim();

const vibrar = async (tipo: NotificationType) => {
  try { await Haptics.notification({ type: tipo }); } catch { /* web / sin soporte */ }
};

const CanjearEntradas: React.FC = () => {
  const navigate = useNavigate();
  const [modo, setModo] = useState<Modo>('canjear');
  const modoRef = useRef<Modo>(modo);
  modoRef.current = modo;
  const esDescanje = modo === 'descanjear';
  const [todosItems, setItems] = useState<ItemEscaneado[]>([]);
  const items = useMemo(() => todosItems.filter((i) => i.modo === modo), [todosItems, modo]);
  const [motivo, setMotivo] = useState('');
  const [codigoInput, setCodigoInput] = useState('');
  const [consultando, setConsultando] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [continuo, setContinuo] = useState(true);
  const continuoRef = useRef(continuo);
  continuoRef.current = continuo;
  const [confirmar, setConfirmar] = useState(false);
  const [canjeando, setCanjeando] = useState(false);
  const [resumen, setResumen] = useState<{ ok: number; fallidos: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /* Códigos ya en la lista o consultándose (clave "modo|código") -- ref para
     detectar el doble escaneo aunque la consulta anterior aún no haya
     respondido. */
  const codigosVistos = useRef<Set<string>>(new Set());
  const clave = (m: Modo, codigo: string) => `${m}|${codigo}`;

  const pendientes = items.filter((i) => i.estado === 'pendiente');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  /* ── Lectores de código de barras / QR (USB, Bluetooth, PDA) ──
     Se comportan como un teclado: "escriben" el código y casi siempre
     mandan Enter. Por eso el campo se enfoca solo al entrar a la pantalla y
     después de cada acción, y si algo le quitó el foco (un botón, el aviso),
     las teclas que lleguen se redirigen al campo igual. */
  /* El campo queda enfocado con inputMode="none": recibe lo que "teclea" el
     lector pero Android no muestra el teclado en pantalla. El botón de
     teclado lo cambia a "text" para escribir un código a mano. */
  const [tecladoVisible, setTecladoVisible] = useState(false);
  const tecladoVisibleRef = useRef(false);
  tecladoVisibleRef.current = tecladoVisible;

  const enfocarInput = () => setTimeout(() => {
    inputRef.current?.focus();
    if (!tecladoVisibleRef.current) Keyboard.hide().catch(() => { /* web */ });
  }, 50);

  const alternarTeclado = () => {
    const mostrar = !tecladoVisible;
    // El cambio de inputMode solo se aplica al volver a enfocar el campo.
    inputRef.current?.blur();
    setTecladoVisible(mostrar);
    tecladoVisibleRef.current = mostrar;
    setTimeout(() => {
      inputRef.current?.focus();
      if (mostrar) Keyboard.show().catch(() => { /* web / iOS */ });
      else Keyboard.hide().catch(() => { /* web */ });
    }, 80);
  };
  const paginaActiva = useRef(false);
  const confirmarRef = useRef(false);
  confirmarRef.current = confirmar;

  useIonViewDidEnter(() => { paginaActiva.current = true; enfocarInput(); });
  // Ionic deja la página montada al ir al detalle de compra: sin esto el
  // listener seguiría capturando teclas en otras pantallas.
  useIonViewWillLeave(() => { paginaActiva.current = false; });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!paginaActiva.current || confirmarRef.current) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
      const t = e.target as HTMLElement | null;
      if (t === inputRef.current) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setCodigoInput((prev) => prev + e.key);
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const mostrarAviso = (a: Aviso) => {
    setAviso(a);
    vibrar(a.tipo === 'rojo' ? NotificationType.Error : NotificationType.Warning);
  };

  /* Devuelve false si hubo un aviso (duplicado, ya canjeada, no encontrada)
     para cortar el escaneo continuo y que el operador lo vea. */
  const agregarCodigo = async (codigoRaw: string): Promise<boolean> => {
    const codigo = codigoRaw.trim();
    if (!codigo) return true;
    const m = modoRef.current;
    const k = clave(m, codigo);

    if (codigosVistos.current.has(k)) {
      const previo = itemsRef.current.find((i) => i.codigo === codigo);
      if (m === 'descanjear') {
        mostrarAviso({
          tipo: 'amarillo',
          titulo: 'Entrada escaneada dos veces',
          mensaje: previo?.estado === 'descanjeado'
            ? `El código ${codigo} ya fue descanjeado.`
            : `El código ${codigo} ya está en la lista.`,
        });
        return false;
      }
      if (previo && (previo.estado === 'canjeado' || previo.estado === 'yaCanjeado')) {
        mostrarAviso({
          tipo: 'rojo',
          titulo: 'Entrada YA CANJEADA',
          mensaje: `${descripcionEntrada(previo.boleto)} (código ${codigo}) ya fue canjeada. No permitir el ingreso.`,
        });
        return false;
      }
      mostrarAviso({
        tipo: 'amarillo',
        titulo: 'Entrada escaneada dos veces',
        mensaje: `El código ${codigo} ya está en la lista.`,
      });
      return false;
    }

    codigosVistos.current.add(k);
    setConsultando((n) => n + 1);
    const r = await consultarBoletoCanje(codigo);
    setConsultando((n) => n - 1);

    if (!r.ok) {
      codigosVistos.current.delete(k);
      mostrarAviso({ tipo: 'rojo', titulo: 'Entrada no válida', mensaje: `${r.mensaje} (${codigo})` });
      return false;
    }

    if (!r.boleto.id_ticket) {
      codigosVistos.current.delete(k);
      mostrarAviso({
        tipo: 'rojo',
        titulo: 'Entrada sin ticket',
        mensaje: `El asiento del código ${codigo} no tiene un ticket emitido (compra no pagada o sin generar).`,
      });
      return false;
    }

    const yaCanjeado = estaCanjeado(r.boleto);

    if (m === 'descanjear') {
      setItems((prev) => [
        { modo: m, codigo, boleto: r.boleto, estado: yaCanjeado ? 'pendiente' : 'noCanjeado' },
        ...prev,
      ]);
      if (!yaCanjeado) {
        mostrarAviso({
          tipo: 'amarillo',
          titulo: 'Entrada NO canjeada',
          mensaje: `${descripcionEntrada(r.boleto)} · ${localidadDe(r.boleto)} no está canjeada; no hay nada que descanjear.`,
        });
        return false;
      }
      setAviso(null);
      vibrar(NotificationType.Success);
      return true;
    }

    setItems((prev) => [
      { modo: m, codigo, boleto: r.boleto, estado: yaCanjeado ? 'yaCanjeado' : 'pendiente' },
      ...prev,
    ]);

    if (yaCanjeado) {
      mostrarAviso({
        tipo: 'rojo',
        titulo: 'Entrada YA CANJEADA',
        mensaje: `${descripcionEntrada(r.boleto)} · ${localidadDe(r.boleto)} ya fue canjeada. No permitir el ingreso.`,
      });
      return false;
    }

    setAviso(null);
    vibrar(NotificationType.Success);
    return true;
  };

  const enviarInput = async () => {
    const codigo = codigoInput.trim();
    if (!codigo) return;
    setCodigoInput('');
    await agregarCodigo(codigo);
    enfocarInput();
  };

  /* Lectores de código de barras que no mandan Enter: auto-envío al dejar
     de escribir (mismo patrón que EscanearBoleto.tsx). */
  useEffect(() => {
    if (!codigoInput.trim()) return;
    const t = setTimeout(() => enviarInput(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoInput]);

  /* Escaneo con cámara. En modo continuo la cámara se vuelve a abrir sola
     después de cada lectura correcta, para escanear varias entradas
     seguidas; se detiene al cancelar la cámara o si sale algún aviso. */
  const escanearConCamara = async () => {
    for (;;) {
      const escaneo = await escanearBoletoFisico();
      if (!escaneo.ok || !escaneo.codigo) {
        // Cerrar la cámara (atrás) llega sin mensaje: no es un error a mostrar.
        if (escaneo.mensaje) {
          mostrarAviso({ tipo: 'amarillo', titulo: 'Escáner', mensaje: escaneo.mensaje });
        }
        enfocarInput();
        return;
      }
      const siguio = await agregarCodigo(escaneo.codigo);
      if (!continuoRef.current || !siguio) { enfocarInput(); return; }
    }
  };

  const quitarItem = (codigo: string) => {
    codigosVistos.current.delete(clave(modo, codigo));
    setItems((prev) => prev.filter((i) => !(i.modo === modo && i.codigo === codigo)));
    enfocarInput();
  };

  const limpiarLista = () => {
    for (const i of items) codigosVistos.current.delete(clave(modo, i.codigo));
    setItems((prev) => prev.filter((i) => i.modo !== modo));
    setAviso(null);
    setResumen(null);
    enfocarInput();
  };

  const ejecutarCanje = async () => {
    setCanjeando(true);
    const staff = obtenerStaffData();
    const operador = { id: staff?.id, usuario: staff?.username ?? staff?.name, app: 'APP_VENTA_TICKETS' };
    let ok = 0;
    let fallidos = 0;

    for (const item of pendientes) {
      const info = {
        codigo: item.codigo,
        codigoEvento: item.boleto.codigoEvento,
        localidad: localidadDe(item.boleto),
        entrada: descripcionEntrada(item.boleto),
        operador,
      };
      const r = esDescanje
        ? await descanjearEntrada(item.boleto.id_ticket!, item.boleto.cedula ?? '', motivo.trim(), info)
        : await canjearEntrada(item.boleto.id_ticket!, item.boleto.cedula ?? '', info);
      if (r.ok) ok++; else fallidos++;
      const hecho: EstadoItem = esDescanje ? 'descanjeado' : 'canjeado';
      setItems((prev) => prev.map((i) => (i.modo !== item.modo || i.codigo !== item.codigo ? i
        : r.ok ? { ...i, estado: hecho, mensaje: undefined }
        : { ...i, estado: r.yaCanjeado ? 'yaCanjeado' : 'error', mensaje: r.mensaje })));
    }
    setMotivo('');

    setCanjeando(false);
    setConfirmar(false);
    setResumen({ ok, fallidos });
    vibrar(fallidos ? NotificationType.Warning : NotificationType.Success);
    enfocarInput();
  };

  /* Órdenes de compra de las entradas ya canjeadas (aquí o antes), para
     entrar al detalle y verificar si todas sus entradas están canjeadas. */
  const ordenes = useMemo(() => {
    const mapa = new Map<number, { id: number; nombre: string | null; cedula: string | null; escaneadas: number }>();
    for (const i of items) {
      const id = i.boleto.id_registraCompra;
      if (!id || !['canjeado', 'yaCanjeado', 'descanjeado'].includes(i.estado)) continue;
      const o = mapa.get(id) ?? { id, nombre: i.boleto.nombreCompleto ?? null, cedula: i.boleto.cedula, escaneadas: 0 };
      o.escaneadas++;
      mapa.set(id, o);
    }
    return [...mapa.values()];
  }, [items]);

  const cambiarModo = (nuevo: Modo) => {
    if (nuevo === modo || canjeando) return;
    setModo(nuevo);
    setAviso(null);
    setResumen(null);
    setCodigoInput('');
    enfocarInput();
  };

  const renderEstado = (i: ItemEscaneado) => {
    switch (i.estado) {
      case 'pendiente': return <span className="canje-chip chip-pendiente">{esDescanje ? 'Por descanjear' : 'Por canjear'}</span>;
      case 'descanjeado': return <span className="canje-chip chip-descanjeado"><IonIcon icon={arrowUndoOutline} /> Descanjeada</span>;
      case 'noCanjeado': return <span className="canje-chip chip-aviso"><IonIcon icon={warning} /> No está canjeada</span>;
      case 'canjeado': return <span className="canje-chip chip-canjeado"><IonIcon icon={checkmarkCircle} /> Canjeada</span>;
      case 'yaCanjeado': return <span className="canje-chip chip-rechazado"><IonIcon icon={closeCircle} /> Ya canjeada</span>;
      default: return <span className="canje-chip chip-rechazado"><IonIcon icon={alertCircle} /> {i.mensaje || 'Error'}</span>;
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="escaneo-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/buscar" text="" />
          </IonButtons>
          <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          <IonTitle size="small">{esDescanje ? 'Descanjear entradas' : 'Canjear entradas'}</IonTitle>
          {items.length > 0 && (
            <IonButtons slot="end">
              <IonButton onClick={limpiarLista} disabled={canjeando}>
                <IonIcon icon={trashOutline} slot="icon-only" />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
        <IonToolbar className="canje-modo-toolbar">
          <IonSegment
            value={modo}
            disabled={canjeando}
            onIonChange={(e) => cambiarModo(e.detail.value as Modo)}
            className={`canje-modo${esDescanje ? ' canje-modo-descanje' : ''}`}
          >
            <IonSegmentButton value="canjear">
              <IonIcon icon={checkmarkDoneOutline} />
              <IonLabel>Canjear</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="descanjear">
              <IonIcon icon={arrowUndoOutline} />
              <IonLabel>Descanjear</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent className="escaneo-content">
        <div className="canje-container">
          <div className="canje-scan-bar">
            <input
              ref={inputRef}
              className="canje-input"
              type="text"
              inputMode={tecladoVisible ? 'text' : 'none'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={tecladoVisible ? 'Escribe el código y presiona Enter' : 'Listo para escanear…'}
              value={codigoInput}
              disabled={canjeando}
              onChange={(e) => setCodigoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviarInput(); } }}
            />
            <IonButton
              className={`btn-teclado${tecladoVisible ? ' btn-teclado-activo' : ''}`}
              fill={tecladoVisible ? 'solid' : 'outline'}
              onClick={alternarTeclado}
              disabled={canjeando}
              aria-label={tecladoVisible ? 'Ocultar teclado' : 'Mostrar teclado'}
            >
              <IonIcon icon={keypadOutline} slot="icon-only" />
            </IonButton>
            <IonButton className="btn-camara" onClick={escanearConCamara} disabled={canjeando}>
              <IonIcon icon={scanOutline} slot="icon-only" />
            </IonButton>
          </div>
          <IonToggle
            className="canje-toggle"
            checked={continuo}
            onIonChange={(e) => setContinuo(e.detail.checked)}
            labelPlacement="end"
            justify="start"
          >
            Escaneo continuo (la cámara se vuelve a abrir tras cada entrada)
          </IonToggle>

          {aviso && (
            <div className={`canje-aviso aviso-${aviso.tipo}`} role="alert">
              <IonIcon icon={aviso.tipo === 'rojo' ? closeCircle : warning} className="canje-aviso-icono" />
              <div className="canje-aviso-texto">
                <strong>{aviso.titulo}</strong>
                <span>{aviso.mensaje}</span>
              </div>
              <button className="canje-aviso-cerrar" onClick={() => { setAviso(null); enfocarInput(); }} aria-label="Cerrar aviso">
                <IonIcon icon={closeOutline} />
              </button>
            </div>
          )}

          {resumen && (
            <div className={`canje-aviso ${resumen.fallidos ? 'aviso-amarillo' : 'aviso-verde'}`} role="status">
              <IonIcon icon={checkmarkDoneOutline} className="canje-aviso-icono" />
              <div className="canje-aviso-texto">
                <strong>{esDescanje ? 'Descanje terminado' : 'Canje terminado'}</strong>
                <span>
                  {resumen.ok} entrada{resumen.ok === 1 ? '' : 's'} {esDescanje ? 'descanjeada' : 'canjeada'}{resumen.ok === 1 ? '' : 's'}
                  {resumen.fallidos ? ` · ${resumen.fallidos} no se pudo ${esDescanje ? 'descanjear' : 'canjear'} (ver lista)` : ''}.
                </span>
              </div>
              <button className="canje-aviso-cerrar" onClick={() => { setResumen(null); enfocarInput(); }} aria-label="Cerrar">
                <IonIcon icon={closeOutline} />
              </button>
            </div>
          )}

          {consultando > 0 && (
            <div className="canje-consultando"><IonSpinner name="dots" /> Consultando entrada…</div>
          )}

          {items.length === 0 && consultando === 0 ? (
            <div className="escaneo-inicio">
              <IonIcon icon={esDescanje ? arrowUndoOutline : ticketOutline} className="escaneo-icono-grande" />
              <p className="escaneo-instrucciones">
                {esDescanje
                  ? <>Escanea las entradas <b>canjeadas</b> que quieres devolver a “sin canjear”. Al terminar presiona <b>Descanjear</b>.</>
                  : <>Escanea una o varias entradas (digitales o físicas). Se irán agregando a la lista; al terminar presiona <b>Canjear</b>.</>}
              </p>
            </div>
          ) : (
            <>
              <div className="canje-lista-titulo">
                Entradas escaneadas ({items.length}) · {pendientes.length} por {esDescanje ? 'descanjear' : 'canjear'}
              </div>
              <div className="canje-lista">
                {items.map((i) => (
                  <div key={i.codigo} className={`canje-item item-${i.estado}`}>
                    <div className="canje-item-info">
                      <div className="canje-item-titulo">{descripcionEntrada(i.boleto)}</div>
                      <div className="canje-item-sub">
                        {[localidadDe(i.boleto), i.boleto.concierto].filter(Boolean).join(' · ')}
                      </div>
                      <div className="canje-item-sub">
                        {i.boleto.cedula ? `C.I. ${i.boleto.cedula} · ` : ''}Código {i.codigo}
                      </div>
                      {renderEstado(i)}
                    </div>
                    {['pendiente', 'yaCanjeado', 'noCanjeado', 'error'].includes(i.estado) && !canjeando && (
                      <button className="canje-item-quitar" onClick={() => quitarItem(i.codigo)} aria-label="Quitar de la lista">
                        <IonIcon icon={closeOutline} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {ordenes.length > 0 && (
                <>
                  <div className="canje-lista-titulo">Órdenes de compra ({ordenes.length})</div>
                  <p className="canje-ordenes-hint">Entra a la orden para verificar el estado de canje de todas sus entradas.</p>
                  <div className="canje-ordenes">
                    {ordenes.map((o) => (
                      <button key={o.id} className="canje-orden" onClick={() => navigate(`/detalle-compra/${o.id}`)}>
                        <IonIcon icon={receiptOutline} className="canje-orden-icono" />
                        <span className="canje-orden-info">
                          <strong>Orden #{o.id}</strong>
                          <span>{[o.nombre, o.cedula ? `C.I. ${o.cedula}` : null].filter(Boolean).join(' · ')}</span>
                          <span>{o.escaneadas} entrada{o.escaneadas === 1 ? '' : 's'} escaneada{o.escaneadas === 1 ? '' : 's'} aquí</span>
                        </span>
                        <IonIcon icon={chevronForwardOutline} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </IonContent>

      <IonFooter className="canje-footer">
        <IonButton
          expand="block"
          className={esDescanje ? 'btn-descanjear' : 'btn-canjear'}
          disabled={pendientes.length === 0 || canjeando || consultando > 0}
          onClick={() => setConfirmar(true)}
        >
          <IonIcon icon={esDescanje ? arrowUndoOutline : checkmarkDoneOutline} slot="start" />
          {esDescanje ? 'Descanjear' : 'Canjear'} {pendientes.length > 0 ? `(${pendientes.length})` : ''}
        </IonButton>
      </IonFooter>

      <IonModal
        isOpen={confirmar}
        onDidDismiss={() => { if (!canjeando) setConfirmar(false); enfocarInput(); }}
        backdropDismiss={!canjeando}
        className="canje-modal"
      >
        <IonHeader>
          <IonToolbar className="escaneo-toolbar">
            <IonTitle>{esDescanje ? 'Confirmar descanje' : 'Confirmar canje'}</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="escaneo-content">
          <div className="canje-container">
            <p className="canje-confirmar-texto">
              {esDescanje
                ? <>Se van a <b>descanjear {pendientes.length}</b> entrada{pendientes.length === 1 ? '' : 's'}.
                    Volverán a quedar “sin canjear” y podrán usarse otra vez para ingresar.</>
                : <>Se van a canjear <b>{pendientes.length}</b> entrada{pendientes.length === 1 ? '' : 's'}.
                    Una vez canjeadas no se pueden volver a usar.</>}
            </p>
            {esDescanje && (
              <IonTextarea
                className="canje-motivo"
                fill="outline"
                label="Motivo (opcional)"
                labelPlacement="floating"
                autoGrow
                value={motivo}
                onIonInput={(e) => setMotivo(e.detail.value ?? '')}
              />
            )}
            <div className="canje-lista">
              {pendientes.map((i) => (
                <div key={i.codigo} className="canje-item item-pendiente">
                  <div className="canje-item-info">
                    <div className="canje-item-titulo">{descripcionEntrada(i.boleto)}</div>
                    <div className="canje-item-sub">
                      {[localidadDe(i.boleto), i.boleto.concierto].filter(Boolean).join(' · ')}
                    </div>
                    <div className="canje-item-sub">
                      {i.boleto.cedula ? `C.I. ${i.boleto.cedula} · ` : ''}Código {i.codigo}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </IonContent>
        <IonFooter className="canje-footer canje-footer-doble">
          <IonButton fill="outline" className="btn-cancelar-canje" disabled={canjeando} onClick={() => setConfirmar(false)}>
            Cancelar
          </IonButton>
          <IonButton className={esDescanje ? 'btn-descanjear' : 'btn-canjear'} disabled={canjeando} onClick={ejecutarCanje}>
            {canjeando ? <><IonSpinner name="crescent" /> {esDescanje ? 'Descanjeando…' : 'Canjeando…'}</> : 'Confirmar'}
          </IonButton>
        </IonFooter>
      </IonModal>
    </IonPage>
  );
};

export default CanjearEntradas;
