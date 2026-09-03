import { useState, useEffect } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonSpinner, IonIcon, IonCheckbox, IonToast,
} from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  checkmarkCircleOutline, openOutline, copyOutline, logoWhatsapp, qrCodeOutline, linkOutline,
  cameraOutline, cloudUploadOutline, receiptOutline, sparklesOutline, warningOutline,
} from 'ionicons/icons';
import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from '../utils/msLoginAuth';
import {
  obtenerMetodosPagoActivos, METODOS_CONFIGURABLES, calcularTotalConComision,
  type CategoriaMetodo,
} from '../utils/metodosPago';
import { obtenerStaffData } from '../utils/staffAuth';
import type { Cliente } from './VentaEvento';
import './Pago.css';

const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };
const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

interface PagoState {
  idLocalidad: string;
  codigoEvento: string;
  idPrecio: number;
  nombreEvento: string;
  localidadNombre: string;
  precio: number;
  cantidad: number;
  idSillas: number[];
  comisionBoleto: number;
  iva: string;
  cliente: Cliente | null;
}

interface MetodoItem { key: string; label: string; pct: number; desc: string; categoria: CategoriaMetodo; }

interface OcrExtracto {
  numero_comprobante?: string;
  referencia?: string;
  monto?: number;
  banco_emisor?: string;
  banco_receptor?: string;
  nombre_receptor?: string;
  fecha?: string;
  estado?: string;
  validacion?: { nivel_sospecha?: string; posible_adulteracion?: boolean; razones?: string[] };
}

const CUENTAS = [
  { banco: 'Banco Pichincha', valor: 'Pichincha', cuenta: '2100298093', ruc: '0993377293001', tipo: 'Corriente' },
  { banco: 'Banco Guayaquil',  valor: 'Guayaquil', cuenta: '18057352',   ruc: '0993377293001', tipo: 'Corriente' },
];

/* Host de imágenes que usa la web para el comprobante de depósito
   (Modalconfirmacion.js -> Obtenerlinkimagen) -- no es parte de
   MS-LOGIN-BOLETERIA, es un microservicio aparte. */
const URL_UPLOAD_IMG = 'https://codigomarret.online/upload/api/img';

/* Mismo endpoint de OCR que usa app_tickets (Pago.tsx del cliente) para
   leer automáticamente el número de comprobante de la foto -- vía Google
   Vision en flasapi_speed_comnet. Se manda la URL ya subida, no el
   archivo. guardar_bd:false para no duplicar el registro que ya guarda
   el propio comprobante en registraCompra/comprobantes_adicionales. */
const URL_OCR_COMPROBANTE = 'https://api.t-ickets.com/mikroti/Boleteria/imagenocr/analizar';

type Fase = 'seleccion' | 'comprobante' | 'exito';

const Pago: React.FC = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const st = (location.state as PagoState) ?? ({} as PagoState);
  const cliente = st.cliente;
  const staff = obtenerStaffData();

  const [metodo, setMetodo]     = useState('');
  const [metodosDisponibles, setMetodosDisponibles] = useState<MetodoItem[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState('');
  const [urlPago, setUrlPago]   = useState('');
  const [fase, setFase]         = useState<Fase>('seleccion');

  /* Solo aplica a métodos locales (Efectivo-Local/Tarjeta-Local/etc.) —
     mismo checkbox que ModalEfectivo.js en la web, pero "canjear" queda
     fijo en false por ahora: por indicación del negocio, ningún método
     de pago debe dejar el boleto canjeado desde la venta misma — el
     canje real se hace después, al ingresar al evento. */
  const [enviarCorreo, setEnviarCorreo] = useState(true);

  /* Duna (Deuna / Banco Pichincha): la web deja elegir si el link generado
     se devuelve como código QR (para que el cliente lo escanee con su
     propio teléfono) o como link para copiar/enviar por WhatsApp — mismo
     switch "canal" que ModalPago.js (Web = QR, cualquier otro valor =
     deeplink). Por defecto QR: el operador suele vender con su propio
     dispositivo, así que lo natural es mostrarle el QR al cliente. */
  const [dunaModo, setDunaModo] = useState<'qr' | 'link'>('qr');
  const [toast, setToast] = useState('');

  /* Transferencia/Depósito: igual que Modalconfirmacion.js en la web, tras
     crear la orden (queda "Pendiente") se pide el comprobante -- banco,
     número de transacción y foto -- y se adjunta con un registraPagos
     aparte (estado "Comprobar", pendiente de aprobación manual, nunca se
     autoaprueba desde la venta). */
  const [idRegistro, setIdRegistro]           = useState<number | null>(null);
  const [bancoComprobante, setBancoComprobante] = useState('');
  const [numeroTransaccion, setNumeroTransaccion] = useState('');
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState('');
  const [comprobanteUrl, setComprobanteUrl] = useState('');
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [errorComprobante, setErrorComprobante] = useState('');
  const [comprobanteAdjuntado, setComprobanteAdjuntado] = useState(false);

  /* Análisis automático del comprobante (igual que app_tickets): al elegir
     la foto se sube y se analiza con OCR para autocompletar banco/número,
     dejando los campos editables por si el operador necesita corregirlos. */
  const [analizandoOcr, setAnalizandoOcr] = useState(false);
  const [ocrResultado, setOcrResultado] = useState<OcrExtracto | null>(null);
  const [ocrError, setOcrError] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const activos = await obtenerMetodosPagoActivos(st.codigoEvento);
      const porMetodo = new Map(activos.map(a => [a.metodo, a]));
      const lista: MetodoItem[] = METODOS_CONFIGURABLES
        .filter(m => activos.length === 0 || porMetodo.get(m.key)?.activo)
        .map(m => {
          const pct = porMetodo.get(m.key)?.comision_porcentaje ?? m.pctDefault;
          return {
            key: m.key, label: m.label, pct, categoria: m.categoria,
            desc: pct > 0 ? `+${Math.round(pct * 100)}% comisión` : 'Sin comisión',
          };
        });
      if (cancelado) return;
      setMetodosDisponibles(lista);
      setMetodo(prev => prev || lista[0]?.key || '');
    })();
    return () => { cancelado = true; };
  }, [st.codigoEvento]);

  const met = metodosDisponibles?.find(x => x.key === metodo)
    ?? { key: '', label: '', pct: 0, desc: '', categoria: 'local' as CategoriaMetodo };
  const esLocal = met.categoria === 'local';
  const esTransferencia = met.categoria === 'transferencia';
  const esDuna = met.key === 'Duna';
  const esQrDuna = esDuna && dunaModo === 'qr';

  const precioNum   = Number(st.precio        || 0);
  const cantidadNum = Number(st.cantidad      || 1);
  const comBoleto   = Number(st.comisionBoleto || 0);
  const ivaRate      = parseFloat((st.iva || '1.00').replace('1.', '0.'));

  const { subtotal, comisionServicio, ivaImporte, comisionBancaria, total } =
    calcularTotalConComision(precioNum, cantidadNum, comBoleto, ivaRate, met.pct);

  const confirmar = async () => {
    if (!cliente) { setError('Falta el cliente de la venta.'); return; }
    setCargando(true);
    setError('');
    try {
      const payload = {
        id_usuario:  cliente.id || 0,
        id_operador: staff?.id || 0,
        cedula:      cliente.cedula || '',
        email:       cliente.email || '',
        forma_pago:  metodo,
        canal:       esQrDuna ? 'Web' : 'App Ventas',
        concierto: [{
          nombreConcierto:     st.nombreEvento    || '',
          id_localidad:        st.idLocalidad,
          idespaciolocalida:   st.idPrecio        || 0,
          CODIGEVENTO:         st.codigoEvento    || '',
          cantidad:            st.cantidad        || 1,
          localidad_nombre:    st.localidadNombre || '',
          localidad_precio:    st.precio          || 0,
          comision_por_boleto: comisionServicio.toFixed(2),
          iva:                 ivaImporte.toFixed(2),
          discapacida:         false,
          menor:               false,
          naipes:              false,
          id_sillas:           st.idSillas        || [],
        }],
        valores: {
          total:             total.toFixed(2),
          comision:          comisionServicio.toFixed(2),
          subtotal:          subtotal.toFixed(2),
          comision_bancaria: comisionBancaria.toFixed(2),
          description:       st.localidadNombre || '',
          iva:               ivaImporte.toFixed(2),
        },
        transaccion: '',
        ...(esLocal ? { canjear: false, enviar_correo: enviarCorreo } : {}),
      };

      const { data } = await axios.post(`${URL_BASE}/registraCompra`, payload, { headers: API_HDR });

      if (data.success || data.idRegistro) {
        if (data.url) setUrlPago(data.url);
        if (esTransferencia && data.idRegistro) {
          // La orden queda "Pendiente" en el backend -- se pide el
          // comprobante antes de dar la venta por terminada.
          setIdRegistro(data.idRegistro);
          setFase('comprobante');
        } else {
          setFase('exito');
          // En modo QR el "url" es la imagen del código, no una página
          // navegable -- no tiene sentido abrirla en el navegador del
          // operador, solo mostrarla para que el cliente la escanee.
          if (data.url && !esQrDuna) window.open(data.url, '_system');
        }
      } else {
        setError(data.message ?? 'No se pudo registrar la venta. Intenta de nuevo.');
      }
    } catch (err: unknown) {
      setError(
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : 'Error de conexión. Verifica tu internet e intenta de nuevo.'
      );
    } finally {
      setCargando(false);
    }
  };

  const copiarLink = () => {
    if (!urlPago) return;
    navigator.clipboard.writeText(urlPago)
      .then(() => setToast('Link de pago copiado.'))
      .catch(() => setToast('No se pudo copiar el link.'));
  };

  const enviarPorWhatsapp = () => {
    if (!urlPago) return;
    const digitos = (cliente?.movil || '').replace(/\D/g, '');
    if (!digitos) { setToast('El cliente no tiene celular registrado.'); return; }
    const numero = digitos.startsWith('593') ? digitos : `593${digitos.replace(/^0/, '')}`;
    const mensaje = `Hola${cliente?.nombreCompleto ? ' ' + cliente.nombreCompleto.split(' ')[0] : ''}, aquí tienes el link para completar el pago de tu entrada a ${st.nombreEvento || 'el evento'}: ${urlPago}`;
    window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensaje)}`, '_blank');
  };

  const elegirComprobante = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setComprobanteFile(file);
    setComprobantePreview(file ? URL.createObjectURL(file) : '');
    setComprobanteUrl('');
    setOcrResultado(null);
    setOcrError('');
    if (file) analizarComprobante(file);
  };

  const analizarComprobante = async (file: File) => {
    setAnalizandoOcr(true);
    setOcrError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const { data: subida } = await axios.post(URL_UPLOAD_IMG, form);
      if (!subida?.success || !subida?.url) {
        setOcrError('No se pudo subir la imagen para analizarla. Completa los datos manualmente.');
        return;
      }
      setComprobanteUrl(subida.url);

      const { data: ocrResp } = await axios.post(URL_OCR_COMPROBANTE,
        { url_imagen: subida.url, request_id: String(Date.now()), guardar_bd: false },
        { headers: { 'Content-Type': 'application/json' } });

      if (!ocrResp?.success && !ocrResp?.estado) {
        setOcrError('No se pudo analizar la imagen automáticamente. Completa los datos manualmente.');
        return;
      }

      const extraido: OcrExtracto = ocrResp.data ?? {};
      setOcrResultado(extraido);

      const numero = String(extraido.numero_comprobante || extraido.referencia || '').trim();
      if (numero) setNumeroTransaccion(numero);

      const bancoDetectado = String(extraido.banco_receptor || extraido.banco_emisor || '').toUpperCase();
      if (bancoDetectado.includes('PICHINCHA')) setBancoComprobante('Pichincha');
      else if (bancoDetectado.includes('GUAYAQUIL')) setBancoComprobante('Guayaquil');
    } catch {
      setOcrError('No se pudo analizar la imagen automáticamente. Completa los datos manualmente.');
    } finally {
      setAnalizandoOcr(false);
    }
  };

  const subirComprobante = async () => {
    if (!bancoComprobante) { setErrorComprobante('Selecciona el banco.'); return; }
    if (!numeroTransaccion.trim()) { setErrorComprobante('Ingresa el número de comprobante o transacción.'); return; }
    if (!comprobanteFile) { setErrorComprobante('Toma o selecciona una foto del comprobante.'); return; }
    if (!idRegistro) { setErrorComprobante('No se encontró el registro de la venta.'); return; }

    setSubiendoComprobante(true);
    setErrorComprobante('');
    try {
      // Si ya se subió al analizar con OCR, se reutiliza esa misma URL en
      // vez de volver a subir la misma foto dos veces.
      let urlImagen = comprobanteUrl;
      if (!urlImagen) {
        const form = new FormData();
        form.append('file', comprobanteFile);
        const { data: subida } = await axios.post(URL_UPLOAD_IMG, form);
        if (!subida?.success || !subida?.url) {
          setErrorComprobante('No se pudo subir la imagen del comprobante. Intenta de nuevo.');
          return;
        }
        urlImagen = subida.url;
      }

      const payload = {
        id: idRegistro,
        id_usuario:  cliente?.id || 0,
        id_operador: staff?.id || 0,
        forma_pago:  metodo,
        cedula:      cliente?.cedula || '',
        banco:       bancoComprobante,
        bancos:      bancoComprobante,
        link_comprobante: urlImagen,
        numeroTransaccion: numeroTransaccion.trim(),
        estado:      'Comprobar',
        total_pago:  total.toFixed(2),
      };
      const { data } = await axios.post(`${URL_BASE}/registraPagos`, payload, { headers: API_HDR });
      if (data.success) {
        setComprobanteAdjuntado(true);
        setFase('exito');
      } else {
        setErrorComprobante(data.message ?? 'No se pudo registrar el comprobante. Intenta de nuevo.');
      }
    } catch {
      setErrorComprobante('Error de conexión al subir el comprobante.');
    } finally {
      setSubiendoComprobante(false);
    }
  };

  const omitirComprobante = () => setFase('exito');

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="pago-toolbar">
          {fase === 'seleccion' && (
            <IonButtons slot="start">
              <IonBackButton defaultHref="/dashboard/vender" text="" />
            </IonButtons>
          )}
          <IonTitle>
            {fase === 'exito' ? 'Venta registrada'
              : fase === 'comprobante' ? 'Comprobante de depósito'
              : 'Confirmar venta'}
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="pago-content">

        {fase === 'exito' && (
          <div className="pago-exito">
            <IonIcon icon={checkmarkCircleOutline} className="pago-exito-icon" />
            <h2>¡Venta registrada!</h2>
            {esLocal && (
              <p>La entrada quedó pagada. {enviarCorreo ? 'Se envió al correo del cliente.' : ''}</p>
            )}
            {met.categoria === 'gateway' && !esQrDuna && (
              <p>Comparte el link de pago con el cliente para que complete el pago con tarjeta.</p>
            )}
            {esQrDuna && (
              <p>Pide al cliente que escanee este código QR con la app de Deuna o de su banco para completar el pago.</p>
            )}
            {esTransferencia && comprobanteAdjuntado && (
              <p>El comprobante quedó adjunto y la venta pendiente de aprobación manual.</p>
            )}
            {esTransferencia && !comprobanteAdjuntado && (
              <p>La venta quedó pendiente de aprobación hasta confirmar el depósito. Comparte estos datos con el cliente y adjunta el comprobante después desde el detalle de la compra:</p>
            )}
            {esTransferencia && !comprobanteAdjuntado && (
              <div className="cuentas-lista">
                {CUENTAS.map(c => (
                  <div key={c.banco} className="cuenta-item">
                    <span className="cuenta-banco">{c.banco} · {c.tipo}</span>
                    <span className="cuenta-num">Cuenta: {c.cuenta}</span>
                    <span className="cuenta-ruc">RUC: {c.ruc}</span>
                  </div>
                ))}
              </div>
            )}

            {esQrDuna && urlPago && (
              <div className="duna-qr-wrap">
                <img src={urlPago} alt="Código QR de pago Duna" className="duna-qr-img" />
              </div>
            )}

            {urlPago && !esQrDuna && (
              <IonButton className="btn-ir-pago" href={urlPago} target="_blank">
                <IonIcon icon={openOutline} slot="start" />
                Abrir link de pago
              </IonButton>
            )}

            {urlPago && !esQrDuna && (
              <div className="link-acciones-fila">
                <IonButton fill="outline" size="small" className="btn-link-accion" onClick={copiarLink}>
                  <IonIcon icon={copyOutline} slot="start" />
                  Copiar link
                </IonButton>
                <IonButton fill="outline" size="small" className="btn-link-accion" onClick={enviarPorWhatsapp}>
                  <IonIcon icon={logoWhatsapp} slot="start" />
                  Enviar por WhatsApp
                </IonButton>
              </div>
            )}
            <IonButton fill="outline" className="btn-volver-inicio"
              onClick={() => navigate('/dashboard/vender', { replace: true })}>
              Vender otra entrada
            </IonButton>
          </div>
        )}

        {fase === 'comprobante' && (
          <div className="pago-container">
            <div className="pago-card">
              <h3 className="pago-card-title">
                <IonIcon icon={receiptOutline} /> Comprobante del depósito
              </h3>
              <p className="comprobante-intro">
                La orden quedó registrada como pendiente. Adjunta el comprobante para que quede lista para aprobación,
                o continúa sin él y súbelo después desde el detalle de la compra.
              </p>

              <div className="cuentas-lista">
                {CUENTAS.map(c => (
                  <div key={c.banco} className="cuenta-item">
                    <span className="cuenta-banco">{c.banco} · {c.tipo}</span>
                    <span className="cuenta-num">Cuenta: {c.cuenta}</span>
                    <span className="cuenta-ruc">RUC: {c.ruc}</span>
                  </div>
                ))}
              </div>

              <div className="comprobante-campo">
                <label>Banco del depósito/transferencia</label>
                <div className="duna-modo-row">
                  {CUENTAS.map(c => (
                    <div key={c.valor}
                      className={`duna-modo-item ${bancoComprobante === c.valor ? 'duna-modo-sel' : ''}`}
                      onClick={() => setBancoComprobante(c.valor)}>
                      <span>{c.banco.replace('Banco ', '')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="comprobante-campo">
                <label htmlFor="numTransaccion">Número de comprobante / transacción</label>
                <input
                  id="numTransaccion"
                  className="comprobante-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej. 000123456"
                  value={numeroTransaccion}
                  onChange={(e) => setNumeroTransaccion(e.target.value)}
                />
              </div>

              <div className="comprobante-campo">
                <label>Foto del comprobante</label>
                <p className="comprobante-hint-compartir">
                  Sube el comprobante que genera la opción "Compartir" del banco o de Deuna, no una captura de pantalla —
                  ese trae toda la información necesaria (banco, monto, número de comprobante) y es más fácil de leer automáticamente.
                </p>
                <label className="btn-adjuntar-foto" htmlFor="fotoComprobante">
                  <IonIcon icon={comprobantePreview ? cloudUploadOutline : cameraOutline} />
                  {comprobantePreview ? 'Cambiar foto' : 'Tomar o elegir foto'}
                </label>
                <input
                  id="fotoComprobante"
                  className="comprobante-input-file"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={elegirComprobante}
                />
                {comprobantePreview && (
                  <img src={comprobantePreview} alt="Comprobante" className="comprobante-preview" />
                )}

                {analizandoOcr && (
                  <div className="ocr-analizando">
                    <IonSpinner name="crescent" />
                    <span>Analizando comprobante…</span>
                  </div>
                )}

                {!analizandoOcr && ocrError && (
                  <p className="ocr-error"><IonIcon icon={warningOutline} /> {ocrError}</p>
                )}

                {!analizandoOcr && ocrResultado && (
                  <div className="ocr-panel">
                    <div className="ocr-panel-titulo">
                      <IonIcon icon={sparklesOutline} /> Datos detectados automáticamente
                    </div>
                    {(ocrResultado.numero_comprobante || ocrResultado.referencia) && (
                      <div className="ocr-dato"><span>N° comprobante</span><span>{ocrResultado.numero_comprobante || ocrResultado.referencia}</span></div>
                    )}
                    {typeof ocrResultado.monto === 'number' && (
                      <div className="ocr-dato"><span>Monto</span><span>${ocrResultado.monto.toFixed(2)}</span></div>
                    )}
                    {(ocrResultado.banco_receptor || ocrResultado.banco_emisor) && (
                      <div className="ocr-dato"><span>Banco</span><span>{ocrResultado.banco_receptor || ocrResultado.banco_emisor}</span></div>
                    )}
                    {ocrResultado.fecha && (
                      <div className="ocr-dato"><span>Fecha</span><span>{ocrResultado.fecha}</span></div>
                    )}
                    {(ocrResultado.validacion?.posible_adulteracion || ocrResultado.validacion?.nivel_sospecha === 'alto') && (
                      <p className="ocr-sospecha">
                        <IonIcon icon={warningOutline} /> Esta imagen podría no ser válida o no coincide con las cuentas registradas — revísala antes de confirmar.
                      </p>
                    )}
                    <p className="ocr-hint">Verifica y corrige los campos de arriba si es necesario antes de adjuntar.</p>
                  </div>
                )}
              </div>

              {errorComprobante && <p className="pago-error">{errorComprobante}</p>}

              <IonButton expand="block" className="btn-confirmar" onClick={subirComprobante} disabled={subiendoComprobante}>
                {subiendoComprobante
                  ? <><IonSpinner name="crescent" className="btn-spinner" /> Subiendo…</>
                  : 'Adjuntar comprobante'}
              </IonButton>
              <IonButton expand="block" fill="clear" className="btn-omitir-comprobante"
                onClick={omitirComprobante} disabled={subiendoComprobante}>
                Continuar sin comprobante ahora
              </IonButton>
            </div>
          </div>
        )}

        {fase === 'seleccion' && (
          <div className="pago-container">

            <div className="pago-card">
              <h3 className="pago-card-title">Resumen de venta</h3>
              <p className="pago-evento-nombre">{st.nombreEvento || '—'}</p>
              <div className="pago-fila">
                <span className="pago-lbl">Cliente</span>
                <span className="pago-val">{cliente?.nombreCompleto || cliente?.cedula || '—'}</span>
              </div>
              <div className="pago-fila">
                <span className="pago-lbl">Localidad</span>
                <span className="pago-val">{st.localidadNombre || '—'}</span>
              </div>
              <div className="pago-fila">
                <span className="pago-lbl">Cantidad</span>
                <span className="pago-val">
                  {st.idSillas?.length
                    ? `${st.idSillas.length} asiento${st.idSillas.length > 1 ? 's' : ''}`
                    : `${cantidadNum} boleto${cantidadNum > 1 ? 's' : ''}`}
                </span>
              </div>
            </div>

            <div className="pago-card">
              <h3 className="pago-card-title">Método de pago</h3>
              {metodosDisponibles === null ? (
                <div className="metodos-loading"><IonSpinner name="crescent" /></div>
              ) : (
                <div className="metodos-lista">
                  {metodosDisponibles.map(m => (
                    <div key={m.key}
                      className={`metodo-item ${metodo === m.key ? 'metodo-sel' : ''}`}
                      onClick={() => setMetodo(m.key)}>
                      <div className={`radio-circle ${metodo === m.key ? 'radio-on' : ''}`} />
                      <div className="metodo-info">
                        <span className="metodo-lbl">{m.label}</span>
                        <span className="metodo-desc">{m.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {esLocal && (
                <div className="metodo-opciones">
                  <IonCheckbox checked={enviarCorreo} onIonChange={(e) => setEnviarCorreo(e.detail.checked)}>
                    Enviar entradas al correo
                  </IonCheckbox>
                </div>
              )}

              {esDuna && (
                <div className="metodo-opciones duna-modo-opciones">
                  <span className="duna-modo-label">¿Cómo quieres cobrar con Duna?</span>
                  <div className="duna-modo-row">
                    <div className={`duna-modo-item ${dunaModo === 'qr' ? 'duna-modo-sel' : ''}`}
                      onClick={() => setDunaModo('qr')}>
                      <IonIcon icon={qrCodeOutline} />
                      <span>Código QR</span>
                    </div>
                    <div className={`duna-modo-item ${dunaModo === 'link' ? 'duna-modo-sel' : ''}`}
                      onClick={() => setDunaModo('link')}>
                      <IonIcon icon={linkOutline} />
                      <span>Link para enviar</span>
                    </div>
                  </div>
                  <span className="duna-modo-hint">
                    {dunaModo === 'qr'
                      ? 'El cliente escanea el código con la app de Deuna o de su banco.'
                      : 'Comparte el link para que el cliente pague desde su teléfono.'}
                  </span>
                </div>
              )}
            </div>

            <div className="pago-card">
              <h3 className="pago-card-title">Detalle de precios</h3>
              <div className="pago-fila">
                <span className="pago-lbl">Subtotal</span>
                <span className="pago-val">${subtotal.toFixed(2)}</span>
              </div>
              {comisionServicio > 0 && (
                <div className="pago-fila">
                  <span className="pago-lbl">Servicio Em. por Boleto</span>
                  <span className="pago-val">${comisionServicio.toFixed(2)}</span>
                </div>
              )}
              {ivaImporte > 0 && (
                <div className="pago-fila">
                  <span className="pago-lbl">IVA ({Math.round(ivaRate * 100)}%)</span>
                  <span className="pago-val">${ivaImporte.toFixed(2)}</span>
                </div>
              )}
              {comisionBancaria > 0 && (
                <div className="pago-fila">
                  <span className="pago-lbl">Comisión ({Math.round(met.pct * 100)}%)</span>
                  <span className="pago-val">${comisionBancaria.toFixed(2)}</span>
                </div>
              )}
              <div className="pago-divider" />
              <div className="pago-fila pago-total-row">
                <span>TOTAL A COBRAR</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            {error && <p className="pago-error">{error}</p>}

            <IonButton expand="block" className="btn-confirmar"
              onClick={confirmar} disabled={cargando || !metodo}>
              {cargando
                ? <><IonSpinner name="crescent" className="btn-spinner" /> Registrando…</>
                : `Registrar venta  $${total.toFixed(2)}`
              }
            </IonButton>
          </div>
        )}

        <IonToast
          isOpen={!!toast}
          message={toast}
          duration={3000}
          position="top"
          onDidDismiss={() => setToast('')}
        />

      </IonContent>
    </IonPage>
  );
};

export default Pago;
