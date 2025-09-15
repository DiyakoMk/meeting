# bot/keyboards.py
from telegram import ReplyKeyboardMarkup, InlineKeyboardButton

def main_keyboard():
    return ReplyKeyboardMarkup(
        [["ارسال بیت 📲"], ["شرکت در بتل ⚔️"]],
        resize_keyboard=True
    )

def admin_keyboard():
    return ReplyKeyboardMarkup(
        [["👥 مدیریت ادمین‌ها"], ["📊 آمار"], ["📢 ارسال همگانی"], ["➕ افزودن میتینگ"], ["🗑️ حذف میتینگ"]],
        resize_keyboard=True
    )

def admin_management_keyboard():
    return ReplyKeyboardMarkup(
        [["➕ افزودن ادمین"], ["🗑️ حذف ادمین"], ["📋 لیست ادمین‌ها"], ["🔙 بازگشت"]],
        resize_keyboard=True
    )

def battle_ability_keyboard():
    return ReplyKeyboardMarkup([["بله", "خیر"]], one_time_keyboard=True)

def vibe_keyboard():
    return ReplyKeyboardMarkup([["گنگ"], ["ایموشنال و دپ"], ["دیگر"]], one_time_keyboard=True)