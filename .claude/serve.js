const http=require('http'),fs=require('fs'),p=require('path');
const root=p.join(__dirname,'..');
const T={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.woff2':'font/woff2'};
const HIDDEN=/(^|[\\/])(firebase-config\.json|\.git|\.claude|B73-fitness)([\\/]|$)/i;   // local secrets and raw photos never leave the machine
const srv=http.createServer((q,s)=>{
 let f;
 try{f=decodeURIComponent(q.url.split('?')[0]);}catch(e){s.writeHead(400);s.end('bad url');return;}
 if(f==='/') f='/index.html';
 const fp=p.resolve(root,'.'+f);
 if(!fp.startsWith(root+p.sep)||HIDDEN.test(p.relative(root,fp))){s.writeHead(404);s.end('nope');return;}
 fs.readFile(fp,(e,d)=>{ if(e){s.writeHead(404);s.end('nope');return;}
  s.writeHead(200,{'content-type':T[p.extname(fp)]||'application/octet-stream','cache-control':'no-store'});s.end(d);});
});
const port=+process.env.PORT||4322;
srv.listen(port,'127.0.0.1',()=>console.log('serving on http://localhost:'+port));
