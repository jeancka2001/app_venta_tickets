import { useEffect, useRef, useState } from 'react';
import { IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonInput, IonAlert, IonToast } from '@ionic/react';
import { correoValido, guardarCliente, hayCambios, verificarCorreo, type ClienteDatos, type OtroCliente } from '../utils/clientesAdmin';
import '../pages/Paneles.css';

/* Editar los datos de un cliente. Avisa EN EL MOMENTO si el correo ya lo usa otro cliente (y no deja guardar) y, al guardar,
   el servidor lo vuelve a revisar. La cédula se ve pero no se cambia: une al cliente con sus compras y boletos. */
interface Props {
  cliente: ClienteDatos | null;
  onCerrar: () => void;
  onGuardado: (c: ClienteDatos) => void;
}

const EditarCliente: React.FC<Props> = ({ cliente, onCerrar, onGuardado }) => {
  const [f, setF] = useState<ClienteDatos | null>(cliente);
  const [repetido, setRepetido] = useState<OtroCliente | null>(null);
  const [estadoCorreo, setEstadoCorreo] = useState<'' | 'revisando' | 'libre' | 'invalido' | 'error'>('');
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [toast, setToast] = useState('');
  const peticion = useRef(0);

  useEffect(() => { setF(cliente); setRepetido(null); setEstadoCorreo(''); }, [cliente]);

  // Revisa el correo un instante después de que el usuario deja de escribir
  useEffect(() => {
    if (!f || !cliente) return undefined;
    const mismo = f.email.trim().toLowerCase() === cliente.email.trim().toLowerCase();
    if (mismo) { setRepetido(null); setEstadoCorreo(''); return undefined; }
    if (!correoValido(f.email)) { setRepetido(null); setEstadoCorreo(f.email.trim() ? 'invalido' : ''); return undefined; }
    setEstadoCorreo('revisando');
    const mia = ++peticion.current;
    const t = setTimeout(async () => {
      const r = await verificarCorreo(f.id, f.email.trim());
      if (mia !== peticion.current) return;
      if (r.error) { setEstadoCorreo('error'); setRepetido(null); } else { setRepetido(r.repetido ? r.con ?? { id: 0, nombre: 'otro cliente', cedula: '' } : null); setEstadoCorreo(r.repetido ? '' : 'libre'); }
    }, 450);
    return () => clearTimeout(t);
  }, [f?.email, f?.id, cliente]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!f || !cliente) return <IonModal isOpen={false} />;

  const cambios = hayCambios(cliente, f);
  const correoCambio = f.email.trim().toLowerCase() !== cliente.email.trim().toLowerCase();
  const nombreMal = f.nombreCompleto.trim().length < 3;
  const celularMal = !!f.movil.trim() && !/^\d{7,15}$/.test(f.movil.replace(/\D/g, ''));
  const puedeGuardar = cambios && !nombreMal && correoValido(f.email) && !celularMal && !repetido && estadoCorreo !== 'revisando' && !guardando;

  const guardar = async () => {
    setGuardando(true);
    const r = await guardarCliente({ ...f, email: f.email.trim().toLowerCase() });
    setGuardando(false);
    if (r.success) {
      setToast(r.sinCambios ? 'No había cambios.' : 'Datos del cliente actualizados.');
      onGuardado({ ...f, email: f.email.trim().toLowerCase() });
      return;
    }
    if (r.repetido) setRepetido(r.con ?? { id: 0, nombre: 'otro cliente', cedula: '' });
    setToast(r.message);
  };

  const campo = (k: keyof ClienteDatos, v: string) => setF((x) => (x ? { ...x, [k]: v } : x));

  return (
    <>
      <IonModal isOpen onDidDismiss={onCerrar}>
        <IonHeader>
          <IonToolbar className="admin-toolbar">
            <IonTitle size="small">Editar datos del cliente</IonTitle>
            <IonButtons slot="end"><IonButton onClick={onCerrar}>Cerrar</IonButton></IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="admin-content">
          <div className="pn-contenedor">
            <div className="pn-card">
              <div className="pn-fila"><span className="pn-lbl">Cédula / RUC</span><span className="pn-val">{f.cedula}</span></div>
              <p className="pn-sub" style={{ marginTop: 6 }}>La cédula no se cambia: es lo que une al cliente con sus compras y boletos.</p>

              <div className="pn-campo"><IonInput label="Nombre completo" labelPlacement="floating" fill="outline" value={f.nombreCompleto} maxlength={150} onIonInput={(e) => campo('nombreCompleto', String(e.detail.value ?? ''))} errorText="Escribe el nombre completo" className={nombreMal ? 'ion-invalid ion-touched' : ''} /></div>

              <div className="pn-campo">
                <IonInput label="Correo" labelPlacement="floating" fill="outline" type="email" inputmode="email" autocapitalize="off" value={f.email} maxlength={150} onIonInput={(e) => campo('email', String(e.detail.value ?? ''))} />
                {repetido && (
                  <div className="pn-error" style={{ marginTop: 6 }}>
                    ⚠ Este correo ya lo usa <b>{repetido.nombre}</b>{repetido.cedula ? ` (cédula ${repetido.cedula})` : ''}. Usa otro correo.
                  </div>
                )}
                {!repetido && estadoCorreo === 'revisando' && <p className="pn-sub" style={{ marginTop: 4 }}>Revisando el correo…</p>}
                {!repetido && estadoCorreo === 'libre' && <p className="pn-sub" style={{ marginTop: 4, color: '#155724' }}>✔ Correo disponible.</p>}
                {estadoCorreo === 'invalido' && <p className="pn-sub" style={{ marginTop: 4, color: '#7f1d1d' }}>El correo no es válido.</p>}
                {estadoCorreo === 'error' && <p className="pn-sub" style={{ marginTop: 4, color: '#7a5200' }}>No se pudo revisar si el correo está repetido; se revisará al guardar.</p>}
              </div>

              <div className="pn-campo">
                <IonInput label="Celular" labelPlacement="floating" fill="outline" type="tel" inputmode="tel" value={f.movil} maxlength={20} onIonInput={(e) => campo('movil', String(e.detail.value ?? ''))} />
                {celularMal && <p className="pn-sub" style={{ marginTop: 4, color: '#7f1d1d' }}>El celular debe tener entre 7 y 15 dígitos.</p>}
              </div>
              <div className="pn-campo"><IonInput label="Ciudad" labelPlacement="floating" fill="outline" value={f.ciudad} maxlength={100} onIonInput={(e) => campo('ciudad', String(e.detail.value ?? ''))} /></div>
              <div className="pn-campo"><IonInput label="Dirección" labelPlacement="floating" fill="outline" value={f.direccion} maxlength={200} onIonInput={(e) => campo('direccion', String(e.detail.value ?? ''))} /></div>
            </div>

            <IonButton expand="block" className="pn-boton-p" disabled={!puedeGuardar} onClick={() => (correoCambio ? setConfirmar(true) : guardar())}>{guardando ? 'Guardando…' : 'Guardar cambios'}</IonButton>
            <p className="pn-sub" style={{ textAlign: 'center' }}>Cada cambio queda registrado con quién lo hizo y cuándo.</p>
          </div>
        </IonContent>
      </IonModal>
      <IonAlert isOpen={confirmar} onDidDismiss={() => setConfirmar(false)} header="¿Cambiar el correo?"
        message={`El correo es con el que el cliente entra a su cuenta y donde recibe sus boletos. Pasará de ${cliente.email || '(sin correo)'} a ${f.email.trim().toLowerCase()}.`}
        buttons={[{ text: 'No', role: 'cancel' }, { text: 'Sí, cambiar', handler: () => { guardar(); } }]} />
      <IonToast isOpen={!!toast} message={toast} duration={3200} onDidDismiss={() => setToast('')} />
    </>
  );
};

export default EditarCliente;
