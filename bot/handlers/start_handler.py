# bot/handlers/start_handler.py
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler
from bot.keyboards import main_keyboard

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "خوش آمدید! برای ارسال بیت جدید از دکمه زیر استفاده کنید:",
        reply_markup=main_keyboard()
    )
    return -1

start_handler = CommandHandler('start', start)