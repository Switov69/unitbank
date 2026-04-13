import { getPool, rowToUser, err } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
  const pool = getPool();
  const { telegramId, nickname } = req.query;
  if (telegramId) {
    const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
    if (!rows[0]) return err(res, 404, 'Not found');
    return res.json(rowToUser(rows[0]));
  }
  if (nickname) {
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(nickname)=LOWER($1)', [nickname]);
    if (!rows[0]) return err(res, 404, 'Not found');
    return res.json({ exists: true });
  }
  err(res, 400, 'Provide telegramId or nickname');
}
