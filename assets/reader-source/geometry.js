import {blackRuns,isGuard} from './codec.js';
const WIDTH=452,HEIGHT=336;
export class MatScope{constructor(){this.items=[];}keep(mat){this.items.push(mat);return mat;}close(){for(const mat of this.items.reverse())mat.delete();}}
const pointMat=(cv,points,s)=>s.keep(cv.matFromArray(points.length,1,cv.CV_32FC2,points.flat()));
const hMat=(cv,h,s)=>s.keep(cv.matFromArray(3,3,cv.CV_64F,h));
function multiply(A,B){return Array.from({length:9},(_,i)=>{let sum=0;for(let k=0;k<3;k++)sum+=A[Math.floor(i/3)*3+k]*B[k*3+i%3];return sum;});}
export function invert(cv,H){const s=new MatScope();try{const out=s.keep(new cv.Mat());cv.invert(hMat(cv,H,s),out);return Array.from(out.data64F);}finally{s.close();}}
export function transform(H,x,y){const d=H[6]*x+H[7]*y+H[8];return [(H[0]*x+H[1]*y+H[2])/d,(H[3]*x+H[4]*y+H[5])/d];}
export function quantile(values,q){const a=Array.from(values).sort((a,b)=>a-b),p=(a.length-1)*q,i=Math.floor(p);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(p-i);}
const median=values=>quantile(values,.5);
function histogramPercentile(bytes,q){const histogram=new Uint32Array(256);for(const x of bytes)histogram[x]++;const p=(bytes.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);let total=0,a=0,b=0;for(let i=0;i<256;i++){const next=total+histogram[i];if(lo>=total&&lo<next)a=i;if(hi>=total&&hi<next){b=i;break;}total=next;}return a+(b-a)*(p-lo);}
const roundEven=x=>{const lo=Math.floor(x),d=x-lo;return d===.5?lo+(lo%2):Math.round(x);};

function contourVertices(cv,contour){
  const rectangle=cv.minAreaRect(contour),points=cv.RotatedRect.points(rectangle).map(p=>[p.x,p.y]);
  points.sort((a,b)=>a[1]-b[1]);const top=points.slice(0,2).sort((a,b)=>a[0]-b[0]),bottom=points.slice(2).sort((a,b)=>a[0]-b[0]);
  return [top[0],top[1],bottom[1],bottom[0]].map(([x,y])=>{let best=null,distance=Infinity;for(let i=0;i<contour.data32S.length;i+=2){const xx=contour.data32S[i],yy=contour.data32S[i+1],d=(xx-x)**2+(yy-y)**2;if(d<distance){distance=d;best=[xx,yy];}}return best;});
}

function fitBars(cv,bars,ean,tolerance,rough=null){
  const s=new MatScope();try{
    const runs=blackRuns(ean);if(bars.length!==runs.length)throw new Error(`公开黑条轮廓不完整：${bars.length}/${runs.length}`);
    const nominal=[],observed=[];
    for(let i=0;i<runs.length;i++){
      const [a,b]=runs[i],end=isGuard(a,b)?307:287,x0=44+4*a,x1=44+4*b-1;
      nominal.push([x0,8],[x1,8],[x1,end],[x0,end]);observed.push(...bars[i].vertices);
    }
    const mask=s.keep(new cv.Mat());cv.setRNGSeed(3012);
    const mapping=s.keep(cv.findHomography(pointMat(cv,nominal,s),pointMat(cv,observed,s),cv.RANSAC,tolerance,mask,2000,.995));
    const count=Array.from(mask.data).reduce((a,b)=>a+b,0);
    if(mapping.empty()||count<80)throw new Error('公开黑条的定位支持不足');
    let H=invert(cv,Array.from(mapping.data64F));if(rough)H=multiply(H,rough);H=H.map(x=>x/H[8]);
    if(H.some(x=>!Number.isFinite(x)))throw new Error('公共定位矩阵无效');
    return {H,evidence:{method:rough?'public_bar_contours_v1':'public_native_bar_contours_fallback_v1',bar_contours:bars.length,inliers:count}};
  }finally{s.close();}
}

function frozenGeometry(cv,rgb,ean,corners,affine){
  const s=new MatScope();try{
    let image=rgb;
    if(affine){
      const gray=s.keep(new cv.Mat());cv.cvtColor(rgb,gray,cv.COLOR_RGB2GRAY);
      const low=histogramPercentile(gray.data,.1),high=histogramPercentile(gray.data,.9);
      if(high-low<1)throw new Error('公开条码对比度不足');
      image=s.keep(new cv.Mat(rgb.rows,rgb.cols,cv.CV_8UC3));
      for(let i=0;i<rgb.data.length;i++)image.data[i]=Math.min(255,Math.max(0,roundEven((rgb.data[i]-low)*255/(high-low))));
    }
    const roughMat=s.keep(cv.getPerspectiveTransform(pointMat(cv,corners,s),pointMat(cv,[[44,8],[423,8],[423,287],[44,287]],s)));
    const rough=Array.from(roughMat.data64F),offset=[1,0,96,0,1,96,0,0,1];
    const expanded=s.keep(new cv.Mat());cv.warpPerspective(image,expanded,hMat(cv,multiply(offset,rough),s),new cv.Size(644,528),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255));
    const gray=s.keep(new cv.Mat()),binary=s.keep(new cv.Mat());cv.cvtColor(expanded,gray,cv.COLOR_RGB2GRAY);cv.threshold(gray,binary,0,255,cv.THRESH_BINARY_INV|cv.THRESH_OTSU);
    const contours=s.keep(new cv.MatVector()),hierarchy=s.keep(new cv.Mat());cv.findContours(binary,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
    const bars=[];
    for(let i=0;i<contours.size();i++){
      const cnt=s.keep(contours.get(i)),box=cv.boundingRect(cnt),cx=box.x+box.width/2-96;
      if(box.height>=140&&box.height<=420&&box.width<60&&cx>20&&cx<445){const vertices=contourVertices(cv,cnt).map(([x,y])=>[x-96,y-96]);bars.push({x:Array.from(cnt.data32S).filter((_,j)=>j%2===0).reduce((a,b)=>a+b,0)/(cnt.data32S.length/2),vertices});}
    }
    bars.sort((a,b)=>a.x-b.x);return fitBars(cv,bars,ean,2,rough);
  }finally{s.close();}
}

function nativeGeometry(cv,rgb,ean,corners){
  const s=new MatScope();try{
    const gray=s.keep(new cv.Mat()),binary=s.keep(new cv.Mat());cv.cvtColor(rgb,gray,cv.COLOR_RGB2GRAY);cv.threshold(gray,binary,0,255,cv.THRESH_BINARY_INV|cv.THRESH_OTSU);
    const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),scan=(Math.min(...ys)+Math.max(...ys))/2,span=xmax-xmin,height=span*280/380;
    const contours=s.keep(new cv.MatVector()),hierarchy=s.keep(new cv.Mat());cv.findContours(binary,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
    const bars=[];for(let i=0;i<contours.size();i++){
      const cnt=s.keep(contours.get(i)),box=cv.boundingRect(cnt),cx=box.x+box.width/2;
      if(box.height>.45*height&&box.height<1.5*height&&box.width<.15*span&&cx>xmin-.04*span&&cx<xmax+.04*span&&box.y<=scan&&scan<=box.y+box.height){bars.push({x:Array.from(cnt.data32S).filter((_,j)=>j%2===0).reduce((a,b)=>a+b,0)/(cnt.data32S.length/2),vertices:contourVertices(cv,cnt)});}
    }bars.sort((a,b)=>a.x-b.x);return fitBars(cv,bars,ean,Math.max(2,2*span/380));
  }finally{s.close();}
}

export function rectify(cv,rgb,ean,corners,mode){
  if(mode==='screen')return frozenGeometry(cv,rgb,ean,corners,false);
  const p=corners.slice().sort((a,b)=>a[1]-b[1]),top=p.slice(0,2).sort((a,b)=>a[0]-b[0]),bottom=p.slice(2).sort((a,b)=>a[0]-b[0]);
  const ordered=[top[0],top[1],bottom[1],bottom[0]];
  try{return frozenGeometry(cv,rgb,ean,ordered,true);}catch(error){const result=nativeGeometry(cv,rgb,ean,corners);result.evidence.original_failure=error.message;return result;}
}

export function sample(cv,rgb,H,xs,ys){
  const s=new MatScope();try{
    const points=[];for(const y of ys)for(const x of xs)points.push([x,y]);
    const raw=s.keep(new cv.Mat());cv.perspectiveTransform(pointMat(cv,points,s),raw,hMat(cv,invert(cv,H),s));
    const mx=s.keep(new cv.Mat(ys.length,xs.length,cv.CV_32F)),my=s.keep(new cv.Mat(ys.length,xs.length,cv.CV_32F));
    for(let i=0;i<points.length;i++){mx.data32F[i]=raw.data32F[2*i];my.data32F[i]=raw.data32F[2*i+1];}
    const source=s.keep(new cv.Mat()),out=s.keep(new cv.Mat());rgb.convertTo(source,cv.CV_32F);
    cv.remap(source,out,mx,my,cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255));
    const gray=new Float32Array(points.length);for(let i=0;i<gray.length;i++)gray[i]=Math.fround(Math.fround(out.data32F[3*i]*Math.fround(.2126))+Math.fround(out.data32F[3*i+1]*Math.fround(.7152))+Math.fround(out.data32F[3*i+2]*Math.fround(.0722)));
    return gray;
  }finally{s.close();}
}

export function missingSupport(cv,rgb,H,c,mapped=null){
  const inverse=invert(cv,H);let missing=0;
  for(let y=20;y<260;y++)for(const col of c.cols)for(const x of col.xs){const [xx,yy]=transform(inverse,mapped?mapped[x]:x,y);if(xx<-.001||xx>rgb.cols-1+.001||yy<-.001||yy>rgb.rows-1+.001)missing++;}return missing;
}

export function horizontalMap(cv,rgb,H,ean){
  const publicY=[12,14,16,268,272,276,280,284],runs=blackRuns(ean),nonguard=runs.filter(([a,b])=>!isGuard(a,b));
  function profile(xs){const values=sample(cv,rgb,H,xs,publicY);return xs.map((_,i)=>median(publicY.map((_,j)=>values[j*xs.length+i])));}
  const reference=profile(Array.from({length:3040},(_,i)=>44+i*.125)),black=quantile(reference,.1),white=quantile(reference,.9),pairs=[];
  for(let order=0;order<nonguard.length;order++){
    const [a,b]=nonguard[order],left=44+4*a-.5,right=44+4*b-.5,measured=[];
    for(const [nominal,polarity] of [[left,-1],[right,1]]){
      const xs=Array.from({length:41},(_,i)=>nominal-2.5+i*.125),values=profile(xs).map(x=>x-(black+white)/2),choices=[];
      if(white-black>10)for(let i=0;i<40;i++)if(polarity===-1?values[i]>=0&&values[i+1]<0:values[i]<=0&&values[i+1]>0)choices.push(xs[i]-values[i]*.125/(values[i+1]-values[i]));
      choices.sort((a,b)=>Math.abs(a-nominal)-Math.abs(b-nominal));measured.push(choices[0]??null);
    }if(measured.every(x=>x!==null))pairs.push([order,left,right,...measured]);
  }
  const fit=pairs.filter(p=>p[0]%2===0),check=pairs.filter(p=>p[0]%2===1);
  if(fit.length<8||check.length<4)throw new Error('公开横向边缘不足，隐藏区域不可测');
  // Small fixed 3-parameter least squares, using the same public edges.
  const M=Array.from({length:3},()=>Array(4).fill(0));
  for(const p of fit)for(const k of [1,2]){const row=[p[k],1,k===1?-1:1],target=p[k+2];for(let i=0;i<3;i++){for(let j=0;j<3;j++)M[i][j]+=row[i]*row[j];M[i][3]+=row[i]*target;}}
  for(let k=0;k<3;k++){let pivot=k;for(let i=k+1;i<3;i++)if(Math.abs(M[i][k])>Math.abs(M[pivot][k]))pivot=i;[M[k],M[pivot]]=[M[pivot],M[k]];const d=M[k][k];if(Math.abs(d)<1e-10)throw new Error('公共横向拟合失败');for(let j=k;j<4;j++)M[k][j]/=d;for(let i=0;i<3;i++)if(i!==k){const f=M[i][k];for(let j=k;j<4;j++)M[i][j]-=f*M[k][j];}}
  const [scale,shift,growth]=M.map(row=>row[3]);if(scale<.98||scale>1.02||Math.abs(shift)>3||Math.abs(growth)>1.5)throw new Error('横向校准超出当前读取范围');
  const nominal=[0,...runs.flatMap(([a,b])=>[44+4*a-.5,44+4*b-.5]),451],mapped=[shift,...runs.flatMap(([a,b])=>[scale*(44+4*a-.5)+shift-growth,scale*(44+4*b-.5)+shift+growth]),scale*451+shift];
  if(mapped.some((v,i)=>i&&v<=mapped[i-1]))throw new Error('公开横向映射不单调');
  let index=0;const xs=Float32Array.from({length:452},(_,x)=>{while(index<nominal.length-2&&x>nominal[index+1])index++;return mapped[index]+(mapped[index+1]-mapped[index])*(x-nominal[index])/(nominal[index+1]-nominal[index]);});
  return {xs,evidence:{scale,shift,halfwidth_change:growth,fit_bars:fit.length,check_bars:check.length,public_black:black,public_white:white}};
}
