"""
Конфигурация бота. Все чувствительные данные берутся из переменных окружения
(.env локально, Environment Variables на Render), в коде НИЧЕГО не хардкодится,
кроме id администратора (так и было запрошено в ТЗ).
"""
import os
from decimal import Decimal

from dotenv import load_dotenv

load_dotenv()

# --- Обязательные переменные окружения ---
BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")
DATABASE_URL: str = os.getenv("DATABASE_URL", "")

if not BOT_TOKEN:
    raise RuntimeError(
        "Не задан BOT_TOKEN. Укажите токен бота в переменных окружения (.env)."
    )
if not DATABASE_URL:
    raise RuntimeError(
        "Не задан DATABASE_URL. Укажите строку подключения к Neon.tech PostgreSQL."
    )

# --- ID администратора бота (задан жёстко по ТЗ) ---
ADMIN_ID: int = int(os.getenv("ADMIN_ID", "8933598292"))

# --- Название банка и валюта ---
BANK_NAME: str = "UnitBank"
CURRENCY: str = "𝐀𝐩"

# --- Регионы, доступные при регистрации ---
REGIONS: list[str] = ["ERD", "Капиталия", "Арда"]

# --- Ограничения бизнес-логики ---
MAX_ACCOUNTS_PER_USER: int = 4          # 1 при регистрации + 3 дополнительных
ACCOUNT_NUMBER_LENGTH: int = 4          # длина номера счёта
PROFILE_CHANGE_COOLDOWN_DAYS: int = 7   # кулдаун на смену никнейма / региона
PAYMENT_LINK_LIFETIME_DAYS: int = 14    # ссылка на получение денег живёт 2 недели
MIN_AMOUNT: Decimal = Decimal("0.01")   # минимальная сумма операции
MAX_AMOUNT: Decimal = Decimal("1000000000")  # защита от переполнения/опечаток

# --- Веб-сервер и self-ping для Render (чтобы бот не засыпал) ---
PORT: int = int(os.getenv("PORT", "10000"))
# Render сам прокидывает RENDER_EXTERNAL_URL для Web Service, но можно задать
# SELF_URL вручную (например, при другом хостинге).
SELF_URL: str = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("SELF_URL", "")
PING_INTERVAL_SECONDS: int = int(os.getenv("PING_INTERVAL_SECONDS", "600"))  # 10 минут
