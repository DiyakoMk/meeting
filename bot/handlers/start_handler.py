# bot/handlers/start_handler.py
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler
from bot.keyboards import main_keyboard
from bot.database import execute_query

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.type in ['group', 'supergroup']:
        return

    # Add every user who starts the bot to users table (upsert nickname from Telegram profile)
    user = update.effective_user
    if user:
        nickname = user.full_name or user.username or None
        execute_query(
            "INSERT OR REPLACE INTO users (user_id, nickname) VALUES (?, ?)",
            (user.id, nickname)
        )

    await update.message.reply_text(
        "خوش آمدید! برای ارسال بیت جدید از دکمه زیر استفاده کنید:",
        reply_markup=main_keyboard()
    )
    return -1

start_handler = CommandHandler('start', start)