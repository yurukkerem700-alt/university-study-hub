# Notora — University Study Hub

Üniversite öğrencileri için ders notu arama, sınav hazırlığı ve kaynak arşivi.

## Özellikler

- Bölüm, sınıf, konu ve içerik türüne göre filtreleme
- Anlık arama ve Enter ile arama bildirimi
- Popüler/yeni kaynak sıralaması
- Hızlı bölüm etiketleri
- Not önizleme ve indirme etkileşimleri
- Öğrenci/öğretmen modu
- Öğretmen giriş modalı, doğrulama ve Escape/backdrop ile kapatma
- Responsive tasarım ve erişilebilir buton durumları
- Harici bağımlılık veya build adımı gerektirmeyen statik yapı

## Çalıştırma

Proje klasöründe:

```bash
python -m http.server 8000
```

Ardından `http://localhost:8000` adresini açın.

## Proje yapısı

- `index.html` — sayfa semantiği ve içerik
- `styles.css` — responsive görsel tasarım
- `app.js` — filtreleme, arama, sıralama, modal ve buton etkileşimleri

> Bu sürüm mevcut HTML/CSS yapısını korur; işlevsel katman güvenli null kontrolleri, klavye desteği ve daha sağlam olay yönetimiyle güncellenmiştir. Giriş, dosya yükleme ve gerçek indirme için bir backend/API bağlanması gerekir.
