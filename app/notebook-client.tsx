'use client';
import {useEffect} from 'react';
export default function NotebookApp(){
 useEffect(()=>{
  // The existing notebook owns its subtree after hydration has completed.
  if(document.querySelector('script[data-notebook]'))return;
  const script=document.createElement('script');script.type='module';script.src='/app.js?v=2';script.dataset.notebook='true';
  script.onerror=()=>{const app=document.getElementById('app');if(app)app.textContent='앱을 불러오지 못했어요. 새로고침해 주세요.';};
  document.body.append(script);
 },[]);
 return <><a className="skip-link" href="#main">본문으로 건너뛰기</a><div id="app"><div className="loading-screen">계정을 확인하고 기록 공간을 열고 있어요…</div></div><dialog id="dialog" aria-labelledby="dialog-title"/><div id="toast" role="status" aria-live="polite"/></>;
}
