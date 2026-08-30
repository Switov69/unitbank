from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

import config
from database.db import AccountNameTakenError, Database, NicknameTakenError
from handlers.main_menu import send_main_menu
from keyboards import inline as ikb
from keyboards import reply as rkb
from states.states import Registration
from utils.formatting import escape
from utils.validators import ValidationError, validate_account_name, validate_nickname

router = Router(name="start")


@router.message(CommandStart())
async def cmd_start(
    message: Message, state: FSMContext, db: Database, command: CommandObject
) -> None:
    payload = (command.args or "").strip()
    user = await db.get_user(message.from_user.id)

    if user is None:
        await state.clear()
        if payload.startswith("pay_"):
            await state.update_data(pending_payment_token=payload[4:])
        await state.set_state(Registration.nickname)
        await message.answer(
            "Перед использованием бота, зарегистрируйтесь.\nВведите ваш никнейм:",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    await state.clear()

    if payload.startswith("pay_"):
        from handlers.transfer import start_payment_link_flow  # локальный импорт против циклической зависимости

        await start_payment_link_flow(message, db, state, payload[4:])
        return

    await send_main_menu(message, db)


@router.message(StateFilter(Registration.nickname), F.text)
async def reg_nickname(message: Message, state: FSMContext, db: Database) -> None:
    try:
        nickname = validate_nickname(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    existing = await db.find_user_by_nickname(nickname)
    if existing is not None:
        await message.answer(
            "Этот никнейм уже занят. Попробуйте другой:"
        )
        return

    await state.update_data(nickname=nickname)
    await state.set_state(Registration.region)
    await message.answer(
        "Отлично! Теперь выберите ваш регион:",
        reply_markup=ikb.region_choice_kb(),
    )


@router.callback_query(StateFilter(Registration.region), F.data.startswith("reg:"))
async def reg_region(callback: CallbackQuery, state: FSMContext) -> None:
    region = callback.data.split(":", 1)[1]
    if region not in config.REGIONS:
        await callback.answer("Некорректный регион.", show_alert=True)
        return

    await state.update_data(region=region)
    await state.set_state(Registration.account_name)
    await callback.message.edit_text(f"Регион выбран: <b>{escape(region)}</b>")
    await callback.message.answer("Придумайте название для вашего первого счёта:")
    await callback.answer()


@router.message(StateFilter(Registration.account_name), F.text)
async def reg_account_name(message: Message, state: FSMContext, db: Database) -> None:
    try:
        account_name = validate_account_name(message.text)
    except ValidationError as e:
        await message.answer(str(e))
        return

    data = await state.get_data()
    nickname = data["nickname"]
    region = data["region"]
    pending_token = data.get("pending_payment_token")

    # Финальная проверка уникальности никнейма (на случай гонки между шагами)
    if await db.find_user_by_nickname(nickname) is not None:
        await state.set_state(Registration.nickname)
        await message.answer(
            "Пока вы регистрировались, этот никнейм заняли. Введите другой никнейм:"
        )
        return

    if await db.is_account_name_taken(account_name):
        await message.answer(f"{AccountNameTakenError()}")
        return

    try:
        await db.create_user_with_first_account(
            message.from_user.id, nickname, region, account_name
        )
    except NicknameTakenError as e:
        await state.set_state(Registration.nickname)
        await message.answer(f"{e} Введите другой никнейм:")
        return
    except AccountNameTakenError as e:
        await message.answer(f"{e}")
        return
    await state.clear()

    await message.answer("✅ Регистрация завершена!", reply_markup=rkb.main_menu_kb())

    if pending_token:
        from handlers.transfer import start_payment_link_flow

        await start_payment_link_flow(message, db, state, pending_token)
        return

    await send_main_menu(message, db)
