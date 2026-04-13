import { getPool, err } from '../_db.js';

export default async function handler(req, res) {
  const pool = getPool();
  if (req.method === 'DELETE') {
    await pool.query('DELETE FROM users WHERE id=$1', [req.query.id]);
    return res.json({ success: true });
  }
  if (req.method === 'PUT') {
    await pool.query('UPDATE users SET pin=$1 WHERE id=$2', [req.body.pin, req.query.id]);
    return res.json({ success: true });
  }
  err(res, 405, 'Method not allowed');
}
