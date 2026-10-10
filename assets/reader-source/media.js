// FFmpeg-compatible table arithmetic: LGPL-2.1-or-later, see MEDIA_NOTICE.md.
const offsets=[-.25,-.125,0,.125,.25];
function boxes(view,start,end){
  const result=[];for(let p=start;p<end;){
    if(end-p<8)throw Error('Truncated media box');let size=view.getUint32(p),header=8;
    const type=String.fromCharCode(...new Uint8Array(view.buffer,p+4,4));
    if(size===1){if(end-p<16)throw Error('Truncated extended box');size=Number(view.getBigUint64(p+8));header=16;}
    if(size===0)size=end-p;
    if(!Number.isSafeInteger(size)||size<header||p+size>end)throw Error('Invalid media box');
    result.push({type,start:p+header,end:p+size});p+=size;
  }return result;
}
function child(view,parent,type){const b=boxes(view,parent.start,parent.end).find(b=>b.type===type);if(!b)throw Error('Missing media box '+type);return b;}
function timeTable(view,box,signed=false){
  const count=view.getUint32(box.start+4);if(box.start+8+count*8>box.end)throw Error('Invalid time table');
  const values=[];for(let i=0;i<count;i++){
    const p=box.start+8+i*8,n=view.getUint32(p),value=signed?view.getInt32(p+4):view.getUint32(p+4);
    if(values.length+n>10000)throw Error('Too many video frames');for(let j=0;j<n;j++)values.push(value);
  }return values;
}
export function nativeTimeline(buffer){
  const view=new DataView(buffer),moov=child(view,{start:0,end:buffer.byteLength},'moov');
  const tracks=boxes(view,moov.start,moov.end).filter(b=>b.type==='trak');
  const track=tracks.find(t=>{const h=child(view,child(view,t,'mdia'),'hdlr');return String.fromCharCode(...new Uint8Array(buffer,h.start+8,4))==='vide';});
  if(!track)throw Error('No video track');
  const mdia=child(view,track,'mdia'),mdhd=child(view,mdia,'mdhd'),scale=view.getUint32(mdhd.start+(view.getUint8(mdhd.start)===1?20:12));
  if(!scale)throw Error('Invalid video time scale');
  const stbl=child(view,child(view,mdia,'minf'),'stbl'),durations=timeTable(view,child(view,stbl,'stts'));
  // QuickTime can store negative offsets in version-0 ctts; FFmpeg treats them as signed.
  const ctts=boxes(view,stbl.start,stbl.end).find(b=>b.type==='ctts'),composition=ctts?timeTable(view,ctts,true):durations.map(()=>0);
  if(durations.length<5||composition.length!==durations.length)throw Error('Incomplete video time table');
  let dts=0;const pts=durations.map((duration,i)=>{const t=dts+composition[i];dts+=duration;return t;}).sort((a,b)=>a-b);
  const edts=boxes(view,track.start,track.end).find(b=>b.type==='edts');
  if(edts){const e=child(view,edts,'elst'),version=view.getUint8(e.start),n=view.getUint32(e.start+4);if(n!==1)throw Error('Unsupported video edit list');
    const mediaTime=version===1?Number(view.getBigInt64(e.start+16)):view.getInt32(e.start+12);
    if(mediaTime!==pts[0])throw Error('Trimmed video edit list');
  }
  const times=pts.map(t=>(t-pts[0])/scale);
  if(times.at(-1)<.5||times.at(-1)>30||new Set(times).size!==times.length)throw Error('Invalid native frame times');
  const targets=offsets.map(o=>times.at(-1)/2+o);
  const indices=targets.map(target=>{let best=0;for(let i=1;i<times.length;i++)if(Math.abs(times[i]-target)<Math.abs(times[best]-target)-1e-9)best=i;return best;});
  if(new Set(indices).size!==5)throw Error('Duplicate native frame selection');
  const tkhd=child(view,track,'tkhd'),m=tkhd.start+(view.getUint8(tkhd.start)===1?52:40),matrix=Array.from({length:9},(_,i)=>view.getInt32(m+4*i));
  const [a,b,u,c,d,v,x,y,w]=matrix,turns=new Map([['65536,0,0,65536',0],['0,-65536,65536,0',1],['-65536,0,0,-65536',2],['0,65536,-65536,0',3]]).get([a,b,c,d].join(','));
  if(turns===undefined||u||v||w!==1073741824||x%65536||y%65536)throw Error('Unsupported video display matrix');
  return {times,indices,targets,turns,matrix,selected:indices.map(i=>times[i]),seek:indices.map(i=>times[i]+((times[i+1]??(dts-pts[0])/scale)-times[i])/2)};
}
const matrices={bt709:[117489,138438,-13975,-34925],smpte170m:[104597,132201,-25675,-53279],bt470bg:[104597,132201,-25675,-53279],smpte240m:[117579,136230,-16907,-35559],fcc:[104448,132798,-24759,-53109],'bt2020-ncl':[110013,140363,-12277,-42626]};
export function planarRGBA(bytes,layout,format,width,height,colorSpace){
  const coefficients=matrices[colorSpace.matrix];
  if(!coefficients||colorSpace.fullRange!==false||!['NV12','I420'].includes(format)||width%2||height%2)throw Error('Unsupported native YUV format');
  const planes=format==='NV12'?[[width,height],[width,height/2]]:[[width,height],[width/2,height/2],[width/2,height/2]];
  for(const [i,[cols,rows]] of planes.entries()){const p=layout[i];if(!p||!Number.isInteger(p.offset)||!Number.isInteger(p.stride)||p.offset<0||p.stride<cols||p.offset+(rows-1)*p.stride+cols>bytes.length)throw Error('Incomplete native YUV plane');}
  const cy=Math.trunc(65536*255/219),inc=coefficients.map(v=>Math.trunc((v*65536+32768)/cy));
  const table=Uint8ClampedArray.from({length:1024},(_,i)=>(i*cy-400*65536+32768)>>16);
  const chroma=inc.map(v=>Int16Array.from({length:256},(_,i)=>(i*v>>16)-(v>>9)));
  const out=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const yy=bytes[layout[0].offset+y*layout[0].stride+x],cx=x>>1,ccy=y>>1;
    const u=bytes[layout[1].offset+ccy*layout[1].stride+(format==='NV12'?2*cx:cx)];
    const v=bytes[(format==='NV12'?layout[1].offset:layout[2].offset)+ccy*(format==='NV12'?layout[1].stride:layout[2].stride)+(format==='NV12'?2*cx+1:cx)];
    const p=(y*width+x)*4;out[p]=table[326+yy+chroma[0][v]];out[p+1]=table[326+yy+chroma[2][u]+chroma[3][v]];out[p+2]=table[326+yy+chroma[1][u]];out[p+3]=255;
  }return {width,height,data:out};
}
export async function nativeCanvas(video,timeline,rotate){
  if(typeof VideoFrame==='undefined')throw Error('Native video pixels unavailable');
  const frame=new VideoFrame(video);
  try{
    const rect=frame.visibleRect;
    if(!rect||rect.x||rect.y||rect.width!==frame.codedWidth||rect.height!==frame.codedHeight)throw Error('Cropped native video frame');
    const bytes=new Uint8Array(frame.allocationSize()),layout=await frame.copyTo(bytes),pixels=planarRGBA(bytes,layout,frame.format,frame.codedWidth,frame.codedHeight,frame.colorSpace);
    const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
    canvas.getContext('2d').putImageData(new ImageData(pixels.data,pixels.width,pixels.height),0,0);
    return rotate(canvas,pixels.width,pixels.height,timeline.turns);
  }finally{frame.close();}
}
