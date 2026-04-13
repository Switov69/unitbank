import { getPool, rowToUser, err } from '../../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [req.query.telegramId]);
  if (!rows[0]) return err(res, 404, 'Not found');
  res.json(rowToUser(rows[0]));
}
