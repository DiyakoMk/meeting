# bot/handlers/admin_handlers.py
import logging
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardRemove, ReplyKeyboardMarkup
from telegram.ext import (
    ContextTypes, 
    MessageHandler, 
    CallbackQueryHandler, 
    filters, 
    ConversationHandler,
    CommandHandler
)
from bot.keyboards import admin_keyboard, admin_management_keyboard, main_keyboard
from bot.database import execute_query
from config import MAIN_ADMIN_ID

logger = logging.getLogger(__name__)

# States for admin conversations
ADD_MEETING_TITLE, ADD_MEETING_ADMIN, ADD_MEETING_GROUP, ADD_MEETING_DESC, CONFIRM_MEETING = range(5)
REMOVE_MEETING = range(1)
BROADCAST_MESSAGE = range(1)

# Admin management states
ADMIN_MENU = "ADMIN_MENU"
ADD_ADMIN_ID = "ADD_ADMIN_ID"
REMOVE_ADMIN = "REMOVE_ADMIN"

def _is_admin(user_id: int) -> bool:
    row = execute_query("SELECT 1 FROM admins WHERE admin_id = ?", (user_id,), fetch_one=True)
    return bool(row)


def _is_main_admin(user_id: int) -> bool:
    row = execute_query("SELECT is_main FROM admins WHERE admin_id = ?", (user_id,), fetch_one=True)
    return bool(row and row[0] == 1)

async def admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    is_admin = execute_query(
        "SELECT 1 FROM admins WHERE admin_id = ?",
        (user_id,),
        fetch_one=True
    )
    
    if not is_admin:
        await update.message.reply_text("دسترسی غیر مجاز! ❌")
        return
    
    await update.message.reply_text(
        "پنل مدیریت:",
        reply_markup=admin_keyboard()
    )
    return ConversationHandler.END

async def show_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not _is_admin(user_id):
        await update.message.reply_text("دسترسی غیر مجاز! ❌")
        return ConversationHandler.END

    def _count(query: str, params=()) -> int:
        row = execute_query(query, params, fetch_one=True)
        try:
            return int(row[0]) if row is not None else 0
        except Exception:
            return 0

    # Key totals (minimal)
    users = _count("SELECT COUNT(*) FROM users")
    active_meetings = _count("SELECT COUNT(*) FROM meetings WHERE is_active = 1")

    # Short list of active meetings (max 5)
    meetings = execute_query(
        """
        SELECT m.title,
               (SELECT COUNT(*) FROM bits b WHERE b.meeting_id = m.meeting_id AND b.beat_id IS NOT NULL) AS beats,
               (SELECT COUNT(*) FROM bits b WHERE b.meeting_id = m.meeting_id AND b.battle_participation = 1) AS battles
        FROM meetings m
        WHERE m.is_active = 1
        ORDER BY m.meeting_id DESC
        LIMIT 5
        """,
        fetch=True,
    ) or []

    text_lines = [
        "📊 آمار مختصر",
        f"👥 کاربران: {users}",
        f"📅 میتینگ‌های فعال: {active_meetings}",
    ]

    if meetings:
        text_lines.append("")
        text_lines.append("📌 میتینگ‌های فعال:")
    for title, mb, mt in meetings:
        text_lines.append(f"• {title}")

        # Indicate more meetings exist beyond the limit
        remaining_row = execute_query(
            "SELECT MAX(0, (SELECT COUNT(*) FROM meetings WHERE is_active = 1) - 5)",
            fetch_one=True,
        )
        remaining = int(remaining_row[0]) if remaining_row else 0
        if remaining > 0:
            text_lines.append(f"… و {remaining} میتینگ دیگر")

    await update.message.reply_text("\n".join(text_lines), reply_markup=admin_keyboard())
    return ConversationHandler.END

async def broadcast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not _is_admin(user_id):
        await update.message.reply_text("دسترسی غیر مجاز! ❌")
        return ConversationHandler.END
    await update.message.reply_text(
        "پیام همگانی خود را ارسال کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return BROADCAST_MESSAGE

async def broadcast_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.message.text
    users = execute_query("SELECT user_id FROM users", fetch=True)
    
    if users:
        for user_id in [u[0] for u in users]:
            try:
                await context.bot.send_message(user_id, message)
            except Exception as e:
                logger.error(f"Error broadcasting to {user_id}: {e}")
    
    await update.message.reply_text(
        f"✅ پیام به {len(users)} کاربر ارسال شد!",
        reply_markup=admin_keyboard()
    )
    return -1

async def add_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not _is_admin(user_id):
        await update.message.reply_text("دسترسی غیر مجاز! ❌")
        return ConversationHandler.END
    await update.message.reply_text(
        "۱. عنوان میتینگ را وارد کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return ADD_MEETING_TITLE

async def meeting_title(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['meeting_title'] = update.message.text
    await update.message.reply_text("۲. آیدی عددی ناظر را وارد کنید:", reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True))
    return ADD_MEETING_ADMIN

async def meeting_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        admin_id = int(update.message.text)
        context.user_data['meeting_admin'] = admin_id
        # Manual, reliable group selection instructions
        bot_username = getattr(context.bot, "username", None) or ""
        group_add_url = f"https://t.me/{bot_username}?startgroup=meeting" if bot_username else "https://t.me/"
        await update.message.reply_text(
            "ابتدا ربات را به گروه اضافه کنید (در صورت نیاز):",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("➕ افزودن ربات به گروه", url=group_add_url)]])
        )
        instructions = (
            "۳. یکی از روش‌های زیر را انجام دهید:\n"
            "• یک پیام از گروه به من فوروارد کنید؛ یا\n"
            "• آیدی گروه را به صورت عددی وارد کنید (مثل -100xxxxxxxxxx)؛ یا\n"
            "• نام کاربری عمومی گروه را با @ وارد کنید (مثل @yourgroup)."
        )
        await update.message.reply_text(
            instructions,
            reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True),
        )
        return ADD_MEETING_GROUP
    except ValueError:
        await update.message.reply_text("آیدی باید یک عدد باشد! لطفا مجددا وارد کنید:")
        return ADD_MEETING_ADMIN

async def pick_group_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    chat_id = query.data.split('_', 2)[2]
    # Find stored row for label/username
    row = execute_query(
        "SELECT title, username FROM recent_groups WHERE chat_id = ? AND adder_id = ?",
        (str(chat_id), query.from_user.id),
        fetch_one=True,
    )
    title, username = (row or (None, None))
    group_value = f"@{username}" if username else str(chat_id)
    context.user_data['meeting_group'] = group_value
    await context.bot.send_message(
        chat_id=query.message.chat_id,
        text=(
            f"✅ گروه انتخاب شده: {title or group_value}\n\n"
            "۴. توضیحات تکمیلی را ارسال کنید:"
        ),
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return ADD_MEETING_DESC

async def refresh_recent_groups(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    rows = execute_query(
        "SELECT chat_id, title, username FROM recent_groups WHERE adder_id = ? ORDER BY added_at DESC LIMIT 10",
        (query.from_user.id,),
        fetch=True,
    ) or []
    keyboard = []
    for chat_id, title, username in rows:
        label = title or (f"@{username}" if username else str(chat_id))
        keyboard.append([InlineKeyboardButton(label, callback_data=f"pick_group_{chat_id}")])
    keyboard.append([InlineKeyboardButton("🔄 بروزرسانی", callback_data="refresh_recent_groups")])
    await query.edit_message_reply_markup(reply_markup=InlineKeyboardMarkup(keyboard))
    return ADD_MEETING_GROUP

async def meeting_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Prefer forwarded message from the target group
    if getattr(update.message, "forward_from_chat", None):
        chat = update.message.forward_from_chat
        chat_id = str(chat.id)
        title = chat.title or chat.username or chat_id
        context.user_data['meeting_group'] = chat_id
        await update.message.reply_text(
            f"✅ گروه انتخاب شده: {title}\n\n۴. توضیحات تکمیلی را ارسال کنید:",
            reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
        )
        return ADD_MEETING_DESC

    # Otherwise parse text input
    text = (update.message.text or "").strip()
    if not text:
        await update.message.reply_text("ورودی نامعتبر است. لطفاً فوروارد کنید یا آیدی/نام کاربری را ارسال کنید.")
        return ADD_MEETING_GROUP

    # @username
    if text.startswith('@') and len(text) > 1:
        context.user_data['meeting_group'] = text
        await update.message.reply_text(
            f"✅ گروه انتخاب شده: {text}\n\n۴. توضیحات تکمیلی را ارسال کنید:",
            reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
        )
        return ADD_MEETING_DESC

    # Numeric chat id
    try:
        int(text)
        context.user_data['meeting_group'] = text
        await update.message.reply_text(
            f"✅ گروه انتخاب شده: {text}\n\n۴. توضیحات تکمیلی را ارسال کنید:",
            reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
        )
        return ADD_MEETING_DESC
    except ValueError:
        pass

    # Reject private invite links: bot cannot send via join links
    low = text.lower()
    if low.startswith('https://t.me/') or low.startswith('http://t.me/') or low.startswith('t.me/'):
        # Try to extract public username
        # Patterns like https://t.me/username or https://t.me/username/123
        try:
            after = low.split('t.me/', 1)[1]
            first = after.split('/', 1)[0]
            if first and not first.startswith('+') and first != 'joinchat':
                context.user_data['meeting_group'] = f"@{first}"
                await update.message.reply_text(
                    f"✅ گروه انتخاب شده: @{first}\n\n۴. توضیحات تکمیلی را ارسال کنید:",
                    reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
                )
                return ADD_MEETING_DESC
        except Exception:
            pass
        await update.message.reply_text(
            "این لینک خ��وصی قابل استفاده برای ارسال پیام نیست. لطفاً یک پیام از گروه فوروارد کنید یا @username/آیدی عددی گروه را ارسال کنید.")
        return ADD_MEETING_GROUP

    await update.message.reply_text("ورودی نامعتبر است. لطفاً یک پیام از گروه فوروارد کنید یا @username/آیدی عددی گروه را ارسال کنید.")
    return ADD_MEETING_GROUP

async def meeting_desc(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['meeting_desc'] = update.message.text
    
    await update.message.reply_text(
        f"✅ اطلاعات میتینگ:\n\n"
        f"عنوان: {context.user_data['meeting_title']}\n"
        f"ناظر: {context.user_data['meeting_admin']}\n"
        f"گروه: {context.user_data['meeting_group']}\n"
        f"توضیحات: {context.user_data['meeting_desc']}\n\n"
        "ثبت شود؟",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("ثبت ✅", callback_data="confirm_meeting")],
            [InlineKeyboardButton("🔙 بازگشت", callback_data="back_admin_desc")]
        ])
    )
    return CONFIRM_MEETING

async def confirm_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "confirm_meeting":
        title = context.user_data['meeting_title']
        admin_id = context.user_data['meeting_admin']
        group_id = context.user_data['meeting_group']
        desc = context.user_data['meeting_desc']
        
        # Don't add meeting supervisor as admin - they only get notifications
        execute_query(
            """INSERT INTO meetings (title, admin_id, group_id, description) 
            VALUES (?, ?, ?, ?)""",
            (title, admin_id, group_id, desc)
        )
        
        await query.edit_message_text(
            f"✅ میتینگ ثبت شد!",
            reply_markup=None
        )
    else:
        await query.edit_message_text(
            "❌ ایجاد میتینگ لغو شد!",
            reply_markup=None
        )
    
    await context.bot.send_message(
        query.message.chat_id,
        "به پنل مدیریت برگشتید:",
        reply_markup=admin_keyboard()
    )
    return -1

# ===== Back navigation helpers for admin flows =====
async def back_admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("به پنل مدیریت برگشتید:", reply_markup=admin_keyboard())
    return ConversationHandler.END

async def back_to_meeting_title(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "۱. عنوان میتینگ را وارد کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return ADD_MEETING_TITLE

async def back_to_meeting_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "۲. آیدی عددی ناظر را وارد کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return ADD_MEETING_ADMIN

async def back_to_meeting_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    bot_username = getattr(context.bot, "username", None) or ""
    group_add_url = f"https://t.me/{bot_username}?startgroup" if bot_username else "https://t.me/"
    await update.message.reply_text(
        "ابتدا ربات را به گروه اضافه کنید (در صورت نیاز):",
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("➕ افزودن ربات به گروه", url=group_add_url)]])
    )
    instructions = (
        "۳. یکی از روش‌های زیر را انجام دهید:\n"
        "• یک پیام از گروه به من فوروارد کنید؛ یا\n"
        "• آیدی گروه را به صورت عددی وارد کنید (مثل -100xxxxxxxxxx)؛ یا\n"
        "• نام کاربری عمومی گروه را با @ وارد کنید (مثل @yourgroup)."
    )
    await update.message.reply_text(
        instructions,
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True),
    )
    return ADD_MEETING_GROUP

async def back_from_confirm_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    try:
        await query.edit_message_text("بازگشت به مرحله قبل. ۴. توضیحات تکمیلی را ارسال کنید:")
    except Exception:
        pass
    await context.bot.send_message(
        chat_id=query.message.chat_id,
        text="۴. توضیحات تکمیلی را ارسال کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return ADD_MEETING_DESC

async def broadcast_back(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("به پنل مدیریت برگشتید:", reply_markup=admin_keyboard())
    return ConversationHandler.END

async def back_from_remove_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await context.bot.send_message(query.message.chat_id, "به پنل مدیریت برگشتید:", reply_markup=admin_keyboard())
    return ConversationHandler.END

async def back_to_admin_management_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("مدیریت ادمین‌ها:", reply_markup=admin_management_keyboard())
    return ADMIN_MENU

async def back_from_remove_admin_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await context.bot.send_message(query.message.chat_id, "مدیریت ادمین‌ها:", reply_markup=admin_management_keyboard())
    return ADMIN_MENU

async def remove_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not _is_admin(user_id):
        await update.message.reply_text("دسترسی غیر مجاز! ❌")
        return ConversationHandler.END
    meetings = execute_query(
        "SELECT meeting_id, title FROM meetings WHERE is_active = 1",
        fetch=True
    )
    
    if not meetings:
        await update.message.reply_text("هیچ میتینگ فعالی موجود نیست!")
        return ConversationHandler.END
    
    keyboard = [
        [InlineKeyboardButton(title, callback_data=f"remove_{mid}")]
        for mid, title in meetings
    ]
    keyboard.append([InlineKeyboardButton("🔙 بازگشت", callback_data="back_admin_panel")])
    
    await update.message.reply_text(
        "میتینگ مورد نظر برای حذف را انتخاب کنید:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return REMOVE_MEETING

async def confirm_remove_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    meeting_id = int(query.data.split('_')[1])
    
    # Get title before deletion
    title_row = execute_query("SELECT title FROM meetings WHERE meeting_id = ?", (meeting_id,), fetch_one=True)
    if not title_row:
        try:
            await query.edit_message_text("این میتینگ یافت نشد یا قبلاً حذف شده است.")
        except Exception:
            pass
        await context.bot.send_message(query.message.chat_id, "به پنل مدیریت برگشتید:", reply_markup=admin_keyboard())
        return ConversationHandler.END
    title = title_row[0]
    
    # Delete all related data first (bits associated with this meeting)
    execute_query("DELETE FROM bits WHERE meeting_id = ?", (meeting_id,))
    
    # Then delete the meeting completely
    execute_query("DELETE FROM meetings WHERE meeting_id = ?", (meeting_id,))

    try:
        await query.edit_message_text(
            f"✅ میتینگ «{title}» کاملاً حذف شد!",
            reply_markup=None
        )
    except Exception:
        await context.bot.send_message(query.message.chat_id, f"✅ میتینگ «{title}» کاملاً حذف شد!")
    
    await context.bot.send_message(
        query.message.chat_id,
        "به پنل مدیریت برگشتید:",
        reply_markup=admin_keyboard()
    )
    return ConversationHandler.END

async def list_admins(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not _is_admin(user_id):
        await update.message.reply_text("دسترسی غیر مجاز! ❌")
        return ADMIN_MENU
    admins = execute_query(
        "SELECT admin_id, is_main FROM admins",
        fetch=True
    )
    
    if not admins:
        await update.message.reply_text("هیچ ادمینی ثبت نشده است.")
        return ADMIN_MENU
    
    text = "👑 ادمین های سیستم:\n\n"
    for admin_id, is_main in admins:
        text += f"• {admin_id} ({'اصلی' if is_main else 'عادی'})\n"
    
    await update.message.reply_text(text, reply_markup=admin_management_keyboard())
    return ADMIN_MENU

async def add_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "آیدی عددی ادمین جدید را وارد کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return ADD_ADMIN_ID

async def save_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not _is_main_admin(user_id):
        await update.message.reply_text("دسترسی فقط برای ادمین اصلی مجاز است ❌")
        return ADMIN_MENU
    try:
        admin_id = int(update.message.text)
        execute_query(
            "INSERT OR IGNORE INTO admins (admin_id) VALUES (?)",
            (admin_id,)
        )
        await update.message.reply_text(
            f"✅ ادمین {admin_id} با موفقیت اضافه شد!",
            reply_markup=admin_management_keyboard()
        )
        return ADMIN_MENU
    except ValueError:
        await update.message.reply_text("آیدی باید یک عدد باشد! لطفاً مجدداً وارد کنید:")
        return ADD_ADMIN_ID

async def admin_management(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not _is_main_admin(user_id):
        await update.message.reply_text("دسترسی فقط برای ادمین اصلی مجاز است ❌")
        return ConversationHandler.END
    await update.message.reply_text(
        "مدیریت ادمین‌ها:",
        reply_markup=admin_management_keyboard()
    )
    return ADMIN_MENU

async def remove_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not _is_main_admin(user_id):
        await update.message.reply_text(
            "دسترسی فقط برای ادمین اصلی مجاز است ❌",
            reply_markup=admin_management_keyboard()
        )
        return ADMIN_MENU
    admins = execute_query(
        "SELECT admin_id FROM admins WHERE is_main = 0",
        fetch=True
    )
    
    if not admins:
        await update.message.reply_text(
            "هیچ ادمین عادی‌ای برای حذف وجود ندارد.",
            reply_markup=admin_management_keyboard()
        )
        return ADMIN_MENU
    
    keyboard = [
        [InlineKeyboardButton(str(admin_id), callback_data=f"remove_admin_{admin_id}")]
        for admin_id, in admins
    ]
    keyboard.append([InlineKeyboardButton("🔙 بازگشت", callback_data="back_admin_mgmt_menu")])
    
    await update.message.reply_text(
        "ادمین مورد نظر برای حذف را انتخاب کنید:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return REMOVE_ADMIN

async def confirm_remove_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = update.effective_user.id
    if not _is_main_admin(user_id):
        await query.edit_message_text("دسترسی فقط برای ادمین اصلی مجاز است ❌")
        return ADMIN_MENU
    
    admin_id = int(query.data.split('_')[2])
    
    # Check if admin is referenced in meetings
    meetings_count = execute_query(
        "SELECT COUNT(*) FROM meetings WHERE admin_id = ?", 
        (admin_id,), 
        fetch_one=True
    )
    
    if meetings_count and meetings_count[0] > 0:
        await query.edit_message_text(
            f"❌ نمی‌توان ادمین {admin_id} را حذف کرد!\n"
            f"این ادمین ناظر {meetings_count[0]} میتینگ است.\n"
            f"ابتدا میتینگ‌ها را حذف کنید یا ناظر آن‌ها را تغییر دهید.",
            reply_markup=None
        )
    else:
        # Safe to delete
        execute_query("DELETE FROM admins WHERE admin_id = ? AND is_main = 0", (admin_id,))
        await query.edit_message_text(
            f"✅ ادمین {admin_id} با موفقیت حذف شد!",
            reply_markup=None
        )
    
    await context.bot.send_message(
        query.message.chat_id,
        "مدیریت ادمین‌ها:",
        reply_markup=admin_management_keyboard()
    )
    return ADMIN_MENU

# Conversation handlers
admin_meeting_conv = ConversationHandler(
    entry_points=[MessageHandler(filters.Regex("^➕ افزودن میتینگ$"), add_meeting)],
    states={
        ADD_MEETING_TITLE: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_admin_panel),
            MessageHandler(filters.TEXT & ~filters.COMMAND, meeting_title),
        ],
        ADD_MEETING_ADMIN: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_meeting_title),
            MessageHandler(filters.TEXT & ~filters.COMMAND, meeting_admin),
        ],
        ADD_MEETING_GROUP: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_meeting_admin),
            MessageHandler(filters.TEXT & ~filters.COMMAND, meeting_group),
        ],
        ADD_MEETING_DESC: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_meeting_group),
            MessageHandler(filters.TEXT & ~filters.COMMAND, meeting_desc),
        ],
        CONFIRM_MEETING: [
            CallbackQueryHandler(confirm_meeting, pattern="^confirm_meeting$"),
            CallbackQueryHandler(back_from_confirm_meeting, pattern="^back_admin_desc$"),
        ],
    },
    fallbacks=[],
    per_message=False
)

admin_remove_conv = ConversationHandler(
    entry_points=[MessageHandler(filters.Regex("^🗑️ حذف میتینگ$"), remove_meeting)],
    states={
        REMOVE_MEETING: [
            MessageHandler(filters.Regex("^🗑️ حذف میتینگ$"), remove_meeting),
            CallbackQueryHandler(confirm_remove_meeting, pattern="^remove_"),
            CallbackQueryHandler(back_from_remove_menu, pattern="^back_admin_panel$"),
        ]
    },
    fallbacks=[],
    per_message=False,
    allow_reentry=True
)

broadcast_conv = ConversationHandler(
    entry_points=[MessageHandler(filters.Regex("^📢 ارسال همگانی$"), broadcast)],
    states={
        BROADCAST_MESSAGE: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), broadcast_back),
            MessageHandler(filters.ALL & ~filters.COMMAND, broadcast_message),
        ]
    },
    fallbacks=[],
    per_message=False
)

admin_management_conv = ConversationHandler(
    entry_points=[MessageHandler(filters.Regex("^👥 مدیریت ادمین‌ها$"), admin_management)],
    states={
        ADMIN_MENU: [
            MessageHandler(filters.Regex("^➕ افزودن ادمین$"), add_admin),
            MessageHandler(filters.Regex("^🗑️ حذف ادمین$"), remove_admin),
            MessageHandler(filters.Regex("^📋 لیست ادمین‌ها$"), list_admins),
            MessageHandler(filters.Regex("^🔙 بازگشت$"), admin_panel)
        ],
        ADD_ADMIN_ID: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_admin_management_menu),
            MessageHandler(filters.TEXT & ~filters.COMMAND, save_admin),
        ],
        REMOVE_ADMIN: [
            CallbackQueryHandler(confirm_remove_admin, pattern="^remove_admin_"),
            CallbackQueryHandler(back_from_remove_admin_menu, pattern="^back_admin_mgmt_menu$"),
        ]
    },
    fallbacks=[],
    per_message=False
)

admin_stats_handler = MessageHandler(filters.Regex("^📊 آمار$"), show_stats)