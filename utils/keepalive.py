"""
Render (бесплатный тариф Web Service) усыпляет процесс после ~15 минут
отсутствия входящих HTTP-запросов и требует, чтобы сервис слушал порт $PORT.

Здесь поднимается лёгкий aiohttp-сервер с health-check маршрутом и отдельная
фоновая задача, которая сама периодически обращается к своему же публичному
адресу (RENDER_EXTERNAL_URL), чтобы Render не считал сервис неактивным.
"""
from __future__ import annotations

import asyncio
import logging

import aiohttp
from aiohttp import web

import config

logger = logging.getLogger(__name__)


async def _health(_: web.Request) -> web.Response:
    return web.Response(text="UnitBank bot is running.")


async def start_web_server() -> web.AppRunner:
    app = web.Application()
    app.router.add_get("/", _health)
    app.router.add_get("/health", _health)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host="0.0.0.0", port=config.PORT)
    await site.start()
    logger.info("Keep-alive web-server запущен на порту %s", config.PORT)
    return runner


async def self_ping_loop() -> None:
    """Раз в PING_INTERVAL_SECONDS шлёт GET-запрос сам себе, не давая Render
    усыпить сервис. Если SELF_URL не задан (например, локальный запуск),
    просто ничего не делает."""
    if not config.SELF_URL:
        logger.info("SELF_URL не задан — self-ping отключён (нормально для локального запуска).")
        return

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
        while True:
            await asyncio.sleep(config.PING_INTERVAL_SECONDS)
            try:
                async with session.get(config.SELF_URL) as resp:
                    logger.debug("Self-ping: %s -> %s", config.SELF_URL, resp.status)
            except Exception as exc:  # noqa: BLE001 - пинг не должен ронять бота
                logger.warning("Self-ping не удался: %s", exc)
