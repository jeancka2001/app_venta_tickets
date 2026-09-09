import { useState, useEffect, useRef } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonSpinner, IonIcon, IonCheckbox, IonToast, IonAlert,
} from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  checkmarkCircleOutline, openOutline, copyOutline, logoWhatsapp, qrCodeOutline, linkOutline,
  cameraOutline, cloudUploadOutline, receiptOutline, sparklesOutline, warningOutline,
  shareSocialOutline, barcodeOutline, closeCircleOutline,
} from 'ionicons/icons';
import { Share } from '@capacitor/share';
import { escanearBoletoFisico } from '../utils/barcodeScanner';
import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from '../utils/msLoginAuth';
import {
  obtenerMetodosPagoActivos, METODOS_CONFIGURABLES, calcularTotalConComision,
  type CategoriaMetodo,
} from '../utils/metodosPago';
import { obtenerStaffData } from '../utils/staffAuth';
import { obtenerDescuentosVendedor, aplicarDescuento, type DescuentoVendedor } from '../utils/descuentos';
import type { Cliente } from './VentaEvento';
import './Pago.css';

const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };
const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

interface AsientoDetalle { idsilla: number; fila?: string; mesa?: string; silla?: string; }

interface PagoState {
  idLocalidad: string;
  codigoEvento: string;
  idPrecio: number;
  nombreEvento: string;
  localidadNombre: string;
  precio: number;
  cantidad: number;
  idSillas: number[];
  asientosDetalle?: AsientoDetalle[];
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

  /* Descuentos (%) que este vendedor puede aplicar a esta venta (uno solo
     por venta). El backend revalida y recalcula el total al registrar la
     compra -- aquí solo se muestra el neto y se manda `descuento:{id}`. */
  const [descuentos, setDescuentos] = useState<DescuentoVendedor[]>([]);
  const [descuentoSel, setDescuentoSel] = useState<number | null>(null);

  /* Boleto físico (impreso de antemano) para métodos locales: 'digital' =
     flujo de siempre. 'fisico' = se escanea/teclea el código de barras de
     cada boleto impreso, se busca contra el inventario subido desde
     Admin > Evento (mismo /api/v1/boletos_fisicos que en la web) solo
     para MOSTRAR qué sección/fila-asiento trae -- no se exige que
     coincida con la localidad elegida. Los códigos viajan igual que en
     la web dentro de "codigo_boletos" del propio registraCompra. */
  const [tipoBoleto, setTipoBoleto] = useState<'digital' | 'fisico'>('digital');
  const [codigoFisicoInput, setCodigoFisicoInput] = useState('');
  const [codigosFisicos, setCodigosFisicos] = useState<string[]>([]);
  const [seccionPorCodigo, setSeccionPorCodigo] = useState<Record<string, string>>({});
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const inputFisicoRef = useRef<HTMLInputElement>(null);

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
      // Se muestran SIEMPRE todos los métodos, para cualquier perfil
      // (vendedor, suscriptor o admin). El endpoint metodos_pago_activos
      // solo se usa para tomar la comisión configurada de cada método;
      // ya no se usa para ocultar métodos "inactivos".
      const lista: MetodoItem[] = METODOS_CONFIGURABLES.map(m => {
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

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const lista = await obtenerDescuentosVendedor(st.codigoEvento, staff?.id as number | undefined);
      if (cancelado) return;
      setDescuentos(lista);
      // Si el descuento elegido ya no está disponible, se limpia.
      setDescuentoSel(prev => (prev && lista.some(d => d.id === prev) ? prev : null));
    })();
    return () => { cancelado = true; };
  }, [st.codigoEvento, staff?.id]);

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

  /* `total` es el bruto (lo que va en valores.total; el backend le aplica
     el % del descuento). `totalACobrar` es lo que realmente paga el
     cliente -- se usa para mostrar y para el chequeo del OCR. */
  const descuentoActivo = descuentos.find(d => d.id === descuentoSel) ?? null;
  const { neto: totalACobrar, monto: montoDescuento } = descuentoActivo
    ? aplicarDescuento(total, descuentoActivo.porcentaje)
    : { neto: total, monto: 0 };

  /* Verificación local del comprobante leído por OCR contra lo que
     debería depositarse: el backend solo avisa de posible adulteración
     de la imagen, no si el monto/banco coinciden con ESTA venta -- eso
     solo lo sabe el frontend. Tolerancia de 1 centavo por redondeo. */
  const ocrAvisos: string[] = [];
  if (ocrResultado) {
    if (typeof ocrResultado.monto === 'number' && Math.abs(ocrResultado.monto - totalACobrar) > 0.01) {
      ocrAvisos.push(
        `El monto leído en el comprobante ($${ocrResultado.monto.toFixed(2)}) no coincide con el total a cobrar ($${totalACobrar.toFixed(2)}).`
      );
    }
    const bancoDetectado = String(ocrResultado.banco_receptor || ocrResultado.banco_emisor || '').toUpperCase();
    if (bancoDetectado && !CUENTAS.some(c => bancoDetectado.includes(c.valor.toUpperCase()))) {
      ocrAvisos.push(
        `El banco detectado (${ocrResultado.banco_receptor || ocrResultado.banco_emisor}) no coincide con ninguna de nuestras cuentas registradas.`
      );
    }
  }

  // Disponible para cualquier método, no solo los locales.
  const esFisico = tipoBoleto === 'fisico';

  // Cuántos boletos físicos caben en esta venta -- uno por asiento elegido
  // en el mapa, o la cantidad comprada si es una localidad sin asientos
  // numerados (correlativo, sin mapa). No se pueden escanear más que esto.
  const cantidadFisicaMax = st.idSillas?.length || cantidadNum;

  const normalizarTexto = (s?: string) => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

  /* Palabras de relleno que trae el texto libre del boleto impreso y que
     no aportan a la comparación ("Fila A, Asiento 1" -> nos interesan
     "a" y "1", no "fila"/"asiento"). No se listan letras sueltas: una
     fila puede llamarse "S" o "N". */
  const RELLENO_ASIENTO = new Set([
    'fila', 'filas', 'asiento', 'asientos', 'silla', 'sillas', 'mesa', 'mesas',
    'butaca', 'butacas', 'puesto', 'puestos', 'seat', 'row', 'numero', 'nro', 'num',
  ]);

  /* Tokens alfabéticos / numéricos sueltos del texto, sin relleno.
     "Fila A, Asiento 1" -> ["a","1"]; "A-s-1" -> ["a","1"];
     "Mesa 5 / Silla 3" -> ["5","3"]. */
  const tokensAsiento = (s?: string) =>
    (normalizarTexto(s).match(/[a-z]+|\d+/g) || []).filter(t => !RELLENO_ASIENTO.has(t));

  /* Número de asiento dentro de la etiqueta digital "<fila|mesa>-s-<n>"
     (formato del mapa, ver silla en la BD) o de un correlativo suelto. */
  const numeroDeSilla = (silla?: string): string => {
    const s = normalizarTexto(silla).replace(/\s+/g, '');
    if (s.includes('-s-')) return s.split('-s-').pop() || '';
    const m = s.match(/(\d+)$/);
    return m ? m[1] : '';
  };

  const mismoNumero = (a: string, b: string) =>
    a !== '' && b !== '' && /^\d+$/.test(a) && /^\d+$/.test(b) && parseInt(a, 10) === parseInt(b, 10);

  /* Compara lo que trae el boleto impreso (fila_asiento, texto libre del
     Excel) contra el asiento que se eligió en el mapa. Solo se miran la
     fila/mesa y el NÚMERO de asiento -- NO el nombre de la localidad ni
     el formato exacto de la etiqueta: la BD guarda "A-s-1" y el impreso
     dice "Fila A Asiento 1", así que un includes() directo nunca casa.
     Si no hay dato de asiento (correlativo) no hay nada que comparar. */
  const coincideConAsientoElegido = (filaAsiento: string, asiento?: AsientoDetalle): boolean => {
    if (!asiento) return true;
    const grupo = normalizarTexto(asiento.mesa || asiento.fila || (asiento.silla || '').split('-s-')[0]);
    const numero = numeroDeSilla(asiento.silla);
    if (!grupo && !numero) return true;

    const toks = tokensAsiento(filaAsiento);
    if (!toks.length) return false;

    const numeroOk = !numero || toks.some(t => mismoNumero(t, numero));
    const grupoOk = !grupo
      || toks.some(t => t === grupo || mismoNumero(t, grupo))
      // fila con letra que el impreso ni siquiera trae: no se puede
      // verificar, no vale la pena frenar al operador por eso.
      || (/^[a-z]+$/.test(grupo) && !toks.some(t => /^[a-z]+$/.test(t)));
    return numeroOk && grupoOk;
  };

  /* Boleto encontrado pero que NO coincide con el asiento elegido en el
     mapa -- se pide confirmación explícita antes de agregarlo. */
  const [alertaAsiento, setAlertaAsiento] = useState<{ codigo: string; seccion: string; filaAsiento: string } | null>(null);

  /* Busca un código en el inventario de boletos físicos de este evento
     (subido desde Admin > Evento en la web). Si matchea una sola sección
     Y coincide con el asiento que le corresponde según el orden en que
     se escaneó, se recuerda para descontarla del inventario y reemplazar
     el QR de ese asiento al confirmar. Si NO coincide, se pide
     confirmación antes de agregarlo (alertaAsiento). */
  const buscarBoletoFisico = async (codigo: string, indiceAsiento: number) => {
    if (!st.codigoEvento) return;
    setBuscandoCodigo(true);
    try {
      const { data } = await axios.get(`${URL_BASE}/boletos_fisicos/buscar`, {
        headers: API_HDR,
        params: { codigoEvento: st.codigoEvento, codigo_barras: codigo },
      });
      if (data?.success && Array.isArray(data.data) && data.data.length === 1) {
        const f = data.data[0];
        const asiento = st.asientosDetalle?.[indiceAsiento];
        if (asiento && !coincideConAsientoElegido(f.fila_asiento, asiento)) {
          setAlertaAsiento({ codigo, seccion: f.seccion, filaAsiento: f.fila_asiento || '' });
          return;
        }
        setSeccionPorCodigo(prev => ({ ...prev, [codigo]: f.seccion }));
        setToast(`Boleto encontrado: ${f.seccion}${f.fila_asiento ? ' · ' + f.fila_asiento : ''}`);
      } else if (data?.success && Array.isArray(data.data) && data.data.length > 1) {
        setToast(`Ese código existe en ${data.data.length} secciones -- se agrega igual, sin descontar del inventario.`);
      } else {
        setToast('No se encontró ese código en el inventario -- se agrega igual.');
      }
    } catch {
      // Silencioso: el código igual queda agregado a la venta.
    } finally {
      setBuscandoCodigo(false);
    }
  };

  const agregarCodigoFisico = (codigoDirecto?: string) => {
    const codigo = (codigoDirecto ?? codigoFisicoInput).trim();
    if (!codigo) return;
    setCodigoFisicoInput('');
    if (codigosFisicos.includes(codigo)) return;
    if (codigosFisicos.length >= cantidadFisicaMax) {
      setToast(`Ya escaneaste los ${cantidadFisicaMax} boleto${cantidadFisicaMax > 1 ? 's' : ''} de esta venta.`);
      return;
    }
    const indice = codigosFisicos.length;
    setCodigosFisicos(prev => [...prev, codigo]);
    buscarBoletoFisico(codigo, indice);
  };

  /* Auto-envío al dejar de escribir: los lectores de código de barras
     "escriben" el código carácter por carácter y casi siempre mandan
     Enter al terminar (eso ya lo cubre el onKeyDown del input, dispara
     al toque). Este temporizador es el respaldo para lectores que NO
     mandan Enter: si no entra ningún carácter nuevo en 600ms, se agrega
     solo. No molesta al tecleo manual -- una pausa de más de medio
     segundo entre letras al escribir a mano es rara. */
  useEffect(() => {
    if (tipoBoleto !== 'fisico' || !codigoFisicoInput.trim()) return;
    const temporizador = setTimeout(() => agregarCodigoFisico(), 600);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoFisicoInput, tipoBoleto]);

  /* Autoenfoca el campo apenas se elige "Físico", para poder escanear de
     inmediato sin tener que tocar el input primero. */
  useEffect(() => {
    if (tipoBoleto !== 'fisico') return;
    const t = setTimeout(() => inputFisicoRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [tipoBoleto]);

  /* Escaneo con la cámara del celular (@capacitor-mlkit/barcode-scanning) --
     complementa al lector de código de barras por teclado y al tecleo
     manual, que ya funcionan sin esto. */
  const escanearConCamara = async () => {
    const resultado = await escanearBoletoFisico();
    if (resultado.ok && resultado.codigo) {
      agregarCodigoFisico(resultado.codigo);
    } else if (resultado.mensaje) {
      setToast(resultado.mensaje);
    }
  };

  const quitarCodigoFisico = (codigo: string) => {
    setCodigosFisicos(prev => prev.filter(c => c !== codigo));
    setSeccionPorCodigo(prev => {
      const next = { ...prev };
      delete next[codigo];
      return next;
    });
  };

  /* Marca en el inventario los códigos que matchearon una sola sección y
     canjea la compra completa (el boleto impreso ya es la prueba de
     entrada). Best-effort tras registrar la venta: si algo falla aquí no
     se revierte la venta ya hecha. */
  /* omitirCanje: la transferencia queda "Pendiente" hasta que se apruebe
     el depósito -- el boleto físico igual se reserva/asigna en el
     inventario (para que nadie más lo venda), pero el canje (marcar la
     entrada como usada) se deja para cuando se apruebe el pago, no antes. */
  /* Para localidades correlativas (sin mapa de asientos) st.idSillas viene
     vacío -- el backend recién resuelve qué localidades_items.id se usaron
     DESPUÉS de crear la compra (los guarda en
     registraCompra.info_concierto[].id_sillas, ver VincularReservasACompra
     en RegistraCompra.controller.js). Se hace un fetch de vuelta para
     poder reemplazar el QR igual que en localidades con mapa de asientos. */
  const obtenerAsientosCorrelativo = async (idRegistraCompra: number): Promise<number[]> => {
    try {
      const { data } = await axios.post(`${URL_BASE}/listarRegistros`, {}, {
        headers: API_HDR, params: { id_registro: idRegistraCompra },
      });
      const fila = Array.isArray(data?.data) ? data.data[0] : null;
      const idSillas = fila?.info_concierto?.[0]?.id_sillas;
      return Array.isArray(idSillas) ? idSillas.map(Number).filter((n) => n > 0) : [];
    } catch {
      return [];
    }
  };

  const asignarBoletosFisicosYCanjear = async (idRegistraCompra: number, omitirCanje = false) => {
    const idOperador = staff?.id || 0;
    // Empareja cada código con el asiento reservado en el MISMO orden en
    // que se escanearon (1ro con 1ro, 2do con 2do...). Para correlativo
    // (sin mapa de asientos elegido a mano) se resuelven los asientos que
    // el backend acaba de asignar recién ahora, ya con la compra creada.
    const asientos = st.idSillas?.length ? st.idSillas : await obtenerAsientosCorrelativo(idRegistraCompra);
    for (let i = 0; i < codigosFisicos.length; i++) {
      const codigo = codigosFisicos[i];
      const seccion = seccionPorCodigo[codigo];
      if (!seccion) continue; // sin sección resuelta, no hay a qué inventario asignarlo
      const idAsiento = asientos[i];
      try {
        await axios.post(`${URL_BASE}/boletos_fisicos/asignar`, {
          codigoEvento: st.codigoEvento, seccion, codigo_barras: codigo,
          id_registraCompra: idRegistraCompra, id_operador: idOperador,
          ...(idAsiento ? { id_localidades_items: idAsiento } : {}),
        }, { headers: API_HDR });
      } catch { /* best-effort */ }
    }
    if (omitirCanje) return;
    try {
      await axios.post(`${URL_BASE}/canje_boleto`, {
        id_registraCompra: idRegistraCompra, canjeado: 'CANJEADO', id_operador: idOperador, id_usuario: cliente?.id || 0,
      }, { headers: API_HDR });
    } catch { /* best-effort */ }
  };

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
          // total = bruto (sin descuento); el backend aplica el % y guarda el neto.
          total:             total.toFixed(2),
          comision:          comisionServicio.toFixed(2),
          subtotal:          subtotal.toFixed(2),
          comision_bancaria: comisionBancaria.toFixed(2),
          description:       st.localidadNombre || '',
          iva:               ivaImporte.toFixed(2),
        },
        // Descuento marcado por el vendedor (uno por venta). El backend
        // revalida (autorización + evento) y recalcula total_pago.
        ...(descuentoSel ? { descuento: { id: descuentoSel } } : {}),
        transaccion: '',
        // "codigo_boletos" ya es una columna existente de registraCompra --
        // misma que llena ModalEfectivo.js en la web con su campo "Agregar
        // Boletos". Va siempre (vacío para digital, sin efecto).
        codigo_boletos: codigosFisicos,
        // Solo se canjea de una en métodos locales (el dinero ya está en
        // mano al registrar la compra). En gateway/Duna/transferencia el
        // pago todavía no está confirmado en este punto -- el boleto
        // físico igual queda reservado/asignado en el inventario, pero el
        // canje se deja para cuando el pago se confirme (misma lógica que
        // ya existía: "canjear" nunca se manda salvo esLocal).
        ...(esLocal ? { canjear: esFisico, enviar_correo: enviarCorreo } : {}),
      };

      const { data } = await axios.post(`${URL_BASE}/registraCompra`, payload, { headers: API_HDR });

      if (data.success || data.idRegistro) {
        if (data.url) setUrlPago(data.url);
        if (esFisico && data.idRegistro) {
          await asignarBoletosFisicosYCanjear(data.idRegistro, !esLocal);
        }
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

  /* Copia con fallback: navigator.clipboard funciona en el WebView de
     Capacitor (contexto seguro localhost), pero en Android viejos o si
     la API no está disponible se usa un <textarea> temporal. */
  const copiarLink = async () => {
    if (!urlPago) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(urlPago);
      } else {
        const ta = document.createElement('textarea');
        ta.value = urlPago;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setToast('Link de pago copiado.');
    } catch {
      setToast('No se pudo copiar el link.');
    }
  };

  /* Normaliza el celular del cliente a formato internacional de Ecuador
     (593 + número sin cero inicial), tolerando espacios, guiones,
     prefijo +593 o 09xxxxxxxx. */
  const celularWhatsapp = (raw?: string): string => {
    let d = (raw || '').replace(/\D/g, '');
    if (d.startsWith('593')) d = d.slice(3);
    d = d.replace(/^0+/, '');
    return d ? `593${d}` : '';
  };

  const mensajePago = () =>
    `Hola${cliente?.nombreCompleto ? ' ' + cliente.nombreCompleto.split(' ')[0] : ''}, ` +
    `aquí tienes el link para completar el pago de tu entrada a ` +
    `${st.nombreEvento || 'el evento'}: ${urlPago}`;

  /* WhatsApp directo al número del cliente. wa.me es el esquema oficial
     y en Android abre la app de WhatsApp con el chat de ese número ya
     seleccionado. '_system' hace que Capacitor lo abra fuera del WebView. */
  const enviarPorWhatsapp = () => {
    if (!urlPago) return;
    const numero = celularWhatsapp(cliente?.movil);
    if (!numero) { setToast('El cliente no tiene celular registrado.'); return; }
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensajePago())}`, '_system');
  };

  /* Hoja de compartir nativa de Android (@capacitor/share): permite
     mandar el link por cualquier app (WhatsApp a otro contacto, Telegram,
     correo, copiar, etc.). Si el usuario cancela, no se muestra error. */
  const compartirLink = async () => {
    if (!urlPago) return;
    try {
      await Share.share({
        title: 'Link de pago',
        text: mensajePago(),
        url: urlPago,
        dialogTitle: 'Compartir link de pago',
      });
    } catch (e) {
      if (e instanceof Error && /cancel/i.test(e.message)) return;
      setToast('No se pudo abrir el menú de compartir.');
    }
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
            {esLocal && !esFisico && (
              <p>La entrada quedó pagada. {enviarCorreo ? 'Se envió al correo del cliente.' : ''}</p>
            )}
            {esFisico && esLocal && (
              <p>Entrada(s) física(s) registrada(s) y canjeada(s). {enviarCorreo ? 'También se envió al correo del cliente.' : ''}</p>
            )}
            {esFisico && !esLocal && !esTransferencia && (
              <p>Boleto(s) físico(s) registrado(s) y reservado(s). Se canjeará(n) al confirmarse el pago.</p>
            )}
            {met.categoria === 'gateway' && !esQrDuna && (
              <p>Comparte el link de pago con el cliente para que complete el pago con tarjeta.</p>
            )}
            {esQrDuna && (
              <p>Pide al cliente que escanee este código QR con la app de Deuna o de su banco para completar el pago.</p>
            )}
            {esTransferencia && esFisico && (
              <p>Boleto(s) físico(s) reservado(s) -- se canjeará(n) recién cuando se apruebe el depósito.</p>
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
                <IonButton fill="outline" size="small" className="btn-link-accion" onClick={enviarPorWhatsapp}>
                  <IonIcon icon={logoWhatsapp} slot="start" />
                  WhatsApp al cliente
                </IonButton>
                <IonButton fill="outline" size="small" className="btn-link-accion" onClick={compartirLink}>
                  <IonIcon icon={shareSocialOutline} slot="start" />
                  Compartir
                </IonButton>
                <IonButton fill="outline" size="small" className="btn-link-accion" onClick={copiarLink}>
                  <IonIcon icon={copyOutline} slot="start" />
                  Copiar link
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
                        <IonIcon icon={warningOutline} /> Esta imagen podría no ser válida — revísala antes de confirmar.
                      </p>
                    )}
                    {ocrAvisos.map((aviso, i) => (
                      <p key={i} className="ocr-sospecha">
                        <IonIcon icon={warningOutline} /> {aviso}
                      </p>
                    ))}
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

              {/* Tipo de boleto: disponible para CUALQUIER método de pago, no
                  solo los locales -- un cliente puede pagar por link/Duna/
                  transferencia y aun así recibir el boleto impreso en vez
                  del digital. */}
              <div className="metodo-opciones duna-modo-opciones">
                <span className="duna-modo-label">Tipo de boleto</span>
                <div className="duna-modo-row">
                  <div className={`duna-modo-item ${tipoBoleto === 'digital' ? 'duna-modo-sel' : ''}`}
                    onClick={() => setTipoBoleto('digital')}>
                    <IonIcon icon={qrCodeOutline} />
                    <span>Digital</span>
                  </div>
                  <div className={`duna-modo-item ${tipoBoleto === 'fisico' ? 'duna-modo-sel' : ''}`}
                    onClick={() => setTipoBoleto('fisico')}>
                    <IonIcon icon={barcodeOutline} />
                    <span>Físico</span>
                  </div>
                </div>

                {tipoBoleto === 'fisico' && (
                  <div className="fisico-scan-wrap">
                    <span className="duna-modo-hint">
                      <strong>{codigosFisicos.length} de {cantidadFisicaMax}</strong> boleto{cantidadFisicaMax > 1 ? 's' : ''} escaneado{cantidadFisicaMax > 1 ? 's' : ''}.{' '}
                      Escanea el código con el lector (o cámara) o tecléalo y presiona Enter.
                      {buscandoCodigo ? ' Buscando…' : ''}
                    </span>
                    <div className="fisico-scan-input-row">
                      <input
                        ref={inputFisicoRef}
                        className="comprobante-input fisico-scan-input"
                        type="text"
                        inputMode="text"
                        placeholder="Código de barras del boleto físico"
                        value={codigoFisicoInput}
                        disabled={codigosFisicos.length >= cantidadFisicaMax}
                        onChange={(e) => setCodigoFisicoInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCodigoFisico(); } }}
                      />
                      <IonButton fill="outline" className="btn-escanear-camara" onClick={escanearConCamara}
                        disabled={codigosFisicos.length >= cantidadFisicaMax}>
                        <IonIcon icon={cameraOutline} />
                      </IonButton>
                    </div>
                    {codigosFisicos.length > 0 && (
                      <div className="fisico-chips">
                        {codigosFisicos.map((c) => (
                          <span key={c} className="fisico-chip" onClick={() => quitarCodigoFisico(c)}>
                            {c}{seccionPorCodigo[c] ? ` · ${seccionPorCodigo[c]}` : ''}
                            <IonIcon icon={closeCircleOutline} />
                          </span>
                        ))}
                      </div>
                    )}
                    {esLocal ? (
                      <p className="ocr-hint">Se canjeará automáticamente al confirmar la venta.</p>
                    ) : (
                      <p className="ocr-hint">El pago aún no está confirmado -- se canjeará recién cuando se confirme.</p>
                    )}
                    {!st.idSillas?.length && (
                      <p className="ocr-hint">Localidad sin asientos numerados: los boletos se van asignando en el orden en que se compran.</p>
                    )}
                  </div>
                )}
              </div>

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

            {descuentos.length > 0 && (
              <div className="pago-card">
                <h3 className="pago-card-title">Descuento</h3>
                <label className="pago-desc-opt">
                  <input
                    type="radio"
                    name="descuento"
                    checked={descuentoSel === null}
                    onChange={() => setDescuentoSel(null)}
                  />
                  <span>Sin descuento</span>
                </label>
                {descuentos.map(d => (
                  <label key={d.id} className="pago-desc-opt">
                    <input
                      type="radio"
                      name="descuento"
                      checked={descuentoSel === d.id}
                      onChange={() => setDescuentoSel(d.id)}
                    />
                    <span>{d.nombre} <strong>−{d.porcentaje}%</strong></span>
                  </label>
                ))}
              </div>
            )}

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
              {descuentoActivo && (
                <div className="pago-fila">
                  <span className="pago-lbl">Descuento ({descuentoActivo.nombre} −{descuentoActivo.porcentaje}%)</span>
                  <span className="pago-val">−${montoDescuento.toFixed(2)}</span>
                </div>
              )}
              <div className="pago-divider" />
              <div className="pago-fila pago-total-row">
                <span>TOTAL A COBRAR</span>
                <span>${totalACobrar.toFixed(2)}</span>
              </div>
            </div>

            {error && <p className="pago-error">{error}</p>}

            <IonButton expand="block" className="btn-confirmar"
              onClick={confirmar} disabled={cargando || !metodo}>
              {cargando
                ? <><IonSpinner name="crescent" className="btn-spinner" /> Registrando…</>
                : `Registrar venta  $${totalACobrar.toFixed(2)}`
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

        <IonAlert
          isOpen={!!alertaAsiento}
          header="El boleto no coincide con el asiento elegido"
          message={alertaAsiento
            ? `Este boleto es de ${alertaAsiento.seccion}${alertaAsiento.filaAsiento ? ' · ' + alertaAsiento.filaAsiento : ''}, pero no coincide con el asiento elegido en el mapa. ¿Continuar de todas formas?`
            : ''}
          buttons={[
            {
              text: 'Salir',
              role: 'cancel',
              handler: () => {
                if (alertaAsiento) quitarCodigoFisico(alertaAsiento.codigo);
                setAlertaAsiento(null);
              },
            },
            {
              text: 'Está bien',
              handler: () => {
                if (alertaAsiento) {
                  setSeccionPorCodigo(prev => ({ ...prev, [alertaAsiento.codigo]: alertaAsiento.seccion }));
                  setToast('Boleto agregado igual -- revisa que sea el correcto.');
                }
                setAlertaAsiento(null);
              },
            },
          ]}
        />

      </IonContent>
    </IonPage>
  );
};

export default Pago;
