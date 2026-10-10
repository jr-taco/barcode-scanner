// Existing BCH(5, prim_poly=137), shortened 56 data +35 parity bits.
const EXP = new Uint8Array(254), LOG = new Uint8Array(128);
let field = 1;
for(let i=0;i<127;i++){ EXP[i]=field; LOG[field]=i; field<<=1;if(field&128)field^=137; }
for(let i=127;i<254;i++)EXP[i]=EXP[i-127];
const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
const div=(a,b)=>a?EXP[(LOG[a]-LOG[b]+127)%127]:0;
const roots=new Set();
for(let i=1;i<=10;i++){let root=i;do{roots.add(root);root=root*2%127;}while(root!==i);}
let polynomial=[1];
for(const root of roots){const next=Array(polynomial.length+1).fill(0);for(let i=0;i<polynomial.length;i++){next[i]^=mul(polynomial[i],EXP[root]);next[i+1]^=polynomial[i];}polynomial=next;}
if(polynomial.length!==36||polynomial.some(v=>v>1))throw new Error('BCH generator mismatch');
const generator=polynomial.reduce((v,bit,i)=>v|(BigInt(bit)<<BigInt(i)),0n);

export function encodeHex(hex){
  if(!/^[a-f0-9]{14}$/i.test(hex))throw new Error('Expected seven bytes');
  const value=BigInt('0x'+hex),original=value<<35n;
  let remainder=original;
  for(let i=90;i>=35;i--)if(remainder&(1n<<BigInt(i)))remainder^=generator<<BigInt(i-35);
  const word=original|remainder;
  return Array.from({length:100},(_,i)=>i<91?Number(word>>BigInt(90-i)&1n):0);
}

let nativeDecoder=null;
export function setNativeDecoder(decoder){nativeDecoder=decoder;}
export function decodeBits(input){
  if(nativeDecoder)return nativeDecoder(input);
  const bits=Array.from(input);if(bits.length!==100)throw new Error('Expected 100 bits');
  const failed={bch_ok:false,data_hex:null,text:null,corrected_bits:null,accepted:false};
  function syndromes(word){return Array.from({length:10},(_,i)=>word.slice(0,91).reduce((sum,bit,index)=>sum^(bit?EXP[(i+1)*(90-index)%127]:0),0));}
  const syndrome=syndromes(bits);let corrected=0;
  if(syndrome.some(Boolean)){
    let C=Array(11).fill(0),B=Array(11).fill(0),L=0,m=1,b=1;C[0]=B[0]=1;
    for(let n=0;n<10;n++){
      let d=syndrome[n];for(let i=1;i<=L;i++)d^=mul(C[i],syndrome[n-i]);
      if(!d){m++;continue;}
      const old=C.slice(),factor=div(d,b);
      for(let i=0;i+m<11;i++)C[i+m]^=mul(factor,B[i]);
      if(2*L<=n){L=n+1-L;B=old;b=d;m=1;}else m++;
    }
    if(L<1||L>5)return failed;
    const flips=[];
    for(let j=0;j<91;j++){
      const x=EXP[(127-j)%127];let evalPoly=C[L];for(let i=L-1;i>=0;i--)evalPoly=mul(evalPoly,x)^C[i];
      if(evalPoly===0)flips.push(90-j);
    }
    if(flips.length!==L)return failed;
    for(const index of flips)bits[index]^=1;
    if(syndromes(bits).some(Boolean))return failed;
    corrected=flips.length;
  }
  const bytes=Uint8Array.from({length:7},(_,i)=>bits.slice(i*8,i*8+8).reduce((v,bit)=>(v<<1)|bit,0));
  const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');let text=null;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{}
  return {bch_ok:true,data_hex:hex,text,corrected_bits:corrected,accepted:false};
}

const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const PARITY=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
export function blackRuns(ean){
  let pattern='101';for(let i=0;i<6;i++)pattern+=(PARITY[+ean[0]][i]==='L'?L:G)[+ean[i+1]];
  pattern+='01010';for(let i=7;i<13;i++)pattern+=L[+ean[i]].split('').map(x=>x==='0'?'1':'0').join('');pattern+='1010';
  const runs=[];let start=null;for(let i=0;i<pattern.length;i++){if(pattern[i]==='1'&&start===null)start=i;if(pattern[i]==='0'&&start!==null){runs.push([start,i]);start=null;}}return runs;
}
export const isGuard=(a,b)=>[[0,3],[45,50],[92,95]].some(([u,v])=>a<v&&b>u);

export function publicCase(ean,covers){
  const fixture=covers.fixtures[ean];
  const runs=blackRuns(ean),row=fixture?.row??Array.from({length:452},(_,x)=>runs.some(([a,b])=>x>=44+4*a&&x<44+4*b)?0:255);
  const black=row.map((v,i)=>v===0?i:null).filter(x=>x!==null);
  if(fixture)return {ean,cols:fixture.columns.map(xs=>({xs,weights:xs.map(x=>Math.min(4,...black.map(b=>Math.abs(x-b)))**2)}))};
  const [x0,x1]=covers.generated_bounds_by_first_digit[+ean[0]],xs=[],weights=[];
  for(let x=0;x<452;x++){
    const guard=[[0,3],[45,50],[92,95]].some(([a,b])=>x>=44+4*a&&x<44+4*b);
    const inside=x>=x0&&x<=x1;
    const white=inside?x>x0&&x<x1&&row[x-1]===255&&row[x]===255&&row[x+1]===255:
      row[x]===255&&x>=8&&x<444&&x>=x0-16&&x<=x1+16;
    if(white&&!guard){xs.push(x);weights.push(Math.min(4,...black.map(b=>Math.abs(x-b)))**2);}
  }
  const cols=[];let index=0;
  for(let k=0;k<10;k++){const count=Math.floor(xs.length/10)+(k<xs.length%10?1:0);cols.push({xs:xs.slice(index,index+count),weights:weights.slice(index,index+count)});index+=count;}
  if(cols.some(c=>c.xs.length<1))throw new Error('Insufficient public white support');
  return {ean,cols};
}

export function projectRows(gray,c,weighted){
  const rows=Array.from({length:240},()=>new Float32Array(10));
  for(let y=0;y<240;y++)for(let k=0;k<10;k++){
    const {xs,weights}=c.cols[k];let sum=0,count=0;
    for(let j=0;j<xs.length;j++){const weight=weighted?weights[j]:1;sum=Math.fround(sum+Math.fround(gray[(y+20)*452+xs[j]]*weight));count+=weight;}
    rows[y][k]=Math.fround(sum/count);
  }
  const scores=new Float32Array(100);
  for(let r=0;r<10;r++)for(let k=0;k<10;k++){let sum=0;for(let j=0;j<24;j++)sum+=rows[r*24+j][k]*([1,-1,-1,1][Math.floor(j/6)]);scores[r*10+k]=sum/24;}
  return {rows,scores};
}

export function featuresFromRows(rows,c){
  const features=new Float32Array(600);
  for(let r=0;r<10;r++)for(let k=0;k<10;k++){
    let means=[],noise=[];
    for(let p=0;p<4;p++){
      const v=Array.from({length:6},(_,j)=>rows[r*24+p*6+j][k]);
      const mean=Math.fround(v.reduce((a,b)=>a+b,0)/6);means.push(mean);noise.push(Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/6));
    }
    const mean=Math.fround(means.reduce((a,b)=>a+b,0)/4),index=r*10+k;
    for(let p=0;p<4;p++)features[p*100+index]=Math.max(-16,Math.min(16,means[p]-mean));
    features[400+index]=Math.min(16,noise.reduce((a,b)=>a+b,0)/4);
    features[500+index]=c.cols[k].xs.length/452;
  }return features;
}

export function neuralLogits(features,weights){
  const state=weights.state;
  function convolution(input,channels,name,outChannels){
    const w=state[name+'.weight'].values,b=state[name+'.bias'].values,out=new Float32Array(outChannels*100);
    for(let o=0;o<outChannels;o++)for(let y=0;y<10;y++)for(let x=0;x<10;x++){
      let sum=b[o];for(let c=0;c<channels;c++)for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){
        const yy=y+dy-1,xx=x+dx-1;if(yy>=0&&yy<10&&xx>=0&&xx<10)sum+=input[c*100+yy*10+xx]*w[((o*channels+c)*3+dy)*3+dx];
      }out[o*100+y*10+x]=sum/(1+Math.exp(-sum));
    }return out;
  }
  const h=convolution(convolution(features,6,'context.0',32),32,'context.2',32),logits=new Float32Array(100);
  const gain=Math.exp(Math.max(-2,Math.min(5,state.log_gain.values[0])));
  for(let i=0;i<100;i++){
    let residual=state['residual.bias'].values[0];for(let k=0;k<32;k++)residual+=h[k*100+i]*state['residual.weight'].values[k];
    logits[i]=(features[i]-features[100+i]-features[200+i]+features[300+i])/4*gain+residual;
  }return logits;
}
