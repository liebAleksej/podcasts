/**
 * Serverless-функция для обновления тикета UseDesk: записывает ссылку RSS
 * в дополнительное поле тикета. Токен API хранится в переменных окружения.
 *
 * Переменные окружения:
 *   USEDESK_API_TOKEN — токен API канала UseDesk (обязательно)
 *   USEDESK_RSS_FIELD_ID — id дополнительного поля «Ссылка на RSS» (обязательно,
 *       если не передаётся field_id в теле запроса или в URL формы)
 */

const USEDESK_UPDATE_URL = 'https://api.usedesk.ru/update/ticket';

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
  const defaultFieldId = process.env.USEDESK_RSS_FIELD_ID;

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
  const rssUrl = body.rss_url && String(body.rss_url).trim();
  const fieldId = body.field_id != null ? String(body.field_id).trim() : defaultFieldId;

  if (!ticketId || !rssUrl) {
    sendJson(res, 400, { error: 'Нужны параметры ticket_id и rss_url' });
    return;
  }

  if (!fieldId) {
    sendJson(res, 400, {
      error: 'Не указан id поля для RSS. Задайте USEDESK_RSS_FIELD_ID или передайте field_id в URL формы.',
    });
    return;
  }

  const formData = new URLSearchParams();
  formData.append('api_token', apiToken);
  formData.append('ticket_id', ticketId);
  formData.append('field_id', fieldId);
  formData.append('field_value', rssUrl);

  try {
    const response = await fetch(USEDESK_UPDATE_URL, {
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
      result = { status: 'ok' };
    }

    if (result.status === 'success' || result.status === 'ok') {
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 502, { error: result.message || text.slice(0, 200) });
    }
  } catch (err) {
    sendJson(res, 502, {
      error: 'Ошибка при обращении к UseDesk',
      details: err.message,
    });
  }
}
