from __future__ import annotations

from datetime import datetime, timedelta, timezone

from aiogram import F, Router
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

import config
from database.db import Database, NicknameTakenError
from handlers.main_menu import edit_main_menu, send_main_menu
from keyboards import inline as ikb
from keyboards import reply as rkb
from states.states import SettingsStates
from utils.formatting import escape, format_remaining
from utils.validators import ValidationError, validate_nickname

router = Router(name="settings")

COOLDOWN = timedelta(days=config.PROFILE_CHANGE_COOLDOWN_DAYS)


def _cooldown_remaining(last_change) -> timedelta | None:
    if last_change is None:
        return None
    now = datetime.now(timezone.utc)
    unlock_at = last_change + COOLDOWN
    if now >= unlock_at:
        return None
    return unlock_at - now


@router.message(StateFilter(None), F.text == rkb.BTN_SETTINGS)
async def settings_entry(message: Message) -> None:
    await message.answer("⚙️ <b>Настройки</b>", reply_markup=ikb.settings_menu_kb())


@router.callback_query(F.data == "set_nickname")
async def set_nickname_start(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    user = await db.get_user(callback.from_user.id)
    remaining = _cooldown_remaining(user["last_nickname_change"])
    if remaining is not None:
        await callback.answer(
            f"Никнейм можно менять раз в {config.PROFILE_CHANGE_COOLDOWN_DAYS} дней. "
            f"Осталось подождать: {format_remaining(remaining)}.",
            show_alert=True,
        )
        return

    await state.set_state(SettingsStates.nickname)
    await callback.message.edit_text("Введите новый никнейм:")
    await callback.answer()


@router.message(StateFilter(SettingsStates.nickname), F.text)
async def set_nickname_apply(message: Message, db: Database, state: FSMContext) -> None:
    try:
        nickname = validate_nickname(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    existing = await db.find_user_by_nickname(nickname)
    if existing is not None and existing["user_id"] != message.from_user.id:
        await message.answer("Этот никнейм уже занят. Попробуйте другой:")
        return

    await state.clear()
    try:
        await db.update_nickname(message.from_user.id, nickname)
    except NicknameTakenError as e:
        await message.answer(str(e))
        await send_main_menu(message, db)
        return
    await message.answer(f"✅ Никнейм изменён на «{escape(nickname)}».")
    await send_main_menu(message, db)


@router.callback_query(F.data == "set_region")
async def set_region_start(callback: CallbackQuery, db: Database) -> None:
    user = await db.get_user(callback.from_user.id)
    remaining = _cooldown_remaining(user["last_region_change"])
    if remaining is not None:
        await callback.answer(
            f"Регион можно менять раз в {config.PROFILE_CHANGE_COOLDOWN_DAYS} дней. "
            f"Осталось подождать: {format_remaining(remaining)}.",
            show_alert=True,
        )
        return

    await callback.message.edit_text("Выберите новый регион:", reply_markup=ikb.settings_region_kb())
    await callback.answer()


@router.callback_query(F.data.startswith("set_region_to:"))
async def set_region_apply(callback: CallbackQuery, db: Database) -> None:
    region = callback.data.split(":", 1)[1]
    if region not in config.REGIONS:
        await callback.answer("Некорректный регион.", show_alert=True)
        return

    user = await db.get_user(callback.from_user.id)
    remaining = _cooldown_remaining(user["last_region_change"])
    if remaining is not None:
        await callback.answer("Регион уже был изменён недавно.", show_alert=True)
        return

    await db.update_region(callback.from_user.id, region)
    await callback.message.edit_text(f"✅ Регион изменён на «{escape(region)}».")
    await send_main_menu(callback.message, db, user_id=callback.from_user.id)
    await callback.answer()


@router.callback_query(F.data == "set_delete_account")
async def set_delete_account_start(callback: CallbackQuery) -> None:
    await callback.message.edit_text(
        "⚠️ Вы уверены, что хотите удалить аккаунт?\n\n"
        "Будут безвозвратно удалены все ваши счета и данные из базы данных бота. "
        "Это действие необратимо.",
        reply_markup=ikb.delete_account_confirm_kb(),
    )
    await callback.answer()


@router.callback_query(F.data == "set_delete_cancel")
async def set_delete_account_cancel(callback: CallbackQuery, db: Database) -> None:
    await edit_main_menu(callback, db)
    await callback.answer()


@router.callback_query(F.data == "set_delete_confirm")
async def set_delete_account_confirm(callback: CallbackQuery, db: Database) -> None:
    await db.delete_user(callback.from_user.id)
    await callback.message.edit_text(
        "🗑 Ваш аккаунт и все связанные с ним данные удалены из UnitBank.\n\n"
        "Чтобы начать заново, отправьте /start."
    )
    try:
        await callback.message.answer("До встречи! 👋", reply_markup=ReplyKeyboardRemove())
    except Exception:  # noqa: BLE001
        pass
    await callback.answer()
