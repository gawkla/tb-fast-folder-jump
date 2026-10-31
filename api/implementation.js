/* Inline toolbar experiment: Shift-only shortcuts are not supported by WebExtension commands.
   The panel and its listeners are mounted once in each mail 3-pane document.
   On shortcut, no folder traversal, no window creation and no async APIs run. */
var { ExtensionCommon } = ChromeUtils.importESModule('resource://gre/modules/ExtensionCommon.sys.mjs');
const FFJ_PREFIX = 'ffj011-';
const FFJ_MOUNTS = new Map();
const FFJ_ACTIONS = new Set();
let FFJ_DATA = {folders:[],settings:{listLength:12,recent:[],lastKey:'',exclusions:[]}};
let FFJ_PREPARED = [];
let FFJ_TIMER = null, FFJ_TIMER_WIN = null, FFJ_LAST_ERROR = null;
let FFJ_LAST_DOC = null;
function ffjNormalize(s){return String(s||'').normalize('NFKD').toLocaleLowerCase('en');}
function ffjAlreadyExcluded(folder, exclusions){
  return (exclusions || []).some(x=>x.accountId===folder.accountId &&
    (x.path===folder.path || (x.descendants && folder.path.startsWith(x.path.replace(/\/$/,'')+'/'))));
}
function ffjFilter(folders, query, settings, limit=12){
  const trimmedQuery=String(query || '').trimEnd();
  const all=trimmedQuery.endsWith('!');
  const q=ffjNormalize(all ? trimmedQuery.slice(0,-1):trimmedQuery).trim();
  const words=q.split(/\s+/).filter(Boolean);
  const exclusions=all ? [] : (settings.exclusions || []);
  const recent=settings.recent || [];
  const last=settings.lastKey;
  const ranked=[];
  for (const f of folders){
    if(ffjAlreadyExcluded(f, exclusions)) continue;
    const searchable=f._search || ffjNormalize(f.search || (f.name+' '+f.display));
    if(words.some(w=>!searchable.includes(w)))continue;
    const name=f._name || ffjNormalize(f.name);
    const path=f._display || ffjNormalize(f.display);
    let rank=0;
    if(!q){
      rank=f.key===last ? 100000 : (recent.includes(f.key) ? 50000-recent.indexOf(f.key)*100 : 0);
    }else{
      rank=(name===q ? 90000 : name.startsWith(q) ? 40000 : name.includes(q) ? 25000 : path.includes(q) ? 10000 : 1000);
      if(f.key===last) rank+=3000;
      if(recent.includes(f.key))rank+=1500-recent.indexOf(f.key)*50;
    }
    if(f.canFile === false)rank-=80000;
    ranked.push({f,rank});
  }
  ranked.sort((a,b)=>b.rank-a.rank || a.f.display.localeCompare(b.f.display,'en'));
  return {total:ranked.length,items:ranked.slice(0,limit).map(x=>x.f)};
}
function ffjPrepare(){
  FFJ_PREPARED=(FFJ_DATA.folders || []).map(f=>({...f,_search:ffjNormalize(f.search||f.name+' '+f.display),_name:ffjNormalize(f.name),_display:ffjNormalize(f.display)}));
}
function ffjNotify(action){
  for(const fire of FFJ_ACTIONS) {try{fire.async(action);}catch(e){FFJ_LAST_ERROR=String(e);}}
}
function ffjMailDocs(){
  const docs=[];
  const it=Services.wm.getEnumerator('mail:3pane');
  while(it.hasMoreElements()){
    const win=it.getNext();
    try{
      const tabmail=win.gTabmail || win.document.getElementById('tabmail');
      for(const tab of tabmail?.tabInfo || []){
        if(tab.mode?.name!=='mail3PaneTab')continue;
        const doc=tab.chromeBrowser?.contentDocument || tab.chromeBrowser?.contentWindow?.document;
        if(doc?.getElementById('folderTree') && !docs.some(x=>x.doc===doc))docs.push({doc,win});
      }
      const doc=tabmail?.currentAbout3Pane?.document;
      if(doc?.getElementById('folderTree') && !docs.some(x=>x.doc===doc))docs.push({doc,win});
    }catch(e){FFJ_LAST_ERROR='scan: '+String(e);}
  }
  return docs;
}
function ffjIsEditing(element){
  if(!element) return false;
  if(element.isContentEditable)return true;
  const tag=String(element.localName||'').toLowerCase();
  if(['input','textarea','select'].includes(tag))return true;
  try{if(element.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"]'))return true;}catch(_){ }
  return false;
}
function ffjMount(doc, win){
  if(FFJ_MOUNTS.has(doc) && doc.getElementById(FFJ_PREFIX+'overlay'))return;
  if(!doc.body || !doc.head)return;
  const $=(tag,klass,text)=>{const el=doc.createElement(tag);if(klass)el.className=klass;if(text!=null)el.textContent=text;return el;};
  const style=$('style'); style.id=FFJ_PREFIX+'style';
  style.textContent=`
    #${FFJ_PREFIX}overlay{display:none;position:fixed;inset:0;background:#edf2f8;z-index:2147483000;align-items:flex-start;justify-content:center;padding-top:min(12vh,104px);box-sizing:border-box}
    #${FFJ_PREFIX}overlay.ffj-show{display:flex}
    #${FFJ_PREFIX}box{width:min(860px,96vw);max-height:82vh;background:#ffffff;color:#172332;border:1px solid #8ea7c0;border-radius:12px;box-shadow:0 15px 58px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;font:14px/1.35 sans-serif}
    #${FFJ_PREFIX}head{display:flex;align-items:center;justify-content:space-between;padding:10px 13px 8px;gap:14px;background:#dbe7f4;border-bottom:1px solid #c4d4e4}
    #${FFJ_PREFIX}left{display:flex;align-items:center;gap:10px;min-width:0}
    .ffj-title{font-weight:750;color:#172332;letter-spacing:.01em}
    .ffj-mini{font-size:11px;color:#516579}
    .ffj-tabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .ffj-tab{appearance:none;border:1px solid #9db4cb;border-radius:8px;padding:7px 12px;background:#ffffff;color:#24435f;cursor:pointer;font:600 13px sans-serif}
    .ffj-tab.ffj-active{background:#1e69b1;color:#fff;border-color:#1e69b1}
    #${FFJ_PREFIX}search{display:block;box-sizing:border-box;width:calc(100% - 26px);margin:10px 13px 8px;padding:12px 11px;border:2px solid #4b8ff6;border-radius:8px;background:#fff;color:#172332;font:16px sans-serif;outline:none}
    #${FFJ_PREFIX}list{overflow:auto;min-height:34px;max-height:min(66vh,700px);padding:0 9px 7px;background:#fff}
    .ffj-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:7px 10px;min-height:38px;box-sizing:border-box;background:#ffffff;border:0;border-radius:6px;color:inherit;cursor:pointer;font:13px sans-serif}
    .ffj-row.ffj-selected{background:#dcecff;color:#102d52}
    .ffj-row:hover{background:#edf3fc;color:#172332}
    .ffj-icon{flex:0 0 21px;font-size:17px}
    .ffj-label{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ffj-label strong{font-size:13px;font-weight:720;margin-right:7px}
    .ffj-path{font-size:12px;opacity:.78}
    .ffj-last{border-radius:4px;background:#fff3b7;color:#6a4d00;font-size:10px;padding:2px 5px}
    /* Span avoids Thunderbird's global button minimum-width, which stretched the minus into an oval. */
    .ffj-exclude{display:inline-flex;align-items:center;justify-content:center;flex:0 0 20px;min-width:20px;max-width:20px;width:20px;min-height:20px;max-height:20px;height:20px;margin:0 0 0 7px;border:1px solid #c23440;border-radius:50%;background:#d93542;color:#fff;cursor:pointer;font:700 15px/1 sans-serif;padding:0;box-sizing:border-box;white-space:nowrap;user-select:none;align-self:center}
    .ffj-exclude:hover{background:#ab2030;border-color:#8f1927}
    .ffj-exclude:focus-visible{outline:2px solid #145da8;outline-offset:2px}
    .ffj-exclude[aria-disabled="true"]{background:#e4e8ed;border-color:#c5cbd3;color:#86909a;cursor:default}
    .ffj-empty{padding:14px;font-size:13px;opacity:.80}
    #${FFJ_PREFIX}foot{padding:8px 13px;background:#eef3f8;border-top:1px solid #d9dee8;display:flex;gap:8px;align-items:center;justify-content:space-between;color:inherit;font:11px sans-serif}
    #${FFJ_PREFIX}foot button{background:transparent;color:inherit;border:0;cursor:pointer;text-decoration:underline;font:inherit;padding:0}
    #${FFJ_PREFIX}status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #${FFJ_PREFIX}toast{position:fixed;z-index:2147483001;bottom:20px;left:50%;transform:translateX(-50%);padding:11px 18px;background:#9b2c2c;color:#fff;border-radius:8px;box-shadow:0 8px 24px #0005;font:13px sans-serif;display:none;max-width:80vw}
  `;
  doc.head.appendChild(style);
  const overlay=$('div');overlay.id=FFJ_PREFIX+'overlay';
  const box=$('div');box.id=FFJ_PREFIX+'box';
  const head=$('div');head.id=FFJ_PREFIX+'head';
  const left=$('div');left.id=FFJ_PREFIX+'left';
  const titleWrap=$('div');
  const title=$('div','ffj-title','Fast Folder Jump');
  const hint=$('div','ffj-mini','Local Folders only · Shift+M / Shift+C / Shift+G');
  titleWrap.append(title,hint);
  const tabs=$('div','ffj-tabs');
  const moveBtn=$('button','ffj-tab','Move');moveBtn.type='button';
  const copyBtn=$('button','ffj-tab','Copy');copyBtn.type='button';
  const goBtn=$('button','ffj-tab','Jump to');goBtn.type='button';
  tabs.append(moveBtn,copyBtn,goBtn);
  left.append(titleWrap);
  head.append(left,tabs);
  const search=$('input');search.id=FFJ_PREFIX+'search';search.type='text';search.placeholder='Search local folders…  (end with ! to include excluded)';search.autocomplete='off';search.spellcheck=false;
  const list=$('div');list.id=FFJ_PREFIX+'list';list.setAttribute('role','listbox');
  const foot=$('div');foot.id=FFJ_PREFIX+'foot';
  const status=$('span');status.id=FFJ_PREFIX+'status';status.textContent='Enter: select · Ctrl+Enter: move/copy and jump · Esc: close';
  const opts=$('button',null,'Settings');opts.type='button';
  const reload=$('button',null,'Refresh folders');reload.type='button';
  foot.append(status,reload,opts);
  box.append(head,search,list,foot);overlay.appendChild(box);doc.body.appendChild(overlay);
  const toast=$('div');toast.id=FFJ_PREFIX+'toast';doc.body.appendChild(toast);
  let mode='move',selected=0,items=[],visible=false,toastTimer=null;
  function updateModeButtons(){
    moveBtn.classList.toggle('ffj-active',mode==='move');
    copyBtn.classList.toggle('ffj-active',mode==='copy');
    goBtn.classList.toggle('ffj-active',mode==='go');
  }
  function close(){visible=false;overlay.classList.remove('ffj-show');search.blur();}
  function render(){
    const count=Math.max(4,Math.min(30,Number(FFJ_DATA.settings?.listLength)||12));
    const result=ffjFilter(FFJ_PREPARED,search.value,FFJ_DATA.settings||{},count);
    items=result.items;
    selected=Math.min(selected,Math.max(0,items.length-1));
    list.replaceChildren();
    if(!items.length){
      const empty=$('div','ffj-empty',FFJ_PREPARED.length?'No matching folders. Add ! at the end to include excluded folders.':'Indexing local folders… press F5 to refresh.');
      list.append(empty);
    }
    for(let i=0;i<items.length;i++){
      const f=items[i];
      // A div row avoids invalid nested buttons: the red exclusion control is its own button.
      const row=$('div','ffj-row'+(i===selected?' ffj-selected':'')); row.setAttribute('role','option');row.setAttribute('aria-selected',String(i===selected));
      const folderIcon=$('span','ffj-icon','📁');const label=$('span','ffj-label');
      const strong=$('strong',null,f.name);const path=$('span','ffj-path',f.display);
      label.append(strong,path);row.append(folderIcon,label);
      if(f.key===FFJ_DATA.settings?.lastKey)row.append($('span','ffj-last','LAST'));
      const excluded=ffjAlreadyExcluded(f,FFJ_DATA.settings?.exclusions);
      // Not a native <button>: Thunderbird forces a large global minimum button width.
      const exclude=$('span','ffj-exclude','−');
      exclude.setAttribute('role','button');exclude.tabIndex=excluded?-1:0;
      exclude.title=excluded?'Already excluded':'Exclude from search';
      exclude.setAttribute('aria-label',excluded?'Already excluded: '+f.name:'Exclude from search: '+f.name);
      exclude.setAttribute('aria-disabled',String(excluded));
      const doExclude=e=>{
        e.preventDefault();e.stopPropagation();
        // Optimistic update, so the row disappears instantly in ordinary search.
        const exclusions=FFJ_DATA.settings.exclusions || [];
        if(ffjAlreadyExcluded(f,exclusions))return;
        FFJ_DATA.settings.exclusions=[...exclusions,{
          accountId:f.accountId,path:f.path,display:f.display,descendants:false
        }];
        selected=0;
        render();
        search.focus();
        ffjNotify({type:'exclude',key:f.key});
      };
      exclude.addEventListener('click',doExclude);
      exclude.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){doExclude(e);}
      });
      row.append(exclude);
      row.addEventListener('mouseenter',()=>{selected=i;selectOnly();});
      row.addEventListener('click',()=>{selected=i;execute(false);});
      list.append(row);
    }
    const verb = mode==='move' ? 'move' : mode==='copy' ? 'copy' : 'jump';
    status.textContent=`${result.total} folder(s) · Enter: ${verb} · Ctrl+Enter: ${verb}${mode==='go' ? '' : '+jump'} · Esc: close`;
    updateModeButtons();
  }
  function selectOnly(){let i=0;for(const r of list.children){if(r.classList.contains('ffj-row')){r.classList.toggle('ffj-selected',i===selected);r.setAttribute('aria-selected',String(i===selected));i++;}}}
  function show(nextMode){
    mode=nextMode;selected=0;search.value='';
    overlay.classList.add('ffj-show');visible=true;FFJ_LAST_DOC=doc;
    render();search.focus();search.select();
  }
  function execute(goAfter){
    const f=items[selected];if(!f)return;
    if(mode!=='go' && f.canFile===false){error('This destination does not allow storing messages.');return;}
    const currentMode=mode;close();
    ffjNotify({type:'execute',mode:currentMode,key:f.key,goAfter:!!goAfter && currentMode!=='go'});
  }
  function error(message){
    toast.textContent=String(message);toast.style.display='block';
    if(toastTimer!==null)doc.defaultView.clearTimeout(toastTimer);
    toastTimer=doc.defaultView.setTimeout(()=>{toast.style.display='none';toastTimer=null;},6500);
  }
  function keyHandler(e){
    if(e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !e.shiftKey)return;
    const key=String(e.key).toLowerCase();
    const modeByKey={m:'move',c:'copy',g:'go'};
    if(!modeByKey[key])return;
    if(ffjIsEditing(e.target)||ffjIsEditing(e.originalTarget))return;
    try{
      const tab=win.gTabmail?.currentTabInfo;
      if(tab && tab.mode?.name!=='mail3PaneTab')return;
      const activeDoc=tab?.chromeBrowser?.contentDocument || tab?.chromeBrowser?.contentWindow?.document || win.gTabmail?.currentAbout3Pane?.document;
      if(activeDoc && activeDoc!==doc)return;
    }catch(_){ }
    e.preventDefault();e.stopImmediatePropagation();show(modeByKey[key]);
  }
  function inputKeys(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='ArrowDown'){e.preventDefault();selected=(selected+1)%Math.max(items.length,1);selectOnly();list.children[selected]?.scrollIntoView({block:'nearest'});}
    else if(e.key==='ArrowUp'){e.preventDefault();selected=(selected-1+Math.max(items.length,1))%Math.max(items.length,1);selectOnly();list.children[selected]?.scrollIntoView({block:'nearest'});}
    else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();execute(e.ctrlKey||e.metaKey);}
    else if(e.key==='F5'){e.preventDefault();ffjNotify({type:'refresh'});}
  }
  const outside=e=>{if(e.target===overlay)close();};
  const input=()=>{selected=0;render();};
  const goOptions=()=>{close();ffjNotify({type:'settings'});};
  const goRefresh=()=>ffjNotify({type:'refresh'});
  const setMove=()=>{mode='move';render();search.focus();};
  const setCopy=()=>{mode='copy';render();search.focus();};
  const setGo=()=>{mode='go';render();search.focus();};
  doc.addEventListener('keydown',keyHandler,true);
  win.document.addEventListener('keydown',keyHandler,true);
  search.addEventListener('keydown',inputKeys);
  search.addEventListener('input',input);
  overlay.addEventListener('mousedown',outside);
  opts.addEventListener('click',goOptions);
  reload.addEventListener('click',goRefresh);
  moveBtn.addEventListener('click',setMove);
  copyBtn.addEventListener('click',setCopy);
  goBtn.addEventListener('click',setGo);
  FFJ_MOUNTS.set(doc, {win,render,close,error,cleanup(){
    doc.removeEventListener('keydown',keyHandler,true);
    win.document.removeEventListener('keydown',keyHandler,true);
    search.removeEventListener('keydown',inputKeys);search.removeEventListener('input',input);
    overlay.removeEventListener('mousedown',outside);opts.removeEventListener('click',goOptions);reload.removeEventListener('click',goRefresh);
    moveBtn.removeEventListener('click',setMove);copyBtn.removeEventListener('click',setCopy);goBtn.removeEventListener('click',setGo);
    if(toastTimer!==null)try{doc.defaultView.clearTimeout(toastTimer);}catch(_){ }
    toast.remove();overlay.remove();style.remove();
  }});
}
function ffjScan(){
  const docs=ffjMailDocs();const live=new Set(docs.map(x=>x.doc));
  for(const {doc,win} of docs)try{ffjMount(doc,win);}catch(e){FFJ_LAST_ERROR='mount: '+String(e);}
  for(const [doc,m] of FFJ_MOUNTS){
    if(!live.has(doc) || !doc.getElementById(FFJ_PREFIX+'overlay')){
      try{m.cleanup();}catch(_){ }FFJ_MOUNTS.delete(doc);
    }
  }
}
function ffjStop(){
  if(FFJ_TIMER!==null){try{FFJ_TIMER_WIN?.clearInterval(FFJ_TIMER);}catch(_){ }FFJ_TIMER=null;FFJ_TIMER_WIN=null;}
  for(const m of FFJ_MOUNTS.values())try{m.cleanup();}catch(_){ }
  FFJ_MOUNTS.clear();FFJ_ACTIONS.clear();FFJ_LAST_DOC=null;
}
var fastJump = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context){return {fastJump:{
    async start(){
      ffjScan();
      if(FFJ_TIMER===null){
        const win=Services.wm.getMostRecentWindow('mail:3pane');
        if(win){FFJ_TIMER_WIN=win;FFJ_TIMER=win.setInterval(()=>{try{ffjScan();}catch(e){FFJ_LAST_ERROR=String(e);}},1500);}
      }
      return {ok:true,mounted:FFJ_MOUNTS.size};
    },
    async setData(data){
      FFJ_DATA={folders:Array.isArray(data?.folders)?data.folders:[],settings:data?.settings || {}};
      ffjPrepare();
      for(const m of FFJ_MOUNTS.values()){try{m.render();}catch(_){ }}
      return true;
    },
    async showError(message){
      const doc=FFJ_LAST_DOC;
      const m=doc && FFJ_MOUNTS.get(doc);
      if(m)m.error(message);else FFJ_LAST_ERROR=message;
    },
    async diagnose(){return {mounted:FFJ_MOUNTS.size,folders:FFJ_PREPARED.length,error:FFJ_LAST_ERROR};},
    onAction:new ExtensionCommon.EventManager({
      context,name:'fastJump.onAction',
      register(fire){FFJ_ACTIONS.add(fire);return ()=>FFJ_ACTIONS.delete(fire);}
    }).api()
  }};}
  onShutdown(isAppShutdown){ffjStop();if(!isAppShutdown){try{Services.obs.notifyObservers(null,'startupcache-invalidate');}catch(_){ }}}
};
