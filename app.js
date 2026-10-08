const SERVICE_ORIGIN="https://majian-barcode-reader-20261008.yongkang-cheng.chatgpt.site";
let visitorKey;
try { visitorKey=localStorage.getItem('majian-barcode-scanner-visitor'); } catch {}
if(!/^[a-f0-9]{64}$/.test(visitorKey || '')) {
  visitorKey=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  try { localStorage.setItem('majian-barcode-scanner-visitor',visitorKey); } catch {}
}
function apiFetch(path,options={}) {
  if(!/^\/(?:api\/(?:health|read(?:\/[a-f0-9]{32})?)|results\/[a-f0-9]{32}\/(?:report\.json|preview\.jpg))$/.test(path))throw Error('Invalid service path');
  return fetch(SERVICE_ORIGIN+path,{...options,credentials:'omit',headers:{...(options.headers||{}),Authorization:'Visitor '+visitorKey}});
}
let previewObjectURL=null;
const $ = id => document.getElementById(id);
let currentFile = null, report = null, busy = false, turns = 0, copyPublic = '', copyHidden = '';
const mode = () => document.querySelector('input[name="mode"]:checked').value;
function activity(title, text, state='') {
  $('activity').className = `activity ${state}`;
  $('activity-title').textContent = title;
  $('activity-text').textContent = text;
  $('activity-icon').textContent = state === 'busy' ? '◌' : state === 'error' ? '!' : '○';
}
function pill(id, text, kind='') { $(id).textContent=text; $(id).className=`status-pill ${kind}`; }
function resetResults() {
  report=null; copyPublic=''; copyHidden='';
  pill('public-status','读取中'); pill('hidden-status','读取中');
  $('public-value').textContent='— — —'; $('public-value').classList.add('placeholder');
  $('public-description').textContent='定位并读取公共条码…';
  $('hidden-value').textContent='正在读取'; $('hidden-value').classList.add('placeholder');
  $('hidden-description').textContent='保留原始像素，读取隐藏区域…';
  for(const id of ['copy-public','copy-hidden','hidden-meta','hidden-text','fusion-card','technical']) $(id).hidden=true;
  $('download').disabled=true;
  $('record-label').textContent='正在保存本次记录';
}
async function displayResult(data) {
  report=data; $('download').disabled=!data.report_url;
  $('technical').hidden=false; $('technical-content').textContent=JSON.stringify(data,null,2);
  $('record-label').textContent=data.id ? `记录 ${data.id.slice(0,8)}` : '读取记录';
  if(data.error) {
    activity('文件未能读取',data.error,'error');
    pill('public-status','未读取','failed'); pill('hidden-status','未读取','failed');
    $('public-description').textContent='文件未进入有效图像读取。';
    $('hidden-value').textContent='未能读取'; $('hidden-description').textContent=data.error;
    return;
  }
  if(data.preview_url) {
    try {
      const response=await apiFetch(data.preview_url);
      if(response.ok){if(previewObjectURL)URL.revokeObjectURL(previewObjectURL);previewObjectURL=URL.createObjectURL(await response.blob());$('preview').src=previewObjectURL;$('preview').hidden=false;}
    } catch {}
  }
  $('preview-tag').textContent=data.source.kind==='video' ? '视频中心帧 · 原像素读取' : '原图预览';
  const center=data.center, reads=center.public;
  if(reads.length) {
    copyPublic=reads.map(d=>d.ean || d.text).join('\n');
    $('public-value').textContent=copyPublic; $('public-value').classList.remove('placeholder');
    pill('public-status','已读取','good');
    $('public-description').textContent=reads.map(d=>`${d.format}${d.ean && d.format !== 'EAN-13' ? ' · 规范化为 EAN-13' : ''}`).join(' / ');
    $('copy-public').hidden=false;
  } else {
    pill('public-status','未读到','failed'); $('public-description').textContent='当前画面未检测到可读取的公共条码。';
  }
  const hidden=center.hidden;
  if(hidden?.bch_ok) {
    copyHidden=hidden.data_hex;
    pill('hidden-status','候选 · 未确认','candidate');
    $('hidden-value').textContent=hidden.data_hex; $('hidden-value').classList.remove('placeholder');
    $('hidden-description').textContent='纠错解码产生的候选数据。请与原始消息核对。';
    $('hidden-meta').hidden=false; $('correction-count').textContent=`纠正 ${hidden.corrected_bits} 位`;
    if(hidden.text && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(hidden.text)) {
      $('hidden-text').hidden=false; $('hidden-text').textContent=`可读文本：${hidden.text}`;
    }
    $('copy-hidden').hidden=false;
  } else {
    pill('hidden-status',hidden ? '未解出' : '不可测','failed');
    $('hidden-value').textContent=hidden ? '未解出隐藏载荷' : '隐藏区域不可测';
    $('hidden-description').textContent=center.message;
  }
  activity(reads.length ? '本次读取完成' : '未读到公共条码',center.message,reads.length ? '' : 'error');
  if(data.fusion) {
    const fusion=data.fusion; $('fusion-card').hidden=false;
    $('fusion-status').textContent=fusion.hidden?.bch_ok ? '候选 · 未确认' : fusion.hidden ? '未解出' : '不可测';
    $('fusion-value').textContent=fusion.hidden?.data_hex || '—';
    $('fusion-description').textContent=fusion.message;
    $('hidden-meta').querySelector('span').textContent='中心单帧 · 十六进制 · 7 字节';
  } else { $('hidden-meta').querySelector('span').textContent='十六进制 · 7 字节'; }
}
async function readFile(file, resetRotation=true) {
  if(busy || !file) return;
  if(file.size>90*1024*1024) { activity('文件太大','请选择不超过 90 MB 的照片或短视频。','error'); return; }
  currentFile=file; if(resetRotation) turns=0;
  $('dropzone').hidden=true; $('preview-area').hidden=false;
  $('filename').textContent=file.name; $('filesize').textContent=`${(file.size/1024/1024).toFixed(2)} MB · ${mode()==='print'?'打印纸样':'屏幕条码'}`;
  $('preview').hidden=true; $('preview-tag').textContent='正在生成预览';
  busy=true; document.querySelectorAll('button,input').forEach(el=>el.disabled=true);
  resetResults(); activity('正在读取原始文件',/\.(mov|mp4|m4v)$/i.test(file.name)?'正在解码视频，按固定时刻读取五个原帧…':'正在定位公共条码，并读取隐藏区域…','busy');
  const start=performance.now(); $('read-duration').textContent='读取中';
  try {
    const response=await apiFetch('/api/read',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name),'X-Mode':mode(),'X-Turns':String(turns)},body:file});
    let data=await response.json();
    const deadline=Date.now()+180000;
    while(data.status==='queued' && data.poll_url) {
      activity('原文件已收到，正在读取','等待读取器处理；本次记录会保留。','busy');
      if(Date.now()>deadline) { activity('读取仍在处理中','稍后点击重新读取，或保留本次记录编号。','error'); throw new Error('queued'); }
      await new Promise(resolve=>setTimeout(resolve,1500));
      const pending=await apiFetch(data.poll_url); data=await pending.json();
    }
    document.querySelectorAll('button,input').forEach(el=>el.disabled=false);
    await displayResult(data);
    $('read-duration').textContent=`${((performance.now()-start)/1000).toFixed(1)} 秒`;
  } catch(error) {
    activity('连接中断','读取服务暂时未连接，请稍后再试。','error');
    pill('public-status','未完成','failed'); pill('hidden-status','未完成','failed');
    $('public-description').textContent='尚未收到公共码结果。'; $('hidden-value').textContent='读取未完成';
    $('hidden-description').textContent='请重新连接读取器。'; $('read-duration').textContent='连接中断';
  } finally {
    busy=false; document.querySelectorAll('button,input').forEach(el=>el.disabled=false); $('download').disabled=!report?.report_url;
  }
}
$('dropzone').onclick=()=>$('file-input').click(); $('replace').onclick=()=>$('file-input').click();
$('file-input').onchange=event=>readFile(event.target.files[0]);
for(const event of ['dragenter','dragover']) $('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.add('dragging');});
for(const event of ['dragleave','drop']) $('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('dragging');});
$('dropzone').addEventListener('drop',event=>{if(!busy)readFile(event.dataTransfer.files[0]);});
$('rotate').onclick=()=>{turns=(turns+1)%4; readFile(currentFile,false);};
$('reread').onclick=()=>readFile(currentFile,false);
document.querySelectorAll('input[name="mode"]').forEach(input=>input.onchange=()=>{if(currentFile)activity('读取模式已切换','点“重新读取”使用新的条码来源。');});
async function copy(value,button) {
  try { await navigator.clipboard.writeText(value); const previous=button.textContent; button.textContent='已复制';setTimeout(()=>button.textContent=previous,1500); }
  catch(error) { activity('复制不可用','请从结果卡片手动选择并复制内容。'); }
}
$('copy-public').onclick=()=>copy(copyPublic,$('copy-public')); $('copy-hidden').onclick=()=>copy(copyHidden,$('copy-hidden'));
$('download').onclick=async()=>{
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=`读取记录_${report.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function checkConnection() {
  if(busy)return;
  try {
    const response=await apiFetch('/api/health'); if(!response.ok)throw new Error();
    $('connection-label').textContent='读取器已连接'; $('dropzone').disabled=false;
    if(!currentFile)activity('准备好读取','上传一张照片，或一段清晰的短视频。');
  } catch {
    $('connection-label').textContent='读取服务尚未连接'; $('dropzone').disabled=true;
    if(!currentFile)activity('读取器未连接','网站已公开；读取电脑连接后即可上传。','error');
  }
}
checkConnection();setInterval(checkConnection,10000);
