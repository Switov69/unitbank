import { getPool, rowToCredit, addTransaction, formatAmount, err } from '../../_db.js';
import { notifyTelegram } from '../../_notify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      "SELECT * FROM credits WHERE id=$1 AND status='pending' FOR UPDATE",
      [req.query.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return err(res, 404, 'Кредит не найден или уже обработан'); }
    const credit = rows[0];
    await client.query("UPDATE credits SET status='active' WHERE id=$1", [credit.id]);
    await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [credit.amount, credit.target_account_id]);
    await addTransaction(client, credit.target_account_id, 'credit', parseFloat(credit.amount), `Кредит одобрен: +${formatAmount(credit.amount)} CBC`);
    await client.query('COMMIT');
    const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
    if (uRows[0]?.telegram_id) {
      notifyTelegram(uRows[0].telegram_id,
        `✅ <b>Кредит одобрен!</b>\n\nСумма: <b>${formatAmount(credit.amount)} CBC</b>\nЗачислена на счёт.\n\n📌 Ставка: 2% в неделю.`);
    }
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    err(res, 500, e.message);
  } finally {
    client.release();
  }
}
