"""Генераторы случайных значений."""
import secrets


def generate_link_token(length: int = 16) -> str:
    """Криптографически стойкий токен для ссылки на получение средств."""
    return secrets.token_urlsafe(length)
