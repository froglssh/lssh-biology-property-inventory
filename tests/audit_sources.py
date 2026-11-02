"""Independent audit with Poppler, invoked by kb property verify."""
from pathlib import Path
import subprocess, tempfile, xml.etree.ElementTree as ET, json, re, hashlib
APP=Path(__file__).resolve().parents[1]
data=json.loads((APP/'115年度清冊資料.json').read_text())
report=json.loads((APP/'資料驗證報告.json').read_text())
ns={'h':'http://www.w3.org/1999/xhtml'}
compact=lambda s:re.sub(r'\s+','',s)
checks=[]
for source in report['sources']:
    file=Path(source['sourcePath'])
    assert hashlib.sha256(file.read_bytes()).hexdigest()==source['sha256']
    with tempfile.TemporaryDirectory() as tmp:
        xml=Path(tmp)/'source.xml'
        subprocess.run(['pdftotext','-bbox-layout',str(file),str(xml)],check=True)
        doc=ET.parse(xml)
    pages=doc.findall('.//h:page',ns)
    rows=[r for r in data['records'] if data['sources'][r['sourceId']]['name']==source['name']]
    seen=[]
    for page_num,p in enumerate(pages,1):
        words=[{'x':float(w.attrib['xMin']),'y':float(w.attrib['yMin']),'text':w.text or ''} for w in p.findall('.//h:word',ns)]
        anchors=sorted([w for w in words if w['x']<80 and w['y']>140 and w['text']=='事業用'],key=lambda w:w['y'])
        for i,a in enumerate(anchors):
            gap=anchors[i+1]['y']-a['y'] if i+1<len(anchors) else a['y']-anchors[i-1]['y'] if i else 40
            top=(a['y']+anchors[i-1]['y'])/2-4 if i else a['y']-gap/2-4
            bottom=a['y']+gap/2-4
            row=sorted([w for w in words if top<=w['y']<bottom],key=lambda w:(w['y'],w['x']))
            ids=compact(''.join(w['text'] for w in row if 80<=w['x']<174))
            found=[r for r in rows if r['number']+'-'+r['subnumber']==ids]
            assert len(found)==1,(source['name'],page_num,ids)
            r=found[0];seen.append(ids)
            assert r['page']==page_num and r['originalRow']==i+1
            description=''.join(w['text'] for w in row if 174<=w['x']<374)
            assert compact(description)==compact(r['description']),(ids,'description',description,r['description'])
            vals=[w['text'] for w in row if 559<=w['x']<629]
            assert int(vals[-1].replace(',',''))==r['bookValue'],(ids,'bookvalue')
            locations=''.join(w['text'] for w in row if 434<=w['x']<559)
            assert compact(locations)==compact(r['location']+r['locationDetail']),(ids,'location')
            dates=[w['text'] for w in row if 374<=w['x']<434]
            assert dates==[d for d in [r['purchaseDate'],r['moveDate']] if d],(ids,'dates')
    assert len(seen)==source['parsed'] and len(set(seen))==len(rows)
    checks.append({'file':file.name,'rows':len(rows),'pages':len(pages),'checks':['sha256','id','subnumber','page','row','full_description','book_value','location','dates'],'passed':True})
result={'tool':'Poppler pdftotext -bbox-layout (independent of PDF.js)','total_rows':sum(c['rows'] for c in checks),'checks':checks,'passed':True}
(APP/'原件交叉驗證報告.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
