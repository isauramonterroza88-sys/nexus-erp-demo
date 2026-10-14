'use strict';

const {fechaLocalISO} = require('./database');

const PLANTILLAS = {
  factura_digital: 'Hola {{1}}, tu factura {{2}} por {{3}} ya está disponible. Verifícala con el código {{4}} escaneando el QR del documento.',
  confirmacion_pago: 'Hola {{1}}, recibimos tu pago de {{2}} de la factura {{3}}. ¡Gracias por tu confianza!',
  promocion: '{{1}}'
};

const cop = (n) => new Intl.NumberFormat('es-CO', {style: 'currency', currency: 'COP', maximumFractionDigits: 0}).format(n);

const mensajesDeHoy = (datos) => datos.mensajes.filter((m) => fechaLocalISO(new Date(m.ts)) === fechaLocalISO() && m.estado !== 'fallido');

const capDiaria = (datos) => datos.config.marketing.capDiaria;

const cupoDisponible = (datos) => Math.max(0, capDiaria(datos) - mensajesDeHoy(datos).length);

/* Payload con la forma oficial de POST /v16.0/{phone-number-id}/messages de la WhatsApp Cloud API */
function construirPayload(cliente, plantilla, parametros) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cliente.telefono.replace('+', ''),
    type: 'template',
    template: {
      name: plantilla,
      language: {code: 'es'},
      components: [{type: 'body', parameters: parametros.map((t) => ({type: 'text', text: String(t)}))}]
    }
  };
}

const renderizar = (plantilla, parametros) => PLANTILLAS[plantilla].replace(/\{\{(\d+)\}\}/g, (_, n) => parametros[Number(n) - 1]);

function registrarMensaje(datos, {tipo, cliente, plantilla, parametros, referencia, campanaId, score}) {
  const payload = construirPayload(cliente, plantilla, parametros);
  const mensaje = {
    id: datos.siguienteId('mensajes'),
    ts: new Date().toISOString(),
    tipo,
    clienteId: cliente.id,
    clienteNombre: cliente.razonSocial,
    plantilla,
    texto: renderizar(plantilla, parametros),
    referencia: referencia || null,
    campanaId: campanaId || null,
    score: score === undefined ? null : score,
    estado: 'enviado',
    payload
  };
  datos.mensajes.push(mensaje);
  datos.log('info', 'canal_digital', `POST /v16.0/{phone-number-id}/messages -> +${payload.to} (${tipo}: ${plantilla})`, {headers: {Authorization: 'Bearer ••••••••'}, body: payload});
  return mensaje;
}

module.exports = {PLANTILLAS, cop, mensajesDeHoy, capDiaria, cupoDisponible, construirPayload, registrarMensaje};
