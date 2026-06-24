"""Engine: isi template (docxtpl) -> docx -> PDF (LibreOffice) -> gabung PDF + zip docx."""
import os
import shutil
import subprocess
import tempfile
import time
import zipfile
import pathlib

from docxtpl import DocxTemplate
from pypdf import PdfWriter

from . import config


def find_soffice() -> str:
    if config.SOFFICE_BIN:
        return config.SOFFICE_BIN
    for name in ("soffice", "libreoffice"):
        p = shutil.which(name)
        if p:
            return p
    # path umum
    for p in (
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        "/opt/libreoffice/program/soffice",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
    ):
        if os.path.exists(p):
            return p
    raise RuntimeError("LibreOffice (soffice) tidak ditemukan. Install dulu atau set SOFFICE_BIN.")


def render_docx(template_docx: str, ctx: dict, out_docx: str) -> str:
    tpl = DocxTemplate(template_docx)
    # field yang tidak ada di data -> string kosong supaya tidak error
    tpl.render(ctx, autoescape=True)
    tpl.save(out_docx)
    return out_docx


def docx_to_pdf(docx_path: str, out_dir: str) -> str:
    soffice = find_soffice()
    # profil user unik supaya headless aman & bisa jalan paralel
    with tempfile.TemporaryDirectory() as prof:
        env_arg = "-env:UserInstallation=" + pathlib.Path(prof).as_uri()
        cmd = [
            soffice, "--headless", "--norestore", "--nolockcheck", env_arg,
            "--convert-to", "pdf", "--outdir", out_dir, docx_path,
        ]
        subprocess.run(cmd, check=True, timeout=120,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    pdf = os.path.join(out_dir, pathlib.Path(docx_path).stem + ".pdf")
    if not os.path.exists(pdf):
        raise RuntimeError("Konversi PDF gagal: " + docx_path)
    return pdf


def merge_pdfs(pdf_paths: list[str], out_pdf: str) -> str:
    w = PdfWriter()
    for p in pdf_paths:
        w.append(p)
    with open(out_pdf, "wb") as f:
        w.write(f)
    return out_pdf


def _safe(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_ " else "_" for c in str(name)).strip() or "data"


def generate(template_key: str, rows: list[dict], want_pdf=True, want_docx=True) -> dict:
    """Hasilkan output untuk banyak baris.

    Return dict: {'pdf': path|None, 'zip': path|None, 'count': n, 'workdir': dir}
    'zip' berisi semua .docx; 'pdf' berisi gabungan semua halaman.
    """
    tpl = config.TEMPLATES[template_key]
    template_docx = str(config.template_path(tpl))
    keys = config.field_keys(tpl)
    defaults = {f["key"]: f.get("default", "") for f in tpl.get("fields", [])}

    stamp = time.strftime("%Y%m%d-%H%M%S")
    workdir = config.WORK_DIR / f"{template_key}_{stamp}"
    workdir.mkdir(parents=True, exist_ok=True)

    docx_paths, pdf_paths = [], []
    for i, row in enumerate(rows, 1):
        ctx = {k: row.get(k, defaults.get(k, "")) for k in keys}
        label = _safe(row.get("Nama_Lengkap") or row.get("Nama") or f"{i:03d}")
        base = f"{i:03d}_{label}"
        dx = render_docx(template_docx, ctx, str(workdir / f"{base}.docx"))
        docx_paths.append(dx)
        if want_pdf:
            pdf_paths.append(docx_to_pdf(dx, str(workdir)))

    result = {"pdf": None, "zip": None, "count": len(rows), "workdir": str(workdir)}

    if want_pdf and pdf_paths:
        merged = str(workdir / f"{template_key}_{stamp}.pdf")
        merge_pdfs(pdf_paths, merged)
        result["pdf"] = merged

    if want_docx:
        zpath = str(workdir / f"{template_key}_{stamp}_docx.zip")
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
            for d in docx_paths:
                z.write(d, os.path.basename(d))
        result["zip"] = zpath

    return result
