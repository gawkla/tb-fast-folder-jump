/* Fast Folder Jump 0.1.2 — the folder index is prepared outside the shortcut path. */
'use strict';
const DEFAULTS = { listLength: 12, exclusions: [], recent: [], lastKey: '' };
let settings = {...DEFAULTS};
let catalog = [];
let folderObjects = new Map();
let refreshing = null;
let ready = false;
let lastRefresh = 0;
let operationBusy = false;
const keyOf = f => `${f.accountId}\u0000${f.path}`;

async function storageInit(){
  const saved = await messenger.storage.local.get(['ffjSettings','ffjFolderCache']);
  settings = {...DEFAULTS, ...(saved.ffjSettings || {})};
  settings.listLength = Math.min(30, Math.max(4, Number(settings.listLength) || 12));
  settings.exclusions = Array.isArray(settings.exclusions) ? settings.exclusions : [];
  settings.recent = Array.isArray(settings.recent) ? settings.recent : [];
  catalog = Array.isArray(saved.ffjFolderCache) ? saved.ffjFolderCache : [];
  return settings;
}
function state() { return {folders:catalog, settings}; }
async function publish(){
  try{await messenger.fastJump.setData(state());}catch(e){console.warn('[Fast Folder Jump] sync:',e);}
}
function flattenAccounts(accounts){
  const list=[], map = new Map(), seen = new Set();
  for (const acc of accounts){
    if (acc.type !== 'none') continue; // Local Folders only.
    const accountName=acc.name || 'Local Folders';
    const walk=(folder, root=false)=>{
      if (!folder) return;
      const path=folder.path;
      if (!root && typeof path === 'string') {
        const accountId = folder.accountId || acc.id;
        const key = `${accountId}\u0000${path}`;
        if(!seen.has(key)) {
          seen.add(key);
          const name = String(folder.name || path.split('/').pop());
          const display = `${accountName} / ${path.replace(/^\//, '').replaceAll('/',' / ')}`;
          const data = {key, accountId, path, name, account:accountName, display,
            search: (name+' '+display).normalize('NFKD').toLocaleLowerCase('en'),
            canFile: !folder.isVirtual && !folder.isUnified && !folder.isTag};
          list.push(data); map.set(key,folder);
        }
      }
      for(const child of (folder.subFolders || []))walk(child);
    };
    if(acc.rootFolder) walk(acc.rootFolder,true);
    else for(const f of (acc.folders || [])) walk(f);
  }
  list.sort((a,b)=>a.display.localeCompare(b.display, 'en', {sensitivity:'base'}));
  return {list,map};
}
async function refresh(force=false){
  if(refreshing) return refreshing;
  if (!force && Date.now() - lastRefresh < 120000) return;
  refreshing=(async()=>{
    try{
      const accounts=await messenger.accounts.list(true);
      const result=flattenAccounts(accounts);
      catalog=result.list; folderObjects=result.map;
      lastRefresh=Date.now();
      await messenger.storage.local.set({ffjFolderCache:catalog});
      await publish();
      console.info(`[Fast Folder Jump] indexed ${catalog.length} local folders`);
    } catch(e) {console.error('[Fast Folder Jump] Folder index refresh failed:',e);}
    finally {refreshing=null;}
  })();
  return refreshing;
}
async function getFolder(key){
  if(!folderObjects.has(key)) await refresh(true);
  return folderObjects.get(key);
}
async function selectedMessageIds(tabId){
  let page=await messenger.mailTabs.getSelectedMessages(tabId);
  let ids=[];
  while(page){
    ids.push(...(page.messages || []).map(m=>m.id));
    page=page.id ? await messenger.messages.continueList(page.id) : null;
  }
  return [...new Set(ids)];
}
async function getTab(){
  let t=await messenger.mailTabs.getCurrent();
  if(t) return t;
  const tabs=await messenger.mailTabs.query({active:true});
  return tabs[0] || null;
}
async function successDestination(key){
  settings.lastKey=key;
  settings.recent=[key,...settings.recent.filter(k=>k!==key)].slice(0,12);
  await messenger.storage.local.set({ffjSettings:settings});
  await publish();
}
async function actionEvent(action){
  if(!action || typeof action !== 'object') return;
  if(action.type === 'refresh') {await refresh(true); return;}
  if(action.type === 'settings') {await messenger.runtime.openOptionsPage();return;}
  if(action.type === 'exclude') {
    // Only a catalogued Local Folders item may be excluded. Do not move any mail.
    const folder = catalog.find(f => f.key === action.key);
    if (!folder) return;
    const previous = Array.isArray(settings.exclusions) ? settings.exclusions : [];
    const isExcluded = previous.some(x => x.accountId === folder.accountId &&
      (x.path === folder.path || (x.descendants && folder.path.startsWith(x.path.replace(/\/$/, '') + '/'))));
    if (isExcluded) return;
    settings.exclusions = [...previous, {
      accountId: folder.accountId, path: folder.path,
      display: folder.display, descendants: false
    }];
    try {
      await messenger.storage.local.set({ffjSettings:settings});
      await publish();
    } catch(e) {
      console.error('[Fast Folder Jump] Could not save exclusion',e);
      try { await messenger.fastJump.showError('Could not save folder exclusion: ' + e.message); } catch(_) {}
    }
    return;
  }
  if(action.type !== 'execute' || operationBusy) return;
  const {key,mode}=action;
  if(!key || !['move','copy','go'].includes(mode))return;
  operationBusy=true;
  try{
    const folder=await getFolder(key);
    if(!folder) throw new Error('Folder no longer exists. Press F5 to refresh the folder index.');
    const tab=await getTab();
    if(!tab) throw new Error('No active mail tab.');
    if(mode==='go'){
      await messenger.mailTabs.update(tab.id,{displayedFolder: folder});
    } else {
      const ids=await selectedMessageIds(tab.id);
      if(!ids.length) throw new Error('Select one or more messages before moving or copying.');
      if(mode==='move') await messenger.messages.move(ids,folder,{isUserAction:true});
      else await messenger.messages.copy(ids,folder,{isUserAction:true});
      if(action.goAfter){await messenger.mailTabs.update(tab.id,{displayedFolder: folder});}
    }
    await successDestination(key);
  }catch(e){
    console.error('[Fast Folder Jump] Operation failed',e);
    try{await messenger.fastJump.showError(String(e?.message || e));}catch(_){/* fallback console */}
  }finally{operationBusy=false;}
}
messenger.runtime.onMessage.addListener(async message=>{if(message?.type==='ffj-refresh'){await refresh(true);return {ok:true,count:catalog.length};}});
async function start(){
  await storageInit();
  messenger.fastJump.onAction.addListener(actionEvent);
  await messenger.fastJump.start();
  await publish();
  ready=true;
  refresh(true);
}
start().catch(e=>console.error('[Fast Folder Jump] Startup:',e));
messenger.storage.onChanged.addListener(async(changes,area)=>{
  if(area!=='local' || !changes.ffjSettings || !ready)return;
  settings={...DEFAULTS,...changes.ffjSettings.newValue};
  await publish();
});
for(const event of ['onCreated','onDeleted','onRenamed','onMoved','onCopied','onUpdated']){
  try{messenger.folders?.[event]?.addListener(()=>{
    lastRefresh=0;
    setTimeout(()=>refresh(true),500);
  });}catch(_){}
}
setInterval(()=>{if(ready)refresh();},300000);
