import { getPool, err } from '../../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return err(res, 405, 'Method not allowed');
  const pool = getPool();
  await pool.query('UPDATE users SET pin=$1 WHERE id=$2', [req.body.pin, req.query.id]);
  res.json({ success: true });
}
