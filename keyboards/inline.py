from aiogram.enums import ButtonStyle
from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

import config


# --------------------------------------------------------------------------- #
#  Регистрация
# --------------------------------------------------------------------------- #
def region_choice_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for region in config.REGIONS:
        kb.button(text=region, callback_data=f"reg:{region}")
    kb.adjust(1)
    return kb.as_markup()


# --------------------------------------------------------------------------- #
#  Главное меню / счета
# --------------------------------------------------------------------------- #
def main_menu_kb(accounts, active_account_id: int) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    if len(accounts) > 1:
        for acc in accounts:
            marker = "✅ " if acc["account_id"] == active_account_id else ""
            kb.button(
                text=f"{marker}{acc['account_name']} (№{acc['account_number']})",
                callback_data=f"switch:{acc['account_id']}",
            )
    if len(accounts) < config.MAX_ACCOUNTS_PER_USER:
        kb.button(text="➕ Новый счёт", callback_data="new_account")
    kb.button(text="⚙️ Настройки счёта", callback_data="acc_settings")
    kb.adjust(1)
    return kb.as_markup()


def account_settings_kb(can_delete: bool) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="✏️ Переименовать счёт", callback_data="rename_account")
    if can_delete:
        kb.button(text="🗑 Удалить счёт", callback_data="delete_account", style=ButtonStyle.DANGER)
    kb.button(text="🔙 Назад", callback_data="back_to_menu")
    kb.adjust(1)
    return kb.as_markup()


def delete_account_target_kb(other_accounts) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for acc in other_accounts:
        kb.button(
            text=f"{acc['account_name']} (№{acc['account_number']})",
            callback_data=f"delete_confirm:{acc['account_id']}",
        )
    kb.button(text="🔙 Отмена", callback_data="delete_cancel", style=ButtonStyle.DANGER)
    kb.adjust(1)
    return kb.as_markup()


# --------------------------------------------------------------------------- #
#  Универсальные подтверждения
# --------------------------------------------------------------------------- #
def confirm_cancel_kb(
    confirm_text: str = "✅ Подтвердить",
    cancel_text: str = "❌ Отменить",
    confirm_data: str = "confirm",
    cancel_data: str = "cancel",
) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=confirm_text, callback_data=confirm_data, style=ButtonStyle.SUCCESS)
    kb.button(text=cancel_text, callback_data=cancel_data, style=ButtonStyle.DANGER)
    kb.adjust(1)
    return kb.as_markup()


# --------------------------------------------------------------------------- #
#  Переводы
# --------------------------------------------------------------------------- #
def transfer_type_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="💸 Перевести", callback_data="transfer_type:send")
    kb.button(text="🔗 Создать ссылку", callback_data="transfer_type:link")
    kb.adjust(1)
    return kb.as_markup()


def link_payment_kb() -> InlineKeyboardMarkup:
    return confirm_cancel_kb(
        confirm_data="link_pay_confirm", cancel_data="link_pay_cancel"
    )


# --------------------------------------------------------------------------- #
#  Настройки пользователя
# --------------------------------------------------------------------------- #
def settings_menu_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="✏️ Изменить никнейм", callback_data="set_nickname")
    kb.button(text="🌍 Изменить регион", callback_data="set_region")
    kb.button(text="🗑 Удалить аккаунт", callback_data="set_delete_account", style=ButtonStyle.DANGER)
    kb.adjust(1)
    return kb.as_markup()


def settings_region_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for region in config.REGIONS:
        kb.button(text=region, callback_data=f"set_region_to:{region}")
    kb.adjust(1)
    return kb.as_markup()


def delete_account_confirm_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="🗑 Да, удалить аккаунт", callback_data="set_delete_confirm", style=ButtonStyle.DANGER)
    kb.button(text="🔙 Отмена", callback_data="set_delete_cancel")
    kb.adjust(1)
    return kb.as_markup()


# --------------------------------------------------------------------------- #
#  Админ-панель
# --------------------------------------------------------------------------- #
def admin_panel_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="📋 Заявки на снятие средств", callback_data="admin_withdraw_list")
    kb.button(text="💰 Начислить средства", callback_data="admin_credit_start")
    kb.adjust(1)
    return kb.as_markup()


def admin_withdraw_approve_kb(request_id: int) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="✅ Одобрить", callback_data=f"withdraw_approve:{request_id}", style=ButtonStyle.SUCCESS)
    kb.adjust(1)
    return kb.as_markup()


def admin_deposit_kb(request_id: int) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="✅ Пополнить", callback_data=f"deposit_approve:{request_id}", style=ButtonStyle.SUCCESS)
    kb.button(text="❌ Отменить", callback_data=f"deposit_reject:{request_id}", style=ButtonStyle.DANGER)
    kb.adjust(1)
    return kb.as_markup()


def admin_users_accounts_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="💰 Начислить", callback_data="admin_credit_begin")
    kb.button(text="🔙 Назад", callback_data="admin_back")
    kb.adjust(1)
    return kb.as_markup()


def admin_credit_account_kb(accounts) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for acc in accounts:
        kb.button(
            text=f"{acc['account_name']} (№{acc['account_number']})",
            callback_data=f"admin_credit_acc:{acc['account_id']}",
        )
    kb.button(text="❌ Отмена", callback_data="admin_back", style=ButtonStyle.DANGER)
    kb.adjust(1)
    return kb.as_markup()


def admin_back_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="🔙 Назад", callback_data="admin_back")
    kb.adjust(1)
    return kb.as_markup()
