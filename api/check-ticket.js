/**
 * Serverless-функция для проверки тикета UseDesk.
 * Возвращает, заполнено ли поле с RSS (ticket_field_id=25995 по умолчанию).
 *
 * Переменные окружения:
 *   USEDESK_API_TOKEN — токен API канала UseDesk (обязательно)
 *   USEDESK_RSS_CHECK_FIELD_ID — id проверяемого поля (опционально, по умолчанию 25995)
 */

const USEDESK_TICKET_URL = 'https://api.usedesk.ru/ticket';

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function isNotEmpty(value) {
  return value != null && String(value).trim() !== '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Метод не разрешён' });
    return;
  }

  const apiToken = process.env.USEDESK_API_TOKEN;
  const envFieldId = process.env.USEDESK_RSS_CHECK_FIELD_ID;

  if (!apiToken) {
    sendJson(res, 500, { error: 'Не настроен USEDESK_API_TOKEN' });
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    sendJson(res, 400, { error: 'Неверный JSON в теле запроса' });
    return;
  }

  const ticketId = body.ticket_id && String(body.ticket_id).trim();
  const fieldIdRaw = body.check_field_id != null ? body.check_field_id : (envFieldId || 25995);
  const fieldId = String(fieldIdRaw).trim();

  if (!ticketId) {
    sendJson(res, 400, { error: 'Нужен параметр ticket_id' });
    return;
  }

  const formData = new URLSearchParams();
  formData.append('api_token', apiToken);
  formData.append('ticket_id', ticketId);

  try {
    const response = await fetch(USEDESK_TICKET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const text = await response.text();
    if (!response.ok) {
      sendJson(res, 502, {
        error: 'UseDesk вернул ошибку',
        details: text.slice(0, 200),
      });
      return;
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      sendJson(res, 502, { error: 'UseDesk вернул невалидный JSON' });
      return;
    }

    const customFields = Array.isArray(result.custom_fields) ? result.custom_fields : [];
    const matched = customFields.find((item) => String(item.ticket_field_id) === fieldId);
    const currentValue = matched ? matched.value : null;
    const alreadySent = isNotEmpty(currentValue);

    sendJson(res, 200, {
      success: true,
      ticket_id: ticketId,
      checked_field_id: Number(fieldId),
      already_sent: alreadySent,
      value: alreadySent ? String(currentValue) : '',
    });
  } catch (err) {
    sendJson(res, 502, {
      error: 'Ошибка при обращении к UseDesk',
      details: err.message,
    });
  }
}
