"""Хелперы форматирования текста для сообщений бота."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from html import escape as h

import config


def money(amount: Decimal) -> str:
    """Форматирует сумму как '1 234 𝐀𝐩' — без копеек."""
    quantized = Decimal(amount).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    sign = "-" if quantized < 0 else ""
    quantized = abs(quantized)
    grouped = f"{int(quantized):,}".replace(",", " ")
    return f"{sign}{grouped} {config.CURRENCY}"


def escape(text: str) -> str:
    """Экранирует пользовательский текст перед вставкой в HTML-разметку."""
    return h(str(text), quote=False)


def account_line(name: str, number: str) -> str:
    return f"«{escape(name)}» (№{escape(number)})"


def tx_party_label(name: str | None, number: str | None) -> str:
    if number:
        return f"{escape(name or '—')} (№{escape(number)})"
    return escape(name or "Банк")


def format_transaction_lines(tx, viewer_account_id: int) -> list[str]:
    """
    Возвращает две строки для одной операции:
      • [дата] — +/-[сумма] 𝐀𝐩
      • [иконка] [детали операции]
    Знак зависит от того, был ли просматриваемый счёт отправителем (-) или
    получателем (+) в этой операции.
    """
    tx_type = tx["tx_type"]
    amount_str = money(tx["amount"])
    date_str = format_datetime(tx["created_at"])
    from_label = tx_party_label(tx["from_name"], tx["from_number"])
    to_label = tx_party_label(tx["to_name"], tx["to_number"])

    if tx_type == "withdraw":
        sign, detail = "-", "🏧 Снятие средств"
    elif tx_type == "deposit":
        sign, detail = "+", "💰 Пополнение счёта"
    elif tx_type == "admin_credit":
        sign, detail = "+", "➕ Начисление администратором"
    elif tx_type == "account_closure":
        sign, detail = "+", "🔄 Перевод при закрытии счёта"
    else:  # transfer
        is_sender = tx["from_account"] == viewer_account_id
        sign = "-" if is_sender else "+"
        detail = f"💸 {from_label} → {to_label}"

    return [f"• {date_str} — {sign}{amount_str}", f"  {detail}"]


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
