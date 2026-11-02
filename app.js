import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const $ = id => document.getElementById(id);
const cfg = window.APP_CONFIG || {};
const configured = cfg.supabaseUrl?.startsWith('https://') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('SUPABASE_');
let db, user, publications = [], presentations = [], certificates = [], profiles = [], pubShares = [], presShares = [], certShares = [], profile = {};
const show = id => $(id).classList.remove('hidden'), hide = id => $(id).classList.add('hidden');
const msg = (id, s) => $(id).textContent = s;
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const url = s => { try { let u = new URL(s); return ['https:', 'http:'].includes(u.protocol) ? u.href : null } catch { return null } };
const doiUrl = doi => doi ? `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}` : null;
const pubmedUrl = p => url(p.pubmed_url) || (p.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(p.pmid)}/` : null);
const link = (href, label) => href ? `<a target="_blank" rel="noopener noreferrer" href="${safe(href)}">${safe(label)}</a>` : '';

/* ---------- SEKMELER ---------- */
function tab(id) {
  document.querySelectorAll('.tab').forEach(x => hide(x.id));
  show(id);
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b.dataset.tab === id));
  if (id === 'cv') renderCv();
  if (id === 'presentationsTab') {
    presentations = [];
    loadPresentations();
  }
  if (id === 'certificatesTab') {
    certificates = [];
    loadCertificates();
  }
}

document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));

/* ---------- OTURUM ---------- */
async function start() {
  if (!configured) { show('setup'); return; }
  db = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const { data: { session } } = await db.auth.getSession();
  await sessionChanged(session);
  db.auth.onAuthStateChange((_event, s) => { setTimeout(() => sessionChanged(s), 0); });
}

async function sessionChanged(session) {
  user = session?.user || null;
  if (!user) { hide('app'); hide('logout'); show('loginPanel'); return; }
  hide('loginPanel'); show('app'); show('logout'); 
  await load();
  render(); // İşte burası! Giriş yapıldığı an ekranı çizer.
}

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  msg('loginMsg', 'Giriş yapılıyor...');
  const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  msg('loginMsg', error ? error.message : '');
};

$('logout').onclick = () => db.auth.signOut();

/* ---------- VERİ YÜKLEME ---------- */
async function load() {
  const profRes = await db.from('profiles').select('*');
  profiles = profRes.data || [];
  profile = profiles.find(x => x.user_id === user.id) || {};

  for (const [k, v] of Object.entries({
    fullName: profile.full_name, institution: profile.institution, specialty: profile.specialty,
    orcid: profile.orcid, contactEmail: profile.contact_email, bio: profile.bio
  })) $(k).value = v || '';

  const pubRes = await db.from('publications').select('*').order('year', { ascending: false });
  const shareRes = await db.from('publication_shares').select('*');
  pubShares = shareRes.data || [];

  const sharedPubIds = new Set(pubShares.filter(s => s.shared_with_user_id === user.id).map(s => s.publication_id));
  const allPubs = pubRes.data || [];

  publications = allPubs.filter(p => p.user_id === user.id || sharedPubIds.has(p.id));
  
  // Veriler yüklendikten sonra ekranı ve CV'yi hemen güncelleyelim
  render();
  if (typeof renderCv === 'function') renderCv();
}

/* ---------- PAYLAŞIM YARDIMCILARI ---------- */
const nameOf = uid => {
  const p = profiles.find(x => x.user_id === uid);
  return p?.full_name || p?.contact_email || 'Bilinmeyen kullanıcı';
};

function shareRowHtml({ isOwner, ownerId, shares, itemId, label }) {
  if (isOwner) {
    return shares.map(s => `
      <span class="chip chip-share">
        <span>Paylaşıldı: ${safe(nameOf(s.shared_with_user_id))}</span>
        <button type="button" class="chip-action remove-share" data-share-id="${s.id}">Durdur</button>
      </span>`).join('');
  }
  return `
    <span class="chip chip-neutral">${safe(label)}</span>
    <span class="chip chip-info">Paylaşan: ${safe(nameOf(ownerId))}</span>
    <button type="button" class="chip-action chip-danger remove-my-share" data-item-id="${itemId}">Listemden kaldır</button>`;
}

/* ---------- YAYINLAR (SIRALAMA DAHİL) ---------- */
function render() {
  const q = $('search').value.toLocaleLowerCase('tr');
  const sortBy = $('sortBy')?.value || 'yearDesc';

  let arr = publications.filter(p => [p.title, p.authors, p.journal, p.year].join(' ').toLocaleLowerCase('tr').includes(q));

  arr.sort((a, b) => {
    if (sortBy === 'yearDesc') {
      return (b.year || 0) - (a.year || 0);
    } else if (sortBy === 'yearAsc') {
      return (a.year || 0) - (b.year || 0);
    } else if (sortBy === 'titleAsc') {
      return (a.title || '').localeCompare(b.title || '', 'tr');
    } else if (sortBy === 'addedDesc') {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
    return 0;
  });

  $('count').textContent = publications.length;
  $('citations').textContent = publications.reduce((s, p) => s + (p.citation_count || 0), 0);

  $('list').innerHTML = arr.length ? arr.map(p => {
    const isOwner = p.user_id === user.id;
    const ownerProfile = profiles.find(x => x.user_id === p.user_id);
    const ownerName = ownerProfile?.full_name || ownerProfile?.contact_email || 'Meslektaşınız';

    const myShares = pubShares.filter(s => s.publication_id === p.id);
    let sharedWithText = '';
    if (isOwner && myShares.length > 0) {
      sharedWithText = myShares.map(s => {
        const uProf = profiles.find(x => x.user_id === s.shared_with_user_id);
        const uName = uProf?.full_name || uProf?.contact_email || 'Biri';
        return `<span class="muted" style="font-size:12px; background:#fef3c7; color:#92400e; padding:4px 8px; border-radius:6px; font-weight:500; margin-left:4px; display:inline-flex; align-items:center; gap:6px;">
          Paylaşıldı: ${safe(uName)}
          <a href="#" class="remove-share" data-share-id="${s.id}" style="color:#b45309; text-decoration:underline; font-size:11.5px; font-weight:600;" title="Paylaşımı Kaldır">Paylaşımı Durdur</a>
        </span>`;
      }).join('');
    }

    const meta = [p.authors, p.journal, p.year].filter(Boolean).map(safe).join(' · ');
    const details = (p.volume ? '; ' + safe(p.volume) : '') + (p.issue ? '(' + safe(p.issue) + ')' : '') +
      (p.pages ? ':' + safe(p.pages) : '') + (p.article_number ? ' · Makale no: ' + safe(p.article_number) : '');

    return `
      <article class="publication">
        <h3>${safe(p.title)}</h3>
        ${meta || details ? `<p class="pub-meta">${meta}${details}</p>` : ''}
        <p class="pub-cite">Atıf: ${p.citation_count || 0}${p.citation_source ? ' (' + safe(p.citation_source) + ')' : ''}</p>
        <div class="actions">
          ${p.pdf_path ? `<button data-action="pdf" data-id="${p.id}">PDF aç / yazdır</button>` : ''}
          ${p.doi ? link(doiUrl(p.doi), 'DOI') : ''}
          ${link(pubmedUrl(p), 'PubMed')}
          ${link(url(p.journal_url), 'Dergi sayfası')}
          <button class="secondary" data-action="share" data-id="${p.id}" data-type="publication">Paylaş</button>
          ${isOwner ? `<button class="secondary" data-action="edit" data-id="${p.id}">Düzenle</button><button class="danger" data-action="delete" data-id="${p.id}">Sil</button>${sharedWithText}` : `
  <span class="muted" style="font-size:12px; background:#f1f5f9; color:#475569; padding:4px 8px; border-radius:6px; font-weight:500;">Ortak Yayın</span>
  <span class="muted" style="font-size:12px; background:#e0f2fe; color:#0369a1; padding:4px 8px; border-radius:6px; font-weight:500; margin-left:4px;">Paylaşan: ${safe(ownerName)}</span>
  <a href="#" class="remove-my-share" data-pub-id="${p.id}" style="font-size:12px; color:#dc2626; text-decoration:underline; font-weight:600; margin-left:6px;" title="Paylaşımı Kaldır">Paylaşımı Durdur</a>
`}
        </div>
      </article>`;
  }).join('') : '<p>Henüz kayıtlı yayın bulunmuyor.</p>';
}
$('search').oninput = render;
if ($('sortBy')) { $('sortBy').onchange = render; }

$('list').onclick = async e => {
  const removeBtn = e.target.closest('a.remove-share');
  if (removeBtn) {
    e.preventDefault();
    const shareId = removeBtn.dataset.shareId;
    showCustomConfirm('Paylaşımı Durdur', 'Bu içeriğin diğer kullanıcıyla olan paylaşımını durdurmak istiyor musunuz?', async () => {
      const { error } = await db.from('publication_shares').delete().eq('id', shareId);
      if (error) showCustomAlert('Hata', error.message);
      else await load();
    }, 'Evet, Durdur');
    return;
  }

  const myShareRemoveBtn = e.target.closest('a.remove-my-share');
  if (myShareRemoveBtn) {
    e.preventDefault();
    const pubId = myShareRemoveBtn.dataset.pubId;
    showCustomConfirm('Paylaşımı Kaldır', 'Bu ortak yayını listenizden kaldırmak istiyor musunuz?', async () => {
      const { error } = await db.from('publication_shares')
        .delete()
        .eq('publication_id', pubId)
        .eq('shared_with_user_id', user.id);

      if (error) showCustomAlert('Hata', error.message);
      else await load();
    }, 'Evet, Kaldır');
    return;
  }

  const b = e.target.closest('button[data-action]');
  if (!b) return;
  const p = publications.find(x => x.id === b.dataset.id);
  if (!p) return;

  if (b.dataset.action === 'edit') {
    if (p.user_id !== user.id) {
      showCustomAlert('Yetkisiz İşlem', 'Bu yayını düzenleme yetkiniz yok, çünkü bu yayın sizinle paylaşılmıştır.');
      return;
    }
    edit(p);
  }

  if (b.dataset.action === 'share') openShareModal(p.id, 'publication');

  if (b.dataset.action === 'pdf') {
    const { data, error } = await db.storage.from('publication-pdfs').createSignedUrl(p.pdf_path, 60);
    if (error) showCustomAlert('Hata', error.message);
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (b.dataset.action === 'delete') {
    if (p.user_id !== user.id) {
      showCustomAlert('Yetkisiz İşlem', 'Bu yayını silme yetkiniz yok, çünkü bu yayın sizinle paylaşılmıştır.');
      return;
    }

    showCustomConfirm('Yayını Sil', 'Bu yayını ve yüklenen PDF dosyasını silmek istiyor musunuz?', async () => {
      const { error } = await db.from('publications').delete().eq('id', p.id);
      if (error) showCustomAlert('Hata', error.message);
      else {
        if (p.pdf_path) await db.storage.from('publication-pdfs').remove([p.pdf_path]);
        await load();
      }
    });
  }
};

/* ---------- YAYIN DÜZENLEME / EKLEME ---------- */
function edit(p) {
  $('publicationForm').reset();
  msg('saveMsg', '');
  const fields = {
    pubId: p.id, doi: p.doi, pmid: p.pmid, title: p.title, authors: p.authors, journal: p.journal, year: p.year,
    volume: p.volume, issue: p.issue, pages: p.pages, articleNumber: p.article_number,
    publicationCategory: p.publication_category || 'unclassified',
    pubmedUrl: p.pubmed_url, journalUrl: p.journal_url, citationCount: p.citation_count,
    citationSource: p.citation_source, notes: p.notes
  };
  for (const [k, v] of Object.entries(fields)) $(k).value = v ?? '';
  $('editTitle').textContent = 'Yayını düzenle';
  $('removePdf').checked = false;
  if (p.pdf_path) { $('existingPdfName').textContent = p.pdf_path.split('/').pop(); show('existingPdf'); }
  else hide('existingPdf');
  tab('edit');
}

function resetEdit() {
  hide('existingPdf');
  $('removePdf').checked = false;
  $('publicationForm').reset();
  $('pubId').value = '';
  $('citationCount').value = 0;
  $('editTitle').textContent = 'Yeni yayın ekle';
  msg('saveMsg', '');
}
$('cancelEdit').onclick = resetEdit;

$('openExistingPdf').onclick = async () => {
  const p = publications.find(x => x.id === $('pubId').value);
  if (!p?.pdf_path) return;
  const { data, error } = await db.storage.from('publication-pdfs').createSignedUrl(p.pdf_path, 120);
  if (error) { showCustomAlert('Hata', error.message); return; }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
};

$('doiLookup').onclick = async () => {
  const doi = $('doi').value.trim().replace(/^https?:\/\/doi.org\//i, '');
  if (!doi) { msg('saveMsg', 'Önce DOI girin.'); return; }
  msg('saveMsg', 'DOI sorgulanıyor...');
  try {
    const r = await fetch('https://api.crossref.org/works/' + encodeURIComponent(doi));
    if (!r.ok) throw Error('DOI bulunamadı');
    const m = (await r.json()).message;
    $('title').value = m.title?.[0] || '';
    $('authors').value = (m.author || []).map(a => [a.given, a.family].filter(Boolean).join(' ')).join('; ');
    $('journal').value = m['container-title']?.[0] || '';
    $('year').value = m.published?.['date-parts']?.[0]?.[0] || '';
    $('journalUrl').value = m.URL || '';
    msg('saveMsg', 'Bilgiler getirildi; kaydetmeden önce kontrol edin.');
  } catch (err) { msg('saveMsg', err.message); }
};

$('publicationForm').onsubmit = async e => {
  e.preventDefault();
  msg('saveMsg', 'Kaydediliyor...');
  const id = $('pubId').value;
  const doi = $('doi').value.trim().replace(/^https?:\/\/doi.org\//i, '');
  const data = {
    user_id: user.id,
    title: $('title').value.trim(),
    authors: $('authors').value.trim(),
    journal: $('journal').value.trim(),
    year: $('year').value ? Number($('year').value) : null,
    doi,
    pmid: $('pmid').value.trim(),
    pubmed_url: $('pubmedUrl').value.trim() || null,
    journal_url: $('journalUrl').value.trim() || null,
    volume: $('volume').value.trim(),
    issue: $('issue').value.trim(),
    pages: $('pages').value.trim(),
    article_number: $('articleNumber').value.trim(),
    publication_category: $('publicationCategory').value,
    citation_count: Number($('citationCount').value) || 0,
    citation_source: $('citationSource').value.trim(),
    notes: $('notes').value.trim()
  };

  let pdfPath = null;
  const file = $('pdf').files[0];
  if (file) {
    if (file.type !== 'application/pdf' || file.size > 25 * 1024 * 1024) { msg('saveMsg', 'PDF en fazla 25 MB olmalı.'); return; }
    pdfPath = `${user.id}/${crypto.randomUUID()}.pdf`;
    const up = await db.storage.from('publication-pdfs').upload(pdfPath, file, { contentType: 'application/pdf', upsert: false });
    if (up.error) { msg('saveMsg', up.error.message); return; }
    data.pdf_path = pdfPath;
  } else if (id) {
    const old = publications.find(x => x.id === id);
    data.pdf_path = $('removePdf').checked ? null : (old?.pdf_path || null);
  }

  const result = id ? await db.from('publications').update(data).eq('id', id) : await db.from('publications').insert(data);
  if (result.error) {
    if (pdfPath) await db.storage.from('publication-pdfs').remove([pdfPath]);
    msg('saveMsg', result.error.message);
    return;
  }

  if (id) {
    const old = publications.find(x => x.id === id);
    if (old?.pdf_path && (pdfPath || $('removePdf').checked)) {
      const removal = await db.storage.from('publication-pdfs').remove([old.pdf_path]);
      if (removal.error) console.warn('Eski PDF silinemedi:', removal.error.message);
    }
  }

  resetEdit();
  await load();
  tab('publications');
};

/* ---------- PROFİL ---------- */
$('profileForm').onsubmit = async e => {
  e.preventDefault();
  const p = {
    user_id: user.id, full_name: $('fullName').value, institution: $('institution').value,
    specialty: $('specialty').value, orcid: $('orcid').value, contact_email: $('contactEmail').value, bio: $('bio').value
  };
  const { error } = await db.from('profiles').upsert(p);
  msg('profileMsg', error ? error.message : 'Profil kaydedildi.');
  if (!error) {
    profile = p;
    const i = profiles.findIndex(x => x.user_id === user.id);
    if (i >= 0) profiles[i] = { ...profiles[i], ...p }; else profiles.push(p);
  }
};

/* ---------- CV ---------- */
function renderCv() {
  const pubChoices = publications.map(p =>
    `<div class="cvline"><label><input type="checkbox" class="cvcheck pubcheck" value="${p.id}" checked>${safe(p.title)} (${safe(p.year)})</label></div>`
  ).join('') || '<p>Önce yayın ekleyin.</p>';

  const certChoices = certificates.map(c =>
    `<div class="cvline"><label><input type="checkbox" class="cvcheck certcheck" value="${c.id}" checked>${safe(c.title)} (Belge)</label></div>`
  ).join('');

  $('cvChoices').innerHTML = `
    <h3 style="font-size:16px; margin-bottom:10px;">Yayınlar</h3>${pubChoices}
    <h3 style="font-size:16px; margin:20px 0 10px;">Belgeler ve Sertifikalar</h3>${certChoices}
  `;
}

/* ---------- SUNUMLAR ---------- */
async function loadPresentations() {
  const presRes = await db.from('presentations').select('*').order('created_at', { ascending: false });
  const shareRes = await db.from('presentation_shares').select('*');
  presShares = shareRes.data || [];

  const sharedPresIds = new Set(presShares.filter(s => s.shared_with_user_id === user.id).map(s => s.presentation_id));
  const allPres = presRes.data || [];

  presentations = allPres.filter(p => p.user_id === user.id || sharedPresIds.has(p.id));
  renderPresentations();
}

function renderPresentations() {
  const listEl = $('presentationsList');
  const q = $('presSearch')?.value.toLocaleLowerCase('tr') || '';
  const filtered = presentations.filter(p => p.title.toLocaleLowerCase('tr').includes(q));

  if (!filtered.length) {
    listEl.innerHTML = '<p>Eşleşen sunum bulunmuyor.</p>';
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const isOwner = p.user_id === user.id;
    const shareRow = shareRowHtml({
      isOwner, ownerId: p.user_id, itemId: p.id, label: 'Ortak Sunum',
      shares: presShares.filter(s => s.presentation_id === p.id)
    });
    return `
      <article class="publication">
        <h3>${safe(p.title)}</h3>
        <div class="actions">
          <a class="button" href="${safe(p.file_url)}" target="_blank" rel="noopener noreferrer">Sunumu Aç / İndir</a>
          ${isOwner ? `
            <button class="secondary" data-action="share" data-id="${p.id}" data-type="presentation">Paylaş</button>
            <button class="danger delete-pres" data-id="${p.id}" data-url="${safe(p.file_url)}">Sil</button>` : ''}
        </div>
        ${shareRow ? `<div class="share-row">${shareRow}</div>` : ''}
      </article>`;
  }).join('');
}

$('presentationForm').onsubmit = async e => {
  e.preventDefault();
  msg('presMsg', 'Sunum yükleniyor...');
  $('presMsg').className = 'message';

  const title = $('presTitle').value.trim();
  const file = $('presFile').files[0];
  if (!file) { msg('presMsg', 'Lütfen bir dosya seçin.'); return; }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${user.id}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await db.storage.from('sunumlar').upload(filePath, file);

  if (uploadError) {
    msg('presMsg', 'Yükleme hatası: ' + uploadError.message);
    return;
  }

  const { data: publicURLData } = db.storage.from('sunumlar').getPublicUrl(filePath);
  const file_url = publicURLData.publicUrl;

  const { error: dbError } = await db.from('presentations').insert([{ title, file_url, user_id: user.id }]);

  if (dbError) {
    msg('presMsg', 'Veritabanı kayıt hatası: ' + dbError.message);
    return;
  }

  msg('presMsg', 'Sunum başarıyla yüklendi!');
  $('presMsg').className = 'message success';

  setTimeout(() => {
    msg('presMsg', '');
    $('presMsg').className = 'message';
  }, 3000);

  $('presentationForm').reset();
  await loadPresentations();
};

$('presentationsList').onclick = async e => {
  const removeBtn = e.target.closest('.remove-share');
  if (removeBtn) {
    e.preventDefault();
    const shareId = removeBtn.dataset.shareId;
    showCustomConfirm('Paylaşımı Durdur', 'Bu sunumun diğer kullanıcıyla olan paylaşımını durdurmak istiyor musunuz?', async () => {
      const { error } = await db.from('presentation_shares').delete().eq('id', shareId);
      if (error) showCustomAlert('Hata', error.message);
      else await loadPresentations();
    }, 'Evet, Durdur');
    return;
  }

  const myShareRemoveBtn = e.target.closest('.remove-my-share');
  if (myShareRemoveBtn) {
    e.preventDefault();
    const presId = myShareRemoveBtn.dataset.itemId;
    showCustomConfirm('Paylaşımı Kaldır', 'Bu ortak sunumu listenizden kaldırmak istiyor musunuz?', async () => {
      const { error } = await db.from('presentation_shares')
        .delete()
        .eq('presentation_id', presId)
        .eq('shared_with_user_id', user.id);

      if (error) showCustomAlert('Hata', error.message);
      else await loadPresentations();
    }, 'Evet, Kaldır');
    return;
  }

  const btn = e.target.closest('button[data-action="share"], button.delete-pres');
  if (!btn) return;

  const id = btn.dataset.id;
  if (btn.dataset.action === 'share') {
    openShareModal(id, 'presentation');
    return;
  }

  if (btn.classList.contains('delete-pres')) {
    const p = presentations.find(x => x.id === id);
    if (!p || p.user_id !== user.id) {
      showCustomAlert('Yetkisiz İşlem', 'Bu sunumu silme yetkiniz yok, çünkü bu sunum sizinle paylaşılmıştır.');
      return;
    }

    showCustomConfirm('Sunumu Sil', 'Bu sunumu silmek istediğinize emin misiniz?', async () => {
      const fileUrl = btn.dataset.url;
      try {
        const urlObj = new URL(fileUrl);
        const pathParts = urlObj.pathname.split('/sunumlar/');
        if (pathParts.length > 1) {
          const storagePath = decodeURIComponent(pathParts[1]);
          await db.storage.from('sunumlar').remove([storagePath]);
        }
      } catch (err) {
        console.warn('Storage dosya yolu çözülemedi:', err);
      }

      const { error } = await db.from('presentations').delete().eq('id', id);
      if (error) showCustomAlert('Hata', error.message);
      else await loadPresentations();
    });
  }
};

if ($('presSearch')) {
  $('presSearch').oninput = renderPresentations;
}

/* ---------- BELGELER VE SERTİFİKALAR YÖNETİMİ ---------- */
async function loadCertificates() {
  const certRes = await db.from('certificates').select('*').order('created_at', { ascending: false });
  const shareRes = await db.from('certificate_shares').select('*');
  certShares = shareRes.data || [];

  const sharedCertIds = new Set(certShares.filter(s => s.shared_with_user_id === user.id).map(s => s.certificate_id));
  const allCerts = certRes.data || [];

  certificates = allCerts.filter(c => c.user_id === user.id || sharedCertIds.has(c.id));
  renderCertificates();
}

function renderCertificates() {
  const listEl = $('certificatesList');
  const q = $('certSearch')?.value.toLocaleLowerCase('tr') || '';
  const filtered = certificates.filter(c => c.title.toLocaleLowerCase('tr').includes(q));

  if (!filtered.length) {
    listEl.innerHTML = '<p>Eşleşen belge bulunmuyor.</p>';
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const isOwner = c.user_id === user.id;
    const shareRow = shareRowHtml({
      isOwner, ownerId: c.user_id, itemId: c.id, label: 'Ortak Belge',
      shares: certShares.filter(s => s.certificate_id === c.id)
    });
    return `
      <article class="publication">
        <h3>${safe(c.title)}</h3>
        <div class="actions">
          <a class="button" href="${safe(c.file_url)}" target="_blank" rel="noopener noreferrer">Belgeyi Aç / İndir</a>
          ${isOwner ? `
            <button class="secondary" data-action="share-cert" data-id="${c.id}">Paylaş</button>
            <button class="danger delete-cert" data-id="${c.id}" data-url="${safe(c.file_url)}">Sil</button>` : ''}
        </div>
        ${shareRow ? `<div class="share-row">${shareRow}</div>` : ''}
      </article>`;
  }).join('');
}

$('certificateForm').onsubmit = async e => {
  e.preventDefault();
  msg('certMsg', 'Belge yükleniyor...');
  $('certMsg').className = 'message';

  const title = $('certTitle').value.trim();
  const file = $('certFile').files[0];
  if (!file) { msg('certMsg', 'Lütfen bir dosya seçin.'); return; }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${user.id}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await db.storage.from('belgeler').upload(filePath, file);

  if (uploadError) {
    msg('certMsg', 'Yükleme hatası: ' + uploadError.message);
    return;
  }

  const { data: publicURLData } = db.storage.from('belgeler').getPublicUrl(filePath);
  const file_url = publicURLData.publicUrl;

  const { error: dbError } = await db.from('certificates').insert([{ title, file_url, user_id: user.id }]);

  if (dbError) {
    msg('certMsg', 'Veritabanı kayıt hatası: ' + dbError.message);
    return;
  }

  msg('certMsg', 'Belge başarıyla yüklendi!');
  $('certMsg').className = 'message success';

  setTimeout(() => {
    msg('certMsg', '');
    $('certMsg').className = 'message';
  }, 3000);

  $('certificateForm').reset();
  await loadCertificates();
};

$('certificatesList').onclick = async e => {
  const removeBtn = e.target.closest('.remove-share');
  if (removeBtn) {
    e.preventDefault();
    const shareId = removeBtn.dataset.shareId;
    showCustomConfirm('Paylaşımı Durdur', 'Bu belgenin diğer kullanıcıyla olan paylaşımını durdurmak istiyor musunuz?', async () => {
      const { error } = await db.from('certificate_shares').delete().eq('id', shareId);
      if (error) showCustomAlert('Hata', error.message);
      else await loadCertificates();
    }, 'Evet, Durdur');
    return;
  }

  const myShareRemoveBtn = e.target.closest('.remove-my-share');
  if (myShareRemoveBtn) {
    e.preventDefault();
    const certId = myShareRemoveBtn.dataset.itemId;
    showCustomConfirm('Paylaşımı Kaldır', 'Bu ortak belgeyi listenizden kaldırmak istiyor musunuz?', async () => {
      const { error } = await db.from('certificate_shares')
        .delete()
        .eq('certificate_id', certId)
        .eq('shared_with_user_id', user.id);

      if (error) showCustomAlert('Hata', error.message);
      else await loadCertificates();
    }, 'Evet, Kaldır');
    return;
  }

  const shareBtn = e.target.closest('button[data-action="share-cert"]');
  if (shareBtn) {
    openShareModal(shareBtn.dataset.id, 'certificate');
    return;
  }

  const delBtn = e.target.closest('button.delete-cert');
  if (delBtn) {
    const id = delBtn.dataset.id;
    const c = certificates.find(x => x.id === id);
    if (!c || c.user_id !== user.id) {
      showCustomAlert('Yetkisiz İşlem', 'Bu belgeyi silme yetkiniz yok.');
      return;
    }

    showCustomConfirm('Belgeyi Sil', 'Bu belgeyi silmek istediğinize emin misiniz?', async () => {
      const fileUrl = delBtn.dataset.url;
      try {
        const urlObj = new URL(fileUrl);
        const pathParts = urlObj.pathname.split('/belgeler/');
        if (pathParts.length > 1) {
          const storagePath = decodeURIComponent(pathParts[1]);
          await db.storage.from('belgeler').remove([storagePath]);
        }
      } catch (err) {
        console.warn('Storage dosya yolu çözülemedi:', err);
      }

      const { error } = await db.from('certificates').delete().eq('id', id);
      if (error) showCustomAlert('Hata', error.message);
      else await loadCertificates();
    });
  }
};

if ($('certSearch')) {
  $('certSearch').oninput = renderCertificates;
}

/* ---------- PAYLAŞIM PENCERESİ ---------- */
async function openShareModal(itemId, itemType) {
  const { data: allProfiles, error } = await db.from('profiles').select('*');

  if (error) {
    showCustomAlert('Hata', 'Profiller alınamadı: ' + error.message);
    return;
  }

  const otherProfiles = (allProfiles || []).filter(p => p.user_id !== user.id);

  if (!otherProfiles.length) {
    showCustomAlert('Uyarı', 'Paylaşım yapabileceğiniz başka kayıtlı profil bulunamadı.');
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'custom-modal-backdrop';
  backdrop.innerHTML = `
    <div class="custom-modal">
      <h3>İçeriği Paylaş</h3>
      <p>Bu öğeyi hangi meslektaşınızla paylaşmak istiyorsunuz?</p>
      <div style="margin: 15px 0; text-align: left;">
        <select id="shareUserSelect" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-strong);">
          ${otherProfiles.map(p => `<option value="${p.user_id}">${safe(p.full_name || p.contact_email || 'İsimsiz Profil')}</option>`).join('')}
        </select>
      </div>
      <div class="custom-modal-actions">
        <button id="modalShareConfirm">Paylaş</button>
        <button id="modalShareCancel" class="secondary">İptal</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#modalShareConfirm').onclick = async () => {
    const targetUserId = backdrop.querySelector('#shareUserSelect').value;
    let tableName = 'publication_shares';
    let idColumn = 'publication_id';
    if (itemType === 'presentation') { tableName = 'presentation_shares'; idColumn = 'presentation_id'; }
    if (itemType === 'certificate') { tableName = 'certificate_shares'; idColumn = 'certificate_id'; }

    const { error } = await db.from(tableName).insert([{
      [idColumn]: itemId,
      shared_with_user_id: targetUserId
    }]);

    backdrop.remove();
    if (error) {
      showCustomAlert('Paylaşım Hatası', 'Zaten paylaşılmış olabilir: ' + error.error_description || error.message);
    } else {
      showCustomAlert('Başarılı', 'İçerik başarıyla paylaşıldı!');
      if (itemType === 'publication') await load();
      else if (itemType === 'presentation') await loadPresentations();
      else await loadCertificates();
    }
  };

  backdrop.querySelector('#modalShareCancel').onclick = () => backdrop.remove();
}

/* ---------- MODAL PENCERELER ---------- */
function showCustomAlert(title, text) {
  const backdrop = document.createElement('div');
  backdrop.className = 'custom-modal-backdrop';
  backdrop.innerHTML = `
    <div class="custom-modal">
      <h3>${safe(title)}</h3>
      <p>${safe(text)}</p>
      <div class="custom-modal-actions">
        <button id="modalOk">Tamam</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#modalOk').onclick = () => backdrop.remove();
}

function showCustomConfirm(title, text, onConfirm, yesLabel = 'Evet, Sil') {
  const backdrop = document.createElement('div');
  backdrop.className = 'custom-modal-backdrop';
  backdrop.innerHTML = `
    <div class="custom-modal">
      <h3>${safe(title)}</h3>
      <p>${safe(text)}</p>
      <div class="custom-modal-actions">
        <button id="modalYes" class="danger">${safe(yesLabel)}</button>
        <button id="modalNo" class="secondary">İptal</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#modalYes').onclick = () => {
    backdrop.remove();
    onConfirm();
  };
  backdrop.querySelector('#modalNo').onclick = () => {
    backdrop.remove();
  };
}

/* ---------- CV YAZDIR ---------- */
$('printCv').onclick = () => {
  const pubIds = new Set([...document.querySelectorAll('.cvcheck.pubcheck:checked')].map(x => x.value));
  const certIds = new Set([...document.querySelectorAll('.cvcheck.certcheck:checked')].map(x => x.value));

  const rows = publications.filter(p => pubIds.has(String(p.id)));
  const certRows = certificates.filter(c => certIds.has(String(c.id)));

  const categories = [
    ['sci', 'SCI / SCI-Expanded'],
    ['esci', 'ESCI'],
    ['scopus', 'Scopus / Diğer uluslararası indeksler'],
    ['international', 'Diğer uluslararası hakemli dergiler'],
    ['national', 'Ulusal hakemli dergiler'],
    ['other', 'Diğer bilimsel yayınlar'],
    ['unclassified', 'Sınıflandırılmamış yayınlar']
  ];

  const formatPublication = p => {
    const volume = p.volume ? safe(p.volume) : '';
    const issue = p.issue ? '(' + safe(p.issue) + ')' : '';
    const details = volume + issue + (p.pages ? ':' + safe(p.pages) : '');
    const article = p.article_number ? ' Makale no: ' + safe(p.article_number) + '.' : '';
    const doi = p.doi ? ' DOI: ' + safe(p.doi) : '';

    return `<li>${safe(p.authors)}. ${safe(p.title)}. <em>${safe(p.journal)}</em>. ${safe(p.year)}${details ? ';' + details : ''}.${article}${doi}</li>`;
  };

  const sections = categories.map(([key, label]) => {
    const group = rows.filter(p => (p.publication_category || 'unclassified') === key);
    if (!group.length) return '';
    return `<section><h2>${safe(label)} (${group.length})</h2><ol>${group.map(formatPublication).join('')}</ol></section>`;
  }).join('');

  // Belgeler ve Sertifikalar Bölümü
  const certSection = certRows.length ? `
    <section>
      <h2>Belgeler ve Sertifikalar (${certRows.length})</h2>
      <ol>
        ${certRows.map(c => `<li>${safe(c.title)}</li>`).join('')}
      </ol>
    </section>
  ` : '';

  const w = window.open('', '_blank');
  if (!w) { showCustomAlert('Hata', 'Tarayıcı açılır pencereyi engelledi.'); return; }

  const html = `<!doctype html><html lang="tr"><head><meta charset="UTF-8"><title>Akademik CV</title><style>body{font:12pt "Times New Roman",serif;margin:35px;line-height:1.5}h1{font-size:20pt}h2{font-size:14pt;margin-top:25px;border-bottom:1px solid #999}li{margin:9px 0;break-inside:avoid;overflow-wrap:anywhere}section{margin-bottom:20px}@media print{@page{size:A4;margin:18mm}body{margin:0}h2{break-after:avoid}}</style></head><body><h1>${safe(profile.full_name || 'Akademik CV')}</h1><p>${safe(profile.specialty)}<br>${safe(profile.institution)}<br>${safe(profile.contact_email)}<br>${safe(profile.orcid)}</p><p>${safe(profile.bio)}</p><h2>Bilimsel Yayınlar - Toplam ${rows.length}</h2>${sections || '<p>Seçili yayın bulunmuyor.</p>'}${certSection}</body></html>`;

  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
};

/* ---------- SEÇİLEN YAYINLARI E-POSTA İLE GÖNDERME ---------- */
const emailBtn = document.createElement('button');
emailBtn.id = 'emailSelectedPubs';
emailBtn.className = 'secondary';
emailBtn.textContent = 'Seçilen Yayınları E-posta ile Gönder';
emailBtn.style.marginLeft = '8px';

document.querySelector('#cv .actions').appendChild(emailBtn);

emailBtn.onclick = () => {
  const ids = new Set([...document.querySelectorAll('.cvcheck.pubcheck:checked')].map(x => x.value));
  const rows = publications.filter(p => ids.has(String(p.id)));

  if (!rows.length) {
    showCustomAlert('Uyarı', 'Lütfen e-posta ile göndermek için en az bir yayın seçin.');
    return;
  }

  const pubText = rows.map((p, index) =>
    `${index + 1}. ${p.authors || 'Yazar belirtilmemiş'}. (${p.year || 'Yıl yok'}). ${p.title}. ${p.journal || ''}. ${p.doi ? 'DOI: ' + p.doi : ''}`
  ).join('\n\n');

  const subject = encodeURIComponent('Akademik Yayın Listesi');
  const body = encodeURIComponent(`Merhaba,\n\nPaylaşmak istediğim akademik yayın listesi aşağıdadır:\n\n${pubText}\n\nSaygılarımla.`);

  window.location.href = `mailto:?subject=${subject}&body=${body}`;
};

/* ---------- JSON YEDEK ---------- */
$('exportJson').onclick = () => {
  const blob = new Blob(
    [JSON.stringify({ profile, publications: publications.map(({ pdf_path, ...rest }) =>rest) }, null, 2)],
    { type: 'application/json' }
  );
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = 'akademik-yayinlar-yedek.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

start().catch(e => msg('globalMsg', e.message));
