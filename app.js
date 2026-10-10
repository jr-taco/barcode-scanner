import {knownReference,electronicReference,compareReport} from './comparison.js?v=parity2-20261010';
import {initialize,readFileLocally} from './assets/decoder.js?v=parity2-20261010';
let ready=false;
const $ = id => document.getElementById(id);
let currentFile = null, report = null, busy = false, turns = 0, copyPublic = '', copyHidden = '';
let referenceBusy=false, comparisonRecord=null;
const mode = () => document.querySelector('input[name="mode"]:checked').value;
function activity(title, text, state='') {
  $('activity').className = `activity ${state}`;
  $('activity-title').textContent = title;
  $('activity-text').textContent = text;
  $('activity-icon').textContent = state === 'busy' ? '◌' : state === 'error' ? '!' : '○';
}
function pill(id, text, kind='') { $(id).textContent=text; $(id).className=`status-pill ${kind}`; }
function syncControls() {
  document.querySelectorAll('button,input,select').forEach(el=>el.disabled=busy||referenceBusy);
  $('download').disabled=busy||referenceBusy||!report?.id;
  $('download-comparison').disabled=busy||referenceBusy||!comparisonRecord;
  $('comparison-controls').hidden=!report?.id;
  $('comparison-wait').hidden=Boolean(report?.id);
  $('dropzone').disabled=busy||referenceBusy||!ready;
  $('expected-message').disabled=busy||referenceBusy||$('expected-format').value==='blank';
}
function clearComparison() {
  comparisonRecord=null; $('comparison-result').hidden=true;
  $('comparison-message').className='comparison-message';
  $('comparison-message').textContent='尚未核对';
}
function resetResults() {
  report=null; copyPublic=''; copyHidden='';
  clearComparison();$('comparison-controls').hidden=true;$('comparison-wait').hidden=false;
  $('reference-input').value='';$('expected-ean').value='';$('expected-message').value='';
  $('reference-file').textContent='只上传参考图片，不需要重新上传拍摄文件。';
  pill('public-status','读取中'); pill('hidden-status','读取中');
  $('public-value').textContent='— — —'; $('public-value').classList.add('placeholder');
  $('public-description').textContent='定位并读取公共条码…';
  $('hidden-value').textContent='正在读取'; $('hidden-value').classList.add('placeholder');
  $('hidden-description').textContent='保留原始像素，读取隐藏区域…';
  for(const id of ['copy-public','copy-hidden','hidden-meta','hidden-text','fusion-card','soft-card','improved-card','frames-card','technical']) $(id).hidden=true;
  $('download').disabled=true;
  $('record-label').textContent='正在生成本次记录';
}
async function displayResult(data) {
  report=data; $('download').disabled=!data.id;
  $('comparison-controls').hidden=!data.id;$('comparison-wait').hidden=Boolean(data.id);
  $('technical').hidden=false; $('technical-content').textContent=JSON.stringify(data,null,2);
  $('record-label').textContent=data.id ? `记录 ${data.id.slice(0,8)}` : '读取记录';
  if(data.error) {
    activity('文件未能读取',data.error,'error');
    pill('public-status','未读取','failed'); pill('hidden-status','未读取','failed');
    $('public-description').textContent='文件未进入有效图像读取。';
    $('hidden-value').textContent='未能读取'; $('hidden-description').textContent=data.error;
    return;
  }
  if(data.preview_url){$('preview').src=data.preview_url;$('preview').hidden=false;}
  $('preview-tag').textContent=data.source.kind==='video' ? '视频中心帧 · 原像素读取' : '原图预览';
  const center=data.center, reads=center.public;
  $('hidden-title').textContent=data.source.kind==='video'?'隐藏载荷 · 中心单帧':'隐藏载荷';
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
  if(data.source.kind==='video'&&!hidden?.bch_ok){
    const candidate=[['多路径交叉核对',data.improved_fusion],['固定五帧软判决',data.soft_fusion],['固定五帧硬判决',data.fusion]].find(([,r])=>r?.hidden?.bch_ok);
    if(candidate)activity('本次读取完成',`${candidate[0]}读出隐藏候选；中心单帧未解出。请与原始编码核对。`);
  }
  if(data.fusion) {
    const fusion=data.fusion; $('fusion-card').hidden=false;
    $('fusion-status').textContent=fusion.hidden?.bch_ok ? '候选 · 未确认' : fusion.hidden ? '未解出' : '不可测';
    $('fusion-value').textContent=fusion.hidden?.data_hex || '—';
    $('fusion-description').textContent=fusion.message;
    $('hidden-meta').querySelector('span').textContent='中心单帧 · 十六进制 · 7 字节';
  } else { $('hidden-meta').querySelector('span').textContent='十六进制 · 7 字节'; }
  if(data.soft_fusion) {
    const soft=data.soft_fusion;$('soft-card').hidden=false;
    $('soft-status').textContent=soft.hidden?.bch_ok?'候选 · 未确认':soft.hidden?'未解出':'不可测';
    $('soft-value').textContent=soft.hidden?.data_hex||'—';
    const methods={hard5:'保留硬五帧结果',frame_consensus:'帧消息一致性',chase:'软判决补救',soft_tie:'并列，弃答',soft_no_candidate:'无合法候选',incomplete:'帧不完整'};
    $('soft-description').textContent=`${methods[soft.method]||''}。${soft.message}`;
  }
  if(data.improved_fusion){
    const result=data.improved_fusion;$('improved-card').hidden=false;
    $('improved-status').textContent=result.method==='conflict'?'冲突 · 弃答':result.hidden?.bch_ok?'候选 · 未确认':result.hidden?'未解出':'不可测';
    $('improved-value').textContent=result.hidden?.data_hex||'—';$('improved-description').textContent=result.message;
    $('path-results').replaceChildren();
    const names={horizontal_gap:'当前读取',public_gap:'直接定位',horizontal_detrended:'亮度补偿①',public_detrended:'亮度补偿②'};
    for(const [name,path] of Object.entries(result.paths)){const p=document.createElement('p');p.textContent=`${names[name]}：${path.soft5.candidate_data_hex||'未解出'}`;$('path-results').append(p);}
  }
  displayFrames(data);
}
function displayFrames(data){
  const rows=data.observations||[];if(data.source.kind!=='video')return;
  $('frames-card').hidden=false;$('frame-rows').replaceChildren();
  const messages=new Set();let candidateFrames=0;
  rows.forEach((row,i)=>{
    const tr=document.createElement('tr'),time=data.source.selected_times_seconds?.[i],frame=data.source.frame_indices?.[i];
    const label=`${i+1}${i===Math.floor(rows.length/2)?' · 中心':''}${Number.isFinite(time)?` / ${time.toFixed(3)} 秒`:''}${Number.isInteger(frame)?` / 原帧 ${frame}`:''}`;
    const paths=row.sampling_paths;const hidden=paths?[paths.horizontal_gap?.hidden,paths.public_gap?.hidden,paths.horizontal_detrended?.hidden,paths.public_detrended?.hidden]:[row.hidden,null,null,null];
    if(hidden.some(h=>h?.bch_ok))candidateFrames++;
    for(const h of hidden)if(h?.bch_ok)messages.add(h.data_hex);
    const values=[label,(row.public||[]).map(r=>r.ean||r.text).join(' / ')||row.prediction?.public_ean||'未读到',...hidden.map(h=>h?.bch_ok?`${h.data_hex}${Number.isInteger(h.corrected_bits)?` · 纠正 ${h.corrected_bits} 位`:''}`:h?'未解出':'不可测')];
    for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    $('frame-rows').append(tr);
  });
  $('frames-summary').textContent=`${rows.length} 帧中 ${candidateFrames} 帧出现候选。${messages.size>1?'存在不同消息，请查看冲突并核对原编码。':messages.size?'候选仍未经原编码确认。':'本次五帧未形成单帧候选。'}`;
}
async function readFile(file, resetRotation=true) {
  if(!ready || busy || referenceBusy || !file) return;
  if(file.size>90*1024*1024) { activity('文件太大','请选择不超过 90 MB 的照片或短视频。','error'); return; }
  currentFile=file; if(resetRotation) turns=0;
  $('dropzone').hidden=true; $('preview-area').hidden=false;
  $('filename').textContent=file.name; $('filesize').textContent=`${(file.size/1024/1024).toFixed(2)} MB · ${mode()==='print'?'打印纸样':'屏幕条码'}`;
  $('preview').hidden=true; $('preview-tag').textContent='正在生成预览';
  busy=true; syncControls();
  resetResults(); activity('正在读取原始文件',/\.(mov|mp4|m4v)$/i.test(file.name)?'正在解码视频，按固定时刻读取五个原帧…':'正在定位公共条码，并读取隐藏区域…','busy');
  const start=performance.now(); $('read-duration').textContent='读取中';
  try {
    const data=await readFileLocally(file,mode(),turns);
    await displayResult(data);
    $('read-duration').textContent=`${((performance.now()-start)/1000).toFixed(1)} 秒`;
  } catch(error) {
    activity('文件未能读取',error.message||'请尝试清晰原图或兼容的视频。','error');
    pill('public-status','未完成','failed'); pill('hidden-status','未完成','failed');
    $('public-description').textContent='尚未收到公共码结果。'; $('hidden-value').textContent='读取未完成';
    $('hidden-description').textContent=error.message||'文件读取失败'; $('read-duration').textContent='未完成';
  } finally {
    busy=false; syncControls();
  }
}
function showComparison(reference) {
  comparisonRecord=compareReport(report,reference);
  $('comparison-rows').replaceChildren();
  for(const row of comparisonRecord.rows) {
    const tr=document.createElement('tr');
    const publicText=row.public_match===true?'一致':row.public_match===false?'不同':!reference.public_ean?(reference.kind==='encoded_message'?'未提供':'参考未读到'):'拍摄未读到';
    const blank=reference.kind==='encoded_blank';
    const hiddenText=blank?(row.hidden_match===true?'本次无候选':row.hidden_match===false?'空白出现候选':'不可测'):row.conflict?'候选冲突':row.hidden_match===true?'一致':row.hidden_match===false?'不同':!reference.hidden_hex?'参考未解出':'拍摄未解出';
    const conclusion=blank?(row.hidden_match===false?'空白误读候选':row.joint_match===true?'公共码一致，本次无候选':row.public_match===false?'公共码不同':'无法完整核对'):row.conflict?'冲突 · 弃答':row.joint_match===true?'两层均一致':row.joint_match===false?'存在不一致':row.hidden_match===true?'隐藏一致，公共码未核对':'无法完整核对';
    for(const [text,state] of [[row.label,null],[publicText,row.public_match],[hiddenText,row.hidden_match],[conclusion,row.joint_match]]) {
      const td=document.createElement('td');td.textContent=text;td.className=state===true?'good':state===false?'failed':'pending';tr.append(td);
    }
    $('comparison-rows').append(tr);
  }
  $('comparison-basis').textContent=reference.kind==='electronic_decode'?`依据：原始电子码 ${reference.filename} · 读取记录 ${reference.id.slice(0,8)}`:'依据：提供的原始编码内容';
  $('comparison-expected').textContent=`参考公共码：${reference.public_ean||'未提供或未读到'} · 参考隐藏内容：${reference.kind==='encoded_blank'?'无载荷（单次无候选不代表拒识已标定）':reference.hidden_hex||'未解出'}`;
  $('comparison-result').hidden=false;$('comparison-message').textContent='核对已完成，依据与逐项结果如下。';
  $('download-comparison').disabled=false;
}
async function readReference(file) {
  if(!file||busy||referenceBusy||!report?.id)return;
  clearComparison();
  if(file.size>90*1024*1024 || !/\.(png|jpe?g|webp|bmp|tiff?|heic|heif)$/i.test(file.name)) {
    $('comparison-message').textContent='请选择不超过 90 MB 的原始电子图片，推荐无损 PNG。';return;
  }
  referenceBusy=true;syncControls();$('reference-file').textContent=file.name;
  $('comparison-message').textContent='正在单独读取原始电子码…';
  try {
    const result=await readFileLocally(file,'screen',0);
    if(!result.id)throw Error(result.error||'未收到原始电子码的读取记录。');
    showComparison(electronicReference(result,file.name));
  } catch(error) {$('comparison-message').textContent=error.message||'参考读取失败，请稍后重试。';$('comparison-message').className='comparison-message error';}
  finally {referenceBusy=false;syncControls();}
}
$('reference-upload').onclick=()=>{if(report?.id&&!busy&&!referenceBusy)$('reference-input').click();};
$('reference-input').onchange=event=>{const file=event.target.files[0];event.target.value='';readReference(file);};
$('compare-known').onclick=()=>{
  if(busy||referenceBusy||!report?.id)return;
  clearComparison();
  try {showComparison(knownReference($('expected-message').value,$('expected-format').value,$('expected-ean').value));}
  catch(error){$('comparison-message').textContent=error.message;$('comparison-message').className='comparison-message error';}
};
for(const id of ['expected-ean','expected-message','expected-format'])$(id).addEventListener('input',clearComparison);
$('expected-format').onchange=()=>{
  syncControls();
  $('expected-message').placeholder=$('expected-format').value==='text'?'例如 NEWLINK':'例如 0123456789abcd';
  $('expected-hint').textContent=$('expected-format').value==='blank'?'用于编码记录明确为无载荷的对照。出现任何候选均标记为空白误读；不可测不会算通过。':$('expected-format').value==='text'?'本系统文本编码会在右侧补空格到 7 字节；下方显示实际核对的十六进制。内容只在当前浏览器核对。':'必须与实际写入的 7 字节一致；这里填写的内容只在当前浏览器用于比对。';
};
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
$('download-comparison').onclick=()=>{
  if(!comparisonRecord||comparisonRecord.capture_id!==report?.id)return;
  const blob=new Blob([JSON.stringify({capture:report,comparison:comparisonRecord},null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`比对记录_${report.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function loadReader(){
  $('dropzone').disabled=true;
  $('connection-label').textContent='正在加载读取组件…';
  activity('首次加载读取组件','稍等片刻，加载完成后可直接选择照片或视频。','busy');
  try{
    await initialize();ready=true;
    $('connection-label').textContent='浏览器读取器已就绪';
    activity('准备好读取','直接选择照片或短视频，文件在当前浏览器中处理。');
    syncControls();
  }catch(error){
    $('connection-label').textContent='组件加载失败';
    activity('读取组件未加载',error.message||'请刷新页面重试。','error');
  }
}
syncControls();loadReader();
