const payloadPattern=/^[a-f0-9]{14}$/;
const publicEAN=row=>{
  const values=[...new Set((row?.public||[]).map(item=>item.ean||item.text).filter(value=>/^\d{13}$/.test(value||'')))];
  return values.length===1?values[0]:null;
};
const hiddenHex=row=>row?.hidden?.bch_ok && payloadPattern.test(row.hidden.data_hex||'')?row.hidden.data_hex:null;

export function knownReference(value,format,ean='') {
  ean=ean.trim();
  if(ean){
    if(!/^\d{13}$/.test(ean))throw Error('公共码需为 13 位 EAN-13；也可以留空，仅核对隐藏消息。');
    const sum=[...ean.slice(0,12)].reduce((total,digit,index)=>total+Number(digit)*(index%2?3:1),0);
    if((10-sum%10)%10!==Number(ean[12]))throw Error('公共码的 EAN-13 校验位不正确，请核对原始记录。');
  }
  let hex;
  if(format==='blank'){
    return {kind:'encoded_blank',public_ean:ean||null,hidden_hex:null,input_format:format,input_value:null,padding:null};
  }else if(format==='hex'){
    hex=value.replace(/\s+/g,'').replace(/^0x/i,'').toLowerCase();
    if(!payloadPattern.test(hex))throw Error('隐藏内容需为 14 位十六进制，也就是实际写入的 7 字节。');
  }else if(format==='text'){
    const bytes=new TextEncoder().encode(value);
    if(!bytes.length||bytes.length>7)throw Error('原始文本需为 1–7 个 UTF-8 字节；一个汉字通常占多个字节。');
    const padded=new Uint8Array(7).fill(32);padded.set(bytes);
    hex=Array.from(padded,byte=>byte.toString(16).padStart(2,'0')).join('');
  }else throw Error('请选择有效的隐藏内容格式。');
  return {kind:'encoded_message',public_ean:ean||null,hidden_hex:hex,input_format:format,input_value:value,padding:format==='text'?'spaces_to_7_bytes':null};
}

export function electronicReference(report,filename) {
  if(!report?.id || report.status==='queued')throw Error('原始电子码尚未读取完成。');
  return {kind:'electronic_decode',id:report.id,filename,public_ean:publicEAN(report.center),hidden_hex:hiddenHex(report.center),report};
}

export function compareReport(capture,reference) {
  if(!capture?.id || capture.status==='queued')throw Error('请先完成拍摄文件的读取。');
  if(!reference || !['encoded_message','encoded_blank','electronic_decode'].includes(reference.kind))throw Error('缺少核对依据。');
  const row=(label,observation)=>{
    const actualEAN=observation?.public_ean||publicEAN(observation),actualHidden=hiddenHex(observation);
    const public_match=reference.public_ean && actualEAN?reference.public_ean===actualEAN:null;
    const candidateSeen=Boolean(actualHidden||observation?.evidence?.length);
    const hidden_match=reference.kind==='encoded_blank'?(candidateSeen?false:observation?.hidden?.bch_ok===false?true:null):reference.hidden_hex && actualHidden?reference.hidden_hex===actualHidden:null;
    const joint_match=public_match===false||hidden_match===false?false:public_match===true&&hidden_match===true?true:null;
    return {label,actual_public_ean:actualEAN,actual_hidden_hex:actualHidden,public_match,hidden_match,joint_match};
  };
  const rows=[row('中心单帧',capture.center)];
  if(capture.fusion)rows.push(row('固定五帧 · 硬判决',capture.fusion));
  if(capture.soft_fusion)rows.push(row('固定五帧 · 新软判决',capture.soft_fusion));
  if(capture.improved_fusion){
    const improved=row('多路径交叉核对',capture.improved_fusion);
    if(capture.improved_fusion.method==='conflict'){if(reference.kind!=='encoded_blank'){improved.hidden_match=null;improved.joint_match=null;}improved.conflict=true;}
    rows.push(improved);
  }
  if(capture.source?.kind==='video')for(const [i,observation] of (capture.observations||[]).entries()){
    rows.push(row(`第 ${i+1} 帧 · 当前读取`,observation));
    for(const [name,path] of Object.entries(observation.sampling_paths||{}))if(name!=='horizontal_gap')rows.push(row(`第 ${i+1} 帧 · ${{public_gap:'直接定位',horizontal_detrended:'亮度补偿①',public_detrended:'亮度补偿②'}[name]||name}`,{...path,public_ean:observation.prediction?.public_ean}));
  }
  return {capture_id:capture.id,compared_at:new Date().toISOString(),basis:reference.kind,reference,rows,accepted:false};
}
