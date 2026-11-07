'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function fixture({enabled=false,consentGranted=true,discover=()=>new Promise(()=>{})}={}){
 const timers=new Map();let timerId=0,ready,checks=0,baselines=0;
 const sandbox={module:{exports:{}},process,performance,console,
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  require(name){if(name==='obsidian')return{Plugin:class{},PluginSettingTab:class{},Modal:class{},Notice:class{}};if(name==='@codemirror/state'||name==='@codemirror/view')return{};return require(name);}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'main.js'),'utf8'),sandbox);
 const plugin=new sandbox.module.exports();plugin.manifest={dir:'automatic-paragraph-review'};
 plugin.app={vault:{adapter:{getBasePath:()=>'/synthetic'},on:()=>({})},workspace:{on:()=>({}),onLayoutReady:callback=>ready=callback,getLeavesOfType:()=>[]}};
 plugin.loadData=async()=>{plugin.core.discoverCodex=async()=>{checks++;return discover();};return{version:2,settings:{enabled,consentGranted},state:{done:['existing-marker']}};};
 plugin.saveData=async()=>{};plugin.installEditor=()=>{};plugin.refreshEditors=()=>{};plugin.registerEvent=()=>{};plugin.registerDomEvent=()=>{};plugin.addCommand=()=>{};plugin.addSettingTab=()=>{};
 plugin.addStatusBarItem=()=>({setAttribute(){},setText(){}});plugin.baselineOpenViews=()=>baselines++;
 return {plugin,timers,layoutReady:()=>ready(),checks:()=>checks,baselines:()=>baselines};
}
async function loadPromptly(plugin){
 let timer;try{return await Promise.race([plugin.onload(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Plugin startup waited for the Codex connection.')),250);})]);}finally{clearTimeout(timer);}
}
test('startup completes with no CLI discovery when automatic reviews are paused',async()=>{
 const f=fixture();try{await loadPromptly(f.plugin);assert.equal(f.checks(),0);assert.equal(f.baselines(),0);f.layoutReady();assert.equal(f.baselines(),1);assert.equal(f.checks(),0);assert.equal(f.timers.size,0);assert.ok(f.plugin.loop.done.has('existing-marker'));assert.equal(f.plugin.loop.paused,true);}finally{await f.plugin.onunload();}
});
test('enabled automatic reviews check in the background after layout, and explicit use shares that check',async()=>{
 let finish;const f=fixture({enabled:true,discover:()=>new Promise(resolve=>finish=resolve)});
 try{
  await loadPromptly(f.plugin);assert.equal(f.checks(),0);f.layoutReady();const timer=f.timers.get(f.plugin.connectionTimer);assert.equal(timer.ms,1000);assert.equal(f.checks(),0);
  timer.fn();const task=f.plugin.connectionTask;const same=f.plugin.verifyConnection();assert.equal(task,same);await Promise.resolve();assert.equal(f.checks(),1);assert.equal(f.plugin.loop.paused,true);
  finish({ready:true,binary:'/fake/codex',message:'Connected'});await task;assert.equal(f.plugin.loop.paused,false);assert.equal(f.plugin.connection.ready,true);assert.equal(f.plugin.settings.enabled,true);
 }finally{await f.plugin.onunload();}
});
test('on-demand review checks the connection only when used and leaves automatic reviews paused',async()=>{
 const f=fixture({discover:()=>({ready:true,binary:'/fake/codex',message:'Connected'})});
 try{
  await loadPromptly(f.plugin);f.layoutReady();assert.equal(f.checks(),0);
  f.plugin.loop.reviewer.reviewBatch=async targets=>({reviews:targets.map(t=>({id:t.id,comments:[]})),aiMs:1});
  const text='The recapitulation brings contrasting thematic material back in the tonic.';
  await f.plugin.runCurrentNote({file:{path:'Synthetic.md'},editor:{getValue:()=>text,getCursor:()=>({line:0,ch:0}),posToOffset:()=>0}});
  assert.equal(f.checks(),1);assert.equal(f.plugin.loop.manualRun.status,'completed');assert.equal(f.plugin.loop.paused,true);assert.equal(f.plugin.settings.enabled,false);
 }finally{await f.plugin.onunload();}
});
test('unload cancels the deferred check, and a late discovery result cannot resume the plugin',async()=>{
 let finish;const f=fixture({enabled:true,discover:()=>new Promise(resolve=>finish=resolve)});
 await loadPromptly(f.plugin);f.layoutReady();const id=f.plugin.connectionTimer,timer=f.timers.get(id);await f.plugin.onunload();assert.equal(f.timers.has(id),false);timer.fn();assert.equal(f.checks(),0);
 const g=fixture({enabled:true,discover:()=>new Promise(resolve=>finish=resolve)});await loadPromptly(g.plugin);const task=g.plugin.verifyConnection();await Promise.resolve();await g.plugin.onunload();finish({ready:true,binary:'/fake/codex'});await task;assert.equal(g.plugin.loop.paused,true);assert.equal(g.plugin.connection.ready,false);
});
test('failed connection discovery is reported without rejecting plugin startup or explicit checks',async()=>{
 const f=fixture({discover:()=>{throw new Error('Simulated discovery failure');}});
 try{await loadPromptly(f.plugin);const answer=await f.plugin.verifyConnection();assert.equal(answer.ready,false);assert.equal(f.plugin.connection.checked,true);assert.equal(f.plugin.connection.checking,false);assert.equal(f.plugin.loop.paused,true);assert.equal(f.checks(),1);}finally{await f.plugin.onunload();}
});
