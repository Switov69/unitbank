import { getPool, err } from '../../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
  const pool = getPool();
  const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = LOWER($1)', [req.query.nickname]);
  if (!rows[0]) return err(res, 404, 'Not found');
  res.json({ exists: true });
}
