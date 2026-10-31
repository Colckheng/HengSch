/* Production reminder service and preload against an isolated on-disk store. */
const {app,BrowserWindow}=require('electron');
const fs=require('fs'); const path=require('path'); const os=require('os'); const assert=require('assert/strict');
const {buildSync}=require('esbuild');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hengsch-reminder-integration-'));
app.on('window-all-closed',()=>{});
app.setPath('userData',directory); process.env.HENG_SCH_REMINDER_BUILT='1';
const bundle=path.resolve(__dirname,'../dist/main/reminder-integration.cjs');
buildSync({entryPoints:[path.resolve(__dirname,'../src/main/reminder-service.ts')],outfile:bundle,bundle:true,platform:'node',external:['electron']});
const service=require(bundle);const Store=require('electron-store');
const evidence=path.resolve(__dirname,'../../docs/evidence/paper-reminder-rebuild');
const checks=[]; const errors=[];let store;
const screenshotsSkipped=process.argv.includes('--no-screenshots');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const deadline=Date.now()+10000;while(Date.now()<deadline){if(await fn())return;await wait(50);}throw Error('Timed out');}
function check(name,value){assert.ok(value,name);checks.push(name);}
function overlay(){return BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('paper.html'));}
async function count(n){await until(async()=>{const w=overlay();return w && await w.webContents.executeJavaScript('document.querySelectorAll(".paper-object").length')===n;});}
async function command(id,action,snoozeAt){const t=store.get('todos').find(t=>t.id===id);return overlay().webContents.executeJavaScript('window.reminderPaper.action('+JSON.stringify({todoId:id,remindAt:t.remindAt,action,snoozeAt})+')');}
async function resolve(id,at){await overlay().webContents.executeJavaScript('window.reminderPaper.resolved('+JSON.stringify(id)+','+at+')');await wait(60);}
app.on('web-contents-created',(_event,contents)=>contents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);}));
app.whenReady().then(async()=>{
 try{
  store=new Store({cwd:directory,name:'integration'});const now=Date.now();
  const todo=(id,at=now-1000)=>({id,title:'正式提醒验证 '+id,description:'隔离测试数据',status:'pending',type:'once',createdAt:now-2000,updatedAt:now-2000,order:Number(id),remindAt:at});
  store.set({todos:[todo('1'),todo('2'),todo('3'),todo('4')],groups:[],reminderSettings:{catchupAllMissed:true}});
  service.initReminderService(store,()=>{});await until(()=>!!overlay());await until(async()=>await overlay().webContents.executeJavaScript('document.querySelectorAll(".paper-object").length')>0);
  const firstCount=await overlay().webContents.executeJavaScript('document.querySelectorAll(".paper-object").length');check('adaptive queue capacity',firstCount>=1&&firstCount<=3);
  check('opening does not acknowledge reminder',!store.get('todos')[0].remindedAt);
  check('open reminders persisted before display',store.get('openPaperReminders').length===4);
  await wait(200);fs.mkdirSync(evidence,{recursive:true});if(!screenshotsSkipped)fs.writeFileSync(path.join(evidence,'11-production-overlay.png'),(await overlay().webContents.capturePage()).toPNG());
  const at=store.get('todos')[0].remindAt;await command('1','dismiss');
  check('dismiss saved before IPC resolves',new Store({cwd:directory,name:'integration'}).get('todos')[0].remindedAt>=at);
  check('dismiss keeps task pending',store.get('todos')[0].status==='pending');
  await command('1','dismiss');check('duplicate command idempotent',true);await resolve('1',at);service.scanReminders();await count(firstCount);
  check('resolving frees queue slot',await overlay().webContents.executeJavaScript('window.reminderPaper.ready().then(p => p.some(x => x.todoId === '+JSON.stringify(String(firstCount+1))+'))'));
  const before=JSON.stringify(store.get('todos'));await assert.rejects(()=>command('2','snooze',Date.now()-1));check('invalid snooze does not write',JSON.stringify(store.get('todos'))===before);
  const originalSet=store.set.bind(store);store.set=(...args)=>{if(typeof args[0]==='object'&&args[0].todos)throw Error('simulated disk failure');return originalSet(...args);};
  await assert.rejects(()=>command('2','dismiss'));store.set=originalSet;check('save failure retains reminder',await overlay().webContents.executeJavaScript('document.querySelectorAll(".paper-object").length')===firstCount);
  const snooze=Date.now()+60000;await command('2','snooze',snooze);await resolve('2',at);check('snooze durable and stamp cleared',store.get('todos')[1].remindAt===snooze&&!store.get('todos')[1].remindedAt);
  service.stopReminderService();store.set({todos:[todo('5',now-86400000)],openPaperReminders:[{todoId:'5',remindAt:now-86400000}],reminderSettings:{catchupAllMissed:false}});
  service.initReminderService(new Store({cwd:directory,name:'integration'}),()=>{});await count(1);check('restart restores unresolved paper from previous day',true);
  // The restarted service owns a fresh store instance.
  store=new Store({cwd:directory,name:'integration'});
  await overlay().webContents.executeJavaScript('document.querySelector(".paper-object").click()');
  await until(async()=>await overlay().webContents.executeJavaScript('!!document.querySelector(".paper-detail")'));
  await overlay().webContents.executeJavaScript('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("完成待办")).click()');
  await until(()=>!overlay());
  check('real detail button saves then closes overlay',true);
  check('completion persisted',new Store({cwd:directory,name:'integration'}).get('todos')[0].status==='completed');
  service.stopReminderService();check('all overlay windows released',!overlay());check('no renderer errors',errors.length===0);
  fs.writeFileSync(path.join(evidence,'production-integration.json'),JSON.stringify({checks,errors,store:directory,screenshotsSkipped,scope:'Production service, built renderer and preload; isolated data. Physical click-through and mixed DPI require manual checks.'},null,2));
  console.log(JSON.stringify({passed:checks.length,directory,screenshotsSkipped}));fs.unlinkSync(bundle);app.exit(0);
 }catch(error){console.error(error);service.stopReminderService();fs.unlinkSync(bundle);app.exit(1);}
});
