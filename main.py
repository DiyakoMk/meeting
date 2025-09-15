import warnings
from telegram.warnings import PTBUserWarning

warnings.filterwarnings(
    "ignore",
    category=PTBUserWarning,
    message=r"If 'per_message=.*"
)

# main.py
import logging
import os

from telegram.ext import Application, CommandHandler
from telegram.error import BadRequest

from config import BOT_TOKEN
from bot.database import init_db
from bot.utils import error_handler
from bot.handlers.start_handler import start_handler
from bot.handlers.bit_handlers import bit_conv
from bot.handlers.battle_handlers import battle_conv
from bot.handlers.admin_handlers import (
    admin_management_conv,
    admin_meeting_conv,
    admin_remove_conv,
    broadcast_conv,
    admin_stats_handler,
    admin_panel,
)
from bot.handlers.common_handlers import unknown_handler
from bot.handlers.group_handlers import chat_member_handler

# Structured logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    level=getattr(logging, LOG_LEVEL, logging.INFO),
)
logger = logging.getLogger(__name__)


def main() -> None:
    # Initialize DB and app
    init_db()
    application = Application.builder().token(BOT_TOKEN).build()

    # Global error handler
    application.add_error_handler(error_handler)

    # Core handlers
    application.add_handler(start_handler)
    
    # User flows
    application.add_handler(bit_conv)
    application.add_handler(battle_conv)

    # Admin handlers
    application.add_handler(admin_management_conv)
    application.add_handler(admin_meeting_conv)
    application.add_handler(admin_remove_conv)
    application.add_handler(broadcast_conv)
    application.add_handler(admin_stats_handler)
    application.add_handler(CommandHandler("admin", admin_panel))

    # Unknown command catch-all (keep last)
    application.add_handler(unknown_handler)

    # Track when the bot is added to groups to support "ثبت گروه اخیر"
    application.add_handler(chat_member_handler)

    # Run bot
    application.run_polling(allowed_updates=None, stop_signals=None)


if __name__ == "__main__":
    main()