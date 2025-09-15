# bot/handlers/bit_handlers.py
import logging
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardRemove, ReplyKeyboardMarkup
from telegram.ext import ContextTypes, MessageHandler, CallbackQueryHandler, filters, ConversationHandler
from bot.keyboards import vibe_keyboard, main_keyboard
from bot.database import execute_query
from config import MAIN_ADMIN_ID

logger = logging.getLogger(__name__)

# States
BIT_NICKNAME, BIT_BEAT, BIT_VIBE, BIT_TITLE, BIT_MEETING, CONFIRM_BIT = range(6)

# Common meeting selection function
async def select_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE, callback_prefix: str):
    meetings = execute_query(
        "SELECT meeting_id, title FROM meetings WHERE is_active = 1",
        fetch=True
    )
    
    if not meetings:
        await update.message.reply_text("هیچ میتینگ فعالی موجود نیست!", reply_markup=main_keyboard())
        return ConversationHandler.END
    
    keyboard = [
        [InlineKeyboardButton(title, callback_data=f"{callback_prefix}_{mid}")]
        for mid, title in meetings
    ]
    keyboard.append([InlineKeyboardButton("🔙 بازگشت", callback_data="back_bit_title")])
    
    await update.message.reply_text(
        "۵. میتینگ مدنظر را انتخاب کنید:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return BIT_MEETING

async def bit_submission(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "۱. لقب خود را ارسال کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return BIT_NICKNAME

async def bit_nickname(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['bit_nickname'] = update.message.text
    context.user_data['battle_participation'] = 0  # Not for battle
    context.user_data['freestyle_ability'] = 0
    await update.message.reply_text("۲. بیت خود را ارسال کنید (صوتی):")
    return BIT_BEAT

async def bit_beat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.message.voice:
        context.user_data['beat_id'] = update.message.voice.file_id
        context.user_data['beat_type'] = 'voice'
    elif update.message.audio:
        context.user_data['beat_id'] = update.message.audio.file_id
        context.user_data['beat_type'] = 'audio'
    else:
        await update.message.reply_text("لطفاً یک فایل صوتی ارسال کنید")
        return BIT_BEAT
    
    # Clear any existing caption
    if update.message.caption:
        context.user_data['original_caption'] = update.message.caption
    else:
        context.user_data['original_caption'] = None
    
    await update.message.reply_text(
        "۳. وایب کار خود را انتخاب کنید:",
        reply_markup=ReplyKeyboardMarkup([["گنگ"], ["ایموشنال و دپ"], ["دیگر"], ["🔙 بازگشت"]], one_time_keyboard=True, resize_keyboard=True)
    )
    return BIT_VIBE

async def bit_vibe(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['vibe'] = update.message.text
    await update.message.reply_text("۴. نام اثر را وارد کنید:", reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True))
    return BIT_TITLE

async def bit_title(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['title'] = update.message.text
    return await select_meeting(update, context, "bitmeeting")

async def bit_select_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    meeting_id = int(query.data.split('_')[1])
    
    # Get meeting title
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
        f"✅ اطلاعات بیت:\n"
        f"لقب: {context.user_data['bit_nickname']}\n"
        f"وایب: {context.user_data['vibe']}\n"
        f"عنوان: {context.user_data['title']}\n"
        f"میتینگ: {meeting_title}\n"
        f"توضیحات میتینگ: {context.user_data['meeting_desc']}\n\n"
        "۶. ثبت نهایی انجام شود؟"
    )
    
    await query.edit_message_text(
        confirmation_text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("ثبت نهایی ✅", callback_data="confirm_bit")],
            [InlineKeyboardButton("🔙 بازگشت", callback_data="back_bit_meeting")]
        ])
    )
    return CONFIRM_BIT

async def confirm_bit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "confirm_bit":
        user_data = context.user_data
        user_id = update.effective_user.id

        # Save to database
        execute_query(
            "INSERT OR REPLACE INTO users (user_id, nickname) VALUES (?, ?)",
            (user_id, user_data['bit_nickname'])
        )
        
        execute_query(
            """INSERT INTO bits 
            (user_id, meeting_id, beat_id, vibe, title, battle_participation, freestyle_ability) 
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user_id, user_data['bit_meeting_id'], user_data['beat_id'], 
             user_data['vibe'], user_data['title'], 0, 0)
        )
        
        # Notify group
        meeting_info = execute_query(
            "SELECT group_id, admin_id, description FROM meetings WHERE meeting_id = ?",
            (user_data['bit_meeting_id'],),
            fetch_one=True
        )
        
        if meeting_info:
            group_id_raw, admin_id, mdesc = meeting_info

            # Resolve chat id for sending
            target_chat_id = None
            if isinstance(group_id_raw, str) and group_id_raw.startswith('@'):
                try:
                    chat = await context.bot.get_chat(group_id_raw)
                    target_chat_id = chat.id
                    # Optionally persist resolved numeric id for future sends
                    try:
                        execute_query("UPDATE meetings SET group_id = ? WHERE meeting_id = ?", (str(target_chat_id), user_data['bit_meeting_id']))
                    except Exception:
                        pass
                except Exception as e:
                    logger.error(f"Failed to resolve group username {group_id_raw}: {e}")
            else:
                # Try numeric
                try:
                    target_chat_id = int(group_id_raw)
                except Exception:
                    target_chat_id = None

            # Create caption with beat info
            caption = (
                f"🎵 بیت جدید!\n\n"
                f"کاربر: {user_data['bit_nickname']}\n"
                f"عنوان: {user_data['title']}\n"
                f"وایب: {user_data['vibe']}\n"
                f"میتینگ: {user_data['meeting_title']}"
            )

            if target_chat_id is not None:
                try:
                    if user_data['beat_type'] == 'voice':
                        await context.bot.send_voice(
                            chat_id=target_chat_id,
                            voice=user_data['beat_id'],
                            caption=caption
                        )
                    else:
                        await context.bot.send_audio(
                            chat_id=target_chat_id,
                            audio=user_data['beat_id'],
                            caption=caption
                        )
                except Exception as e:
                    logger.error(f"Error sending beat to group {target_chat_id}: {e}")
            else:
                logger.error(f"No valid group chat id for meeting {user_data['bit_meeting_id']} (stored: {group_id_raw})")
            
            # Always notify meeting supervisor about new signup (no links)
            try:
                supervisor_message = "🔔 بیت جدید در میتینگ شما! لطفاً گروه میتینگ را بررسی کنید."
                await context.bot.send_message(admin_id, supervisor_message)
            except Exception as e:
                logger.error(f"Error notifying meeting supervisor: {e}")
        
        await query.edit_message_text(
            "✅ بیت شما با موفقیت ثبت شد!",
            reply_markup=None
        )
    else:
        await query.edit_message_text(
            "❌ ارسال بیت لغو شد!",
            reply_markup=None
        )
    
    await context.bot.send_message(
        query.message.chat_id,
        "منوی اصلی:",
        reply_markup=main_keyboard()
    )
    return ConversationHandler.END

# Back navigation handlers
async def back_to_main(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("منوی اصلی:", reply_markup=main_keyboard())
    return ConversationHandler.END

async def back_to_nickname(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "۱. لقب خود را ارسال کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return BIT_NICKNAME

async def back_to_beat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "۲. بیت خود را ارسال کنید (صوتی):",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return BIT_BEAT

async def back_to_vibe(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "۳. وایب کار خود را انتخاب کنید:",
        reply_markup=ReplyKeyboardMarkup([["گنگ"], ["ایموشنال و دپ"], ["دیگر"], ["🔙 بازگشت"]], one_time_keyboard=True, resize_keyboard=True)
    )
    return BIT_VIBE

async def back_from_meeting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    try:
        await query.edit_message_text("بازگشت به مرحله قبل. ۴. نام اثر را وارد کنید:")
    except Exception:
        pass
    await context.bot.send_message(
        chat_id=query.message.chat_id,
        text="۴. نام اثر را وارد کنید:",
        reply_markup=ReplyKeyboardMarkup([["🔙 بازگشت"]], resize_keyboard=True)
    )
    return BIT_TITLE

async def back_from_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE):
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
        [InlineKeyboardButton(title, callback_data=f"bitmeeting_{mid}")]
        for mid, title in meetings
    ]
    keyboard.append([InlineKeyboardButton("🔙 بازگشت", callback_data="back_bit_title")])
    await query.edit_message_text(
        "۵. میتینگ مدنظر را انتخاب کنید:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return BIT_MEETING

# Conversation handler
bit_conv = ConversationHandler(
    entry_points=[MessageHandler(filters.Regex("^ارسال بیت 📲$"), bit_submission)],
    states={
        BIT_NICKNAME: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_main),
            MessageHandler(filters.TEXT & ~filters.COMMAND, bit_nickname),
        ],
        BIT_BEAT: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_nickname),
            MessageHandler(filters.VOICE | filters.AUDIO, bit_beat),
        ],
        BIT_VIBE: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_beat),
            MessageHandler(filters.Regex("^(گنگ|ایموشنال و دپ|دیگر)$"), bit_vibe),
        ],
        BIT_TITLE: [
            MessageHandler(filters.Regex("^🔙 بازگشت$"), back_to_vibe),
            MessageHandler(filters.TEXT & ~filters.COMMAND, bit_title),
        ],
        BIT_MEETING: [
            CallbackQueryHandler(bit_select_meeting, pattern="^bitmeeting_"),
            CallbackQueryHandler(back_from_meeting, pattern="^back_bit_title$"),
        ],
        CONFIRM_BIT: [
            CallbackQueryHandler(confirm_bit, pattern="^confirm_bit$"),
            CallbackQueryHandler(back_from_confirm, pattern="^back_bit_meeting$"),
        ],
    },
    fallbacks=[],
    per_message=False
)