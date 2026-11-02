import { OPTIONS, defaultProject, makePrompt, allPrompts, validateProject, referenceInstructions } from './core.mjs?v=1.2.0';
import { readReferenceFile, readFileText } from './files.mjs?v=1.2.0';

const $=s=>document.querySelector(s);
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',check:'<path d="m5 12 4 4L20 5"/>',sliders:'<path d="M4 6h7m6 0h3M4 12h2m6 0h8M4 18h9m6 0h1"/><circle cx="14" cy="6" r="3"/><circle cx="9" cy="12" r="3"/><circle cx="16" cy="18" r="3"/>',layers:'<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',camera:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',clothing:'<path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4q-4 4-8 0z"/>',landscape:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 16 6-6 6 7 3-4 3 3"/><circle cx="16" cy="8" r="1.5"/>',spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.camera}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let project=defaultProject(),selected=0,db=null,saveTimer,toastTimer,importCandidate=null,revision=0,promptMode='one';

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3400);}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('frame-nine-studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Хранилище занято другой вкладкой'));});}
function getSaved(){return new Promise((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function persist(){const v=revision;if(!db){$('#saveStatus').textContent='Сохраните проект файлом';return;}let tx;try{tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(structuredClone(project),'current');tx.oncomplete=()=>{if(v===revision)$('#saveStatus').textContent='Сохранено в браузере';};tx.onerror=()=>{ $('#saveStatus').textContent='Сохраните проект файлом';toast('Не удалось сохранить в браузере. Сохраните проект файлом.');};}catch{$('#saveStatus').textContent='Сохраните проект файлом';toast('Нет доступа к хранилищу. Сохраните проект файлом.');}}
function changed(){revision++;$('#saveStatus').textContent='Сохраняем…';clearTimeout(saveTimer);saveTimer=setTimeout(persist,250);}
const field=(label,key,value,type='text',options=null)=>`<label class="field"><span>${escapeHTML(label)}</span>${options?`<select data-field="${key}">${options.map(o=>`<option${o===value?' selected':''}>${escapeHTML(o)}</option>`).join('')}</select>`:type==='textarea'?`<textarea data-field="${key}" maxlength="1200" rows="3">${escapeHTML(value)}</textarea>`:`<input data-field="${key}" value="${escapeHTML(value)}" maxlength="120">`}</label>`;

const referenceStates={person:null,location:null,clothing:null};
const referenceRuns={person:0,location:0,clothing:0};
function referenceView(key,label,number){
 const ref=project.references[key],state=referenceStates[key],name=key==='person'?'человека':key==='location'?'локации':'одежды';
 return `<div class="ref-label"><span>${label}</span><span class="ref-index">REF ${number}</span></div><label class="ref-upload${ref?' has-image':''}${state?.busy?' reading':''}"><input class="native-file-picker" id="${key}Input" type="file" data-reference="${key}" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif" aria-label="${ref?'Заменить':'Загрузить'} фото ${name}" aria-describedby="${key}Message">${ref?`<img src="${ref.data}" alt="${label}"><span class="replace-tag">Заменить фото</span>`:`${icon(key==='person'?'person':key==='clothing'?'clothing':'landscape')}<strong>Добавить фото</strong><small>JPG, PNG, WEBP · до 15 МБ</small>`}</label>${ref?`<div class="ref-file"><span class="ref-filename">${escapeHTML(ref.name)}</span><button class="remove-ref" data-remove="${key}" aria-label="Удалить фото ${name}">×</button></div>`:''}<p id="${key}Message" class="ref-message${state?.error?' error':''}" role="status">${escapeHTML(state?.message||'')}</p>`;
}
async function handleReferenceInput(input){
 const key=input.dataset.reference,file=input.files?.[0];if(!file)return;
 const run=++referenceRuns[key];referenceStates[key]={busy:true,message:'Открываем фотографию…'};
 const card=input.closest('.reference');card.querySelector('.ref-upload').classList.add('reading');const message=card.querySelector('.ref-message');message.classList.remove('error');message.textContent='Открываем фотографию…';
 try{
  const reference=await readReferenceFile(file);
  if(run!==referenceRuns[key])return;
  project.references[key]=reference;referenceStates[key]={message:'Фото добавлено'};
  renderReferences();renderBoard();renderInspector();changed();
 }catch(error){
  if(run!==referenceRuns[key])return;
  referenceStates[key]={error:true,message:error.message||'Не удалось открыть фото. Выберите другой файл.'};renderReferences();
 }finally{
  if(input.isConnected)input.value='';
 }
}
$('.source-panel').addEventListener('change',event=>{if(event.target.matches('[data-reference]'))handleReferenceInput(event.target);});

function renderReferences(){for(const [key,label,number] of [['person','Человек','01'],['location','Локация','02'],['clothing','Одежда','03']]){if(!referenceStates[key]?.busy)$('#'+key+'Ref').innerHTML=referenceView(key,label,number);}const count=[project.references.person,project.references.location].filter(Boolean).length;$('#readiness').className='readiness'+(count===2?' ready':'');$('#readiness').innerHTML=icon(count===2?'check':'upload')+(count===2?'Референсы добавлены · уточните ориентиры в настройках серии':`Добавьте ${2-count===2?'два референса':'ещё один референс'} для генерации по промптам`);}

function avatar(s){
 const hair='<path d="M-11-61q-6-15 8-18 17-4 18 12l-4 5q-1-11-13-8l-9 8" fill="#5f5369"/>';
 const head='<ellipse cx="1" cy="-62" rx="11" ry="14" fill="#d5bba9"/><path d="M5-64h2m-8 12q5 2 8-1" stroke="#ac8c84" stroke-width="1.2" fill="none"/>'+hair;
 let body='';
 if(s.pose==='Сидит на корточках'){body='<path d="M-16-37q14-20 29-3l17 28-11 6-18-20-13 20-20-3z" fill="#8c839e"/><path d="m-20-8-9 9h28l6-7M20-7l14 9H16l-4-7" fill="#544b63"/><path d="m-12-36-8 16 19-9m11-8 9 17-16-9" fill="none" stroke="#b3a6bb" stroke-width="8" stroke-linecap="round"/>';return '<g transform="translate(0 14)">'+head+body+'</g>';}
 if(s.pose==='Сидит на ступени'){body='<path d="M-12-45h26l5 34-26 7-7-8z" fill="#9c91ab"/><path d="M-5-9 18 1 28 22M8-11 32-2 41 14" stroke="#6f657d" fill="none" stroke-width="9"/><path d="m26 23 10 2m4-11 10 2" stroke="#4b4258" stroke-width="5"/>';
 }else{const walking=s.pose==='Идёт к камере'||s.pose==='Поворачивается в движении';body=`<path d="m-9-6 ${walking?'-16 42':'-1 43'}h9L4-5m0 0 ${walking?'17 39':'9 41'}h9L14-9" fill="#72687e"/><path d="M-15-44q16-8 29 0l5 39-20 4-21-4z" fill="#a89bb5"/><path d="m-12-42 ${s.pose==='Руки у лица'?'10 19 7-27':'-12 31'}m34-31 ${s.pose==='Опирается на стену'?'17 5 4-15':'12 30'}" fill="none" stroke="#bcaec5" stroke-width="8" stroke-linecap="round"/><path d="M-6-47 1-27 9-47" fill="none" stroke="#d9cdda" stroke-width="1.3"/><path d="M1-26V-6" stroke="#8b7e9c"/><path d="M${walking?'-26':'-10'} 37h16m${walking?'14':'0'} 0h13" stroke="#51465d" stroke-width="4" stroke-linecap="round"/>`;}
 return head+body;
}
function composition(s){
 const id=s.id;let tr='translate(109 120) scale(.66)';
 if(s.crop==='Крупный портрет')tr='translate(110 250) scale(3.0)';else if(s.crop==='По пояс')tr='translate(110 174) scale(1.55)';else if(s.crop==='По колено')tr='translate(109 151) scale(1.17)';
 if(s.crop==='Деталь')tr='translate(108 106) scale(3)';
 const top=s.angle==='Строго сверху';const low=s.angle==='Снизу, с уровня земли';
 if(top)tr='translate(110 125) rotate(-24) scale(.9)';
 if(low)tr='translate(111 114) scale(.7 .94)';
 const zoneX={A:-17,B:0,C:19}[s.zone];const cameraShift=OPTIONS.camera.indexOf(s.camera)*7;
 return `<svg viewBox="0 0 220 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="bg${id}" x2=".8" y2="1"><stop stop-color="#f0ede9"/><stop offset="1" stop-color="#e0d9df"/></linearGradient><linearGradient id="arch${id}" x2="1" y2="1"><stop stop-color="#d1c5d4"/><stop offset="1" stop-color="#e4dce2"/></linearGradient></defs><rect width="220" height="180" fill="url(#bg${id})"/><g opacity=".8" transform="translate(${-cameraShift/2} 0)">${top?'<path d="M-30-10 260 230M-90-10 200 230M30-10 320 230M-30 50 240-10M-30 120 240 60M-30 190 240 130" stroke="#d3cad3" fill="none"/>':`<path d="M-10 ${low?128:110}H240V190H-10z" fill="#e3dedc"/><path d="M-20 180 115 ${low?128:110} 260 180M-20 145H240M-20 165H240" stroke="#cec6cc" stroke-width=".7" fill="none"/><path d="M139 111V49a34 34 0 0 1 68 0v62z" fill="url(#arch${id})"/><path d="M148 111V49a25 25 0 0 1 50 0v62" fill="none" stroke="#b7a9bf" stroke-width="1.1" opacity=".6"/><path d="M34 0v112m4-112v112M0 112h220" stroke="#c7bcc9" fill="none"/><rect x="8" y="32" width="19" height="50" rx="9" fill="#e3dce2"/><path d="M12 68 23 43" stroke="#c7becb"/><path d="M175 112v-9h43v9" fill="#d3c8d0"/><path d="M213 112V60m-4 6q-14-13-11-21 13 5 15 18m0-8q3-16 14-20 5 14-13 24" stroke="#a4ac9b" fill="#bdc4b1" stroke-width="1.5"/>`}</g><ellipse cx="${110+zoneX}" cy="${top?108:164}" rx="31" ry="4" fill="#b8aebe" opacity=".18"/><g transform="translate(${zoneX} 0)"><g transform="${tr}">${avatar(s)}</g></g><path d="M9 25V9h16m170 0h16v16M9 155v16h16m170 0h16v-16" fill="none" stroke="#ffffff" stroke-width=".7" opacity=".65"/>${s.angle==='Облёт по дуге'?'<path d="M63 135q44 25 92-1m-4-4 5 4-5 4" fill="none" stroke="#9d91b7" stroke-width="1" stroke-dasharray="3 3"/>':''}</svg>`;
}
function renderBoard(){
 $('#projectTitle').textContent=project.title;$('#boardDescription').textContent=`9 кадров · ${project.format} · ${project.shots.some(s=>s.outfitMode===OPTIONS.outfitMode[1])?'есть смена образа':'единый образ'}`;
 $('#outfitSummary').textContent=project.references.clothing?'Образ — с референса одежды. Внешность — с фото человека.':project.outfit;
 $('#storyboard').innerHTML=project.shots.map((s,i)=>`<button class="shot-card${i===selected?' active':''}" data-shot="${i}" aria-pressed="${i===selected}" aria-label="Кадр ${s.id}: ${escapeHTML(s.title)}"><div class="composition">${composition(s)}<span class="shot-number">${String(s.id).padStart(2,'0')}</span><span class="shot-aspect">${project.format}</span><span class="shot-camera">${icon('camera')}${escapeHTML(s.lens)}</span></div><div class="shot-body"><div class="shot-title">${escapeHTML(s.title)}${i===selected?'<span class="active-dot"></span>':''}</div><div class="shot-info">${escapeHTML(s.angle)}</div><div class="shot-tail"><span>${escapeHTML(s.crop)}</span><span class="${s.outfitMode===OPTIONS.outfitMode[1]?'different':''}">${s.outfitMode===OPTIONS.outfitMode[1]?'Новый образ':'Зона '+s.zone}</span></div></div></button>`).join('');
}
function renderInspector(){const s=project.shots[selected];$('#inspector').innerHTML=`<div class="inspector-header"><div class="section-kicker">03 / КАДР ${String(s.id).padStart(2,'0')}</div><div class="shot-navigation"><button data-step="-1" aria-label="Предыдущий кадр">‹</button><button data-step="1" aria-label="Следующий кадр">›</button></div></div><input class="editor-title" data-field="title" aria-label="Название кадра" value="${escapeHTML(s.title)}" maxlength="45"><p class="editor-subtitle">Настройте момент Вашей истории</p>${field('Ракурс камеры','angle',s.angle,'text',OPTIONS.angle)}${field('Поза и движение','pose',s.pose,'text',OPTIONS.pose)}<div class="field-row">${field('Крупность','crop',s.crop,'text',OPTIONS.crop)}${field('Объектив','lens',s.lens,'text',OPTIONS.lens)}</div><div class="inspector-rule"></div><div class="mini-label">ПРОСТРАНСТВО КАДРА</div>${field('Точка съёмки','camera',s.camera,'text',OPTIONS.camera)}${field('Положение героя','zone',s.zone,'text',OPTIONS.zone)}<div class="scene-map" aria-label="Герой в зоне ${s.zone}">${['A','B','C'].map(k=>`<span class="map-zone${s.zone===k?' on':''}" title="${escapeHTML(project.anchors[k])}">${k}</span>`).join('')}<small>Зоны фиксированы на исходном референсе</small></div><div class="inspector-rule"></div>${field('Одежда','outfitMode',s.outfitMode,'text',OPTIONS.outfitMode)}${project.references.clothing?'<p class="dialog-info">Общий гардероб — с фото одежды. Индивидуальное описание заменяет его только в этом кадре.</p>':''}${s.outfitMode===OPTIONS.outfitMode[1]?field('Описание образа','outfit',s.outfit,'textarea')+'<p class="dialog-info">Если описание пустое, используется образ серии.</p>':''}${field('Действие и детали','note',s.note,'textarea')}<button class="button primary full prompt-button" id="shotPrompt">${icon('spark')}Получить промпт кадра</button><p class="editor-footnote">Внешность и логика локации<br>включены в каждый промпт</p>`;}
function renderAll(){renderReferences();renderBoard();renderInspector();}
function selectShot(index){selected=(index+9)%9;renderBoard();renderInspector();if(innerWidth<=1000)$('#inspector').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
$('#storyboard').addEventListener('click',e=>{const b=e.target.closest('[data-shot]');if(b)selectShot(Number(b.dataset.shot));});
$('#inspector').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(b)selectShot(selected+Number(b.dataset.step));if(e.target.closest('#shotPrompt'))showPrompts('one');});
$('#inspector').addEventListener('input',e=>{const key=e.target.dataset.field;if(!key)return;project.shots[selected][key]=e.target.value;renderBoard();changed();if(key==='zone')document.querySelectorAll('.map-zone').forEach(el=>el.classList.toggle('on',el.textContent===e.target.value));});
$('#inspector').addEventListener('change',e=>{if(e.target.dataset.field==='outfitMode')renderInspector();});

document.addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close)$('#'+close.dataset.close).close();const remove=e.target.closest('[data-remove]');if(remove){const key=remove.dataset.remove;referenceRuns[key]++;referenceStates[key]=null;project.references[key]=null;renderReferences();renderBoard();renderInspector();changed();}});


$('#settingsButton').addEventListener('click',()=>{$('#settingsFields').innerHTML=field('Название серии','title',project.title)+`<div class="field-row">${field('Формат всех кадров','format',project.format,'text',OPTIONS.format)}<div class="field"><span>Количество кадров</span><input value="9 согласованных кадров" disabled></div></div>`+field('Что важно сохранить во внешности','subject',project.subject,'textarea')+field('Единый образ серии','outfit',project.outfit,'textarea')+field('Свет, время и палитра','light',project.light,'textarea')+'<h3 class="dialog-group">Карта локации</h3><p class="dialog-info">Опишите реальные ориентиры слева, в центре и справа на исходном фото. Это фиксированные зоны пространства: при смене камеры они остаются на своих местах.</p>'+['A','B','C'].map((k,i)=>field(`Зона ${k} · ${['слева','в центре','справа'][i]} на исходном фото`,'anchor'+k,project.anchors[k])).join('');$('#settingsDialog').showModal();});
$('#settingsForm').addEventListener('submit',e=>{e.preventDefault();$('#settingsFields').querySelectorAll('[data-field]').forEach(el=>{const k=el.dataset.field,v=el.value.trim();if(k.startsWith('anchor'))project.anchors[k.slice(-1)]=v||defaultProject().anchors[k.slice(-1)];else project[k]=v||defaultProject()[k];});renderAll();changed();$('#settingsDialog').close();toast('Общие настройки применены к девяти кадрам');});
function showPrompts(mode){promptMode=mode;const all=mode==='all';$('#promptTitle').textContent=all?'Девять кадров — девять промптов':`Кадр ${String(selected+1).padStart(2,'0')} · ${project.shots[selected].title}`;$('#promptKicker').textContent=!!project.references.person&&!!project.references.location?'ПРОМПТЫ СЕРИИ':'ЧЕРНОВИК · ДОБАВЬТЕ РЕФЕРЕНСЫ';$('.prompt-help').textContent=referenceInstructions(project)+' Планировщик составляет промпты; фотографии создаются в выбранной Вами нейросети.';$('#promptText').value=all?allPrompts(project):makePrompt(project,project.shots[selected]);$('#promptText').scrollTop=0;$('#promptDialog').showModal();}
$('#allPrompts').addEventListener('click',()=>showPrompts('all'));
$('#copyPrompts').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#promptText').value);toast(promptMode==='all'?'Девять промптов скопированы':'Промпт скопирован');}catch{$('#promptText').focus();$('#promptText').select();toast('Выделено для копирования. Нажмите ⌘C или Ctrl+C.');}});
function download(content,type,name){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(u);},60000);}
$('#downloadPrompts').addEventListener('click',()=>{download($('#promptText').value,'text/plain;charset=utf-8',promptMode==='all'?'photoseries-9-prompts.txt':`frame-${selected+1}-prompt.txt`);toast('Файл промптов подготовлен');});
$('#exportProject').addEventListener('click',()=>{download(JSON.stringify(project,null,2),'application/json','photoseries-project.json');toast('Проект с референсами сохранён файлом');});
$('#projectInput').addEventListener('change',async e=>{
 const input=e.target,file=input.files?.[0];if(!file)return;
 if(file.size>70*1024*1024){input.value='';return toast('Файл проекта слишком большой. Максимум 70 МБ.');}
 try{
  const text=await readFileText(file);
  importCandidate=validateProject(JSON.parse(text));$('#confirmDialog').showModal();
 }catch(error){toast(error instanceof SyntaxError?'Выберите сохранённый файл проекта .json. Фотографии добавляются в карточки референсов.':error.message);}
 finally{input.value='';}
});
$('#confirmImport').addEventListener('click',()=>{if(!importCandidate)return;project=importCandidate;importCandidate=null;selected=0;for(const key of ['person','location','clothing']){referenceRuns[key]++;referenceStates[key]=null;}renderAll();changed();$('#confirmDialog').close();toast('Проект открыт: все девять кадров и референсы восстановлены');});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const b=d.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)d.close();}}));
renderAll();
try{db=await openDB();const saved=await getSaved();if(saved){project=validateProject(saved);renderAll();}$('#saveStatus').textContent='Сохранено в браузере';}catch{$('#saveStatus').textContent='Сохраните проект файлом';toast('Автосохранение недоступно. Используйте «Сохранить проект».');}
