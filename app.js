/* LumiRead — app.js */
'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ── STATE ── */
const S = {
  library:[], pdfDoc:null, bookId:null, page:1, totalPages:0,
  zoom:1.2, fitMode:'width', scrollMode:false, rendered:{}, textCache:{},
  darkMode:false, drawMode:false, focusMode:false, drawColour:'#4F46E5',
  hiliteColour:'#FFEAA7', notes:{}, bookmarks:{}, hilites:{}, stickies:{},
  searchHits:[], searchIdx:0, ttsOn:false,
  sessionStart:null, todayMs:0, streak:{}, password:null, pendingId:null,
  drawCtx:null, drawing:false,
};

/* ── INDEXED DB ── */
const DB = {
  _db:null, NAME:'lumiread7', VER:1,
  open(){
    return new Promise((res,rej)=>{
      const req=indexedDB.open(this.NAME,this.VER);
      req.onupgradeneeded=e=>{
        const d=e.target.result;
        if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'id'});
        if(!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs',{keyPath:'id'});
      };
      req.onsuccess=e=>{this._db=e.target.result;res();};
      req.onerror=()=>rej(req.error);
    });
  },
  tx(s,m='readonly'){return this._db.transaction(s,m).objectStore(s);},
  put(s,o){return new Promise((res,rej)=>{const r=this.tx(s,'readwrite').put(o);r.onsuccess=res;r.onerror=()=>rej(r.error);});},
  get(s,id){return new Promise((res,rej)=>{const r=this.tx(s).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},
  getAll(s){return new Promise((res,rej)=>{const r=this.tx(s).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},
  del(s,id){return new Promise((res,rej)=>{const r=this.tx(s,'readwrite').delete(id);r.onsuccess=res;r.onerror=()=>rej(r.error);});},
};

/* ── PERSIST ── */
function save(){
  try{localStorage.setItem('lr7',JSON.stringify({
    darkMode:S.darkMode,notes:S.notes,bookmarks:S.bookmarks,
    hilites:S.hilites,stickies:S.stickies,streak:S.streak,
    todayMs:S.todayMs,password:S.password,
  }));}catch(_){}
}
function load(){
  try{
    const d=JSON.parse(localStorage.getItem('lr7')||'{}');
    S.darkMode=!!d.darkMode; S.notes=d.notes||{}; S.bookmarks=d.bookmarks||{};
    S.hilites=d.hilites||{}; S.stickies=d.stickies||{};
    S.streak=d.streak||{}; S.todayMs=d.todayMs||0; S.password=d.password||null;
  }catch(_){}
}

/* ── DOM ── */
const $=id=>document.getElementById(id);
const screenLanding=$('screenLanding'), screenReader=$('screenReader');
const themeToggleLib=$('themeToggleLib'), fileInput=$('fileInput'), uploadZone=$('uploadZone');
const libSearch=$('libSearch'), clearLibBtn=$('clearLibBtn'), libraryGrid=$('libraryGrid');
const streakCount=$('streakCount'), totalTimeEl=$('totalTime'), bookCountEl=$('bookCount');
const backToLib=$('backToLib'), bookTitle=$('bookTitle');
const themeToggleRdr=$('themeToggleReader'), menuBtn=$('menuBtn');
const progFill=$('progFill');
const pdfArea=$('pdfArea'), pdfScroller=$('pdfScroller'), pdfPages=$('pdfPages');
const drawCanvas=$('drawCanvas'), stickyLayer=$('stickyLayer');
const prevPageBtn=$('prevPage'), nextPageBtn=$('nextPage');
const pageInput=$('pageInput'), totalPagesLabel=$('totalPagesLabel');
const notesTabBtn=$('notesTabBtn'), bookmarkTabBtn=$('bookmarkTabBtn');
const searchTabBtn=$('searchTabBtn'), hiliteTabBtn=$('hiliteTabBtn'), moreTabBtn=$('moreTabBtn');
const sheetBackdrop=$('sheetBackdrop');
const sheetNotes=$('sheetNotes'), notesPgLbl=$('notesPgLbl'), notesEditor=$('notesEditor');
const saveNoteBtn=$('saveNoteBtn'), noteSavedMsg=$('noteSavedMsg'), allNotesList=$('allNotesList');
const sheetBookmarks=$('sheetBookmarks'), addBookmarkBtn=$('addBookmarkBtn'), bmList=$('bmList');
const sheetSearch=$('sheetSearch'), searchInput=$('searchInput'), searchBtn=$('searchBtn');
const prevMatchBtn=$('prevMatch'), nextMatchBtn=$('nextMatch'), matchLabel=$('matchLabel'), searchResults=$('searchResults');
const sheetHilite=$('sheetHilite'), swatchRow=$('swatchRow'), hiliteList=$('hiliteList');
const sheetMore=$('sheetMore'), zoomOutBtn=$('zoomOut'), zoomInBtn=$('zoomIn'), zoomLabel=$('zoomLabel');
const fitWidthBtn=$('fitWidthBtn'), fitPageBtn=$('fitPageBtn'), scrollModeBtn=$('scrollModeBtn');
const ttsBtn=$('ttsBtn'), focusBtn=$('focusBtn'), drawBtn=$('drawBtn'), drawColourPkr=$('drawColourPicker');
const addStickyBtn=$('addStickyBtn'), studyModeBtn=$('studyModeBtn'), genSummaryBtn=$('genSummaryBtn');
const summaryBox=$('summaryBox'), exportTxtBtn=$('exportTxtBtn'), exportMdBtn=$('exportMdBtn');
const exportPdfBtn=$('exportPdfBtn'), lockBtn=$('lockBtn');
const lockModal=$('lockModal'), lockModalTitle=$('lockModalTitle'), lockInput=$('lockInput');
const lockConfirm=$('lockConfirm'), lockCancel=$('lockCancel');
const wordPopup=$('wordPopup'), wpClose=$('wpClose'), wpWord=$('wpWord'), wpPhon=$('wpPhon'), wpPos=$('wpPos'), wpDef=$('wpDef');
const ttsBar=$('ttsBar'), ttsLabel=$('ttsLabel'), ttsStopBtn=$('ttsStopBtn');
const hlToolbar=$('hlToolbar'), hlTbCopy=$('hlTbCopy');
const toastEl=$('toast');

/* ── UTILS ── */
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const today=()=>new Date().toISOString().slice(0,10);
const fmtMs=ms=>{const m=Math.floor(ms/60000);return m<60?m+'m':Math.floor(m/60)+'h '+(m%60)+'m';};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let _toastT;
function toast(msg,ms=2800){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(_toastT);_toastT=setTimeout(()=>toastEl.classList.remove('show'),ms);}

/* ── THEME ── */
function applyTheme(){document.body.classList.toggle('dark',S.darkMode);const i=S.darkMode?'☀️':'🌙';themeToggleLib.textContent=i;themeToggleRdr.textContent=i;}
themeToggleLib.addEventListener('click',()=>{S.darkMode=!S.darkMode;applyTheme();save();});
themeToggleRdr.addEventListener('click',()=>{S.darkMode=!S.darkMode;applyTheme();save();});

/* ── SCREENS ── */
function showScreen(n){screenLanding.classList.toggle('active',n==='landing');screenReader.classList.toggle('active',n==='reader');}

/* ── SHEETS ── */
let _sheet=null;
function openSheet(el){
  closeSheet();_sheet=el;
  sheetBackdrop.classList.remove('hidden');
  el.classList.remove('hidden');
  requestAnimationFrame(()=>el.classList.add('open'));
}
function closeSheet(){
  if(_sheet){_sheet.classList.remove('open');const s=_sheet;_sheet=null;setTimeout(()=>s.classList.add('hidden'),280);}
  sheetBackdrop.classList.add('hidden');
  [notesTabBtn,bookmarkTabBtn,searchTabBtn,hiliteTabBtn,moreTabBtn].forEach(b=>b.classList.remove('on'));
}
sheetBackdrop.addEventListener('click',closeSheet);
document.querySelectorAll('.sheet-x').forEach(b=>b.addEventListener('click',closeSheet));
notesTabBtn.addEventListener('click',()=>{if(_sheet===sheetNotes){closeSheet();return;}openSheet(sheetNotes);notesTabBtn.classList.add('on');loadNote(S.page);refreshAllNotes();});
bookmarkTabBtn.addEventListener('click',()=>{if(_sheet===sheetBookmarks){closeSheet();return;}openSheet(sheetBookmarks);bookmarkTabBtn.classList.add('on');refreshBookmarks();});
searchTabBtn.addEventListener('click',()=>{if(_sheet===sheetSearch){closeSheet();return;}openSheet(sheetSearch);searchTabBtn.classList.add('on');setTimeout(()=>searchInput.focus(),320);});
hiliteTabBtn.addEventListener('click',()=>{if(_sheet===sheetHilite){closeSheet();return;}openSheet(sheetHilite);hiliteTabBtn.classList.add('on');refreshHilites();});
moreTabBtn.addEventListener('click',()=>{if(_sheet===sheetMore){closeSheet();return;}openSheet(sheetMore);moreTabBtn.classList.add('on');});
menuBtn.addEventListener('click',()=>{if(_sheet===sheetMore){closeSheet();return;}openSheet(sheetMore);});

/* ── STATS ── */
function updateStats(){let s=0;const d=new Date();while(S.streak[d.toISOString().slice(0,10)]){s++;d.setDate(d.getDate()-1);}streakCount.textContent=s;totalTimeEl.textContent=fmtMs(S.todayMs);bookCountEl.textContent=S.library.length;}
setInterval(()=>{if(!S.sessionStart||!S.bookId)return;const n=Date.now();S.todayMs+=n-S.sessionStart;S.sessionStart=n;S.streak[today()]=true;save();},15000);

/* ── LIBRARY ── */
async function loadLibrary(){S.library=(await DB.getAll('meta'))||[];renderLibrary();}
function renderLibrary(filter=''){
  const list=filter?S.library.filter(b=>b.name.toLowerCase().includes(filter.toLowerCase())):S.library;
  if(!list.length){libraryGrid.innerHTML='<div class="empty-lib"><span>📚</span><p>No books yet — upload a PDF above!</p></div>';updateStats();return;}
  const G=['linear-gradient(135deg,#4F46E5,#2563EB)','linear-gradient(135deg,#7C3AED,#4F46E5)','linear-gradient(135deg,#0EA5E9,#6366F1)','linear-gradient(135deg,#2563EB,#0EA5E9)','linear-gradient(135deg,#6366F1,#7C3AED)'];
  libraryGrid.innerHTML=list.map((b,i)=>`<div class="book-card" data-id="${b.id}" style="animation-delay:${i*.05}s"><div class="book-cover" style="background:${G[i%G.length]}">📖<button class="book-del" data-del="${b.id}">✕</button></div><div class="book-body"><div class="book-name" title="${esc(b.name)}">${esc(b.name)}</div><div class="book-meta">p.${b.lastPage||1} · ${new Date(b.added).toLocaleDateString()}</div><div class="book-bar"><div class="book-bar-fill" style="width:${b.progress||0}%"></div></div></div></div>`).join('');
  libraryGrid.querySelectorAll('.book-card').forEach(c=>c.addEventListener('click',e=>{if(e.target.closest('[data-del]'))return;openBook(c.dataset.id);}));
  libraryGrid.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();deleteBook(b.dataset.del);}));
  updateStats();
}
libSearch.addEventListener('input',()=>renderLibrary(libSearch.value.trim()));
clearLibBtn.addEventListener('click',async()=>{if(!confirm('Delete ALL books?'))return;for(const b of S.library){await DB.del('meta',b.id).catch(()=>{});await DB.del('blobs',b.id).catch(()=>{});}S.library=[];renderLibrary();save();toast('Library cleared');});

/* ── FILE UPLOAD ── */
fileInput.addEventListener('change',e=>handleFiles([...e.target.files]));
uploadZone.addEventListener('dragover',e=>{e.preventDefault();uploadZone.classList.add('drag-over');});
uploadZone.addEventListener('dragleave',()=>uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop',e=>{e.preventDefault();uploadZone.classList.remove('drag-over');handleFiles([...e.dataTransfer.files].filter(f=>f.type==='application/pdf'));});
async function handleFiles(files){for(const f of files){if(f.type!=='application/pdf'){toast('⚠️ Only PDF supported');continue;}await addBook(f);}}
async function addBook(file){
  toast('⏳ Saving…');
  const bytes=await file.arrayBuffer();const id=uid();
  const meta={id,name:file.name.replace(/\.pdf$/i,''),size:file.size,added:Date.now(),lastPage:1,progress:0};
  await DB.put('meta',meta);await DB.put('blobs',{id,bytes});S.library.push(meta);renderLibrary();save();
  toast(`✅ "${meta.name}" added!`);
}
async function deleteBook(id){if(!confirm('Remove this book?'))return;await DB.del('meta',id).catch(()=>{});await DB.del('blobs',id).catch(()=>{});S.library=S.library.filter(b=>b.id!==id);renderLibrary();save();toast('Book removed');}

/* ── OPEN BOOK ── */
async function openBook(id){
  const meta=S.library.find(b=>b.id===id);
  if(!meta){toast('❌ Book not found');return;}
  if(S.password){S.pendingId=id;showLock('unlock');return;}
  toast('⏳ Opening…');
  let rec;try{rec=await DB.get('blobs',id);}catch(e){toast('❌ Storage error');return;}
  if(!rec||!rec.bytes){toast('❌ PDF missing — please re-upload');return;}
  S.bookId=id;S.page=meta.lastPage||1;S.rendered={};S.totalPages=0;
  S.sessionStart=Date.now();S.streak[today()]=true;
  if(!S.textCache[id])S.textCache[id]={};
  bookTitle.textContent=meta.name;pdfPages.innerHTML='';stickyLayer.innerHTML='';
  drawCanvas.classList.add('hidden');drawCanvas.classList.remove('active');
  drawBtn.classList.remove('on');S.drawMode=false;
  showScreen('reader');closeSheet();hlToolbar.classList.add('hidden');
  let doc;
  try{doc=await pdfjsLib.getDocument({data:rec.bytes.slice(0)}).promise;}
  catch(err){toast('❌ Cannot open: '+err.message);showScreen('landing');return;}
  S.pdfDoc=doc;S.totalPages=doc.numPages;
  totalPagesLabel.textContent=S.totalPages;pageInput.max=S.totalPages;pageInput.value=S.page;
  await waitForLayout();
  await renderPage(S.page);
  prefetch(S.page+1);prefetch(S.page-1);
  updateProgress();loadNote(S.page);renderStickies();saveMeta();
  toast(`📖 ${meta.name} · ${S.totalPages} pages`);
}
function waitForLayout(){
  return new Promise(res=>{
    const d=Date.now()+2500;
    function check(){if((pdfArea.clientWidth>20&&pdfArea.clientHeight>20)||Date.now()>d)res();else requestAnimationFrame(check);}
    requestAnimationFrame(check);
  });
}
function prefetch(p){if(p>=1&&p<=S.totalPages&&!S.rendered[p])renderPage(p).catch(()=>{});}

/* ══════════════════════════════════════════════
   PDF PAGE RENDERING
   
   Layer stack inside each .pdf-page-wrap:
     <canvas>          z-index 0  — visual pixels, pointer-events:none
     .pdf-hl-layer     z-index 1  — coloured highlight boxes
     .pdf-text-layer   z-index 2  — invisible selectable text spans
   
   Text layer uses PDF.js Util.transform to place each word
   exactly over the canvas pixels.
══════════════════════════════════════════════ */
async function renderPage(pageNum){
  if(S.rendered[pageNum])return;
  S.rendered[pageNum]=true;

  let page;
  try{page=await S.pdfDoc.getPage(pageNum);}
  catch(e){S.rendered[pageNum]=false;return;}

  const vp=calcViewport(page);
  const W=Math.floor(vp.width);
  const H=Math.floor(vp.height);
  const dpr=window.devicePixelRatio||1;

  /* page wrapper */
  const wrap=document.createElement('div');
  wrap.className='pdf-page-wrap';
  wrap.dataset.page=pageNum;
  wrap.id='pp-'+pageNum;
  wrap.style.width=W+'px';
  wrap.style.height=H+'px';

  /* canvas — visual only, pointer-events:none in CSS */
  const canvas=document.createElement('canvas');
  canvas.width=Math.floor(W*dpr);
  canvas.height=Math.floor(H*dpr);
  canvas.style.width=W+'px';
  canvas.style.height=H+'px';
  wrap.appendChild(canvas);

  /* highlight layer */
  const hlDiv=document.createElement('div');
  hlDiv.className='pdf-hl-layer';
  hlDiv.dataset.hlPage=pageNum;
  wrap.appendChild(hlDiv);

  /* text layer — selectable transparent spans */
  const textDiv=document.createElement('div');
  textDiv.className='pdf-text-layer';
  textDiv.style.width=W+'px';
  textDiv.style.height=H+'px';
  wrap.appendChild(textDiv);

  /* page label */
  const lbl=document.createElement('div');
  lbl.className='pg-num';
  lbl.textContent=pageNum+' / '+S.totalPages;

  /* insert */
  if(S.scrollMode){
    const after=[...pdfPages.querySelectorAll('.pdf-page-wrap')].find(w=>+w.dataset.page>pageNum);
    if(after){pdfPages.insertBefore(wrap,after);pdfPages.insertBefore(lbl,after);}
    else{pdfPages.appendChild(wrap);pdfPages.appendChild(lbl);}
  }else{
    pdfPages.innerHTML='';pdfPages.appendChild(wrap);pdfPages.appendChild(lbl);
  }

  /* draw canvas */
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  try{await page.render({canvasContext:ctx,viewport:vp}).promise;}catch(_){}

  /* build text layer */
  try{
    const tc=await page.getTextContent();
    if(!S.textCache[S.bookId])S.textCache[S.bookId]={};
    S.textCache[S.bookId][pageNum]=tc.items.map(i=>i.str).join(' ');
    buildTextLayer(tc,textDiv,vp);
  }catch(_){}

  /* re-draw saved highlights */
  setTimeout(()=>redrawPageHighlights(pageNum),300);
}

/* Build transparent selectable text layer manually.
   Each item.transform gives [a,b,c,d,e,f] — font matrix in PDF coords.
   We apply the viewport transform to convert to screen pixels. */
function buildTextLayer(textContent, container, vp){
  textContent.items.forEach(item=>{
    if(!item.str||!item.str.trim())return;

    // Convert PDF item transform to screen coords using viewport transform
    const tx=pdfjsLib.Util.transform(vp.transform, item.transform);

    // Derive font size from the transformed matrix (column vector length)
    const fontSize=Math.sqrt(tx[2]*tx[2]+tx[3]*tx[3]);
    if(fontSize<1)return;

    // tx[4]=screen x, tx[5]=screen y (baseline, measured from top of viewport)
    const x=tx[4];
    const y=tx[5]-fontSize; // shift up from baseline to top of glyph

    // Scale the span horizontally so its width matches the PDF's text width
    const screenWidth=item.width*Math.abs(vp.transform[0]);
    const approxNatural=item.str.length*fontSize*0.55;
    const scaleX=(screenWidth>0&&approxNatural>0)
      ?Math.max(0.1,Math.min(5,screenWidth/approxNatural)):1;

    const span=document.createElement('span');
    span.textContent=item.str;
    // Use setAttribute so inline style overrides everything including !important rules
    span.setAttribute('style',
      'position:absolute;'+
      'left:'+x.toFixed(2)+'px;'+
      'top:'+y.toFixed(2)+'px;'+
      'font-size:'+fontSize.toFixed(2)+'px;'+
      'font-family:sans-serif;'+
      'white-space:pre;'+
      'transform-origin:0% 0%;'+
      'transform:scaleX('+scaleX.toFixed(4)+');'+
      'color:transparent;'+
      'cursor:text;'+
      'user-select:text;'+
      '-webkit-user-select:text;'+
      '-moz-user-select:text;'
    );
    container.appendChild(span);
  });
}

function calcViewport(page){
  let cW=pdfArea.clientWidth||window.innerWidth;
  let cH=pdfArea.clientHeight||window.innerHeight-120;
  if(cW<50)cW=window.innerWidth;
  if(cH<50)cH=window.innerHeight-120;
  const aw=cW-16;
  const ah=cH-16;
  if(S.fitMode==='width'){const b=page.getViewport({scale:1});return page.getViewport({scale:Math.max(0.3,aw/b.width)});}
  if(S.fitMode==='page'){const b=page.getViewport({scale:1});return page.getViewport({scale:Math.max(0.3,Math.min(aw/b.width,ah/b.height))});}
  return page.getViewport({scale:Math.max(0.3,Math.min(5,S.zoom))});
}

function rerender(){
  if(!S.pdfDoc)return;
  pdfPages.innerHTML='';S.rendered={};
  if(S.scrollMode){(async()=>{for(let p=1;p<=S.totalPages;p++)await renderPage(p);})();}
  else{renderPage(S.page).then(()=>{prefetch(S.page+1);prefetch(S.page-1);});}
}
let _resizeT;
window.addEventListener('resize',()=>{clearTimeout(_resizeT);_resizeT=setTimeout(()=>{if(S.pdfDoc)rerender();},350);});

/* ── NAVIGATION ── */
prevPageBtn.addEventListener('click',()=>goTo(S.page-1));
nextPageBtn.addEventListener('click',()=>goTo(S.page+1));
pageInput.addEventListener('change',()=>goTo(parseInt(pageInput.value)||1));

function goTo(n){
  if(!S.pdfDoc)return;n=Math.max(1,Math.min(S.totalPages,n));
  S.page=n;pageInput.value=n;updateProgress();loadNote(n);
  hlToolbar.classList.add('hidden');
  if(S.scrollMode){const el=document.getElementById('pp-'+n);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});markCurrent(n);}
  else{pdfPages.innerHTML='';S.rendered={};renderPage(n).then(()=>{prefetch(n+1);prefetch(n-1);});}
  renderStickies();saveMeta();
}
function markCurrent(n){pdfPages.querySelectorAll('.pdf-page-wrap').forEach(w=>w.classList.toggle('cur-page',+w.dataset.page===n));}
pdfScroller.addEventListener('scroll',()=>{
  if(!S.scrollMode||!S.pdfDoc)return;
  const mid=pdfScroller.scrollTop+pdfScroller.clientHeight/2;
  let best=null,bestD=Infinity;
  pdfPages.querySelectorAll('.pdf-page-wrap').forEach(w=>{const d=Math.abs(w.offsetTop+w.offsetHeight/2-mid);if(d<bestD){bestD=d;best=w;}});
  if(best){const p=+best.dataset.page;if(p!==S.page){S.page=p;pageInput.value=p;updateProgress();loadNote(p);markCurrent(p);}}
},{passive:true});
function updateProgress(){progFill.style.width=(S.totalPages?Math.round(S.page/S.totalPages*100):0)+'%';}
function saveMeta(){const m=S.library.find(b=>b.id===S.bookId);if(!m)return;m.lastPage=S.page;m.progress=S.totalPages?Math.round(S.page/S.totalPages*100):0;DB.put('meta',m).catch(()=>{});save();}

/* ── ZOOM + PINCH ── */
zoomInBtn.addEventListener('click',()=>{S.fitMode=null;updateFitUI();S.zoom=Math.min(5,S.zoom+0.25);zoomLabel.textContent=Math.round(S.zoom*100)+'%';rerender();});
zoomOutBtn.addEventListener('click',()=>{S.fitMode=null;updateFitUI();S.zoom=Math.max(0.3,S.zoom-0.25);zoomLabel.textContent=Math.round(S.zoom*100)+'%';rerender();});
fitWidthBtn.addEventListener('click',()=>{S.fitMode=S.fitMode==='width'?null:'width';zoomLabel.textContent=S.fitMode==='width'?'Auto':Math.round(S.zoom*100)+'%';updateFitUI();rerender();});
fitPageBtn.addEventListener('click',()=>{S.fitMode=S.fitMode==='page'?null:'page';zoomLabel.textContent=S.fitMode==='page'?'Fit':Math.round(S.zoom*100)+'%';updateFitUI();rerender();});
function updateFitUI(){fitWidthBtn.classList.toggle('on',S.fitMode==='width');fitPageBtn.classList.toggle('on',S.fitMode==='page');}
let _pd=0;
pdfScroller.addEventListener('touchstart',e=>{if(e.touches.length===2)_pd=Math.hypot(e.touches[0].pageX-e.touches[1].pageX,e.touches[0].pageY-e.touches[1].pageY);},{passive:true});
pdfScroller.addEventListener('touchmove',e=>{if(e.touches.length!==2||!_pd)return;const d=Math.hypot(e.touches[0].pageX-e.touches[1].pageX,e.touches[0].pageY-e.touches[1].pageY);S.fitMode=null;updateFitUI();S.zoom=Math.max(0.3,Math.min(5,S.zoom*(d/_pd)));zoomLabel.textContent=Math.round(S.zoom*100)+'%';_pd=d;rerender();},{passive:true});
scrollModeBtn.addEventListener('click',()=>{S.scrollMode=!S.scrollMode;scrollModeBtn.classList.toggle('on',S.scrollMode);rerender();toast(S.scrollMode?'📜 Scroll ON':'📄 Single page');});

/* ══════════════════════════════════════════════
   HIGHLIGHT TOOLBAR
   Appears after user selects text on the PDF.
   Works on desktop (mouseup) and mobile (touchend after long-press).
══════════════════════════════════════════════ */
function showHlToolbar(){
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed||!sel.toString().trim()){hideHlToolbar();return;}
  try{
    const rect=sel.getRangeAt(0).getBoundingClientRect();
    if(!rect.width){hideHlToolbar();return;}
    const tbW=220;
    let left=rect.left+rect.width/2-tbW/2;
    let top=rect.top-52;
    left=Math.max(8,Math.min(left,window.innerWidth-tbW-8));
    if(top<8)top=rect.bottom+8;
    hlToolbar.style.left=left+'px';
    hlToolbar.style.top=top+'px';
    hlToolbar.classList.remove('hidden');
  }catch(e){hideHlToolbar();}
}
function hideHlToolbar(){hlToolbar.classList.add('hidden');}

// Listen on the whole document for selection changes
document.addEventListener('selectionchange',()=>{
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed)hideHlToolbar();
});
// mouseup anywhere on pdfPages → check for selection
pdfPages.addEventListener('mouseup',()=>setTimeout(showHlToolbar,80));
// touchend on pdfPages → check after finger lifts (long-press selection)
pdfPages.addEventListener('touchend',()=>setTimeout(showHlToolbar,400));

// Toolbar colour buttons
hlToolbar.querySelectorAll('.hl-tb-btn').forEach(btn=>{
  // mousedown:preventDefault keeps selection alive while clicking button
  btn.addEventListener('mousedown',e=>e.preventDefault());
  btn.addEventListener('click',()=>{
    S.hiliteColour=btn.dataset.col;
    doHighlight();
    hideHlToolbar();
  });
});
// Copy button
hlTbCopy.addEventListener('mousedown',e=>e.preventDefault());
hlTbCopy.addEventListener('click',()=>{
  const txt=window.getSelection()?.toString().trim();
  if(txt)navigator.clipboard?.writeText(txt).catch(()=>{});
  toast('📋 Copied!');hideHlToolbar();window.getSelection()?.removeAllRanges();
});

/* ── HIGHLIGHTS ── */
swatchRow.querySelectorAll('.swatch').forEach(sw=>{
  sw.addEventListener('click',()=>{
    S.hiliteColour=sw.dataset.col;
    swatchRow.querySelectorAll('.swatch').forEach(s=>s.classList.remove('sel'));
    sw.classList.add('sel');
    doHighlight();
  });
});

function doHighlight(){
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed){toast('Select text on the PDF first');return;}
  const text=sel.toString().trim();
  if(!text){toast('No text selected');return;}
  if(!S.hilites[S.bookId])S.hilites[S.bookId]=[];
  const h={id:uid(),page:S.page,text,colour:S.hiliteColour};
  S.hilites[S.bookId].push(h);
  save();refreshHilites();
  redrawPageHighlights(S.page);
  sel.removeAllRanges();
  toast('🖍️ Highlighted!');
}

function redrawPageHighlights(pageNum){
  const wrap=document.getElementById('pp-'+pageNum);if(!wrap)return;
  const hlDiv=wrap.querySelector('.pdf-hl-layer');if(!hlDiv)return;
  const textDiv=wrap.querySelector('.pdf-text-layer');if(!textDiv)return;
  hlDiv.innerHTML='';
  const hs=(S.hilites[S.bookId]||[]).filter(h=>h.page===pageNum);
  if(!hs.length)return;
  const wRect=wrap.getBoundingClientRect();
  const spans=[...textDiv.querySelectorAll('span')];
  hs.forEach(h=>{
    const needle=h.text.replace(/\s+/g,' ').trim().toLowerCase();
    for(let i=0;i<spans.length;i++){
      let buf='';
      for(let j=i;j<Math.min(i+40,spans.length);j++){
        buf+=spans[j].textContent;
        if(buf.replace(/\s+/g,' ').toLowerCase().includes(needle)){
          const fr=wrap.getBoundingClientRect();
          for(let k=i;k<=j;k++){
            const sr=spans[k].getBoundingClientRect();
            if(sr.width<1)continue;
            const box=document.createElement('div');
            box.className='hl-box';
            box.dataset.hlId=h.id;
            box.style.cssText=`left:${sr.left-fr.left}px;top:${sr.top-fr.top}px;width:${sr.width}px;height:${sr.height+2}px;background:${h.colour};`;
            hlDiv.appendChild(box);
          }
          return;
        }
      }
    }
  });
}

function refreshHilites(){
  const hs=S.hilites[S.bookId]||[];
  if(!hs.length){hiliteList.innerHTML='<p class="empty-msg">No highlights yet.</p>';return;}
  hiliteList.innerHTML=hs.map(h=>`<div class="hl-item" style="border-left-color:${h.colour};background:${h.colour}22"><div class="hl-pg"><span>Page ${h.page}</span><span class="hl-rm" data-rm="${h.id}">✕</span></div>${esc(h.text.slice(0,120))}${h.text.length>120?'…':''}</div>`).join('');
  hiliteList.querySelectorAll('[data-rm]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.rm;
    S.hilites[S.bookId]=S.hilites[S.bookId].filter(h=>h.id!==id);
    document.querySelectorAll('[data-hl-id="'+id+'"]').forEach(e=>e.remove());
    save();refreshHilites();
  }));
}

/* ── NOTES ── */
function loadNote(p){const t=S.notes[S.bookId]?.[p]??'';notesPgLbl.textContent='Notes — Page '+p;notesEditor.value=t;}
saveNoteBtn.addEventListener('click',doSaveNote);
notesEditor.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='s'){e.preventDefault();doSaveNote();}});
function doSaveNote(){if(!S.bookId)return;if(!S.notes[S.bookId])S.notes[S.bookId]={};S.notes[S.bookId][S.page]=notesEditor.value;save();refreshAllNotes();noteSavedMsg.textContent='✓ Saved';setTimeout(()=>noteSavedMsg.textContent='',2000);toast('📝 Saved');}
function refreshAllNotes(){const ns=S.notes[S.bookId]||{};const pages=Object.keys(ns).filter(p=>ns[p]?.trim()).sort((a,b)=>+a-+b);if(!pages.length){allNotesList.innerHTML='<p class="empty-msg">No notes yet.</p>';return;}allNotesList.innerHTML=pages.map(p=>`<div class="note-card" data-p="${p}"><div class="note-card-pg">Page ${p}</div>${esc(ns[p].slice(0,100))}${ns[p].length>100?'…':''}</div>`).join('');allNotesList.querySelectorAll('.note-card').forEach(c=>c.addEventListener('click',()=>{goTo(+c.dataset.p);closeSheet();}));}

/* ── BOOKMARKS ── */
addBookmarkBtn.addEventListener('click',()=>{if(!S.pdfDoc)return;if(!S.bookmarks[S.bookId])S.bookmarks[S.bookId]=[];if(S.bookmarks[S.bookId].includes(S.page)){toast('Already bookmarked');return;}S.bookmarks[S.bookId].push(S.page);S.bookmarks[S.bookId].sort((a,b)=>a-b);save();refreshBookmarks();toast('🔖 Page '+S.page+' bookmarked');});
function refreshBookmarks(){const bms=S.bookmarks[S.bookId]||[];if(!bms.length){bmList.innerHTML='<p class="empty-msg">No bookmarks yet.</p>';return;}bmList.innerHTML=bms.map(p=>`<div class="bm-item" data-p="${p}"><span class="bm-pg">Page ${p}</span><button class="bm-rm" data-rm="${p}">✕</button></div>`).join('');bmList.querySelectorAll('.bm-item').forEach(i=>i.addEventListener('click',e=>{if(e.target.closest('[data-rm]'))return;goTo(+i.dataset.p);closeSheet();}));bmList.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',()=>{S.bookmarks[S.bookId]=S.bookmarks[S.bookId].filter(x=>x!==+b.dataset.rm);save();refreshBookmarks();}));}

/* ── SEARCH ── */
searchBtn.addEventListener('click',doSearch);
searchInput.addEventListener('keydown',e=>{if(e.key==='Enter')doSearch();});
prevMatchBtn.addEventListener('click',()=>stepSearch(-1));
nextMatchBtn.addEventListener('click',()=>stepSearch(1));
async function doSearch(){
  const q=searchInput.value.trim();if(!q||!S.pdfDoc){toast('Enter a search term');return;}
  toast('🔎 Searching…');S.searchHits=[];
  for(let p=1;p<=S.totalPages;p++){
    if(!S.textCache[S.bookId]?.[p]){
      try{const pg=await S.pdfDoc.getPage(p);const tc=await pg.getTextContent();if(!S.textCache[S.bookId])S.textCache[S.bookId]={};S.textCache[S.bookId][p]=tc.items.map(i=>i.str).join(' ');}catch(_){continue;}
    }
    const txt=S.textCache[S.bookId][p]||'';
    const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
    let m;while((m=re.exec(txt))!==null)S.searchHits.push({page:p,snippet:txt.slice(Math.max(0,m.index-50),m.index+q.length+50)});
  }
  S.searchIdx=0;renderSearchResults(q);updateMatchLabel();
  if(S.searchHits.length)stepSearch(0);else toast('No matches found');
}
function renderSearchResults(q){
  if(!S.searchHits.length){searchResults.innerHTML='<p class="empty-msg">No results.</p>';return;}
  const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
  searchResults.innerHTML=S.searchHits.slice(0,80).map((h,i)=>{
    const marked=h.snippet.replace(re,m=>'\x00'+m+'\x01');
    const safe=esc(marked).replace(/\x00([^\x01]*)\x01/g,'<mark>$1</mark>');
    return `<div class="sr-item" data-i="${i}"><span class="sr-pg">p.${h.page}</span> — ${safe}</div>`;
  }).join('');
  searchResults.querySelectorAll('.sr-item').forEach(item=>item.addEventListener('click',()=>{S.searchIdx=+item.dataset.i;stepSearch(0);closeSheet();}));
}
function stepSearch(dir){if(!S.searchHits.length)return;if(dir!==0)S.searchIdx=(S.searchIdx+dir+S.searchHits.length)%S.searchHits.length;goTo(S.searchHits[S.searchIdx].page);updateMatchLabel();}
function updateMatchLabel(){matchLabel.textContent=S.searchHits.length?`${S.searchIdx+1} / ${S.searchHits.length}`:'0 / 0';}

/* ── DICTIONARY (double-tap) ── */
pdfPages.addEventListener('dblclick',e=>{
  const sel=window.getSelection();
  const word=(sel&&!sel.isCollapsed?sel.toString():getWordAtPoint(e)).trim().replace(/[^a-zA-Z'-]/g,'');
  if(!word||word.length<2)return;
  wpWord.textContent=word;wpPhon.textContent='';wpPos.textContent='';wpDef.textContent='Looking up…';
  wordPopup.classList.remove('hidden');
  wordPopup.style.left=Math.min(e.clientX+10,window.innerWidth-290)+'px';
  wordPopup.style.top=Math.min(e.clientY+10,window.innerHeight-200)+'px';
  fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word))
    .then(r=>r.ok?r.json():Promise.reject())
    .then(d=>{const m=d[0]?.meanings?.[0];wpDef.textContent=m?.definitions?.[0]?.definition||'No definition';wpPhon.textContent=d[0]?.phonetic||'';wpPos.textContent=m?.partOfSpeech?`[${m.partOfSpeech}]`:''})
    .catch(()=>{wpDef.textContent='Not available offline.';});
});
function getWordAtPoint(e){try{const r=document.caretRangeFromPoint?document.caretRangeFromPoint(e.clientX,e.clientY):null;if(!r)return'';r.expand('word');return r.toString();}catch(_){return '';}}
wpClose.addEventListener('click',()=>wordPopup.classList.add('hidden'));

/* ── TTS ── */
function stopTTS(){speechSynthesis.cancel();S.ttsOn=false;ttsBtn.classList.remove('on');ttsBar.classList.add('hidden');}
ttsBtn.addEventListener('click',()=>{
  if(S.ttsOn){stopTTS();return;}
  const text=S.textCache[S.bookId]?.[S.page];if(!text){toast('No readable text');return;}
  const u=new SpeechSynthesisUtterance(text);u.rate=0.92;u.onend=stopTTS;
  speechSynthesis.speak(u);S.ttsOn=true;ttsBtn.classList.add('on');
  ttsLabel.textContent='Reading page '+S.page+'…';ttsBar.classList.remove('hidden');closeSheet();
});
ttsStopBtn.addEventListener('click',stopTTS);

/* ── DRAW ── */
drawColourPkr.addEventListener('input',()=>{S.drawColour=drawColourPkr.value;if(S.drawCtx)S.drawCtx.strokeStyle=S.drawColour;});
drawBtn.addEventListener('click',()=>{
  S.drawMode=!S.drawMode;drawBtn.classList.toggle('on',S.drawMode);
  if(S.drawMode){
    drawCanvas.width=pdfArea.clientWidth;drawCanvas.height=pdfArea.clientHeight;
    drawCanvas.classList.remove('hidden');drawCanvas.classList.add('active');
    S.drawCtx=drawCanvas.getContext('2d');S.drawCtx.strokeStyle=S.drawColour;S.drawCtx.lineWidth=3;S.drawCtx.lineCap=S.drawCtx.lineJoin='round';
    closeSheet();toast('✏️ Draw mode ON');
  }else{drawCanvas.classList.add('hidden');drawCanvas.classList.remove('active');}
});
drawCanvas.addEventListener('mousedown',e=>{if(!S.drawMode)return;S.drawing=true;const r=drawCanvas.getBoundingClientRect();S.drawCtx.beginPath();S.drawCtx.moveTo(e.clientX-r.left,e.clientY-r.top);});
drawCanvas.addEventListener('mousemove',e=>{if(!S.drawing)return;const r=drawCanvas.getBoundingClientRect();S.drawCtx.lineTo(e.clientX-r.left,e.clientY-r.top);S.drawCtx.stroke();});
['mouseup','mouseleave'].forEach(ev=>drawCanvas.addEventListener(ev,()=>S.drawing=false));
drawCanvas.addEventListener('touchstart',e=>{if(!S.drawMode)return;e.preventDefault();const r=drawCanvas.getBoundingClientRect();S.drawing=true;S.drawCtx.beginPath();S.drawCtx.moveTo(e.touches[0].clientX-r.left,e.touches[0].clientY-r.top);},{passive:false});
drawCanvas.addEventListener('touchmove',e=>{if(!S.drawing)return;e.preventDefault();const r=drawCanvas.getBoundingClientRect();S.drawCtx.lineTo(e.touches[0].clientX-r.left,e.touches[0].clientY-r.top);S.drawCtx.stroke();},{passive:false});
drawCanvas.addEventListener('touchend',()=>S.drawing=false);

/* ── STICKIES ── */
addStickyBtn.addEventListener('click',()=>{placeSticky(60,80);closeSheet();});
function placeSticky(x,y){if(!S.bookId)return;const s={id:uid(),page:S.page,x,y,w:180,h:120,text:''};if(!S.stickies[S.bookId])S.stickies[S.bookId]=[];S.stickies[S.bookId].push(s);save();buildSticky(s);toast('🗒️ Sticky added');}
function renderStickies(){stickyLayer.innerHTML='';(S.stickies[S.bookId]||[]).filter(s=>S.scrollMode||s.page===S.page).forEach(buildSticky);}
function buildSticky(s){
  const el=document.createElement('div');el.className='sticky-note';
  el.style.cssText=`left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`;
  el.innerHTML=`<div class="sticky-hd"><small>p.${s.page}</small><span class="sticky-del">✕</span></div><textarea class="sticky-ta" placeholder="Note…">${esc(s.text)}</textarea>`;
  stickyLayer.appendChild(el);el.style.pointerEvents='all';stickyLayer.style.pointerEvents='none';
  el.querySelector('.sticky-ta').addEventListener('input',e=>{s.text=e.target.value;save();});
  el.querySelector('.sticky-del').addEventListener('click',()=>{S.stickies[S.bookId]=S.stickies[S.bookId].filter(x=>x.id!==s.id);save();el.remove();});
  let dr=false,ox=0,oy=0;
  const hd=el.querySelector('.sticky-hd');
  hd.addEventListener('touchstart',e=>{dr=true;ox=e.touches[0].clientX-s.x;oy=e.touches[0].clientY-s.y;},{passive:true});
  document.addEventListener('touchmove',e=>{if(!dr)return;s.x=e.touches[0].clientX-ox;s.y=e.touches[0].clientY-oy;el.style.left=s.x+'px';el.style.top=s.y+'px';},{passive:true});
  document.addEventListener('touchend',()=>{if(dr){dr=false;save();}});
  hd.addEventListener('mousedown',e=>{dr=true;ox=e.clientX-s.x;oy=e.clientY-s.y;e.preventDefault();});
  document.addEventListener('mousemove',e=>{if(!dr)return;s.x=e.clientX-ox;s.y=e.clientY-oy;el.style.left=s.x+'px';el.style.top=s.y+'px';});
  document.addEventListener('mouseup',()=>{if(dr){dr=false;save();}});
}

/* ── FOCUS MODE ── */
focusBtn.addEventListener('click',toggleFocus);
function toggleFocus(){S.focusMode=!S.focusMode;document.body.classList.toggle('focus-mode',S.focusMode);focusBtn.classList.toggle('on',S.focusMode);if(S.focusMode)closeSheet();toast(S.focusMode?'🎯 Focus ON':'Focus OFF');}

/* ── STUDY / EXPORT ── */
studyModeBtn.addEventListener('click',()=>{
  const hs=S.hilites[S.bookId]||[];if(!hs.length){toast('Add highlights first');return;}
  const ov=document.createElement('div');ov.className='study-overlay';
  ov.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h2>📖 Study Mode</h2><button class="btn-primary" id="_sc">✕ Close</button></div>${hs.map(h=>`<div class="study-hl" style="border-left-color:${h.colour};background:${h.colour}28"><div class="study-hl-pg">Page ${h.page}</div>${esc(h.text)}</div>`).join('')}`;
  document.body.appendChild(ov);ov.querySelector('#_sc').addEventListener('click',()=>ov.remove());closeSheet();
});
genSummaryBtn.addEventListener('click',()=>{
  const hs=S.hilites[S.bookId]||[];const ns=S.notes[S.bookId]||{};
  if(!hs.length&&!Object.values(ns).some(v=>v?.trim())){summaryBox.textContent='No highlights or notes yet.';return;}
  let out='';if(hs.length){out+=`HIGHLIGHTS (${hs.length}):\n`;hs.forEach(h=>{out+=`• [p.${h.page}] ${h.text.slice(0,80)}\n`;});}
  const pg=Object.keys(ns).filter(p=>ns[p]?.trim()).sort((a,b)=>+a-+b);
  if(pg.length){out+='\nNOTES:\n';pg.forEach(p=>{out+=`• [p.${p}] ${ns[p].slice(0,80)}\n`;});}
  summaryBox.textContent=out;
});
exportTxtBtn.addEventListener('click',()=>doExport('txt'));
exportMdBtn.addEventListener('click',()=>doExport('md'));
exportPdfBtn.addEventListener('click',()=>doExport('pdf'));
function doExport(fmt){
  const meta=S.library.find(b=>b.id===S.bookId);const title=meta?.name||'Book';
  const notes=S.notes[S.bookId]||{};const hs=S.hilites[S.bookId]||[];const bms=S.bookmarks[S.bookId]||[];
  let content='';
  if(fmt==='md'){content=`# ${title}\n_${new Date().toLocaleDateString()}_\n\n`;if(bms.length)content+=`## 🔖 Bookmarks\n${bms.map(p=>`- Page ${p}`).join('\n')}\n\n`;if(hs.length){content+='## 🖍️ Highlights\n';hs.forEach(h=>content+=`### Page ${h.page}\n> ${h.text}\n\n`);}const pg=Object.keys(notes).filter(p=>notes[p]?.trim()).sort((a,b)=>+a-+b);if(pg.length){content+='## 📝 Notes\n';pg.forEach(p=>content+=`### Page ${p}\n${notes[p]}\n\n`);}}
  else{content=`${title}\n${new Date().toLocaleDateString()}\n${'─'.repeat(40)}\n\n`;if(bms.length)content+=`BOOKMARKS:\n${bms.map(p=>`  p.${p}`).join('\n')}\n\n`;if(hs.length){content+='HIGHLIGHTS:\n';hs.forEach(h=>content+=`  [p.${h.page}] ${h.text}\n`);content+='\n';}const pg=Object.keys(notes).filter(p=>notes[p]?.trim()).sort((a,b)=>+a-+b);if(pg.length){content+='NOTES:\n';pg.forEach(p=>content+=`  [p.${p}]\n  ${notes[p]}\n\n`);}}
  if(fmt==='pdf'){window.print();return;}
  const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`${title}.${fmt}`}).click();
  toast(`✅ Exported .${fmt}`);closeSheet();
}

/* ── LOCK ── */
lockBtn.addEventListener('click',()=>{if(S.password){if(confirm('Remove password?')){S.password=null;save();toast('🔓 Removed');}}else showLock('set');});
function showLock(mode){lockModalTitle.textContent=mode==='set'?'🔐 Set Password':'🔐 Enter Password';lockInput.value='';lockModal.classList.remove('hidden');lockModal.dataset.mode=mode;setTimeout(()=>lockInput.focus(),80);}
lockConfirm.addEventListener('click',()=>{
  const pw=lockInput.value.trim();const mode=lockModal.dataset.mode;if(!pw){toast('Enter a password');return;}
  if(mode==='set'){S.password=pw;save();lockModal.classList.add('hidden');toast('🔐 Password set!');}
  else{if(pw!==S.password){toast('❌ Wrong password');lockInput.value='';return;}lockModal.classList.add('hidden');if(S.pendingId){const id=S.pendingId;S.pendingId=null;const pwd=S.password;S.password=null;openBook(id).then(()=>{S.password=pwd;});}}
});
lockCancel.addEventListener('click',()=>lockModal.classList.add('hidden'));
lockInput.addEventListener('keydown',e=>{if(e.key==='Enter')lockConfirm.click();});

/* ── BACK ── */
backToLib.addEventListener('click',()=>{
  stopTTS();closeSheet();S.pdfDoc=null;S.bookId=null;S.sessionStart=null;
  pdfPages.innerHTML='';stickyLayer.innerHTML='';
  drawCanvas.classList.add('hidden');drawCanvas.classList.remove('active');
  if(S.focusMode){S.focusMode=false;document.body.classList.remove('focus-mode');}
  hlToolbar.classList.add('hidden');
  showScreen('landing');renderLibrary();updateStats();
});

/* ── KEYBOARD ── */
document.addEventListener('keydown',e=>{
  if(!S.pdfDoc)return;const tag=document.activeElement.tagName;if(tag==='INPUT'||tag==='TEXTAREA')return;
  switch(e.key){
    case 'ArrowRight':case 'ArrowDown':e.preventDefault();goTo(S.page+1);break;
    case 'ArrowLeft':case 'ArrowUp':e.preventDefault();goTo(S.page-1);break;
    case 'f':case 'F':toggleFocus();break;
    case 'Escape':closeSheet();wordPopup.classList.add('hidden');lockModal.classList.add('hidden');document.querySelectorAll('.study-overlay').forEach(o=>o.remove());if(S.focusMode)toggleFocus();break;
  }
});

/* ── LIFECYCLE ── */
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(S.ttsOn)stopTTS();if(S.bookId)saveMeta();save();}});
window.addEventListener('beforeunload',()=>{if(S.bookId)saveMeta();save();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

/* ── INIT ── */
async function init(){
  load();applyTheme();S.fitMode='width';updateFitUI();zoomLabel.textContent='Auto';
  await DB.open();await loadLibrary();showScreen('landing');updateStats();
  setInterval(updateStats,60000);
  console.log('%c⚡ LumiRead ready','color:#39FF14;font-weight:bold;font-size:14px');
}
init();
