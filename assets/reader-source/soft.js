import {decodeBits} from './codec.js';
export function chase(bits,means,p=4,decoder=decodeBits){
  const selected=Array.from({length:91},(_,i)=>i).sort((a,b)=>Math.abs(means[a])-Math.abs(means[b])||a-b).slice(0,p),trials=[];
  for(let mask=0;mask<(1<<p);mask++){
    const flipped=selected.filter((_,j)=>mask&(1<<j)),trial=Array.from(bits);
    for(const i of flipped)trial[i]^=1;
    const r=decoder(trial);
    trials.push({mask,flipped_indices:flipped,cost:flipped.reduce((sum,i)=>sum+Math.abs(means[i]),0),bch_ok:r.bch_ok,corrected_bits:r.corrected_bits,data_hex:r.data_hex});
  }
  const legal=trials.filter(t=>t.bch_ok).sort((a,b)=>a.cost-b.cost||a.mask-b.mask),best=legal.filter(t=>t.cost===legal[0]?.cost),chosen=best.length===1?best[0]:null;
  return {p,selected_indices:selected,trials,legal_candidates:legal.length,distinct_messages:new Set(legal.map(t=>t.data_hex)).size,best_mask:chosen?.mask??null,best_cost:legal[0]?.cost??null,distance_gap:legal.length>1?legal[1].cost-legal[0].cost:null,candidate_data_hex:chosen?.data_hex??null,status:chosen?'chase':best.length?'soft_tie':'soft_no_candidate'};
}
export function choose(complete,hard,frames,bits,means,p=4,decoder=decodeBits){
  if(!complete)return {candidate_data_hex:null,method:'incomplete',search:null,accepted:false};
  if(hard!==null)return {candidate_data_hex:hard,method:'hard5',search:null,accepted:false};
  const valid=frames.filter(x=>x!==null);
  if(valid.length>=2&&new Set(valid).size===1)return {candidate_data_hex:valid[0],method:'frame_consensus',search:null,accepted:false};
  const search=chase(bits,means,p,decoder);
  return {candidate_data_hex:search.candidate_data_hex,method:search.status,search,accepted:false};
}
export function fuseObservations(observations,times,mode){
  const eans=observations.map(row=>row.hidden?row.prediction?.public_ean:null);
  const complete=observations.length===5&&new Set(times).size===5&&eans.every(Boolean)&&new Set(eans).size===1;
  let fusion={status:'UNAVAILABLE',hidden:null,accepted:false,message:'五帧融合不可测：需要五个不同时间的原帧、同一公共EAN和完整隐藏区域。'},bits=null,means=null;
  if(complete){
    bits=Array.from({length:100},(_,i)=>Number(observations.reduce((sum,row)=>sum+row.hidden.raw100[i],0)>=3));
    const hidden={raw100:bits,...decodeBits(bits)};
    fusion={status:hidden.bch_ok?'CANDIDATE':'HIDDEN_NOT_DECODED',hidden,public_ean:eans[0],accepted:false,message:'固定五次浏览器采样逐位多数票；不替换失败帧，候选仍需核对。'};
    if(mode==='print')means=Array.from({length:100},(_,i)=>observations.reduce((sum,row)=>sum+row.scores[i],0)/5);
  }
  let soft_fusion=null;
  if(mode==='print'){
    const decision=choose(complete,fusion.hidden?.data_hex??null,observations.map(row=>row.hidden?.data_hex??null),bits,means);
    const hex=decision.candidate_data_hex,hidden=complete?{raw100:bits,bch_ok:Boolean(hex),data_hex:hex,text:null,corrected_bits:decision.method==='hard5'?fusion.hidden.corrected_bits:null,accepted:false}:null;
    soft_fusion={...decision,hidden,public_ean:complete?eans[0]:null,status:!complete?'UNAVAILABLE':hex?'CANDIDATE':'HIDDEN_NOT_DECODED',message:'使用同一组固定五帧，依次保留硬判决、帧消息一致性和固定p=4软判决；仍需核对原始编码内容。'};
  }
  return {fusion,soft_fusion};
}
