import {setNativeDecoder} from './codec.js';
export async function initializeBCH(bytes){
 if(!bytes){const response=await fetch(new URL('./bch.wasm',import.meta.url));if(!response.ok)throw Error('纠错读取组件下载失败，请刷新重试。');bytes=await response.arrayBuffer();}
 const module=await WebAssembly.compile(bytes);
 const imports={wasi_snapshot_preview1:{proc_exit:code=>{throw Error('纠错组件退出：'+code);},fd_close:()=>0,fd_seek:()=>0,fd_write:()=>0}};
 const {exports}=await WebAssembly.instantiate(module,imports);
 setNativeDecoder(input=>{
  const packet=new Uint8Array(exports.memory.buffer,exports.get_packet(),12);packet.fill(0);
  for(let i=0;i<96;i++)packet[i>>3]|=input[i]<<(7-(i&7));
  const corrected=exports.decode_packet();
  if(corrected<0)return {bch_ok:false,data_hex:null,text:null,corrected_bits:null,accepted:false};
  const data=new Uint8Array(exports.memory.buffer,exports.get_packet(),7).slice();
  const hex=Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');let text=null;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{}
  return {bch_ok:true,data_hex:hex,text,corrected_bits:corrected,accepted:false};
 });
}
