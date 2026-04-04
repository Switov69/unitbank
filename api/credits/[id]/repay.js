import { getPool, rowToAccount, addTransaction, formatAmount, err } from '../../_db.js';
import { notifyTelegram } from '../../_notify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
  const { amount, fromAccountId } = req.body;
  const repayAmount = Math.round(amount * 100) / 100;
  if (repayAmount <= 0) return err(res, 400, 'Некорректная сумма');

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: cRows } = await client.query(
      "SELECT * FROM credits WHERE id=$1 AND status='active' FOR UPDATE", [req.query.id]
    );
    if (!cRows[0]) { await client.query('ROLLBACK'); return err(res, 404, 'Кредит не найден'); }
    const credit = cRows[0];

    const { rows: aRows } = await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [fromAccountId]);
    if (!aRows[0]) { await client.query('ROLLBACK'); return err(res, 404, 'Счёт не найден'); }
    const acc = rowToAccount(aRows[0]);

    const now = Date.now();
    const created = new Date(credit.created_at).getTime();
    const weeksPassed = Math.floor((now - created) / (7 * 24 * 3600 * 1000));
    const totalInterestAccrued = Math.round(parseFloat(credit.amount) * parseFloat(credit.interest_rate) * weeksPassed * 100) / 100;
    const unpaidInterest = Math.max(0, Math.round((totalInterestAccrued - parseFloat(credit.interest_sent)) * 100) / 100);
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

    const newPaidAmount = Math.round((parseFloat(credit.paid_amount) + principalPayment) * 100) / 100;
    const newInterestSent = Math.round((parseFloat(credit.interest_sent) + interestPayment) * 100) / 100;
    const newStatus = newPaidAmount >= parseFloat(credit.amount) ? 'paid' : 'active';

    await client.query(
      'UPDATE credits SET paid_amount=$1, interest_sent=$2, status=$3 WHERE id=$4',
      [newPaidAmount, newInterestSent, newStatus, credit.id]
    );
    await client.query('COMMIT');

    const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
    if (uRows[0]?.telegram_id) {
      const newRemaining = Math.max(0, Math.round((parseFloat(credit.amount) - newPaidAmount) * 100) / 100);
      notifyTelegram(uRows[0].telegram_id,
        newStatus === 'paid'
          ? `✅ <b>Кредит полностью погашен!</b>\n\nОплачено: <b>${formatAmount(actualRepay)} CBC</b>. Поздравляем!`
          : `💳 <b>Платёж принят</b>\n\nОплачено: <b>${formatAmount(actualRepay)} CBC</b>\nОсталось: <b>${formatAmount(newRemaining)} CBC</b>`
      );
    }

    res.json({ success: true, newStatus });
  } catch (e) {
    await client.query('ROLLBACK');
    err(res, 500, e.message);
  } finally {
    client.release();
  }
}
