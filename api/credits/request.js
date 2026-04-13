import { getPool, genId, rowToCredit, formatAmount, err } from '../_db.js';
import { notifyAdmin } from '../_notify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
  const { userId, accountId, amount, purpose } = req.body;
  const rounded = Math.round(amount * 100) / 100;
  if (!userId || !accountId || rounded <= 0) return err(res, 400, 'Некорректные данные');

  const pool = getPool();
  const { rows: activeRows } = await pool.query(
    "SELECT COALESCE(SUM(amount - paid_amount),0) as debt FROM credits WHERE user_id=$1 AND status='active'",
    [userId]
  );
  const debt = parseFloat(activeRows[0].debt);
  if (debt + rounded > 50) return err(res, 400, 'Превышен кредитный лимит (50 CBC)');

  const id = genId();
  const { rows } = await pool.query(
    `INSERT INTO credits (id, user_id, target_account_id, amount, paid_amount, interest_sent, interest_rate, purpose, status)
     VALUES ($1,$2,$3,$4,0,0,0.02,$5,'pending') RETURNING *`,
    [id, userId, accountId, rounded, purpose || '']
  );
  const credit = rowToCredit(rows[0]);

  const { rows: userRows } = await pool.query('SELECT nickname, telegram_id FROM users WHERE id=$1', [userId]);
  const { rows: accRows } = await pool.query('SELECT name FROM accounts WHERE id=$1', [accountId]);
  const user = userRows[0];
  const acc = accRows[0];

  notifyAdmin(
    `🏦 <b>Заявка на кредит</b>\n\n` +
    `Игрок: <b>${user?.nickname || userId}</b>\n` +
    `TG ID: ${user?.telegram_id || '—'}\n` +
    `Сумма: <b>${formatAmount(rounded)} CBC</b>\n` +
    `Счёт: <code>${acc?.name || accountId}</code>\n` +
    `Цель: ${purpose || '—'}`,
    [
      [
        { text: '✅ Одобрить', callback_data: `approve:${credit.id}` },
        { text: '❌ Отклонить', callback_data: `reject:${credit.id}` },
      ],
    ]
  );

  res.status(201).json(credit);
}
