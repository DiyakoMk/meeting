# bot/handlers/common_handlers.py
from telegram import Update
from telegram.ext import ContextTypes, MessageHandler, filters


async def unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("دستور نامعتبر است.")


unknown_handler = MessageHandler(filters.COMMAND, unknown_command)
