from __future__ import annotations

import re

from aiogram.enums import ButtonStyle
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from database.db import Database
from handlers.main_menu import send_main_menu
from keyboards import reply as rkb


def is_cancel_text(text: str | None) -> bool:
    return text is not None and text.strip() == rkb.BTN_CANCEL


def cancel_inline_kb(callback_data: str) -> InlineKeyboardMarkup:
    """Одна красная инлайн-кнопка «Отмена» с заданным callback_data."""
    kb = InlineKeyboardBuilder()
    kb.button(text="❌ Отмена", callback_data=callback_data, style=ButtonStyle.DANGER)
    kb.adjust(1)
    return kb.as_markup()


async def try_delete_message(bot, chat_id: int | None, message_id: int | None) -> None:
    if not chat_id or not message_id:
        return
    try:
        await bot.delete_message(chat_id, message_id)
    except Exception:  # noqa: BLE001 - сообщение уже могло быть удалено/устареть
        pass


async def cancel_flow(message: Message, db: Database, state: FSMContext, notice: str = "Действие отменено.") -> None:
    await state.clear()
    await message.answer(notice, reply_markup=rkb.main_menu_kb())
    await send_main_menu(message, db)


async def finish_flow(callback: CallbackQuery, db: Database, text: str, user_id: int | None = None) -> None:
    """
    Завершает диалог, начатый через инлайн-подтверждение: удаляет старое
    сообщение с кнопками «Подтвердить/Отменить», отправляет новый текст
    результата (восстанавливая реплай-клавиатуру главного меню) и показывает
    главное меню.
    """
    uid = user_id if user_id is not None else callback.from_user.id
    chat_id = callback.message.chat.id
    try:
        await callback.message.delete()
    except Exception:  # noqa: BLE001 - сообщение уже могло быть удалено
        pass
    await callback.bot.send_message(chat_id, text, reply_markup=rkb.main_menu_kb())
    await send_main_menu(callback.message, db, user_id=uid)


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
