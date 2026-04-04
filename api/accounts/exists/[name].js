import { getPool, err } from '../../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
  const pool = getPool();
  const rawName = req.query.name;
  const fullName = rawName.startsWith('ub-') ? rawName : `ub-${rawName}`;
  const { rows } = await pool.query('SELECT id FROM accounts WHERE name=$1', [fullName]);
  if (!rows[0]) return err(res, 404, 'Not found');
  res.json({ exists: true });
}
