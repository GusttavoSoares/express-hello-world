import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PHONE_ID = process.env.META_PHONE_ID;
const PRIVATE_KEY_PATH = '/etc/secrets/private.pem';
const FLOW_EXTRACAO_PAGAMENTO_TOKEN = process.env.FLOW_EXTRACAO_PAGAMENTO_TOKEN;

const PRIVATE_KEY = crypto.createPrivateKey({
  key: fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'),
});

// Import Express.js

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

// para receber os dados do flow de pagamento
app.post('/flow', async  (req, res) => {
  const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(
    req.body,
    PRIVATE_KEY,
  );

  if (!decryptedBody.data) {
    const healthResponse = { data: { status: "active" } };
    return res.send(encryptResponse(healthResponse, aesKeyBuffer, initialVectorBuffer));
  }

  //const { screen, data, version, action } = decryptedBody;
  const incomingData = decryptedBody.data;

  const screenDataObject = {
    screen: "CONFIRM_PAYMENT",
    data: {
      extension_message_response: {
        params: {
          flow_token: "flows-builder-2b739fc7", 
          fornecedor: "18288049000157",
          data_emissao: "2025",
          data_vencimento: "2026",
          valor_original: "550",
          descontos: "50",
          descricao: "Exemplo de descrição",
          tipo_documento: "Boleto Bancário",
          numero_documento: "88723"
        }
      }
    }
  };

  //const screenData = JSON.stringify(screenDataObject);
  //const strobj= JSON.parse(screenData);

  res.send(encryptResponse(screenDataObject, aesKeyBuffer, initialVectorBuffer));
});

const decryptRequest = (body, privatePem) => {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector} = body;

  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );


  const flowDataBuffer = Buffer.from(encrypted_flow_data, "base64");
  const initialVectorBuffer = Buffer.from(initial_vector, "base64");

  const TAG_LENGTH = 16;
  const encrypted_flow_data_body = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const encrypted_flow_data_tag = flowDataBuffer.subarray(-TAG_LENGTH);

  const decipher = crypto.createDecipheriv(
    "aes-128-gcm",
    decryptedAesKey,
    initialVectorBuffer,
  );
  decipher.setAuthTag(encrypted_flow_data_tag);

  const decryptedJSONString = Buffer.concat([
    decipher.update(encrypted_flow_data_body),
    decipher.final(),
  ]).toString("utf-8");

  return {
    decryptedBody: JSON.parse(decryptedJSONString),
    aesKeyBuffer: decryptedAesKey,
    initialVectorBuffer,
  };
};

const encryptResponse = (
  response,
  aesKeyBuffer,
  initialVectorBuffer,
) => {
  const flipped_iv = [];
  for (const pair of initialVectorBuffer.entries()) {
    flipped_iv.push(~pair[1]);
  }

  const cipher = crypto.createCipheriv(
    "aes-128-gcm",
    aesKeyBuffer,
    Buffer.from(flipped_iv),
  );
  return Buffer.concat([
    cipher.update(JSON.stringify(response), "utf-8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
};

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
      } else if (msg.type === 'text' && msg.text.body.toLowerCase().includes('fornecedor')) {
          //const texto = msg.text.body.toLowerCase();
          SendMessage(msg.from, 'Dados corrigidos recebidos! Obrigado.');
        }
    });
  }

  res.status(200).end();
});

async function SendMessage(deliveryTo, message) {
  try {
    await axios({
      method: 'post',
      url: `https://graph.facebook.com/v23.0/${META_PHONE_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
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

  const flow_action_data = {
  fornecedor: body.cnpj_cpf,
  data_emissao: body.emission_date,
  data_vencimento: body.expiration_date,
  valor_original: body.original_value.toString(),
  descontos: body.discount_value.toString(),
  descricao: body.description,
  tipo_documento: body.document_type,
  numero_documento: body.document_number
};


  try {
    await axios({
      method: 'post',
      url: `https://graph.facebook.com/v23.0/${META_PHONE_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
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
              index: "0",
              parameters: [{ type: "payload", payload: "Confirmar" }]
            },
            {
              type: "button",
              sub_type: "flow",
              index: "1",
              parameters: [
                { 
                  type: "action", 
                  action: { 
                    flow_token: FLOW_EXTRACAO_PAGAMENTO_TOKEN, 
                    flow_action_data: flow_action_data
                  }
                }
              ]
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
