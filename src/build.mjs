// Entry point invoked by the unified kb property command.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parsePages,groupRecords} from './core.mjs';
const app=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2);const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const deps=path.resolve(option('--dependencies',path.join(app,'node_modules')));
const sourceDir=option('--source-dir',path.resolve(app,'../../03麗山高中/07生物科/生物科財產/115財產'));
const pdf=await import(pathToFileURL(path.join(deps,'pdfjs-dist/legacy/build/pdf.mjs')));
const esbuild=await import(pathToFileURL(path.join(deps,'esbuild/lib/main.js')));
const records=[],sources={},audit={builtAt:new Date().toISOString(),parser:'PDF.js 6.5.438 / Lishan template v1',sources:[]};
for (const type of ['動產','物品']) {
 const name=`115生物科${type}盤點紀錄表.pdf`,file=path.join(sourceDir,name),buffer=fs.readFileSync(file);
 const loadingTask=pdf.getDocument({data:new Uint8Array(buffer),useSystemFonts:true,isEvalSupported:false});
 const doc=await loadingTask.promise;
 const pages=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),v=p.getViewport({scale:1}),t=await p.getTextContent();const [a,b,c,d,e,f]=v.transform;pages.push(t.items.filter(o=>o.str?.trim()).map(o=>({str:o.str,x:a*o.transform[4]+c*o.transform[5]+e,y:b*o.transform[4]+d*o.transform[5]+f,width:o.width})));}
 const sourceId=`115-${type}`;const parsed=parsePages(pages,type,sourceId);records.push(...parsed.records);
 sources[sourceId]={name,pages:doc.numPages,base64:buffer.toString('base64'),type,sha256:createHash('sha256').update(buffer).digest('hex')};
 audit.sources.push({name,sourcePath:file,sha256:sources[sourceId].sha256,pages:doc.numPages,parsed:parsed.records.length,expected:parsed.expected,perPage:pages.map((_,i)=>parsed.records.filter(r=>r.page===i+1).length),allOriginallyPending:parsed.records.every(r=>r.originalResult==='待盤點')});await loadingTask.destroy();
 console.log(`${type}：${parsed.records.length} 筆 / ${parsed.pages} 頁，總計驗證通過。`);
}
const seed={records,sources,createdAt:new Date().toISOString()};
fs.writeFileSync(path.join(app,'115年度清冊資料.json'),JSON.stringify({schema:'lssh-property-v1',year:'115',records,sources},null,2));
audit.total=records.length;audit.categories=groupRecords(records,'category').map(g=>({name:g.name,count:g.count,movable:g.movable,goods:g.goods}));
fs.writeFileSync(path.join(app,'資料驗證報告.json'),JSON.stringify(audit,null,2));
const output=await esbuild.build({entryPoints:[path.join(app,'src/app.mjs')],bundle:true,write:false,minify:true,format:'iife',target:['chrome120','safari17.4','firefox128'],nodePaths:[deps],define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
const worker=fs.readFileSync(path.join(deps,'pdfjs-dist/build/pdf.worker.mjs'),'utf8');
const safe=s=>s.replace(/<\/script/gi,'<\\/script');
const html=fs.readFileSync(path.join(app,'src/page.html'),'utf8').replace('/*__CSS__*/',()=>fs.readFileSync(path.join(app,'src/style.css'),'utf8')+'\n'+fs.readFileSync(path.join(app,'src/mobile.css'),'utf8')).replace('/*__SEED__*/',()=>safe(JSON.stringify(seed))).replace('/*__WORKER__*/',()=>safe(worker)).replace('/*__APP__*/',()=>safe(output.outputFiles[0].text));
fs.writeFileSync(path.join(app,'生物科財產工作站.html'),html);
fs.copyFileSync(path.join(deps,'pdfjs-dist/LICENSE'),path.join(app,'vendor/PDFjs-LICENSE.txt'));
console.log(`已產生離線 HTML（${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB），含原件 PDF 與離線解析器。`);
