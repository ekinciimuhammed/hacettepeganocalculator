import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
from tkinter.ttk import Treeview
import pandas as pd
import pdfplumber
import re
from jinja2 import Template
from weasyprint import HTML
from datetime import datetime
import os

# PDF'ten veri çekme
def parse_transkript_from_pdf(pdf_path: str) -> pd.DataFrame:
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            full_text += page.extract_text() + "\n"

    pattern = re.compile(
        r'([A-ZÇĞİÖŞÜ]{2,}\d{3})\s+(.+?)\s+\d+\s+(\d+(?:,\d+)?)\s+[\d,]+\s+([A-Z]\d)',
        re.UNICODE
    )
    matches = pattern.findall(full_text)
    cleaned = [(kod.strip(), ders.strip(), float(akts.replace(",", ".")), notu) for kod, ders, akts, notu in matches]
    df = pd.DataFrame(cleaned, columns=["Ders Kodu", "Ders Adı", "AKTS", "Harf Notu"])
    df["Katsayı"] = df["Harf Notu"].map(harf_to_katsayi)
    df["Katkı"] = df["AKTS"] * df["Katsayı"]
    return df

harf_to_katsayi = {
    "A1": 4.00, "A2": 3.75, "A3": 3.50,
    "B1": 3.25, "B2": 3.00, "B3": 2.75,
    "C1": 2.50, "C2": 2.25, "C3": 2.00,
    "D":  1.75,
    "F3": 0.00, "F4": 0.00, "F6": 0.00,
    "F1": 0.00, "F2": 0.00,
    "G":  0.00, "K": 0.00, "M": 0.00
}

class GANOApp:
    def __init__(self, master):
        self.master = master
        self.master.title("📘 GANO Hesaplayıcı")
        self.df = pd.DataFrame(columns=["Ders Kodu", "Ders Adı", "AKTS", "Harf Notu", "Katsayı", "Katkı"])

        self.upload_btn = tk.Button(master, text="📂 PDF Yükle", command=self.load_pdf)
        self.upload_btn.pack()

        self.tree = Treeview(master, columns=("kod", "ad", "akts", "not"), show="headings")
        for col in self.tree["columns"]:
            self.tree.heading(col, text=col)
        self.tree.pack(fill=tk.BOTH, expand=True)

        self.modify_btn = tk.Button(master, text="✏️ Notu Değiştir", command=self.modify_grade)
        self.modify_btn.pack(pady=5)

        self.add_course_btn = tk.Button(master, text="📚 Yeni Ders Ekle", command=self.add_course)
        self.add_course_btn.pack(pady=5)

        self.calc_btn = tk.Button(master, text="📊 GANO Hesapla", command=self.calculate_gano)
        self.calc_btn.pack(pady=5)
        self.delete_btn = tk.Button(master, text="🗑️ Ders Sil", command=self.delete_course)
        self.delete_btn.pack(pady=5)
        self.optimize_btn = tk.Button(master, text="🎯 Hedef GANO Simülasyonu", command=self.optimize_to_target)
        self.optimize_btn.pack(pady=5)



    def load_pdf(self):
        path = filedialog.askopenfilename(filetypes=[("PDF dosyaları", "*.pdf")])
        if not path:
            return
        try:
            self.df = parse_transkript_from_pdf(path)
            self.refresh_table()
        except Exception as e:
            messagebox.showerror("Hata", str(e))

    def refresh_table(self):
        self.tree.delete(*self.tree.get_children())
        for _, row in self.df.iterrows():
            self.tree.insert("", "end", values=(row["Ders Kodu"], row["Ders Adı"], row["AKTS"], row["Harf Notu"]))

    def modify_grade(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("⚠️ Uyarı", "Lütfen bir ders seçin.")
            return

        index = self.tree.index(selected[0])
        current_row = self.df.iloc[index]
        yeni_not = simpledialog.askstring("📝 Yeni Harf Notu", f"{current_row['Ders Kodu']} için yeni harf notunu gir:")
        if not yeni_not:
            return
        yeni_not = yeni_not.upper().strip()
        if yeni_not not in harf_to_katsayi:
            messagebox.showerror("❌ Hata", "Geçersiz harf notu.")
            return

        self.df.at[index, "Harf Notu"] = yeni_not
        self.df.at[index, "Katsayı"] = harf_to_katsayi[yeni_not]
        self.df.at[index, "Katkı"] = self.df.at[index, "AKTS"] * harf_to_katsayi[yeni_not]
        self.refresh_table()

    def add_course(self):
        kod = simpledialog.askstring("🆕 Ders Kodu", "Ders kodunu gir (örnek: BBM105):")
        ad = simpledialog.askstring("📘 Ders Adı", "Dersin adını gir:")
        try:
            akts = float(simpledialog.askstring("🔢 AKTS", "AKTS değerini gir:"))
        except:
            messagebox.showerror("❌ Hata", "AKTS sayısal olmalı.")
            return
        notu = simpledialog.askstring("🅰️ Harf Notu", "Harf notunu gir (örnek: A1):").upper().strip()

        if not kod or not ad or notu not in harf_to_katsayi:
            messagebox.showerror("❌ Hata", "Eksik ya da geçersiz bilgi.")
            return

        katsayi = harf_to_katsayi[notu]
        katkı = akts * katsayi
        yeni_satir = pd.DataFrame([{
            "Ders Kodu": kod, "Ders Adı": ad, "AKTS": akts,
            "Harf Notu": notu, "Katsayı": katsayi, "Katkı": katkı
        }])
        self.df = pd.concat([self.df, yeni_satir], ignore_index=True)
        self.refresh_table()

    def calculate_gano(self):
        if self.df.empty:
            messagebox.showwarning("Uyarı", "Veri yok.")
            return
        toplam_kredi = self.df["AKTS"].sum()
        toplam_katki = self.df["Katkı"].sum()
        gano = round(toplam_katki / toplam_kredi, 2)
        messagebox.showinfo("📈 GANO", f"GANO: {gano}")

    def delete_course(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("⚠️ Uyarı", "Lütfen silmek istediğin dersi seç.")
            return

        index = self.tree.index(selected[0])
        row = self.df.iloc[index]

        onay = messagebox.askyesno("⚠️ Emin misin?", f"{row['Ders Kodu']} - {row['Ders Adı']} silinsin mi?")
        if onay:
            self.df.drop(self.df.index[index], inplace=True)
            self.df.reset_index(drop=True, inplace=True)
            self.refresh_table()
   
    def optimize_to_target(self):
        if self.df.empty:
            messagebox.showwarning("Uyarı", "Önce PDF yükle ya da ders ekle.")
            return

        try:
            hedef_gano_girdi = simpledialog.askstring(
                title="🎯 Hedef GANO",
                prompt="Hedef GANO değerini gir (örnek: 3.00):"
            )
            if not hedef_gano_girdi:
                raise ValueError("Boş giriş")
            hedef_gano = float(hedef_gano_girdi.strip().replace(",", "."))

            max_degisim_girdi = simpledialog.askstring(
                title="🔢 Değiştirilecek Ders Sayısı",
                prompt="Maksimum kaç dersin notu değişebilir?"
            )
            if not max_degisim_girdi:
                raise ValueError("Boş giriş")
            max_degisim = int(max_degisim_girdi.strip())

            alt_sinif_girdi = simpledialog.askstring(
                title="📉 Alt Not Sınırı (İsteğe Bağlı)",
                prompt="Sadece belirli notların altına bakılsın mı? (örn: C1) — boş bırakabilirsin:"
            )
            alt_sinif = alt_sinif_girdi.strip().upper() if alt_sinif_girdi else None

            if alt_sinif and alt_sinif not in harf_to_katsayi:
                raise ValueError("Geçersiz harf notu")

        except Exception as e:
            messagebox.showerror("Hata", f"Geçerli giriş yapılmadı.\nDetay: {e}")
            return

        df_sim = self.df.copy()
        toplam_akts = df_sim["AKTS"].sum()
        toplam_katki = df_sim["Katkı"].sum()
        mevcut_gano = toplam_katki / toplam_akts

        if mevcut_gano >= hedef_gano:
            messagebox.showinfo("✅ Zaten Yeterli", f"Mevcut GANO zaten {round(mevcut_gano,2)}")
            return

        # 🔍 Uygun dersleri filtrele (isteğe bağlı sınır)
        if alt_sinif:
            katsayi_siniri = harf_to_katsayi[alt_sinif]
            df_uygun = df_sim[df_sim["Katsayı"] <= katsayi_siniri].copy()
        else:
            df_uygun = df_sim[df_sim["Katsayı"] < 4.0].copy()

        # 📈 Kazanç hesabı
        df_uygun["Kazanç"] = df_uygun["AKTS"] * (4.00 - df_uygun["Katsayı"])

        # 📊 En çok katkıdan en aza sırala
        df_uygun = df_uygun.sort_values(by="Kazanç", ascending=False).reset_index(drop=True)

        degisim_sayisi = 0
        degisenler = []

        for _, row in df_uygun.iterrows():
            if degisim_sayisi >= max_degisim:
                break

            katkı_artisi = (4.00 - row["Katsayı"]) * row["AKTS"]
            toplam_katki += katkı_artisi
            degisenler.append((row["Ders Kodu"], row["Ders Adı"], row["Harf Notu"], "A1", round(katkı_artisi, 2)))
            degisim_sayisi += 1

            yeni_gano = toplam_katki / toplam_akts
            if yeni_gano >= hedef_gano:
                break

        final_gano = round(toplam_katki / toplam_akts, 2)

        if degisenler:
            sinir_metni = f"(alt sınır: {alt_sinif})" if alt_sinif else "(tüm uygun dersler)"
            sonuc = "\n".join([f"{k} ({a}): {e} → {y} | Kazanç: +{katki}" for k, a, e, y, katki in degisenler])
            messagebox.showinfo("🎯 Simülasyon Sonucu",
                f"📌 A1 yapılabilecek dersler {sinir_metni}:\n\n{sonuc}\n\n📈 Yeni GANO (simülasyon): {final_gano}")
        else:
            messagebox.showwarning("⚠️ Ulaşılamaz", "Bu sınırlamalarla hedef GANO'ya ulaşılamıyor.")

# Uygulama başlat
root = tk.Tk()
app = GANOApp(root)
root.geometry("850x550")
root.mainloop()
