import { getPool, rowToCredit, err } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
  const { userId } = req.query;
  if (!userId) return err(res, 400, 'userId required');
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM credits WHERE user_id=$1 ORDER BY created_at DESC',
    [userId]
  );
  res.json(rows.map(rowToCredit));
}
