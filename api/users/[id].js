import { getPool, err } from '../_db.js';

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id=$1', [req.query.id]);
    return res.json({ success: true });
  }
  err(res, 405, 'Method not allowed');
}
