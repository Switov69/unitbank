from aiogram.types import KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove

BTN_TRANSFER = "💸 Перевести средства"
BTN_WITHDRAW = "🏧 Снять средства"
BTN_DEPOSIT = "💰 Пополнить счёт"
BTN_SETTINGS = "⚙️ Настройки"
BTN_MY_ACCOUNTS = "🗂 Мои счета"
BTN_CANCEL = "❌ Отмена"


def main_menu_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=BTN_TRANSFER), KeyboardButton(text=BTN_WITHDRAW)],
            [KeyboardButton(text=BTN_DEPOSIT), KeyboardButton(text=BTN_SETTINGS)],
            [KeyboardButton(text=BTN_MY_ACCOUNTS)],
        ],
        resize_keyboard=True,
    )


def account_button_text(account) -> str:
    return f"{account['account_name']} (№{account['account_number']})"


def accounts_choice_kb(accounts) -> ReplyKeyboardMarkup:
    rows = [[KeyboardButton(text=account_button_text(a))] for a in accounts]
    rows.append([KeyboardButton(text=BTN_CANCEL)])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)


def remove_kb() -> ReplyKeyboardRemove:
    return ReplyKeyboardRemove()


def cancel_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=BTN_CANCEL)]], resize_keyboard=True
    )
