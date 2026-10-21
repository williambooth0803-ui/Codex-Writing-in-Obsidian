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
