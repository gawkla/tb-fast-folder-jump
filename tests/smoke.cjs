'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const root=__dirname+'/..';
const exp=fs.readFileSync(root+'/api/implementation.js','utf8');
const ctx=vm.createContext({
 ChromeUtils:{importESModule:()=>({ExtensionCommon:{ExtensionAPI:class {},EventManager:class {api(){return {addListener(){}}}}}})},
 Services:{wm:{getEnumerator:()=>({hasMoreElements:()=>false}),getMostRecentWindow:()=>null},obs:{notifyObservers(){}}},
 console,Map,Set
});
vm.runInContext(exp,ctx);
const apiQuery=vm.runInContext('ffjFilter',ctx);
const key=(path)=>'account1\u0000'+path;
const data=[
 {key:key('/PROJECT'),accountId:'account1',path:'/PROJECT',name:'PROJECT',display:'Local / PROJECT'},
 {key:key('/ARCHIVE'),accountId:'account1',path:'/ARCHIVE',name:'ARCHIVE',display:'Local / ARCHIVE'},
 {key:key('/ARCHIVE/2025'),accountId:'account1',path:'/ARCHIVE/2025',name:'2025',display:'Local / ARCHIVE / 2025'},
 {key:key('/ARCH'),accountId:'account1',path:'/ARCH',name:'ARCH',display:'Local / ARCH'}
];
let settings={listLength:10,lastKey:key('/PROJECT'),recent:[key('/ARCHIVE')],exclusions:[{accountId:'account1',path:'/ARCHIVE',descendants:true}]};
let res=apiQuery(data,'',settings,10);
assert.equal(res.items[0].key,key('/PROJECT'),'last destination first');
assert.equal(res.total,2,'parent+children excluded, substring sibling unaffected');
res=apiQuery(data,'arch!',settings,10);
assert.equal(res.total,3,'suffix ! bypasses exclusions');
res=apiQuery(data,'arch',settings,10);
assert.equal(res.total,1,'without suffix ! respects exclusions');
assert.equal(apiQuery(data,'!',settings,10).total,4,'trailing ! alone includes all folders');
assert.equal(apiQuery(data,'arch !',settings,10).total,3,'trailing spaces before ! work');
assert.equal(apiQuery(data,'!arch',settings,10).total,0,'old prefix no longer bypasses exclusions');
settings.exclusions=[{accountId:'account1',path:'/ARCHIVE',descendants:false}];
res=apiQuery(data,'2025',settings,10);
assert.equal(res.total,1,'exact exclusion retains descendants');
assert.equal(apiQuery(data,'proj',settings,10).items[0].path,'/PROJECT','prefix search');
const many=Array.from({length:11000},(_,i)=>({key:key('/F'+i),accountId:'account1',path:'/F'+i,name:'Folder '+i,display:'Local / Folder '+i}));
const t0=performance.now();
for(let j=0;j<10;j++)apiQuery(many,'Folder 10',settings,20);
const total=performance.now()-t0;
console.log('Experiment search tests passed. 11k folders / 10 searches:',total.toFixed(1),'ms');

// Background integration smoke: catalog creation, move, copy, go, last-target persistence.
let storage={};let calls=[];
const source={accountId:'account1',path:'/Inbox',name:'Inbox',subFolders:[]};
const dest={accountId:'account1',path:'/PROJECT',name:'PROJECT',subFolders:[]};
const account={id:'account1',name:'Local Folders',type:'none',rootFolder:{accountId:'account1',path:'/',subFolders:[source,dest]}};
let listener=null;
const messenger={
 storage:{local:{async get(){return {ffjSettings:storage.ffjSettings,ffjFolderCache:storage.ffjFolderCache}},async set(v){Object.assign(storage,v)}},onChanged:{addListener(){}}},
 fastJump:{onAction:{addListener(fn){listener=fn}},async start(){},async setData(){},async showError(err){throw new Error(err)}},
 accounts:{async list(){return [account]}},
 mailTabs:{async getCurrent(){return {id:10}},async getSelectedMessages(){return {messages:[{id:111},{id:222}]}},async update(tabId,opts){calls.push(['go',tabId,opts.displayedFolder.path])}},
 messages:{async move(ids,folder,opts){calls.push(['move',ids,folder.path,opts])},async copy(ids,folder,opts){calls.push(['copy',ids,folder.path,opts])},async continueList(){return null}},
 runtime:{onMessage:{addListener(){}},async openOptionsPage(){}}
};
const bgCtx=vm.createContext({console,messenger,setInterval(){},setTimeout(fn){fn()},Date,Set,Map});
vm.runInContext(fs.readFileSync(root+'/background.js','utf8'),bgCtx);
(async()=>{
 await new Promise(resolve=>setImmediate(resolve));
 await vm.runInContext('refresh(true)',bgCtx);
 assert.equal(storage.ffjFolderCache.length,2,'two folders indexed');
 assert.ok(listener,'background onAction registered');
 await listener({type:'execute',mode:'move',key:key('/PROJECT')});
 await listener({type:'execute',mode:'copy',key:key('/Inbox')});
 await listener({type:'execute',mode:'go',key:key('/PROJECT')});
 assert.equal(calls.length,3);
 assert.deepEqual(calls.map(c=>c[0]),['move','copy','go']);
 assert.equal(calls[0][3].isUserAction,true);
 assert.equal(storage.ffjSettings.lastKey,key('/PROJECT'));
 assert.equal(storage.ffjSettings.recent[0],key('/PROJECT'));
 // Red minus must persist a folder-only exclusion without running Move, Copy or Jump.
 await listener({type:'exclude',key:key('/PROJECT')});
 assert.equal(calls.length,3,'excluding must not perform any mail operation');
 assert.equal(storage.ffjSettings.exclusions.length,1,'exclusion saved to local storage');
 assert.equal(storage.ffjSettings.exclusions[0].path,'/PROJECT');
 assert.equal(storage.ffjSettings.exclusions[0].descendants,false,'subfolders remain searchable');
 await listener({type:'exclude',key:key('/PROJECT')});
 assert.equal(storage.ffjSettings.exclusions.length,1,'repeated excludes must not duplicate entries');
 assert.equal(apiQuery(data,'project',storage.ffjSettings,10).total,0,'ordinary search excludes target');
 assert.equal(apiQuery(data,'project!',storage.ffjSettings,10).total,1,'suffix ! bypasses the exclusion');
 console.log('Background integration tests passed: move, copy, go, exclude + persistence');
})().catch(e=>{console.error(e);process.exitCode=1});
