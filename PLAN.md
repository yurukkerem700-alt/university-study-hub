# Niksar Futbol Yayın: Proje Planı

> Bu dosya projenin tek kaynak planıdır. Yeni oturumda depoya `PLAN.md` olarak eklenir ve geliştirme buna göre yürür.
> Durum: planlama tamamlandı, kodlama başlamadı. Depo: özel (private) `niksar-futbol-yayin`.

---

## 0. Yeni oturum için talimat (Claude'a)

Bu dosyayı oku, sonra sırayla şunları yap:
1. `docs/ARCHITECTURE.md`, `docs/INCIDENT-RUNBOOK.md`, `docs/MATCH-DAY-CHECKLIST.md` dosyalarını bu plandan türet.
2. Next.js + TypeScript + Tailwind iskeletini kur, CI (lint, typecheck, test) ekle.
3. Supabase şemasını olay kaynaklı modelle (bölüm 9) yaz, RLS kurallarını ekle.
4. Faz 1'e (bölüm 11) başla.

Kurallar:
- Gizli bilgiler (API anahtarı, akış anahtarı, veritabanı şifresi) hiçbir zaman koda yazılmaz. `.env` kullanılır ve `.env` git'e girmez, yalnızca `.env.example` eklenir.
- Her şey Türkçe arayüzlüdür, ama kod ve commit mesajları tutarlı tek dilde yazılır.
- Hiçbir şekilde bahis/iddaa/oran içeriği eklenmez.

---

## 1. Proje özeti

Niksar'da düzenlenen amatör futbol turnuvalarını:
- **canlı yayınlamak** (ücretsiz platformlar üzerinden, ağırlıklı YouTube),
- **profesyonel yayın görüntüsüyle** sunmak (skor, süre, gol/kart/değişiklik animasyonları),
- **tüm turnuva verisini** tek sitede toplamak (puan durumu, gol krallığı, kartlar, oynama süreleri, kadrolar, fikstür, arşiv).

Ekip sorumluluğu:
- **Bizim işimiz:** yayın yazılımı (OBS düzeni, grafikler), web sitesi, veri girişi, yedekleme, izleme.
- **Bizim işimiz değil:** kamera, çekim, saha ekipmanı. Çekim ekibi bize görüntüyü verir.

Mevcut ekipman: bir laptop ve bir telefon. Yedek ve donanım planı bölüm 6'dadır.

Ölçek hedefi: **40–50 bin izlenme.** Bu yüzden çökmeye ve hatalara karşı her katmanda yedek planı vardır.

Temel prensip: **video sunucusu kurmuyoruz.** Video yükünü YouTube taşır. Biz yalnızca küçük veriyi (skor, olaylar, istatistik) taşıyoruz.

---

## 2. Önce hukuki ve organizasyonel işler (kodlamadan önce)

1. **Yayın izni:** turnuva organizatörü ve ilçe federasyonuyla yazılı anlaşma (yayın hakkı, arşiv, sponsor).
2. **KVKK ve rıza:** oyuncu kaydında görüntü/isim/fotoğraf için açık rıza metni. **18 yaş altı oyuncular için veli onayı şart.**
3. **Bahis yasağı:** bahis/iddaa reklamı, oran, tahmin yarışması yok. Sponsor sözleşmesine de yazılır.
4. **Müzik ve telif:** ticari müzik yok. Gol müziği, jenerik ve arka plan için telifsiz kütüphane (YouTube Audio Library, Pixabay vb.).
5. **Kişisel veri:** TC, telefon, adres herkese açık gösterilmez. Sadece ad, forma no, mevki, fotoğraf (rıza varsa).
6. **Saha duyurusu:** "Maç canlı yayınlanmaktadır" tabelası.
7. **Çekim ekibine şartlar:** görüntü HDMI/USB/NDI ile verilecek, 720p30 minimum, ses için ayrı kanal. (Çekim bize ait değil ama arayüz şartları bizden.)

---

## 3. YouTube riskleri ve önlemler

| Risk | Önlem |
|---|---|
| İlk canlı yayın için bekleme süresi (yaklaşık 24 saat) | Kanalı turnuvadan **en az 2 hafta önce** doğrula (telefon), test yayını yap |
| Telif / Content ID | Yalnızca telifsiz müzik; saha hoparlörü mikrofona girmesin |
| Kanal strike / kapanma | **Yedek kanal** + oynatıcıda sağlayıcı değiştirme (YouTube, Facebook, Twitch, Kick) |
| "Çocuklara özel" yanlış işaretleme | Yayında "Çocuklara özel değil" seçilir |
| Yayın kopması | Yedek internet (4G/5G), OBS otomatik yeniden bağlanma |
| Gecikme (3–15 sn) | Düşük gecikme modu, site olay akışına gecikme ayarı (bölüm 8) |
| Yorum spam/hakaret | Yorumlar kapalı veya filtre + moderatör |
| API kotası | Günlük 10.000 birim yeterli (maç başına yayın oluşturma ucuz) |

Kural: **YouTube dağıtım kanalıdır, evimiz değil.** Site, video sağlayıcısı değiştirilebilecek şekilde yazılır.

Çoklu platform yayını:
- **Restream (ücretsiz plan):** kolay, 2 hedef, başlangıç için iyi.
- **OBS + Aitum Multistream eklentisi:** ücretsiz, sınırsız hedef; upload hızı hedef sayısıyla çarpılır.
- Instagram / TikTok canlı yayın şartları (takipçi eşiği, stream key erişimi) sürekli değişir. **Kurulumdan önce güncel şartlar doğrulanır.** Başlangıç: YouTube + Facebook.

---

## 4. Yayın mimarisi

```
Saha kamerası (çekim ekibi)
        │ HDMI/USB/NDI
        ▼
  OBS Studio (laptop) ◄── Browser Source: sitemizin /overlay/[maçId] sayfası
        │
        ├──► YouTube Live ──► sitede gömülü oynatıcı
        ├──► Facebook Live
        ├──► Instagram / TikTok (şartlar uygunsa)
        └──► Yedek: Twitch / Kick
```

---

## 5. 40–50 bin izleyici için ölçek mimarisi

| Konu | Karar |
|---|---|
| Video | YouTube taşır. 50 bin izleyici bizim için sorun değil |
| Halka açık canlı veri | **WebSocket yok.** Site her 5–10 sn'de CDN'den küçük bir `match-state.json` okur. Cloudflare önbelleğinden gelir, veritabanına istek gitmez |
| Realtime (Supabase) | Yalnızca operatör paneli ve OBS overlay (az sayıda bağlantı). Ücretsiz katmanda eşzamanlı bağlantı sınırı düşüktür, izleyicilere dağıtılmaz |
| Hosting | **Cloudflare Pages + Workers** (Vercel Hobby ticari kullanıma uygun değil ve bant limiti dar) |
| Sayfalar | Statik üretim + önbellek (puan durumu, takım/oyuncu sayfaları) |
| Yedek sayfa | Site çökerse izleyiciyi YouTube linkine yönlendiren statik yedek sayfa |
| Koruma | Cloudflare DDoS, oran sınırlama, bot filtresi |
| Yük testi | Turnuvadan önce `k6` ile statik JSON ve sayfa uçlarına yapay yük |
| İzleme | Sentry (hata), UptimeRobot (erişilebilirlik), maç günü kontrol listesi |
| Veritabanı | Yazma yalnızca operatörden gelir. Okuma önbellekten. Gerekirse ücretli Supabase katmanına geçiş (maliyet düşük) |

### Arıza senaryoları

| Arıza | Hazırlık |
|---|---|
| Site yavaşladı / çöktü | Yayın YouTube'da devam eder, yedek sayfa ve doğrudan YouTube linki |
| Veritabanı düştü | Operatör yerel durumdan devam eder, olaylar kuyruğa alınır, bağlantı gelince gönderilir |
| YouTube kanalı sorunu | Yedek kanal, oynatıcıda sağlayıcı değiştirme |
| Yayın bilgisayarı kilitlendi | İkinci OBS makinesi (telefon/laptop) hazırda |
| İnternet koptu | Yedek 4G/5G hat, OBS otomatik yeniden bağlanma |
| Operatör hatası | Son olayı geri al, tüm değişiklikler denetim kaydında |
| Saldırı / bot yoğunluğu | Cloudflare DDoS ve oran sınırlama |
| Deploy hatası | Cloudflare önceki sürüme tek tıkla geri dönüş; maç günü deploy yasağı |

---

## 6. Donanım ve internet (bizim sorumlu olduğumuz kısım)

| Ekipman | Plan |
|---|---|
| Yayın bilgisayarı | Mevcut laptop (i5/Ryzen 5 ve üstü önerilir), OBS bu cihazda |
| Yedek | Telefon: Larix Broadcaster veya Streamlabs ile acil yayın. İkinci OBS için ek laptop/mini PC önerilir |
| Yükleme hızı | Saha başına en az 8–10 Mbps upload, tercihen sabit hat + yedek 4G/5G modem |
| Kalite | 720p30, 2.5–4 Mbps (amatör için yeterli) |
| Güç | Laptop şarjı, powerbank/UPS |
| Eşzamanlı sahalar | Her saha için ayrı OBS makinesi ve ayrı YouTube yayını |

---

## 7. Teknoloji yığını

| Katman | Seçim |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind (PWA) |
| Hosting | Cloudflare Pages + Workers, CDN ve DNS Cloudflare |
| Veritabanı | Supabase (Postgres, Auth, Storage, Realtime) |
| Video | YouTube IFrame API (sağlayıcı soyutlamalı) |
| Yayın | OBS Studio, Browser Source overlay |
| Depolama | Supabase Storage / Cloudflare R2 (logo, fotoğraf) |
| İzleme | Sentry, UptimeRobot, Plausible/GA4 |
| Test | Vitest/Jest, Playwright (E2E), k6 (yük) |
| CI/CD | GitHub Actions (lint, typecheck, test, deploy) |

---

## 8. Maç operatörü paneli ve overlay

### Operatör paneli (telefon/tablet)
- Maçı başlat / duraklat / devre arası / ikinci yarı / bitir (**sunucu saati tabanlı** süre)
- Gol (golü atan, asist, dakika), kendi kalesine gol, penaltı
- Sarı/kırmızı kart
- Oyuncu değişikliği (giren/çıkan)
- Uzatma dakikası, penaltı atışları
- Son olayı geri al, olay düzenle
- **Çevrimdışı dayanıklılık:** internet kopsa da olaylar cihazda kuyruğa alınıp bağlantı gelince gönderilir

**Olay kaynaklı model (event sourcing):** skor ve istatistik tek tek saklanmaz, yalnızca olaylar saklanır; her şey olaylardan hesaplanır. Hatalı giriş düzeltilince tüm istatistik otomatik güncellenir.

### Overlay (OBS Browser Source)
- `/overlay/[maçId]` şeffaf arka planlı sayfa
- Skor tabelası, süre, devre, takım logoları
- Gol animasyonu ("GOL! Oyuncu, dk."), kart ve oyuncu değişikliği animasyonu
- Maç başı kadro ekranı, devre arası puan durumu ve sponsor ekranı
- Veri Supabase Realtime ile gelir. Grafik yayının içine gömülü olduğu için gecikme sorunu yok

### Site tarafı senkronu
YouTube gecikmesi nedeniyle site olay akışı videodan önce giderse spoiler olur. Çözüm: **ayarlanabilir yayın gecikmesi** (ör. 8 sn). Site olay akışı bu kadar ertelenir.

---

## 9. İçerik haritası ve veri modeli

### Herkese açık
- Ana sayfa: canlı maçlar, sonraki maçlar, son sonuçlar
- **Maç merkezi:** canlı yayın, skor, olay zaman çizelgesi, kadro, istatistik, tekrar videosu
- Fikstür ve sonuçlar (hafta/takım/saha filtreleri)
- Puan durumu (averaj, eşitlik bozma kuralları)
- **İstatistikler:** gol krallığı, asist, gol+asist, en çok sarı/kırmızı, **oynanan toplam süre**, dakika başına gol, temiz kale, fair-play
- Takım ve oyuncu profilleri
- Haftanın kadrosu, MVP oylaması
- Cezalılar (kart durumu, sınırdaki oyuncular)
- Hakem sayfası ve istatistikleri
- Saha bilgisi ve harita
- Haberler, duyurular, galeri, özet videolar, arşiv
- Sponsorlar, kurallar/regülasyon, iletişim

### Yönetim paneli (rol bazlı)
Roller: yönetici, fikstür editörü, operatör, hakem (rapor), editör (haber).
- Takım ve oyuncu kaydı, fikstür üretici (lig, eleme, grup+eleme)
- Disiplin kayıtları, cezalar

### Teknik özellikler
Mobil öncelikli, PWA, web push (gol, maç başlıyor), sosyal paylaşım kartları, SEO, karanlık mod, erişilebilirlik.

### Veri modeli (özet)
`seasons, tournaments, teams, players, player_registrations, venues, referees, matches, lineups, match_events (goal/assist/yellow/red/sub_in/sub_out/pen...), match_clock_states, broadcasts (platform, url, durum), news, users/roles, audit_log`
- İstatistikler SQL view / materialized view ile hesaplanır.
- **Oynama süresi:** kadro başlangıcı + giren/çıkan olayları + kırmızı kart + maç süresi.
- Satır bazlı güvenlik (RLS): okuma herkese açık, yazma yalnızca yetkili roller.

---

## 10. Güvenlik

### Depo
- Depo **private**. `main` dalına doğrudan push kapalı (branch protection).
- GitHub hesabında **2FA** zorunlu. Collaborators listesi boş, yalnızca davet edilenler erişir.
- **Secret scanning** ve **Push protection** açık.

### Uygulama
- Gizli bilgiler yalnızca ortam değişkenlerinde (Cloudflare/Supabase paneli); `.env` git'e girmez.
- Supabase RLS: anonim kullanıcı yalnızca okur; yazma yetkisi rol bazlı.
- Operatör ve yönetim girişi için güçlü şifre + 2FA.
- Akış anahtarı (stream key) paylaşılmaz, yalnızca yayın sorumlusunda.
- Girdi doğrulama (zod), oran sınırlama, CSRF/XSS koruması, güvenlik başlıkları (CSP).
- Denetim kaydı (`audit_log`): kim neyi ne zaman değiştirdi.
- Yedekleme: veritabanı düzenli dışa aktarma (günlük), geri dönüş testi turnuvadan önce.

---

## 11. Yol haritası

| Faz | Süre | Çıktı |
|---|---|---|
| **0. Hazırlık** | 1–2 hafta | İzinler, YouTube kanalı doğrulama, yedek kanal, alan adı, marka kimliği, hat testi |
| **1. Çekirdek (MVP)** | 3–4 hafta | Takım/oyuncu/fikstür, operatör paneli, olay motoru, puan durumu, maç merkezi, YouTube embed, temel istatistikler |
| **2. Yayın grafikleri** | 2 hafta | OBS overlay: skor/süre, gol/kart/değişiklik animasyonları, kadro ve devre arası ekranları |
| **3. Ölçek ve dayanıklılık** | 1–2 hafta | CDN `match-state.json`, yedek sayfa, çevrimdışı kuyruk, k6 yük testi, Sentry/UptimeRobot |
| **4. Zenginleştirme** | 2–3 hafta | Oynama süresi, profiller, MVP, cezalılar, haberler, galeri, push, otomatik YouTube yayın oluşturma |
| **5. Çoklu platform + pilot** | 1–2 hafta | Facebook/Instagram eşzamanlı yayın, deneme maçı, hata düzeltme |
| **6. Canlı ve izleme** | Sürekli | Sezon boyunca bakım, arşiv, raporlar |

Maç günü deploy yasağı: turnuva günlerinde canlıya yeni sürüm çıkılmaz.

---

## 12. Yapılacaklar / yapılmayacaklar

**Yap**
- Kanalı 2+ hafta önce doğrula, deneme maçı yayınla
- Her maçtan önce kontrol listesi uygula (internet, pil, ses, overlay, akış anahtarı)
- Yedek: ikinci operatör, ikinci internet, ikinci akış anahtarı, yedek kanal
- Telifsiz müzik, yazılı yayın izni, veli onayı
- Yayın başlıklarını standartlaştır: `Takım A - Takım B | Hafta 5 | Turnuva Adı`
- Maçları otomatik arşivle
- Operatöre kısa eğitim ver, "geri al" özelliği olsun

**Yapma**
- Bahis/oran/iddaa içeriği koyma
- Ticari müzik kullanma
- Tek kanala, tek platforma, tek kişiye bağımlı kalma
- Akış anahtarını ve gizli bilgileri paylaşma ya da koda yazma
- İlk canlı yayını turnuva gününe bırakma
- Kişisel veriyi (TC, telefon, adres) herkese açık gösterme
- İzleyicilere WebSocket açma (ölçek mimarisi bölüm 5)
- Maç günü deploy etme
- İlk günden her şeyi (animasyon, push, oylama) birlikte yapmaya çalışma

---

## 13. Maliyet tahmini

| Kalem | Maliyet |
|---|---|
| Alan adı | ~10 $/yıl |
| Cloudflare, Supabase, YouTube, OBS, GitHub | Ücretsiz katman |
| Yedek 4G/5G veri | Operatör tarifesine bağlı |
| Yedek donanım | İsteğe bağlı (ikinci laptop/mini PC) |

Trafik büyürse ilk darboğaz Supabase ücretsiz limitleri olabilir. Önceden izlenir, ücretli katman geçişi planlıdır.

---

## 14. Açık sorular (başlamadan netleşmeli)

1. Turnuvada kaç takım ve kaç saha var? Aynı anda kaç maç oynanıyor?
2. Turnuva başlangıç tarihi ve MVP için gerçekçi tarih?
3. Maçta operatör ve OBS'yi ayrı kişiler mi yönetecek?
4. Yorumcu / canlı anlatım olacak mı?
5. Sponsor ve reklam geliri planlanıyor mu?
6. Oyuncuların yaş aralığı (18 yaş altı var mı)?
7. Marka adı ve logo hazır mı, yoksa tasarımı da biz mi yapacağız?
8. Çekim ekibinden görüntü hangi arayüzle gelecek (HDMI, USB, NDI)?
9. Alan adı (ör. `niksarfutbol.com`) seçildi mi?
