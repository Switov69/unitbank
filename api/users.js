import { getPool, genId, rowToUser, err } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
  const { nickname, pin, telegramId, telegramFirstName } = req.body;
  if (!nickname || !pin) return err(res, 400, 'Не все поля заполнены');
  const pool = getPool();

  try {
    if (telegramId) {
      const { rows: existing } = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramId]
      );
      if (existing[0]) {
        const isPlaceholder = existing[0].pin === '' || existing[0].nickname.startsWith('tg_');
        if (!isPlaceholder) {
          return err(res, 409, 'Аккаунт с этим Telegram уже зарегистрирован');
        }
        const { rows } = await pool.query(
          `UPDATE users
           SET nickname=$1, pin=$2, telegram_first_name=$3
           WHERE telegram_id=$4
           RETURNING *`,
          [nickname, pin, telegramFirstName || '', telegramId]
        );
        return res.status(201).json(rowToUser(rows[0]));
      }
    }

    const { rows: nickCheck } = await pool.query(
      'SELECT id FROM users WHERE LOWER(nickname) = LOWER($1)',
      [nickname]
    );
    if (nickCheck[0]) return err(res, 409, 'Никнейм уже занят');

    const { rows } = await pool.query(
      'INSERT INTO users (id, nickname, pin, telegram_id, telegram_first_name) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [genId(), nickname, pin, telegramId || null, telegramFirstName || '']
    );
    res.status(201).json(rowToUser(rows[0]));
  } catch (e) {
    if (e.code === '23505') return err(res, 409, 'Никнейм уже занят');
    err(res, 500, e.message);
  }
}
