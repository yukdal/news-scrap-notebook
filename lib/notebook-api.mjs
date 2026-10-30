const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400,code='invalid_request')=>json({error:message,code},status);
const str=(v,max=200000)=>typeof v==='string'&&v.length<=max;
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9:_-]{1,120}$/.test(id);
export const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+'T12:00:00Z').getTime())&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
function noteData(raw){
 if(!raw||!['daily','weekly'].includes(raw.type)||!validId(raw.id))throw Error('노트 형식이 올바르지 않아요.');
 const n={id:raw.id,type:raw.type};
 for(const key of ['title','nickname','paper','what','why','soWhat','terms','thought','keywords','memorable','newWords','watch']){if(raw[key]!=null&&!str(raw[key],key==='title'?1000:200000))throw Error('입력 내용이 너무 길거나 형식이 잘못되었어요.');n[key]=raw[key]||'';}
 if(!validDate(raw.date))throw Error('기록 날짜를 확인해 주세요.');n.date=raw.date;
 n.weekStart=validDate(raw.weekStart)?raw.weekStart:n.date;n.week=[1,2,3].includes(raw.week)?raw.week:1;
 n.guide=['rules','order','reading','example','weekly'].includes(raw.guide)?raw.guide:'reading';n.recommended=raw.recommended===true;
 n.createdAt=Number.isFinite(raw.createdAt)?raw.createdAt:Date.now();n.updatedAt=Number.isFinite(raw.updatedAt)?raw.updatedAt:Date.now();
 if(!Array.isArray(raw.attachments)||raw.attachments.length>4)throw Error('이미지는 최대 4장까지 저장할 수 있어요.');
 n.attachments=raw.attachments.map(a=>{if(!a||!validId(a.id)||!str(a.name,300))throw Error('이미지 정보가 올바르지 않아요.');return {id:a.id,name:a.name,url:'/api/images/'+encodeURIComponent(a.id)};});
 return n;
}
function termData(raw){
 if(!raw||!validId(raw.id)||!str(raw.word,200)||!raw.word.trim()||!str(raw.definition||'',20000))throw Error('용어와 뜻을 확인해 주세요.');
 if(!Array.isArray(raw.noteIds)||raw.noteIds.length>1000||raw.noteIds.some(x=>!validId(x)))throw Error('연결된 노트 정보가 올바르지 않아요.');
 return {id:raw.id,word:raw.word.trim(),definition:raw.definition||'',status:raw.status==='familiar'?'familiar':'review',noteIds:[...new Set(raw.noteIds)],createdAt:Number(raw.createdAt)||Date.now(),updatedAt:Number(raw.updatedAt)||Date.now()};
}
function settingData(id,raw){
 if(/^setting:(checks|materials):\d+$/.test(id)||/^setting:certified:\d{4}-\d{2}-\d{2}$/.test(id)){if(typeof raw!=='boolean')throw Error('체크 값이 올바르지 않아요.');return raw;}
 if(id==='setting:nickname'&&str(raw,200))return raw;
 if(id==='setting:reading'&&raw&&['rules','order','reading','example'].includes(raw.guide))return {guide:raw.guide,scroll:Math.max(0,Number(raw.scroll)||0),at:Number(raw.at)||Date.now()};
 throw Error('지원하지 않는 설정이에요.');
}
function present(row){if(!row)return null;return {id:row.id,kind:row.kind,data:row.deleted?null:JSON.parse(row.payload),version:row.version,deleted:!!row.deleted,updatedAt:row.updated_at,mutationId:row.mutation_id};}
export async function handleNotebookRequest(request,env){
 try{
  const url=new URL(request.url),parts=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean).map(part=>decodeURIComponent(part));
  const owner=request.headers.get('oai-authenticated-user-id');
  if(!owner)return fail('로그인이 필요해요.',401,'unauthenticated');
  const expected=request.headers.get('x-notebook-user');
  if(expected&&expected!==owner)return fail('로그인 계정이 변경되었어요.',409,'account_changed');
  if(!['GET','HEAD'].includes(request.method)&&!expected)return fail('로그인 계정을 다시 확인해 주세요.',403,'identity_required');
  if(!['GET','HEAD'].includes(request.method)){
   const origin=request.headers.get('Origin');
   if(origin&&origin!==url.origin)return fail('허용되지 않은 요청이에요.',403,'origin_mismatch');
   if(request.headers.get('sec-fetch-site')==='cross-site')return fail('허용되지 않은 요청이에요.',403,'origin_mismatch');
  }
  if(parts[0]==='me'&&request.method==='GET')return json({userId:owner,email:request.headers.get('oai-authenticated-user-email')||'',serverStorage:!!env.DB&&!!env.BUCKET});
  if(!env.DB||!env.BUCKET)return fail('서버 저장소가 아직 연결되지 않았어요. 잠시 후 다시 시도해 주세요.',503,'storage_unavailable');
  if(parts[0]==='state'&&request.method==='GET'){
   const rows=await env.DB.prepare('SELECT id,kind,payload,version,deleted,updated_at,mutation_id FROM records WHERE owner_id = ? ORDER BY updated_at,id').bind(owner).all();
   return json({userId:owner,records:rows.results.map(present),at:Date.now()});
  }
  if(parts[0]==='records'&&validId(parts[1])&&request.method==='PUT'){
   if(!request.headers.get('content-type')?.startsWith('application/json'))return fail('JSON 형식으로 요청해 주세요.',415);
   const text=await request.text();if(text.length>1500000)return fail('기록 크기가 너무 커요.',413);
   let input;try{input=JSON.parse(text);}catch{return fail('기록 형식을 읽을 수 없어요.');}
   if(!Number.isSafeInteger(input.baseVersion)||input.baseVersion<0||!validId(input.mutationId)||!['note','term','setting'].includes(input.kind))return fail('저장 버전 정보를 확인해 주세요.');
   const id=parts[1],current=await env.DB.prepare('SELECT * FROM records WHERE owner_id = ? AND id = ?').bind(owner,id).first();
   if(current?.mutation_id===input.mutationId)return json({record:present(current)});
   if((current?.version||0)!==input.baseVersion)return json({error:'다른 기기에서 변경된 기록이 있어요.',code:'conflict',current:present(current)},409);
   if(current&&current.kind!==input.kind)return fail('기록 종류를 변경할 수 없어요.');
   let data=null;try{if(!input.deleted)data=input.kind==='note'?noteData(input.data):input.kind==='term'?termData(input.data):settingData(id,input.data);}catch(e){return fail(e.message);}
   if(input.kind!=='setting'&&data&&data.id!==id)return fail('기록 ID가 일치하지 않아요.');
   if(input.kind==='note'&&data){for(const a of data.attachments){const image=await env.DB.prepare('SELECT id FROM images WHERE owner_id = ? AND id = ?').bind(owner,a.id).first();if(!image)return fail('이 계정에서 사용할 수 없는 이미지가 있어요.',403,'image_not_owned');}}
   const at=Date.now(),payload=data===null?null:JSON.stringify(data),deleted=input.deleted?1:0;
   let row;
   if(input.baseVersion===0)row=await env.DB.prepare('INSERT INTO records (owner_id,id,kind,payload,version,deleted,updated_at,mutation_id) VALUES (?,?,?,?,1,?,?,?) ON CONFLICT(owner_id,id) DO NOTHING RETURNING *').bind(owner,id,input.kind,payload,deleted,at,input.mutationId).first();
   else row=await env.DB.prepare('UPDATE records SET payload = ?,version = version + 1,deleted = ?,updated_at = ?,mutation_id = ? WHERE owner_id = ? AND id = ? AND version = ? RETURNING *').bind(payload,deleted,at,input.mutationId,owner,id,input.baseVersion).first();
   if(!row){const remote=await env.DB.prepare('SELECT * FROM records WHERE owner_id = ? AND id = ?').bind(owner,id).first();if(remote?.mutation_id===input.mutationId)return json({record:present(remote)});return json({error:'다른 기기에서 변경된 기록이 있어요.',code:'conflict',current:present(remote)},409);}
   return json({record:present(row)});
  }
  if(parts[0]==='images'&&parts.length===1&&request.method==='POST'){
   const mime=request.headers.get('content-type')?.split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(mime))return fail('PNG·JPG·WebP 이미지를 선택해 주세요.',415);
   const declared=Number(request.headers.get('content-length')||0);if(declared>8*1024*1024)return fail('이미지는 장당 8MB까지 저장할 수 있어요.',413);
   const reader=request.body?.getReader();if(!reader)return fail('이미지 내용이 없어요.');const chunks=[];let total=0;
   while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>8*1024*1024){await reader.cancel();return fail('이미지는 장당 8MB까지 저장할 수 있어요.',413);}chunks.push(value);}
   const bytes=new Uint8Array(total);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}
   const sig=mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes[0]===82&&bytes[1]===73&&bytes[8]===87&&bytes[9]===69;
   if(!sig)return fail('이미지 파일 내용을 확인해 주세요.');
   let name='기사 이미지';try{name=decodeURIComponent(request.headers.get('x-file-name')||name).slice(0,300);}catch{}
   const id=crypto.randomUUID(),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner));const prefix=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');const key=`images/${prefix}/${id}`;
   await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
   try{await env.DB.prepare('INSERT INTO images (owner_id,id,object_key,name,mime,size,created_at) VALUES (?,?,?,?,?,?,?)').bind(owner,id,key,name,mime,total,Date.now()).run();}catch(e){await env.BUCKET.delete(key);throw e;}
   return json({id,name,url:'/api/images/'+id},201);
  }
  if(parts[0]==='images'&&validId(parts[1])&&['GET','HEAD'].includes(request.method)){
   const image=await env.DB.prepare('SELECT * FROM images WHERE owner_id = ? AND id = ?').bind(owner,parts[1]).first();if(!image)return fail('이미지를 찾을 수 없어요.',404);
   const object=await env.BUCKET.get(image.object_key);if(!object)return fail('이미지를 찾을 수 없어요.',404);
   return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':image.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'}});
  }
  return fail('요청한 기능을 찾을 수 없어요.',404);
 }catch(error){console.error('Notebook API failure',error?.name);return fail('서버 저장 중 문제가 생겼어요. 입력은 기기에 보관되며 다시 시도할 수 있어요.',503,'server_error');}
}
