from __future__ import annotations

import logging
from decimal import Decimal

from aiogram import F, Router
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

import config
from database.db import AccountNotFoundError, Database, InsufficientFundsError
from handlers.common import cancel_flow, finish_flow, is_cancel_text, match_reply_account
from keyboards import inline as ikb
from keyboards import reply as rkb
from states.states import WithdrawStates
from utils.formatting import escape, money
from utils.validators import ValidationError, parse_amount

logger = logging.getLogger(__name__)
router = Router(name="withdraw")


@router.message(StateFilter(None), F.text == rkb.BTN_WITHDRAW)
async def withdraw_entry(message: Message, db: Database, state: FSMContext) -> None:
    accounts = await db.get_accounts(message.from_user.id)
    await state.set_state(WithdrawStates.choosing_account)
    await message.answer(
        "🏧 <b>Снятие средств</b>\n\nВыберите счёт, с которого хотите снять средства:",
        reply_markup=rkb.accounts_choice_kb(accounts),
    )


@router.message(StateFilter(WithdrawStates.choosing_account), F.text)
async def withdraw_choose_account(message: Message, db: Database, state: FSMContext) -> None:
    if is_cancel_text(message.text):
        await cancel_flow(message, db, state)
        return

    account = await match_reply_account(message.text, message.from_user.id, db)
    if account is None:
        await message.answer("Пожалуйста, выберите счёт с помощью кнопок ниже.")
        return

    await state.update_data(
        account_id=account["account_id"],
        account_number=account["account_number"],
        account_name=account["account_name"],
    )
    await state.set_state(WithdrawStates.entering_amount)
    await message.answer("Введите сумму снятия:", reply_markup=rkb.cancel_kb())


@router.message(StateFilter(WithdrawStates.entering_amount), F.text)
async def withdraw_enter_amount(message: Message, db: Database, state: FSMContext) -> None:
    if is_cancel_text(message.text):
        await cancel_flow(message, db, state)
        return

    try:
        amount = parse_amount(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    data = await state.get_data()
    account = await db.get_account(data["account_id"])
    if account is None:
        await cancel_flow(message, db, state, "Счёт больше не существует.")
        return
    if account["balance"] < amount:
        await message.answer(
            f"Недостаточно средств. Баланс счёта: {money(account['balance'])}. Введите другую сумму:"
        )
        return

    await state.update_data(amount=str(amount))
    await state.set_state(WithdrawStates.confirming)
    text = (
        "Подтвердите снятие средств:\n\n"
        f"Счёт: «{escape(data['account_name'])}» (№{data['account_number']})\n"
        f"Сумма: <b>{money(amount)}</b>"
    )
    await message.answer(
        text,
        reply_markup=ikb.confirm_cancel_kb(confirm_data="withdraw_confirm", cancel_data="withdraw_cancel"),
    )


@router.callback_query(StateFilter(WithdrawStates.confirming), F.data == "withdraw_confirm")
async def withdraw_confirm(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    data = await state.get_data()
    amount = Decimal(data["amount"])
    await state.clear()

    user = await db.get_user(callback.from_user.id)

    try:
        await db.debit_account(data["account_id"], amount, "withdraw", "Снятие средств")
    except InsufficientFundsError as e:
        await finish_flow(callback, db, f"❌ {e}")
        await callback.answer()
        return
    except AccountNotFoundError as e:
        await finish_flow(callback, db, f"❌ {e}")
        await callback.answer()
        return

    request = await db.create_withdraw_request(
        callback.from_user.id,
        data["account_id"],
        data["account_number"],
        user["nickname"],
        user["region"],
        amount,
    )

    await finish_flow(
        callback,
        db,
        f"✅ Заявка на снятие {money(amount)} принята.\n\n"
        "Ожидайте уведомления в течение суток — после одобрения средства можно "
        "будет забрать в банке вашего региона.",
    )
    await callback.answer()

    try:
        await callback.bot.send_message(
            config.ADMIN_ID,
            "🏧 <b>Новая заявка на снятие средств</b>\n\n"
            f"ID заявки: <code>{request['request_id']}</code>\n"
            f"Никнейм: {escape(user['nickname'])}\n"
            f"Регион: {escape(user['region'])}\n"
            f"Сумма: {money(amount)}",
            reply_markup=ikb.admin_withdraw_approve_kb(request["request_id"]),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Не удалось уведомить админа о заявке на снятие: %s", exc)


@router.callback_query(StateFilter(WithdrawStates.confirming), F.data == "withdraw_cancel")
async def withdraw_cancel(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    await finish_flow(callback, db, "Снятие средств отменено.")
    await callback.answer()


# --------------------------------------------------------------------------- #
#  Одобрение заявки администратором (используется и кнопкой из уведомления,
#  и списком заявок в админ-панели)
# --------------------------------------------------------------------------- #
async def approve_withdraw_and_notify(bot, db: Database, request_id: int) -> str:
    """Возвращает текстовое сообщение о результате (для показа админу)."""
    request = await db.approve_withdraw_request(request_id)
    if request is None:
        return "Заявка не найдена или уже обработана."

    try:
        await bot.send_message(
            request["user_id"],
            f"✅ Ваша заявка на снятие {money(request['amount'])} одобрена!\n"
            f"Средства можно забрать в банке региона «{escape(request['region'])}».",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Не удалось уведомить пользователя об одобрении снятия: %s", exc)

    return f"✅ Заявка №{request_id} одобрена ({money(request['amount'])}, {escape(request['nickname'])})."


@router.callback_query(F.data.startswith("withdraw_approve:"))
async def withdraw_approve_button(callback: CallbackQuery, db: Database) -> None:
    if callback.from_user.id != config.ADMIN_ID:
        await callback.answer("Недостаточно прав.", show_alert=True)
        return

    request_id = int(callback.data.split(":", 1)[1])
    result_text = await approve_withdraw_and_notify(callback.bot, db, request_id)
    await callback.message.edit_text(result_text)
    await callback.answer()
