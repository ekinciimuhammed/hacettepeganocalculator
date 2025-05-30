# 🎓 GANO Calculator – Hacettepe Stili GANO Hesaplama ve Simülasyon Aracı

Bu proje, üniversite öğrencilerinin **transkript PDF’leri üzerinden GANO hesaplaması** yapabilmesini sağlayan, Python ile geliştirilmiş, görsel arayüze sahip bir masaüstü uygulamasıdır.  
Ayrıca kullanıcılar harf notlarını değiştirerek yeni GANO’larını görebilir, hedefledikleri GANO’ya ulaşmak için en etkili değişiklikleri simüle edebilir ve tüm bu süreci PDF olarak raporlayabilir.

---

## 🚀 Öne Çıkan Özellikler

✅ PDF transkriptinden otomatik ders bilgisi çıkarımı  
✅ Harf notlarını GUI üzerinden değiştirme  
✅ Yeni ders ekleme / mevcut dersi silme  
✅ GANO hesaplama ve anlık güncelleme  
✅ 🎯 Hedef GANO simülasyonu (max kaç ders değişebilir + en çok katkı sırasına göre)  
✅ İsteğe bağlı alt sınır filtresi (örneğin sadece C1 ve altı dersleri değiştir)  
✅ 📄 PDF Raporu oluşturma – masaüstüne detaylı çıktı  
✅ tkinter ile sade ve kullanıcı dostu arayüz



## 🧩 Kullanılan Kütüphaneler

Proje, aşağıdaki Python kütüphanelerini kullanır:

- `pandas` – veri çerçevesi işlemleri
- `pdfplumber` – PDF üzerinden metin çıkarımı
- `jinja2` – HTML şablon motoru (PDF raporu için)
- `weasyprint` – HTML'den PDF üretimi
- `tkinter` – GUI oluşturma (Python gömülü)

---

1️⃣ Gerekli Ortamı Hazırla
Python 3.9+ yüklü olduğundan emin ol.
Terminalde şu komutla kontrol edebilirsin:

----------------------------------
python --version
----------------------------------

2️⃣ Bu Repoyu Klonla
----------------------------------
git clone https://github.com/ekinciimuhammed/hacettepegano.git
cd hacettepegano
----------------------------------

3️⃣ Gerekli Python Kütüphanelerini Yükle
----------------------------------
pip install -r requirements.txt
----------------------------------
NOT:
❗ Not:
Eğer weasyprint yüklenmezse veya hata verirse:
macOS/Linux için genelde direkt çalışır
Windows'ta GTK kütüphanesi gerekebilir → bunun için alternatif PDF çıktısı da eklenebilir



