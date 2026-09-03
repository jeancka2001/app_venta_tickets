/* Cabeceras obligatorias para TODOS los servicios bajo
   https://api.t-ickets.com/ms_login/* — mismas que usa app_tickets (la app
   de compra). No aplica a otros dominios/rutas del backend (mikroti/Boleteria,
   ticket/api/v1, etc.), que solo necesitan el Basic (authorization-ticket). */
export const MS_LOGIN_AUTH_HEADERS = {
  'Authorization': 'Bearer 95035267341b4e54ad0abf6bd35e678ea3eb0c1b6d280f4e768484d6f3ba5b4e',
  'authorization-ticket': 'Basic Ym9sZXRlcmlhOmJvbGV0ZXJpYQ==',
};
