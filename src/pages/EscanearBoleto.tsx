import { useEffect, useRef, useState } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner, IonText, IonToast,
} from '@ionic/react';
import {
  qrCodeOutline, scanOutline, copyOutline, personOutline, cardOutline,
  mailOutline, callOutline, locationOutline, checkmarkCircleOutline,
} from 'ionicons/icons';
import { escanearBoletoFisico } from '../utils/barcodeScanner';
import { obtenerInfoBoleto, type ResultadoInfoBoleto, type InfoBoletoAsiento } from '../utils/infoBoleto';
import { METODOS_CONFIGURABLES } from '../utils/metodosPago';
import marcaTickets from '../images/MARCA_TICKETS.png';
import './EscanearBoleto.css';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const formatFecha = (fecha?: string | null) => {
  if (!fecha) return '—';
  const solo = fecha.split(' ')[0].split('T')[0];
  const [y, m, d] = solo.split('-');
  if (!y || !m || !d) return fecha;
  return `${d} ${MESES[parseInt(m) - 1] ?? m} ${y}`;
};

const formaPagoLabel = (forma?: string | null) =>
  METODOS_CONFIGURABLES.find((m) => m.key === forma)?.label ?? (forma || '—');

const badgeEstado = (estadoRaw?: string | null): { texto: string; clase: string } => {
  const e = String(estadoRaw || '').toUpperCase();
  if (e === 'VENDIDO') return { texto: 'Vendido', clase: 'badge-ocupado' };
  if (e === 'OCUPADO' || e === 'PASADO') return { texto: 'Ocupado', clase: 'badge-ocupado' };
  if (e === 'RESERVADO') return { texto: 'Reservado', clase: 'badge-reservado' };
  if (e === 'ANULADO') return { texto: 'Anulado', clase: 'badge-anulado' };
  return { texto: 'Libre', clase: 'badge-libre' };
};

const descripcionAsiento = (d: InfoBoletoAsiento): string => {
  const t = (d.typo || '').toLowerCase();
  if (t === 'correlativo') {
    return d.boleto_numero != null
      ? `Boleto N.º ${d.boleto_numero}${d.boleto_total ? ' de ' + d.boleto_total : ''}`
      : 'Boleto correlativo';
  }
  if (t === 'mesa') {
    const partes = [d.mesa ? `Mesa ${d.mesa}` : null, d.fila ? `Fila ${d.fila}` : null, d.silla ? `Silla ${d.silla}` : null, d.sillas ? `(${d.sillas} sillas)` : null];
    return partes.filter(Boolean).join(' · ') || 'Mesa';
  }
  if (t === 'fila') {
    const partes = [d.fila ? `Fila ${d.fila}` : null, d.silla ? `Silla ${d.silla}` : null, d.sillas ? `(${d.sillas} sillas)` : null];
    return partes.filter(Boolean).join(' · ') || 'Fila';
  }
  return d.silla || d.fila || d.mesa || `Asiento #${d.id_item}`;
};

const EscanearBoleto: React.FC = () => {
  const [codigoInput, setCodigoInput] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<ResultadoInfoBoleto | null>(null);
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const buscarCodigo = async (codigoDirecto?: string) => {
    const codigo = (codigoDirecto ?? codigoInput).trim();
    if (!codigo) return;
    setError('');
    setCodigoInput('');
    setResultado(null);
    setBuscando(true);
    const info = await obtenerInfoBoleto(codigo);
    setResultado(info);
    setBuscando(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /* Auto-envío al dejar de escribir: los lectores de código de barras
     "escriben" carácter por carácter y casi siempre mandan Enter al
     terminar (eso ya lo cubre el onKeyDown del input). Este temporizador
     es el respaldo para lectores que NO mandan Enter -- mismo patrón que
     Pago.tsx para boletos físicos. No molesta al tecleo manual. */
  useEffect(() => {
    if (!codigoInput.trim() || buscando) return;
    const t = setTimeout(() => buscarCodigo(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoInput]);

  const escanearConCamara = async () => {
    setError('');
    const escaneo = await escanearBoletoFisico();
    if (!escaneo.ok || !escaneo.codigo) {
      if (escaneo.mensaje) setError(escaneo.mensaje);
      return;
    }
    await buscarCodigo(escaneo.codigo);
  };

  /* Copia con fallback: navigator.clipboard funciona en el WebView de
     Capacitor, pero en Android viejos o sin contexto seguro se usa un
     <textarea> temporal (mismo patrón que Pago.tsx). */
  const copiarCedula = async (cedula: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cedula);
      } else {
        const ta = document.createElement('textarea');
        ta.value = cedula;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setToast('Cédula copiada.');
    } catch {
      setToast('No se pudo copiar la cédula.');
    }
  };

  const renderComprador = (nombreCompleto?: string | null, cedula?: string | null, email?: string | null, movil?: string | null, ciudad?: string | null, direccion?: string | null) => {
    if (!nombreCompleto && !cedula) return null;
    return (
      <div className="escaneo-card">
        <h3 className="escaneo-card-titulo"><IonIcon icon={personOutline} /> Comprador</h3>
        {nombreCompleto && <div className="escaneo-fila"><span className="escaneo-fila-label">Nombre</span><span className="escaneo-fila-valor">{nombreCompleto}</span></div>}
        {cedula && (
          <div className="escaneo-fila">
            <span className="escaneo-fila-label">Cédula</span>
            <span className="escaneo-fila-valor escaneo-cedula">
              {cedula}
              <button className="btn-copiar-cedula" onClick={() => copiarCedula(cedula)}>
                <IonIcon icon={copyOutline} />
              </button>
            </span>
          </div>
        )}
        {email && <div className="escaneo-fila"><span className="escaneo-fila-label"><IonIcon icon={mailOutline} /></span><span className="escaneo-fila-valor">{email}</span></div>}
        {movil && <div className="escaneo-fila"><span className="escaneo-fila-label"><IonIcon icon={callOutline} /></span><span className="escaneo-fila-valor">{movil}</span></div>}
        {(ciudad || direccion) && (
          <div className="escaneo-fila">
            <span className="escaneo-fila-label"><IonIcon icon={locationOutline} /></span>
            <span className="escaneo-fila-valor">{[ciudad, direccion].filter(Boolean).join(' · ')}</span>
          </div>
        )}
      </div>
    );
  };

  const renderPago = (forma_pago?: string | null, estado_pago?: string | null, total?: string | null, fecha_compra?: string | null) => {
    if (!forma_pago && !estado_pago && !total) return null;
    return (
      <div className="escaneo-card">
        <h3 className="escaneo-card-titulo"><IonIcon icon={cardOutline} /> Compra</h3>
        {forma_pago && <div className="escaneo-fila"><span className="escaneo-fila-label">Método de pago</span><span className="escaneo-fila-valor">{formaPagoLabel(forma_pago)}</span></div>}
        {estado_pago && <div className="escaneo-fila"><span className="escaneo-fila-label">Estado de pago</span><span className="escaneo-fila-valor">{estado_pago}</span></div>}
        {total != null && <div className="escaneo-fila"><span className="escaneo-fila-label">Total</span><span className="escaneo-fila-valor escaneo-total">${(parseFloat(total || '0') || 0).toFixed(2)}</span></div>}
        {fecha_compra && <div className="escaneo-fila"><span className="escaneo-fila-label">Fecha de compra</span><span className="escaneo-fila-valor">{formatFecha(fecha_compra)}</span></div>}
      </div>
    );
  };

  const renderResultado = () => {
    if (!resultado) return null;

    if (!resultado.ok) {
      return (
        <div className="escaneo-card escaneo-no-encontrado">
          <IonIcon icon={qrCodeOutline} />
          <p>{resultado.mensaje}</p>
        </div>
      );
    }

    if (resultado.tipo === 'asiento') {
      const d = resultado.data;
      const badge = badgeEstado(d.estado);
      return (
        <>
          <div className="escaneo-card escaneo-estado-card">
            <span className={`escaneo-badge ${badge.clase}`}>{badge.texto}</span>
            {d.pasado === 'PASADO' && <span className="escaneo-badge badge-canjeado"><IonIcon icon={checkmarkCircleOutline} /> Ya ingresó</span>}
            <h2 className="escaneo-asiento-titulo">{descripcionAsiento(d)}</h2>
            <div className="escaneo-subtitulo">
              {[d.nombreConcierto, d.localidad_nombre?.replace(/__+/g, '').trim()].filter(Boolean).join(' · ') || 'Boleto digital'}
            </div>
          </div>

          {renderComprador(d.nombreCompleto, d.cedula || d.cedula_compra, d.email, d.movil, d.ciudad, d.direccion)}
          {renderPago(d.forma_pago, d.estado_pago, d.total, d.fecha_compra)}
        </>
      );
    }

    // tipo === 'fisico'
    const f = resultado.data;
    const badge = badgeEstado(f.estado);
    return (
      <>
        <div className="escaneo-card escaneo-estado-card">
          <span className={`escaneo-badge ${badge.clase}`}>{badge.texto}</span>
          <h2 className="escaneo-asiento-titulo">
            {[f.seccion, f.fila_asiento].filter(Boolean).join(' · ') || 'Boleto físico'}
          </h2>
          <div className="escaneo-subtitulo">Boleto físico · Código {f.codigo_barras}</div>
        </div>

        {renderComprador(f.nombreCompleto, f.cedula_compra, f.email, f.movil, f.ciudad, f.direccion)}
        {renderPago(f.forma_pago, f.estado_pago, f.total, f.fecha_compra)}
      </>
    );
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="escaneo-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/buscar" text="" />
          </IonButtons>
          <img src={marcaTickets} alt="T-ickets" className="toolbar-logo" />
          <IonTitle size="small">Escanear boleto</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="escaneo-content">
        <div className="escaneo-container">
          <div className="escaneo-scan-bar">
            <input
              ref={inputRef}
              className="escaneo-input"
              type="text"
              inputMode="text"
              placeholder="Código del boleto (QR o barras)"
              value={codigoInput}
              disabled={buscando}
              onChange={(e) => setCodigoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCodigo(); } }}
            />
            <IonButton className="btn-camara" onClick={escanearConCamara} disabled={buscando}>
              <IonIcon icon={scanOutline} slot="icon-only" />
            </IonButton>
          </div>
          <p className="escaneo-hint">Escanea con la cámara o el lector, o teclea el código y presiona Enter.</p>

          {error && <p className="escaneo-error">{error}</p>}

          {!resultado && !buscando && (
            <div className="escaneo-inicio">
              <IonIcon icon={qrCodeOutline} className="escaneo-icono-grande" />
              <p className="escaneo-instrucciones">
                Escanea el código QR o de barras del boleto (digital o físico) para ver
                el asiento, si está ocupado o libre, y los datos del comprador.
              </p>
            </div>
          )}

          {buscando && (
            <div className="escaneo-cargando">
              <IonSpinner name="crescent" />
              <IonText><p>Buscando boleto…</p></IonText>
            </div>
          )}

          {!buscando && resultado && (
            <>
              {renderResultado()}
              <IonButton expand="block" className="btn-escanear-otro" onClick={escanearConCamara}>
                <IonIcon icon={scanOutline} slot="start" />
                Escanear otro boleto
              </IonButton>
            </>
          )}
        </div>

        <IonToast
          isOpen={!!toast}
          message={toast}
          duration={2500}
          position="top"
          onDidDismiss={() => setToast('')}
        />
      </IonContent>
    </IonPage>
  );
};

export default EscanearBoleto;
