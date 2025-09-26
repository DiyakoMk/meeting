# bot/handlers/battle_handlers.py
import logging
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardRemove, ReplyKeyboardMarkup
from telegram.ext import ContextTypes, MessageHandler, CallbackQueryHandler, filters, ConversationHandler
from bot.keyboards import main_keyboard
from bot.database import execute_query
from config import MAIN_ADMIN_ID

logger = logging.getLogger(__name__)

# States
BATTLE_NICKNAME, FREESTYLE_QUESTION, BATTLE_MEETING, CONFIRM_BATTLE = range(4)

def battle_question_keyboard():
    return ReplyKeyboardMarkup([["بله", "خیر"], ["🔙 بازگشت"]], one_time_keyboard=True, resize_keyboard=True)

async def battle_submission(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "۱. لقب خود را ارسال کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return BATTLE_NICKNAME

async def battle_nickname(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['bit_nickname'] = update.message.text
    context.user_data['battle_participation'] = 1
    await update.message.reply_text(
        "۲. آیا توانایی بداهه خواندن را دارید؟",
        reply_markup=battle_question_keyboard()
    )
    return FREESTYLE_QUESTION

async def freestyle_question(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['freestyle_ability'] = 1 if update.message.text == "بله" else 0
    
    # Get active meetings
    meetings = execute_query(
        "SELECT meeting_id, title FROM meetings WHERE is_active = 1",
        fetch=True
    )
    
    if not meetings:
        await update.message.reply_text("هیچ میتینگ فعالی موجود نیست!", reply_markup=main_keyboard())
        return ConversationHandler.END
    
    # Create meeting selection keyboard
    keyboard = [
        [InlineKeyboardButton(title, callback_data=f"battlemeeting_{mid}")]
        for mid, title in meetings
    ]
    keyboard.append([InlineKeyboardButton("🔙 بازگشت", callback_data="back_battle_question")])
    
    await update.message.reply_text(
        "۳. میتینگ مدنظر را انتخاب کنید:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return BATTLE_MEETING

async def battle_select_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    meeting_id = int(query.data.split('_')[1])
    
    # Get meeting title and description
    meeting_info = execute_query(
        "SELECT title, description FROM meetings WHERE meeting_id = ?",
        (meeting_id,),
        fetch_one=True
    )
    
    if not meeting_info:
        await query.edit_message_text("میتینگ انتخاب شده یافت نشد!")
        return ConversationHandler.END
    
    meeting_title, meeting_desc = meeting_info
    context.user_data['bit_meeting_id'] = meeting_id
    context.user_data['meeting_title'] = meeting_title
    context.user_data['meeting_desc'] = meeting_desc or ""
    
    # Build confirmation message
    confirmation_text = (
        f"✅ اطلاعات ثبت نام بتل:\n"
        f"لقب: {context.user_data['bit_nickname']}\n"
        f"توانایی بداهه: {'دارد' if context.user_data['freestyle_ability'] else 'ندارد'}\n"
        f"میتینگ: {meeting_title}\n"
        f"توضیحات میتینگ: \n{context.user_data['meeting_desc']}\n\n"
        "۴. ثبت نهایی انجام شود؟"
    )
    
    await query.edit_message_text(
        confirmation_text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("ثبت نهایی ✅", callback_data="confirm_battle")],
            [InlineKeyboardButton("🔙 بازگشت", callback_data="back_battle_meeting")]
        ])
    )
    return CONFIRM_BATTLE

async def confirm_battle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "confirm_battle":
        user_data = context.user_data
        user_id = update.effective_user.id

        # Save user only; do not store battle application details
        execute_query(
            "INSERT OR REPLACE INTO users (user_id, nickname) VALUES (?, ?)",
            (user_id, user_data['bit_nickname'])
        )
        # Increment only counter on meeting
        execute_query(
            "UPDATE meetings SET battle_count = battle_count + 1 WHERE meeting_id = ?",
            (user_data['bit_meeting_id'],)
        )
        
        # Notify group
        meeting_info = execute_query(
            "SELECT group_id, admin_id FROM meetings WHERE meeting_id = ?",
            (user_data['bit_meeting_id'],),
            fetch_one=True
        )
        
        if meeting_info:
            group_id_raw, admin_id = meeting_info
            
            # Resolve chat id for sending
            target_chat_id = None
            if isinstance(group_id_raw, str) and group_id_raw.startswith('@'):
                try:
                    chat = await context.bot.get_chat(group_id_raw)
                    target_chat_id = chat.id
                    try:
                        execute_query("UPDATE meetings SET group_id = ? WHERE meeting_id = ?", (str(target_chat_id), user_data['bit_meeting_id']))
                    except Exception:
                        pass
                except Exception as e:
                    logger.error(f"Failed to resolve group username {group_id_raw}: {e}")
            else:
                try:
                    target_chat_id = int(group_id_raw)
                except Exception:
                    target_chat_id = None

            group_message = (
                f"⚔️ ثبت نام جدید برای بتل!\n\n"
                f"کاربر: {user_data['bit_nickname']}\n"
                f"توانایی بداهه: {'دارد' if user_data['freestyle_ability'] else 'ندارد'}\n"
                f"میتینگ: {user_data['meeting_title']}\n"
            )
            
            if target_chat_id is not None:
                try:
                    await context.bot.send_message(target_chat_id, group_message)
                except Exception as e:
                    logger.error(f"Error sending group message to {target_chat_id}: {e}")
            else:
                logger.error(f"No valid group chat id for meeting {user_data['bit_meeting_id']} (stored: {group_id_raw})")
            
            invite_link = await context.bot.export_chat_invite_link(group_id_raw)
            # Always notify meeting supervisor about new battle signup
            try:
                supervisor_message = f"🔔 ثبت نام جدید برای بتل در میتینگ شما!\n [لطفاً گروه میتینگ را بررسی کنید.]({invite_link})"
                await context.bot.send_message(admin_id, supervisor_message, parse_mode='Markdown', disable_web_page_preview=True)
            except Exception as e:
                logger.error(f"Error notifying meeting supervisor: {e}")
        
        await query.edit_message_text(
            "✅ ثبت نام بتل شما با موفقیت انجام شد!",
            reply_markup=None
        )
    else:
        await query.edit_message_text(
            "❌ ثبت نام بتل لغو شد!",
            reply_markup=None
        )
    
    await context.bot.send_message(
        query.message.chat_id,
        "منوی اصلی:",
        reply_markup=main_keyboard()
    )
    return ConversationHandler.END

# Back navigation handlers
async def back_to_main_battle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("منوی اصلی:", reply_markup=main_keyboard())
    return ConversationHandler.END

async def back_to_battle_nickname(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "۱. لقب خود را ارسال کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return BATTLE_NICKNAME

async def back_from_battle_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    try:
        await query.edit_message_text("بازگشت به مرحله قبل. ۲. آیا توانایی بداهه خواندن را دارید؟")
    except Exception:
        pass
    await context.bot.send_message(
        chat_id=query.message.chat_id,
        text="۲. آیا توانایی بداهه خواندن را دارید؟",
        reply_markup=battle_question_keyboard()
    )
    return FREESTYLE_QUESTION

async def back_from_battle_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    meetings = execute_query(
        "SELECT meeting_id, title FROM meetings WHERE is_active = 1",
        fetch=True
    )
    if not meetings:
        await query.edit_message_text("هیچ میتینگ فعالی موجود نیست!")
        await context.bot.send_message(query.message.chat_id, "منوی اصلی:", reply_markup=main_keyboard())
        return ConversationHandler.END

    keyboard = [
        [InlineKeyboardButton(title, callback_data=f"battlemeeting_{mid}")]
        for mid, title in meetings
    ]
    keyboard.append([InlineKeyboardButton("🔙 بازگشت", callback_data="back_battle_question")])
    await query.edit_message_text(
        "۳. میتینگ مدنظر را انتخاب کنید:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return BATTLE_MEETING

# Conversation handler
battle_conv = ConversationHandler(
    entry_points=[MessageHandler(filters.Regex("^شرکت در بتل ⚔️$"), battle_submission)],
    states={
        BATTLE_NICKNAME: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_main_battle),
            MessageHandler(filters.TEXT & ~filters.COMMAND, battle_nickname),
        ],
        FREESTYLE_QUESTION: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_battle_nickname),
            MessageHandler(filters.Regex("^(بله|خیر)$"), freestyle_question),
        ],
        BATTLE_MEETING: [
            CallbackQueryHandler(battle_select_meeting, pattern="^battlemeeting_"),
            CallbackQueryHandler(back_from_battle_meeting, pattern="^back_battle_question$"),
        ],
        CONFIRM_BATTLE: [
            CallbackQueryHandler(confirm_battle, pattern="^confirm_battle$"),
            CallbackQueryHandler(back_from_battle_confirm, pattern="^back_battle_meeting$"),
        ],
    },
    fallbacks=[],
    per_message=False
)