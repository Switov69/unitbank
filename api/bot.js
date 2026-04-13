const { getPool, genId, formatAmount, addTransaction, notifyTelegram } = require('./_db');

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-unitbank.vercel.app';
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

async function tgCall(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function saveKnownUser(telegramId, firstName) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO users (id,nickname,pin,telegram_id,telegram_first_name) VALUES ($1,$2,'',$3,$4)
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_first_name=EXCLUDED.telegram_first_name`,
    [genId(), `tg_${telegramId}`, telegramId, firstName || '']
  ).catch(() => {});
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const firstName = msg.from?.first_name || 'Игрок';
  if (msg.from?.id) await saveKnownUser(msg.from.id, firstName);

  if (text === '/start') {
    return tgCall('sendMessage', {
      chat_id: chatId,
      text: `👋 Привет, <b>${firstName}</b>!\n\n🏦 <b>UnitBank</b> — виртуальный банк для Minecraft-сервера.\n\n💳 Управляй счетами\n💰 Переводи CBC другим игрокам\n📋 Оформляй кредиты\n\nНажми кнопку ниже 👇`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🏦 Открыть UnitBank', web_app: { url: WEBAPP_URL } }]] },
    });
  }

  if (text === '/help') {
    return tgCall('sendMessage', {
      chat_id: chatId,
      text: `ℹ️ <b>Помощь по UnitBank</b>\n\n<b>Счета</b>\n• Максимум 2 счёта\n• Формат: <code>ub-название</code>\n\n<b>Кредиты</b>\n• Максимум 50 CBC\n• Ставка: 2% в неделю\n• Требуют одобрения\n\n<b>Безопасность</b>\n• Блокировка после 3 попыток PIN\n\n/start /help /balance`,
      parse_mode: 'HTML',
    });
  }

  if (text === '/balance') {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT a.name,a.balance FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.telegram_id=$1 ORDER BY a.created_at',
      [chatId]
    );
    if (!rows.length) {
      return tgCall('sendMessage', {
        chat_id: chatId,
        text: '💳 Счета не найдены. Откройте UnitBank для регистрации.',
        reply_markup: { inline_keyboard: [[{ text: '🏦 Открыть UnitBank', web_app: { url: WEBAPP_URL } }]] },
      });
    }
    const lines = rows.map((r) => `• <code>${r.name}</code>: <b>${formatAmount(r.balance)} CBC</b>`);
    return tgCall('sendMessage', { chat_id: chatId, text: `💳 <b>Ваши счета</b>\n\n${lines.join('\n')}`, parse_mode: 'HTML' });
  }
}

async function handleCallbackQuery(query) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const data = query.data || '';
  if (!ADMIN_TELEGRAM_ID || String(chatId) !== String(ADMIN_TELEGRAM_ID)) {
    return tgCall('answerCallbackQuery', { callback_query_id: query.id, text: '⛔ Нет доступа' });
  }

  const [action, creditId] = data.split(':');
  if (!creditId) return tgCall('answerCallbackQuery', { callback_query_id: query.id });

  const pool = getPool();

  if (action === 'approve') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query("SELECT * FROM credits WHERE id=$1 AND status='pending' FOR UPDATE", [creditId]);
      if (!rows[0]) { await client.query('ROLLBACK'); return tgCall('answerCallbackQuery', { callback_query_id: query.id, text: 'Уже обработан' }); }
      const credit = rows[0];
      await client.query("UPDATE credits SET status='active' WHERE id=$1", [credit.id]);
      await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [credit.amount, credit.target_account_id]);
      await addTransaction(client, credit.target_account_id, 'credit', parseFloat(credit.amount), `Кредит одобрен: +${formatAmount(credit.amount)} CBC`);
      await client.query('COMMIT');
      const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
      if (uRows[0]?.telegram_id) notifyTelegram(uRows[0].telegram_id, `✅ <b>Кредит одобрен!</b>\n\nСумма: <b>${formatAmount(credit.amount)} CBC</b>\nЗачислена на счёт.\n\n📌 Ставка: 2% в неделю.`);
      await tgCall('editMessageText', { chat_id: chatId, message_id: messageId, text: query.message.text + '\n\n✅ <b>Одобрено</b>', parse_mode: 'HTML' }).catch(() => {});
      tgCall('answerCallbackQuery', { callback_query_id: query.id, text: '✅ Одобрено' });
    } catch (e) { await client.query('ROLLBACK'); tgCall('answerCallbackQuery', { callback_query_id: query.id, text: `Ошибка: ${e.message}` }); }
    finally { client.release(); }
  }

  if (action === 'reject') {
    const { rows } = await pool.query("UPDATE credits SET status='rejected' WHERE id=$1 AND status='pending' RETURNING *", [creditId]);
    if (!rows[0]) return tgCall('answerCallbackQuery', { callback_query_id: query.id, text: 'Уже обработан' });
    const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [rows[0].user_id]);
    if (uRows[0]?.telegram_id) notifyTelegram(uRows[0].telegram_id, `❌ <b>Кредит отклонён</b>\n\nЗаявка на ${formatAmount(rows[0].amount)} CBC отклонена администратором.`);
    await tgCall('editMessageText', { chat_id: chatId, message_id: messageId, text: query.message.text + '\n\n❌ <b>Отклонено</b>', parse_mode: 'HTML' }).catch(() => {});
    tgCall('answerCallbackQuery', { callback_query_id: query.id, text: '❌ Отклонено' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const update = req.body;
    if (update.message) await handleMessage(update.message);
    if (update.callback_query) await handleCallbackQuery(update.callback_query);
  } catch (e) {
    console.error('Bot error:', e);
  }
  res.json({ ok: true });
};
