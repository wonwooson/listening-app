// Read-aloud recordings stay in this browser only. They are never uploaded and never appear in the app backup,
// and nothing here scores the learner's voice; the recording exists to be replayed next to the original.
export type Recording={id:string;clipId:string;sessionId:string;step:number;at:string;seconds:number;blob:Blob};

const DB='listening-notebook-recordings',STORE='recordings',VERSION=1;

function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE)){
    const store=db.createObjectStore(STORE,{keyPath:'id'});
    store.createIndex('clipId','clipId');
   }
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error??new Error('브라우저 저장소를 열지 못했습니다.'));
 });
}

async function withStore<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await open();
 try{
  return await new Promise<T>((resolve,reject)=>{
   const request=run(db.transaction(STORE,mode).objectStore(STORE));
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error??new Error('녹음을 저장하지 못했습니다.'));
  });
 }finally{db.close();}
}

export function supported(){
 return typeof indexedDB!=='undefined'&&typeof MediaRecorder!=='undefined'&&!!navigator.mediaDevices?.getUserMedia;
}

export async function saveRecording(entry:Omit<Recording,'id'|'at'>&{at?:string}){
 const record:Recording={...entry,id:`${entry.clipId}:${entry.step}:${Date.now()}`,at:entry.at??new Date().toISOString()};
 await withStore('readwrite',store=>store.put(record) as IDBRequest<any>);
 return record;
}

export async function recordingsFor(clipId:string):Promise<Recording[]>{
 const rows=await withStore<Recording[]>('readonly',store=>store.index('clipId').getAll(clipId) as IDBRequest<Recording[]>);
 return (rows??[]).sort((a,b)=>a.at<b.at?1:-1);
}

export async function removeRecording(id:string){
 await withStore('readwrite',store=>store.delete(id) as IDBRequest<any>);
}

export async function countRecordings(){
 const rows=await withStore<Recording[]>('readonly',store=>store.getAll() as IDBRequest<Recording[]>);
 return (rows??[]).length;
}
