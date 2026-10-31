'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../api/implementation.js'),'utf8');
class Element{
  constructor(tag='div'){
    this.localName=tag;this.children=[];this.parent=null;this.attrs={};this.listeners={};
    this.className='';this.textContent='';this.value='';this.style={};this.disabled=false;
    this.classList={
      contains:x=>this.className.split(' ').includes(x),
      toggle:(x,on)=>{
        const set=new Set(this.className.split(' ').filter(Boolean));
        if(on===undefined ? !set.has(x):on)set.add(x); else set.delete(x);
        this.className=[...set].join(' ');
      },
      add:x=>{if(!this.classList.contains(x))this.className+=' '+x;},
      remove:x=>{this.className=this.className.split(' ').filter(y=>y!==x).join(' ');}
    };
  }
  append(...children){children.forEach(x=>this.appendChild(x));}
  appendChild(child){this.children.push(child);child.parent=this;return child;}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(t,f){(this.listeners[t]??=[]).push(f);}
  removeEventListener(t,f){this.listeners[t]=this.listeners[t]?.filter(x=>x!==f)||[];}
  emit(t,props={}){
    const e={target:this,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...props};
    for(const f of this.listeners[t]||[])f(e);
    return e;
  }
  focus(){this.focused=true;}
  blur(){}
  select(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  scrollIntoView(){}
}
const doc={body:new Element('body'),head:new Element('head'),createElement:t=>new Element(t),listeners:{},
  getElementById(id){const walk=(el)=>el.id===id?el:el.children.map(walk).find(Boolean);return walk(this.body)||walk(this.head);},
  addEventListener(t,f){(this.listeners[t]??=[]).push(f);},removeEventListener(){},
  defaultView:{setTimeout:()=>1,clearTimeout(){}}};
const win={document:{addEventListener(){},removeEventListener(){}},gTabmail:{currentTabInfo:{mode:{name:'mail3PaneTab'}}}};
const context=vm.createContext({
 ChromeUtils:{importESModule:()=>({ExtensionCommon:{ExtensionAPI:class{},EventManager:class{api(){return {addListener(){}}}}}})},
 Services:{wm:{getEnumerator(){return {hasMoreElements:()=>false}},getMostRecentWindow(){return null}},obs:{notifyObservers(){}}},
 console,Map,Set,doc,win
});
vm.runInContext(src,context);
const key=(p)=>'local\u0000'+p;
const folder=(p)=>({accountId:'local',key:key(p),path:p,name:p.slice(1),display:'Local Folders / '+p.slice(1)});
const actions=[];
context.data={folders:[folder('/Archive'),folder('/Project')],settings:{lastKey:key('/Project'),recent:[],exclusions:[],listLength:12}};
context.fire={async(a){actions.push(a)}};
vm.runInContext('FFJ_DATA=data;ffjPrepare();FFJ_ACTIONS.add(fire);ffjMount(doc,win)',context);
// Mount creates a hidden ready-to-show panel. Simulate Shift+M to render rows.
for(const listener of doc.listeners.keydown)listener({
  key:'M',shiftKey:true,ctrlKey:false,metaKey:false,altKey:false,repeat:false,
  target:doc.body,originalTarget:doc.body,defaultPrevented:false,
  preventDefault(){},stopImmediatePropagation(){}
});
const list=doc.getElementById('ffj011-list');
assert.equal(list.children.length,2);
assert.equal(list.children[0].localName,'div','folder result should not nest buttons');
const archiveRow=list.children.find(x=>x.children[1]?.children?.[0]?.textContent==='Archive');
assert.ok(archiveRow,'Archive exists');
const minus=archiveRow.children.at(-1);
const style=doc.head.children.find(el=>el.localName==='style');
assert.match(style.textContent,/flex:0 0 20px;min-width:20px;max-width:20px;width:20px;min-height:20px;max-height:20px;height:20px/,'fixed 20x20 exclusion control');
assert.equal(minus.localName,'span','avoids native Thunderbird button min-width');
assert.equal(minus.attrs.role,'button');
assert.equal(minus.tabIndex,0);
assert.equal(minus.title,'Exclude from search');
assert.equal(minus.textContent,'−');
const e=minus.emit('click');
assert.ok(e.prevented&&e.stopped,'minus click must not invoke parent row');
assert.equal(actions.length,1);
assert.equal(actions[0].type,'exclude');
assert.equal(actions[0].key,key('/Archive'));
assert.equal(list.children.length,1,'excluded row should disappear immediately');
assert.equal(list.children[0].children[1].children[0].textContent,'Project');
const input=doc.getElementById('ffj011-search');
input.value='!';input.emit('input');
assert.equal(list.children.length,2,'suffix ! reveals excluded');
const archiveAgain=list.children.find(x=>x.children[1]?.children?.[0]?.textContent==='Archive');
assert.equal(archiveAgain.children.at(-1).attrs['aria-disabled'],'true','excluded row cannot be redundantly excluded');
assert.equal(archiveAgain.children.at(-1).title,'Already excluded');
assert.equal(actions.length,1,'minus must only exclude, never move/copy/jump');
console.log('Exclude UI tests passed: right-side minus, no accidental action, immediate removal, trailing ! override');
