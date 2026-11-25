import { describe, expect, it, vi } from 'vitest';
import { consultarChatsPendientes, pendientesChats, type DepsChats } from './chatsPendientes';

/* Contador de chats por atender en el menú de la app: solo cuenta con sesión y la página Chats habilitada */
const deps = (habilitado: boolean, respuesta: ReturnType<DepsChats['leer']>): DepsChats & { leer: ReturnType<typeof vi.fn> } => ({
  habilitado: () => habilitado,
  leer: vi.fn(() => respuesta),
});

describe('contador de chats pendientes del menú', () => {
  it('toma los chats sin responder del servidor', async () => {
    await consultarChatsPendientes(deps(true, Promise.resolve({ success: true, pendientes: { sin_responder: 4 } })));
    expect(pendientesChats()).toBe(4);
  });

  it('sin la página Chats habilitada (o sin sesión) no consulta y vuelve a cero', async () => {
    const d = deps(false, Promise.resolve({ success: true, pendientes: { sin_responder: 9 } }));
    await consultarChatsPendientes(d);
    expect(d.leer).not.toHaveBeenCalled();
    expect(pendientesChats()).toBe(0);
  });

  it('un fallo de red deja el contador como estaba; un 403 (permiso quitado) lo apaga', async () => {
    await consultarChatsPendientes(deps(true, Promise.resolve({ success: true, pendientes: { sin_responder: 3 } })));
    await consultarChatsPendientes(deps(true, Promise.resolve({ success: false })));
    expect(pendientesChats()).toBe(3);
    await consultarChatsPendientes(deps(true, Promise.resolve({ success: false, status: 403 })));
    expect(pendientesChats()).toBe(0);
  });
});
