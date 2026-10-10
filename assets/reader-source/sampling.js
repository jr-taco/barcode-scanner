import {projectRows,decodeBits} from './codec.js';
import {choose} from './soft.js';
export const pathNames=['horizontal_gap','public_gap','horizontal_detrended','public_detrended'];
const pattern=Array.from({length:24},(_,j)=>[1,-1,-1,1][Math.floor(j/6)]),x=pattern.map((_,j)=>2*j/23-1),x2=x.map(v=>v*v),mean=x2.reduce((a,b)=>a+b)/24;
const curved=x2.map(v=>v-mean),coefficient=pattern.reduce((s,v,i)=>s+v*curved[i],0)/curved.reduce((s,v)=>s+v*v,0);
const residual=pattern.map((v,i)=>v-coefficient*curved[i]),normal=residual.reduce((s,v,i)=>s+v*pattern[i],0);
export const detrendWeights=residual.map(v=>v/normal);
export function detrendRows(rows){
  return Array.from({length:100},(_,i)=>{const r=Math.floor(i/10),k=i%10;return detrendWeights.reduce((s,w,j)=>s+w*rows[r*24+j][k],0);});
}
const observation=scores=>{scores=Array.from(scores);const bits=scores.map(v=>Number(v>0));return {scores,hidden:{raw100:bits,...decodeBits(bits)}};};
export function samplingPaths(base,horizontal,c){
  const a=projectRows(base,c,true),b=projectRows(horizontal,c,true);
  return {horizontal_gap:observation(b.scores),public_gap:observation(a.scores),horizontal_detrended:observation(detrendRows(b.rows)),public_detrended:observation(detrendRows(a.rows))};
}
export function crossPath(observations,times){
  const eans=observations.map(r=>r.prediction?.public_ean),complete=observations.length===5&&new Set(times).size===5&&eans.every(Boolean)&&new Set(eans).size===1&&observations.every(r=>pathNames.every(p=>r.sampling_paths?.[p]));
  const result={method:'incomplete',status:'UNAVAILABLE',hidden:null,paths:{},evidence:[],accepted:false,public_ean:complete?eans[0]:null,message:'需要五个不同原帧、相同公共码及完整采样路径；失败帧不替换。'};
  if(!complete)return result;
  const candidates=new Map();
  function add(message,name,source){if(!message)return;if(!candidates.has(message))candidates.set(message,{});const paths=candidates.get(message);(paths[name]??=[]).push(source);}
  for(const name of pathNames){
    const rows=observations.map(r=>r.sampling_paths[name]);
    const bits=Array.from({length:100},(_,i)=>Number(rows.reduce((s,r)=>s+Number(r.scores[i]>0),0)>=3)),means=Array.from({length:100},(_,i)=>rows.reduce((s,r)=>s+r.scores[i],0)/5),hard=decodeBits(bits);
    const decision=choose(true,hard.data_hex,rows.map(r=>r.hidden.data_hex),bits,means);
    result.paths[name]={hard5:hard,hard100:bits,mean_scores:means,soft5:decision};
    rows.forEach((r,i)=>add(r.hidden.data_hex,name,`frame:${i}`));add(decision.candidate_data_hex,name,'fusion');
  }
  result.evidence=Array.from(candidates,([data_hex,paths])=>({data_hex,paths}));
  let method='no_candidate',message=null;
  if(candidates.size>1)method='conflict';
  else if(candidates.size===1){const [hex,paths]=candidates.entries().next().value,supported=Object.keys(paths).length>=2&&Object.values(paths).some(v=>v.includes('fusion')||v.length>=2);method=supported?'path_agreement':'isolated_candidate';message=supported?hex:null;}
  return {...result,method,status:message?'CANDIDATE':method==='conflict'?'CONFLICT':'HIDDEN_NOT_DECODED',hidden:{bch_ok:Boolean(message),data_hex:message,accepted:false},message:{path_agreement:'不同采样路径给出同一候选；仍须核对原始编码。',conflict:'不同采样路径出现不同消息，保留候选并弃答。',isolated_candidate:'出现孤立候选，证据不足，未提升为交叉核对结果。',no_candidate:'所有固定采样路径均未形成候选。'}[method]};
}
