from aiogram.fsm.state import State, StatesGroup


class Registration(StatesGroup):
    nickname = State()
    region = State()
    account_name = State()


class AccountCreate(StatesGroup):
    name = State()


class AccountRename(StatesGroup):
    name = State()


class TransferStates(StatesGroup):
    choosing_account = State()
    entering_recipient = State()
    entering_amount = State()
    confirming = State()


class LinkCreateStates(StatesGroup):
    choosing_account = State()
    entering_amount = State()
    confirming = State()


class LinkPayStates(StatesGroup):
    confirming = State()
    entering_account_number = State()


class WithdrawStates(StatesGroup):
    choosing_account = State()
    entering_amount = State()
    confirming = State()


class DepositStates(StatesGroup):
    choosing_account = State()
    entering_amount = State()
    confirming = State()


class SettingsStates(StatesGroup):
    nickname = State()
    deleting_confirm = State()


class AdminCreditStates(StatesGroup):
    nickname = State()
    choosing_account = State()
    amount = State()
    confirming = State()


class AdminWithdrawStates(StatesGroup):
    entering_id = State()


class AdminRejectStates(StatesGroup):
    reason = State()
