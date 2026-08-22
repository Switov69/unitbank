"""
Точка входа UnitBank-бота.

Запускает:
  * long-polling бота aiogram,
  * лёгкий aiohttp веб-сервер (health-check для Render),
  * фоновую self-ping задачу (чтобы Render не усыплял бесплатный сервис),
  * фоновую задачу очистки просроченных платёжных ссылок.
"""
from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.memory import MemoryStorage

import config
from database.db import db
from handlers import accounts, admin, deposit, settings, start, transfer, withdraw
from middlewares.registration import RegistrationRequiredMiddleware
from utils.keepalive import self_ping_loop, start_web_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("unitbank")


async def cleanup_expired_links_loop() -> None:
    """Раз в час удаляет из БД просроченные платёжные ссылки."""
    while True:
        try:
            deleted = await db.delete_expired_payment_links()
            if deleted:
                logger.info("Удалено просроченных ссылок: %s", deleted)
        except Exception:  # noqa: BLE001
            logger.exception("Ошибка при очистке просроченных ссылок")
        await asyncio.sleep(3600)


async def main() -> None:
    bot = Bot(
        token=config.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode="HTML"),
    )
    dp = Dispatcher(storage=MemoryStorage())

    # Общий доступ к базе данных из любого хендлера через параметр `db`
    dp["db"] = db

    # Регистрация обязательна для всех действий, кроме /start и самой регистрации.
    # ВАЖНО: используется outer_middleware, а не middleware() — обычная (inner)
    # middleware на Dispatcher применяется только к хендлерам, зарегистрированным
    # напрямую на самом Dispatcher, и НЕ сработает для хендлеров из под-роутеров
    # (start.router, accounts.router и т.д.). outer_middleware оборачивает всю
    # цепочку диспетчеризации, включая под-роутеры.
    dp.message.outer_middleware(RegistrationRequiredMiddleware())
    dp.callback_query.outer_middleware(RegistrationRequiredMiddleware())

    dp.include_router(start.router)
    dp.include_router(accounts.router)
    dp.include_router(transfer.router)
    dp.include_router(withdraw.router)
    dp.include_router(deposit.router)
    dp.include_router(settings.router)
    dp.include_router(admin.router)

    await db.connect()
    await db.create_tables()
    logger.info("Подключение к базе данных установлено, таблицы готовы.")

    web_runner = await start_web_server()

    await bot.delete_webhook(drop_pending_updates=True)

    try:
        await asyncio.gather(
            dp.start_polling(bot),
            self_ping_loop(),
            cleanup_expired_links_loop(),
        )
    finally:
        await web_runner.cleanup()
        await db.close()
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен.")
