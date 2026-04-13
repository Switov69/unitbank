const { getPool, rowToTransaction, sendError } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');
  const { accountId } = req.query;
  if (!accountId) return sendError(res, 400, 'accountId required');
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE account_id=$1 ORDER BY created_at DESC',
    [accountId]
  );
  res.json(rows.map(rowToTransaction));
};
