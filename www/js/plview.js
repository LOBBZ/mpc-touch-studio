'use strict';
/* FL-weergave van de playlist voor telefoon/tablet: de playlist vult het scherm,
   compacte sporen, één scrollbare werkbalk, knijp-zoom, editor als paneel van onderen. */
const phoneLike=()=>matchMedia('(pointer:coarse) and (max-width:950px), (pointer:coarse) and (max-height:520px)').matches;
const plFullWanted=()=>state.plFull==null?phoneLike():!!state.plFull;
function plFullApply(){const on=currentTab==='song'&&plFullWanted();if(on&&!document.body.classList.contains('pl-full')&&!(typeof edTrack==='function'&&edTrack()))$('#ed-panel').open=false;document.body.classList.toggle('pl-full',on);$('#pl-full').classList.toggle('active',on);
 $('#pl-full').innerHTML=on?'⤡<span> Normaal</span>':'⛶<span> FL-weergave</span>';plFullSize()}
function plFullSize(){const tlv=tl.v;if(!document.body.classList.contains('pl-full')){tlv.style.height='';document.body.style.removeProperty('--tabs-h');requestAnimationFrame(()=>{layoutTimeline();drawTimeline()});return}
 const tabs=$('.tabs'),tb=tabs&&getComputedStyle(tabs).position==='fixed'?tabs.getBoundingClientRect().height:0;document.body.style.setProperty('--tabs-h',tb+'px');
 const ed=$('#ed-panel'),edBar=ed?Math.min(ed.querySelector('summary').getBoundingClientRect().height+10,60):0;
 requestAnimationFrame(()=>{const top=tlv.getBoundingClientRect().top+window.scrollY-window.scrollY;tlv.style.height=Math.max(180,window.innerHeight-tlv.getBoundingClientRect().top-tb-edBar-6)+'px';layoutTimeline();drawTimeline();if(ed&&ed.open&&typeof layoutEd==='function'){layoutEd();drawEd()}})}
$('#pl-full').onclick=()=>{state.plFull=!plFullWanted();save();window.scrollTo(0,0);plFullApply();toast(state.plFull?'FL-weergave: playlist op volledig scherm. Knijp met twee vingers om te zoomen, dubbeltik een clip voor de piano roll':'Normale weergave',null,3000)};
$('#pl-undo').onclick=()=>undo();$('#pl-redo').onclick=()=>redo();
$('#ed-panel').addEventListener('toggle',()=>{if(document.body.classList.contains('pl-full'))setTimeout(()=>{if($('#ed-panel').open&&typeof layoutEd==='function'){layoutEd();drawEd()}},50)});
let plRs=null;window.addEventListener('resize',()=>{clearTimeout(plRs);plRs=setTimeout(plFullApply,120)});
function edSheetSize(){const p=$('#ed-panel'),w=edEl.scroll;if(!document.body.classList.contains('pl-full')||!p.open){w.style.height='';return}
 const b=p.getBoundingClientRect().bottom,top=w.getBoundingClientRect().top;if(b-top>60)w.style.height=Math.floor(b-top-10)+'px'}
