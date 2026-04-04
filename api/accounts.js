import { getPool, genId, rowToAccount, err } from './_db.js';

export default async function handler(req, res) {
  const pool = getPool();

  if (req.method === 'GET') {
    const { userId } = req.query;
    if (!userId) return err(res, 400, 'userId required');
    const { rows } = await pool.query(
      'SELECT * FROM accounts WHERE user_id=$1 ORDER BY created_at ASC',
      [userId]
    );
    return res.json(rows.map(rowToAccount));
  }

  if (req.method === 'POST') {
    const { userId, name, color } = req.body;
    if (!userId || !name) return err(res, 400, 'userId and name required');
    const { rows: existing } = await pool.query(
      'SELECT id FROM accounts WHERE user_id=$1',
      [userId]
    );
    if (existing.length >= 2) return err(res, 400, 'Максимум 2 счёта');
    const id = genId();
    try {
      const { rows } = await pool.query(
        'INSERT INTO accounts (id, user_id, name, balance, color) VALUES ($1,$2,$3,0,$4) RETURNING *',
        [id, userId, name, color || '#4285f4']
      );
      return res.status(201).json(rowToAccount(rows[0]));
    } catch (e) {
      if (e.code === '23505') return err(res, 409, 'Счёт с таким именем уже существует');
      err(res, 500, e.message);
    }
  }

  err(res, 405, 'Method not allowed');
}
