from __future__ import annotations

from aiogram import F, Router
from aiogram.enums import ButtonStyle
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

import config
from database.db import AccountLimitReachedError, Database, LastAccountDeletionError
from handlers.main_menu import edit_main_menu, edit_main_menu_by_id
from keyboards import inline as ikb
from states.states import AccountCreate, AccountRename
from utils.formatting import escape, money
from utils.validators import ValidationError, validate_account_name

router = Router(name="accounts")


def _cancel_kb(callback_data: str = "new_account_cancel") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="❌ Отмена", callback_data=callback_data, style=ButtonStyle.DANGER)
    kb.adjust(1)
    return kb.as_markup()


# --------------------------------------------------------------------------- #
#  Переключение счетов
# --------------------------------------------------------------------------- #
@router.callback_query(F.data.startswith("switch:"))
async def switch_account(callback: CallbackQuery, db: Database) -> None:
    account_id = int(callback.data.split(":", 1)[1])
    account = await db.get_account(account_id)
    if account is None or account["user_id"] != callback.from_user.id:
        await callback.answer("Счёт не найден.", show_alert=True)
        return
    await db.set_active_account(callback.from_user.id, account_id)
    await edit_main_menu(callback, db)
    await callback.answer()


@router.callback_query(F.data == "back_to_menu")
async def back_to_menu(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    await edit_main_menu(callback, db)
    await callback.answer()


# --------------------------------------------------------------------------- #
#  Создание нового счёта
# --------------------------------------------------------------------------- #
@router.callback_query(F.data == "new_account")
async def new_account_start(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    count = await db.count_accounts(callback.from_user.id)
    if count >= config.MAX_ACCOUNTS_PER_USER:
        await callback.answer("Достигнут лимит счетов (максимум 4).", show_alert=True)
        return

    await state.set_state(AccountCreate.name)
    await state.update_data(menu_chat_id=callback.message.chat.id, menu_message_id=callback.message.message_id)
    await callback.message.edit_text(
        "✏️ Введите название нового счёта:",
        reply_markup=_cancel_kb("new_account_cancel"),
    )
    await callback.answer()


@router.callback_query(StateFilter(AccountCreate.name), F.data == "new_account_cancel")
async def new_account_cancel(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    await edit_main_menu(callback, db)
    await callback.answer()


@router.message(StateFilter(AccountCreate.name), F.text)
async def new_account_name(message: Message, db: Database, state: FSMContext) -> None:
    try:
        name = validate_account_name(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    await state.update_data(new_account_name=name)
    await message.answer(
        f"Создать новый счёт «{escape(name)}»?",
        reply_markup=ikb.confirm_cancel_kb(
            confirm_data="account_create_confirm", cancel_data="account_create_cancel"
        ),
    )


@router.callback_query(StateFilter(AccountCreate.name), F.data == "account_create_confirm")
async def new_account_confirm(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    data = await state.get_data()
    name = data.get("new_account_name")
    menu_chat_id = data.get("menu_chat_id")
    menu_message_id = data.get("menu_message_id")
    await state.clear()

    if not name:
        await callback.answer("Что-то пошло не так, попробуйте снова.", show_alert=True)
        return

    try:
        await db.create_account(callback.from_user.id, name)
    except AccountLimitReachedError as e:
        await callback.message.edit_text(str(e))
        if menu_chat_id and menu_message_id:
            await edit_main_menu_by_id(callback.bot, menu_chat_id, menu_message_id, db, callback.from_user.id)
        await callback.answer()
        return

    await callback.message.edit_text("✅ Счёт создан.")
    if menu_chat_id and menu_message_id:
        await edit_main_menu_by_id(callback.bot, menu_chat_id, menu_message_id, db, callback.from_user.id)
    await callback.answer()


@router.callback_query(StateFilter(AccountCreate.name), F.data == "account_create_cancel")
async def new_account_deny(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    data = await state.get_data()
    menu_chat_id = data.get("menu_chat_id")
    menu_message_id = data.get("menu_message_id")
    await state.clear()
    await callback.message.edit_text("Создание счёта отменено.")
    if menu_chat_id and menu_message_id:
        await edit_main_menu_by_id(callback.bot, menu_chat_id, menu_message_id, db, callback.from_user.id)
    await callback.answer()


# --------------------------------------------------------------------------- #
#  Настройки счёта: переименование / удаление
# --------------------------------------------------------------------------- #
@router.callback_query(F.data == "acc_settings")
async def account_settings_open(callback: CallbackQuery, db: Database) -> None:
    user = await db.get_user(callback.from_user.id)
    accounts = await db.get_accounts(callback.from_user.id)
    active = next((a for a in accounts if a["account_id"] == user["active_account_id"]), accounts[0])

    text = (
        f"⚙️ Настройки счёта «{escape(active['account_name'])}» (№{active['account_number']})\n\n"
        "Что вы хотите сделать?"
    )
    await callback.message.edit_text(text, reply_markup=ikb.account_settings_kb(can_delete=len(accounts) > 1))
    await callback.answer()


@router.callback_query(F.data == "rename_account")
async def rename_account_start(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    user = await db.get_user(callback.from_user.id)
    await state.set_state(AccountRename.name)
    await state.update_data(
        menu_chat_id=callback.message.chat.id,
        menu_message_id=callback.message.message_id,
        rename_account_id=user["active_account_id"],
    )
    await callback.message.edit_text(
        "✏️ Введите новое название счёта:", reply_markup=_cancel_kb("rename_cancel")
    )
    await callback.answer()


@router.callback_query(StateFilter(AccountRename.name), F.data == "rename_cancel")
async def rename_account_cancel(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    await edit_main_menu(callback, db)
    await callback.answer()


@router.message(StateFilter(AccountRename.name), F.text)
async def rename_account_apply(message: Message, db: Database, state: FSMContext) -> None:
    try:
        name = validate_account_name(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    data = await state.get_data()
    account_id = data.get("rename_account_id")
    menu_chat_id = data.get("menu_chat_id")
    menu_message_id = data.get("menu_message_id")
    await state.clear()

    account = await db.get_account(account_id)
    if account is None or account["user_id"] != message.from_user.id:
        await message.answer("Счёт не найден.")
        return

    await db.rename_account(account_id, name)
    await message.answer(f"✅ Счёт переименован в «{escape(name)}».")
    if menu_chat_id and menu_message_id:
        await edit_main_menu_by_id(message.bot, menu_chat_id, menu_message_id, db, message.from_user.id)


@router.callback_query(F.data == "delete_account")
async def delete_account_start(callback: CallbackQuery, db: Database) -> None:
    user = await db.get_user(callback.from_user.id)
    accounts = await db.get_accounts(callback.from_user.id)
    if len(accounts) <= 1:
        await callback.answer("Нельзя удалить единственный счёт.", show_alert=True)
        return

    active_id = user["active_account_id"]
    active = next((a for a in accounts if a["account_id"] == active_id), accounts[0])
    others = [a for a in accounts if a["account_id"] != active["account_id"]]

    text = (
        f"🗑 Удаление счёта «{escape(active['account_name'])}» (№{active['account_number']}).\n\n"
        f"Остаток на счёте ({money(active['balance'])}) будет переведён на выбранный "
        "ниже счёт. Выберите, куда перевести остаток:"
    )
    await callback.message.edit_text(text, reply_markup=ikb.delete_account_target_kb(others))
    await callback.answer()


@router.callback_query(F.data == "delete_cancel")
async def delete_account_cancel(callback: CallbackQuery, db: Database) -> None:
    await edit_main_menu(callback, db)
    await callback.answer()


@router.callback_query(F.data.startswith("delete_confirm:"))
async def delete_account_confirm(callback: CallbackQuery, db: Database) -> None:
    target_id = int(callback.data.split(":", 1)[1])
    user = await db.get_user(callback.from_user.id)
    active_id = user["active_account_id"]

    accounts = await db.get_accounts(callback.from_user.id)
    active = next((a for a in accounts if a["account_id"] == active_id), accounts[0])
    target = next((a for a in accounts if a["account_id"] == target_id), None)
    if target is None:
        await callback.answer("Счёт получателя остатка не найден.", show_alert=True)
        return

    try:
        await db.delete_account_and_move_funds(active["account_id"], target_id)
    except LastAccountDeletionError as e:
        await callback.answer(str(e), show_alert=True)
        return

    await edit_main_menu(callback, db)
    await callback.answer(
        f"Счёт «{active['account_name']}» удалён. Остаток переведён на «{target['account_name']}».",
        show_alert=True,
    )
