"""Валидация пользовательского ввода. Всё, что приходит от пользователя,
должно пройти через эти функции прежде, чем попадёт в БД или бизнес-логику."""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

import config


class ValidationError(Exception):
    """Ошибка валидации с текстом, который можно показать пользователю."""


def parse_amount(text: str) -> Decimal:
    text = text.strip().replace(",", ".").replace(" ", "")
    if not re.fullmatch(r"\d+(\.\d{1,2})?", text):
        raise ValidationError(
            "Введите сумму в виде числа, например: 100 или 150.50"
        )
    try:
        amount = Decimal(text)
    except InvalidOperation:
        raise ValidationError("Не удалось распознать сумму.")

    if amount < config.MIN_AMOUNT:
        raise ValidationError(f"Минимальная сумма операции — {config.MIN_AMOUNT}.")
    if amount > config.MAX_AMOUNT:
        raise ValidationError("Слишком большая сумма.")
    return amount.quantize(Decimal("0.01"))


def validate_nickname(text: str) -> str:
    text = text.strip()
    if not (2 <= len(text) <= 32):
        raise ValidationError("Никнейм должен содержать от 2 до 32 символов.")
    if not re.fullmatch(r"[\w\-\sА-Яа-яЁё]+", text, flags=re.UNICODE):
        raise ValidationError(
            "Никнейм может содержать только буквы, цифры, пробел, «-» и «_»."
        )
    return text


def validate_account_name(text: str) -> str:
    text = text.strip()
    if not (1 <= len(text) <= 32):
        raise ValidationError("Название счёта должно содержать от 1 до 32 символов.")
    if not re.fullmatch(r"[\w\-\sА-Яа-яЁё№.,!?]+", text, flags=re.UNICODE):
        raise ValidationError("Название счёта содержит недопустимые символы.")
    return text


def validate_rejection_reason(text: str) -> str:
    text = text.strip()
    if not (1 <= len(text) <= 300):
        raise ValidationError("Причина должна содержать от 1 до 300 символов.")
    return text
