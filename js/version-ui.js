export const APP_VERSION = '0.6.2';
const versionText = `v${APP_VERSION}`;
let scheduled = false;
function applyVersion(){const label=document.querySelector('.brand .muted');if(label&&label.textContent!==versionText)label.textContent=versionText;}
function scheduleVersionUpdate(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{scheduled=false;applyVersion();}));}
const root=document.querySelector('#app');if(root){new MutationObserver(scheduleVersionUpdate).observe(root,{childList:true});}
window.addEventListener('pageshow',scheduleVersionUpdate);document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleVersionUpdate();});scheduleVersionUpdate();
