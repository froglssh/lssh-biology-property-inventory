// Mobile-first controls share the same records, patches and save pipeline.
import {inventoryResult} from './workflows.mjs';
export function createMobileUI(api){
 const {$,esc,toast,patch,save,rows,filtered,render,flushEdits,mutable}=api;
 let ids=[],index=0,sessionYear='',busy=false,sessionDone=false,fieldTimer=null,recordFiltersOpen=false;
 function inventoryView(){return ['search','動產','物品'].includes(api.getView());}
 function updateShell(){
  document.body.dataset.view=api.getView();
  $('#filterDrawer').classList.toggle('hidden',!inventoryView());
  $('#mobileFilterState').textContent=api.filterLabel();
  const list=rows();$('#overviewLabel').textContent=`已找到 ${list.filter(r=>r.checked).length} / ${list.length} 筆`;
  document.querySelectorAll('.sidebar .nav').forEach(b=>{b.setAttribute('aria-current',b.dataset.view===api.getView()?'page':'false');});
 }
 function decorateList(){
  updateShell();const head=$('#content .section-head');if(!head)return;
  head.insertAdjacentHTML('beforeend',`<div class="field-launch"><button class="button primary" data-action="startField" ${filtered().length?'':'disabled'}>▶ 連續盤點</button><button class="button" data-action="listTools" aria-label="開啟清冊工具">清冊工具 ⋯</button></div>`);
 }
 function decorateTables(){for(const table of document.querySelectorAll('#content .table-wrap table:not(.inventory-table):not(.records-table)')){table.classList.add('portrait-data-table');const headings=[...table.querySelectorAll('thead th')].map(th=>th.textContent);for(const tr of table.querySelectorAll('tbody tr')){[...tr.cells].forEach((td,i)=>td.dataset.label=headings[i]||'');}}}
 function decorateRecords(){if(!matchMedia('(max-width:900px)').matches)return;const filters=$('.record-filters');if(!filters||filters.querySelector('.record-filter-drawer'))return;const advanced=[...filters.children].filter(el=>!el.classList.contains('record-keyword'));if(!advanced.length)return;const drawer=document.createElement('details');drawer.className='record-filter-drawer';drawer.open=recordFiltersOpen;drawer.innerHTML='<summary>年度、日期、地點與盤點結果 ▾</summary><div class="record-filter-advanced"></div>';filters.append(drawer);advanced.forEach(el=>drawer.querySelector('.record-filter-advanced').append(el));drawer.addEventListener('toggle',()=>{recordFiltersOpen=drawer.open;});}
 function listTools(){
  $('#actionBody').innerHTML=api.dialogHead('清冊工具','FIELD / TOOLS')+`<div class="dialog-content mobile-tool-grid"><button class="button" data-action="exportCSV">↓ 匯出目前清單 CSV</button><button class="button" data-action="print">列印清單</button><button class="button" data-action="add">＋ 新增財產</button><button class="button" data-action="toggleBatch">批次整理</button><button class="button" data-action="undo">↶ 復原上次修改</button><button class="button" data-action="saveFile">↓ 儲存完整工作檔</button><p>目前查詢：${filtered().length} 筆。工具會套用到目前的查詢範圍。</p></div>`;$('#actionDialog').showModal();
 }
 function fieldRow(){return rows().find(r=>r.id===ids[index]);}
 function renderField(){
  const r=fieldRow();if(!r){toast('財產已不存在，請重新選擇盤點清單。',true);return;}
  sessionDone=false;
  $('#fieldBody').innerHTML=`<div class="field-header"><div><span class="eyebrow">現場連續盤點 · ${esc(sessionYear)} 年度</span><b>第 ${index+1} / ${ids.length} 筆</b></div><div class="tools"><button class="button" data-action="saveFile" aria-label="下載完整工作檔">↓ 備份</button><button class="close" data-field-close aria-label="儲存並結束連續盤點">×</button></div></div><div class="field-content"><span class="badge">${esc(r.type)}</span><span class="field-result ${r.checked?'found':''}">${esc(inventoryResult(r))}</span><h2>${esc(r.name)}</h2><div class="field-identity"><label>編號</label><b>${esc(r.number)}</b><label>分號</label><strong>${esc(r.subnumber)}</strong></div><div class="field-location"><span>存放位置</span><b>${esc(r.location||'未填寫')}</b>${r.locationDetail?`<p>${esc(r.locationDetail)}</p>`:''}</div><details class="field-spec"><summary>別名、廠牌與原件頁次</summary><p>${esc(r.alias||'無別名')}</p><p>${esc(r.model||'無型式資料')}</p>${r.page&&api.hasSource(r.sourceId)?`<button class="button" data-source="${esc(r.id)}">原表第 ${r.page} 頁 ↗</button>`:''}<div class="tools"><button class="button" data-copy="${esc(r.id)}">複製名稱</button><a class="button" href="${esc(api.imageQuery(r))}" target="_blank" rel="noopener noreferrer">圖片 ↗</a></div></details><label class="field-note-label" for="fieldNote">盤點備註<span id="fieldSaveStatus" role="status">${esc(r.note?'已載入備註':'可直接輸入或點選常用備註')}</span></label><textarea id="fieldNote" maxlength="3000" rows="2" placeholder="例如：需補標籤、移到哪裡…">${esc(r.note)}</textarea><div class="note-chips field-chips">${['需補標籤','位置待調整','待維修','借出待歸還'].map(n=>`<button type="button" data-field-note="${n}">${n}</button>`).join('')}</div><div class="field-other"><button class="button" data-field-result="待確認">標記待確認</button><button class="button" data-field-result="借出中">標記借出中</button></div></div><div class="field-footer"><div class="field-main-actions"><button class="button field-missing" data-field-next="未找到">未找到，下一筆</button><button class="button primary" data-field-next="已找到">✓ 找到，下一筆</button></div><div class="field-navigation"><button class="button" data-field-move="-1" ${index===0?'disabled':''}>← 上一筆</button><button class="text-button" data-field-close>儲存並結束</button><button class="button" data-field-move="1">${index===ids.length-1?'完成':'跳過這筆 →'}</button></div></div>`;
  $('#fieldDialog').scrollTop=0;const content=$('.field-content');if(content)content.scrollTop=0;
 }
 function flushField(){if(fieldTimer){clearTimeout(fieldTimer);fieldTimer=null;}if($('#fieldDialog').open&&!sessionDone&&api.getYear()===sessionYear&&fieldRow()){patch(fieldRow().id,{note:$('#fieldNote').value.slice(0,3000)},'更新備註');}}
 async function persistField(result=null){
  if(fieldTimer){clearTimeout(fieldTimer);fieldTimer=null;}
  if(busy||!mutable()||api.getYear()!==sessionYear)return false;
  const r=fieldRow();if(!r)return false;
  busy=true;document.querySelectorAll('#fieldBody button').forEach(b=>b.disabled=true);
  try{const changes={note:$('#fieldNote').value.slice(0,3000)};if(result){changes.inventoryResult=result;changes.checked=result==='已找到';changes.checkedAt=result==='已找到'?new Date().toISOString():'';}patch(r.id,changes,result?'現場結果':'更新備註',{deferSave:true});
   const saved=await save();if(!saved){$('#fieldSaveStatus').textContent='儲存失敗，請先保留工作檔';return false;}$('#fieldSaveStatus').textContent='已儲存';return true;
  }finally{busy=false;document.querySelectorAll('#fieldBody button').forEach(b=>b.disabled=false);const prev=$('[data-field-move="-1"]');if(prev)prev.disabled=index===0;}
 }
 async function finish(){sessionDone=true;$('#fieldBody').innerHTML=`<div class="field-header"><div><span class="eyebrow">FIELD / COMPLETE</span><b>本次清單已走完</b></div><button class="close" data-field-close aria-label="結束盤點">×</button></div><div class="field-complete"><span>✓</span><h2>盤點紀錄已儲存</h2><p>這份清單共 ${ids.length} 筆，您已走到最後一筆。<br>跳過的設備仍保留原本狀態。</p><div class="tools"><button class="button primary" data-field-close>返回清單</button><button class="button" data-action="saveFile">↓ 儲存工作檔</button></div></div>`;}
 async function closeField(){if(busy)return;const saved=sessionDone||await persistField();$('#fieldDialog').close();render();if(!saved)toast('本機儲存失敗，本次資料仍保留在頁面；請先下載完整工作檔，離開前不要重新整理。',true);}
 async function click(b){
  const a=b.dataset.action;
  if(a==='startField'){
   if(!mutable()||!flushEdits())return true;
   const list=filtered();if(!list.length)return true;ids=list.map(r=>r.id);sessionYear=api.getYear();index=0;renderField();$('#fieldDialog').showModal();return true;
  }
  if(a==='listTools'){listTools();return true;}
  if(a==='toggleOverview'){const open=!document.body.classList.contains('overview-open');document.body.classList.toggle('overview-open',open);b.setAttribute('aria-expanded',String(open));return true;}
  if(a==='queryKeyboard'){const input=$('#query'),numeric=input.inputMode!=='numeric';input.inputMode=numeric?'numeric':'search';b.setAttribute('aria-pressed',String(numeric));b.textContent=numeric?'文字':'123';b.setAttribute('aria-label',numeric?'切換文字搜尋鍵盤':'切換數字搜尋鍵盤');input.focus();return true;}
  if(a==='focusSearch'){if(!inventoryView())api.setView('search');$('#query').focus();$('#query').select();return true;}
  if(b.hasAttribute('data-field-close')){await closeField();return true;}
  if(b.dataset.fieldNote){const note=$('#fieldNote');note.value=[note.value,b.dataset.fieldNote].filter(Boolean).join('；').slice(0,3000);await persistField();return true;}
  if(b.dataset.fieldResult){if(await persistField(b.dataset.fieldResult))renderField();return true;}
  if(b.dataset.fieldNext){if(await persistField(b.dataset.fieldNext)){if(index<ids.length-1){index++;renderField();}else await finish();}return true;}
  if(b.dataset.fieldMove){if(await persistField()){const next=index+Number(b.dataset.fieldMove);if(next>=ids.length)await finish();else{index=Math.max(0,next);renderField();}}return true;}
  return false;
 }
 function keydown(e){if(e.target.id==='query'&&e.key==='Enter'){e.preventDefault();e.target.blur();$('#content').scrollIntoView({block:'start',behavior:'smooth'});}}
 function input(el){if(el.id==='fieldNote'){$('#fieldSaveStatus').textContent='正在編輯…';clearTimeout(fieldTimer);fieldTimer=setTimeout(async()=>{fieldTimer=null;if(await persistField())$('#fieldSaveStatus').textContent='備註已儲存';},600);}}
 function bind(){
  const media=matchMedia('(max-width: 900px)');const adapt=()=>{$('#filterDrawer').open=!media.matches;document.body.classList.remove('overview-open');};adapt();media.addEventListener('change',adapt);
  $('#fieldDialog').addEventListener('cancel',e=>{e.preventDefault();closeField();});
  const keyboard=()=>{const v=window.visualViewport;const editing=/INPUT|TEXTAREA/.test(document.activeElement?.tagName||'');document.body.classList.toggle('keyboard-open',Boolean(editing&&v&&v.height<window.innerHeight*.76));};window.visualViewport?.addEventListener('resize',keyboard);document.addEventListener('focusout',()=>document.body.classList.remove('keyboard-open'));document.addEventListener('keydown',keydown);
 }
 return {updateShell,decorateList,decorateTables,decorateRecords,click,input,bind,flushField,isPending:()=>Boolean(fieldTimer)};
}
