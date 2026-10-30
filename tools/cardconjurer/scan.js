const fs=require('fs'),vm=require('vm'),path=require('path');
const D='/home/claude/investigamer/cardconjurer/js/frames/';
function run(file){
  const cap={frames:null,text:null,art:null,version:null,notes:[]};
  const el=()=>({disabled:false,onclick:null,click(){},value:'',classList:{add(){},remove(){}},style:{}});
  const btn=el();
  const card={};
  const ctx={
    document:{querySelector:(s)=>s==='#loadFrameVersion'?btn:el(),querySelectorAll:()=>[] ,getElementById:()=>el()},
    card, availableFrames:null,
    loadFramePack:()=>{cap.frames=ctx.availableFrames||vm.runInContext('availableFrames',c);},
    resetCardIrregularities:async()=>{}, autoFitArt(){}, resetSetSymbol(){}, resetWatermark(){},
    loadTextOptions:(o)=>{cap.text=o;}, notify(){}, setTimeout(){}, console, Math, Promise,
    loadScript(){}, fixUncolorableFrames(){}, setBottomInfoStyle(){}, replacementMasks:{}, getStandardWidth(){return 1}, getStandardHeight(){return 1},
    scaleX:(v)=>v, scaleY:(v)=>v, scaleWidth:(v)=>v, scaleHeight:(v)=>v, bottomInfoEdited(){}, stretchSVG(){}, drawTextBuffer(){}, drawCard(){}, loadBottomInfo(){}, addFrame(){}, lsa(){}, uploadArt(){},
  };
  ctx.window=ctx;
  const c=vm.createContext(ctx);
  try{ vm.runInContext(fs.readFileSync(D+file,'utf8').replace(/^\s*(var|let|const)\s+availableFrames/m,'availableFrames'),c,{timeout:2000}); }catch(e){cap.err=String(e.message).slice(0,120);}
  if(!cap.frames) try{cap.frames=vm.runInContext('availableFrames',c);}catch(e){}
  return {cap,btn,card,c};
}
(async()=>{
const out={};
for(const f of fs.readdirSync(D).filter(f=>/^pack.*\.js$/.test(f))){
  const {cap,btn,card}=run(f);
  if(btn.onclick){ try{ await btn.onclick(); }catch(e){cap.err2=String(e.message).slice(0,120);} }
  out[f.replace(/^pack|\.js$/g,'')]={frames:(cap.frames||[]).map(x=>({name:x.name,src:x.src,bounds:x.bounds||null,masks:(x.masks||[]).map(m=>m.name),erase:!!x.erase,complementary:x.complementary})),text:cap.text,art:card.artBounds||null,version:card.version||null,err:cap.err,err2:cap.err2,noVersion:!btn.onclick};
}
// gruppi
const groups={};
for(const f of fs.readdirSync(D).filter(f=>/^group.*\.js$/.test(f))){
  let list=null; const ctx={loadFramePacks:(l)=>{list=l;},document:{querySelector:()=>({})}}; vm.createContext(ctx);
  try{vm.runInContext(fs.readFileSync(D+f,'utf8'),ctx);}catch(e){}
  groups[f.replace(/^group|(-\d+)?\.js$/g,'')]=list||[];
}
fs.writeFileSync('/tmp/claude-0/cc2/scan.json',JSON.stringify({packs:out,groups},null,0));
const ks=Object.keys(out);
console.log('packs',ks.length,'with err',ks.filter(k=>out[k].err).length,'with text',ks.filter(k=>out[k].text).length);
console.log(ks.filter(k=>out[k].err).slice(0,20).map(k=>k+': '+out[k].err).join('\n'));
})();
