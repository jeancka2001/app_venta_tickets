import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/* Diagnóstico temporal: sin esto, un error sin capturar durante el render
   (React 18 desmonta todo el árbol) deja la pantalla completamente en
   blanco y no hay forma de saber por qué -- ahora en vez de blanco se ve
   el mensaje/stack real encima de lo que quedó renderizado. Quitar una
   vez encontrado el bug de la pantalla en blanco con perfil vendedor. */
const mostrarErrorEnPantalla = (titulo: string, detalle: string) => {
  let overlay = document.getElementById('crash-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'crash-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:#1a1e52;color:#fff;padding:16px;' +
      'font:12px/1.5 monospace;white-space:pre-wrap;overflow:auto;z-index:999999;';
    document.body.appendChild(overlay);
  }
  overlay.textContent = `${titulo}\n\n${detalle}`;
};

window.addEventListener('error', (event) => {
  mostrarErrorEnPantalla('Error inesperado (pantalla en blanco)', `${event.message}\n\n${event.error?.stack ?? '(sin stack)'}`);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: string; stack?: string } | undefined;
  mostrarErrorEnPantalla('Promesa rechazada sin capturar', `${reason?.message ?? String(reason)}\n\n${reason?.stack ?? '(sin stack)'}`);
});

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
