import {useEffect,useRef,useState} from 'react';

type Settings={configured:boolean;model:string;active:boolean};
async function call(path='',body?:object):Promise<any>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),path==='/test'?250000:15000);
 try{
  const response=await fetch('/api/settings/gemini'+path,{method:body===undefined?'GET':'POST',cache:'no-store',signal:controller.signal,
   headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw new Error(data?.detail||`설정 요청에 실패했습니다 (${response.status}). 앱 서버를 다시 실행해주세요.`);
  return data;
 }catch(e){if(controller.signal.aborted)throw new Error('서버 응답이 늦어지고 있습니다. 앱 서버 상태를 확인하고 다시 시도해주세요.');throw e;}
 finally{clearTimeout(timer);}
}
export default function GeminiSettings(){
 const [settings,setSettings]=useState<Settings|null>(null),[key,setKey]=useState(''),[model,setModel]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const keyInput=useRef<HTMLInputElement>(null),modelInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{let alive=true;call().then(s=>{if(alive){setSettings(s);setModel(s.model);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 async function save(remove=false){
  setError('');setMessage('');
  if(!remove&&!key.trim()&&!settings?.configured){setError('먼저 Gemini API 키를 입력해주세요. 아래 Google AI Studio 링크에서 발급한 키를 붙여넣으세요.');keyInput.current?.focus();return;}
  if(!/^gemini-[A-Za-z0-9._-]{1,90}$/.test(model.trim())){setError('모델 이름을 확인해주세요. gemini-로 시작하는 모델 이름이 필요합니다.');modelInput.current?.focus();return;}
  setBusy(true);setError('');setMessage('');
  try{const value=await call('',{apiKey:remove?'':key.trim(),model:model.trim(),remove});setSettings(value);setKey('');
   setMessage(remove?'저장된 Gemini 키를 삭제했습니다.':'Gemini 설정을 저장했습니다. 연결 확인을 눌러주세요.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="page-content" aria-label="Gemini API 설정"><div className="settings-section">
  <h2>Gemini 자막 분석 설정</h2><p>문장·청크·문단을 준비할 때 Gemini를 사용합니다. 저장하면 바로 적용됩니다.</p>
  <p>키 상태: <b>{settings?(settings.configured?'저장됨 · 연결 확인은 별도':'등록되지 않음'):'불러오는 중'}</b></p>
  <form noValidate onSubmit={e=>{e.preventDefault();void save();}}>
   <fieldset disabled={busy||!settings} style={{border:0,padding:0,display:'grid',gap:12}}>
    <label htmlFor="gemini-key">Gemini API 키</label>
    <input ref={keyInput} id="gemini-key" type="password" autoComplete="new-password" spellCheck={false} maxLength={4096} value={key} onChange={e=>{setKey(e.target.value);setError('');}} placeholder={settings?.configured?'새 키로 교체할 때만 입력':'Gemini API 키 붙여넣기'} aria-describedby="gemini-result"/>
    <label htmlFor="gemini-model">모델 이름</label><input ref={modelInput} id="gemini-model" value={model} onChange={e=>setModel(e.target.value)} aria-describedby="gemini-result"/>
    <div className="button-row"><button type="submit" className="primary-button">{busy?'처리 중…':'저장하고 Gemini 사용'}</button>
     <button type="button" className="secondary-button" disabled={!settings?.configured||!!key||model!==settings?.model} onClick={async()=>{setBusy(true);setError('');setMessage('');try{const r=await call('/test',{});setMessage(r.message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>연결 확인</button>
     <button type="button" className="plain-button" disabled={!settings?.configured} onClick={()=>void save(true)}>저장된 키 삭제</button></div>
   </fieldset>
  </form>
  <div id="gemini-result" aria-live="polite">{busy&&<p role="status">요청을 처리하고 있어요…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="inline-error">{error}</p>}</div>
  <p className="muted">저장은 이 컴퓨터에만 기록합니다. 키가 유효한지는 저장 후 ‘연결 확인’으로 확인하세요.</p>
  <p className="muted">키는 Windows 사용자 암호화로 이 컴퓨터에 저장되며 학습 백업에 포함되지 않습니다. 자막 분석 시 자막을 Google에 전송합니다. 연결 확인도 짧은 API 요청을 보내며 사용량이 발생할 수 있습니다.</p>
  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio에서 API 키 만들기</a>
  <p className="muted">저장 후 소리 연습실에서 ‘자막·AI 분석 준비’를 누르세요. 기존 발음 피드백 버튼은 로컬 AI 설정을 사용합니다.</p>
 </div></section>;
}
