import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool, genId } from './db.js';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

function rowToUser(r) {
  return {
    id: r.id,
    nickname: r.nickname,
    telegramId: r.telegram_id ? Number(r.telegram_id) : null,
    telegramFirstName: r.telegram_first_name || '',
    pin: r.pin,
    createdAt: r.created_at,
  };
}

function rowToAccount(r) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    balance: parseFloat(r.balance),
    color: r.color || '#4285f4',
    createdAt: r.created_at,
  };
}

function rowToTransaction(r) {
  return {
    id: r.id,
    accountId: r.account_id,
    type: r.type,
    amount: parseFloat(r.amount),
    description: r.description,
    createdAt: r.created_at,
  };
}

function rowToCredit(r) {
  return {
    id: r.id,
    userId: r.user_id,
    targetAccountId: r.target_account_id,
    amount: parseFloat(r.amount),
    paidAmount: parseFloat(r.paid_amount),
    interestSent: parseFloat(r.interest_sent),
    interestRate: parseFloat(r.interest_rate),
    purpose: r.purpose || '',
    status: r.status,
    createdAt: r.created_at,
  };
}

app.get('/api/users/by-telegram/:telegramId', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [
    req.params.telegramId,
  ]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rowToUser(rows[0]));
});

app.get('/api/users/nickname/:nickname', async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = LOWER($1)', [
    req.params.nickname,
  ]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ exists: true });
});

app.post('/api/users', async (req, res) => {
  const { nickname, pin, telegramId, telegramFirstName } = req.body;
  const id = genId();
  const { rows } = await pool.query(
    'INSERT INTO users (id, nickname, pin, telegram_id, telegram_first_name) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [id, nickname, pin, telegramId || null, telegramFirstName || '']
  );
  res.status(201).json(rowToUser(rows[0]));
});

app.put('/api/users/:id/pin', async (req, res) => {
  await pool.query('UPDATE users SET pin=$1 WHERE id=$2', [req.body.pin, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/users/:id', async (req, res) => {
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/accounts', async (req, res) => {
  const { userId } = req.query;
  const { rows } = await pool.query(
    'SELECT * FROM accounts WHERE user_id=$1 ORDER BY created_at ASC',
    [userId]
  );
  res.json(rows.map(rowToAccount));
});

app.get('/api/accounts/exists/:name', async (req, res) => {
  const name = req.params.name;
  const fullName = name.includes('-') || name.startsWith('ub-') ? name : `ub-${name}`;
  const { rows } = await pool.query('SELECT id FROM accounts WHERE name = $1', [fullName]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ exists: true });
});

app.post('/api/accounts', async (req, res) => {
  const { userId, name, color } = req.body;
  const { rows: existing } = await pool.query(
    'SELECT id FROM accounts WHERE user_id=$1',
    [userId]
  );
  if (existing.length >= 2) {
    return res.status(400).json({ error: 'Максимум 2 счета' });
  }
  const id = genId();
  const { rows } = await pool.query(
    'INSERT INTO accounts (id, user_id, name, balance, color) VALUES ($1,$2,$3,0,$4) RETURNING *',
    [id, userId, name, color || '#4285f4']
  );
  res.status(201).json(rowToAccount(rows[0]));
});

app.get('/api/transactions', async (req, res) => {
  const { accountId } = req.query;
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE account_id=$1 ORDER BY created_at DESC',
    [accountId]
  );
  res.json(rows.map(rowToTransaction));
});

async function addTransaction(client, accountId, type, amount, description) {
  const id = genId();
  await client.query(
    'INSERT INTO transactions (id, account_id, type, amount, description) VALUES ($1,$2,$3,$4,$5)',
    [id, accountId, type, amount, description]
  );
}

app.post('/api/transfer', async (req, res) => {
  const { fromAccountId, toAccountName, amount } = req.body;
  const rounded = Math.round(amount * 100) / 100;
  if (rounded <= 0) return res.status(400).json({ error: 'Некорректная сумма' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: fromRows } = await client.query(
      'SELECT * FROM accounts WHERE id=$1 FOR UPDATE',
      [fromAccountId]
    );
    if (!fromRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Счёт отправителя не найден' });
    }
    const fromAcc = rowToAccount(fromRows[0]);
    if (fromAcc.balance < rounded) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно средств на счёте' });
    }

    const normalizedName = toAccountName.includes('-') ? toAccountName : `ub-${toAccountName}`;
    const { rows: toRows } = await client.query(
      'SELECT * FROM accounts WHERE name=$1 FOR UPDATE',
      [normalizedName]
    );
    if (!toRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Счёт получателя не найден' });
    }
    const toAcc = rowToAccount(toRows[0]);

    await client.query('UPDATE accounts SET balance=balance-$1 WHERE id=$2', [
      rounded,
      fromAccountId,
    ]);
    await addTransaction(
      client,
      fromAccountId,
      'expense',
      rounded,
      `Перевод → ${toAcc.name}`
    );

    await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [
      rounded,
      toAcc.id,
    ]);
    await addTransaction(
      client,
      toAcc.id,
      'income',
      rounded,
      `Перевод ← ${fromAcc.name}`
    );

    await client.query('COMMIT');

    const { rows: recipientUserRows } = await pool.query(
      'SELECT u.telegram_id FROM users u JOIN accounts a ON a.user_id=u.id WHERE a.id=$1',
      [toAcc.id]
    );
    if (recipientUserRows[0]?.telegram_id) {
      notifyTelegram(
        recipientUserRows[0].telegram_id,
        `💰 <b>Входящий перевод</b>\n\nСумма: <b>${formatAmount(rounded)} CBC</b>\nНа счёт: <code>${toAcc.name}</code>\nОт: <code>${fromAcc.name}</code>`
      );
    }

    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/api/credits', async (req, res) => {
  const { userId } = req.query;
  const { rows } = await pool.query(
    'SELECT * FROM credits WHERE user_id=$1 ORDER BY created_at DESC',
    [userId]
  );
  res.json(rows.map(rowToCredit));
});

app.post('/api/credits/request', async (req, res) => {
  const { userId, accountId, amount, purpose } = req.body;
  const rounded = Math.round(amount * 100) / 100;
  if (rounded <= 0) return res.status(400).json({ error: 'Некорректная сумма' });

  const { rows: activeCredits } = await pool.query(
    "SELECT SUM(amount - paid_amount) as debt FROM credits WHERE user_id=$1 AND status='active'",
    [userId]
  );
  const debt = parseFloat(activeCredits[0]?.debt || '0');
  if (debt + rounded > 50) {
    return res.status(400).json({ error: 'Превышен кредитный лимит' });
  }

  const id = genId();
  const { rows } = await pool.query(
    `INSERT INTO credits (id, user_id, target_account_id, amount, paid_amount, interest_sent, interest_rate, purpose, status)
     VALUES ($1,$2,$3,$4,0,0,0.02,$5,'pending') RETURNING *`,
    [id, userId, accountId, rounded, purpose || '']
  );
  const credit = rowToCredit(rows[0]);

  const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
  const { rows: accRows } = await pool.query('SELECT * FROM accounts WHERE id=$1', [accountId]);
  const user = userRows[0];
  const acc = accRows[0];

  const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;
  if (ADMIN_ID) {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const text =
      `🏦 <b>Заявка на кредит</b>\n\n` +
      `Игрок: <b>${user.nickname}</b> (TG: ${user.telegram_id || '—'})\n` +
      `Сумма: <b>${formatAmount(rounded)} CBC</b>\n` +
      `Счёт: <code>${acc?.name || accountId}</code>\n` +
      `Цель: ${purpose || '—'}`;

    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Одобрить', callback_data: `approve_credit:${credit.id}` },
              { text: '❌ Отклонить', callback_data: `reject_credit:${credit.id}` },
            ],
          ],
        },
      }),
    }).catch(console.error);
  }

  res.status(201).json(credit);
});

app.post('/api/credits/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      "SELECT * FROM credits WHERE id=$1 AND status='pending' FOR UPDATE",
      [req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Кредит не найден или уже обработан' });
    }
    const credit = rowToCredit(rows[0]);

    await client.query("UPDATE credits SET status='active' WHERE id=$1", [credit.id]);
    await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [
      credit.amount,
      credit.targetAccountId,
    ]);
    await addTransaction(
      client,
      credit.targetAccountId,
      'credit',
      credit.amount,
      `Кредит одобрен: +${formatAmount(credit.amount)} CBC`
    );
    await client.query('COMMIT');

    const { rows: userRows } = await pool.query(
      'SELECT telegram_id FROM users WHERE id=$1',
      [credit.userId]
    );
    if (userRows[0]?.telegram_id) {
      notifyTelegram(
        userRows[0].telegram_id,
        `✅ <b>Кредит одобрен!</b>\n\nСумма: <b>${formatAmount(credit.amount)} CBC</b>\nЗачислена на счёт.\n\n📌 Ставка: 2% в неделю. Погасите кредит в приложении.`
      );
    }

    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/api/credits/:id/reject', async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE credits SET status='rejected' WHERE id=$1 AND status='pending' RETURNING *",
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Кредит не найден' });
  const credit = rowToCredit(rows[0]);

  const { rows: userRows } = await pool.query(
    'SELECT telegram_id FROM users WHERE id=$1',
    [credit.userId]
  );
  if (userRows[0]?.telegram_id) {
    notifyTelegram(
      userRows[0].telegram_id,
      `❌ <b>Кредит отклонён</b>\n\nВаша заявка на ${formatAmount(credit.amount)} CBC была отклонена администратором.\nПо вопросам обращайтесь в поддержку.`
    );
  }

  res.json({ success: true });
});

app.post('/api/credits/:id/repay', async (req, res) => {
  const { amount, fromAccountId } = req.body;
  const repayAmount = Math.round(amount * 100) / 100;
  if (repayAmount <= 0) return res.status(400).json({ error: 'Некорректная сумма' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: creditRows } = await client.query(
      "SELECT * FROM credits WHERE id=$1 AND status='active' FOR UPDATE",
      [req.params.id]
    );
    if (!creditRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Кредит не найден' });
    }
    const credit = rowToCredit(creditRows[0]);

    const { rows: accRows } = await client.query(
      'SELECT * FROM accounts WHERE id=$1 FOR UPDATE',
      [fromAccountId]
    );
    if (!accRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Счёт не найден' });
    }
    const acc = rowToAccount(accRows[0]);

    const now = Date.now();
    const created = new Date(credit.createdAt).getTime();
    const weeksPassed = Math.floor((now - created) / (7 * 24 * 3600 * 1000));
    const totalInterestAccrued = Math.round(credit.amount * credit.interestRate * weeksPassed * 100) / 100;
    const unpaidInterest = Math.max(
      0,
      Math.round((totalInterestAccrued - credit.interestSent) * 100) / 100
    );

    const remaining = Math.round((credit.amount - credit.paidAmount) * 100) / 100;
    const totalToPay = Math.round((remaining + unpaidInterest) * 100) / 100;
    const actualRepay = Math.min(repayAmount, totalToPay);

    if (acc.balance < actualRepay) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно средств' });
    }

    let interestPayment = Math.min(unpaidInterest, actualRepay);
    let principalPayment = Math.round((actualRepay - interestPayment) * 100) / 100;

    await client.query('UPDATE accounts SET balance=balance-$1 WHERE id=$2', [
      actualRepay,
      fromAccountId,
    ]);
    await addTransaction(
      client,
      fromAccountId,
      'credit_repay',
      actualRepay,
      `Погашение кредита: -${formatAmount(actualRepay)} CBC`
    );

    if (interestPayment > 0) {
      const { rows: bankAccRows } = await client.query(
        "SELECT id FROM accounts WHERE name='ub-unitbank'"
      );
      if (bankAccRows[0]) {
        await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [
          interestPayment,
          bankAccRows[0].id,
        ]);
        await addTransaction(
          client,
          bankAccRows[0].id,
          'income',
          interestPayment,
          `Процент по кредиту от ${acc.name}`
        );
      }
    }

    const newPaidAmount = Math.round((credit.paidAmount + principalPayment) * 100) / 100;
    const newInterestSent = Math.round((credit.interestSent + interestPayment) * 100) / 100;
    const newStatus = newPaidAmount >= credit.amount ? 'paid' : 'active';

    await client.query(
      'UPDATE credits SET paid_amount=$1, interest_sent=$2, status=$3 WHERE id=$4',
      [newPaidAmount, newInterestSent, newStatus, credit.id]
    );

    await client.query('COMMIT');

    const { rows: userRows } = await pool.query(
      'SELECT telegram_id FROM users WHERE id=$1',
      [credit.userId]
    );
    if (userRows[0]?.telegram_id) {
      const newRemaining = Math.max(0, Math.round((credit.amount - newPaidAmount) * 100) / 100);
      notifyTelegram(
        userRows[0].telegram_id,
        newStatus === 'paid'
          ? `✅ <b>Кредит полностью погашен!</b>\n\nОплачено: <b>${formatAmount(actualRepay)} CBC</b>\nПоздравляем!`
          : `💳 <b>Платёж по кредиту принят</b>\n\nОплачено: <b>${formatAmount(actualRepay)} CBC</b>\nОсталось: <b>${formatAmount(newRemaining)} CBC</b>`
      );
    }

    res.json({ success: true, newStatus });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

function formatAmount(amount) {
  return amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function notifyTelegram(chatId, text) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN || !chatId) return;
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(console.error);
}

app.listen(PORT, () => {
  console.log(`UnitBank API server running on port ${PORT}`);
});
