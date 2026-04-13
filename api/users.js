const { getPool, genId, rowToUser, sendError } = require('./_db');

module.exports = async function handler(req, res) {
  const pool = getPool();
  const { action, telegramId, nickname, userId } = req.query;

  if (req.method === 'GET' && action === 'byTelegram') {
    const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
    if (!rows[0]) return sendError(res, 404, 'Not found');
    return res.json(rowToUser(rows[0]));
  }

  if (req.method === 'GET' && action === 'checkNickname') {
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(nickname)=LOWER($1)', [nickname]);
    if (!rows[0]) return sendError(res, 404, 'Not found');
    return res.json({ exists: true });
  }

  if (req.method === 'POST' && action === 'create') {
    const { nickname: nick, pin, telegramId: tgId, telegramFirstName } = req.body;
    if (!nick || !pin) return sendError(res, 400, 'Не все поля заполнены');
    try {
      if (tgId) {
        const { rows: existing } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [tgId]);
        if (existing[0]) {
          const isPlaceholder = existing[0].pin === '' || existing[0].nickname.startsWith('tg_');
          if (!isPlaceholder) return sendError(res, 409, 'Аккаунт с этим Telegram уже зарегистрирован');
          const { rows } = await pool.query(
            'UPDATE users SET nickname=$1, pin=$2, telegram_first_name=$3 WHERE telegram_id=$4 RETURNING *',
            [nick, pin, telegramFirstName || '', tgId]
          );
          return res.status(201).json(rowToUser(rows[0]));
        }
      }
      const { rows: nickCheck } = await pool.query('SELECT id FROM users WHERE LOWER(nickname)=LOWER($1)', [nick]);
      if (nickCheck[0]) return sendError(res, 409, 'Никнейм уже занят');
      const { rows } = await pool.query(
        'INSERT INTO users (id, nickname, pin, telegram_id, telegram_first_name) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [genId(), nick, pin, tgId || null, telegramFirstName || '']
      );
      return res.status(201).json(rowToUser(rows[0]));
    } catch (e) {
      if (e.code === '23505') return sendError(res, 409, 'Никнейм уже занят');
      return sendError(res, 500, e.message);
    }
  }

  if (req.method === 'PUT' && action === 'updatePin') {
    await pool.query('UPDATE users SET pin=$1 WHERE id=$2', [req.body.pin, userId]);
    return res.json({ success: true });
  }

  if (req.method === 'DELETE' && action === 'delete') {
    await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    return res.json({ success: true });
  }

  sendError(res, 400, 'Unknown action');
};
