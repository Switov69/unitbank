import { getPool, formatAmount, err } from '../../_db.js';
import { notifyTelegram } from '../../_notify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
  const pool = getPool();
  const { rows } = await pool.query(
    "UPDATE credits SET status='rejected' WHERE id=$1 AND status='pending' RETURNING *",
    [req.query.id]
  );
  if (!rows[0]) return err(res, 404, 'Кредит не найден');
  const credit = rows[0];
  const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
  if (uRows[0]?.telegram_id) {
    notifyTelegram(uRows[0].telegram_id,
      `❌ <b>Кредит отклонён</b>\n\nЗаявка на ${formatAmount(credit.amount)} CBC отклонена администратором.\nПо вопросам обращайтесь в поддержку.`);
  }
  res.json({ success: true });
}
