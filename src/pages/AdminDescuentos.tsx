import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner,
  IonBadge, IonCheckbox, IonAlert, IonToast, IonInput, IonTextarea,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import {
  addOutline, createOutline, trashOutline, pricetagsOutline, peopleOutline,
} from 'ionicons/icons';
import {
  listarDescuentosEvento, guardarDescuentoEvento, eliminarDescuentoEvento,
  listarUsuariosParaAutorizar,
  type DescuentoEventoAdmin, type UsuarioParaAutorizar, type AplicaSobre,
} from '../utils/descuentosAdmin';
import './AdminDescuentos.css';

/* Configuración de "tipos de descuento" por evento -- solo para admin.
   Mismo backend/contrato que usa TicketsWeb (DescuentosPanel.js), acotado
   a lo esencial para hacerlo desde el celular: el link/QR público y el
   reporte detallado de usos se siguen gestionando únicamente desde la web
   (ver descuentosAdmin.ts). Si un descuento ya tenía un link público
   configurado ahí, esta pantalla lo conserva intacto al editarlo. */

interface FormState {
  id: number | null;
  nombre: string;
  porcentaje: string;
  mensajeMotivo: string;
  activo: boolean;
  aplicaSobre: AplicaSobre;
  usuarios: number[];
  // No editables acá -- se reenvían tal cual para no pisar lo que ya
  // tenía configurado un link público desde la web.
  fechaInicio: string | null;
  fechaFin: string | null;
  maxUsos: number | null;
  usosPorCedula: number | null;
}

const FORM_VACIO: FormState = {
  id: null, nombre: '', porcentaje: '', mensajeMotivo: '', activo: true,
  aplicaSobre: 'final', usuarios: [],
  fechaInicio: null, fechaFin: null, maxUsos: null, usosPorCedula: 1,
};

// Perfiles que venden, primero en la lista (mismo criterio que DescuentosPanel.js).
const PERFILES_VENTA = ['vendedores', 'vendedor_secundario', 'admin', 'super_admin', 'suscriptores'];

const AdminDescuentos: React.FC = () => {
  const { codigoEvento } = useParams<{ codigoEvento: string }>();

  const [descuentos, setDescuentos] = useState<DescuentoEventoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cambiandoActivoId, setCambiandoActivoId] = useState<number | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState<DescuentoEventoAdmin | null>(null);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState<FormState | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [usuarios, setUsuarios] = useState<UsuarioParaAutorizar[]>([]);
  const [usuariosEstado, setUsuariosEstado] = useState<'loading' | 'ok' | 'error'>('loading');
  const [filtroUsuario, setFiltroUsuario] = useState('');

  const cargar = useCallback(async () => {
    if (!codigoEvento) return;
    setCargando(true);
    setDescuentos(await listarDescuentosEvento(codigoEvento));
    setCargando(false);
  }, [codigoEvento]);

  useEffect(() => { cargar(); }, [cargar]);

  const cargarUsuarios = useCallback(async () => {
    setUsuariosEstado('loading');
    const lista = await listarUsuariosParaAutorizar();
    if (lista.length === 0) { setUsuariosEstado('error'); return; }
    setUsuarios(lista);
    setUsuariosEstado('ok');
  }, []);

  useEffect(() => { cargarUsuarios(); }, [cargarUsuarios]);

  const usuariosOrdenados = useMemo(() => {
    const q = filtroUsuario.trim().toLowerCase();
    return [...usuarios]
      .filter((u) => !q
        || u.nombre.toLowerCase().includes(q)
        || u.username.toLowerCase().includes(q)
        || u.perfil.toLowerCase().includes(q))
      .sort((a, b) => {
        const ra = PERFILES_VENTA.indexOf(a.perfil.toLowerCase());
        const rb = PERFILES_VENTA.indexOf(b.perfil.toLowerCase());
        const na = ra === -1 ? 99 : ra;
        const nb = rb === -1 ? 99 : rb;
        return na !== nb ? na - nb : a.nombre.localeCompare(b.nombre);
      });
  }, [usuarios, filtroUsuario]);

  const nombreUsuario = (idAdmin: number) => usuarios.find((u) => u.id === idAdmin)?.nombre ?? `#${idAdmin}`;

  const abrirNuevo = () => setForm({ ...FORM_VACIO });

  const abrirEdicion = (d: DescuentoEventoAdmin) => setForm({
    id: d.id,
    nombre: d.nombre,
    porcentaje: String(d.porcentaje ?? ''),
    mensajeMotivo: d.mensaje_motivo || '',
    activo: d.activo,
    aplicaSobre: d.aplica_sobre === 'base' ? 'base' : 'final',
    usuarios: (d.usuarios || []).map((u) => u.id_admin),
    fechaInicio: d.fecha_inicio ?? null,
    fechaFin: d.fecha_fin ?? null,
    maxUsos: d.max_usos ?? null,
    usosPorCedula: d.usos_por_cedula ?? null,
  });

  const cerrarForm = () => setForm(null);

  const toggleUsuarioForm = (idAdmin: number) => setForm((f) => f && ({
    ...f,
    usuarios: f.usuarios.includes(idAdmin)
      ? f.usuarios.filter((x) => x !== idAdmin)
      : [...f.usuarios, idAdmin],
  }));

  const guardar = async () => {
    if (!form || !codigoEvento) return;
    const nombre = form.nombre.trim();
    const pct = Number(form.porcentaje);
    if (!nombre) { setToast('Ponle un nombre al descuento.'); return; }
    if (!(pct > 0 && pct <= 100)) { setToast('El porcentaje debe estar entre 0 y 100.'); return; }

    setGuardando(true);
    const resp = await guardarDescuentoEvento({
      ...(form.id ? { id: form.id } : { codigoEvento }),
      nombre,
      porcentaje: pct,
      mensaje_motivo: form.mensajeMotivo.trim(),
      activo: form.activo,
      aplica_sobre: form.aplicaSobre,
      usuarios: form.usuarios,
      fecha_inicio: form.fechaInicio,
      fecha_fin: form.fechaFin,
      max_usos: form.maxUsos,
      usos_por_cedula: form.usosPorCedula,
    });
    setGuardando(false);

    if (resp.success) {
      setToast(form.id ? 'Descuento actualizado.' : 'Descuento creado.');
      cerrarForm();
      cargar();
    } else {
      setToast(resp.message || 'No se pudo guardar el descuento.');
    }
  };

  const cambiarActivo = async (d: DescuentoEventoAdmin) => {
    setCambiandoActivoId(d.id);
    const resp = await guardarDescuentoEvento({
      id: d.id,
      nombre: d.nombre,
      porcentaje: d.porcentaje,
      mensaje_motivo: d.mensaje_motivo || '',
      activo: !d.activo,
      aplica_sobre: d.aplica_sobre,
      usuarios: (d.usuarios || []).map((u) => u.id_admin),
      fecha_inicio: d.fecha_inicio ?? null,
      fecha_fin: d.fecha_fin ?? null,
      max_usos: d.max_usos ?? null,
      usos_por_cedula: d.usos_por_cedula ?? null,
    });
    if (resp.success) await cargar();
    else setToast(resp.message || 'No se pudo cambiar el estado.');
    setCambiandoActivoId(null);
  };

  const eliminarAhora = async () => {
    if (!confirmarEliminar) return;
    const resp = await eliminarDescuentoEvento(confirmarEliminar.id);
    setToast(resp.success ? 'Descuento eliminado.' : (resp.message || 'No se pudo eliminar.'));
    setConfirmarEliminar(null);
    if (resp.success) cargar();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/admin/evento/${codigoEvento}`} text="" />
          </IonButtons>
          <IonTitle size="small">Descuentos</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        <div className="descuentos-container">

          <div className="admin-card descuentos-intro">
            <p>
              Tipos de descuento (%) que un vendedor puede marcar a mano al vender un boleto de este
              evento. Solo pueden aplicarlo los vendedores que marques como autorizados abajo.
            </p>
            {!form && (
              <IonButton expand="block" className="btn-nuevo-descuento" onClick={abrirNuevo}>
                <IonIcon icon={addOutline} slot="start" /> Nuevo descuento
              </IonButton>
            )}
          </div>

          {form && (
            <div className="admin-card descuento-form">
              <h3 className="admin-card-titulo">{form.id ? 'Editar descuento' : 'Nuevo descuento'}</h3>

              <div className="descuento-campo">
                <label>Nombre *</label>
                <IonInput
                  fill="outline" placeholder="Ej: Promo radio X"
                  value={form.nombre}
                  onIonInput={(e) => setForm((f) => f && ({ ...f, nombre: e.detail.value ?? '' }))}
                />
              </div>

              <div className="descuento-campo">
                <label>Porcentaje *</label>
                <IonInput
                  fill="outline" type="number" placeholder="Ej: 10" inputmode="decimal"
                  value={form.porcentaje}
                  onIonInput={(e) => setForm((f) => f && ({ ...f, porcentaje: e.detail.value ?? '' }))}
                />
              </div>

              <div className="descuento-campo">
                <IonCheckbox
                  checked={form.activo}
                  onIonChange={(e) => setForm((f) => f && ({ ...f, activo: e.detail.checked }))}
                >
                  Activo <small>(disponible para vender)</small>
                </IonCheckbox>
              </div>

              <div className="descuento-campo">
                <label>¿Sobre qué se aplica el %?</label>
                <label className="descuento-radio">
                  <input
                    type="radio" name="aplicaSobre"
                    checked={form.aplicaSobre !== 'base'}
                    onChange={() => setForm((f) => f && ({ ...f, aplicaSobre: 'final' }))}
                  />
                  <span>Precio final <small>(precio + IVA + comisiones, como siempre)</small></span>
                </label>
                <label className="descuento-radio">
                  <input
                    type="radio" name="aplicaSobre"
                    checked={form.aplicaSobre === 'base'}
                    onChange={() => setForm((f) => f && ({ ...f, aplicaSobre: 'base' }))}
                  />
                  <span>Precio base <small>(solo el precio del boleto; IVA y comisiones se calculan después, sobre el precio ya rebajado)</small></span>
                </label>
              </div>

              <div className="descuento-campo">
                <label>Mensaje / motivo (opcional)</label>
                <IonTextarea
                  fill="outline" rows={2} placeholder="Ej: Obtuviste un 10% de descuento por ser oyente de Radio X"
                  value={form.mensajeMotivo}
                  onIonInput={(e) => setForm((f) => f && ({ ...f, mensajeMotivo: e.detail.value ?? '' }))}
                />
              </div>

              <div className="descuento-campo">
                <div className="descuento-usuarios-header">
                  <label>
                    Vendedores autorizados
                    {form.usuarios.length > 0 && <IonBadge className="badge-conteo">{form.usuarios.length}</IonBadge>}
                  </label>
                  {usuariosEstado === 'ok' && usuarios.length > 0 && (
                    <div className="descuento-usuarios-acciones">
                      <button type="button" onClick={() => setForm((f) => f && ({
                        ...f, usuarios: [...new Set([...f.usuarios, ...usuariosOrdenados.map((u) => u.id)])],
                      }))}>
                        Marcar todos
                      </button>
                      <button type="button" className="link-peligro" onClick={() => setForm((f) => f && ({ ...f, usuarios: [] }))}>
                        Quitar todos
                      </button>
                    </div>
                  )}
                </div>

                {usuariosEstado === 'ok' && usuarios.length > 6 && (
                  <input
                    className="descuento-buscar-usuario"
                    placeholder="Buscar por nombre, usuario o perfil…"
                    value={filtroUsuario}
                    onChange={(e) => setFiltroUsuario(e.target.value)}
                  />
                )}

                <div className="descuento-usuarios-lista">
                  {usuariosEstado === 'loading' && <small className="texto-tenue">Cargando usuarios…</small>}
                  {usuariosEstado === 'error' && (
                    <div className="descuento-usuarios-error">
                      <small>No se pudo cargar la lista de usuarios.</small>
                      <button type="button" onClick={cargarUsuarios}>Reintentar</button>
                    </div>
                  )}
                  {usuariosEstado === 'ok' && usuariosOrdenados.length === 0 && (
                    <small className="texto-tenue">Ningún usuario coincide con la búsqueda.</small>
                  )}
                  {usuariosOrdenados.map((u) => (
                    <label key={u.id} className="descuento-usuario-item">
                      <IonCheckbox
                        checked={form.usuarios.includes(u.id)}
                        onIonChange={() => toggleUsuarioForm(u.id)}
                      />
                      <span>{u.nombre} <small>({u.perfil || 'sin perfil'})</small></span>
                    </label>
                  ))}
                </div>
                <small className="texto-tenue">
                  Si no marcas a nadie, ningún vendedor podrá aplicarlo a mano.
                </small>
              </div>

              <div className="descuento-form-acciones">
                <IonButton className="btn-localidad-guardar" onClick={guardar} disabled={guardando}>
                  {guardando ? <IonSpinner name="crescent" /> : 'Guardar'}
                </IonButton>
                <IonButton fill="outline" className="btn-localidad-eliminar-outline" onClick={cerrarForm} disabled={guardando}>
                  Cancelar
                </IonButton>
              </div>
            </div>
          )}

          {cargando && <div className="admin-loading-mini"><IonSpinner name="crescent" /></div>}

          {!cargando && descuentos.length === 0 && !form && (
            <div className="admin-card">
              <p className="admin-sin-datos">Todavía no hay descuentos para este evento.</p>
            </div>
          )}

          {!cargando && descuentos.map((d) => (
            <div key={d.id} className="admin-card descuento-item">
              <div className="descuento-item-header">
                <div className="descuento-item-titulos">
                  <span className="descuento-item-nombre">{d.nombre}</span>
                  {d.mensaje_motivo && <span className="descuento-item-motivo">{d.mensaje_motivo}</span>}
                </div>
                <span className="descuento-item-pct">−{d.porcentaje}%</span>
              </div>

              <div className="descuento-item-badges">
                <IonBadge className={d.aplica_sobre === 'base' ? 'badge-sobre-base' : 'badge-sobre-final'}>
                  {d.aplica_sobre === 'base' ? 'Sobre precio base' : 'Sobre precio final'}
                </IonBadge>
                <button
                  className={`badge-activo-btn ${d.activo ? 'activo' : 'inactivo'}`}
                  onClick={() => cambiarActivo(d)}
                  disabled={cambiandoActivoId === d.id}
                >
                  {cambiandoActivoId === d.id ? <IonSpinner name="crescent" /> : (d.activo ? 'Activo' : 'Inactivo')}
                </button>
              </div>

              <div className="descuento-item-fila">
                <IonIcon icon={peopleOutline} />
                <span>
                  {(d.usuarios || []).length === 0
                    ? 'Ningún vendedor autorizado'
                    : (d.usuarios || []).map((u) => u.nombre || nombreUsuario(u.id_admin)).join(', ')}
                </span>
              </div>

              <div className="descuento-item-fila">
                <IonIcon icon={pricetagsOutline} />
                <span>{d.usos_validos ?? 0} uso{(d.usos_validos ?? 0) === 1 ? '' : 's'} registrado{(d.usos_validos ?? 0) === 1 ? '' : 's'}</span>
              </div>

              <div className="descuento-item-acciones">
                <IonButton fill="outline" size="small" className="btn-admin-accion" onClick={() => abrirEdicion(d)}>
                  <IonIcon icon={createOutline} slot="start" /> Editar
                </IonButton>
                <IonButton fill="outline" size="small" className="btn-descuento-eliminar" onClick={() => setConfirmarEliminar(d)}>
                  <IonIcon icon={trashOutline} slot="start" /> Eliminar
                </IonButton>
              </div>
            </div>
          ))}

        </div>

        <IonAlert
          isOpen={!!confirmarEliminar}
          header="¿Eliminar descuento?"
          message={confirmarEliminar ? `Se eliminará "${confirmarEliminar.nombre}". Los usos ya registrados se conservan.` : ''}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: eliminarAhora },
          ]}
          onDidDismiss={() => setConfirmarEliminar(null)}
        />

        <IonToast isOpen={!!toast} message={toast} duration={2800} position="top" onDidDismiss={() => setToast('')} />
      </IonContent>
    </IonPage>
  );
};

export default AdminDescuentos;
