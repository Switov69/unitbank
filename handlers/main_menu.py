"""Построение и отправка главного меню — переиспользуется всеми обработчиками."""
from __future__ import annotations

from aiogram.types import CallbackQuery, Message

from database.db import Database
from keyboards import inline as ikb
from keyboards import reply as rkb
from utils.formatting import escape, format_datetime, format_transaction, money


async def build_main_menu_content(db: Database, user_id: int):
    user = await db.get_user(user_id)
    accounts = await db.get_accounts(user_id)
    if not accounts:
        # Теоретически недостижимо (у зарегистрированного всегда есть счёт),
        # но на всякий случай не роняем бота.
        return "У вас пока нет счетов.", None

    active_id = user["active_account_id"]
    active_account = next((a for a in accounts if a["account_id"] == active_id), None)
    if active_account is None:
        active_account = accounts[0]
        await db.set_active_account(user_id, active_account["account_id"])

    last_tx = await db.get_last_transactions(active_account["account_id"], 5)

    lines = [
        "🏦 <b>UnitBank</b>",
        "",
        f"Счёт: «{escape(active_account['account_name'])}» (№{active_account['account_number']})",
        f"Баланс: <b>{money(active_account['balance'])}</b>",
        "",
        "<b>Последние операции:</b>",
    ]
    if last_tx:
        for tx in last_tx:
            lines.append(f"• {format_datetime(tx['created_at'])} — {format_transaction(tx)}")
    else:
        lines.append("— операций пока нет —")

    text = "\n".join(lines)
    kb = ikb.main_menu_kb(accounts, active_account["account_id"])
    return text, kb


async def send_main_menu(
    message: Message, db: Database, restore_reply_kb: bool = True, user_id: int | None = None
) -> None:
    """
    ВАЖНО: `message.from_user` — это отправитель сообщения. Если `message` — это
    `callback.message` (сообщение, отправленное самим ботом при обработке
    нажатия на инлайн-кнопку), то `message.from_user` будет ботом, а не
    человеком! В таких случаях обязательно передавайте `user_id=callback.from_user.id`.
    """
    uid = user_id if user_id is not None else message.from_user.id
    if restore_reply_kb:
        await message.answer("🏦 Главное меню UnitBank", reply_markup=rkb.main_menu_kb())
    text, kb = await build_main_menu_content(db, uid)
    await message.answer(text, reply_markup=kb)


async def edit_main_menu(callback: CallbackQuery, db: Database) -> None:
    text, kb = await build_main_menu_content(db, callback.from_user.id)
    await callback.message.edit_text(text, reply_markup=kb)


async def edit_main_menu_by_id(bot, chat_id: int, message_id: int, db: Database, user_id: int) -> None:
    text, kb = await build_main_menu_content(db, user_id)
    await bot.edit_message_text(text, chat_id=chat_id, message_id=message_id, reply_markup=kb)
