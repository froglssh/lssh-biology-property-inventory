import {keyOf,effective,norm,validateRecords} from './core.mjs';
export const RESULTS=['已找到','未找到','借出中','待確認'];
export const INVENTORY_FIELDS=['checked','checkedAt','note','inventoryResult','inspectedAt'];
const makeId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function migrateState(state){
 state.appVersion=2;state.trash ||= [];state.meta ||= {};state.events ||= [];
 const seen=new Set();state.events.forEach(e=>{if(!e.eventId||seen.has(e.eventId))e.eventId=makeId();seen.add(e.eventId);});
 for(const s of Object.values(state.snapshots)){s.patches ||= {};}
 return state;
}
export function inventoryOf(patch={}){const out={};for(const f of INVENTORY_FIELDS)if(Object.hasOwn(patch,f))out[f]=patch[f];return out;}
export function hasInventory(r){return Boolean(r.checked||r.note||r.checkedAt||r.inventoryResult||r.inspectedAt);}
export function inventoryResult(r){return r.inventoryResult||(r.checked?'已找到':'尚未盤點');}
export function inventoryRows(state,{year=state.activeYear,query='',location='',result='',from='',to=''}={}){
 const list=[];const years=year==='all'?Object.keys(state.snapshots):[year];
 for(const y of years){for(const r of effective(state.snapshots[y])){if(!hasInventory(r))continue;const day=(r.inspectedAt||r.checkedAt||r.updatedAt||'')?taipeiDay(r.inspectedAt||r.checkedAt||r.updatedAt):'';if(location&&r.location!==location)continue;if(result&&inventoryResult(r)!==result)continue;if((from&&(!day||day<from))||(to&&(!day||day>to)))continue;const text=norm([y,r.name,r.alias,r.model,r.number,r.subnumber,`${r.number}-${r.subnumber}`,r.note,r.location].join(' '));if(query&&!text.includes(norm(query)))continue;list.push({...r,year:y,inventoryDay:day});}}
 return list.sort((a,b)=>String(b.inspectedAt||b.checkedAt||b.updatedAt||'').localeCompare(a.inspectedAt||a.checkedAt||a.updatedAt||'')||a.name.localeCompare(b.name,'zh-Hant'));
}
export function taipeiDay(time=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));}
export function isInventoryEvent(e){if(e.kind)return e.kind==='inventory';return /盤點勾選|取消盤點|更新備註|批次盤點|現場結果|清除盤點/.test(e.action||'')||(e.changes||[]).some(c=>INVENTORY_FIELDS.includes(c.field));}
function audit(state,action,detail,id='',year=state.activeYear){const e={eventId:makeId(),time:new Date().toISOString(),year,action,detail,id,kind:'management'};state.events.push(e);return e;}
export function clearInventory(state,{years=[state.activeYear],ids=null,includeHistory=false,title='清除盤點紀錄'}={}){
 migrateState(state);const items=[];const allowed=ids?new Set(ids):null;
 for(const year of years){const snap=state.snapshots[year];if(!snap)throw Error('找不到指定年度');for(const r of effective(snap)){if(allowed&&!allowed.has(`${year}|${r.id}`))continue;if(!hasInventory(r))continue;items.push({year,id:r.id,before:inventoryOf(snap.patches[r.id]),after:{}});}}
 const affected=new Set(items.map(i=>`${i.year}|${i.id}`));
 const removedEvents=includeHistory?state.events.filter(e=>years.includes(String(e.year))&&isInventoryEvent(e)&&(!allowed||allowed.has(`${e.year}|${e.id}`))):[];
 if(!items.length&&!removedEvents.length)return null;
 const entry={trashId:makeId(),kind:'inventory',title,time:new Date().toISOString(),items,removedEvents};
 for(const item of items){const p=state.snapshots[item.year].patches[item.id]||{};for(const f of INVENTORY_FIELDS)delete p[f];if(!Object.keys(p).length)delete state.snapshots[item.year].patches[item.id];}
 const removedIds=new Set(removedEvents.map(e=>e.eventId));state.events=state.events.filter(e=>!removedIds.has(e.eventId));
 state.trash.push(entry);audit(state,title,`清除 ${items.length} 筆盤點資料、移入 ${removedEvents.length} 筆操作歷程至回收筒。`);return entry;
}
export function removeHistory(state,eventIds){migrateState(state);const ids=new Set(eventIds);const removedEvents=state.events.filter(e=>ids.has(e.eventId));if(!removedEvents.length)return null;const entry={trashId:makeId(),kind:'history',title:`刪除 ${removedEvents.length} 筆操作歷程`,time:new Date().toISOString(),items:[],removedEvents};state.events=state.events.filter(e=>!ids.has(e.eventId));state.trash.push(entry);audit(state,'刪除操作歷程',`已移至回收筒 ${removedEvents.length} 筆；目前財產與盤點狀態不變。`);return entry;}
export function removeManualAsset(state,year,id){migrateState(state);const snap=state.snapshots[year],index=snap.records.findIndex(r=>keyOf(r)===id),r=snap.records[index];if(!r)throw Error('找不到財產');if(!r.manual)throw Error('原始清冊財產請以報廢／移出管理，不可刪除原始列。');if(snap.records.length===1)throw Error('此年度只剩一筆資料，請保留清冊並使用管理狀態註記。');const entry={trashId:makeId(),kind:'asset',title:`刪除手動新增財產：${r.name}`,time:new Date().toISOString(),items:[],removedEvents:[],asset:{year,index,record:structuredClone(r),patch:structuredClone(snap.patches[id]||{})}};snap.records.splice(index,1);delete snap.patches[id];state.trash.push(entry);audit(state,'刪除手動新增財產','已移至回收筒，可還原。',id,year);return entry;}
const sameInventory=(a,b)=>INVENTORY_FIELDS.every(f=>JSON.stringify(a[f])===JSON.stringify(b[f]));
export function restoreTrash(state,trashId){
 const entry=state.trash.find(e=>e.trashId===trashId);if(!entry)throw Error('找不到回收項目');
 // Check every target before mutation. A later stocktake must not be overwritten.
 for(const item of entry.items||[]){const snap=state.snapshots[item.year];if(!snap?.records.some(r=>keyOf(r)===item.id))throw Error('部分原財產已不存在，無法完整還原。');if(!sameInventory(inventoryOf(snap.patches[item.id]),item.after||{}))throw Error('清除後已有新的盤點紀錄，為避免覆蓋，請先匯出工作檔，再分別核對。');}
 if(entry.asset){const s=state.snapshots[entry.asset.year];if(!s)throw Error('原年度不存在');if(s.records.some(r=>keyOf(r)===keyOf(entry.asset.record)))throw Error('已有相同編號／分號的新增財產，無法覆蓋還原。');}
 for(const item of entry.items||[]){const p=state.snapshots[item.year].patches[item.id]||{};for(const f of INVENTORY_FIELDS)delete p[f];Object.assign(p,item.before);state.snapshots[item.year].patches[item.id]=p;}
 if(entry.asset){const a=entry.asset,s=state.snapshots[a.year];s.records.splice(Math.min(a.index,s.records.length),0,a.record);s.patches[keyOf(a.record)]=a.patch;}
 const existing=new Set(state.events.map(e=>e.eventId));for(const e of entry.removedEvents||[])if(!existing.has(e.eventId))state.events.push(e);state.events.sort((a,b)=>a.time.localeCompare(b.time));
 state.trash=state.trash.filter(e=>e.trashId!==trashId);audit(state,'還原回收項目',entry.title);return entry;
}
export function undoLastChange(state){
 const e=[...state.events].reverse().find(e=>e.changes?.length&&!e.undone);if(!e)throw Error('目前沒有可復原的修改；舊版紀錄沒有變更前資料。');
 const targets=e.groupId?state.events.filter(x=>x.groupId===e.groupId&&x.changes?.length&&!x.undone):[e];
 for(const target of targets){const snap=state.snapshots[target.year],row=effective(snap).find(r=>r.id===target.id);if(!row)throw Error('財產已不存在，請先從回收筒還原。');for(const c of target.changes)if(JSON.stringify(row[c.field])!==JSON.stringify(c.after))throw Error('此筆資料已有後續變動，無法直接復原。');}
 for(const target of targets){const snap=state.snapshots[target.year],p=snap.patches[target.id]||{};for(const c of target.changes){if(c.before===undefined)delete p[c.field];else p[c.field]=c.before;}snap.patches[target.id]=p;target.undone=true;}
 audit(state,'復原上次修改',`${e.action}；共 ${targets.length} 筆`,e.id,e.year);return e;
}
export function validateWorkflowState(state){
 if(state.meta!=null&&(typeof state.meta!=='object'||Array.isArray(state.meta)))throw Error('儲存資訊格式不正確');
 const allowed=['name','category','location','locationDetail','status','checked','note','updatedAt','checkedAt','inventoryResult','inspectedAt'];
 const validEvent=e=>{if(!e||typeof e.action!=='string'||typeof e.time!=='string'||!Number.isFinite(Date.parse(e.time))||!state.snapshots[e.year]||typeof e.detail!=='string')throw Error('操作歷程格式不正確');if(e.changes!=null&&(!Array.isArray(e.changes)||e.changes.some(c=>!c||!allowed.includes(c.field))))throw Error('復原紀錄包含不允許變更的欄位');};
 for(const e of state.events)validEvent(e);
 if(state.trash!=null&&!Array.isArray(state.trash))throw Error('回收筒格式不正確');
 const ids=new Set();for(const t of state.trash||[]){
  if(!t||typeof t.trashId!=='string'||ids.has(t.trashId)||!['inventory','history','asset'].includes(t.kind)||!Array.isArray(t.items)||!Array.isArray(t.removedEvents))throw Error('回收項目格式不正確');ids.add(t.trashId);
  for(const item of t.items){if(!state.snapshots[item.year]||typeof item.id!=='string'||!item.before||!item.after)throw Error('回收項目年度或資料不完整');for(const p of [item.before,item.after]){if(Object.keys(p).some(k=>!INVENTORY_FIELDS.includes(k)))throw Error('回收項目含有非盤點欄位');if(p.checked!=null&&typeof p.checked!=='boolean')throw Error('回收盤點勾選格式不正確');}}
  for(const e of t.removedEvents)validEvent(e);
  if(t.asset){const a=t.asset;if(!state.snapshots[a.year]||!a.record?.manual||!a.patch||!Number.isInteger(a.index)||a.index<0||Object.keys(a.patch).some(k=>!allowed.includes(k)))throw Error('回收財產資料不完整');validateRecords([a.record]);}
 }
 return true;
}
