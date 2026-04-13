const { getPool, genId, rowToAccount, sendError } = require('./_db');

module.exports = async function handler(req, res) {
  const pool = getPool();
  const { action, userId, name } = req.query;

  if (req.method === 'GET' && action === 'list') {
    if (!userId) return sendError(res, 400, 'userId required');
    const { rows } = await pool.query('SELECT * FROM accounts WHERE user_id=$1 ORDER BY created_at ASC', [userId]);
    return res.json(rows.map(rowToAccount));
  }

  if (req.method === 'GET' && action === 'exists') {
    const fullName = name.startsWith('ub-') ? name : `ub-${name}`;
    const { rows } = await pool.query('SELECT id FROM accounts WHERE name=$1', [fullName]);
    if (!rows[0]) return sendError(res, 404, 'Not found');
    return res.json({ exists: true });
  }

  if (req.method === 'POST' && action === 'create') {
    const { userId: uid, name: n, color } = req.body;
    if (!uid || !n) return sendError(res, 400, 'userId and name required');
    const { rows: existing } = await pool.query('SELECT id FROM accounts WHERE user_id=$1', [uid]);
    if (existing.length >= 2) return sendError(res, 400, 'Максимум 2 счёта');
    try {
      const { rows } = await pool.query(
        'INSERT INTO accounts (id, user_id, name, balance, color) VALUES ($1,$2,$3,0,$4) RETURNING *',
        [genId(), uid, n, color || '#4285f4']
      );
      return res.status(201).json(rowToAccount(rows[0]));
    } catch (e) {
      if (e.code === '23505') return sendError(res, 409, 'Счёт с таким именем уже существует');
      return sendError(res, 500, e.message);
    }
  }

  sendError(res, 400, 'Unknown action');
};
