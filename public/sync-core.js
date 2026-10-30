// 'ppas-backup' = earlier backup format, still accepted for restore compatibility
const BACKUP_FORMATS=['news-scrap-backup','ppas-backup'];
export function reconcile(local,remote,editing=false){
 if(!local)return {...remote,dirty:false,conflict:null};
 if(remote.mutationId===local.mutationId)return {...remote,dirty:false,conflict:null};
 if(local.version===remote.version)return local;
 if(local.dirty||editing)return {...local,conflict:remote};
 return {...remote,dirty:false,conflict:null};
}
export function acknowledge(latest,sent,remote){
 if(latest.mutationId===sent.mutationId)return {...remote,dirty:false,conflict:null};
 return {...latest,version:remote.version,conflict:null};
}
export const normalizeWord=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ko-KR');
export const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+'T12:00:00Z').getTime())&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function weekStart(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
export function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export const weekLabel=date=>`${date.replaceAll('-','.')} – ${addDays(date,6).slice(5).replace('-','.')}`;
export function validateBackup(data){
 if(!data||!BACKUP_FORMATS.includes(data.format)||![1,2].includes(data.version)||!Array.isArray(data.notes)||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings))throw Error('경제신문읽기 백업 파일 형식이 아니에요.');
 if(data.notes.length>10000)throw Error('노트 수가 너무 많아요.');
 const ids=new Set(),notes=data.notes.map(raw=>{
  if(!raw||typeof raw.id!=='string'||!/^[A-Za-z0-9:_-]{1,120}$/.test(raw.id)||ids.has(raw.id)||!['daily','weekly'].includes(raw.type))throw Error('노트 정보가 올바르지 않아요.');ids.add(raw.id);
  const n={id:raw.id,type:raw.type};for(const key of ['title','nickname','paper','what','why','soWhat','terms','thought','keywords','memorable','newWords','watch']){if(raw[key]!==undefined&&(typeof raw[key]!=='string'||raw[key].length>200000))throw Error('입력 항목을 확인해 주세요.');n[key]=raw[key]||'';}
  if(!validDate(raw.date))throw Error('날짜 형식이 올바르지 않아요.');n.date=raw.date;n.weekStart=validDate(raw.weekStart)?raw.weekStart:weekStart(raw.type==='weekly'&&[1,2,3].includes(raw.week)?['2026-10-26','2026-11-02','2026-11-09'][raw.week-1]:n.date);
  n.week=[1,2,3].includes(raw.week)?raw.week:1;n.guide=['rules','order','reading','example','weekly'].includes(raw.guide)?raw.guide:'reading';n.recommended=raw.recommended===true;n.createdAt=Number.isFinite(raw.createdAt)?raw.createdAt:Date.now();n.updatedAt=Number.isFinite(raw.updatedAt)?raw.updatedAt:Date.now();
  if((raw.attachments||[]).length>4)throw Error('기사 이미지는 노트당 최대 4장이에요.');
  n.attachments=(Array.isArray(raw.attachments)?raw.attachments:[]).map(a=>{if(!a||typeof a.name!=='string'||typeof a.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data)||a.data.length>12000000)throw Error('기사 이미지 형식이 올바르지 않아요.');return {name:a.name.slice(0,300),data:a.data};});return n;
 });
 const settings={checks:{},materials:{},certified:{},nickname:typeof data.settings.nickname==='string'?data.settings.nickname.slice(0,200):''};
 for(let i=1;i<=15;i++)if(typeof data.settings.checks?.[i]==='boolean')settings.checks[i]=data.settings.checks[i];
 for(let i=1;i<=3;i++)if(typeof data.settings.materials?.[i]==='boolean')settings.materials[i]=data.settings.materials[i];
 if(data.version===1){let day='2026-10-26';for(let i=1;i<=15;i++){if(typeof data.settings.checks?.[i]==='boolean')settings.certified[day]=data.settings.checks[i];day=addDays(day,1);while([0,6].includes(new Date(day+'T12:00:00Z').getUTCDay()))day=addDays(day,1);}}
 for(const [k,v]of Object.entries(data.settings.certified||{}))if(validDate(k)&&typeof v==='boolean')settings.certified[k]=v;
 if(data.settings.reading&&['rules','order','reading','example'].includes(data.settings.reading.guide))settings.reading={guide:data.settings.reading.guide,scroll:Math.max(0,Number(data.settings.reading.scroll)||0),at:Number(data.settings.reading.at)||Date.now()};
 const termIds=new Set();const terms=(Array.isArray(data.terms)?data.terms:[]).map(t=>{if(!t||typeof t.id!=='string'||!/^[A-Za-z0-9:_-]{1,120}$/.test(t.id)||termIds.has(t.id)||typeof t.word!=='string'||!t.word.trim()||t.word.length>200||typeof t.definition!=='string'||t.definition.length>20000)throw Error('용어장 항목을 확인해 주세요.');termIds.add(t.id);return {id:t.id,word:t.word.trim(),definition:t.definition,noteIds:(Array.isArray(t.noteIds)?t.noteIds:[]).filter(v=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,120}$/.test(v)).slice(0,1000),status:t.status==='familiar'?'familiar':'review',createdAt:Number(t.createdAt)||Date.now(),updatedAt:Number(t.updatedAt)||Date.now()};});
 return {notes,settings,terms};
}
