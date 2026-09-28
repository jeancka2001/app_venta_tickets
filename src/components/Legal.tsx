import { useState } from 'react';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
} from '@ionic/react';
import './Legal.css';

export const URL_POLITICA_PRIVACIDAD = 'https://t-ickets.com/politica-privacidad-tickets.html';

/* Mismo contenido que el modal de Términos de la web (TicketsWeb), depurado:
   sin cláusulas duplicadas y con la excepción de reembolso por evento cancelado. */
const TERMINOS: { titulo: string; texto: string }[] = [
  {
    titulo: '1. Objeto',
    texto: 'T-ICKETS es una marca registrada de TICKETSECUADOR S.A. (RUC 0993377293001) cuyo objeto, para efectos de las presentes condiciones, es la emisión y comercialización de entradas para eventos o espectáculos a través de su sitio web www.t-ickets.com, sus aplicaciones móviles y sus puntos de venta autorizados.',
  },
  {
    titulo: '2. Envío de los tickets',
    texto: 'Una vez confirmada la compra, los tickets se envían al correo electrónico registrado y quedan disponibles en la aplicación, indicando el evento, fecha, hora, localidad, valor pagado y las políticas de ingreso. No existen cambios ni cancelaciones de compra, salvo lo dispuesto en la Política de Reembolsos para eventos cancelados.',
  },
  {
    titulo: '3. El cliente',
    texto: 'EL CLIENTE es el usuario que adquiere los tickets y está registrado en www.t-ickets.com, en la aplicación o en el sistema de los puntos de venta de T-ICKETS. Declara que la información personal ingresada es real y es el único responsable de ella. T-ICKETS no se hace responsable por tickets falsos, adulterados o adquiridos en lugares no autorizados. Quien suministre información falsa o use sus entradas para falsificaciones o adulteraciones responderá ante las autoridades competentes, lo que puede dar lugar a responsabilidad penal.',
  },
  {
    titulo: '4. Responsabilidad del organizador',
    texto: 'EL CLIENTE acepta haber verificado la información de las entradas seleccionadas. La realización del evento no depende de T-ICKETS, quien actúa como intermediario y no se responsabiliza por la calidad del espectáculo, condiciones de seguridad, organización, contenido o causas ajenas a su responsabilidad. El ticket es válido solo para el día, hora y lugar indicados; el ingreso después de la hora señalada está sujeto a las reglas del escenario. El empresario o promotor es el responsable legal del evento.',
  },
  {
    titulo: '5. Pérdida del ticket y cargos de servicio',
    texto: 'T-ICKETS no se hace responsable por la pérdida, robo o uso indebido del ticket (incluido compartir su código QR); no existe obligación de emitir uno nuevo ni de permitir el ingreso. El cliente acepta que los tickets tienen un costo adicional por el servicio del sistema T-ICKETS, que no es reembolsable. Solo son válidos para el ingreso los tickets emitidos por T-ICKETS, completos y sin alteraciones.',
  },
  {
    titulo: '6. Cambios en el evento',
    texto: 'Los organizadores se reservan el derecho de admisión y el derecho de agregar, modificar o sustituir artistas, así como de variar programas, precios, ubicaciones, fechas y capacidad del escenario. Si el evento es postergado, el ticket será válido para la nueva fecha indicada por el empresario.',
  },
  {
    titulo: '7. Seguridad y comportamiento',
    texto: 'Al ingreso y durante el evento, los asistentes estarán sujetos a las medidas de seguridad del escenario. A quien no cumpla los controles se le prohibirá el ingreso o se le solicitará su retiro, sin devolución del valor pagado. En localidades numeradas se debe respetar el asiento asignado. No se permite el ingreso de cámaras de video o fotográficas profesionales, bebidas alcohólicas u objetos que pongan en peligro la seguridad del público.',
  },
  {
    titulo: '8. Verificación de pagos',
    texto: 'Las compras están sujetas a la verificación y aprobación del pago por parte del banco, pasarela de pago o entidad financiera. Los pagos por transferencia o depósito se aprueban una vez validado el comprobante. T-ICKETS podrá anular compras cuyo pago no sea confirmado o presente indicios de fraude.',
  },
  {
    titulo: '9. Cancelación del evento',
    texto: 'En caso de cancelación definitiva del evento, el cliente podrá solicitar el reembolso del valor de la entrada dentro de los 15 días siguientes al anuncio de la cancelación, escribiendo a infotickets@t-ickets.com o al WhatsApp +593 98 000 9000 con sus datos personales, el comprobante de pago y los datos de la cuenta bancaria para la transferencia. Los cargos por servicio no son reembolsables. El reembolso puede tardar hasta 30 días en acreditarse una vez validada la solicitud. Detalles en la Política de Reembolsos publicada en www.t-ickets.com.',
  },
  {
    titulo: '10. Cuenta de usuario',
    texto: 'El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso y de toda actividad realizada desde su cuenta. T-ICKETS podrá suspender cuentas usadas para fraude, reventa no autorizada o incumplimiento de estos términos.',
  },
  {
    titulo: '11. Datos personales',
    texto: 'El tratamiento de los datos personales se rige por la Política de Privacidad de T-ICKETS, conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.',
  },
  {
    titulo: '12. Legislación aplicable',
    texto: 'Las compras se entienden efectuadas en los términos de la legislación ecuatoriana, en particular la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos y su Reglamento, por lo que la contratación electrónica se reputa válida y obliga al usuario.',
  },
];

export const abrirPoliticaPrivacidad = () => window.open(URL_POLITICA_PRIVACIDAD, '_system');

export const TerminosModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <IonModal isOpen={isOpen} onDidDismiss={onClose}>
    <IonHeader>
      <IonToolbar className="legal-toolbar">
        <IonTitle>Términos y condiciones</IonTitle>
        <IonButtons slot="end">
          <IonButton onClick={onClose}>Cerrar</IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent className="legal-content">
      <div className="legal-body">
        {TERMINOS.map(t => (
          <section key={t.titulo}>
            <h3>{t.titulo}</h3>
            <p>{t.texto}</p>
          </section>
        ))}
        <p className="legal-nota">
          Consulta también nuestra{' '}
          <a onClick={abrirPoliticaPrivacidad}>Política de Privacidad</a>.
        </p>
      </div>
    </IonContent>
  </IonModal>
);

/* Fila de enlaces "Términos y condiciones · Política de privacidad".
   `claro` para fondos oscuros. */
export const LegalLinks: React.FC<{ claro?: boolean }> = ({ claro }) => {
  const [verTerminos, setVerTerminos] = useState(false);
  return (
    <>
      <p className={`legal-links${claro ? ' legal-links-claro' : ''}`}>
        <a onClick={() => setVerTerminos(true)}>Términos y condiciones</a>
        <span> · </span>
        <a onClick={abrirPoliticaPrivacidad}>Política de privacidad</a>
      </p>
      <TerminosModal isOpen={verTerminos} onClose={() => setVerTerminos(false)} />
    </>
  );
};
