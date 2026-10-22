// Textos que se copian para mandar a inquilinos y propietarios.
import { fmtDate } from './fechas.js';

export function renewalMessage(vencDate) {
  const fecha = vencDate ? fmtDate(vencDate) : '?';
  return `Hola! Te escribo desde Mi Inmobiliaria. Te avisamos que el contrato de arrendamiento vence el ${fecha}. A partir de esa fecha el contrato ya no tendría vigencia, por lo que si seguís en el apartamento habría que hacer la renovación, de esto nos encargamos nosotros. La renovación se haría en base al ajuste de IPC correspondiente. Te avisamos con anticipación por las dudas. Aguardo tus comentarios!`;
}
