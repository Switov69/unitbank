import { getPool, rowToAccount, addTransaction, formatAmount, err, notifyTelegram } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
  const { action } = req.query;
  const creditId = req.query.id;
  const pool = getPool();

  if (action === 'approve') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query("SELECT * FROM credits WHERE id=$1 AND status='pending' FOR UPDATE", [creditId]);
      if (!rows[0]) { await client.query('ROLLBACK'); return err(res, 404, 'Кредит не найден или уже обработан'); }
      const credit = rows[0];
      await client.query("UPDATE credits SET status='active' WHERE id=$1", [credit.id]);
      await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [credit.amount, credit.target_account_id]);
      await addTransaction(client, credit.target_account_id, 'credit', parseFloat(credit.amount), `Кредит одобрен: +${formatAmount(credit.amount)} CBC`);
      await client.query('COMMIT');
      const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
      if (uRows[0]?.telegram_id) notifyTelegram(uRows[0].telegram_id, `✅ <b>Кредит одобрен!</b>\n\nСумма: <b>${formatAmount(credit.amount)} CBC</b>\nЗачислена на счёт.\n\n📌 Ставка: 2% в неделю.`);
      return res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); return err(res, 500, e.message); }
    finally { client.release(); }
  }

  if (action === 'reject') {
    const { rows } = await pool.query("UPDATE credits SET status='rejected' WHERE id=$1 AND status='pending' RETURNING *", [creditId]);
    if (!rows[0]) return err(res, 404, 'Кредит не найден');
    const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [rows[0].user_id]);
    if (uRows[0]?.telegram_id) notifyTelegram(uRows[0].telegram_id, `❌ <b>Кредит отклонён</b>\n\nЗаявка на ${formatAmount(rows[0].amount)} CBC отклонена администратором.`);
    return res.json({ success: true });
  }

  if (action === 'repay') {
    const { amount, fromAccountId } = req.body;
    const repayAmount = Math.round(amount * 100) / 100;
    if (repayAmount <= 0) return err(res, 400, 'Некорректная сумма');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: cRows } = await client.query("SELECT * FROM credits WHERE id=$1 AND status='active' FOR UPDATE", [creditId]);
      if (!cRows[0]) { await client.query('ROLLBACK'); return err(res, 404, 'Кредит не найден'); }
      const credit = cRows[0];
      const { rows: aRows } = await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [fromAccountId]);
      if (!aRows[0]) { await client.query('ROLLBACK'); return err(res, 404, 'Счёт не найден'); }
      const acc = rowToAccount(aRows[0]);
      const now = Date.now();
      const created = new Date(credit.created_at).getTime();
      const weeksPassed = Math.floor((now - created) / (7 * 24 * 3600 * 1000));
      const totalInterest = Math.round(parseFloat(credit.amount) * parseFloat(credit.interest_rate) * weeksPassed * 100) / 100;
      const unpaidInterest = Math.max(0, Math.round((totalInterest - parseFloat(credit.interest_sent)) * 100) / 100);
      const remaining = Math.round((parseFloat(credit.amount) - parseFloat(credit.paid_amount)) * 100) / 100;
      const totalToPay = Math.round((remaining + unpaidInterest) * 100) / 100;
      const actualRepay = Math.min(repayAmount, totalToPay);
      if (acc.balance < actualRepay) { await client.query('ROLLBACK'); return err(res, 400, 'Недостаточно средств'); }
      const interestPayment = Math.min(unpaidInterest, actualRepay);
      const principalPayment = Math.round((actualRepay - interestPayment) * 100) / 100;
      await client.query('UPDATE accounts SET balance=balance-$1 WHERE id=$2', [actualRepay, fromAccountId]);
      await addTransaction(client, fromAccountId, 'credit_repay', actualRepay, `Погашение кредита: -${formatAmount(actualRepay)} CBC`);
      if (interestPayment > 0) {
        const { rows: bankRows } = await client.query("SELECT id FROM accounts WHERE name='ub-unitbank'");
        if (bankRows[0]) {
          await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [interestPayment, bankRows[0].id]);
          await addTransaction(client, bankRows[0].id, 'income', interestPayment, `Процент по кредиту от ${acc.name}`);
        }
      }
      const newPaid = Math.round((parseFloat(credit.paid_amount) + principalPayment) * 100) / 100;
      const newInterestSent = Math.round((parseFloat(credit.interest_sent) + interestPayment) * 100) / 100;
      const newStatus = newPaid >= parseFloat(credit.amount) ? 'paid' : 'active';
      await client.query('UPDATE credits SET paid_amount=$1, interest_sent=$2, status=$3 WHERE id=$4', [newPaid, newInterestSent, newStatus, credit.id]);
      await client.query('COMMIT');
      const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
      if (uRows[0]?.telegram_id) {
        const newRemaining = Math.max(0, Math.round((parseFloat(credit.amount) - newPaid) * 100) / 100);
        notifyTelegram(uRows[0].telegram_id, newStatus === 'paid'
          ? `✅ <b>Кредит полностью погашен!</b>\n\nОплачено: <b>${formatAmount(actualRepay)} CBC</b>`
          : `💳 <b>Платёж принят</b>\n\nОплачено: <b>${formatAmount(actualRepay)} CBC</b>\nОсталось: <b>${formatAmount(newRemaining)} CBC</b>`);
      }
      return res.json({ success: true, newStatus });
    } catch (e) { await client.query('ROLLBACK'); return err(res, 500, e.message); }
    finally { client.release(); }
  }

  err(res, 400, 'Unknown action');
}
