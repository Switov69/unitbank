"""Хелперы форматирования текста для сообщений бота."""
from __future__ import annotations

from decimal import Decimal
from html import escape as h

import config


def money(amount: Decimal) -> str:
    """Форматирует сумму как '1 234.56 Ары'."""
    quantized = Decimal(amount).quantize(Decimal("0.01"))
    sign = "-" if quantized < 0 else ""
    quantized = abs(quantized)
    integer_part, _, fraction_part = f"{quantized:.2f}".partition(".")
    grouped = f"{int(integer_part):,}".replace(",", " ")
    return f"{sign}{grouped}.{fraction_part} {config.CURRENCY}"


def escape(text: str) -> str:
    """Экранирует пользовательский текст перед вставкой в HTML-разметку."""
    return h(str(text), quote=False)


def account_line(name: str, number: str) -> str:
    return f"«{escape(name)}» (№{escape(number)})"


def tx_party_label(name: str | None, number: str | None) -> str:
    if number:
        return f"{escape(name or '—')} (№{escape(number)})"
    return escape(name or "Банк")


def format_transaction(tx) -> str:
    tx_type = tx["tx_type"]
    amount_str = money(tx["amount"])
    from_label = tx_party_label(tx["from_name"], tx["from_number"])
    to_label = tx_party_label(tx["to_name"], tx["to_number"])

    if tx_type == "withdraw":
        return f"↖️ Снятие со счёта: −{amount_str}"
    if tx_type == "deposit":
        return f"↘️ Пополнение счёта: +{amount_str}"
    if tx_type == "admin_credit":
        return f"➕ Начисление администратором: +{amount_str}"
    if tx_type == "account_closure":
        return f"🔄 Перевод при закрытии счёта: +{amount_str}"
    return f"💸 {from_label} → {to_label}: {amount_str}"


def format_datetime(dt) -> str:
    return dt.strftime("%d.%m.%Y %H:%M")


def format_remaining(delta) -> str:
    total_seconds = int(delta.total_seconds())
    if total_seconds <= 0:
        return "0 мин."
    days, rem = divmod(total_seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f"{days} д.")
    if hours:
        parts.append(f"{hours} ч.")
    if not days and minutes:
        parts.append(f"{minutes} мин.")
    return " ".join(parts) if parts else "меньше минуты"
