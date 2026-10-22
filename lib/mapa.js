/* Mapa único das estradas – Sucuriú.
   Um só código para o desenho de base do mapa: georreferência, rodovias BR/MS com o nome discreto
   seguindo a estrada, estradas vicinais/terra e o estilo. Usado pelo app (index.html), pelo painel
   offline/app (painel.html) e pelo painel online (mesmo painel.html publicado no claude.ai).
   Corrigiu aqui, vale nos três. */
(function(){
"use strict";
const RAD=Math.PI/180;
const angN=a=>{a=((a%360)+360)%360;return a>180?a-360:a;};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---------- georreferência (coordenada do desenho <-> lat/lon) ---------- */
const n2g=(M,x,y)=>{const c=M.geo;const px=c.x0+(x-c.n0)*c.s,py=c.y0+(y-c.n0)*c.s,yu=c.H-py,b=c.bb;const u=(px-b[0])/(b[2]-b[0]),v=(yu-b[1])/(b[3]-b[1]);const [BL,TL,TR,BR]=c.g;const f=i=>(1-u)*(1-v)*BL[i]+(1-u)*v*TL[i]+u*v*TR[i]+u*(1-v)*BR[i];return [f(0),f(1)];};
const g2n=(M,lat,lon)=>{let x=M.w/2,y=M.h/2;for(let i=0;i<7;i++){const p=n2g(M,x,y),px=n2g(M,x+1,y),py=n2g(M,x,y+1);const a=px[0]-p[0],b=py[0]-p[0],c=px[1]-p[1],d=py[1]-p[1],det=a*d-b*c;if(!det)break;const e0=lat-p[0],e1=lon-p[1];x+=(d*e0-b*e1)/det;y+=(-c*e0+a*e1)/det;}return [x,y];};
const dist=(a,b)=>{const R=6371008.8,r=RAD;const p1=a[0]*r,p2=b[0]*r,dp=p2-p1,dl=(b[1]-a[1])*r;return 2*R*Math.asin(Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2));};
const mpu=m=>dist(n2g(m,0,m.h/2),n2g(m,100,m.h/2))/100;
/* caixa lon/lat em volta do mapa, com folga */
function caixa(m,folga){const cs=[[0,0],[m.w,0],[0,m.h],[m.w,m.h]].map(p=>n2g(m,p[0],p[1]));const la=cs.map(c=>c[0]),lo=cs.map(c=>c[1]);
  const pad=Math.max(Math.max(...la)-Math.min(...la),Math.max(...lo)-Math.min(...lo))*folga;return [Math.min(...lo)-pad,Math.min(...la)-pad,Math.max(...lo)+pad,Math.max(...la)+pad];}

/* ---------- dados de base (baixados uma vez; o app guarda para usar sem internet) ---------- */
const BASE={rod:null,rodP:null,G:null,GP:null,pasta:""};
function url(a){return (BASE.pasta||"")+a;}
function carregarRodovias(){if(BASE.rod)return Promise.resolve(BASE.rod);if(BASE.rodP)return BASE.rodP;
  BASE.rodP=fetch(url("dados/rodovias/MS.json")).then(r=>{if(!r.ok)throw 0;return r.json();}).then(d=>BASE.rod=d).catch(e=>{BASE.rodP=null;return null;});return BASE.rodP;}
/* malha de estradas (OpenStreetMap). Velocidade por tipo (km/h) serve para a rota do app. */
const VEL=[90,70,60,50,40,25,30,20];
function grafoDe(d){const NN=d.n.length/2,X=new Float64Array(NN),Y=new Float64Array(NN);
  for(let i=0;i<NN;i++){X[i]=(d.n[2*i]+d.x0)/1e5;Y[i]=(d.n[2*i+1]+d.y0)/1e5;}
  const E=d.e,M=E.length,deg=new Int32Array(NN+1);for(const e of E){deg[e[0]]++;deg[e[1]]++;}
  const off=new Int32Array(NN+1);for(let i=0;i<NN;i++)off[i+1]=off[i]+deg[i];const pos=off.slice(0,NN),aN=new Int32Array(2*M),aE=new Int32Array(2*M),aT=new Float32Array(2*M);
  E.forEach((e,i)=>{const t=e[2]/(VEL[e[3]]/3.6);aN[pos[e[0]]]=e[1];aE[pos[e[0]]]=i;aT[pos[e[0]]++]=t;aN[pos[e[1]]]=e[0];aE[pos[e[1]]]=i;aT[pos[e[1]]++]=t;});
  const grade=new Map();for(let i=0;i<NN;i++){const k=Math.floor(X[i]*20)+":"+Math.floor(Y[i]*20);let a=grade.get(k);if(!a)grade.set(k,a=[]);a.push(i);}
  return {X,Y,E,off,aN,aE,aT,grade,x0:d.x0,y0:d.y0,NN};}
function carregarMalha(){if(BASE.G)return Promise.resolve(BASE.G);if(BASE.GP)return BASE.GP;
  BASE.GP=fetch(url("dados/estradas.json")).then(r=>{if(!r.ok)throw 0;return r.json();}).then(d=>BASE.G=grafoDe(d)).catch(e=>{BASE.GP=null;throw e;});return BASE.GP;}

/* ---------- camadas de base em SVG (coordenadas do desenho do mapa m) ---------- */
/* rodovias federais (F) e estaduais (E) com placas de nome ao longo da estrada */
function rodovias(m){const ROD=BASE.rod;if(!ROD||!m||!m.geo)return "";const b=caixa(m,0.6);let lab=[];
  const h=ROD.rod.filter(r=>r[3].some(p=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3])).map(r=>{const P=r[3].map(p=>g2n(m,p[1],p[0]));
    const passo=Math.max(m.w,m.h)/1.6;let acc=passo/2;for(let i=1;i<P.length;i++){const l=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);let pos=0;
      while(acc<=l+pos&&l>0){const t=(acc-pos)/l;if(t<0||t>1)break;lab.push([r[1],[P[i-1][0]+(P[i][0]-P[i-1][0])*t,P[i-1][1]+(P[i][1]-P[i-1][1])*t],Math.atan2(P[i][1]-P[i-1][1],P[i][0]-P[i-1][0])/RAD]);acc+=passo;}acc-=l;}
    return `<polyline class="rod ${r[0]}${r[2]?" t":""}" points="${P.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ")}"/>`;}).join("");
  return `<g class="rodg">${h}</g>`+lab.map(([n,p,a])=>`<g class="rl" data-cx="${p[0]}" data-cy="${p[1]}" data-a="${a.toFixed(1)}"><text class="rodl" x="${p[0]}" y="${p[1]-0.1}">${esc(n)}</text></g>`).join("");}
/* estradas vicinais e de terra em volta da fazenda */
function vicinais(m,G){G=G||BASE.G;if(!G||!m||!m.geo)return "";const b=caixa(m,0.8);
  const den=i=>G.X[i]>=b[0]&&G.X[i]<=b[2]&&G.Y[i]>=b[1]&&G.Y[i]<=b[3];let d1="",d2="";
  for(const e of G.E){if(e[3]<2)continue;if(!den(e[0])&&!den(e[1]))continue;const a=g2n(m,G.Y[e[0]],G.X[e[0]]),c=g2n(m,G.Y[e[1]],G.X[e[1]]);const s=`M${a[0].toFixed(1)},${a[1].toFixed(1)}L${c[0].toFixed(1)},${c[1].toFixed(1)}`;if(e[3]>=5&&e[3]!==6)d2+=s;else d1+=s;}
  return (d1?`<path class="vic" d="${d1}"/>`:"")+(d2?`<path class="vic t" d="${d2}"/>`:"");}

/* ---------- nomes das rodovias: pequenos, seguem a estrada, nunca de cabeça para baixo ---------- */
function angLeg(a,ang){const s=angN(a+(ang||0));return s>90?a-180:s<-90?a+180:a;}
/* posiciona as placas .rl dentro do svg. uu = unidades do mapa por pixel; tela(g) -> [x,y] na tela; livre(x,y,w,h) reserva o espaço */
function rotulosRod(svg,uu,ang,tela,livre,dentro){svg.querySelectorAll(".rl").forEach(g=>{const cx=+g.dataset.cx,cy=+g.dataset.cy;
  g.setAttribute("transform",`translate(${cx} ${cy}) rotate(${angLeg(+g.dataset.a||0,ang).toFixed(1)}) scale(${uu}) translate(${-cx} ${-cy})`);
  const [x,y]=tela(g);g.style.display=dentro(x,y)&&livre(x,y,g.textContent.length*5.4+90,60)?"":"none";});}

/* ---------- atividade final ao lado do trecho pronto ----------
   A cor do trecho é só o andamento (vermelho nada feito, amarelo em andamento, verde atividade final feita).
   Uma linha azul fina colada ao lado marca a rota para chuva: trechos cuja atividade final é
   Preparo de leito com brita, desde o planejado, qualquer que seja a cor do trecho. */
function corFinal(k){return "fb";}
function finais(lista){return `<g class="fing">${lista.filter(x=>x.fin==="cascalho"&&x.pts&&x.pts.length>1).map(x=>`<polyline class="fin ${corFinal(x.fin)}" data-p="${x.pts.map(p=>(+p[0]).toFixed(2)+","+(+p[1]).toFixed(2)).join(" ")}"/>`).join("")}</g>`;}
/* desloca a linha para o lado (px na tela) conforme o zoom; uu = unidades do mapa por pixel */
function deslocar(P,d){const n=P.length,out=[];for(let i=0;i<n;i++){const a=P[Math.max(i-1,0)],b=P[Math.min(i+1,n-1)];let dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1;dx/=L;dy/=L;
  let nx=-dy,ny=dx,k=1;if(i>0&&i<n-1){const p=P[i-1],c=P[i],q=P[i+1];const ux=c[0]-p[0],uy=c[1]-p[1],vx=q[0]-c[0],vy=q[1]-c[1];const lu=Math.hypot(ux,uy)||1,lv=Math.hypot(vx,vy)||1;const cs=(ux*vx+uy*vy)/(lu*lv);k=1/Math.max(Math.sqrt((1+cs)/2),0.5);}
  out.push([P[i][0]+nx*d*k,P[i][1]+ny*d*k]);}return out;}
function ajustarFinal(svg,uu,px){const d=(px||3.4)*uu;svg.querySelectorAll(".fin").forEach(el=>{if(!el._p)el._p=el.dataset.p.split(" ").map(s=>s.split(",").map(Number));
  if(el._d&&Math.abs(el._d-d)/d<0.12)return;el._d=d;el.setAttribute("points",deslocar(el._p,d).map(p=>p[0].toFixed(2)+","+p[1].toFixed(2)).join(" "));});}

/* ---------- estilo único das camadas de base ---------- */
const CSS=`.rod{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.rod.F{stroke:#7A6A5E;stroke-width:2.6px}.rod.E{stroke:#9C948A;stroke-width:1.6px}.rod.E.t{stroke-dasharray:5 4}
.vic{fill:none;stroke:#A99D8A;stroke-width:1.2px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round;opacity:.9}.vic.t{stroke-dasharray:4 3;stroke-width:1px}
.rodl{font:600 8px system-ui,sans-serif;fill:var(--mapa-rotulo,#6B625C);fill-opacity:.8;text-anchor:middle;dominant-baseline:central;letter-spacing:.6px;paint-order:stroke;stroke:var(--mapa-fundo,#F2F1EC);stroke-width:2.5px;stroke-opacity:.7;stroke-linejoin:round;pointer-events:none}
.rl{pointer-events:none}
.fin{fill:none;stroke-width:2px;stroke-dasharray:5 4;vector-effect:non-scaling-stroke;stroke-linecap:butt;stroke-linejoin:round;pointer-events:none}.fin.fb{stroke:var(--mapa-chuva,#1F3A68)}.semfin .fing{display:none}`;
function estilo(){if(typeof document==="undefined"||document.getElementById("mapa-unico-css"))return;const s=document.createElement("style");s.id="mapa-unico-css";s.textContent=CSS;document.head.appendChild(s);}

window.MAPA={versao:"2026-10-21e",BASE,n2g,g2n,dist,mpu,caixa,angN,angLeg,VEL,grafoDe,carregarRodovias,carregarMalha,rodovias,vicinais,rotulosRod,corFinal,finais,deslocar,ajustarFinal,CSS,estilo};
})();
