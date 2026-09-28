# Notora — University Study Hub

Notora artık yalnızca bir demo arayüzü değil; Supabase tabanlı üniversite bilgi ve kaynak keşif merkezi olarak çalışır.

## Ana yapı
- Global arama: güvenilir kaynaklar + öğrenci notları + yaklaşan tarihler
- Kaynak güven etiketi: resmî / doğrulanmış dış kaynak / öğrenci
- Kaynağın sahibi, URL'si ve son doğrulama tarihi görünür
- YÖK, ÖSYM, e-Devlet, İŞKUR, TÜBİTAK, MIT OpenCourseWare ve OpenStax gibi doğrulanmış kaynak dizini
- Gerçek Supabase Auth ve kullanıcı hesabı
- Gerçek not yükleme ve indirme
- PDF / DOC / DOCX / PPT / PPTX / TXT desteği
- Öğrenci filtreleme ve sıralama
- ÖSYM/TÜBİTAK takvim kayıtları
- GANO hesaplayıcı, Pomodoro ve günlük görev listesi
- Responsive erişilebilirlik ve "/" ile hızlı arama

## Güven modeli
Notora dış kaynakların içeriğini kendi içeriğiymiş gibi kopyalamaz. Kaynağı, kurumunu ve bağlantısını gösterir. Öğrenci tarafından yüklenen dosyalar ayrı bir kaynak türüdür.

## Supabase
Project: `notbul`
Tablolar: `profiles`, `notes`, `note_likes`, `bookmarks`, `note_ratings`, `knowledge_resources`, `academic_events`
Storage: `note-files`

## Geliştirme yönü
Bir sonraki büyük aşama yönetim panelidir: kaynak doğrulama kuyruğu, bozuk bağlantı taraması, içerik raporları, üniversite/program veri importları ve arama analitiği.
