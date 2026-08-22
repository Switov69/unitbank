from __future__ import annotations

import logging
from decimal import Decimal

from aiogram import F, Router
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

import config
from database.db import AccountNotFoundError, Database
from handlers.withdraw import approve_withdraw_and_notify
from keyboards import inline as ikb
from states.states import AdminCreditStates, AdminWithdrawStates
from utils.formatting import escape, money
from utils.validators import ValidationError, parse_amount

logger = logging.getLogger(__name__)
router = Router(name="admin")

# Все обработчики в этом роутере доступны только администратору бота.
router.message.filter(F.from_user.id == config.ADMIN_ID)
router.callback_query.filter(F.from_user.id == config.ADMIN_ID)


@router.message(Command("adm"))
async def admin_panel(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("🛠 <b>Админ-панель UnitBank</b>", reply_markup=ikb.admin_panel_kb())


@router.callback_query(F.data == "admin_back")
async def admin_back(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("🛠 <b>Админ-панель UnitBank</b>", reply_markup=ikb.admin_panel_kb())
    await callback.answer()


# --------------------------------------------------------------------------- #
#  Заявки на снятие средств
# --------------------------------------------------------------------------- #
async def _render_withdraw_list_text(db: Database) -> str:
    requests = await db.get_pending_withdraw_requests()
    if not requests:
        return "📋 Заявок на снятие средств нет."

    lines = ["📋 <b>Заявки на снятие средств:</b>\n"]
    for r in requests:
        lines.append(
            f"№{r['request_id']} — {escape(r['nickname'])} ({escape(r['region'])}) — {money(r['amount'])}"
        )
    lines.append("\nЧтобы одобрить заявку, отправьте её номер (ID) сообщением.")
    return "\n".join(lines)


@router.callback_query(F.data == "admin_withdraw_list")
async def admin_withdraw_list(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.set_state(AdminWithdrawStates.entering_id)
    await state.update_data(list_chat_id=callback.message.chat.id, list_message_id=callback.message.message_id)
    text = await _render_withdraw_list_text(db)
    await callback.message.edit_text(text, reply_markup=ikb.admin_back_kb())
    await callback.answer()


@router.message(StateFilter(AdminWithdrawStates.entering_id), F.text)
async def admin_withdraw_approve_by_id(message: Message, db: Database, state: FSMContext) -> None:
    text = message.text.strip()
    if not text.isdigit():
        await message.answer("Введите числовой ID заявки.")
        return

    request_id = int(text)
    result_text = await approve_withdraw_and_notify(message.bot, db, request_id)
    await message.answer(result_text)

    data = await state.get_data()
    list_chat_id = data.get("list_chat_id")
    list_message_id = data.get("list_message_id")
    if list_chat_id and list_message_id:
        refreshed = await _render_withdraw_list_text(db)
        try:
            await message.bot.edit_message_text(
                refreshed,
                chat_id=list_chat_id,
                message_id=list_message_id,
                reply_markup=ikb.admin_back_kb(),
            )
        except Exception:  # noqa: BLE001 - сообщение могло не измениться, это не ошибка
            pass


# --------------------------------------------------------------------------- #
#  Начисление средств
# --------------------------------------------------------------------------- #
async def _render_users_list_text(db: Database) -> str:
    rows = await db.list_users_with_accounts()
    if not rows:
        return "Пользователей пока нет."

    lines = ["👥 <b>Пользователи UnitBank:</b>\n"]
    current_user = None
    for row in rows:
        if row["user_id"] != current_user:
            current_user = row["user_id"]
            lines.append(f"\n<b>{escape(row['nickname'])}</b> ({escape(row['region'])})")
        lines.append(f"  • «{escape(row['account_name'])}» №{row['account_number']} — {money(row['balance'])}")
    return "\n".join(lines)


@router.callback_query(F.data == "admin_credit_start")
async def admin_credit_list(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    text = await _render_users_list_text(db)
    await callback.message.edit_text(text, reply_markup=ikb.admin_users_accounts_kb())
    await callback.answer()


@router.callback_query(F.data == "admin_credit_begin")
async def admin_credit_begin(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(AdminCreditStates.nickname)
    await callback.message.edit_text(
        "Введите никнейм пользователя, которому нужно начислить средства:",
        reply_markup=ikb.admin_back_kb(),
    )
    await callback.answer()


@router.message(StateFilter(AdminCreditStates.nickname), F.text)
async def admin_credit_nickname(message: Message, db: Database, state: FSMContext) -> None:
    nickname = message.text.strip()
    target = await db.find_user_by_nickname(nickname)
    if target is None:
        await message.answer("Пользователь с таким никнеймом не найден. Попробуйте снова:")
        return

    accounts = await db.get_accounts(target["user_id"])
    await state.update_data(target_user_id=target["user_id"], target_nickname=target["nickname"])
    await state.set_state(AdminCreditStates.choosing_account)
    await message.answer(
        f"Выберите счёт пользователя «{escape(target['nickname'])}»:",
        reply_markup=ikb.admin_credit_account_kb(accounts),
    )


@router.callback_query(StateFilter(AdminCreditStates.choosing_account), F.data.startswith("admin_credit_acc:"))
async def admin_credit_choose_account(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    account_id = int(callback.data.split(":", 1)[1])
    data = await state.get_data()

    account = await db.get_account(account_id)
    if account is None or account["user_id"] != data.get("target_user_id"):
        await callback.answer("Счёт не найден.", show_alert=True)
        return

    await state.update_data(
        target_account_id=account["account_id"],
        target_account_number=account["account_number"],
        target_account_name=account["account_name"],
    )
    await state.set_state(AdminCreditStates.amount)
    await callback.message.edit_text("Введите сумму для начисления:")
    await callback.answer()


@router.message(StateFilter(AdminCreditStates.amount), F.text)
async def admin_credit_amount(message: Message, state: FSMContext) -> None:
    try:
        amount = parse_amount(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    data = await state.get_data()
    await state.update_data(amount=str(amount))
    await state.set_state(AdminCreditStates.confirming)

    text = (
        "Подтвердите начисление средств:\n\n"
        f"Пользователь: {escape(data['target_nickname'])}\n"
        f"Счёт: «{escape(data['target_account_name'])}» (№{data['target_account_number']})\n"
        f"Сумма: <b>{money(amount)}</b>"
    )
    await message.answer(
        text,
        reply_markup=ikb.confirm_cancel_kb(confirm_data="admin_credit_confirm", cancel_data="admin_credit_cancel"),
    )


@router.callback_query(StateFilter(AdminCreditStates.confirming), F.data == "admin_credit_confirm")
async def admin_credit_confirm(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    data = await state.get_data()
    amount = Decimal(data["amount"])
    await state.clear()

    try:
        await db.credit_account(data["target_account_id"], amount, "admin_credit", "Администратор")
    except AccountNotFoundError as e:
        await callback.message.edit_text(f"❌ {e}")
        await callback.answer()
        return

    await callback.message.edit_text(
        f"✅ Начислено {money(amount)} пользователю {escape(data['target_nickname'])}."
    )
    await callback.answer()

    try:
        await callback.bot.send_message(
            data["target_user_id"],
            "➕ Администратор начислил средства на ваш счёт!\n\n"
            f"Счёт: «{escape(data['target_account_name'])}» (№{data['target_account_number']})\n"
            f"Сумма: {money(amount)}",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Не удалось уведомить пользователя о начислении: %s", exc)


@router.callback_query(StateFilter(AdminCreditStates.confirming), F.data == "admin_credit_cancel")
async def admin_credit_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("Начисление отменено.", reply_markup=ikb.admin_panel_kb())
    await callback.answer()
