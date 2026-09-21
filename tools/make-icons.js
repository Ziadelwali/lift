/* Draws the app icon (a barbell on a dark tile) and writes icon-180/192/512.png.
   Pure node: zlib + a tiny PNG encoder, no packages. */
const fs=require('fs'),zlib=require('zlib'),p=require('path');
const root=p.join(__dirname,'..');
function crc32(buf){let c,crc=0xffffffff;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function png(w,h,px){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const i=(y*w+x)*3,o=y*(w*3+1)+1+x*3;raw[o]=px[i];raw[o+1]=px[i+1];raw[o+2]=px[i+2];}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function draw(S){const px=new Uint8Array(S*S*3);const bg=[11,15,20],bar=[232,237,241],acc=[79,181,210];
 const rr=S*0.22; // rounded tile
 function inTile(x,y){const cx=Math.max(rr,Math.min(S-rr,x)),cy=Math.max(rr,Math.min(S-rr,y));return (x-cx)**2+(y-cy)**2<=rr*rr;}
 const cy=S/2, barH=S*0.06, barL=S*0.14, barR=S*0.86;
 const plates=[[0.24,0.30,0.36],[0.32,0.36,0.24],[0.64,0.68,0.24],[0.70,0.76,0.36]]; // x0,x1,halfheight
 for(let y=0;y<S;y++)for(let x=0;x<S;x++){let c=inTile(x+.5,y+.5)?bg:[0,0,0];
  if(inTile(x+.5,y+.5)){
   if(x>=barL&&x<=barR&&Math.abs(y-cy)<=barH/2)c=bar;
   for(const [x0,x1,hh] of plates){if(x>=x0*S&&x<=x1*S&&Math.abs(y-cy)<=hh*S){c=(hh>0.3)?acc:bar;}}
  }
  const i=(y*S+x)*3;px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];}
 return px;}
for(const S of [180,192,512]) fs.writeFileSync(p.join(root,'icon-'+S+'.png'),png(S,S,draw(S)));
console.log('icons written');
