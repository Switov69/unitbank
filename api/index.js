import pkg from 'pg';
const { Pool } = pkg;

let _pool;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
  return _pool;
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 11); }
function fmt(n) { return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function rowToUser(r) {
  return { id: r.id, nickname: r.nickname, telegramId: r.telegram_id ? Number(r.telegram_id) : null, telegramFirstName: r.telegram_first_name || '', pin: r.pin, isPremium: !!r.is_premium, premiumUntil: r.premium_until || null, createdAt: r.created_at };
}
function rowToAccount(r) { return { id: r.id, userId: r.user_id, name: r.name, balance: parseFloat(r.balance), color: r.color || '#4285f4', createdAt: r.created_at }; }
function rowToTransaction(r) { return { id: r.id, accountId: r.account_id, type: r.type, amount: parseFloat(r.amount), description: r.description, createdAt: r.created_at }; }
function rowToCredit(r) { return { id: r.id, userId: r.user_id, targetAccountId: r.target_account_id, amount: parseFloat(r.amount), paidAmount: parseFloat(r.paid_amount), interestSent: parseFloat(r.interest_sent), interestRate: parseFloat(r.interest_rate), purpose: r.purpose || '', status: r.status, createdAt: r.created_at }; }

function rowToParcel(r) {
  return { id: r.id, ttn: r.ttn, senderNickname: r.sender_nickname, recipientNickname: r.recipient_nickname, description: r.description || '', fromOfficeId: r.from_office_id, toOfficeId: r.to_office_id, cashOnDelivery: !!r.cash_on_delivery, cashAmount: parseFloat(r.cash_amount) || 0, cashPaid: !!r.cash_paid, status: r.status, createdAt: r.created_at };
}

async function addTx(client, accountId, type, amount, description) {
  await client.query('INSERT INTO transactions (id,account_id,type,amount,description) VALUES ($1,$2,$3,$4,$5)', [genId(), accountId, type, amount, description]);
}

async function tgSend(chatId, text, extra) {
  if (!process.env.BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  }).catch(() => {});
}

async function tgEdit(chatId, messageId, text) {
  if (!process.env.BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

async function tgAnswer(queryId, text) {
  if (!process.env.BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: queryId, text }),
  }).catch(() => {});
}

function ok(res, data) { res.status(200).json(data); }
function created(res, data) { res.status(201).json(data); }
function fail(res, status, error) { res.status(status).json({ error }); }

function getRoute(req) {
  const url = new URL(req.url, 'http://localhost');
  return url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
}

export default async function handler(req, res) {
  const route = getRoute(req);
  const method = req.method;
  const pool = getPool();

  try {
    if (route === 'lookup' && method === 'GET') {
      const { telegramId, nickname } = req.query;
      if (telegramId) {
        const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
        if (!rows[0]) return fail(res, 404, 'Not found');
        return ok(res, rowToUser(rows[0]));
      }
      if (nickname) {
        const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(nickname)=LOWER($1)', [nickname]);
        if (!rows[0]) return fail(res, 404, 'Not found');
        return ok(res, { exists: true });
      }
      return fail(res, 400, 'Provide telegramId or nickname');
    }

    if (route === 'users' && method === 'POST') {
      const { nickname, pin, telegramId, telegramFirstName } = req.body;
      if (!nickname || !pin) return fail(res, 400, 'Не все поля заполнены');
      if (telegramId) {
        const { rows: ex } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
        if (ex[0]) return fail(res, 409, 'Аккаунт с этим Telegram уже зарегистрирован');
      }
      const { rows: nc } = await pool.query('SELECT id FROM users WHERE LOWER(nickname)=LOWER($1)', [nickname]);
      if (nc[0]) return fail(res, 409, 'Никнейм уже занят');
      try {
        const { rows } = await pool.query('INSERT INTO users (id,nickname,pin,telegram_id,telegram_first_name) VALUES ($1,$2,$3,$4,$5) RETURNING *', [genId(), nickname, pin, telegramId || null, telegramFirstName || '']);
        return created(res, rowToUser(rows[0]));
      } catch (e) {
        if (e.code === '23505') return fail(res, 409, 'Никнейм уже занят');
        return fail(res, 500, e.message);
      }
    }

    const usersMatch = route.match(/^users\/([^/]+)$/);
    if (usersMatch) {
      const id = usersMatch[1];
      if (method === 'DELETE') { await pool.query('DELETE FROM users WHERE id=$1', [id]); return ok(res, { success: true }); }
      if (method === 'PUT') { await pool.query('UPDATE users SET pin=$1 WHERE id=$2', [req.body.pin, id]); return ok(res, { success: true }); }
    }

    if (route === 'premium' && method === 'POST') {
      const { userId } = req.body;
      const { rows: accRows } = await pool.query('SELECT * FROM accounts WHERE user_id=$1 ORDER BY balance DESC LIMIT 1', [userId]);
      if (!accRows[0] || parseFloat(accRows[0].balance) < 2.5) return fail(res, 400, 'Недостаточно средств (нужно 2.5 CBC)');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE accounts SET balance=balance-2.5 WHERE id=$1', [accRows[0].id]);
        await addTx(client, accRows[0].id, 'expense', 2.5, 'Подписка UnitBank Premium — 1 месяц');
        const { rows: bankRows } = await client.query("SELECT id FROM accounts WHERE name='ub-unitbank'");
        if (bankRows[0]) {
          await client.query('UPDATE accounts SET balance=balance+2.5 WHERE id=$1', [bankRows[0].id]);
          await addTx(client, bankRows[0].id, 'income', 2.5, `Продажа Premium: ${userId}`);
        }
        const premiumUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        const { rows } = await client.query('UPDATE users SET is_premium=true, premium_until=$1 WHERE id=$2 RETURNING *', [premiumUntil, userId]);
        await client.query('COMMIT');
        return ok(res, rowToUser(rows[0]));
      } catch (e) { await client.query('ROLLBACK'); return fail(res, 500, e.message); }
      finally { client.release(); }
    }

    if (route === 'accounts') {
      if (method === 'GET') {
        const { userId, exists } = req.query;
        if (exists !== undefined) {
          const name = exists.startsWith('ub-') ? exists : `ub-${exists}`;
          const { rows } = await pool.query('SELECT id FROM accounts WHERE name=$1', [name]);
          if (!rows[0]) return fail(res, 404, 'Not found');
          return ok(res, { exists: true });
        }
        if (!userId) return fail(res, 400, 'userId required');
        const { rows } = await pool.query('SELECT * FROM accounts WHERE user_id=$1 ORDER BY created_at ASC', [userId]);
        return ok(res, rows.map(rowToAccount));
      }
      if (method === 'POST') {
        const { userId, name, color } = req.body;
        if (!userId || !name) return fail(res, 400, 'userId and name required');
        const { rows: uRows } = await pool.query('SELECT is_premium FROM users WHERE id=$1', [userId]);
        const maxAcc = uRows[0]?.is_premium ? 5 : 2;
        const { rows: ex } = await pool.query('SELECT id FROM accounts WHERE user_id=$1', [userId]);
        if (ex.length >= maxAcc) return fail(res, 400, `Максимум ${maxAcc} счетов`);
        try {
          const { rows } = await pool.query('INSERT INTO accounts (id,user_id,name,balance,color) VALUES ($1,$2,$3,0,$4) RETURNING *', [genId(), userId, name, color || '#4285f4']);
          return created(res, rowToAccount(rows[0]));
        } catch (e) {
          if (e.code === '23505') return fail(res, 409, 'Счёт с таким именем уже существует');
          return fail(res, 500, e.message);
        }
      }
    }

    const accountMatch = route.match(/^accounts\/([^/]+)$/);
    if (accountMatch) {
      const accountId = accountMatch[1];
      if (method === 'PUT') {
        const { name, color } = req.body;
        try {
          const { rows } = await pool.query('UPDATE accounts SET name=$1, color=$2 WHERE id=$3 RETURNING *', [name, color, accountId]);
          if (!rows[0]) return fail(res, 404, 'Счёт не найден');
          return ok(res, rowToAccount(rows[0]));
        } catch (e) {
          if (e.code === '23505') return fail(res, 409, 'Счёт с таким именем уже существует');
          return fail(res, 500, e.message);
        }
      }
      if (method === 'DELETE') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows: accRows } = await client.query('SELECT * FROM accounts WHERE id=$1', [accountId]);
          if (!accRows[0]) { await client.query('ROLLBACK'); return fail(res, 404, 'Счёт не найден'); }
          const acc = rowToAccount(accRows[0]);
          const { rows: otherAccs } = await client.query('SELECT * FROM accounts WHERE user_id=$1 AND id!=$2', [acc.userId, accountId]);
          if (otherAccs.length === 0) { await client.query('ROLLBACK'); return fail(res, 400, 'Нельзя удалить единственный счёт'); }
          if (acc.balance > 0) {
            const target = rowToAccount(otherAccs[0]);
            await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [acc.balance, target.id]);
            await addTx(client, target.id, 'income', acc.balance, `Перевод при закрытии счёта ${acc.name}`);
          }
          await client.query('DELETE FROM accounts WHERE id=$1', [accountId]);
          await client.query('COMMIT');
          return ok(res, { success: true });
        } catch (e) { await client.query('ROLLBACK'); return fail(res, 500, e.message); }
        finally { client.release(); }
      }
    }

    if (route === 'transactions' && method === 'GET') {
      const { accountId } = req.query;
      if (!accountId) return fail(res, 400, 'accountId required');
      const { rows } = await pool.query('SELECT * FROM transactions WHERE account_id=$1 ORDER BY created_at DESC', [accountId]);
      return ok(res, rows.map(rowToTransaction));
    }

    if (route === 'transfer/external' && method === 'POST') {
      const { fromAccountId, toExternalAccount, amount } = req.body;
      const rounded = Math.round(amount * 100) / 100;
      if (!fromAccountId || !toExternalAccount || rounded <= 0) return fail(res, 400, 'Некорректные данные');

      const CBCSWIT_URL = 'https://cbcswit.duckdns.org/';
      const ORG = process.env.CBCSWIT_ORG || '';
      const ORG_TOKEN = process.env.CBCSWIT_ORG_TOKEN || '';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: fRows } = await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [fromAccountId]);
        if (!fRows[0]) { await client.query('ROLLBACK'); return fail(res, 404, 'Счёт отправителя не найден'); }
        const fromAcc = rowToAccount(fRows[0]);
        if (fromAcc.balance < rounded) { await client.query('ROLLBACK'); return fail(res, 400, 'Недостаточно средств'); }

        const extRes = await fetch(`${CBCSWIT_URL}account/transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org: ORG, org_token: ORG_TOKEN, afrom: fromAcc.name, ato: toExternalAccount, amount: rounded, message: `Перевод из UnitBank (${fromAcc.name})` }),
        });
        if (!extRes.ok) {
          await client.query('ROLLBACK');
          const errData = await extRes.json().catch(() => ({}));
          return fail(res, 400, errData.detail || 'Ошибка внешнего банка');
        }

        await client.query('UPDATE accounts SET balance=balance-$1 WHERE id=$2', [rounded, fromAccountId]);
        await addTx(client, fromAccountId, 'expense', rounded, `Внешний перевод → ${toExternalAccount}`);
        await client.query('COMMIT');
        return ok(res, { success: true });
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); return fail(res, 500, e.message); }
      finally { client.release(); }
    }


    if (route === 'transfer' && method === 'POST') {
      const { fromAccountId, toAccountName, amount } = req.body;
      const rounded = Math.round(amount * 100) / 100;
      if (!fromAccountId || !toAccountName || rounded <= 0) return fail(res, 400, 'Некорректные данные');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: fRows } = await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [fromAccountId]);
        if (!fRows[0]) { await client.query('ROLLBACK'); return fail(res, 404, 'Счёт отправителя не найден'); }
        const fromAcc = rowToAccount(fRows[0]);
        if (fromAcc.balance < rounded) { await client.query('ROLLBACK'); return fail(res, 400, 'Недостаточно средств'); }
        const normName = toAccountName.startsWith('ub-') ? toAccountName : `ub-${toAccountName}`;
        const { rows: tRows } = await client.query('SELECT * FROM accounts WHERE name=$1 FOR UPDATE', [normName]);
        if (!tRows[0]) { await client.query('ROLLBACK'); return fail(res, 404, 'Счёт получателя не найден'); }
        const toAcc = rowToAccount(tRows[0]);
        await client.query('UPDATE accounts SET balance=balance-$1 WHERE id=$2', [rounded, fromAccountId]);
        await addTx(client, fromAccountId, 'expense', rounded, `Перевод → ${toAcc.name}`);
        await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [rounded, toAcc.id]);
        await addTx(client, toAcc.id, 'income', rounded, `Перевод ← ${fromAcc.name}`);
        await client.query('COMMIT');
        const { rows: uRows } = await client.query('SELECT u.telegram_id FROM users u JOIN accounts a ON a.user_id=u.id WHERE a.id=$1', [toAcc.id]);
        if (uRows[0]?.telegram_id) tgSend(uRows[0].telegram_id, `💰 <b>Входящий перевод</b>\n\nСумма: <b>${fmt(rounded)} CBC</b>\nНа счёт: <code>${toAcc.name}</code>\nОт: <code>${fromAcc.name}</code>`);
        return ok(res, { success: true });
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); return fail(res, 500, e.message); }
      finally { client.release(); }
    }

    if (route === 'credits') {
      if (method === 'GET') {
        const { userId } = req.query;
        if (!userId) return fail(res, 400, 'userId required');
        const { rows } = await pool.query('SELECT * FROM credits WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
        return ok(res, rows.map(rowToCredit));
      }
      if (method === 'POST') {
        const { userId, accountId, amount, purpose } = req.body;
        const rounded = Math.round(amount * 100) / 100;
        if (!userId || !accountId || rounded <= 0) return fail(res, 400, 'Некорректные данные');
        const { rows: ar } = await pool.query("SELECT COALESCE(SUM(amount-paid_amount),0) as debt FROM credits WHERE user_id=$1 AND status='active'", [userId]);
        if (parseFloat(ar[0].debt) + rounded > 50) return fail(res, 400, 'Превышен кредитный лимит (50 CBC)');
        const { rows: uRows } = await pool.query('SELECT is_premium FROM users WHERE id=$1', [userId]);
        const interestRate = uRows[0]?.is_premium ? 0.01 : 0.02;
        const id = genId();
        const { rows } = await pool.query("INSERT INTO credits (id,user_id,target_account_id,amount,paid_amount,interest_sent,interest_rate,purpose,status) VALUES ($1,$2,$3,$4,0,0,$5,$6,'pending') RETURNING *", [id, userId, accountId, rounded, interestRate, purpose || '']);
        const credit = rowToCredit(rows[0]);
        const { rows: userRows } = await pool.query('SELECT nickname,telegram_id FROM users WHERE id=$1', [userId]);
        const { rows: aRows } = await pool.query('SELECT name FROM accounts WHERE id=$1', [accountId]);
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId) {
          tgSend(adminId, `🏦 <b>Заявка на кредит</b>\n\nИгрок: <b>${userRows[0]?.nickname || userId}</b>\nTG: ${userRows[0]?.telegram_id || '—'}\nСумма: <b>${fmt(rounded)} CBC</b>\nСчёт: <code>${aRows[0]?.name || accountId}</code>\nЦель: ${purpose || '—'}\nСтавка: ${interestRate * 100}%/нед`, {
            reply_markup: { inline_keyboard: [[{ text: '✅ Одобрить', callback_data: `approve:${credit.id}` }, { text: '❌ Отклонить', callback_data: `reject:${credit.id}` }]] },
          });
        }
        return created(res, credit);
      }
    }

    const creditsMatch = route.match(/^credits\/([^/]+)$/);
    if (creditsMatch && method === 'POST') {
      const creditId = creditsMatch[1];
      const { action } = req.query;

      if (action === 'approve') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows } = await client.query("SELECT * FROM credits WHERE id=$1 AND status='pending' FOR UPDATE", [creditId]);
          if (!rows[0]) { await client.query('ROLLBACK'); return fail(res, 404, 'Кредит не найден или уже обработан'); }
          const credit = rows[0];
          await client.query("UPDATE credits SET status='active' WHERE id=$1", [credit.id]);
          await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [credit.amount, credit.target_account_id]);
          await addTx(client, credit.target_account_id, 'credit', parseFloat(credit.amount), `Кредит одобрен: +${fmt(credit.amount)} CBC`);
          await client.query('COMMIT');
          const { rows: uRows } = await client.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
          if (uRows[0]?.telegram_id) tgSend(uRows[0].telegram_id, `✅ <b>Кредит одобрен!</b>\n\nСумма: <b>${fmt(credit.amount)} CBC</b>\nЗачислена на счёт.\n\n📌 Ставка: ${parseFloat(credit.interest_rate) * 100}% в неделю.`);
          return ok(res, { success: true });
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); return fail(res, 500, e.message); }
        finally { client.release(); }
      }

      if (action === 'reject') {
        const { rows } = await pool.query("UPDATE credits SET status='rejected' WHERE id=$1 AND status='pending' RETURNING *", [creditId]);
        if (!rows[0]) return fail(res, 404, 'Кредит не найден');
        const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [rows[0].user_id]);
        if (uRows[0]?.telegram_id) tgSend(uRows[0].telegram_id, `❌ <b>Кредит отклонён</b>\n\nЗаявка на ${fmt(rows[0].amount)} CBC отклонена администратором.`);
        return ok(res, { success: true });
      }

      if (action === 'repay') {
        const { amount, fromAccountId } = req.body;
        const repayAmount = Math.round(amount * 100) / 100;
        if (repayAmount <= 0) return fail(res, 400, 'Некорректная сумма');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows: cRows } = await client.query("SELECT * FROM credits WHERE id=$1 AND status='active' FOR UPDATE", [creditId]);
          if (!cRows[0]) { await client.query('ROLLBACK'); return fail(res, 404, 'Кредит не найден'); }
          const credit = cRows[0];
          const { rows: aRows } = await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [fromAccountId]);
          if (!aRows[0]) { await client.query('ROLLBACK'); return fail(res, 404, 'Счёт не найден'); }
          const acc = rowToAccount(aRows[0]);
          const weeksPassed = Math.floor((Date.now() - new Date(credit.created_at).getTime()) / (7 * 24 * 3600 * 1000));
          const totalInterest = Math.round(parseFloat(credit.amount) * parseFloat(credit.interest_rate) * weeksPassed * 100) / 100;
          const unpaidInterest = Math.max(0, Math.round((totalInterest - parseFloat(credit.interest_sent)) * 100) / 100);
          const remaining = Math.round((parseFloat(credit.amount) - parseFloat(credit.paid_amount)) * 100) / 100;
          const actualRepay = Math.min(repayAmount, Math.round((remaining + unpaidInterest) * 100) / 100);
          if (acc.balance < actualRepay) { await client.query('ROLLBACK'); return fail(res, 400, 'Недостаточно средств'); }
          const interestPayment = Math.min(unpaidInterest, actualRepay);
          const principalPayment = Math.round((actualRepay - interestPayment) * 100) / 100;
          await client.query('UPDATE accounts SET balance=balance-$1 WHERE id=$2', [actualRepay, fromAccountId]);
          await addTx(client, fromAccountId, 'credit_repay', actualRepay, `Погашение кредита: -${fmt(actualRepay)} CBC`);
          if (interestPayment > 0) {
            const { rows: bankRows } = await client.query("SELECT id FROM accounts WHERE name='ub-unitbank'");
            if (bankRows[0]) {
              await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [interestPayment, bankRows[0].id]);
              await addTx(client, bankRows[0].id, 'income', interestPayment, `Процент по кредиту от ${acc.name}`);
            }
          }
          const newPaid = Math.round((parseFloat(credit.paid_amount) + principalPayment) * 100) / 100;
          const newInterestSent = Math.round((parseFloat(credit.interest_sent) + interestPayment) * 100) / 100;
          const newStatus = newPaid >= parseFloat(credit.amount) ? 'paid' : 'active';
          await client.query('UPDATE credits SET paid_amount=$1,interest_sent=$2,status=$3 WHERE id=$4', [newPaid, newInterestSent, newStatus, credit.id]);
          await client.query('COMMIT');
          const { rows: uRows } = await client.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
          if (uRows[0]?.telegram_id) {
            const newRemaining = Math.max(0, Math.round((parseFloat(credit.amount) - newPaid) * 100) / 100);
            tgSend(uRows[0].telegram_id, newStatus === 'paid'
              ? `✅ <b>Кредит полностью погашен!</b>\n\nОплачено: <b>${fmt(actualRepay)} CBC</b>`
              : `💳 <b>Платёж принят</b>\n\nОплачено: <b>${fmt(actualRepay)} CBC</b>\nОсталось: <b>${fmt(newRemaining)} CBC</b>`);
          }
          return ok(res, { success: true, newStatus });
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); return fail(res, 500, e.message); }
        finally { client.release(); }
      }
    }

    if (route === 'bot' && method === 'POST') {
      const update = req.body;
      const WEBAPP_URL = process.env.WEBAPP_URL || '';

      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text || '';
        const firstName = msg.from?.first_name || 'Игрок';
        if (msg.from?.id) {
          await pool.query(`INSERT INTO tg_sessions (telegram_id,first_name) VALUES ($1,$2) ON CONFLICT (telegram_id) DO UPDATE SET first_name=EXCLUDED.first_name`, [msg.from.id, firstName]).catch(() => {});
        }
        if (text === '/start') {
          await tgSend(chatId, `👋 Привет, <b>${firstName}</b>!\n\n🏦 <b>UnitBank</b> — виртуальный банк для Minecraft-сервера.\n\n💳 Управляй счетами\n💰 Переводи CBC\n📋 Оформляй кредиты\n\nНажми кнопку ниже 👇`,
            { reply_markup: { inline_keyboard: [[{ text: '🏦 Открыть UnitBank', web_app: { url: WEBAPP_URL } }]] } });
        } else if (text === '/help') {
          await tgSend(chatId, `ℹ️ <b>Помощь по UnitBank</b>\n\n<b>Счета</b>\n• Обычный: до 2 счетов\n• Premium: до 5 счетов\n\n<b>Кредиты</b>\n• Максимум 50 CBC\n• Обычный: 2%/нед, Premium: 1%/нед\n• Требуют одобрения\n\n/start /balance /help`);
        } else if (text === '/balance') {
          const { rows } = await pool.query(`SELECT a.name,a.balance FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.telegram_id=$1 ORDER BY a.created_at`, [chatId]);
          if (!rows.length) {
            await tgSend(chatId, '💳 Счета не найдены. Откройте UnitBank для регистрации.', { reply_markup: { inline_keyboard: [[{ text: '🏦 Открыть UnitBank', web_app: { url: WEBAPP_URL } }]] } });
          } else {
            await tgSend(chatId, `💳 <b>Ваши счета</b>\n\n${rows.map(r => `• <code>${r.name}</code>: <b>${fmt(r.balance)} CBC</b>`).join('\n')}`);
          }
        }
      }

      if (update.callback_query) {
        const query = update.callback_query;
        const chatId = query.message?.chat?.id;
        const messageId = query.message?.message_id;
        const data = query.data || '';
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (!adminId || String(chatId) !== String(adminId)) { await tgAnswer(query.id, '⛔ Нет доступа'); return ok(res, { ok: true }); }
        const [action, creditId] = data.split(':');
        if (!creditId) { await tgAnswer(query.id, ''); return ok(res, { ok: true }); }

        if (action === 'approve') {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const { rows } = await client.query("SELECT * FROM credits WHERE id=$1 AND status='pending' FOR UPDATE", [creditId]);
            if (!rows[0]) { await client.query('ROLLBACK'); await tgAnswer(query.id, 'Уже обработан'); return ok(res, { ok: true }); }
            const credit = rows[0];
            await client.query("UPDATE credits SET status='active' WHERE id=$1", [credit.id]);
            await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [credit.amount, credit.target_account_id]);
            await addTx(client, credit.target_account_id, 'credit', parseFloat(credit.amount), `Кредит одобрен: +${fmt(credit.amount)} CBC`);
            await client.query('COMMIT');
            const { rows: uRows } = await client.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
            if (uRows[0]?.telegram_id) tgSend(uRows[0].telegram_id, `✅ <b>Кредит одобрен!</b>\n\nСумма: <b>${fmt(credit.amount)} CBC</b>\nЗачислена на счёт.\n\n📌 Ставка: ${parseFloat(credit.interest_rate) * 100}% в неделю.`);
            await tgEdit(chatId, messageId, query.message.text + '\n\n✅ <b>Одобрено</b>');
            await tgAnswer(query.id, '✅ Одобрено');
          } catch (e) { await client.query('ROLLBACK').catch(() => {}); await tgAnswer(query.id, `Ошибка: ${e.message}`); }
          finally { client.release(); }
        }

        if (action === 'reject') {
          const { rows } = await pool.query("UPDATE credits SET status='rejected' WHERE id=$1 AND status='pending' RETURNING *", [creditId]);
          if (!rows[0]) { await tgAnswer(query.id, 'Уже обработан'); return ok(res, { ok: true }); }
          const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [rows[0].user_id]);
          if (uRows[0]?.telegram_id) tgSend(uRows[0].telegram_id, `❌ <b>Кредит отклонён</b>\n\nЗаявка на ${fmt(rows[0].amount)} CBC отклонена администратором.`);
          await tgEdit(chatId, messageId, query.message.text + '\n\n❌ <b>Отклонено</b>');
          await tgAnswer(query.id, '❌ Отклонено');
        }
      }
      return ok(res, { ok: true });
    }

    if (route === 'parcels' && method === 'GET') {
      const { nickname } = req.query;
      if (!nickname) return fail(res, 400, 'nickname required');
      const { rows } = await pool.query(
        'SELECT * FROM parcels WHERE sender_nickname=$1 OR recipient_nickname=$1 ORDER BY created_at DESC',
        [nickname]
      );
      return ok(res, rows.map(rowToParcel));
    }

    if (route === 'parcels' && method === 'POST') {
      const { senderNickname, recipientNickname, description, fromOfficeId, toOfficeId, cashOnDelivery, cashAmount } = req.body;
      if (!senderNickname || !recipientNickname || !fromOfficeId || !toOfficeId) return fail(res, 400, 'Не все поля заполнены');
      const ttn = '#' + String(Math.floor(1000 + Math.random() * 9000));
      const id = genId();
      const { rows } = await pool.query(
        `INSERT INTO parcels (id,ttn,sender_nickname,recipient_nickname,description,from_office_id,to_office_id,cash_on_delivery,cash_amount,cash_paid,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,'created') RETURNING *`,
        [id, ttn, senderNickname, recipientNickname, description || '', fromOfficeId, toOfficeId, !!cashOnDelivery, cashOnDelivery ? parseFloat(cashAmount) || 0 : 0]
      );
      const parcel = rowToParcel(rows[0]);
      const adminId = process.env.ADMIN_TELEGRAM_ID;
      if (adminId) {
        tgSend(adminId, `📦 <b>Новая посылка</b>\n\nТТН: <code>${ttn}</code>\nОт: <b>${senderNickname}</b>\nКому: <b>${recipientNickname}</b>\nОписание: ${description || '—'}${cashOnDelivery ? `\nНалож. платёж: ${fmt(cashAmount)} CBC` : ''}`);
      }
      return created(res, parcel);
    }

    const parcelStatusMatch = route.match(/^parcels\/([^/]+)\/status$/);
    if (parcelStatusMatch && method === 'PUT') {
      const parcelId = parcelStatusMatch[1];
      const { status } = req.body;
      const { rows } = await pool.query('UPDATE parcels SET status=$1 WHERE id=$2 RETURNING *', [status, parcelId]);
      if (!rows[0]) return fail(res, 404, 'Посылка не найдена');
      const parcel = rowToParcel(rows[0]);
      const adminId = process.env.ADMIN_TELEGRAM_ID;
      if (status === 'sent' && adminId) {
        tgSend(adminId, `📬 <b>Посылка отправлена</b>\n\nТТН: <code>${parcel.ttn}</code>\nОт: <b>${parcel.senderNickname}</b> → <b>${parcel.recipientNickname}</b>`);
      }
      const notifyNick = status === 'sent' ? parcel.recipientNickname : status === 'received' ? parcel.senderNickname : null;
      if (notifyNick) {
        const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE LOWER(nickname)=LOWER($1)', [notifyNick]);
        if (uRows[0]?.telegram_id) {
          const msg = status === 'sent'
            ? `📬 <b>Посылка в пути!</b>\n\nТТН: <code>${parcel.ttn}</code>\nОт: <b>${parcel.senderNickname}</b>`
            : `✅ <b>Посылка получена</b>\n\nТТН: <code>${parcel.ttn}</code>`;
          tgSend(uRows[0].telegram_id, msg);
        }
      }
      return ok(res, parcel);
    }

    const parcelPayMatch = route.match(/^parcels\/([^/]+)\/pay$/);
    if (parcelPayMatch && method === 'POST') {
      const parcelId = parcelPayMatch[1];
      const { fromAccountId } = req.body;
      const { rows: pRows } = await pool.query('SELECT * FROM parcels WHERE id=$1', [parcelId]);
      if (!pRows[0]) return fail(res, 404, 'Посылка не найдена');
      const parcel = rowToParcel(pRows[0]);
      if (!parcel.cashOnDelivery || parcel.cashPaid) return fail(res, 400, 'Оплата не требуется');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: accRows } = await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [fromAccountId]);
        if (!accRows[0] || parseFloat(accRows[0].balance) < parcel.cashAmount) {
          await client.query('ROLLBACK');
          return fail(res, 400, 'Недостаточно средств');
        }
        await client.query('UPDATE accounts SET balance=balance-$1 WHERE id=$2', [parcel.cashAmount, fromAccountId]);
        await addTx(client, fromAccountId, 'expense', parcel.cashAmount, `Наложенный платёж по посылке ${parcel.ttn}`);
        const { rows: senderAccRows } = await client.query(
          'SELECT a.id FROM accounts a JOIN users u ON u.id=a.user_id WHERE LOWER(u.nickname)=LOWER($1) ORDER BY a.created_at ASC LIMIT 1',
          [parcel.senderNickname]
        );
        if (senderAccRows[0]) {
          await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [parcel.cashAmount, senderAccRows[0].id]);
          await addTx(client, senderAccRows[0].id, 'income', parcel.cashAmount, `Наложенный платёж за посылку ${parcel.ttn}`);
        }
        await client.query('UPDATE parcels SET cash_paid=true WHERE id=$1', [parcelId]);
        await client.query('COMMIT');
        const { rows: sURows } = await client.query('SELECT telegram_id FROM users WHERE LOWER(nickname)=LOWER($1)', [parcel.senderNickname]);
        if (sURows[0]?.telegram_id) tgSend(sURows[0].telegram_id, `💰 <b>Наложенный платёж получен</b>\n\nПосылка: <code>${parcel.ttn}</code>\nСумма: <b>${fmt(parcel.cashAmount)} CBC</b>`);
        return ok(res, { success: true });
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); return fail(res, 500, e.message); }
      finally { client.release(); }
    }

    fail(res, 404, 'Not found');
  } catch (e) {
    console.error(e);
    fail(res, 500, e.message);
  }
}
