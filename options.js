'use strict';
const $=id=>document.getElementById(id);
const DEFAULTS={listLength:12,exclusions:[],recent:[],lastKey:''};
let settings={...DEFAULTS};
let folders=[];
function updateStatus(message){$('status').textContent=message;}
function createEl(tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;}
function toExcluded(folder,descendants){return {accountId:folder.accountId,path:folder.path,descendants,display:folder.display};}
function exclusionIndex(folder){return settings.exclusions.findIndex(x=>x.accountId===folder.accountId&&x.path===folder.path);}
function addExclusion(folder,descendants){
  const idx=exclusionIndex(folder);
  if(idx>=0)settings.exclusions.splice(idx,1);
  settings.exclusions.push(toExcluded(folder,descendants));
  render();save();
}
function removeExclusion(x){
  settings.exclusions=settings.exclusions.filter(a=>!(a.accountId===x.accountId&&a.path===x.path));
  render();save();
}
function render(){
  const q=$('find').value.trim().normalize('NFKD').toLocaleLowerCase('en');
  const matches=folders.filter(f=>f.search.includes(q) || f.display.normalize('NFKD').toLocaleLowerCase('en').includes(q));
  $('count').textContent=`${matches.length} match(es)`;
  const rows=matches.slice(0,60);
  const choices=$('choices');choices.replaceChildren();
  if(!rows.length)choices.append(createEl('div','No folders found. Use Refresh folder index.','choice'));
  for(const f of rows){
    const row=createEl('div',null,'choice');const p=createEl('div',null,'p');
    p.append(createEl('strong',f.name),createEl('small',f.display));
    const idx=exclusionIndex(f);
    if(idx>=0)row.append(p,createEl('span','Already excluded','muted'));
    else{
      const only=createEl('button','Exclude folder');const branch=createEl('button','+ subfolders');
      only.onclick=()=>addExclusion(f,false);branch.onclick=()=>addExclusion(f,true);
      row.append(p,only,branch);
    }
    choices.append(row);
  }
  const excluded=$('excluded');excluded.replaceChildren();
  if(!settings.exclusions.length)excluded.append(createEl('div','No exclusions configured.','muted'));
  for(const x of settings.exclusions){
    const row=createEl('div',null,'choice');const p=createEl('div',null,'p');
    p.append(createEl('strong',x.display || x.path),createEl('small',x.descendants?'Excluded including all subfolders':'Excluded folder only'));
    const remove=createEl('button','Remove');remove.onclick=()=>removeExclusion(x);
    row.append(p,remove);excluded.append(row);
  }
}
async function save(){
  settings.listLength=Math.min(30,Math.max(4,parseInt($('listLength').value,10)||12));
  await messenger.storage.local.set({ffjSettings:settings});
  updateStatus('Saved.');
}
async function reload(){
  const obj=await messenger.storage.local.get(['ffjSettings','ffjFolderCache']);
  settings={...DEFAULTS,...obj.ffjSettings};
  folders=Array.isArray(obj.ffjFolderCache)?obj.ffjFolderCache:[];
  $('listLength').value=settings.listLength;
  render();
}
$('save').addEventListener('click',()=>save().catch(e=>updateStatus(e.message)));
$('find').addEventListener('input',render);
$('refresh').addEventListener('click',async()=>{
  updateStatus('Refreshing…');
  try{await messenger.runtime.sendMessage({type:'ffj-refresh'});await reload();updateStatus(`Refreshed: ${folders.length} local folders.`);}catch(e){updateStatus(e.message);}
});
messenger.storage.onChanged.addListener((changes,area)=>{
  if(area==='local' && changes.ffjFolderCache){folders=changes.ffjFolderCache.newValue || [];render();}
});
reload().catch(e=>updateStatus('Could not load settings: '+e.message));
