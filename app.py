from flask import Flask, render_template, request, jsonify
import pandas as pd
import pdfplumber
import re
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Klasör yoksa oluştur
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

# Harf notu katsayıları
HARF_TO_KATSAYI = {
    "A1": 4.00, "A2": 3.75, "A3": 3.50,
    "B1": 3.25, "B2": 3.00, "B3": 2.75,
    "C1": 2.50, "C2": 2.25, "C3": 2.00,
    "D":  1.75,
    "F3": 0.00, "F4": 0.00, "F6": 0.00,
    "F1": 0.00, "F2": 0.00,
    "G":  0.00, "K": 0.00, "M": 0.00
}

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
    df["Katsayı"] = df["Harf Notu"].map(HARF_TO_KATSAYI)
    df["Katkı"] = df["AKTS"] * df["Katsayı"]
    return df

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'pdf' not in request.files:
        return jsonify({'error': 'PDF dosyası bulunamadı'}), 400
    
    file = request.files['pdf']
    if file.filename == '':
        return jsonify({'error': 'Dosya seçilmedi'}), 400
    
    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            df = parse_transkript_from_pdf(filepath)
            os.remove(filepath)  # Dosyayı işledikten sonra sil
            
            # GANO hesapla
            toplam_kredi = df["AKTS"].sum()
            toplam_katki = df["Katkı"].sum()
            gano = round(toplam_katki / toplam_kredi, 2)
            
            return jsonify({
                'success': True,
                'dersler': df.to_dict('records'),
                'gano': gano
            })
            
        except Exception as e:
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': str(e)}), 500

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.json
        df = pd.DataFrame(data['dersler'])
        
        if df.empty:
            return jsonify({'error': 'Ders verisi bulunamadı'}), 400
        
        df["Katsayı"] = df["Harf Notu"].map(HARF_TO_KATSAYI)
        df["Katkı"] = df["AKTS"] * df["Katsayı"]
        
        toplam_kredi = df["AKTS"].sum()
        toplam_katki = df["Katkı"].sum()
        gano = round(toplam_katki / toplam_kredi, 2)
        
        return jsonify({
            'success': True,
            'gano': gano,
            'dersler': df.to_dict('records')
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
