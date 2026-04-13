const { getPool, genId, rowToCredit, rowToAccount, addTransaction, formatAmount, sendError, notifyTelegram } = require('./_db');

async function notifyAdmin(text, inlineKeyboard) {
  const token = process.env.BOT_TOKEN;
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!token || !adminId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: adminId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: inlineKeyboard } }),
  }).catch(() => {});
}

module.exports = async function handler(req, res) {
  const pool = getPool();
  const { action, userId, creditId } = req.query;

  if (req.method === 'GET' && action === 'list') {
    if (!userId) return sendError(res, 400, 'userId required');
    const { rows } = await pool.query('SELECT * FROM credits WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
    return res.json(rows.map(rowToCredit));
  }

  if (req.method === 'POST' && action === 'request') {
    const { userId: uid, accountId, amount, purpose } = req.body;
    const rounded = Math.round(amount * 100) / 100;
    if (!uid || !accountId || rounded <= 0) return sendError(res, 400, 'Некорректные данные');
    const { rows: activeRows } = await pool.query(
      "SELECT COALESCE(SUM(amount-paid_amount),0) as debt FROM credits WHERE user_id=$1 AND status='active'", [uid]
    );
    if (parseFloat(activeRows[0].debt) + rounded > 50) return sendError(res, 400, 'Превышен кредитный лимит (50 CBC)');
    const id = genId();
    const { rows } = await pool.query(
      "INSERT INTO credits (id,user_id,target_account_id,amount,paid_amount,interest_sent,interest_rate,purpose,status) VALUES ($1,$2,$3,$4,0,0,0.02,$5,'pending') RETURNING *",
      [id, uid, accountId, rounded, purpose || '']
    );
    const credit = rowToCredit(rows[0]);
    const { rows: uRows } = await pool.query('SELECT nickname,telegram_id FROM users WHERE id=$1', [uid]);
    const { rows: aRows } = await pool.query('SELECT name FROM accounts WHERE id=$1', [accountId]);
    notifyAdmin(
      `🏦 <b>Заявка на кредит</b>\n\nИгрок: <b>${uRows[0]?.nickname || uid}</b>\nTG ID: ${uRows[0]?.telegram_id || '—'}\nСумма: <b>${formatAmount(rounded)} CBC</b>\nСчёт: <code>${aRows[0]?.name || accountId}</code>\nЦель: ${purpose || '—'}`,
      [[{ text: '✅ Одобрить', callback_data: `approve:${credit.id}` }, { text: '❌ Отклонить', callback_data: `reject:${credit.id}` }]]
    );
    return res.status(201).json(credit);
  }

  if (req.method === 'POST' && action === 'approve') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query("SELECT * FROM credits WHERE id=$1 AND status='pending' FOR UPDATE", [creditId]);
      if (!rows[0]) { await client.query('ROLLBACK'); return sendError(res, 404, 'Не найден или уже обработан'); }
      const credit = rows[0];
      await client.query("UPDATE credits SET status='active' WHERE id=$1", [credit.id]);
      await client.query('UPDATE accounts SET balance=balance+$1 WHERE id=$2', [credit.amount, credit.target_account_id]);
      await addTransaction(client, credit.target_account_id, 'credit', parseFloat(credit.amount), `Кредит одобрен: +${formatAmount(credit.amount)} CBC`);
      await client.query('COMMIT');
      const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
      if (uRows[0]?.telegram_id) notifyTelegram(uRows[0].telegram_id, `✅ <b>Кредит одобрен!</b>\n\nСумма: <b>${formatAmount(credit.amount)} CBC</b>\nЗачислена на счёт.\n\n📌 Ставка: 2% в неделю.`);
      return res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); return sendError(res, 500, e.message); }
    finally { client.release(); }
  }

  if (req.method === 'POST' && action === 'reject') {
    const { rows } = await pool.query("UPDATE credits SET status='rejected' WHERE id=$1 AND status='pending' RETURNING *", [creditId]);
    if (!rows[0]) return sendError(res, 404, 'Не найден');
    const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [rows[0].user_id]);
    if (uRows[0]?.telegram_id) notifyTelegram(uRows[0].telegram_id, `❌ <b>Кредит отклонён</b>\n\nЗаявка на ${formatAmount(rows[0].amount)} CBC отклонена администратором.`);
    return res.json({ success: true });
  }

  if (req.method === 'POST' && action === 'repay') {
    const { amount, fromAccountId } = req.body;
    const repayAmount = Math.round(amount * 100) / 100;
    if (repayAmount <= 0) return sendError(res, 400, 'Некорректная сумма');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: cRows } = await client.query("SELECT * FROM credits WHERE id=$1 AND status='active' FOR UPDATE", [creditId]);
      if (!cRows[0]) { await client.query('ROLLBACK'); return sendError(res, 404, 'Кредит не найден'); }
      const credit = cRows[0];
      const { rows: aRows } = await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [fromAccountId]);
      if (!aRows[0]) { await client.query('ROLLBACK'); return sendError(res, 404, 'Счёт не найден'); }
      const acc = rowToAccount(aRows[0]);

      const weeksPassed = Math.floor((Date.now() - new Date(credit.created_at).getTime()) / (7 * 24 * 3600 * 1000));
      const totalInterestAccrued = Math.round(parseFloat(credit.amount) * parseFloat(credit.interest_rate) * weeksPassed * 100) / 100;
      const unpaidInterest = Math.max(0, Math.round((totalInterestAccrued - parseFloat(credit.interest_sent)) * 100) / 100);
      const remaining = Math.round((parseFloat(credit.amount) - parseFloat(credit.paid_amount)) * 100) / 100;
      const totalToPay = Math.round((remaining + unpaidInterest) * 100) / 100;
      const actualRepay = Math.min(repayAmount, totalToPay);

      if (acc.balance < actualRepay) { await client.query('ROLLBACK'); return sendError(res, 400, 'Недостаточно средств'); }

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
      await client.query('UPDATE credits SET paid_amount=$1,interest_sent=$2,status=$3 WHERE id=$4', [newPaidAmount, newInterestSent, newStatus, credit.id]);
      await client.query('COMMIT');

      const { rows: uRows } = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [credit.user_id]);
      if (uRows[0]?.telegram_id) {
        const newRemaining = Math.max(0, Math.round((parseFloat(credit.amount) - newPaidAmount) * 100) / 100);
        notifyTelegram(uRows[0].telegram_id, newStatus === 'paid'
          ? `✅ <b>Кредит полностью погашен!</b>\n\nОплачено: <b>${formatAmount(actualRepay)} CBC</b>. Поздравляем!`
          : `💳 <b>Платёж принят</b>\n\nОплачено: <b>${formatAmount(actualRepay)} CBC</b>\nОсталось: <b>${formatAmount(newRemaining)} CBC</b>`);
      }
      return res.json({ success: true, newStatus });
    } catch (e) { await client.query('ROLLBACK'); return sendError(res, 500, e.message); }
    finally { client.release(); }
  }

  sendError(res, 400, 'Unknown action');
};
