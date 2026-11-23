import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IonApp, IonContent, IonHeader, IonPage, IonToolbar, setupIonicReact } from '@ionic/react';
import { readFileSync } from 'node:fs';
import { menuController as controladorPrincipal } from '@ionic/core';
// '@ionic/core/components' es el que usa @ionic/react para sus menús
import { menuController as controladorComponentes } from '@ionic/core/components';

vi.mock('../utils/staffAuth', () => ({ obtenerStaffData: () => ({ id: 1, name: 'Ana', perfil: 'admin' }), staffAuthHeaders: () => ({}) }));
vi.mock('../utils/permisosPaginas', async (orig) => ({ ...(await orig<typeof import('../utils/permisosPaginas')>()), actualizarMisPaginas: async () => true }));

import MenuPaginas, { BotonMenu, ID_CONTENIDO } from './MenuPaginas';

setupIonicReact();

/* El botón de las 3 rayas no hacía nada al pasar la app a Android: llamaba a un menuController importado de '@ionic/core', que es OTRA
   copia del controlador (la que usa <IonMenu> viene de '@ionic/core/components'), así que no encontraba el menú. */
describe('botón del menú', () => {
  it('hay dos controladores de menú distintos en Ionic: el botón NO debe usar el de "@ionic/core"', () => {
    expect(controladorPrincipal).not.toBe(controladorComponentes);
    const codigo = readFileSync('src/components/MenuPaginas.tsx', 'utf8');
    expect(codigo).not.toMatch(/from\s+['"]@ionic\/core['"]/);
    expect(codigo).not.toMatch(/menuController\.(open|close|toggle)/);
  });

  it('la pantalla lleva el botón de menú de Ionic y el menú lateral', () => {
    const { container } = render(
      <MemoryRouter>
        <IonApp>
          <MenuPaginas />
          <div id={ID_CONTENIDO}>
            <IonPage>
              <IonHeader><IonToolbar><BotonMenu /></IonToolbar></IonHeader>
              <IonContent>hola</IonContent>
            </IonPage>
          </div>
        </IonApp>
      </MemoryRouter>
    );
    expect(container.querySelector('ion-menu-button')).toBeTruthy();
    expect(container.querySelector('ion-menu')).toBeTruthy();
  });
});
