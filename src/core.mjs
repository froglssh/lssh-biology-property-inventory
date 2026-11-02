// Shared by the browser and kb property: keep parsing and comparison reproducible.
export const SCHEMA = 'lssh-property-v1';
export const TYPES = ['動產', '物品'];
export const STATUSES = ['在冊', '使用中', '待維修', '待報廢', '已報廢', '移出', '待確認'];
export const CATEGORIES = ['平板', '電腦', '顯微與光學', '攝影與影像', '感測與量測', '實驗設備', '家具與收納', '資訊周邊', '其他'];
export const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s－—–]/g, '');
export const keyOf = r => `${r.type}:${r.number}-${r.subnumber}`;
export function categoryOf(r) {
  const primary = `${r.name || ''} ${r.alias || ''}`;
  const s = `${primary} ${r.description || ''} ${r.model || ''}`;
  // Equipment identity wins over incidental words in a model or accessory name.
  if (/充電|硬碟|電腦顯示|光筆|觸控筆|平板筆|鍵盤/.test(r.name || '') || /^(充電車|平板座)$/.test(r.alias || '')) return '資訊周邊';
  if (/腳架|微距鏡頭|相機記憶卡/.test(r.name || '')) return '攝影與影像';
  if (/櫃|工作桌|旋轉椅/.test(r.name || '')) return '家具與收納';
  for (const [category, rule] of [
    ['平板', /平板電腦|ipad|galaxy\s*tab/i], ['電腦', /電腦|筆記型|筆電|macbook|chromebook/i],
    ['顯微與光學', /顯微|望遠鏡|夜視鏡|放大鏡|測微器/], ['攝影與影像', /相機|攝影|投影|攝錄|照相/],
    ['感測與量測', /感應|感測|測量|測定|秤|天平|溫度計|卡尺|計數|酸鹼|比色|分光/],
    ['家具與收納', /桌|椅|櫃|架|置物/], ['資訊周邊', /充電|網路|交換器|印表|掃描|螢幕|顯示器|硬碟|鍵盤|電源|擴音|喇叭/],
    ['實驗設備', /消毒|滅菌|水浴|恆溫|培養|振盪|攪拌|離心|加熱|抽氣|冷凍|冷藏|烘|漏斗|解剖/]
  ]) if (rule.test(s)) return category;
  return '其他';
}
function lines(items) {
  const groups = [];
  for (const w of [...items].sort((a,b) => a.y-b.y || a.x-b.x)) {
    let g = groups.find(g => Math.abs(g.y-w.y)<2);
    if (!g) { g={y:w.y, words:[]}; groups.push(g); }
    g.words.push(w);
  }
  return groups.sort((a,b)=>a.y-b.y).map(g=>g.words.sort((a,b)=>a.x-b.x).map(w=>w.str.trim()).join(' ').trim());
}
export function parsePages(pages, type, sourceId) {
  if (!TYPES.includes(type)) throw Error('必須指定動產或物品');
  const records = [];
  let expected = null, year = null;
  pages.forEach((words, index) => {
    const all = lines(words).join('\n');
    const ymatch = all.match(/\((\d{2,3})年度第/);
    if (ymatch) year = Number(ymatch[1]);
    const count = all.match(/筆數[：:]\s*(\d+)/);
    if (count) expected = Number(count[1]);
    const header = words.find(w=>w.str==='購置日期');
    const locHeader = words.find(w=>w.str==='存置地點');
    const resultHeader = words.find(w=>w.str==='盤點結果');
    const idHeader = words.find(w=>/[財物]品?產?編號-分號/.test(w.str) || w.str==='物品編號-分號');
    if (!header || !locHeader || !resultHeader || !idHeader || Math.abs(header.x-384)>3 || Math.abs(locHeader.x-476.5)>3) {
      throw Error(`第 ${index+1} 頁不是支援的麗山盤點表版型。請改用 CSV／JSON，或先調整解析器；尚未套用資料。`);
    }
    if (!all.includes(`${type}盤點紀錄表`)) throw Error(`第 ${index+1} 頁清冊類型與「${type}」不符`);
    const anchors = words.filter(w=>w.x<80 && w.y>140 && /^(事業用|非事業用|公用|非公用)$/.test(w.str)).sort((a,b)=>a.y-b.y);
    if (!anchors.length) throw Error(`第 ${index+1} 頁找不到資料列，可能是掃描 PDF；尚未套用資料。`);
    anchors.forEach((a,i)=> {
      const gap = anchors[i+1] ? anchors[i+1].y-a.y : (i ? a.y-anchors[i-1].y : 40);
      const top = i ? (anchors[i-1].y+a.y)/2-4 : a.y-gap/2-4;
      const bottom = a.y+gap/2-4;
      const row = words.filter(w=>w.y>=top && w.y<bottom);
      const col = (lo, hi) => lines(row.filter(w=>w.x>=lo && w.x<hi));
      const idtext = col(80,174).join('').replace(/\s/g,'');
      const ids = idtext.match(/^([\dA-Za-z]{6,12})-(\d{1,10})$/);
      if (!ids) throw Error(`第 ${index+1} 頁第 ${i+1} 筆編號無法辨識：${idtext}`);
      const names = col(174,374);
      if (!names.length) throw Error(`第 ${index+1} 頁缺少財產名稱`);
      const modelIndex = names.findIndex((s,j)=>j>0 && s.includes('/'));
      const nameLines = modelIndex<0 ? names.slice(0,1) : names.slice(0,modelIndex);
      const dates = col(374,434);
      const places = col(434,559);
      const values = col(559,629);
      const life = col(629,694);
      const toMoney = s => { if (!s || !/^[\d,]+(?:\.\d+)?$/.test(s)) throw Error(`第 ${index+1} 頁金額無法辨識：${s}`); return Number(s.replaceAll(',','')); };
      const nameFull = nameLines.join('');
      const r = {
        type, number:ids[1], subnumber:ids[2], name:nameFull.split('/')[0],
        alias:nameFull.includes('/') ? nameFull.slice(nameFull.indexOf('/')+1) : '',
        model:modelIndex<0 ? names.slice(1).join(' ') : names.slice(modelIndex).join(' '),
        description:names.join('\n'), purchaseDate:dates[0] || '', moveDate:dates[1] || '',
        location:places[0] || '', locationDetail:places.slice(1).join(' '),
        bookValue:toMoney(values.at(-1)), disposalValue:type==='動產'?toMoney(values[0]):null,
        usefulLife:life.find(s=>s.endsWith('年')) || '', eligibleDate:life.find(s=>/\d+\/\d+\/\d+/.test(s)) || '',
        originalResult:col(694,754).join(' '), originalCheckDate:col(754,820).join(' '),
        page:index+1, sourceId, originalRow:i+1, nature:a.str
      };
      r.category=categoryOf(r); r.id=keyOf(r); records.push(r);
    });
  });
  if (expected===null || records.length!==expected) throw Error(`PDF 筆數驗證失敗：解析 ${records.length} 筆，原表總計 ${expected ?? '未辨識'} 筆。尚未套用資料。`);
  validateRecords(records);
  return {records, expected, year, pages:pages.length};
}
export function validateRecords(records) {
  if (!Array.isArray(records) || !records.length || records.length>30000) throw Error('清冊需有 1–30,000 筆資料');
  const ids=new Set();
  for (const r of records) {
    if (!TYPES.includes(r.type) || typeof r.number!=='string' || typeof r.subnumber!=='string' || !/^[\dA-Za-z]{1,30}$/.test(r.number) || !/^\d{1,15}$/.test(r.subnumber) || !r.name || typeof r.name!=='string') throw Error('每筆必須有類型、文字格式編號、分號與名稱；編號不得以數字儲存，以保留前導零');
    if (r.bookValue!=null && (!Number.isFinite(r.bookValue) || r.bookValue<0)) throw Error('帳面價值必須是非負數');
    if (r.page!=null && (!Number.isInteger(r.page)||r.page<1)) throw Error('來源頁碼必須是正整數');
    if (ids.has(keyOf(r))) throw Error(`重複編號：${keyOf(r)}`);
    ids.add(keyOf(r));
  }
  return true;
}
export function effective(snapshot) {
  return snapshot.records.map(r=>({...r, originalName:r.name, status:'在冊', checked:false, note:'', inventoryResult:'', inspectedAt:'', ...(snapshot.patches?.[keyOf(r)]||{}), id:keyOf(r)}));
}
export function searchRecords(records, query) {
  const tokens=norm(query).split(/[，,;；]+/).filter(Boolean);
  if (!tokens.length) return records;
  return records.filter(r=>tokens.every(t=>{
    const number=norm(`${r.number}-${r.subnumber}`);
    const hay=norm([r.name,r.alias,r.model,r.description,r.number,r.subnumber,number,r.location,r.locationDetail,r.note,r.category,r.inventoryResult].join(' '));
    return hay.includes(t) || (/^\d+$/.test(t) && String(Number(r.subnumber))===String(Number(t)));
  })).sort((a,b)=> {
    const exact = r => tokens.some(t=>t===norm(`${r.number}-${r.subnumber}`)||t===norm(r.number)||t===norm(r.subnumber)||(/^\d+$/.test(t)&&String(Number(r.subnumber))===String(Number(t))));
    return Number(exact(b))-Number(exact(a));
  });
}
export const DIFF_FIELDS=['name','alias','model','location','locationDetail','purchaseDate','moveDate','bookValue','usefulLife','eligibleDate'];
export function compare(oldRecords,newRecords) {
  const old=new Map(oldRecords.map(r=>[keyOf(r),r])), next=new Map(newRecords.map(r=>[keyOf(r),r]));
  const added=[], removed=[], changed=[], unchanged=[];
  for (const r of newRecords) {
    const before=old.get(keyOf(r));
    if (!before) added.push(r);
    else { const fields=DIFF_FIELDS.filter(f=>String(before[f]??'')!==String(r[f]??'')); if(fields.length) changed.push({before,after:r,fields}); else unchanged.push(r); }
  }
  for (const r of oldRecords) if(!next.has(keyOf(r))) removed.push(r);
  return {added,removed,changed,unchanged};
}
export function parseCSV(text) {
  const rows=[]; let row=[],value='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for (let i=0;i<=text.length;i++) {
    const c=text[i] ?? '\n';
    if(c==='"') {if(quoted && text[i+1]==='"') {value+='"';i++;} else quoted=!quoted;}
    else if(!quoted && (c===','||c==='\n')) {row.push(value.replace(/\r$/,''));value='';if(c==='\n'){if(row.some(v=>v!==''))rows.push(row);row=[];}}
    else value+=c;
  }
  if(quoted)throw Error('CSV 引號未閉合');
  const header=rows.shift(); if(!header)throw Error('CSV 是空檔案');
  const mapping={'類型':'type','編號':'number','分號':'subnumber','名稱':'name','別名':'alias','廠牌規格':'model','存放位置':'location','位置說明':'locationDetail','帳面價值':'bookValue','購置日期':'purchaseDate','移動日期':'moveDate','使用年限':'usefulLife','可報廢日期':'eligibleDate','來源頁碼':'page','來源代碼':'sourceId','分類':'category'};
  const records=rows.map(v=>{const r={};header.forEach((h,i)=>r[mapping[h]||h]=v[i]??'');for(const f of ['bookValue','page']) {if(r[f]===''||r[f]==null)r[f]=null;else r[f]=Number(String(r[f]).replaceAll(',',''));}r.category ||=categoryOf(r);r.id=keyOf(r);return r;});
  validateRecords(records);return records;
}
export function toCSV(rows) {
  // Prefix formula-like cells so Excel opens user-entered notes as text.
  const cell = v => {let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
export function groupRecords(records, field) {
  const map=new Map(); for(const r of records){const k=r[field]||'未填寫';if(!map.has(k))map.set(k,[]);map.get(k).push(r);}
  return [...map].map(([name,items])=>({name,items,count:items.length,movable:items.filter(r=>r.type==='動產').length,goods:items.filter(r=>r.type==='物品').length,checked:items.filter(r=>r.checked).length,value:items.reduce((s,r)=>s+(r.bookValue||0),0)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-Hant'));
}
