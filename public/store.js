import {reconcile,acknowledge,validateBackup} from './sync-core.js?v=2';
export {validateBackup} from './sync-core.js?v=2';
let db,user,editing='',timer,working,blocked=false,forced=false,lastError='',records=new Map();
const listeners=new Set();
const clone=x=>structuredClone(x);
const uuid=()=>crypto.randomUUID();
export const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
function emit(){const state=syncState();for(const fn of listeners)fn(state);}
export const currentUser=()=>user;
export const setEditing=id=>{editing=id||'';};
export const setTestFailure=value=>{forced=value;if(!value)syncNow();};
export const syncState=()=>({status:blocked?'account':lastError?'error':[...records.values()].some(r=>r.conflict)?'conflict':working?'saving':[...records.values()].some(r=>r.dirty)?'local':'saved',pending:[...records.values()].filter(r=>r.dirty).length,conflicts:[...records.values()].filter(r=>r.conflict).length,error:lastError,user});
export function noteStatus(id){const r=records.get(id);return blocked?'account':r?.conflict?'conflict':r?.dirty?(lastError?'error':'local'):'saved';}
function transaction(mode,op){return new Promise((resolve,reject)=>{if(!db)return reject(Error('기기 저장소가 연결되지 않았어요.'));let t,r;try{t=db.transaction('records',mode);r=op(t.objectStore('records'));}catch(e){reject(e);return;}t.oncomplete=()=>resolve(r?.result);t.onerror=t.onabort=()=>reject(t.error||r?.error||Error('임시 저장에 실패했어요.'));});}
async function saveRecord(r){await transaction('readwrite',s=>s.put(r));records.set(r.id,r);}
async function dropRecord(id){await transaction('readwrite',s=>s.delete(id));records.delete(id);}
async function api(path,options={}){
 if(forced)throw Error('테스트용 네트워크 실패');if(blocked)throw Error('계정이 변경되었어요. 새로고침해 주세요.');
 const headers=new Headers(options.headers||{});if(user)headers.set('x-notebook-user',user.userId);
 const response=await fetch('/api/'+path,{...options,headers,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000)});
 let body;try{body=await response.json();}catch{throw Error('서버 응답을 확인할 수 없어요. 로그인 상태를 확인해 주세요.');}
 if(response.status===401||body.code==='account_changed'){blocked=true;emit();throw Error('로그인 계정이 바뀌었거나 로그아웃되었어요. 새로고침해 주세요.');}
 if(!response.ok){const e=Error(body.error||'서버에 연결하지 못했어요.');e.status=response.status;e.body=body;throw e;}return body;
}
export async function openStore(){
 if(blocked)throw Error('로그인 계정을 다시 확인하려면 새로고침해 주세요.');if(user){await syncNow();return;}
 user=await api('me');if(!user.serverStorage)throw Error('서버 저장소가 아직 준비되지 않았어요.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId));const key=[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
 const device=location.hostname==='127.0.0.1'?(new URLSearchParams(location.search).get('device')||'').replace(/[^a-z0-9_-]/gi,'').slice(0,30):'';
 db=await new Promise((resolve,reject)=>{const r=indexedDB.open('news-scrap-account-v2-'+key+device,1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('다른 창을 닫고 다시 시도해 주세요.'));});
 db.onversionchange=()=>db.close();records=new Map((await transaction('readonly',s=>s.getAll())).map(r=>[r.id,r]));
 try{await syncNow();}catch{}
 setInterval(()=>{if(!document.hidden)syncNow();},20000);window.addEventListener('online',()=>syncNow());window.addEventListener('focus',()=>syncNow());document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncNow();});emit();
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>syncNow(),250);emit();}
async function write(id,kind,data,deleted=false){if(blocked)throw Error('계정을 다시 확인해 주세요.');const old=records.get(id);if(!deleted&&old&&!old.deleted&&JSON.stringify(old.data)===JSON.stringify(data))return;const r={id,kind,data:clone(data),version:old?.version||0,dirty:true,deleted,mutationId:uuid(),updatedAt:Date.now(),conflict:old?.conflict||null};await saveRecord(r);schedule();}
export const allNotes=async()=>[...records.values()].filter(r=>r.kind==='note'&&!r.deleted).map(r=>clone(r.data));
export const allTerms=async()=>[...records.values()].filter(r=>r.kind==='term'&&!r.deleted).map(r=>clone(r.data));
export const putNote=n=>write(n.id,'note',n);
export const putTerm=t=>write(t.id,'term',t);
export const removeNote=id=>write(id,'note',records.get(id)?.data||null,true);
export const removeTerm=id=>write(id,'term',records.get(id)?.data||null,true);
export async function getSettings(){const s={checks:{},materials:{},certified:{}};for(const r of records.values()){if(r.kind!=='setting'||r.deleted)continue;const [,group,key]=r.id.split(':');if(['checks','materials','certified'].includes(group))s[group][key]=clone(r.data);else s[group]=clone(r.data);}return s;}
function settingsEntries(s){const list=[];for(const group of ['checks','materials','certified'])for(const [key,v]of Object.entries(s[group]||{}))list.push(['setting:'+group+':'+key,v]);for(const key of ['nickname','reading'])if(s[key]!==undefined)list.push(['setting:'+key,s[key]]);return list;}
export async function putSettings(s){for(const [id,data]of settingsEntries(s))await write(id,'setting',data);}
async function uploadImages(r){if(r.kind!=='note'||r.deleted)return r;let changed=false;const n=clone(r.data);for(let i=0;i<n.attachments.length;i++){const a=n.attachments[i];if(!a.data)continue;const part=a.data.split(','),match=/^data:(image\/(?:png|jpeg|webp));base64$/.exec(part[0]);if(!match)throw Error('이미지 파일 형식을 확인해 주세요.');const binary=atob(part[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));n.attachments[i]=await api('images',{method:'POST',headers:{'Content-Type':match[1],'x-file-name':encodeURIComponent(a.name)},body:bytes});changed=true;}
 if(changed){const latest=records.get(r.id);if(latest?.mutationId===r.mutationId){r={...r,data:n};await saveRecord(r);}else return null;}return r;
}
export async function syncNow(){
 clearTimeout(timer);if(!user||blocked)return;if(working)return working;
 const task=async()=>{lastError='';emit();try{
  const who=await api('me');if(who.userId!==user.userId){blocked=true;throw Error('계정이 변경되었어요. 새로고침해 주세요.');}
  for(const pending of [...records.values()].filter(r=>r.dirty&&!r.conflict)){
   let sent=await uploadImages(clone(pending));if(!sent)continue;
   try{const res=await api('records/'+encodeURIComponent(sent.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:sent.kind,data:sent.data,deleted:sent.deleted,baseVersion:sent.version,mutationId:sent.mutationId})});const latest=records.get(sent.id);if(latest)await saveRecord(acknowledge(latest,sent,res.record));}
   catch(e){if(e.status===409&&e.body?.code==='conflict'){const latest=records.get(sent.id);await saveRecord({...latest,conflict:e.body.current||{id:sent.id,kind:sent.kind,data:null,deleted:true,version:0}});}else throw e;}
  }
  const remote=await api('state');if(remote.userId!==user.userId){blocked=true;throw Error('계정이 변경되었어요.');}
  for(const r of remote.records){const local=records.get(r.id);const merged=reconcile(local,r,editing===r.id);if(JSON.stringify(merged)!==JSON.stringify(local))await saveRecord(merged);}
 }catch(e){lastError=e.message||'동기화를 기다리고 있어요.';}finally{working=null;emit();if(!lastError&&[...records.values()].some(r=>r.dirty&&!r.conflict))schedule();}};
 working=Promise.resolve().then(task);emit();return working;
}
export const conflicts=()=>[...records.values()].filter(r=>r.conflict).map(clone);
export async function resolveConflict(id,choice){const local=records.get(id),remote=local?.conflict;if(!remote)return;
 if(choice==='remote'){await saveRecord({...remote,dirty:false,conflict:null});}
 else if(choice==='both'&&local.kind!=='setting'){
  if(local.data){const data=clone(local.data);data.id=uuid();if(local.kind==='note')data.title=(data.title||'제목 없는 기록')+' (별도 보관)';else data.word+=' (별도 보관)';data.updatedAt=Date.now();await write(data.id,local.kind,data);}
  await saveRecord({...remote,dirty:false,conflict:null});
 }else await saveRecord({...local,version:remote.version,conflict:null,dirty:true,mutationId:uuid()});
 emit();await syncNow();
}
export async function mergeBackup(notes,settings,terms=[]){
 const items=[];for(const n of notes)items.push({id:n.id,kind:'note',data:n});for(const t of terms)items.push({id:t.id,kind:'term',data:t});for(const [id,data]of settingsEntries(settings))items.push({id,kind:'setting',data});
 const updated=items.map(x=>({...x,version:records.get(x.id)?.version||0,dirty:true,deleted:false,conflict:records.get(x.id)?.conflict||null,mutationId:uuid(),updatedAt:Date.now()}));
 await transaction('readwrite',s=>{for(const r of updated)s.put(r);});for(const r of updated)records.set(r.id,r);schedule();
}
export async function readLegacy(){
 if(indexedDB.databases){const databases=await indexedDB.databases();if(!databases.some(d=>d.name==='news-scrap-notebook-v1'))return null;}
 return new Promise((resolve,reject)=>{const r=indexedDB.open('news-scrap-notebook-v1');r.onupgradeneeded=()=>{r.transaction.abort();resolve(null);};r.onerror=()=>resolve(null);r.onsuccess=()=>{const legacy=r.result;if(!legacy.objectStoreNames.contains('notes')){legacy.close();resolve(null);return;}const tx=legacy.transaction(['notes','settings'],'readonly');const n=tx.objectStore('notes').getAll(),s=tx.objectStore('settings').get('main');tx.oncomplete=()=>{legacy.close();resolve({notes:n.result||[],settings:s.result||{}});};tx.onerror=()=>{legacy.close();reject(tx.error);};};});
}
async function imageData(a){if(a.data)return a.data;const response=await fetch(a.url,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('이미지를 백업하지 못했어요. 로그인·네트워크 상태를 확인해 주세요.');const blob=await response.blob();return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}
export async function materializeNotes(notes){const result=[];for(const note of notes){const n=clone(note);n.attachments=await Promise.all((n.attachments||[]).map(async a=>({name:a.name,data:await imageData(a)})));result.push(n);}return result;}
