import { getPool, rowToTransaction, err } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return err(res, 405, 'Method not allowed');
  const { accountId } = req.query;
  if (!accountId) return err(res, 400, 'accountId required');
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE account_id=$1 ORDER BY created_at DESC',
    [accountId]
  );
  res.json(rows.map(rowToTransaction));
}
