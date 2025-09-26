# bot/handlers/admin_handlers.py
import logging
from telegram import KeyboardButtonRequestChat, Update, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardRemove, ReplyKeyboardMarkup, KeyboardButton, ChatAdministratorRights
from telegram.error import ChatMigrated
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

bot_rights = ChatAdministratorRights(
    can_invite_users=True,           
    can_manage_chat=True,            
    can_delete_messages=True,        
    can_manage_video_chats=True,     
    can_restrict_members=True,       
    can_promote_members=True,       
    can_change_info=True,            
    can_post_messages=True,        
    can_edit_messages=True,         
    can_pin_messages=True,           
    can_manage_topics=True,          
    is_anonymous=False,
    can_post_stories=True,
    can_edit_stories=True,
    can_delete_stories=True
)

admin_rights = ChatAdministratorRights(
    can_invite_users=True,           
    can_manage_chat=True,            
    can_delete_messages=True,        
    can_manage_video_chats=True,     
    can_restrict_members=True,       
    can_promote_members=True,       
    can_change_info=True,            
    can_post_messages=True,        
    can_edit_messages=True,         
    can_pin_messages=True,           
    can_manage_topics=True,          
    is_anonymous=False,
    can_post_stories=True,
    can_edit_stories=True,
    can_delete_stories=True
)

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
    if user_id == MAIN_ADMIN_ID:
        return True
    row = execute_query("SELECT 1 FROM admins WHERE admin_id = ?", (user_id,), fetch_one=True)
    return bool(row)


def _is_main_admin(user_id: int) -> bool:
    if user_id == MAIN_ADMIN_ID:
        return True

async def admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    is_admin = execute_query(
        "SELECT 1 FROM admins WHERE admin_id = ?",
        (user_id,),
        fetch_one=True
    )
    if user_id == MAIN_ADMIN_ID:
        is_admin = True
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

    users = _count("SELECT COUNT(*) FROM users")
    active_meetings = _count("SELECT COUNT(*) FROM meetings WHERE is_active = 1")

    # List at most 5 active meetings by title only
    meetings = execute_query(
        """
        SELECT title
        FROM meetings
        WHERE is_active = 1
        ORDER BY meeting_id DESC
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
        for (title,) in meetings:
            text_lines.append(f"• {title}")

        remaining_row = execute_query(
            "SELECT GREATEST(0, (SELECT COUNT(*) FROM meetings WHERE is_active = 1) - 5)",
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
        group_add_url = f"https://t.me/{bot_username}?startgroup" if bot_username else "https://t.me/"

        request_chat_button = KeyboardButton(
            text="یک گروه انتخاب کنید",
            request_chat=KeyboardButtonRequestChat(
                request_id=1,
                chat_is_channel=False,
                user_administrator_rights=bot_rights,
                bot_administrator_rights=bot_rights,
                bot_is_member=True,
                chat_is_forum=False
            )
        )
        instructions = (
            "۳. با استفاده از دکمه زیر یک گروه انتخاب کنید یا بسازید!"
        )
        await update.message.reply_text(
            instructions,
            parse_mode='Markdown',
            reply_markup=ReplyKeyboardMarkup([[request_chat_button],["🔙 بازگشت"]], resize_keyboard=True),
        )
        return ADD_MEETING_GROUP
    except ValueError:
        await update.message.reply_text("آیدی باید یک عدد باشد! لطفا مجددا وارد کنید:")
        return ADD_MEETING_ADMIN


async def meeting_group(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Prefer forwarded message from the target group
    if getattr(update.message, "chat_shared", None):
        shared = update.message.chat_shared
        chat_id = shared.chat_id
        chat = await context.bot.get_chat(chat_id)
        title = chat.title
        context.user_data['meeting_group'] = title
        context.user_data['meeting_group_id'] = chat_id
        await update.message.reply_text(
            f"✅ گروه انتخاب شده: {title}\n\n۴. توضیحات تکمیلی را ارسال کنید:",
            reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
        )
        return ADD_MEETING_DESC

async def meeting_desc(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['meeting_desc'] = update.message.text
    try:
        invite_link = await context.bot.export_chat_invite_link(context.user_data['meeting_group_id'])
    except ChatMigrated as e:  
        invite_link = await context.bot.export_chat_invite_link(e.new_chat_id)
        context.user_data['meeting_group_id'] = e.new_chat_id
        
    await update.message.reply_text(
        f"✅ اطلاعات میتینگ:\n\n"
        f"عنوان: {context.user_data['meeting_title']}\n"
        f"ناظر: {context.user_data['meeting_admin']}\n"
        f"گروه: [{context.user_data['meeting_group']}]({invite_link})\n"
        f"توضیحات: \n{context.user_data['meeting_desc']}\n\n"
        "ثبت شود؟",
        parse_mode="Markdown",
        disable_web_page_preview=True,
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
        group_id = context.user_data['meeting_group_id']
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
    
    request_chat_button = KeyboardButton(
        text="یک گروه انتخاب کنید",
        request_chat=KeyboardButtonRequestChat(
            request_id=1,
            chat_is_channel=False,
            user_administrator_rights=bot_rights,
            bot_administrator_rights=bot_rights,
            bot_is_member=True,
            chat_is_forum=False
        )
    )
    instructions = (
        "۳. با استفاده از دکمه زیر یک گروه انتخاب کنید یا بسازید!"
    )
    await update.message.reply_text(
        instructions,
        parse_mode='Markdown',
        reply_markup=ReplyKeyboardMarkup([[request_chat_button],["🔙 بازگشت"]], resize_keyboard=True),
    )
    return ADD_MEETING_GROUP

async def back_from_confirm_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
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
        "SELECT admin_id FROM admins",
        fetch=True
    )
    
    if not admins:
        await update.message.reply_text("هیچ ادمینی ثبت نشده است.")
        return ADMIN_MENU
    
    text = "👑 ادمین های سیستم:\n\n"
    for admin_id, in admins:
        text += f"• {admin_id}\n"
    
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
    # No concept of main admin anymore; allow any existing admin to add another admin
    if not _is_admin(user_id):
        await update.message.reply_text("دسترسی غیر مجاز! ❌")
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
    # No concept of main admin anymore; require admin rights
    if not _is_admin(user_id):
        await update.message.reply_text(
            "دسترسی غیر مجاز! ❌",
            reply_markup=admin_management_keyboard()
        )
        return ADMIN_MENU
    admins = execute_query(
        "SELECT admin_id FROM admins",
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
    if not _is_admin(user_id):
        await query.edit_message_text("دسترسی غیر مجاز! ❌")
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
        execute_query("DELETE FROM admins WHERE admin_id = ?", (admin_id,))
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
            MessageHandler(filters.StatusUpdate.CHAT_SHARED, meeting_group),
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
            MessageHandler(filters.Regex("^🔙 بازگ��ت$"), back_to_admin_management_menu),
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