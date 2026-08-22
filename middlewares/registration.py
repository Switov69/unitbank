"""
Middleware, который не даёт обойти регистрацию: пока пользователь не завёл
аккаунт в банке, ему доступны только /start и сам процесс регистрации
(FSM-состояния группы Registration), а также диплинк на оплату по ссылке
(он сам инициирует регистрацию при необходимости).
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, TelegramObject

import config
from database.db import db


class RegistrationRequiredMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any],
    ) -> Any:
        user = event.from_user
        if user is None or user.is_bot:
            return await handler(event, data)

        # /start и диплинки (/start pay_xxx) должны работать всегда — это точка
        # входа как для регистрации, так и для получения средств по ссылке.
        if isinstance(event, Message) and event.text and event.text.startswith("/start"):
            return await handler(event, data)

        # Администратору всегда доступны админ-панель (/adm) и все связанные с
        # ней действия (одобрение заявок, начисление средств и т.д.), даже
        # если у самого администратора нет личного счёта в банке.
        if user.id == config.ADMIN_ID:
            return await handler(event, data)

        state: FSMContext | None = data.get("state")
        if state is not None:
            current_state = await state.get_state()
            if current_state and current_state.startswith("Registration:"):
                return await handler(event, data)

        db_user = await db.get_user(user.id)
        if db_user is None:
            text = (
                "Вы ещё не зарегистрированы в UnitBank.\n"
                "Отправьте /start, чтобы открыть счёт."
            )
            if isinstance(event, CallbackQuery):
                await event.answer(text, show_alert=True)
            elif isinstance(event, Message):
                await event.answer(text)
            return None

        data["db_user"] = db_user
        return await handler(event, data)
