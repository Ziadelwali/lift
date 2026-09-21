const http=require('http'),fs=require('fs'),p=require('path');
const root=p.join(__dirname,'..');
const T={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
http.createServer((q,s)=>{
 let f=decodeURIComponent(q.url.split('?')[0]);
 if(f==='/') f='/index.html';
 const fp=p.join(root,f);
 fs.readFile(fp,(e,d)=>{ if(e){s.writeHead(404);s.end('nope');return;}
  s.writeHead(200,{'content-type':T[p.extname(fp)]||'application/octet-stream','cache-control':'no-store'});s.end(d);});
}).listen(4322,()=>console.log('serving on 4322'));
