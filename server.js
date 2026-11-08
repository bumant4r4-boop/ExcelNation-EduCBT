#!/usr/bin/env node
/* ExcelNation CBT Edu — server sinkronisasi real-time (tanpa dependensi). Jalankan: node server.js */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const PORT=+process.env.PORT||8080, TEACHER='e71528abf228cf68f827c130d65e94fd788e99d23d4934b30d7ce48e58b3fea4';
const HTML=path.join(__dirname,'ExcelNation-CBT-Edu.html'), DATA=path.join(__dirname,'excelnation-data.json');
let store=new Map(), ver=0, unlocked=new Map(); // unlocked: nis -> Set(examId)
try{ const j=JSON.parse(fs.readFileSync(DATA,'utf8')); ver=j.ver||0; Object.entries(j.data||{}).forEach(([k,v])=>store.set(k,v)); console.log('Data dimuat:',store.size,'entri'); }catch(e){}
let dirty=false; setInterval(()=>{ if(!dirty) return; dirty=false; const o={}; store.forEach((v,k)=>o[k]=v); fs.writeFile(DATA+'.tmp',JSON.stringify({ver,data:o}),err=>{ if(!err) fs.rename(DATA+'.tmp',DATA,()=>{}); }); },2000);
const TEACHER_ONLY=/^(key:|cfg:|res:|bank:)/;
const role=req=>req.headers['x-teacher']===TEACHER?'teacher':'student';
const nisOf=req=>String(req.headers['x-nis']||'');
function canRead(k,r,nis){
  if(r==='teacher') return true; if(TEACHER_ONLY.test(k)) return false; if(k.startsWith('draft:')) return false;
  let m; if((m=k.match(/^(?:att|ctl):[^:]+:(.+)$/))) return m[1]===nis;
  if((m=k.match(/^qs:(.+)$/))) return !!(unlocked.get(nis)&&unlocked.get(nis).has(m[1]));
  return true;
}
function canWrite(k,r,nis,val){
  if(r==='teacher') return !k.startsWith('draft:'); let m;
  if((m=k.match(/^att:([^:]+):(.+)$/))){ if(m[2]!==nis) return false; const old=store.get(k); if(old&&old.val&&old.val.submitted&&!(val&&val.submitted)) return false; return true; }
  if((m=k.match(/^av:(.+)$/))) return m[1]===nis;
  return false;
}
const body=req=>new Promise(res=>{ let b=''; req.on('data',c=>{ b+=c; if(b.length>200e6) req.destroy(); }); req.on('end',()=>{ try{ res(JSON.parse(b||'{}')); }catch(e){ res({}); } }); });
const send=(res,code,obj)=>{ const s=JSON.stringify(obj); res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(s); };
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'), r=role(req), nis=nisOf(req);
  try{
    if(u.pathname==='/api/ping') return send(res,200,{app:'excelnation',now:Date.now()});
    if(u.pathname==='/api/changes'){ const since=+u.searchParams.get('since')||0; const ch=[]; store.forEach((e,k)=>{ if(e.ver>since&&canRead(k,r,nis)) ch.push({k,val:e.val,ts:e.ts}); }); return send(res,200,{v:ver,now:Date.now(),changes:ch}); }
    if(u.pathname==='/api/batch'&&req.method==='POST'){ const b=await body(req); let n=0; (b.items||[]).forEach(it=>{ if(!it||typeof it.k!=='string'||!canWrite(it.k,r,nis,it.val)) return; const old=store.get(it.k); if(old&&old.ts>it.ts&&r!=='teacher'&&!/^att:/.test(it.k)) return; if(old&&old.ts>it.ts) return; store.set(it.k,{val:it.val,ts:it.ts||Date.now(),ver:++ver}); n++; }); if(n) dirty=true; return send(res,200,{ok:true,n}); }
    if(u.pathname==='/api/unlock'&&req.method==='POST'){
      const b=await body(req), ex=store.get('exam:'+b.id), cf=store.get('cfg:'+b.id), qs=store.get('qs:'+b.id);
      if(!ex||!ex.val||!cf||!qs) return send(res,404,{error:'Ujian tidak ditemukan'});
      if(String(b.code||'').trim().toUpperCase()!==String(cf.val.code).toUpperCase()) return send(res,403,{error:'Kode salah'});
      const t=Date.now(); if(t<ex.val.start-2000||t>=ex.val.end) return send(res,403,{error:'Di luar jadwal ujian'});
      if(!unlocked.has(nis)) unlocked.set(nis,new Set()); unlocked.get(nis).add(b.id); return send(res,200,{qs:qs.val});
    }
    if(['/manifest.webmanifest','/icon-192.png','/icon-512.png'].includes(u.pathname)){ const f=path.join(__dirname,u.pathname.slice(1)); return fs.readFile(f,(e,d)=>{ if(e){ res.writeHead(404); return res.end(); } res.writeHead(200,{'Content-Type':u.pathname.endsWith('.png')?'image/png':'application/manifest+json'}); res.end(d); }); }
    if(u.pathname==='/'||u.pathname==='/index.html'){ fs.readFile(HTML,(e,d)=>{ if(e){ res.writeHead(500); return res.end('ExcelNation-CBT-Edu.html tidak ditemukan di folder server.'); } res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(d); }); return; }
    res.writeHead(404); res.end('Not found');
  }catch(e){ console.error(e); res.writeHead(500); res.end('error'); }
}).listen(PORT,'0.0.0.0',()=>{
  console.log('\n  ExcelNation CBT Edu — server berjalan\n');
  Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==='IPv4'&&!i.internal).forEach(i=>console.log(`  Siswa (Wi-Fi yang sama) buka:  http://${i.address}:${PORT}/`));
  console.log(`  Di laptop ini:                 http://localhost:${PORT}/\n`);
});
