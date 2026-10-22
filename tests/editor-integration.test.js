'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});
for(const name of ['window','Window','document','MutationObserver','HTMLElement','Element','Node','Text','DOMRect','Range'])global[name]=dom.window[name];
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
global.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);global.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);global.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
const rect=()=>({left:10,right:100,top:10,bottom:30,width:90,height:20,x:10,y:10,toJSON(){return this;}});
dom.window.Range.prototype.getBoundingClientRect=rect;dom.window.Range.prototype.getClientRects=()=>[rect()];
const CMState=require('@codemirror/state'),CMView=require('@codemirror/view');
const root=path.resolve(__dirname,'..');
const core=require(path.join(root,'review-core'));
const sandbox={module:{exports:{}},require(name){
  if(name==='obsidian')return {Plugin:class{},PluginSettingTab:class{},Setting:class{},Notice:class{},MarkdownView:class{}};
  if(name==='@codemirror/state')return CMState;if(name==='@codemirror/view')return CMView;return require(name);
},console,setTimeout,clearTimeout,performance,process};
vm.runInNewContext(fs.readFileSync(path.join(root,'main.js'),'utf8'),sandbox);
const Plugin=sandbox.module.exports;
function setup(){
  const plugin=new Plugin();plugin.core=core;plugin.settings=core.settingsWithDefaults();plugin.captureTimers=new Map();
  plugin.registerEditorExtension=extension=>{plugin.extensions=extension;};
  plugin.loop={dismiss(key,id){plugin.dismissed={key,id};}};plugin.findView=()=>null;
  plugin.installEditor();
  const text='A correlation between lecture attendance and exam results proves that attendance alone causes better scores.\n\n';
  const b=core.blocks(text)[0];
  const result={key:'saved-result',paragraph:b,totalMs:14000,comments:[{id:'comment-one',category:'context',quote:'proves that attendance alone causes better scores',comment:'Motivation can affect both attendance and scores. This is a confounding variable, so a correlation alone does not isolate the effect of attendance.'}]};
  const parent=document.createElement('div');document.body.appendChild(parent);
  const view=new CMView.EditorView({state:CMState.EditorState.create({doc:text,extensions:plugin.extensions}),parent});
  view.dispatch({effects:plugin.refreshEffect.of([result])});
  return{plugin,view,parent,text,result};
}
test('real CodeMirror renders only underlines; cursor opens a popover; Escape closes it',async()=>{
  const{plugin,view,parent}=setup();try{
    const underline=parent.querySelector('.automatic-ai-underline');assert.ok(underline);
    assert.equal(underline.textContent,'proves that attendance alone causes better scores');
    assert.equal(parent.querySelector('.automatic-paragraph-feedback'),null);
    const range=view.state.field(plugin.feedbackField).ranges[0];
    view.dispatch({selection:{anchor:range.from+2}});assert.equal(view.state.field(plugin.feedbackField).pinned,'comment-one');
    await new Promise(resolve=>setTimeout(resolve,35));
    const popover=parent.querySelector('.automatic-ai-popover');assert.ok(popover,'keyboard-accessible tooltip rendered');
    assert.ok(popover.textContent.includes('confounding variable'));assert.ok(popover.textContent.includes('Context'));
    view.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(view.state.field(plugin.feedbackField).pinned,null);
  }finally{view.destroy();parent.remove();}
});
test('popover Dismiss targets the correct saved comment; typing removes an outdated anchor',()=>{
  const{plugin,view,parent,result}=setup();try{
    const range=view.state.field(plugin.feedbackField).ranges[0];
    const card=plugin.createPopover(view,range);card.querySelector('.automatic-ai-dismiss').click();
    assert.deepEqual(plugin.dismissed,{key:result.key,id:'comment-one'});
    view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'The original passage has changed.'}});
    assert.equal(view.state.field(plugin.feedbackField).ranges.length,0);
    assert.equal(parent.querySelector('.automatic-ai-underline'),null);
  }finally{view.destroy();parent.remove();}
});
test('note-header Run AI assistant button reviews an existing note while automatic reviews stay paused',async()=>{
  const plugin=new Plugin();plugin.core=core;plugin.settings=core.settingsWithDefaults();plugin.noteActions=new Map();plugin.connection={ready:true};
  const parent=document.createElement('div');document.body.appendChild(parent);
  const text='# Sonata\n\n- Tonic\n\nThe recapitulation returns contrasting material to the home key.';
  const view={file:{path:'Existing.md'},editor:{getValue:()=>text,getCursor:()=>({line:0,ch:0}),posToOffset:()=>0},
    addAction(icon,title,callback){const button=document.createElement('div');button.className='view-action';button.addEventListener('click',callback);parent.appendChild(button);return button;}};
  plugin.app={workspace:{getLeavesOfType:()=>[{view}]}};
  plugin.registerDomEvent=(element,event,callback)=>element.addEventListener(event,callback);
  plugin.loop=new core.ReviewEngine({async reviewBatch(targets){return{reviews:targets.map(t=>({id:t.id,comments:[]})),aiMs:1};}},plugin.settings);
  plugin.loop.on('changed',()=>plugin.updateRunButtons());
  const run=plugin.runCurrentNote.bind(plugin);let work;plugin.runCurrentNote=view=>work=run(view);
  try{
    plugin.installNoteActions();plugin.installNoteActions();assert.equal(parent.querySelectorAll('[role="button"]').length,1);
    const button=parent.querySelector('[role="button"]');assert.equal(button.textContent,'Run AI assistant');button.click();
    assert.match(button.textContent,/Stop AI assistant/);await work;
    assert.equal(plugin.loop.manualRun.status,'completed');assert.equal(plugin.loop.manualRun.total,3);
    assert.equal(button.textContent,'Run AI assistant');assert.equal(plugin.loop.paused,true);assert.equal(plugin.settings.enabled,false);
    assert.equal(plugin.loop.feedback.size,3);
  }finally{plugin.loop.stop();parent.remove();}
});

test('addable bullet cards insert one or all remaining points atomically, keep source feedback and skip automatic rereview',()=>{
 const {plugin,view,parent,text,result}=setup();const captures=[];
 try{
  result.file='Test.md';result.comments[0]={...result.comments[0],format:'bullets',comment:'',bullets:['Motivation can influence both attendance and scores.','A controlled comparison isolates the effect of attendance.']};
  plugin.loop=new core.ReviewEngine({reviewBatch(){throw new Error('Insertion must not start AI.');}},{enabled:true});
  plugin.loop.update(result.file,text,0,{baseline:true});plugin.loop.feedback.set(result.key,result);
  plugin.findView=()=>({file:{path:result.file}});
  const update=plugin.loop.update.bind(plugin.loop);plugin.loop.update=(...args)=>{captures.push(args[3]);return update(...args);};
  view.dispatch({effects:plugin.refreshEffect.of([result])});
  let range=view.state.field(plugin.feedbackField).ranges[0],card=plugin.createPopover(view,range);
  assert.equal(card.querySelectorAll('.automatic-ai-bullet').length,2);assert.equal(card.querySelector('.automatic-ai-body p'),null);
  const before=view.state;card.querySelector('.automatic-ai-add-bullet').click();const one=view.state.doc.toString();
  assert.ok(one.includes('- Motivation can influence'));assert.ok(!one.includes('- A controlled comparison'));
  assert.equal(plugin.loop.pending.size,0);assert.equal(captures[0].baseline,true);assert.equal(view.state.field(plugin.feedbackField).ranges.length,1);
  range=view.state.field(plugin.feedbackField).ranges[0];card=plugin.createPopover(view,range);
  assert.equal(card.querySelector('.automatic-ai-add-bullet').disabled,true);card.querySelector('.automatic-ai-add').click();
  const after=view.state.doc.toString();assert.equal(after.split('- Motivation can influence').length,2);assert.ok(after.includes('- Motivation can influence both attendance and scores.\n- A controlled comparison'));
  card=plugin.createPopover(view,view.state.field(plugin.feedbackField).ranges[0]);assert.equal(card.querySelector('.automatic-ai-add').disabled,true);
  // Both actions are single editor transactions. Reverting their changes leaves the original source intact.
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:before.doc.toString()}});assert.equal(view.state.doc.toString(),text);
  card=plugin.createPopover(view,view.state.field(plugin.feedbackField).ranges[0]);assert.equal(card.querySelector('.automatic-ai-add').disabled,false);
 }finally{plugin.loop.stop();view.destroy();parent.remove();}
});

test('legacy paragraph feedback can be added below the source, while dismissed or changed feedback cannot be inserted',()=>{
 const {plugin,view,parent,text,result}=setup();try{
  result.file='Test.md';plugin.loop=new core.ReviewEngine({},{enabled:false});plugin.loop.update(result.file,text,0,{baseline:true});plugin.loop.feedback.set(result.key,result);plugin.findView=()=>({file:{path:result.file}});
  const range=view.state.field(plugin.feedbackField).ranges[0],card=plugin.createPopover(view,range);card.querySelector('.automatic-ai-add').click();
  assert.ok(view.state.doc.toString().includes('\n\n'+result.comments[0].comment+'\n'));assert.ok(view.state.doc.toString().startsWith(result.paragraph.text));
  const current=view.state.doc.toString();plugin.loop.feedback.clear();plugin.addFeedbackToNote(view,range);assert.equal(view.state.doc.toString(),current);
 }finally{plugin.loop.stop();view.destroy();parent.remove();}
});

test('read-only notes show disabled Add buttons and reject note changes',()=>{
 const {plugin,view,parent,text,result}=setup();try{
  result.file='Test.md';plugin.loop=new core.ReviewEngine({},{enabled:false});plugin.loop.feedback.set(result.key,result);plugin.findView=()=>({file:{path:result.file}});
  view.dispatch({effects:CMState.StateEffect.appendConfig.of(CMState.EditorState.readOnly.of(true))});
  const range=view.state.field(plugin.feedbackField).ranges[0],card=plugin.createPopover(view,range);assert.equal(card.querySelector('.automatic-ai-add').disabled,true);
  plugin.addFeedbackToNote(view,range);assert.equal(view.state.doc.toString(),text);
 }finally{plugin.loop.stop();view.destroy();parent.remove();}
});
