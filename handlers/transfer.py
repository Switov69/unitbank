from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from database.db import (
    AccountNotFoundError,
    AmbiguousAccountError,
    BankError,
    Database,
    InsufficientFundsError,
)
from handlers.common import cancel_flow, is_cancel_text, match_reply_account
from handlers.main_menu import send_main_menu
from keyboards import inline as ikb
from keyboards import reply as rkb
from states.states import LinkCreateStates, LinkPayStates, TransferStates
from utils.formatting import escape, money
from utils.generators import generate_link_token
from utils.validators import ValidationError, parse_amount

logger = logging.getLogger(__name__)
router = Router(name="transfer")


# --------------------------------------------------------------------------- #
#  Точка входа: кнопка "Перевести средства"
# --------------------------------------------------------------------------- #
@router.message(StateFilter(None), F.text == rkb.BTN_TRANSFER)
async def transfer_entry(message: Message) -> None:
    await message.answer(
        "Выберите действие:", reply_markup=ikb.transfer_type_kb()
    )


@router.callback_query(F.data == "transfer_type:send")
async def transfer_send_start(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    accounts = await db.get_accounts(callback.from_user.id)
    await state.set_state(TransferStates.choosing_account)
    await callback.message.edit_text("💸 <b>Перевод средств</b>\n\nВыберите счёт, с которого хотите перевести:")
    await callback.message.answer(
        "Выберите счёт на клавиатуре ниже 👇", reply_markup=rkb.accounts_choice_kb(accounts)
    )
    await callback.answer()


@router.message(StateFilter(TransferStates.choosing_account), F.text)
async def transfer_choose_account(message: Message, db: Database, state: FSMContext) -> None:
    if is_cancel_text(message.text):
        await cancel_flow(message, db, state)
        return

    account = await match_reply_account(message.text, message.from_user.id, db)
    if account is None:
        await message.answer("Пожалуйста, выберите счёт с помощью кнопок ниже.")
        return

    await state.update_data(
        from_account_id=account["account_id"],
        from_account_number=account["account_number"],
        from_account_name=account["account_name"],
    )
    await state.set_state(TransferStates.entering_recipient)
    await message.answer(
        "Введите номер (4 цифры) или название счёта получателя:",
        reply_markup=rkb.cancel_kb(),
    )


@router.message(StateFilter(TransferStates.entering_recipient), F.text)
async def transfer_enter_recipient(message: Message, db: Database, state: FSMContext) -> None:
    if is_cancel_text(message.text):
        await cancel_flow(message, db, state)
        return

    data = await state.get_data()
    try:
        recipient = await db.resolve_account_by_identifier(message.text)
    except (AccountNotFoundError, AmbiguousAccountError) as e:
        await message.answer(str(e))
        return

    if recipient["account_id"] == data["from_account_id"]:
        await message.answer("Нельзя перевести средства на тот же счёт. Укажите другой счёт получателя:")
        return

    await state.update_data(
        to_account_id=recipient["account_id"],
        to_account_number=recipient["account_number"],
        to_account_name=recipient["account_name"],
        to_user_id=recipient["user_id"],
    )
    await state.set_state(TransferStates.entering_amount)
    await message.answer("Введите сумму перевода:", reply_markup=rkb.cancel_kb())


@router.message(StateFilter(TransferStates.entering_amount), F.text)
async def transfer_enter_amount(message: Message, db: Database, state: FSMContext) -> None:
    if is_cancel_text(message.text):
        await cancel_flow(message, db, state)
        return

    try:
        amount = parse_amount(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    data = await state.get_data()
    from_account = await db.get_account(data["from_account_id"])
    if from_account is None:
        await cancel_flow(message, db, state, "Счёт списания больше не существует.")
        return
    if from_account["balance"] < amount:
        await message.answer(
            f"Недостаточно средств. Баланс счёта: {money(from_account['balance'])}. Введите другую сумму:"
        )
        return

    await state.update_data(amount=str(amount))
    await state.set_state(TransferStates.confirming)
    text = (
        "Подтвердите перевод:\n\n"
        f"Со счёта: «{escape(data['from_account_name'])}» (№{data['from_account_number']})\n"
        f"Получателю: «{escape(data['to_account_name'])}» (№{data['to_account_number']})\n"
        f"Сумма: <b>{money(amount)}</b>"
    )
    await message.answer(
        text,
        reply_markup=ikb.confirm_cancel_kb(confirm_data="transfer_confirm", cancel_data="transfer_cancel"),
    )


@router.callback_query(StateFilter(TransferStates.confirming), F.data == "transfer_confirm")
async def transfer_confirm(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    from decimal import Decimal

    data = await state.get_data()
    amount = Decimal(data["amount"])
    await state.clear()

    try:
        await db.transfer_funds(data["from_account_id"], data["to_account_id"], amount)
    except InsufficientFundsError as e:
        await callback.message.edit_text(f"❌ {e}")
        await send_main_menu(callback.message, db, user_id=callback.from_user.id)
        await callback.answer()
        return
    except (AccountNotFoundError, BankError) as e:
        await callback.message.edit_text(f"❌ {e}")
        await send_main_menu(callback.message, db, user_id=callback.from_user.id)
        await callback.answer()
        return

    await callback.message.edit_text(
        f"✅ Перевод на сумму {money(amount)} выполнен успешно."
    )

    # Уведомляем получателя, если это другой пользователь
    to_user_id = data.get("to_user_id")
    if to_user_id and to_user_id != callback.from_user.id:
        try:
            await callback.bot.send_message(
                to_user_id,
                "💰 Вам поступил перевод!\n\n"
                f"На счёт «{escape(data['to_account_name'])}» (№{data['to_account_number']}) "
                f"зачислено {money(amount)}.",
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Не удалось уведомить получателя %s: %s", to_user_id, exc)

    await send_main_menu(callback.message, db, user_id=callback.from_user.id)
    await callback.answer()


@router.callback_query(StateFilter(TransferStates.confirming), F.data == "transfer_cancel")
async def transfer_cancel(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("Перевод отменён.")
    await send_main_menu(callback.message, db, user_id=callback.from_user.id)
    await callback.answer()


# --------------------------------------------------------------------------- #
#  Создание ссылки на получение средств
# --------------------------------------------------------------------------- #
@router.callback_query(F.data == "transfer_type:link")
async def link_create_start(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    accounts = await db.get_accounts(callback.from_user.id)
    await state.set_state(LinkCreateStates.choosing_account)
    await callback.message.edit_text(
        "🔗 <b>Создание ссылки на получение средств</b>\n\nВыберите счёт, на который поступят средства:"
    )
    await callback.message.answer(
        "Выберите счёт на клавиатуре ниже 👇", reply_markup=rkb.accounts_choice_kb(accounts)
    )
    await callback.answer()


@router.message(StateFilter(LinkCreateStates.choosing_account), F.text)
async def link_create_choose_account(message: Message, db: Database, state: FSMContext) -> None:
    if is_cancel_text(message.text):
        await cancel_flow(message, db, state)
        return

    account = await match_reply_account(message.text, message.from_user.id, db)
    if account is None:
        await message.answer("Пожалуйста, выберите счёт с помощью кнопок ниже.")
        return

    await state.update_data(
        link_account_id=account["account_id"],
        link_account_number=account["account_number"],
        link_account_name=account["account_name"],
    )
    await state.set_state(LinkCreateStates.entering_amount)
    await message.answer("Введите сумму, которую хотите получить:", reply_markup=rkb.cancel_kb())


@router.message(StateFilter(LinkCreateStates.entering_amount), F.text)
async def link_create_enter_amount(message: Message, db: Database, state: FSMContext) -> None:
    if is_cancel_text(message.text):
        await cancel_flow(message, db, state)
        return

    try:
        amount = parse_amount(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    data = await state.get_data()
    await state.update_data(link_amount=str(amount))
    await state.set_state(LinkCreateStates.confirming)
    text = (
        "Подтвердите создание ссылки:\n\n"
        f"Счёт зачисления: «{escape(data['link_account_name'])}» (№{data['link_account_number']})\n"
        f"Сумма к получению: <b>{money(amount)}</b>\n\n"
        "⏳ Ссылка будет действительна 14 дней."
    )
    await message.answer(
        text,
        reply_markup=ikb.confirm_cancel_kb(confirm_data="link_create_confirm", cancel_data="link_create_cancel"),
    )


@router.callback_query(StateFilter(LinkCreateStates.confirming), F.data == "link_create_confirm")
async def link_create_confirm(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    from decimal import Decimal

    data = await state.get_data()
    amount = Decimal(data["link_amount"])
    await state.clear()

    token = generate_link_token()
    await db.create_payment_link(token, data["link_account_id"], callback.from_user.id, amount)

    me = await callback.bot.get_me()
    link_url = f"https://t.me/{me.username}?start=pay_{token}"

    await callback.message.edit_text(
        "✅ Ссылка создана!\n\n"
        f"Сумма к получению: <b>{money(amount)}</b>\n"
        f"Счёт зачисления: «{escape(data['link_account_name'])}» (№{data['link_account_number']})\n"
        "⏳ Действительна 14 дней.\n\n"
        f"Отправьте эту ссылку тому, от кого хотите получить средства:\n{link_url}"
    )
    await send_main_menu(callback.message, db, user_id=callback.from_user.id)
    await callback.answer()


@router.callback_query(StateFilter(LinkCreateStates.confirming), F.data == "link_create_cancel")
async def link_create_cancel(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("Создание ссылки отменено.")
    await send_main_menu(callback.message, db, user_id=callback.from_user.id)
    await callback.answer()


# --------------------------------------------------------------------------- #
#  Оплата по ссылке
# --------------------------------------------------------------------------- #
async def start_payment_link_flow(message: Message, db: Database, state: FSMContext, token: str) -> None:
    link = await db.get_payment_link(token)
    if link is None:
        await message.answer("⚠️ Эта ссылка недействительна.")
        await send_main_menu(message, db)
        return

    from datetime import datetime, timezone

    if link["expires_at"] < datetime.now(timezone.utc):
        await message.answer("⚠️ Срок действия этой ссылки истёк.")
        await send_main_menu(message, db)
        return

    creator = await db.get_user(link["creator_user_id"])
    creator_name = creator["nickname"] if creator else "неизвестный пользователь"

    await state.set_state(LinkPayStates.confirming)
    await state.update_data(link_token=token)
    await message.answer(
        f"По этой ссылке вы отправите <b>{money(link['amount'])}</b> пользователю "
        f"<b>{escape(creator_name)}</b>.\n\nПодтвердить перевод?",
        reply_markup=ikb.link_payment_kb(),
    )


@router.callback_query(StateFilter(LinkPayStates.confirming), F.data == "link_pay_confirm")
async def link_pay_confirm(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(LinkPayStates.entering_account_number)
    await callback.message.edit_text(
        "Введите <b>номер</b> вашего счёта (4 цифры), с которого хотите отправить средства:"
    )
    await callback.answer()


@router.callback_query(StateFilter(LinkPayStates.confirming), F.data == "link_pay_cancel")
async def link_pay_cancel(callback: CallbackQuery, db: Database, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("Оплата по ссылке отменена.")
    await send_main_menu(callback.message, db, user_id=callback.from_user.id)
    await callback.answer()


@router.message(StateFilter(LinkPayStates.entering_account_number), F.text)
async def link_pay_enter_account(message: Message, db: Database, state: FSMContext) -> None:
    text = message.text.strip()
    if not (text.isdigit() and len(text) == 4):
        await message.answer("Введите номер счёта в виде 4 цифр, например: 1234")
        return

    data = await state.get_data()
    token = data.get("link_token")
    link = await db.get_payment_link(token)
    if link is None:
        await state.clear()
        await message.answer("⚠️ Эта ссылка больше недействительна.")
        await send_main_menu(message, db)
        return

    from datetime import datetime, timezone

    if link["expires_at"] < datetime.now(timezone.utc):
        await state.clear()
        await message.answer("⚠️ Срок действия этой ссылки истёк.")
        await send_main_menu(message, db)
        return

    account = await db.get_account_by_number(text)
    if account is None or account["user_id"] != message.from_user.id:
        await message.answer("Это не ваш счёт. Проверьте номер и попробуйте снова:")
        return

    try:
        await db.transfer_funds(account["account_id"], link["account_id"], link["amount"])
    except InsufficientFundsError as e:
        await message.answer(f"❌ {e} Введите номер другого своего счёта:")
        return
    except (AccountNotFoundError, BankError) as e:
        await state.clear()
        await message.answer(f"❌ {e}")
        await send_main_menu(message, db)
        return

    await state.clear()
    await message.answer(f"✅ Перевод на сумму {money(link['amount'])} выполнен.")

    if link["creator_user_id"] != message.from_user.id:
        try:
            payer = await db.get_user(message.from_user.id)
            payer_name = payer["nickname"] if payer else "пользователь"
            await message.bot.send_message(
                link["creator_user_id"],
                "💰 По вашей ссылке на получение средств поступил перевод!\n\n"
                f"От: {escape(payer_name)}\nСумма: {money(link['amount'])}",
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Не удалось уведомить создателя ссылки: %s", exc)

    await send_main_menu(message, db)

