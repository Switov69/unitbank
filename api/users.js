import { getPool, genId, rowToUser, err } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
  const { nickname, pin, telegramId, telegramFirstName } = req.body;
  if (!nickname || !pin) return err(res, 400, 'Не все поля заполнены');
  const pool = getPool();
  const id = genId();
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (id, nickname, pin, telegram_id, telegram_first_name) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [id, nickname, pin, telegramId || null, telegramFirstName || '']
    );
    res.status(201).json(rowToUser(rows[0]));
  } catch (e) {
    if (e.code === '23505') return err(res, 409, 'Никнейм уже занят');
    err(res, 500, e.message);
  }
}
