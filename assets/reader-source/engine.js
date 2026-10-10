import {initializeBCH} from './bch-core.js';
import {fuseObservations} from './soft.js';
import {readBarcodes,prepareZXingModule} from 'zxing-wasm/reader';
import {publicCase,projectRows,featuresFromRows,neuralLogits,decodeBits} from './codec.js';
import {MatScope,rectify,sample,missingSupport,horizontalMap} from './geometry.js';
import {samplingPaths,crossPath} from './sampling.js';
import {nativeTimeline,nativeCanvas} from './media.js';
let assetsPromise;
async function loadJSON(path){const response=await fetch(new URL(path,import.meta.url));if(!response.ok)throw Error('读取组件下载失败，请刷新重试。');return response.json();}
export function configureBarcode(overrides){prepareZXingModule({overrides});}
export async function initialize(){
  if(!assetsPromise){
    configureBarcode({locateFile:path=>path.endsWith('.wasm')?new URL('./zxing_reader.wasm',import.meta.url).href:path});
    assetsPromise=Promise.all([Promise.resolve(globalThis.cv),loadJSON('./covers.json'),loadJSON('./weights.json'),initializeBCH()]);
  }
  const [cv,covers,weights]=await assetsPromise;
  if(!cv?.Mat)throw new Error('图像读取器尚未加载完成，请刷新页面。');
  return {cv,covers,weights};
}

function publicLocatorPixels(imageData){
  // The frozen Python ZXing numpy interface interprets its 3 channels as BGR.
  // Reproduce that public-only view; hidden sampling still uses original RGB.
  const data=new Uint8ClampedArray(imageData.data);
  for(let i=0;i<data.length;i+=4){const r=data[i];data[i]=data[i+2];data[i+2]=r;}
  return {width:imageData.width,height:imageData.height,data};
}

export async function observePixels(cv,imageData,mode,covers,weights){
  const reads=await readBarcodes(publicLocatorPixels(imageData),{tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:8});
  const detections=reads.map(d=>({text:d.text,format:d.format==='EAN13'?'EAN-13':d.format==='UPCA'?'UPC-A':d.format,ean:d.format==='EAN13'?d.text:d.format==='UPCA'&&d.text.length===12?'0'+d.text:null,corners:[d.position.topLeft,d.position.topRight,d.position.bottomRight,d.position.bottomLeft].map(p=>[p.x,p.y])}));
  const row={public:detections,status:'PUBLIC_NOT_FOUND',hidden:null,prediction:null,accepted:false};
  if(!detections.length){row.message='没有读到公共条码。请上传清晰原图，保留完整条码和数字。';return row;}
  const eans=detections.filter(d=>d.ean);
  if(eans.length!==1){row.status='PUBLIC_ONLY';row.message='公共码已读取。隐藏读取需要一枚本系统生成的 EAN-13 条码。';return row;}
  const s=new MatScope();try{
    const rgba=s.keep(cv.matFromImageData(imageData)),rgb=s.keep(new cv.Mat());cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);
    let crop=rgb;const detection=eans[0],corners=detection.corners;
    if(mode==='print'){
      const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),span=Math.max(...xs)-Math.min(...xs),height=span*280/380,center=ys.reduce((a,b)=>a+b,0)/4;
      const x0=Math.max(0,Math.floor(Math.min(...xs)-.25*span)),x1=Math.min(rgb.cols,Math.ceil(Math.max(...xs)+.25*span)),y0=Math.max(0,Math.floor(center-height)),y1=Math.min(rgb.rows,Math.ceil(center+height));
      if(x1<=x0||y1<=y0)throw new Error('条码裁框为空');
      // Embind's clone() clones the handle and keeps the ROI's parent stride.
      // copyTo creates packed pixels for the data-array geometry operations.
      const roi=s.keep(rgb.roi(new cv.Rect(x0,y0,x1-x0,y1-y0)));crop=s.keep(new cv.Mat());roi.copyTo(crop);
      row.public_crop=[x0,y0,x1,y1];
    }else row.public_crop=[0,0,rgb.cols,rgb.rows];
    const [x0,y0]=row.public_crop;let localCorners=corners.map(([x,y])=>[x-x0,y-y0]);
    if(mode==='print'){
      // The Python receiver detects public corners again inside this crop.
      const localRGBA=s.keep(new cv.Mat());cv.cvtColor(crop,localRGBA,cv.COLOR_RGB2RGBA);
      const localReads=await readBarcodes(publicLocatorPixels({width:crop.cols,height:crop.rows,data:localRGBA.data}),{tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:8});
      const localEAN=localReads.filter(d=>d.format==='EAN13'||d.format==='UPCA');
      if(localEAN.length!==1||(localEAN[0].format==='UPCA'?'0'+localEAN[0].text:localEAN[0].text)!==detection.ean)throw new Error('条码裁框内的公共码不一致');
      const p=localEAN[0].position;localCorners=[p.topLeft,p.topRight,p.bottomRight,p.bottomLeft].map(p=>[p.x,p.y]);
    }
    const {H,evidence}=rectify(cv,crop,detection.ean,localCorners,mode),c=publicCase(detection.ean,covers);
    row.geometry=evidence;row.homography=H;
    const missing=missingSupport(cv,crop,H,c);
    if(missing){row.status='INCOMPLETE_CARRIER';row.missing_support_pixels=missing;row.message='公共码已读到，但隐藏区域被截边。请保留条码两侧白边和完整条高。';return row;}
    const gray=sample(cv,crop,H,Array.from({length:452},(_,i)=>i),Array.from({length:336},(_,i)=>i));
    const baseline=projectRows(gray,c,false),features=featuresFromRows(baseline.rows,c),logits=neuralLogits(features,weights);
    const neuralBits=Array.from(logits,v=>Number(v>=0)),analyticBits=Array.from(baseline.scores,v=>Number(v>0));
    row.prediction={public_ean:detection.ean,neural:{raw100:neuralBits,...decodeBits(neuralBits)},analytic:{raw100:analyticBits,...decodeBits(analyticBits)},accepted:false};
    if(mode==='print'){
      const horizontal=horizontalMap(cv,crop,H,detection.ean);row.horizontal_geometry=horizontal.evidence;
      const incomplete=missingSupport(cv,crop,H,c,horizontal.xs);
      if(incomplete){row.status='INCOMPLETE_CARRIER';row.missing_support_pixels=incomplete;row.message='公共码已读到，但校准后的隐藏区域缺失。请保留更多白边。';return row;}
      const adjusted=sample(cv,crop,H,Array.from(horizontal.xs),Array.from({length:336},(_,i)=>i)),scores=projectRows(adjusted,c,true).scores,bits=Array.from(scores,v=>Number(v>0));
      row.sampling_paths=samplingPaths(gray,adjusted,c);
      row.scores=Array.from(scores);row.hidden={raw100:bits,...decodeBits(bits)};row.reader='browser_print_public_horizontal_gap_v1';
    }else{row.hidden=row.prediction.neural;row.reader='browser_frozen_4070_neural_v1';}
    row.status=row.hidden.bch_ok?'CANDIDATE':'HIDDEN_NOT_DECODED';
    row.message=row.hidden.bch_ok?'纠错解码给出一个隐藏候选；存在性尚未校准，需与原始消息核对。':'公共码已读取，当前图像未解出隐藏载荷。';
  }catch(error){row.status='HIDDEN_GEOMETRY_FAILED';row.technical_reason=String(error.message||error);row.message='公共码已读到，隐藏区域不可测。请让数字朝上，保留完整条高和两侧白边。';}
  finally{s.close();}return row;
}

function rotatedCanvas(source,width,height,turns){
  const canvas=document.createElement('canvas');canvas.width=turns%2?height:width;canvas.height=turns%2?width:height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(-turns*Math.PI/2);ctx.drawImage(source,-width/2,-height/2,width,height);return canvas;
}
function previewFrom(canvas){const out=document.createElement('canvas'),scale=Math.min(1,1200/canvas.width,900/canvas.height);out.width=Math.round(canvas.width*scale);out.height=Math.round(canvas.height*scale);out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);return out.toDataURL('image/jpeg',.9);}
async function imageCanvas(file,turns){
  const url=URL.createObjectURL(file);try{
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('此浏览器无法读取该图片。HEIC 请先导出原尺寸 PNG/JPEG。'));img.src=url;});
    if(img.naturalWidth*img.naturalHeight>40_000_000)throw new Error('照片超过4000万像素，请使用单枚条码的原尺寸裁剪图。');
    return rotatedCanvas(img,img.naturalWidth,img.naturalHeight,turns);
  }finally{URL.revokeObjectURL(url);}
}
export async function videoCanvases(file,turns,onFrame=null){
  const url=URL.createObjectURL(file),video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
  try{
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('此浏览器不支持该视频编码。请上传 PNG/JPEG 原图或浏览器可播放的 MP4。'));video.src=url;});
    if(!Number.isFinite(video.duration)||video.duration<.5||video.duration>30)throw new Error('请上传0.5至30秒的同一枚条码短视频。');
    if(!video.requestVideoFrameCallback)throw new Error('此浏览器不能提供视频帧时间。请上传照片，或使用较新的浏览器。');
    if(video.videoWidth*video.videoHeight>40_000_000)throw new Error('视频分辨率过高。');
    let timeline=null,timelineError=null;try{timeline=nativeTimeline(await file.arrayBuffer());}catch(e){timelineError=e.message;}
    const targets=timeline?.targets??[-.25,-.125,0,.125,.25].map(offset=>video.duration/2+offset),canvases=[],times=[],pixelPaths=[];
    for(const target of targets){
      const time=await new Promise((resolve,reject)=>{
        let callback;const timer=setTimeout(()=>{if(callback)video.cancelVideoFrameCallback(callback);reject(new Error('视频帧解码超时，请上传照片或兼容的MP4。'));},10000);
        callback=video.requestVideoFrameCallback((_,metadata)=>{clearTimeout(timer);resolve(metadata.mediaTime);});
        video.onerror=()=>{clearTimeout(timer);reject(new Error('视频画面解码失败。'));};video.currentTime=timeline?timeline.seek[canvases.length]:target;
      });
      if(onFrame)await onFrame(video,time,canvases.length);
      if(timeline&&Math.abs(time-timeline.selected[canvases.length])>1e-5)throw Error('浏览器没有提供声明的固定原帧；未替换失败帧。');
      let canvas,pixelPath;
      try{if(!timeline)throw Error(timelineError);canvas=await nativeCanvas(video,timeline,rotatedCanvas);if(turns)canvas=rotatedCanvas(canvas,canvas.width,canvas.height,turns);pixelPath='native_yuv_ffmpeg_table_v1';}
      catch(e){canvas=rotatedCanvas(video,video.videoWidth,video.videoHeight,turns);pixelPath='browser_canvas_fallback: '+e.message;}
      canvases.push(canvas);times.push(time);pixelPaths.push(pixelPath);
    }
    return {canvases,source:{kind:'video',duration_seconds:video.duration,selected_frames:5,target_times_seconds:targets,selected_times_seconds:times,
      frame_indices:timeline?.indices??null,decoded_frames:timeline?.times.length??null,native_last_time_seconds:timeline?.times.at(-1)??null,pixel_paths:pixelPaths,
      policy:timeline?'原MOV/MP4 PTS中点±0.25/0.125/0秒，最近原帧、平局较早；验证实际帧时间。':'浏览器时刻回退：'+timelineError}};
  }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}

export async function readFileLocally(file,mode,turns=0){
  const assets=await initialize(),isVideo=/\.(mov|mp4|m4v)$/i.test(file.name);let canvases,source;
  if(isVideo)({canvases,source}=await videoCanvases(file,turns));
  else{canvases=[await imageCanvas(file,turns)];source={kind:'image',selected_frames:1,orientation:'浏览器依据EXIF显示方向，再应用用户选择的整数90度旋转。'};}
  source.manual_quarter_turns_ccw=turns;
  const observations=[];for(const canvas of canvases){const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);observations.push(await observePixels(assets.cv,pixels,mode,assets.covers,assets.weights));await new Promise(resolve=>setTimeout(resolve,0));}
  const center=observations[Math.floor(observations.length/2)];
  const {fusion,soft_fusion}=isVideo?fuseObservations(observations,source.selected_times_seconds,mode):{fusion:null,soft_fusion:null};
  const middle=canvases[Math.floor(canvases.length/2)];
  const improved_fusion=isVideo&&mode==='print'?crossPath(observations,source.selected_times_seconds):null;
  return {id:crypto.randomUUID().replaceAll('-',''),filename:file.name,size_bytes:file.size,created_at:new Date().toISOString(),source,mode,center,fusion,soft_fusion,improved_fusion,observations,
    preview_url:previewFrom(middle),accepted:false,total_bits:100,data_bits:56,processing:'VISITOR_BROWSER_ONLY',reader_version:'browser_white100_native_media_v4',
    note:'照片和视频在访客浏览器处理，不发送至服务器。读取仅限本系统原布局；BCH候选不等于存在性确认。'};
}
