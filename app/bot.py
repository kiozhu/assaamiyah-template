"""Bot Telegram: menu template + 3 mode input (Upload Excel / Isi via chat / Google Sheet)."""
import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    Message, CallbackQuery, FSInputFile,
    InlineKeyboardMarkup, InlineKeyboardButton,
)

from . import config, sources, generator

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("sertifikat-bot")

dp = Dispatcher(storage=MemoryStorage())


# ---------------- FSM states ----------------
class Flow(StatesGroup):
    waiting_excel = State()
    chat_fill = State()
    chat_more = State()


# ---------------- helper UI ----------------
def allowed(uid: int) -> bool:
    return uid in config.ALLOWED_IDS


def menu_templates() -> InlineKeyboardMarkup:
    rows = []
    for key, t in config.TEMPLATES.items():
        label = t["label"] + ("" if t["enabled"] else " (segera)")
        rows.append([InlineKeyboardButton(text=label, callback_data=f"tpl:{key}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def menu_input(tpl_key: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📥 Upload Excel", callback_data=f"in:excel:{tpl_key}")],
        [InlineKeyboardButton(text="✍️ Isi via chat", callback_data=f"in:chat:{tpl_key}")],
        [InlineKeyboardButton(text="📊 Google Sheet", callback_data=f"in:gsheet:{tpl_key}")],
        [InlineKeyboardButton(text="« Kembali", callback_data="home")],
    ])


def menu_confirm() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Generate", callback_data="go"),
        InlineKeyboardButton(text="✖️ Batal", callback_data="home"),
    ]])


# ---------------- handlers ----------------
@dp.message(Command("start"))
async def cmd_start(m: Message, state: FSMContext):
    if not allowed(m.from_user.id):
        return await m.answer(f"⛔ Akses ditolak. ID kamu: {m.from_user.id}\n"
                              f"Minta admin menambahkan ID ini ke ALLOWED_IDS.")
    await state.clear()
    await m.answer("👋 *Generator Sertifikat*\nPilih jenis dokumen:",
                   parse_mode="Markdown", reply_markup=menu_templates())


@dp.callback_query(F.data == "home")
async def cb_home(c: CallbackQuery, state: FSMContext):
    await state.clear()
    await c.message.edit_text("Pilih jenis dokumen:", reply_markup=menu_templates())
    await c.answer()


@dp.callback_query(F.data.startswith("tpl:"))
async def cb_template(c: CallbackQuery, state: FSMContext):
    key = c.data.split(":", 1)[1]
    tpl = config.TEMPLATES.get(key)
    if not tpl or not tpl["enabled"]:
        return await c.answer("Template ini belum aktif.", show_alert=True)
    await state.update_data(tpl=key)
    await c.message.edit_text(f"{tpl['label']} — pilih cara input data:",
                              reply_markup=menu_input(key))
    await c.answer()


# ---- mode: Upload Excel ----
@dp.callback_query(F.data.startswith("in:excel:"))
async def cb_excel(c: CallbackQuery, state: FSMContext):
    key = c.data.split(":")[2]
    await state.update_data(tpl=key)
    await state.set_state(Flow.waiting_excel)
    await c.message.edit_text("📥 Kirim file *Excel* (.xlsx) berisi data.\n"
                              "Header kolom harus sesuai format.",
                              parse_mode="Markdown")
    await c.answer()


@dp.message(Flow.waiting_excel, F.document)
async def on_excel(m: Message, state: FSMContext, bot: Bot):
    data = await state.get_data()
    tpl = config.TEMPLATES[data["tpl"]]
    fname = m.document.file_name or "data.xlsx"
    if not fname.lower().endswith((".xlsx", ".xlsm")):
        return await m.answer("File harus .xlsx")
    dest = config.WORK_DIR / f"upload_{m.from_user.id}.xlsx"
    await bot.download(m.document, destination=dest)
    try:
        rows = sources.read_excel(str(dest), tpl.get("sheet"))
    except Exception as e:
        return await m.answer(f"Gagal baca Excel: {e}")
    ok, msg = sources.validate_rows(rows, config.field_keys(tpl))
    if not ok:
        return await m.answer(f"⚠️ {msg}")
    await state.update_data(rows=rows)
    await m.answer(f"✅ {msg}\nGenerate {len(rows)} dokumen sekarang?",
                   reply_markup=menu_confirm())


# ---- mode: Isi via chat ----
@dp.callback_query(F.data.startswith("in:chat:"))
async def cb_chat(c: CallbackQuery, state: FSMContext):
    key = c.data.split(":")[2]
    tpl = config.TEMPLATES[key]
    ask_fields = [f for f in tpl["fields"] if f.get("ask")]
    await state.update_data(tpl=key, ask=ask_fields, idx=0, cur={}, rows=[])
    await state.set_state(Flow.chat_fill)
    await c.message.edit_text("✍️ Isi data lewat chat. Ketik /batal untuk berhenti.")
    await c.message.answer(f"1/{len(ask_fields)} — {ask_fields[0]['label']}:")
    await c.answer()


@dp.message(Command("batal"))
async def cmd_cancel(m: Message, state: FSMContext):
    await state.clear()
    await m.answer("Dibatalkan.", reply_markup=menu_templates())


@dp.message(Flow.chat_fill)
async def on_chat_value(m: Message, state: FSMContext):
    data = await state.get_data()
    ask, idx, cur = data["ask"], data["idx"], data["cur"]
    cur[ask[idx]["key"]] = m.text.strip()
    idx += 1
    if idx < len(ask):
        await state.update_data(idx=idx, cur=cur)
        return await m.answer(f"{idx+1}/{len(ask)} — {ask[idx]['label']}:")
    # satu santri selesai
    rows = data["rows"] + [cur]
    await state.update_data(rows=rows, cur={}, idx=0)
    await state.set_state(Flow.chat_more)
    await m.answer(f"✅ Tersimpan ({len(rows)} santri). Tambah santri lagi?",
                   reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                       InlineKeyboardButton(text="➕ Tambah", callback_data="more:yes"),
                       InlineKeyboardButton(text="✅ Selesai & Generate", callback_data="go"),
                   ]]))


@dp.callback_query(F.data == "more:yes")
async def cb_more(c: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    ask = data["ask"]
    await state.set_state(Flow.chat_fill)
    await state.update_data(idx=0, cur={})
    await c.message.answer(f"1/{len(ask)} — {ask[0]['label']}:")
    await c.answer()


# ---- mode: Google Sheet ----
@dp.callback_query(F.data.startswith("in:gsheet:"))
async def cb_gsheet(c: CallbackQuery, state: FSMContext):
    key = c.data.split(":")[2]
    tpl = config.TEMPLATES[key]
    if not (config.GSHEET_ID and config.GOOGLE_CREDENTIALS):
        return await c.answer("Google Sheet belum dikonfigurasi (GSHEET_ID/GOOGLE_CREDENTIALS).",
                              show_alert=True)
    await c.answer("Mengambil data dari Google Sheet…")
    try:
        rows = sources.read_gsheet(config.GSHEET_ID, config.GOOGLE_CREDENTIALS, tpl.get("sheet"))
    except Exception as e:
        return await c.message.edit_text(f"Gagal baca Google Sheet: {e}")
    ok, msg = sources.validate_rows(rows, config.field_keys(tpl))
    if not ok:
        return await c.message.edit_text(f"⚠️ {msg}")
    await state.update_data(tpl=key, rows=rows)
    await c.message.edit_text(f"✅ {msg}\nGenerate {len(rows)} dokumen?",
                              reply_markup=menu_confirm())


# ---- generate ----
@dp.callback_query(F.data == "go")
async def cb_go(c: CallbackQuery, state: FSMContext, bot: Bot):
    data = await state.get_data()
    rows = data.get("rows") or []
    key = data.get("tpl")
    if not rows or not key:
        return await c.answer("Tidak ada data.", show_alert=True)
    await c.message.edit_text(f"⏳ Memproses {len(rows)} dokumen…")
    try:
        res = await asyncio.to_thread(generator.generate, key, rows, True, True)
    except Exception as e:
        log.exception("generate failed")
        return await c.message.answer(f"❌ Gagal generate: {e}")
    cap = f"✅ Selesai — {res['count']} dokumen ({config.TEMPLATES[key]['label']})"
    if res["pdf"]:
        await c.message.answer_document(FSInputFile(res["pdf"]), caption=cap + " — PDF")
    if res["zip"]:
        await c.message.answer_document(FSInputFile(res["zip"]), caption="Word (.docx) — zip")
    await state.clear()
    await c.message.answer("Selesai. /start untuk membuat lagi.")
    await c.answer()


async def main():
    if not config.BOT_TOKEN:
        raise SystemExit("BOT_TOKEN belum diisi di .env")
    if not config.ALLOWED_IDS:
        log.warning("ALLOWED_IDS kosong — semua akses akan ditolak.")
    bot = Bot(config.BOT_TOKEN)
    log.info("Bot start. Templates: %s", list(config.TEMPLATES))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
