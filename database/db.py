"""
Слой доступа к базе данных.

Все денежные операции выполняются внутри SQL-транзакций с блокировкой строк
(`SELECT ... FOR UPDATE`), чтобы исключить гонки (race condition) при
одновременных запросах — например, двух переводах с одного счёта одновременно,
которые в сумме превышают баланс. Порядок блокировки счетов всегда идёт по
возрастанию account_id, что исключает взаимные блокировки (deadlock).
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

import asyncpg

import config


# --------------------------------------------------------------------------- #
#  Исключения предметной области
# --------------------------------------------------------------------------- #
class BankError(Exception):
    """Базовая ошибка банковской логики (безопасно показывать текст юзеру)."""


class InsufficientFundsError(BankError):
    def __init__(self):
        super().__init__("Недостаточно средств на счёте.")


class AccountNotFoundError(BankError):
    def __init__(self):
        super().__init__("Счёт не найден.")


class AmbiguousAccountError(BankError):
    def __init__(self):
        super().__init__(
            "Найдено несколько счетов с таким названием. "
            "Уточните, указав номер счёта (4 цифры)."
        )


class AccountLimitReachedError(BankError):
    def __init__(self):
        super().__init__("Достигнут лимит счетов (максимум 4 на пользователя).")


class NicknameTakenError(BankError):
    def __init__(self):
        super().__init__("Этот никнейм уже занят.")


class LastAccountDeletionError(BankError):
    def __init__(self):
        super().__init__("Нельзя удалить единственный счёт.")


class CooldownError(BankError):
    def __init__(self, remaining: timedelta):
        self.remaining = remaining
        super().__init__("Слишком рано для повторного изменения.")


def _clean_dsn(dsn: str) -> tuple[str, str]:
    """
    Neon.tech обычно выдаёт строку вида
    postgresql://user:pass@host/db?sslmode=require&channel_binding=require
    asyncpg ожидает ssl-параметр отдельным аргументом, а не в query-строке,
    поэтому убираем sslmode/channel_binding из DSN и возвращаем нужный режим ssl.
    """
    parsed = urlparse(dsn)
    query = dict(parse_qsl(parsed.query))
    ssl_mode = query.pop("sslmode", "require")
    query.pop("channel_binding", None)
    new_query = urlencode(query)
    cleaned = urlunparse(parsed._replace(query=new_query))
    ssl_value = "require" if ssl_mode != "disable" else None
    return cleaned, ssl_value


@dataclass
class Database:
    pool: Optional[asyncpg.Pool] = None

    async def connect(self) -> None:
        dsn, ssl_mode = _clean_dsn(config.DATABASE_URL)
        self.pool = await asyncpg.create_pool(
            dsn=dsn,
            ssl=ssl_mode,
            min_size=1,
            max_size=10,
            command_timeout=30,
        )

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    async def create_tables(self) -> None:
        schema_path = Path(__file__).parent / "schema.sql"
        sql = schema_path.read_text(encoding="utf-8")
        async with self.pool.acquire() as conn:
            await conn.execute(sql)

    # ------------------------------------------------------------------ #
    #  Пользователи
    # ------------------------------------------------------------------ #
    async def get_user(self, user_id: int) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM users WHERE user_id = $1", user_id
            )

    async def find_user_by_nickname(self, nickname: str) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM users WHERE lower(nickname) = lower($1)", nickname
            )

    async def create_user_with_first_account(
        self, user_id: int, nickname: str, region: str, account_name: str
    ) -> asyncpg.Record:
        """Регистрация: создаёт пользователя и его первый счёт одной транзакцией."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                try:
                    await conn.execute(
                        """
                        INSERT INTO users (user_id, nickname, region)
                        VALUES ($1, $2, $3)
                        """,
                        user_id, nickname, region,
                    )
                except asyncpg.UniqueViolationError as exc:
                    if "nickname" in str(exc):
                        raise NicknameTakenError() from exc
                    raise
                account = await self._create_account_locked(conn, user_id, account_name)
                await conn.execute(
                    "UPDATE users SET active_account_id = $1 WHERE user_id = $2",
                    account["account_id"], user_id,
                )
                return account

    async def update_nickname(self, user_id: int, nickname: str) -> None:
        async with self.pool.acquire() as conn:
            try:
                await conn.execute(
                    """
                    UPDATE users
                    SET nickname = $1, last_nickname_change = now()
                    WHERE user_id = $2
                    """,
                    nickname, user_id,
                )
            except asyncpg.UniqueViolationError as exc:
                raise NicknameTakenError() from exc

    async def update_region(self, user_id: int, region: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE users
                SET region = $1, last_region_change = now()
                WHERE user_id = $2
                """,
                region, user_id,
            )

    async def delete_user(self, user_id: int) -> None:
        async with self.pool.acquire() as conn:
            # ON DELETE CASCADE в схеме удалит все счета пользователя автоматически
            await conn.execute("DELETE FROM users WHERE user_id = $1", user_id)

    async def set_active_account(self, user_id: int, account_id: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET active_account_id = $1 WHERE user_id = $2",
                account_id, user_id,
            )

    async def list_users_with_accounts(self, limit: int = 100) -> list[asyncpg.Record]:
        """Для админ-панели: список пользователей и их счетов."""
        async with self.pool.acquire() as conn:
            return await conn.fetch(
                """
                SELECT u.user_id, u.nickname, u.region,
                       a.account_id, a.account_number, a.account_name, a.balance
                FROM users u
                JOIN accounts a ON a.user_id = u.user_id
                ORDER BY u.nickname, a.created_at
                LIMIT $1
                """,
                limit,
            )

    # ------------------------------------------------------------------ #
    #  Счета
    # ------------------------------------------------------------------ #
    async def get_accounts(self, user_id: int) -> list[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetch(
                "SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at",
                user_id,
            )

    async def count_accounts(self, user_id: int) -> int:
        async with self.pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT count(*) FROM accounts WHERE user_id = $1", user_id
            )

    async def get_account(self, account_id: int) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM accounts WHERE account_id = $1", account_id
            )

    async def get_account_by_number(self, number: str) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM accounts WHERE account_number = $1", number
            )

    async def find_accounts_by_name(self, name: str) -> list[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetch(
                "SELECT * FROM accounts WHERE lower(account_name) = lower($1)",
                name,
            )

    async def resolve_account_by_identifier(self, identifier: str) -> asyncpg.Record:
        """
        Ищет счёт получателя по номеру (4 цифры) или по названию.
        Бросает AccountNotFoundError / AmbiguousAccountError при проблемах.
        """
        identifier = identifier.strip()
        if identifier.isdigit() and len(identifier) == config.ACCOUNT_NUMBER_LENGTH:
            account = await self.get_account_by_number(identifier.zfill(4))
            if account is None:
                raise AccountNotFoundError()
            return account

        matches = await self.find_accounts_by_name(identifier)
        if not matches:
            raise AccountNotFoundError()
        if len(matches) > 1:
            raise AmbiguousAccountError()
        return matches[0]

    async def _create_account_locked(
        self, conn: asyncpg.Connection, user_id: int, account_name: str
    ) -> asyncpg.Record:
        """Создаёт счёт с уникальным случайным номером. Вызывать внутри транзакции."""
        for _ in range(50):
            number = f"{random.randint(0, 10 ** config.ACCOUNT_NUMBER_LENGTH - 1):0{config.ACCOUNT_NUMBER_LENGTH}d}"
            try:
                return await conn.fetchrow(
                    """
                    INSERT INTO accounts (account_number, user_id, account_name, balance)
                    VALUES ($1, $2, $3, 0)
                    RETURNING *
                    """,
                    number, user_id, account_name,
                )
            except asyncpg.UniqueViolationError:
                continue
        raise RuntimeError("Не удалось сгенерировать уникальный номер счёта")

    async def create_account(self, user_id: int, account_name: str) -> asyncpg.Record:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # pg_advisory_xact_lock сериализует параллельные попытки создать
                # счёт одним и тем же пользователем (аггрегатные запросы нельзя
                # блокировать через FOR UPDATE напрямую).
                await conn.execute("SELECT pg_advisory_xact_lock($1)", user_id)
                count = await conn.fetchval(
                    "SELECT count(*) FROM accounts WHERE user_id = $1", user_id
                )
                if count >= config.MAX_ACCOUNTS_PER_USER:
                    raise AccountLimitReachedError()
                return await self._create_account_locked(conn, user_id, account_name)

    async def rename_account(self, account_id: int, new_name: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE accounts SET account_name = $1 WHERE account_id = $2",
                new_name, account_id,
            )

    async def delete_account_and_move_funds(
        self, account_id: int, target_account_id: int
    ) -> None:
        """Удаляет счёт, переводя остаток на другой счёт того же пользователя."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                lock_first, lock_second = sorted([account_id, target_account_id])
                await conn.execute(
                    "SELECT 1 FROM accounts WHERE account_id = $1 FOR UPDATE", lock_first
                )
                await conn.execute(
                    "SELECT 1 FROM accounts WHERE account_id = $1 FOR UPDATE", lock_second
                )

                source = await conn.fetchrow(
                    "SELECT * FROM accounts WHERE account_id = $1", account_id
                )
                target = await conn.fetchrow(
                    "SELECT * FROM accounts WHERE account_id = $1", target_account_id
                )
                if source is None or target is None:
                    raise AccountNotFoundError()
                if source["user_id"] != target["user_id"]:
                    raise BankError("Счета принадлежат разным пользователям.")

                remainder = source["balance"]
                if remainder > 0:
                    await conn.execute(
                        "UPDATE accounts SET balance = balance + $1 WHERE account_id = $2",
                        remainder, target_account_id,
                    )
                    await conn.execute(
                        """
                        INSERT INTO transactions
                            (from_account, to_account, from_number, from_name,
                             to_number, to_name, amount, tx_type)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, 'account_closure')
                        """,
                        None, target_account_id,
                        source["account_number"], source["account_name"],
                        target["account_number"], target["account_name"],
                        remainder,
                    )

                user_id = source["user_id"]
                await conn.execute(
                    "DELETE FROM accounts WHERE account_id = $1", account_id
                )
                # если удаляемый счёт был активным — переключаем пользователя на целевой
                await conn.execute(
                    """
                    UPDATE users SET active_account_id = $1
                    WHERE user_id = $2 AND active_account_id = $3
                    """,
                    target_account_id, user_id, account_id,
                )

    # ------------------------------------------------------------------ #
    #  Денежные операции
    # ------------------------------------------------------------------ #
    async def transfer_funds(
        self, from_account_id: int, to_account_id: int, amount: Decimal
    ) -> None:
        if from_account_id == to_account_id:
            raise BankError("Нельзя перевести средства на тот же счёт.")

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                first, second = sorted([from_account_id, to_account_id])
                await conn.execute(
                    "SELECT 1 FROM accounts WHERE account_id = $1 FOR UPDATE", first
                )
                await conn.execute(
                    "SELECT 1 FROM accounts WHERE account_id = $1 FOR UPDATE", second
                )

                sender = await conn.fetchrow(
                    "SELECT * FROM accounts WHERE account_id = $1", from_account_id
                )
                receiver = await conn.fetchrow(
                    "SELECT * FROM accounts WHERE account_id = $1", to_account_id
                )
                if sender is None or receiver is None:
                    raise AccountNotFoundError()
                if sender["balance"] < amount:
                    raise InsufficientFundsError()

                await conn.execute(
                    "UPDATE accounts SET balance = balance - $1 WHERE account_id = $2",
                    amount, from_account_id,
                )
                await conn.execute(
                    "UPDATE accounts SET balance = balance + $1 WHERE account_id = $2",
                    amount, to_account_id,
                )
                await conn.execute(
                    """
                    INSERT INTO transactions
                        (from_account, to_account, from_number, from_name,
                         to_number, to_name, amount, tx_type)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'transfer')
                    """,
                    from_account_id, to_account_id,
                    sender["account_number"], sender["account_name"],
                    receiver["account_number"], receiver["account_name"],
                    amount,
                )

    async def credit_account(
        self, account_id: int, amount: Decimal, tx_type: str, source_label: str
    ) -> None:
        """Начисление без списания с другого счёта (пополнение, начисление админом)."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                account = await conn.fetchrow(
                    "SELECT * FROM accounts WHERE account_id = $1 FOR UPDATE",
                    account_id,
                )
                if account is None:
                    raise AccountNotFoundError()
                await conn.execute(
                    "UPDATE accounts SET balance = balance + $1 WHERE account_id = $2",
                    amount, account_id,
                )
                await conn.execute(
                    """
                    INSERT INTO transactions
                        (from_account, to_account, from_number, from_name,
                         to_number, to_name, amount, tx_type)
                    VALUES (NULL, $1, NULL, $2, $3, $4, $5, $6)
                    """,
                    account_id, source_label,
                    account["account_number"], account["account_name"],
                    amount, tx_type,
                )

    async def debit_account(
        self, account_id: int, amount: Decimal, tx_type: str, target_label: str
    ) -> None:
        """Списание без зачисления на другой счёт (снятие средств)."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                account = await conn.fetchrow(
                    "SELECT * FROM accounts WHERE account_id = $1 FOR UPDATE",
                    account_id,
                )
                if account is None:
                    raise AccountNotFoundError()
                if account["balance"] < amount:
                    raise InsufficientFundsError()
                await conn.execute(
                    "UPDATE accounts SET balance = balance - $1 WHERE account_id = $2",
                    amount, account_id,
                )
                await conn.execute(
                    """
                    INSERT INTO transactions
                        (from_account, to_account, from_number, from_name,
                         to_number, to_name, amount, tx_type)
                    VALUES ($1, NULL, $2, $3, NULL, $4, $5, $6)
                    """,
                    account_id, account["account_number"], account["account_name"],
                    target_label, amount, tx_type,
                )

    async def get_last_transactions(
        self, account_id: int, limit: int = 5
    ) -> list[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetch(
                """
                SELECT * FROM transactions
                WHERE from_account = $1 OR to_account = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                account_id, limit,
            )

    # ------------------------------------------------------------------ #
    #  Ссылки на получение средств
    # ------------------------------------------------------------------ #
    async def create_payment_link(
        self, token: str, account_id: int, creator_user_id: int, amount: Decimal
    ) -> asyncpg.Record:
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=config.PAYMENT_LINK_LIFETIME_DAYS
        )
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                """
                INSERT INTO payment_links (token, account_id, creator_user_id, amount, expires_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                """,
                token, account_id, creator_user_id, amount, expires_at,
            )

    async def get_payment_link(self, token: str) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM payment_links WHERE token = $1", token
            )

    async def delete_expired_payment_links(self) -> int:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM payment_links WHERE expires_at < now()"
            )
            # result выглядит как "DELETE 3"
            try:
                return int(result.split()[-1])
            except (ValueError, IndexError):
                return 0

    # ------------------------------------------------------------------ #
    #  Заявки на снятие средств
    # ------------------------------------------------------------------ #
    async def create_withdraw_request(
        self,
        user_id: int,
        account_id: int,
        account_number: str,
        nickname: str,
        region: str,
        amount: Decimal,
    ) -> asyncpg.Record:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                """
                INSERT INTO withdraw_requests
                    (user_id, account_id, account_number, nickname, region, amount)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                """,
                user_id, account_id, account_number, nickname, region, amount,
            )

    async def get_withdraw_request(self, request_id: int) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM withdraw_requests WHERE request_id = $1", request_id
            )

    async def get_pending_withdraw_requests(self) -> list[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetch(
                """
                SELECT * FROM withdraw_requests
                WHERE status = 'pending'
                ORDER BY created_at
                """
            )

    async def approve_withdraw_request(self, request_id: int) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                request = await conn.fetchrow(
                    "SELECT * FROM withdraw_requests WHERE request_id = $1 FOR UPDATE",
                    request_id,
                )
                if request is None or request["status"] != "pending":
                    return None
                return await conn.fetchrow(
                    """
                    UPDATE withdraw_requests
                    SET status = 'approved', approved_at = now()
                    WHERE request_id = $1
                    RETURNING *
                    """,
                    request_id,
                )

    # ------------------------------------------------------------------ #
    #  Заявки на пополнение
    # ------------------------------------------------------------------ #
    async def create_deposit_request(
        self,
        user_id: int,
        account_id: int,
        account_number: str,
        nickname: str,
        amount: Decimal,
    ) -> asyncpg.Record:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                """
                INSERT INTO deposit_requests
                    (user_id, account_id, account_number, nickname, amount)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                """,
                user_id, account_id, account_number, nickname, amount,
            )

    async def get_deposit_request(self, request_id: int) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM deposit_requests WHERE request_id = $1", request_id
            )

    async def approve_deposit_request(self, request_id: int) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                request = await conn.fetchrow(
                    "SELECT * FROM deposit_requests WHERE request_id = $1 FOR UPDATE",
                    request_id,
                )
                if request is None or request["status"] != "pending":
                    return None
                if request["account_id"] is None:
                    return None

                account = await conn.fetchrow(
                    "SELECT * FROM accounts WHERE account_id = $1 FOR UPDATE",
                    request["account_id"],
                )
                if account is None:
                    return None

                await conn.execute(
                    "UPDATE accounts SET balance = balance + $1 WHERE account_id = $2",
                    request["amount"], request["account_id"],
                )
                await conn.execute(
                    """
                    INSERT INTO transactions
                        (from_account, to_account, from_number, from_name,
                         to_number, to_name, amount, tx_type)
                    VALUES (NULL, $1, NULL, 'Пополнение (банк)', $2, $3, $4, 'deposit')
                    """,
                    request["account_id"], account["account_number"],
                    account["account_name"], request["amount"],
                )
                return await conn.fetchrow(
                    """
                    UPDATE deposit_requests
                    SET status = 'approved', resolved_at = now()
                    WHERE request_id = $1
                    RETURNING *
                    """,
                    request_id,
                )

    async def reject_deposit_request(
        self, request_id: int, reason: str
    ) -> Optional[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                request = await conn.fetchrow(
                    "SELECT * FROM deposit_requests WHERE request_id = $1 FOR UPDATE",
                    request_id,
                )
                if request is None or request["status"] != "pending":
                    return None
                return await conn.fetchrow(
                    """
                    UPDATE deposit_requests
                    SET status = 'rejected', reject_reason = $1, resolved_at = now()
                    WHERE request_id = $2
                    RETURNING *
                    """,
                    reason, request_id,
                )


db = Database()
