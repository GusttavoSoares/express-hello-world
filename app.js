require('dotenv').config();
const axios = require('axios'); 

const meta_access_token = process.env.META_ACCESS_TOKEN;
const meta_phone_id = process.env.META_PHONE_ID;

// Import Express.js
const express = require('express');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// Route for GET requests
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route for POST requests
app.post('/webhook', (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));

  const entry = req.body.entry;
  if (!entry || entry.length === 0) return res.status(200).end();

  const changes = entry[0].changes;
  if (!changes || changes.length === 0) return res.status(200).end();

  const messages = changes[0].value.messages;
  
  if (messages && messages.length > 0) {
    messages.forEach(msg => {
      if (msg.type === 'image') {
        replyMessage(msg.from, msg.id);
      } else if (msg.type === 'button') {
        if (msg.button.payload === 'Confirmar') {
          SendMessage(msg.from, 'Dados confirmados! Obrigado.');
        }
      } else if (msg.type === 'text') {
          //const texto = msg.text.body.toLowerCase();
          SendMessage(msg.from, 'Dados corrigidos recebido! Obrigado.');
        }
    });
  }

  res.status(200).end();
});

async function SendMessage(deliveryTo, message) {
  try {
    await axios({
      method: 'post',
      url: `https://graph.facebook.com/v23.0/${meta_phone_id}/messages`,
      headers: {
        'Authorization': `Bearer ${meta_access_token}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: "whatsapp",
        to: deliveryTo,
        type: "text",
        text: { body: message }
      }
    });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.response?.data || err.message);
  }
}

// Função para responder com o template
async function replyMessage(deliveryTo, messageId) {
  const body = {
    cnpj_cpf: "18288049000157",
    emission_date: "24/09/2025",
    expiration_date: "24/09/2026",
    original_value: 550,
    discount_value: 50,
    description: "Exemplo de descrição",
    document_type: "Boleto Bancário",
    document_number: "88723",
  };

  try {
    await axios({
      method: 'post',
      url: `https://graph.facebook.com/v23.0/${meta_phone_id}/messages`,
      headers: {
        'Authorization': `Bearer ${meta_access_token}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: "whatsapp",
        to: deliveryTo,
        type: "template",
        template: {
          name: "extracao_de_pagamento",
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: body.cnpj_cpf },
                { type: "text", text: body.emission_date },
                { type: "text", text: body.expiration_date },
                { type: "text", text: body.original_value.toString() },
                { type: "text", text: body.discount_value.toString() },
                { type: "text", text: body.description },
                { type: "text", text: body.document_type },
                { type: "text", text: body.document_number }
              ]
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: 0,
              parameters: [{ type: "payload", payload: "Confirmar" }]
            }
          ]
        },
        context: { message_id: messageId }
      }
    });
  } catch (err) {
    console.error('Erro ao responder mensagem:', err.response?.data || err.message);
  }
}

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
