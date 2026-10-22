import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const $ = id => document.getElementById(id);
const cfg=window.APP_CONFIG || {};
const configured=cfg.supabaseUrl?.startsWith('https://') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('SUPABASE_');
let db, user, publications=[], presentations=[], profile={};
const show=id=>$(id).classList.remove('hidden'), hide=id=>$(id).classList.add('hidden');
const msg=(id,s)=>$(id).textContent=s;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>{try{let u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}};
const doiUrl=doi=>doi?`https://doi.org/${encodeURIComponent(doi)}`:null;
const pubmedUrl=p=>url(p.pubmed_url)||(p.pmid?`https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(p.pmid)}/`:null);
const link=(href,label)=>href?`<a target="_blank" rel="noopener noreferrer" href="${safe(href)}">${safe(label)}</a>`:'';

function tab(id){
  document.querySelectorAll('.tab').forEach(x=>hide(x.id));
  show(id);
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===id));
  if(id==='cv')renderCv();
  if(id==='presentationsTab')loadPresentations();
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));

async function start(){if(!configured){show('setup');return}db=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);const {data:{session}}=await db.auth.getSession();await sessionChanged(session);db.auth.onAuthStateChange((_event,s)=>{setTimeout(()=>sessionChanged(s),0)});}
async function sessionChanged(session){user=session?.user||null;if(!user){hide('app');hide('logout');show('loginPanel');return}hide('loginPanel');show('app');show('logout');await load();}
$('loginForm').onsubmit=async e=>{e.preventDefault();msg('loginMsg','Giriş yapılıyor...');const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});msg('loginMsg',error?error.message:'');};
$('logout').onclick=()=>db.auth.signOut();

async function load(){
  const [a,b]=await Promise.all([
    db.from('publications').select('*').order('year',{ascending:false}),
    db.from('profiles').select('*').eq('user_id',user.id).maybeSingle()
  ]);
  if(a.error){msg('globalMsg','Veri okunamadı: '+a.error.message);return}
  publications=a.data||[];profile=b.data||{};
  for(const [k,v] of Object.entries({fullName:profile.full_name,institution:profile.institution,specialty:profile.specialty,orcid:profile.orcid,contactEmail:profile.contact_email,bio:profile.bio}))$(k).value=v||'';
  render();
}

function render(){const q=$('search').value.toLocaleLowerCase('tr');const arr=publications.filter(p=>[p.title,p.authors,p.journal,p.year].join(' ').toLocaleLowerCase('tr').includes(q));$('count').textContent=publications.length;$('citations').textContent=publications.reduce((s,p)=>s+(p.citation_count||0),0);$('list').innerHTML=arr.length?arr.map(p=>`<article class="publication"><h3>${safe(p.title)}</h3><p>${safe(p.authors)} · 
${safe(p.journal)} · ${safe(p.year)}${p.volume?'; '+safe(p.volume):''}${p.issue?'('+safe(p.issue)+')':''}${p.pages?':'+safe(p.pages):''}${p.article_number?' · Makale no: '+safe(p.article_number):''}
</p><p>Atıf: ${p.citation_count||0} ${p.citation_source?'('+safe(p.citation_source)+')':''}</p><div class="actions">${p.pdf_path?`<button data-action="pdf" data-id="${p.id}">PDF aç / yazdır</button>`:''}${p.doi?link(doiUrl(p.doi),'DOI'):''} ${link(pubmedUrl(p),'PubMed')} ${link(url(p.journal_url),'Dergi sayfası')} <button class="secondary" data-action="edit" data-id="${p.id}">Düzenle</button><button class="danger" data-action="delete" data-id="${p.id}">Sil</button></div></article>`).join(''):'<p>Henüz kayıtlı yayın bulunmuyor.</p>';}
$('search').oninput=render;

$('list').onclick=async e=>{const b=e.target.closest('button[data-action]');if(!b)return;const p=publications.find(x=>x.id===b.dataset.id);if(!p)return;if(b.dataset.action==='edit')edit(p);if(b.dataset.action==='pdf'){const {data,error}=await db.storage.from('publication-pdfs').createSignedUrl(p.pdf_path,60);if(error)alert(error.message);else window.open(data.signedUrl,'_blank','noopener,noreferrer');}if(b.dataset.action==='delete'){
  showCustomConfirm('Yayını Sil', 'Bu yayını ve yüklenen PDF dosyasını silmek istiyor musunuz?', async () => {
    const {error}=await db.from('publications').delete().eq('id',p.id);
    if(error)alert(error.message);
    else{if(p.pdf_path)await db.storage.from('publication-pdfs').remove([p.pdf_path]);await load()}
  });
}};

function edit(p){$('publicationForm').reset();msg('saveMsg','');const fields={pubId:p.id,doi:p.doi,pmid:p.pmid,title:p.title,authors:p.authors,journal:p.journal,year:p.year,
volume:p.volume,issue:p.issue,pages:p.pages,articleNumber:p.article_number,
publicationCategory:p.publication_category || 'unclassified',
pubmedUrl:p.pubmed_url,journalUrl:p.journal_url,citationCount:p.citation_count,citationSource:p.citation_source,notes:p.notes};for(const [k,v] of Object.entries(fields))$(k).value=v??'';$('editTitle').textContent='Yayını düzenle';$('removePdf').checked=false;if(p.pdf_path){$('existingPdfName').textContent=p.pdf_path.split('/').pop();show('existingPdf');}else hide('existingPdf');tab('edit');}
function resetEdit(){hide('existingPdf');$('removePdf').checked=false;$('publicationForm').reset();$('pubId').value='';$('citationCount').value=0;$('editTitle').textContent='Yeni yayın ekle';msg('saveMsg','');}
$('cancelEdit').onclick=resetEdit;
$('openExistingPdf').onclick=async()=>{const p=publications.find(x=>x.id===$('pubId').value);if(!p?.pdf_path)return;const {data,error}=await db.storage.from('publication-pdfs').createSignedUrl(p.pdf_path,120);if(error){msg('saveMsg',error.message);return;}window.open(data.signedUrl,'_blank','noopener,noreferrer');};
$('doiLookup').onclick=async()=>{const doi=$('doi').value.trim().replace(/^https?:\/\/doi.org\//i,'');if(!doi){msg('saveMsg','Önce DOI girin.');return}msg('saveMsg','DOI sorgulanıyor...');try{const r=await fetch('https://api.crossref.org/works/'+encodeURIComponent(doi));if(!r.ok)throw Error('DOI bulunamadı');const m=(await r.json()).message;$('title').value=m.title?.[0]||'';$('authors').value=(m.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')).join('; ');$('journal').value=m['container-title']?.[0]||'';$('year').value=m.published?.['date-parts']?.[0]?.[0]||'';$('journalUrl').value=m.URL||'';msg('saveMsg','Bilgiler getirildi; kaydetmeden önce kontrol edin.')}catch(err){msg('saveMsg',err.message)}};

$('publicationForm').onsubmit=async e=>{e.preventDefault();msg('saveMsg','Kaydediliyor...');const id=$('pubId').value;const doi=$('doi').value.trim().replace(/^https?:\/\/doi.org\//i,'');const data={user_id:user.id,title:$('title').value.trim(),authors:$('authors').value.trim(),journal:$('journal').value.trim(),year:$('year').value?Number($('year').value):null,doi,pmid:$('pmid').value.trim(),pubmed_url:$('pubmedUrl').value.trim()||null,journal_url:$('journalUrl').value.trim()||null,
volume:$('volume').value.trim(),
issue:$('issue').value.trim(),
pages:$('pages').value.trim(),
article_number:$('articleNumber').value.trim(),
publication_category:$('publicationCategory').value,
citation_count:Number($('citationCount').value)||0,citation_source:$('citationSource').value.trim(),notes:$('notes').value.trim()};let pdfPath=null;const file=$('pdf').files[0];if(file){if(file.type!=='application/pdf'||file.size>25*1024*1024){msg('saveMsg','PDF en fazla 25 MB olmalı.');return}pdfPath=`${user.id}/${crypto.randomUUID()}.pdf`;const up=await db.storage.from('publication-pdfs').upload(pdfPath,file,{contentType:'application/pdf',upsert:false});if(up.error){msg('saveMsg',up.error.message);return}data.pdf_path=pdfPath}else if(id){const old=publications.find(x=>x.id===id);data.pdf_path=$('removePdf').checked?null:(old?.pdf_path||null)}const result=id?await db.from('publications').update(data).eq('id',id):await db.from('publications').insert(data);if(result.error){if(pdfPath)await db.storage.from('publication-pdfs').remove([pdfPath]);msg('saveMsg',result.error.message);return}if(id){const old=publications.find(x=>x.id===id);if(old?.pdf_path&&(pdfPath||$('removePdf').checked)){const removal=await db.storage.from('publication-pdfs').remove([old.pdf_path]);if(removal.error)console.warn('Eski PDF silinemedi:',removal.error.message);}}resetEdit();await load();tab('publications');};

$('profileForm').onsubmit=async e=>{e.preventDefault();const p={user_id:user.id,full_name:$('fullName').value,institution:$('institution').value,specialty:$('specialty').value,orcid:$('orcid').value,contact_email:$('contactEmail').value,bio:$('bio').value};const {error}=await db.from('profiles').upsert(p);msg('profileMsg',error?error.message:'Profil kaydedildi.');if(!error)profile=p;};
function renderCv(){$('cvChoices').innerHTML=publications.map(p=>`<div class="cvline"><label><input type="checkbox" class="cvcheck" value="${p.id}" checked>${safe(p.title)} (${safe(p.year)})</label></div>`).join('')||'<p>Önce yayın ekleyin.</p>'}

// --- SUNUMLAR YÖNETİMİ ---
async function loadPresentations(){
  const {data, error} = await db.from('presentations').select('*').order('created_at', {ascending: false});
  if(error){
    $('presentationsList').innerHTML = `<p>Sunumlar yüklenemedi: ${safe(error.message)}</p>`;
    return;
  }
  presentations = data || [];
  renderPresentations();
}

function renderPresentations(){
  const listEl = $('presentationsList');
  const q = $('presSearch')?.value.toLocaleLowerCase('tr') || '';
  const filtered = presentations.filter(p => p.title.toLocaleLowerCase('tr').includes(q));

  if(!filtered.length){
    listEl.innerHTML = '<p>Eşleşen sunum bulunmuyor.</p>';
    return;
  }
  
  listEl.innerHTML = filtered.map(p => `
    <article class="publication" style="margin-bottom:15px; padding:15px;">
      <h3>${safe(p.title)}</h3>
      <div class="actions" style="margin-top:10px;">
        <a class="button" href="${safe(p.file_url)}" target="_blank" rel="noopener noreferrer">Sunumu Aç / İndir</a>
        <button class="secondary delete-pres" data-id="${p.id}" data-url="${safe(p.file_url)}">Sil</button>
      </div>
    </article>
  `).join('');
}

$('presentationForm').onsubmit = async e => {
  e.preventDefault();
  msg('presMsg', 'Sunum yükleniyor...');
  $('presMsg').className = 'message';

  const title = $('presTitle').value.trim();
  const file = $('presFile').files[0];
  if(!file) { msg('presMsg', 'Lütfen bir dosya seçin.'); return; }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${Date.now()}_${safeName}`;

  const { error: uploadError } = await db.storage.from('sunumlar').upload(filePath, file);

  if(uploadError){
    msg('presMsg', 'Yükleme hatası: ' + uploadError.message);
    return;
  }

  const { data: publicURLData } = db.storage.from('sunumlar').getPublicUrl(filePath);
  const file_url = publicURLData.publicUrl;

  const { error: dbError } = await db.from('presentations').insert([{ title, file_url }]);

  if(dbError){
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

// ŞIK ÖZEL ONAY MODALI (CONFIRM YERİNE)
function showCustomConfirm(title, text, onConfirm) {
  const backdrop = document.createElement('div');
  backdrop.className = 'custom-modal-backdrop';
  backdrop.innerHTML = `
    <div class="custom-modal">
      <h3>${safe(title)}</h3>
      <p>${safe(text)}</p>
      <div class="custom-modal-actions">
        <button id="modalYes" class="danger">Evet, Sil</button>
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

$('presentationsList').onclick = async e => {
  const btn = e.target.closest('.delete-pres');
  if(!btn) return;

  showCustomConfirm('Sunumu Sil', 'Bu sunumu silmek istediğinize emin misiniz?', async () => {
    const id = btn.dataset.id;
    const fileUrl = btn.dataset.url;
    
    try {
      const urlObj = new URL(fileUrl);
      const pathParts = urlObj.pathname.split('/sunumlar/');
      if(pathParts.length > 1) {
        const storagePath = decodeURIComponent(pathParts[1]);
        await db.storage.from('sunumlar').remove([storagePath]);
      }
    } catch(err) {
      console.warn('Storage dosya yolu çözülemedi:', err);
    }

    const { error } = await db.from('presentations').delete().eq('id', id);
    if(error){
      alert('Silme hatası: ' + error.message);
    } else {
      await loadPresentations();
    }
  });
};

if($('presSearch')) {
  $('presSearch').oninput = renderPresentations;
}

$('printCv').onclick = () => {
  const ids = new Set([...document.querySelectorAll('.cvcheck:checked')].map(x => x.value));
  const rows = publications.filter(p => ids.has(String(p.id)));

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
    const pages = p.pages ? ':' + safe(p.pages) : '';
    const details = volume + issue + pages;
    const article = p.article_number ? ' Makale no: ' + safe(p.article_number) + '.' : '';
    const doi = p.doi ? ' DOI: ' + safe(p.doi) : '';

    return `<li>${safe(p.authors)}. ${safe(p.title)}. <em>${safe(p.journal)}</em>. ${safe(p.year)}${details ? ';' + details : ''}.${article}${doi}</li>`;
  };

  const sections = categories.map(([key, label]) => {
    const group = rows.filter(p => (p.publication_category || 'unclassified') === key);
    if (!group.length) return '';
    return `<section><h2>${safe(label)} (${group.length})</h2><ol>${group.map(formatPublication).join('')}</ol></section>`;
  }).join('');

  const w = window.open('', '_blank');
  if (!w) { alert('Tarayıcı açılır pencereyi engelledi.'); return; }

  const html = `<!doctype html><html lang="tr"><head><meta charset="UTF-8"><title>Akademik CV</title><style>body{font:12pt "Times New Roman",serif;margin:35px;line-height:1.5}h1{font-size:20pt}h2{font-size:14pt;margin-top:25px;border-bottom:1px solid #999}li{margin:9px 0;break-inside:avoid;overflow-wrap:anywhere}section{margin-bottom:20px}@media print{@page{size:A4;margin:18mm}body{margin:0}h2{break-after:avoid}}</style></head><body><h1>${safe(profile.full_name || 'Akademik CV')}</h1><p>${safe(profile.specialty)}<br>${safe(profile.institution)}<br>${safe(profile.contact_email)}<br>${safe(profile.orcid)}</p><p>${safe(profile.bio)}</p><h2>Bilimsel Yayınlar - Toplam ${rows.length}</h2>${sections || '<p>Seçili yayın bulunmuyor.</p>'}</body></html>`;

  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
};

$('exportJson').onclick=()=>{const blob=new Blob([JSON.stringify({profile,publications:publications.map(({pdf_path,...rest})=>rest)},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='akademik-yayinlar-yedek.json';a.click();URL.revokeObjectURL(a.href);};
start().catch(e=>msg('globalMsg',e.message));
