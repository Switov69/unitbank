from __future__ import annotations

import re

from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from database.db import Database
from handlers.main_menu import send_main_menu
from keyboards import reply as rkb


def is_cancel_text(text: str | None) -> bool:
    return text is not None and text.strip() == rkb.BTN_CANCEL


async def cancel_flow(message: Message, db: Database, state: FSMContext, notice: str = "Действие отменено.") -> None:
    await state.clear()
    await message.answer(notice)
    await send_main_menu(message, db, restore_reply_kb=True)


async def match_reply_account(text: str, user_id: int, db: Database):
    """Находит счёт пользователя по тексту кнопки реплай-клавиатуры вида
    'Название (№1234)'. Никогда не доверяет тексту без проверки в БД —
    номер извлекается из подписи кнопки и сверяется с реальным владельцем."""
    match = re.search(r"№(\d{4})", text or "")
    if not match:
        return None
    account = await db.get_account_by_number(match.group(1))
    if account is None or account["user_id"] != user_id:
        return None
    return account
