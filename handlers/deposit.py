from __future__ import annotations

import logging
from decimal import Decimal

from aiogram import F, Router
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

import config
from database.db import Database
from handlers.common import cancel_flow, is_cancel_text, match_reply_account
from handlers.main_menu import send_main_menu
from keyboards import inline as ikb
from keyboards import reply as rkb
from states.states import AdminRejectStates, DepositStates
from utils.formatting import escape, money
from utils.validators import ValidationError, parse_amount, validate_rejection_reason

logger = logging.getLogger(__name__)
router = Router(name="deposit")


@router.message(StateFilter(None), F.text == rkb.BTN_DEPOSIT)
async def deposit_entry(message: Message, db: Database, state: FSMContext) -> None:
    accounts = await db.get_accounts(message.from_user.id)
    await state.set_state(DepositStates.choosing_account)
    await message.answer(
        "💰 <b>Пополнение счёта</b>\n\nВыберите счёт, на который поступят средства:",
        reply_markup=rkb.accounts_choice_kb(accounts),
    )


@router.message(StateFilter(DepositStates.choosing_account), F.text)
async def deposit_choose_account(message: Message, db: Database, state: FSMContext) -> None:
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
    await state.set_state(DepositStates.entering_amount)
    await message.answer("Введите сумму пополнения:", reply_markup=rkb.cancel_kb())


@router.message(StateFilter(DepositStates.entering_amount), F.text)
async def deposit_enter_amount(message: Message, db: Database, state: FSMContext) -> None:
    if is_cancel_text(message.text):
        await cancel_flow(message, db, state)
        return

    try:
        amount = parse_amount(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    data = await state.get_data()
    await state.update_data(amount=str(amount))
    await state.set_state(DepositStates.confirming)

    user = await db.get_user(message.from_user.id)
    text = (
        "Подтвердите пополнение счёта:\n\n"
        f"Счёт: «{escape(data['account_name'])}» (№{data['account_number']})\n"
        f"Сумма: <b>{money(amount)}</b>\n\n"
        f"Принесите указанную сумму в банк региона «{escape(user['region'])}» и подтвердите "
        "пополнение ниже. После этого ожидайте уведомления о зачислении средств."
    )
    await message.answer(
        text,
        reply_markup=ikb.confirm_cancel_kb(confirm_data="deposit_confirm", cancel_data="deposit_cancel"),
    )


@router.callback_query(StateFilter(DepositStates.confirming), F.data == "deposit_confirm")
async def deposit_confirm(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    data = await state.get_data()
    amount = Decimal(data["amount"])
    await state.clear()

    user = await db.get_user(callback.from_user.id)
    request = await db.create_deposit_request(
        callback.from_user.id, data["account_id"], data["account_number"], user["nickname"], amount
    )

    await callback.message.edit_text(
        f"✅ Заявка на пополнение {money(amount)} создана.\n\n"
        "Ожидайте уведомления о зачислении средств на счёт после подтверждения банком."
    )
    await send_main_menu(callback.message, db, user_id=callback.from_user.id)
    await callback.answer()

    try:
        await callback.bot.send_message(
            config.ADMIN_ID,
            "💰 <b>Новая заявка на пополнение счёта</b>\n\n"
            f"ID заявки: <code>{request['request_id']}</code>\n"
            f"Никнейм: {escape(user['nickname'])}\n"
            f"Регион: {escape(user['region'])}\n"
            f"Счёт: «{escape(data['account_name'])}» (№{data['account_number']})\n"
            f"Сумма: {money(amount)}",
            reply_markup=ikb.admin_deposit_kb(request["request_id"]),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Не удалось уведомить админа о заявке на пополнение: %s", exc)


@router.callback_query(StateFilter(DepositStates.confirming), F.data == "deposit_cancel")
async def deposit_cancel(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("Пополнение отменено.")
    await send_main_menu(callback.message, db, user_id=callback.from_user.id)
    await callback.answer()


# --------------------------------------------------------------------------- #
#  Обработка администратором
# --------------------------------------------------------------------------- #
@router.callback_query(F.data.startswith("deposit_approve:"))
async def deposit_approve(callback: CallbackQuery, db: Database) -> None:
    if callback.from_user.id != config.ADMIN_ID:
        await callback.answer("Недостаточно прав.", show_alert=True)
        return

    request_id = int(callback.data.split(":", 1)[1])
    request = await db.approve_deposit_request(request_id)
    if request is None:
        await callback.message.edit_text("Заявка не найдена или уже обработана.")
        await callback.answer()
        return

    await callback.message.edit_text(
        f"✅ Заявка №{request_id} одобрена. Зачислено {money(request['amount'])} "
        f"пользователю {escape(request['nickname'])}."
    )
    try:
        await callback.bot.send_message(
            request["user_id"],
            f"✅ Ваше пополнение на {money(request['amount'])} зачислено на счёт.",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Не удалось уведомить пользователя о зачислении: %s", exc)
    await callback.answer()


@router.callback_query(F.data.startswith("deposit_reject:"))
async def deposit_reject_start(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    if callback.from_user.id != config.ADMIN_ID:
        await callback.answer("Недостаточно прав.", show_alert=True)
        return

    request_id = int(callback.data.split(":", 1)[1])
    request = await db.get_deposit_request(request_id)
    if request is None or request["status"] != "pending":
        await callback.answer("Заявка не найдена или уже обработана.", show_alert=True)
        return

    await state.set_state(AdminRejectStates.reason)
    await state.update_data(reject_request_id=request_id)
    await callback.message.edit_text(
        f"Укажите причину отказа по заявке №{request_id} (текстовым сообщением):"
    )
    await callback.answer()


@router.message(StateFilter(AdminRejectStates.reason), F.text)
async def deposit_reject_reason(message: Message, db: Database, state: FSMContext) -> None:
    if message.from_user.id != config.ADMIN_ID:
        return

    try:
        reason = validate_rejection_reason(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    data = await state.get_data()
    request_id = data["reject_request_id"]
    await state.clear()

    request = await db.reject_deposit_request(request_id, reason)
    if request is None:
        await message.answer("Заявка не найдена или уже обработана.")
        return

    await message.answer(f"❌ Заявка №{request_id} отклонена. Причина: {escape(reason)}")
    try:
        await message.bot.send_message(
            request["user_id"],
            f"❌ Ваша заявка на пополнение счёта отклонена.\nПричина: {escape(reason)}",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Не удалось уведомить пользователя об отказе: %s", exc)
