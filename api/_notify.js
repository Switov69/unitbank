export async function notifyTelegram(chatId, text) {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

export async function notifyAdmin(text, inlineKeyboard) {
  const token = process.env.BOT_TOKEN;
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!token || !adminId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: adminId,
      text,
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
    }),
  }).catch(() => {});
}
