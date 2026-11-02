export const MAX_REFERENCE_BYTES=15*1024*1024;

export function detectImageType(bytes){
 const b=new Uint8Array(bytes),ascii=(from,to)=>String.fromCharCode(...b.slice(from,to));
 if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
 if(b[0]===0x89&&ascii(1,4)==='PNG'&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10)return 'image/png';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
 if(ascii(4,8)==='ftyp'){
  const brands=ascii(8,64);
  if(/avif|avis/.test(brands))return 'image/avif';
  if(/heic|heix|hevc|hevx|mif1|msf1/.test(brands))return 'image/heic';
 }
 return null;
}

export function readFileDataURL(file){return new Promise((resolve,reject)=>{
 const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не удалось прочитать файл. Сохраните фото на устройстве и выберите его снова.'));reader.onabort=()=>reject(new Error('Чтение файла прервано. Выберите фотографию ещё раз.'));reader.readAsDataURL(file);
});}

export function readFileText(file){return new Promise((resolve,reject)=>{
 const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не удалось прочитать проект. Сохраните файл на устройстве и выберите его снова.'));reader.onabort=()=>reject(new Error('Открытие проекта прервано. Выберите файл ещё раз.'));reader.readAsText(file,'UTF-8');
});}

function decodeImage(file,mime){return new Promise((resolve,reject)=>{
 const url=URL.createObjectURL(new Blob([file],{type:mime})),img=new Image();
 const message=mime==='image/heic'?'Этот браузер не открыл фото HEIC/HEIF. Выберите его копию в JPG или PNG.':'Браузер не смог открыть это фото. Выберите копию в JPG или PNG.';
 const timer=setTimeout(()=>finish(new Error('Не удалось открыть фото за отведённое время. Сохраните его на устройстве и попробуйте снова.')),12000);
 function finish(error){clearTimeout(timer);URL.revokeObjectURL(url);img.onload=null;img.onerror=null;if(error)reject(error);else resolve(img);}
 img.onload=()=>finish(img.naturalWidth&&img.naturalHeight?null:new Error(message));img.onerror=()=>finish(new Error(message));img.src=url;
});}

export async function readReferenceFile(file){
 if(!file.size)throw new Error('Выбран пустой файл. Выберите другую фотографию.');
 if(file.size>MAX_REFERENCE_BYTES)throw new Error('Фото больше 15 МБ. Выберите файл поменьше.');
 let header;
 try{header=await file.slice(0,64).arrayBuffer();}catch{throw new Error('Не удалось прочитать файл. Сохраните фото на устройстве и выберите его снова.');}
 const mime=detectImageType(header);
 if(!mime)throw new Error('Это не поддерживаемая фотография. Выберите JPG, PNG или WEBP.');
 const image=await decodeImage(file,mime);
 let data;
 if(mime==='image/heic'||mime==='image/avif'){
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось подготовить фотографию. Выберите копию JPG.');
  ctx.drawImage(image,0,0);data=canvas.toDataURL('image/jpeg',.96);
 }else{
  const raw=await readFileDataURL(file);
  data=`data:${mime};base64,${raw.slice(raw.indexOf(',')+1)}`;
 }
 return {name:file.name,data};
}
