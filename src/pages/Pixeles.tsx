import { useCallback, useEffect, useState } from 'react';
import { IonButton, IonInput, IonSelect, IonSelectOption, IonCheckbox, IonAlert, IonRefresher, IonRefresherContent } from '@ionic/react';
import PanelPagina from '../components/PanelPagina';
import { listarEventosAdmin } from '../utils/adminEventos';
import { metaConfig, metaGuardar, metaProbar, pixelBorrar, pixelCrear, pixelEditar, pixelesEvento, pixelProbar, tiktokGuardar, tiktokProbar } from '../utils/panelesAdmin';

/* Ajustes > Píxeles de publicidad: Meta (Facebook/Instagram) y TikTok. Pixel general de la página y pixeles por concierto
   (de un organizador: solo reciben lo de su concierto). Los tokens nunca se muestran: solo los últimos dígitos. */

interface PixelEv { id: number; codigoEvento: string; plataforma: string; nombre: string; pixelId: string; activo: boolean; tieneToken: boolean; tokenFinal?: string; testEventCode?: string }
const VACIO = { id: 0, codigoEvento: '', plataforma: 'META', nombre: '', pixelId: '', capiToken: '', testEventCode: '', activo: true, borrarToken: false };

const Pixeles: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [fm, setFm] = useState({ activo: false, pixelId: '', capiToken: '', borrarToken: false, testEventCode: '' });
  const [ft, setFt] = useState({ activo: false, pixelId: '', token: '', testEventCode: '' });
  const [pixeles, setPixeles] = useState<PixelEv[]>([]);
  const [conciertos, setConciertos] = useState<{ codigoEvento: string; nombre: string }[]>([]);
  const [form, setForm] = useState<typeof VACIO | null>(null);
  const [borrar, setBorrar] = useState<PixelEv | null>(null);

  const cargar = useCallback(async () => {
    const r = await metaConfig();
    if (!r.success) { setError(r.message || 'No se pudo cargar la configuración'); return; }
    setError(''); setMeta(r);
    setFm({ activo: !!r.activo && r.pixelOrigen !== null, pixelId: r.pixelOrigen === 'ajustes' ? r.pixelId : '', capiToken: '', borrarToken: false, testEventCode: r.testEventOrigen === 'ajustes' ? r.testEventCode : '' });
    const t = r.tiktok || {};
    setFt({ activo: !!t.activo, pixelId: t.pixelId || '', token: '', testEventCode: t.testEventCode || '' });
    const p = await pixelesEvento();
    if (p.success) setPixeles(p.data || p.pixeles || []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    listarEventosAdmin().then((l) => setConciertos(l.filter((e) => ['ACTIVO', 'PROXIMO', 'PROCESO'].includes(e.estado)).map((e) => ({ codigoEvento: String(e.codigoEvento).toUpperCase(), nombre: e.nombreConcierto })))).catch(() => undefined);
  }, []);

  const correr = async (fn: () => Promise<{ success?: boolean; message?: string }>, ok?: string, despues?: () => void) => {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    setToast(r.message || (r.success ? ok || 'Listo' : 'No se pudo guardar'));
    if (r.success) { despues?.(); cargar(); }
  };

  return (
    <PanelPagina titulo="Píxeles de publicidad" toast={toast} onToastCerrado={() => setToast('')} cargando={!meta && !error}>
      <IonRefresher slot="fixed" onIonRefresh={async (e) => { await cargar(); e.detail.complete(); }}><IonRefresherContent /></IonRefresher>
      {error && <div className="pn-error">{error}</div>}
      {meta && (
        <>
          <div className="pn-card">
            <h3 className="pn-titulo">Meta (Facebook / Instagram) · toda la página</h3>
            <p className="pn-sub">{meta.estado || (meta.activo ? 'Activo' : 'Apagado')}{meta.tieneToken ? ` · token ····${meta.tokenFinal || ''}` : ' · sin token de la API de Conversiones'}</p>
            <div className="pn-switch"><span className="pn-switch-nombre">Activo</span><IonCheckbox checked={fm.activo} onIonChange={(e) => setFm({ ...fm, activo: e.detail.checked })} /></div>
            <div className="pn-campo"><IonInput label="ID del píxel" labelPlacement="floating" fill="outline" inputmode="numeric" value={fm.pixelId} onIonInput={(e) => setFm({ ...fm, pixelId: String(e.detail.value || '') })} /></div>
            <div className="pn-campo"><IonInput label={meta.tieneToken ? 'Token nuevo (vacío = se mantiene)' : 'Token de la API de Conversiones'} labelPlacement="floating" fill="outline" type="password" value={fm.capiToken} onIonInput={(e) => setFm({ ...fm, capiToken: String(e.detail.value || '') })} /></div>
            <div className="pn-campo"><IonInput label="Código de prueba (opcional)" labelPlacement="floating" fill="outline" value={fm.testEventCode} onIonInput={(e) => setFm({ ...fm, testEventCode: String(e.detail.value || '') })} /></div>
            {meta.tieneToken && <div className="pn-switch"><span className="pn-switch-nombre">Borrar el token guardado</span><IonCheckbox checked={fm.borrarToken} onIonChange={(e) => setFm({ ...fm, borrarToken: e.detail.checked })} /></div>}
            <div className="pn-botones">
              <IonButton className="pn-boton-p" disabled={ocupado} onClick={() => correr(() => metaGuardar({ activo: fm.activo, pixelId: fm.pixelId.trim(), capiToken: fm.capiToken.trim(), borrarToken: fm.borrarToken, testEventCode: fm.testEventCode.trim() }), 'Guardado')}>Guardar</IonButton>
              <IonButton fill="outline" disabled={ocupado} onClick={() => correr(metaProbar, 'Evento de prueba enviado')}>Probar</IonButton>
            </div>
          </div>

          <div className="pn-card">
            <h3 className="pn-titulo">TikTok · toda la página</h3>
            {meta.tiktok && meta.tiktok.migracion === false && <div className="pn-aviso">Falta la actualización de la base de datos <b>2026-10-23-tiktok-general</b>.</div>}
            <div className="pn-switch"><span className="pn-switch-nombre">Activo</span><IonCheckbox checked={ft.activo} onIonChange={(e) => setFt({ ...ft, activo: e.detail.checked })} /></div>
            <div className="pn-campo"><IonInput label="ID del píxel de TikTok" labelPlacement="floating" fill="outline" value={ft.pixelId} onIonInput={(e) => setFt({ ...ft, pixelId: String(e.detail.value || '') })} /></div>
            {meta.tiktok?.migracionToken && (
              <>
                <div className="pn-campo"><IonInput label="Token (vacío = se mantiene)" labelPlacement="floating" fill="outline" type="password" value={ft.token} onIonInput={(e) => setFt({ ...ft, token: String(e.detail.value || '') })} /></div>
                <div className="pn-campo"><IonInput label="Código de prueba (opcional)" labelPlacement="floating" fill="outline" value={ft.testEventCode} onIonInput={(e) => setFt({ ...ft, testEventCode: String(e.detail.value || '') })} /></div>
              </>
            )}
            <div className="pn-botones">
              <IonButton className="pn-boton-p" disabled={ocupado} onClick={() => correr(() => tiktokGuardar({ activo: ft.activo, pixelId: ft.pixelId.trim(), ...(meta.tiktok?.migracionToken ? { token: ft.token.trim(), borrarToken: false, testEventCode: ft.testEventCode.trim() } : {}) }), 'Guardado')}>Guardar</IonButton>
              <IonButton fill="outline" disabled={ocupado} onClick={() => correr(tiktokProbar, 'Evento de prueba enviado')}>Probar</IonButton>
            </div>
          </div>

          <div className="pn-card">
            <div className="pn-lista-top"><h3 className="pn-titulo" style={{ margin: 0 }}>Píxeles por concierto</h3><IonButton size="small" fill="outline" onClick={() => setForm({ ...VACIO })}>Agregar</IonButton></div>
            <p className="pn-sub" style={{ marginTop: 4 }}>Cada píxel solo recibe lo de su concierto (para organizadores externos).</p>
            {pixeles.length === 0 && <p className="pn-vacio">No hay píxeles por concierto.</p>}
            {pixeles.map((p) => (
              <div key={p.id} className="pn-switch">
                <div>
                  <div className="pn-switch-nombre"><b>{p.nombre || p.pixelId}</b> · {p.plataforma}</div>
                  <div className="pn-lista-pie">{p.codigoEvento} · {p.activo ? 'Activo' : 'Apagado'}{p.tieneToken ? ` · token ····${p.tokenFinal || ''}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <IonButton size="small" fill="clear" onClick={() => setForm({ id: p.id, codigoEvento: p.codigoEvento, plataforma: p.plataforma, nombre: p.nombre || '', pixelId: p.pixelId, capiToken: '', testEventCode: p.testEventCode || '', activo: p.activo, borrarToken: false })}>Editar</IonButton>
                  <IonButton size="small" fill="clear" color="danger" onClick={() => setBorrar(p)}>Borrar</IonButton>
                </div>
              </div>
            ))}
          </div>

          {form && (
            <div className="pn-card">
              <h3 className="pn-titulo">{form.id ? 'Editar píxel' : 'Nuevo píxel de concierto'}</h3>
              {!form.id && (
                <>
                  <div className="pn-campo">
                    <IonSelect label="Concierto" labelPlacement="floating" fill="outline" value={form.codigoEvento} onIonChange={(e) => setForm({ ...form, codigoEvento: String(e.detail.value) })}>
                      {conciertos.map((c) => <IonSelectOption key={c.codigoEvento} value={c.codigoEvento}>{c.nombre}</IonSelectOption>)}
                    </IonSelect>
                  </div>
                  <div className="pn-campo">
                    <IonSelect label="Plataforma" labelPlacement="floating" fill="outline" value={form.plataforma} onIonChange={(e) => setForm({ ...form, plataforma: String(e.detail.value) })}>
                      <IonSelectOption value="META">Meta</IonSelectOption><IonSelectOption value="TIKTOK">TikTok</IonSelectOption>
                    </IonSelect>
                  </div>
                </>
              )}
              <div className="pn-campo"><IonInput label="Nombre (para reconocerlo)" labelPlacement="floating" fill="outline" value={form.nombre} onIonInput={(e) => setForm({ ...form, nombre: String(e.detail.value || '') })} /></div>
              <div className="pn-campo"><IonInput label="ID del píxel" labelPlacement="floating" fill="outline" value={form.pixelId} onIonInput={(e) => setForm({ ...form, pixelId: String(e.detail.value || '') })} /></div>
              <div className="pn-campo"><IonInput label="Token (vacío = se mantiene)" labelPlacement="floating" fill="outline" type="password" value={form.capiToken} onIonInput={(e) => setForm({ ...form, capiToken: String(e.detail.value || '') })} /></div>
              <div className="pn-campo"><IonInput label="Código de prueba (opcional)" labelPlacement="floating" fill="outline" value={form.testEventCode} onIonInput={(e) => setForm({ ...form, testEventCode: String(e.detail.value || '') })} /></div>
              <div className="pn-switch"><span className="pn-switch-nombre">Activo</span><IonCheckbox checked={form.activo} onIonChange={(e) => setForm({ ...form, activo: e.detail.checked })} /></div>
              <div className="pn-botones">
                <IonButton className="pn-boton-p" disabled={ocupado || !form.pixelId.trim() || (!form.id && !form.codigoEvento)}
                  onClick={() => correr(() => (form.id
                    ? pixelEditar(form.id, { pixelId: form.pixelId.trim(), nombre: form.nombre.trim(), capiToken: form.capiToken.trim(), borrarToken: false, testEventCode: form.testEventCode.trim(), activo: form.activo })
                    : pixelCrear({ codigoEvento: form.codigoEvento, plataforma: form.plataforma, nombre: form.nombre.trim(), pixelId: form.pixelId.trim(), capiToken: form.capiToken.trim(), testEventCode: form.testEventCode.trim(), activo: form.activo })), 'Guardado', () => setForm(null))}>Guardar</IonButton>
                {form.id > 0 && form.plataforma === 'META' && <IonButton fill="outline" disabled={ocupado} onClick={() => correr(() => pixelProbar(form.id), 'Evento de prueba enviado')}>Probar</IonButton>}
                <IonButton fill="outline" onClick={() => setForm(null)}>Cancelar</IonButton>
              </div>
            </div>
          )}
        </>
      )}
      <IonAlert isOpen={!!borrar} onDidDismiss={() => setBorrar(null)} header="¿Borrar este píxel?" message={borrar ? `${borrar.nombre || borrar.pixelId} (${borrar.codigoEvento})` : ''}
        buttons={[{ text: 'No', role: 'cancel' }, { text: 'Sí, borrar', role: 'destructive', handler: () => { if (borrar) correr(() => pixelBorrar(borrar.id), 'Píxel borrado'); } }]} />
    </PanelPagina>
  );
};

export default Pixeles;
