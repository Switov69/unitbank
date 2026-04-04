import { getPool, rowToAccount, addTransaction, formatAmount, err } from './_db.js';
import { notifyTelegram } from './_notify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
  const { fromAccountId, toAccountName, amount } = req.body;
  const rounded = Math.round(amount * 100) / 100;
  if (!fromAccountId || !toAccountName || rounded <= 0) {
    return err(res, 400, 'Некорректные данные');
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: fromRows } = await client.query(
      'SELECT * FROM accounts WHERE id=$1 FOR UPDATE',
      [fromAccountId]
    );
    if (!fromRows[0]) { await client.query('ROLLBACK'); return err(res, 404, 'Счёт отправителя не найден'); }
    const fromAcc = rowToAccount(fromRows[0]);
    if (fromAcc.balance < rounded) { await client.query('ROLLBACK'); return err(res, 400, 'Недостаточно средств'); }

    const normalizedName = toAccountName.startsWith('ub-') ? toAccountName : `ub-${toAccountName}`;
    const { rows: toRows } = await client.query(
      'SELECT * FROM accounts WHERE name=$1 FOR UPDATE',
      [normalizedName]
    );
    if (!toRows[0]) { await client.query('ROLLBACK'); return err(res, 404, 'Счёт получателя не найден'); }
    const toAcc = rowToAccount(toRows[0]);

    await client.query('UPDATE accounts SET balance=balance-$1 WHERE id=$2', [rounded, fromAccountId]);
    await addTransaction(client, fromAccountId, 'expense', rounded, `Перевод → ${toAcc.name}`);

    await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [rounded, toAcc.id]);
    await addTransaction(client, toAcc.id, 'income', rounded, `Перевод ← ${fromAcc.name}`);

    await client.query('COMMIT');

    const { rows: recipRows } = await pool.query(
      'SELECT u.telegram_id FROM users u JOIN accounts a ON a.user_id=u.id WHERE a.id=$1',
      [toAcc.id]
    );
    if (recipRows[0]?.telegram_id) {
      notifyTelegram(
        recipRows[0].telegram_id,
        `💰 <b>Входящий перевод</b>\n\nСумма: <b>${formatAmount(rounded)} CBC</b>\nНа счёт: <code>${toAcc.name}</code>\nОт: <code>${fromAcc.name}</code>`
      );
    }

    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    err(res, 500, e.message);
  } finally {
    client.release();
  }
}
