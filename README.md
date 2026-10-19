# Akademik Yayın ve CV Yönetimi — ilk sürüm

Kişisel, oturum açma zorunlu akademik yayın arşivi. GitHub Pages ön yüz, Supabase Auth + PostgreSQL + private Storage veri katmanıdır.

## Kurulum

1. https://supabase.com adresinden yeni proje oluşturun.
2. **Authentication > Users** bölümünden yalnızca kendinize kullanıcı oluşturun. UUID değerini kopyalayın. E-posta doğrulaması ve şifreyi tamamlayın.
3. **Authentication > Providers > Email** altında yeni kullanıcı kayıtlarını (sign-ups) kapatın. Ek güvenlik için MFA açabilirsiniz.
4. `schema.sql` dosyasında `YOUR_AUTH_USER_UUID` yerine kendi UUID'nizi yazın; Supabase **SQL Editor** üzerinden çalıştırın. SQL dosyasını GitHub'a koymadan önce UUID'yi eklemek yerine SQL Editor içinde değiştirmek de mümkündür.
5. **Project Settings > API** bölümünden **Project URL** ve **publishable key** (eski projelerde `anon` key) değerlerini `config.js` içine yazın. **Secret/service_role** anahtarını asla web koduna koymayın. Publishable key tek başına erişim sağlamaz; RLS kuralları zorunludur.
6. `index.html`, `style.css`, `app.js`, `config.js` dosyalarını `https://github.com/sertbasyasar-creator/analiz` deposunun ana dizinine yükleyin. `schema.sql` ve README isteğe bağlıdır.
7. GitHub deposunda **Settings > Pages > Build and deployment > Deploy from a branch**, branch `main`, klasör `/ (root)` seçip kaydedin.
8. Uygulama adresi: `https://sertbasyasar-creator.github.io/analiz/` (Pages yayımlaması tamamlandıktan sonra).

## Özellikler

- Şifreli giriş; yetkili kullanıcı dışındaki hesapların veri okuma/yazması RLS ile engellenir.
- Yayın ekle/düzenle/sil; DOI üzerinden Crossref'ten bibliyografik bilgileri getirme.
- PDF (25 MB'a kadar) özel Storage alanına yükleme; 60 saniyelik imzalı bağlantı ile açma ve tarayıcıdan yazdırma.
- PubMed / DOI / dergi bağlantıları; manuel atıf sayısı ve kaynak kaydı.
- Akademik profil, seçili yayınlarla yazdırılabilir CV (tarayıcıdan PDF olarak kaydedilebilir).
- Bibliyografik JSON yedeği (PDF dosyalarını içermez).

## Bilinen sınırlar / sonraki sürüm

- Atıflar otomatik güncellenmez; elle girilir. OpenAlex senkronizasyonu sonraki sürüme bırakılmıştır.
- CV, tarayıcının Yazdır > PDF olarak kaydet özelliğiyle alınır; Word dışa aktarma henüz yoktur.
- Toplu PDF indirme ve JSON içe aktarma henüz yoktur.
- PDF'ler için ayrıca düzenli yedek alınmalıdır; JSON yedeği PDF dosyalarını içermez.
- DOI verileri Crossref'e tarayıcıdan sorgulanır; bazı kayıtlar eksik olabilir.
- Üçüncü taraf CDN ve API erişimi için internet gerekir. Ücretsiz plan sınırları değişebilir.
- PDF yüklemeden önce yayıncının arşivleme/telif koşullarını kontrol edin.
