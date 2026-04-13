const pkg = require('pg');
const { Pool } = pkg;

let _pool;
function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return _pool;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

function formatAmount(n) {
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rowToUser(r) {
  return { id: r.id, nickname: r.nickname, telegramId: r.telegram_id ? Number(r.telegram_id) : null, telegramFirstName: r.telegram_first_name || '', pin: r.pin, createdAt: r.created_at };
}

function rowToAccount(r) {
  return { id: r.id, userId: r.user_id, name: r.name, balance: parseFloat(r.balance), color: r.color || '#4285f4', createdAt: r.created_at };
}

function rowToTransaction(r) {
  return { id: r.id, accountId: r.account_id, type: r.type, amount: parseFloat(r.amount), description: r.description, createdAt: r.created_at };
}

function rowToCredit(r) {
  return { id: r.id, userId: r.user_id, targetAccountId: r.target_account_id, amount: parseFloat(r.amount), paidAmount: parseFloat(r.paid_amount), interestSent: parseFloat(r.interest_sent), interestRate: parseFloat(r.interest_rate), purpose: r.purpose || '', status: r.status, createdAt: r.created_at };
}

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function addTransaction(client, accountId, type, amount, description) {
  await client.query(
    'INSERT INTO transactions (id, account_id, type, amount, description) VALUES ($1,$2,$3,$4,$5)',
    [genId(), accountId, type, amount, description]
  );
}

async function notifyTelegram(chatId, text) {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

module.exports = { getPool, genId, formatAmount, rowToUser, rowToAccount, rowToTransaction, rowToCredit, sendError, addTransaction, notifyTelegram };
