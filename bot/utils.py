# bot/utils.py
import asyncio
import logging
import os
import time
from functools import wraps
from typing import Any, Awaitable, Callable, Dict, Optional

from telegram import Bot, Update
from telegram.ext import ContextTypes

from bot.database import execute_query

logger = logging.getLogger(__name__)


# =============== Admin utilities ===============

def is_admin(user_id: int) -> bool:
    """Return True if the user_id is in admins table."""
    row = execute_query("SELECT 1 FROM admins WHERE admin_id = ?", (user_id,), fetch_one=True)
    return bool(row)


def is_main_admin(user_id: int) -> bool:
    """Return True if the user_id is marked as main admin."""
    row = execute_query("SELECT is_main FROM admins WHERE admin_id = ?", (user_id,), fetch_one=True)
    return bool(row and row[0] == 1)


def require_admin(handler: Callable[[Update, ContextTypes.DEFAULT_TYPE], Awaitable[Any]]):
    """Decorator to restrict handler access to admins only."""

    @wraps(handler)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user_id = update.effective_user.id if update and update.effective_user else None
        if not user_id or not is_admin(user_id):
            target = update.effective_message or update.message
            if target:
                await target.reply_text("دسترسی غیر مجاز! ❌")
            return
        return await handler(update, context, *args, **kwargs)

    return wrapper


def require_main_admin(handler: Callable[[Update, ContextTypes.DEFAULT_TYPE], Awaitable[Any]]):
    """Decorator to restrict handler access to the main admin only."""

    @wraps(handler)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user_id = update.effective_user.id if update and update.effective_user else None
        if not user_id or not is_main_admin(user_id):
            target = update.effective_message or update.message
            if target:
                await target.reply_text("دسترسی فقط برای ادمین اصلی مجاز است ❌")
            return
        return await handler(update, context, *args, **kwargs)

    return wrapper


# =============== Error handling ===============

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Global error handler to log exceptions and optionally notify main admin.

    This will log the exception with traceback. If MAIN_ADMIN_ID is set and the
    error occurred due to an Update, it tries to notify the admin with a brief
    message (without leaking sensitive data).
    """
    from config import MAIN_ADMIN_ID  # local import to avoid cycles

    logger.exception("Unhandled exception while handling update: %s", str(update))

    # Try to notify main admin non-blocking
    admin_id = None
    try:
        admin_id = int(MAIN_ADMIN_ID) if MAIN_ADMIN_ID else None
    except Exception:
        admin_id = None

    if admin_id:
        try:
            await context.bot.send_message(
                chat_id=admin_id,
                text="⚠️ خطای غیرمنتظره در ربات رخ داد. گزارش در لاگ‌ها ثبت شد.",
            )
        except Exception as e:
            # Avoid cascading errors
            logger.debug("Failed to notify main admin about error: %s", e)


# =============== Safe send helpers ===============

async def safe_send_message(bot: Bot, chat_id: int, text: str, **kwargs) -> bool:
    try:
        await bot.send_message(chat_id=chat_id, text=text, **kwargs)
        return True
    except Exception as e:
        logger.error("safe_send_message failed for %s: %s", chat_id, e)
        return False


async def safe_send_audio(bot: Bot, chat_id: int, audio: str, **kwargs) -> bool:
    try:
        await bot.send_audio(chat_id=chat_id, audio=audio, **kwargs)
        return True
    except Exception as e:
        logger.error("safe_send_audio failed for %s: %s", chat_id, e)
        return False


async def safe_send_voice(bot: Bot, chat_id: int, voice: str, **kwargs) -> bool:
    try:
        await bot.send_voice(chat_id=chat_id, voice=voice, **kwargs)
        return True
    except Exception as e:
        logger.error("safe_send_voice failed for %s: %s", chat_id, e)
        return False


# =============== Throttling (simple in-memory) ===============

_throttle_map: Dict[str, float] = {}


def throttle(period_seconds: float = 1.5, key: str = "user"):
    """Simple throttle decorator to limit handler call frequency per key.

    key can be 'user' or 'chat'. If called sooner than period_seconds, the call
    is ignored and a polite message is sent to the user if possible.
    """

    def decorator(func: Callable[[Update, ContextTypes.DEFAULT_TYPE], Awaitable[Any]]):
        @wraps(func)
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
            now = time.monotonic()
            if key == "user" and update and update.effective_user:
                k = f"user:{update.effective_user.id}:{func.__name__}"
            elif key == "chat" and update and update.effective_chat:
                k = f"chat:{update.effective_chat.id}:{func.__name__}"
            else:
                k = f"global:{func.__name__}"

            last = _throttle_map.get(k, 0.0)
            if now - last < period_seconds:
                # Too frequent
                target = update.effective_message if update else None
                if target:
                    try:
                        await target.reply_text("لطفاً کمی صبر کنید و سپس دوباره تلاش کنید ⏳")
                    except Exception:
                        pass
                return

            _throttle_map[k] = now
            return await func(update, context, *args, **kwargs)

        return wrapper

    return decorator
