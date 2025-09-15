# bot/handlers/group_handlers.py
import logging
from telegram import Update
from telegram.ext import ContextTypes, ChatMemberHandler
from bot.database import execute_query

logger = logging.getLogger(__name__)

async def handle_my_chat_member(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Track when the bot is added to groups and store the latest group per adder.
    This powers the "ثبت گروه اخیر" button in the admin flow without manual input.
    """
    try:
        if not update.my_chat_member:
            return
        mycm = update.my_chat_member
        chat = mycm.chat
        new_member = mycm.new_chat_member
        bot_id = context.bot.id

        # Only proceed if the event is about this bot's membership change in group/supergroup
        if chat.type not in ("group", "supergroup"):
            return
        if not new_member or new_member.user.id != bot_id:
            return
        if new_member.status not in ("member", "administrator"):
            return

        # Who added the bot (the actor of this change)
        adder = mycm.from_user
        adder_id = adder.id if adder else None
        if not adder_id:
            return

        chat_id = chat.id
        title = chat.title or ""
        username = chat.username or None  # Save None if private

        # Create table if missing (defensive) and upsert the record
        execute_query(
            """
            CREATE TABLE IF NOT EXISTS recent_groups (
                chat_id TEXT,
                adder_id INTEGER,
                title TEXT,
                username TEXT,
                added_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (adder_id, chat_id)
            )
            """
        )
        # Upsert-like: replace existing (adder_id, chat_id) with new timestamp/title/username
        execute_query(
            """
            INSERT INTO recent_groups (chat_id, adder_id, title, username, added_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(adder_id, chat_id) DO UPDATE SET
                title=excluded.title,
                username=excluded.username,
                added_at=excluded.added_at
            """,
            (str(chat_id), adder_id, title, username),
        )
        logger.info(f"Logged recent group for adder={adder_id} chat_id={chat_id} title={title} username={username}")
    except Exception as e:
        logger.error(f"Failed to process my_chat_member: {e}")


chat_member_handler = ChatMemberHandler(handle_my_chat_member, ChatMemberHandler.MY_CHAT_MEMBER)
