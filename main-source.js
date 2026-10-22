'use strict';
const { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, Modal } = require('obsidian');
const { StateField, StateEffect } = require('@codemirror/state');
const { EditorView, Decoration, hoverTooltip, showTooltip, closeHoverTooltips, keymap } = require('@codemirror/view');
const path = require('node:path');

module.exports = class AutomaticParagraphReview extends Plugin {
  async onload() {
    this.pluginRoot = path.join(this.app.vault.adapter.getBasePath(), this.manifest.dir);
    this.core = /* REVIEW_CORE */;
    const saved = await this.loadData() || {};
    this.settings = this.core.settingsWithDefaults(saved.settings || saved);
    if(saved.version===1&&saved.settings?.enabled)this.settings.consentGranted=true;
    this.connection={ready:false,message:'Checking Codex connection…'};
    this.loop = new this.core.ReviewEngine(new this.core.CodexReviewer({
      binary:this.settings.codexPath,cwd:this.pluginRoot,timeoutMs:this.settings.timeoutMs
    }), this.settings, saved.state || {});
    this.loop.paused=true;
    this.saveChain=Promise.resolve(); this.refreshTimers=new Map(); this.captureTimers=new Map();this.noteActions=new Map();
    this.status=this.addStatusBarItem();
    this.status.setAttribute('role','button'); this.status.setAttribute('tabindex','0');
    this.status.setAttribute('aria-label','Pause or resume automatic AI feedback');
    this.status.setAttribute('title','Click to pause or resume automatic AI feedback');
    this.registerDomEvent(this.status,'click',()=>this.togglePaused());
    this.registerDomEvent(this.status,'keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();this.togglePaused();}
    });
    this.installEditor();
    this.loop.on('changed',()=>{this.refreshEditors();this.updateStatus();});
    this.loop.on('started',()=>this.updateStatus());
    this.loop.on('manual-finished',run=>{
      if(this.unloaded||run.scope==='question')return;
      new Notice(run.status==='failed'?`AI assistant stopped: ${run.error}`:
        run.status==='cancelled'?'AI assistant stopped.':
          `AI assistant reviewed ${run.completed-run.skipped} of ${run.total} passages and added ${run.comments} comments.${run.skipped?' Changed passages were skipped.':''}`);
    });
    this.loop.on('persist',()=>this.persist());
    this.loop.on('completed',result=>{
      console.info('[Automatic paragraph review]',{aiMs:result.aiMs,totalMs:result.totalMs,
        stale:result.stale,comments:result.comments.length});
    });
    this.loop.on('review-error',({error,retry})=>{
      this.updateStatus();
      if(this.lastNotice!==error.message){new Notice(`${error.message} ${retry?'Automatic reviews will retry.':'Use pause/resume to reset the review queue.'}`);this.lastNotice=error.message;}
    });
    this.registerEvent(this.app.workspace.on('editor-change',(editor,view)=>this.capture(editor,view)));
    this.registerEvent(this.app.workspace.on('file-open',()=>this.baselineOpenViews()));
    this.registerEvent(this.app.workspace.on('layout-change',()=>this.installNoteActions()));
    this.registerEvent(this.app.workspace.on('editor-menu',(menu,editor,info)=>{
      const view=info?.editor?info:this.app.workspace.getActiveViewOfType(MarkdownView);
      if(editor.getSelection().trim())menu.addItem(item=>item.setTitle('Review selection with AI').setIcon('sparkles').onClick(()=>this.runCurrentNote(view,{selectionOnly:true})));
      menu.addItem(item=>item.setTitle('Ask AI about this note').setIcon('message-circle').onClick(()=>this.openQuestion(view)));
    }));
    this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{
      this.loop.renameFile(oldPath,file.path);this.baselineOpenViews();
    }));
    this.registerEvent(this.app.vault.on('delete',file=>this.loop.forgetFile(file.path)));
    this.app.workspace.onLayoutReady(()=>this.baselineOpenViews());
    this.addCommand({id:'toggle-automatic-review',name:'Pause/resume automatic reviews',callback:()=>this.togglePaused()});
    this.addCommand({id:'run-ai-assistant',name:'Run AI assistant on the whole note',callback:()=>this.runCurrentNote()});
    this.addCommand({id:'review-selection',name:'Review selected text with AI',editorCallback:(_,view)=>this.runCurrentNote(view,{selectionOnly:true})});
    this.addCommand({id:'ask-about-note',name:'Ask AI about this note',callback:()=>this.openQuestion()});
    this.addCommand({id:'stop-ai-assistant',name:'Stop the AI assistant',callback:()=>this.loop.cancelNoteReview()});
    this.addCommand({id:'show-feedback-at-cursor',name:'Show AI feedback at cursor',editorCallback:(_,view)=>{
      const cm=view.editor?.cm;if(!cm)return;
      const value=cm.state.field(this.feedbackField,false),pos=cm.state.selection.main.head;
      const range=value?.ranges.find(r=>pos>=r.from&&pos<=r.to);
      if(range)cm.dispatch({effects:this.openEffect.of(range.comment.id)});
      else new Notice('No AI feedback on this passage yet.');
    }});
    this.addCommand({id:'dismiss-note-feedback',name:'Dismiss feedback in current note',editorCallback:(_,view)=>{
      if(view.file)this.loop.clearFile(view.file.path);
    }});
    this.addSettingTab(new ReviewSettings(this.app,this));
    this.updateStatus();
    await this.verifyConnection();
  }
  async verifyConnection(){
    const generation=(this.connectionGeneration||0)+1;this.connectionGeneration=generation;
    this.connection={ready:false,message:'Checking Codex connection…'};this.updateStatus();
    const result=await this.core.discoverCodex(this.settings.codexPath);
    if(this.unloaded||generation!==this.connectionGeneration)return result;
    this.connection=result;
    if(result.ready){
      this.loop.reviewer.binary=result.binary;
      if(this.settings.enabled&&this.settings.consentGranted)this.loop.setPaused(false);
    }else this.loop.setPaused(true);
    this.persist();this.updateStatus();return result;
  }
  async connectAndEnable(){
    const result=await this.verifyConnection();
    if(!result.ready){new Notice(result.message);return false;}
    this.settings.consentGranted=true;this.settings.enabled=true;
    this.loop.setPaused(false);this.baselineOpenViews();this.persist();this.updateStatus();return true;
  }
  installNoteActions(){
    if(this.unloaded)return;
    const views=this.app.workspace.getLeavesOfType('markdown').map(leaf=>leaf.view);
    for(const [view,action]of this.noteActions)if(!views.includes(view)){action.button.remove();action.ask?.remove();this.noteActions.delete(view);}
    for(const view of views){
      if(this.noteActions.has(view)||!view.addAction)continue;
      const button=view.addAction('sparkles','Run AI assistant',()=>{if(button.getAttribute('aria-disabled')!=='true')this.runCurrentNote(view,{useSelection:true});});
      button.classList.add('automatic-ai-run-button');button.setAttribute('role','button');button.setAttribute('tabindex','0');
      const label=button.ownerDocument.createElement('span');label.className='automatic-ai-run-label';button.appendChild(label);
      this.registerDomEvent(button,'keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(button.getAttribute('aria-disabled')!=='true')this.runCurrentNote(view,{useSelection:true});}});
      const ask=view.addAction('message-circle','Ask about this note',()=>{if(ask.getAttribute('aria-disabled')!=='true')this.openQuestion(view);});
      ask.setAttribute('role','button');ask.setAttribute('tabindex','0');ask.setAttribute('aria-label','Ask about this note');
      this.registerDomEvent(ask,'keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(ask.getAttribute('aria-disabled')!=='true')this.openQuestion(view);}});
      this.noteActions.set(view,{button,label,ask});
    }
    this.updateRunButtons();
  }
  updateRunButtons(){
    if(!this.noteActions)return;
    const run=this.loop.manualRun,active=this.loop.manualRunning();
    for(const [view,{button,label,ask}]of this.noteActions){
      const same=active&&run.file===view.file?.path;
      const disabled=!!this.launchingManual||!view.file||(active&&(!same||run.cancelled));
      const text=this.launchingManual?'Preparing AI assistant…':active?
        run.cancelled?'Stopping AI assistant…':same?`Stop AI assistant (${run.completed}/${run.total})`:'AI assistant running…':this.selectionFor(view)?'Review selection':'Run AI assistant';
      label.textContent=text;button.setAttribute('aria-label',text);button.setAttribute('aria-disabled',String(disabled));
      button.setAttribute('title',same?'Stop the current AI request.':this.selectionFor(view)?'Review only the highlighted text with Codex.':'Review the whole note with Codex. Uses account allowance; automatic-review settings stay unchanged.');
      button.classList.toggle('automatic-ai-run-disabled',disabled);
      if(ask){ask.setAttribute('aria-disabled',String(active||!!this.launchingManual||!view.file));ask.classList.toggle('automatic-ai-run-disabled',active||!!this.launchingManual||!view.file);}
    }
  }
  selectionFor(view){
    const editor=view?.editor;if(!editor?.getSelection?.().length)return null;
    return {from:editor.posToOffset(editor.getCursor('from')),to:editor.posToOffset(editor.getCursor('to'))};
  }
  openQuestion(view=this.app.workspace.getActiveViewOfType(MarkdownView)){
    if(!view?.file||!view.editor){new Notice('Open a note in editing mode first.');return;}
    if(this.loop.manualRunning()){new Notice('Wait for the current AI request or stop it first.');return;}
    if(this.questionModal){this.questionModal.close();}
    this.questionModal=new NoteQuestionModal(this,view);this.questionModal.open();
  }
  async runCurrentNote(view=this.app.workspace.getActiveViewOfType(MarkdownView),{useSelection=false,selectionOnly=false}={}){
    if(this.unloaded||this.launchingManual)return;
    if(this.loop.manualRunning()){
      if(view?.file?.path===this.loop.manualRun.file)this.loop.cancelNoteReview();
      else new Notice('The AI assistant is already reviewing another note.');
      return;
    }
    const file=view?.file;if(!file){new Notice('Open a Markdown note first.');return;}
    const selection=(useSelection||selectionOnly)?this.selectionFor(view):null;
    if(selectionOnly&&!selection){new Notice('Highlight the portion of the note you want to review.');return;}
    const snapshot=view.editor?.getValue();
    this.launchingManual=true;this.updateRunButtons();
    try{
      const connection=this.connection?.ready?this.connection:await this.verifyConnection();
      if(this.unloaded)return;
      if(!connection.ready){new Notice(connection.message);return;}
      const text=snapshot??await this.app.vault.cachedRead(file);
      if(view.file!==file||(snapshot!==undefined&&view.editor.getValue()!==snapshot)){new Notice('The note changed while connecting. Run the assistant again.');return;}
      if(this.unloaded)return;
      this.launchingManual=false;
      await this.loop.reviewNote(file.path,text,view.file===file&&view.editor?view.editor.posToOffset(view.editor.getCursor()):-1,{selection});
    }catch(error){if(!this.unloaded)new Notice(error.message);}
    finally{this.launchingManual=false;if(!this.unloaded)this.updateRunButtons();}
  }
  installEditor(){
    const plugin=this;
    this.refreshEffect=StateEffect.define();this.openEffect=StateEffect.define();
    function tooltip(range){
      return {pos:range.from,end:range.to,above:true,arrow:true,
        create(view){return {dom:plugin.createPopover(view,range)};}};
    }
    function build(doc,results,pinned){
      const ranges=plugin.core.feedbackRanges(doc.toString(),results,plugin.settings);
      const decorations=Decoration.set(ranges.map(range=>Decoration.mark({
        class:`automatic-ai-underline automatic-ai-${range.comment.category}`,
        attributes:{'data-ai-comment':range.comment.id,'aria-description':'AI feedback available. Hover, click, or move the cursor here to read.'}
      }).range(range.from,range.to)),true);
      return {results,ranges,decorations,pinned:ranges.some(r=>r.comment.id===pinned)?pinned:null};
    }
    this.feedbackField=StateField.define({
      create(){return {results:[],ranges:[],decorations:Decoration.none,pinned:null};},
      update(value,tr){
        let results=value.results,pinned=value.pinned,rebuild=tr.docChanged;
        for(const effect of tr.effects){
          if(effect.is(plugin.refreshEffect)){results=effect.value;rebuild=true;}
          if(effect.is(plugin.openEffect))pinned=effect.value;
        }
        let next=rebuild?build(tr.state.doc,results,pinned):{...value,pinned};
        if(tr.docChanged)next.pinned=null;
        else if(tr.selection){
          const selection=tr.state.selection.main;
          next.pinned=selection.empty?(next.ranges.find(r=>selection.head>=r.from&&selection.head<=r.to)?.comment.id||null):null;
        }
        return next;
      },
      provide:field=>[
        EditorView.decorations.from(field,value=>value.decorations),
        showTooltip.computeN([field],state=>{
          const value=state.field(field),range=value.ranges.find(r=>r.comment.id===value.pinned);
          return range?[tooltip(range)]:[];
        })
      ]
    });
    const hover=hoverTooltip((view,pos,side)=>{
      const value=view.state.field(this.feedbackField),range=value.ranges.find(r=>
        (pos>r.from||(pos===r.from&&side>0))&&(pos<r.to||(pos===r.to&&side<0)));
      return range&&value.pinned!==range.comment.id?tooltip(range):null;
    },{hoverTime:350,hideOnChange:true,hideOn:tr=>tr.effects.some(e=>e.is(plugin.refreshEffect))});
    const keyboard=keymap.of([{key:'Escape',run:view=>{
      const pinned=view.state.field(this.feedbackField).pinned;
      if(!pinned)return false;
      view.dispatch({effects:[this.openEffect.of(null),closeHoverTooltips]});return true;
    }}]);
    this.registerEditorExtension([this.feedbackField,hover,keyboard,
      EditorView.domEventHandlers({click:(event,view)=>{
        const span=event.target?.closest?.('[data-ai-comment]');
        if(span)view.dispatch({effects:this.openEffect.of(span.getAttribute('data-ai-comment'))});
        return false;
      }}),
      EditorView.updateListener.of(update=>{
        if(update.selectionSet&&!update.docChanged){
          clearTimeout(this.captureTimers.get(update.view));
          this.captureTimers.set(update.view,setTimeout(()=>{
            this.captureTimers.delete(update.view);
            if(this.unloaded)return;
            const view=this.findView(update.view);if(view)this.capture(view.editor,view);
          },0));
        }
      })
    ]);
  }
  createPopover(view,range){
    const doc=view.dom.ownerDocument,dom=doc.createElement('div');
    dom.className='automatic-ai-popover';dom.setAttribute('role','dialog');dom.setAttribute('aria-label','AI feedback');
    const el=(tag,text,cls,parent=dom)=>{const node=doc.createElement(tag);node.textContent=text;if(cls)node.className=cls;parent.appendChild(node);return node;};
    const labels={context:'Context',reasoning:'Explanation',verify:'Verify this',clarity:'Clarity'};
    const header=el('div','','automatic-ai-header');
    el('span',labels[range.comment.category]||'AI feedback','automatic-ai-label',header);
    const close=el('button','×','automatic-ai-close',header);close.setAttribute('aria-label','Close feedback');
    close.addEventListener('click',event=>{event.preventDefault();view.dispatch({effects:[this.openEffect.of(null),closeHoverTooltips]});view.focus();});
    el('q',range.comment.quote,'automatic-ai-quote');
    if(range.comment.format==='bullets'){
      const list=el('ul','','automatic-ai-body automatic-ai-bullets');
      this.core.feedbackItems(range.comment).forEach((text,index)=>{
        const item=el('li','','automatic-ai-bullet',list);el('span',text,'automatic-ai-bullet-text',item);
        const add=el('button','Add','automatic-ai-add-bullet',item);add.setAttribute('aria-label',`Add bullet ${index+1} to note`);
        add.addEventListener('click',event=>{event.preventDefault();this.addFeedbackToNote(view,range,index);});
        this.setAdditionButton(add,view,range,index);
      });
    }else el('p',range.comment.comment,'automatic-ai-body');
    const actions=el('div','','automatic-ai-actions');
    const add=el('button',range.comment.format==='bullets'?'Add all to note':'Add to note','automatic-ai-add',actions);
    add.addEventListener('click',event=>{event.preventDefault();this.addFeedbackToNote(view,range);});
    this.setAdditionButton(add,view,range);
    const footer=el('div','','automatic-ai-footer');
    el('span','AI feedback','automatic-ai-caption',footer);
    const dismiss=el('button','Dismiss','automatic-ai-dismiss',footer);
    dismiss.addEventListener('click',event=>{
      event.preventDefault();this.loop.dismiss(range.key,range.comment.id);
      view.dispatch({effects:[this.openEffect.of(null),closeHoverTooltips]});view.focus();
    });
    return dom;
  }
  setAdditionButton(button,view,range,index=null){
    button.setAttribute('title','Insert below this passage. Undo works normally.');
    if(view.state.readOnly){button.disabled=true;button.title='This note is read-only.';return;}
    try{
      const plan=this.core.planNoteAddition(view.state.doc.toString(),range.result,range.comment,range.from,this.settings,index);
      if(plan.alreadyAdded){button.disabled=true;button.textContent='Already in note';}
    }catch{button.disabled=true;button.title='This passage changed. Reopen its feedback.';}
  }
  addFeedbackToNote(cm,range,index=null){
    if(this.unloaded)return;
    const native=this.findView(cm),result=this.loop.feedback.get(range.key);
    if(!native?.file||native.file.path!==result?.file||!result.comments.some(c=>c.id===range.comment.id)){
      new Notice('This feedback is no longer available. Reopen the passage.');return;
    }
    this.insertAddition(cm,result,result.comments.find(c=>c.id===range.comment.id),range.from,index);
  }
  insertAddition(cm,result,comment,quoteFrom,index=null){
    const native=this.findView(cm);
    if(!native?.file||native.file.path!==result.file){new Notice('Open the original note before adding this answer.');return false;}
    if(cm.state.readOnly){new Notice('This note is read-only.');return;}
    try{
      const plan=this.core.planNoteAddition(cm.state.doc.toString(),result,comment,quoteFrom,this.settings,index);
      if(plan.alreadyAdded){new Notice('This feedback is already in the note.');return;}
      this.insertingFeedback=true;
      try{
        cm.dispatch({changes:{from:plan.from,to:plan.to,insert:plan.insert},userEvent:'input.ai-addition',effects:[this.openEffect.of(null),closeHoverTooltips]});
        // Baseline additions before editor-change can queue another AI request for them.
        this.loop.update(native.file.path,cm.state.doc.toString(),cm.state.selection.main.head,{baseline:true,explicit:true});
      }finally{this.insertingFeedback=false;}
      cm.focus();return true;
    }catch(error){new Notice(error.message);}
  }
  findView(cm){return this.app.workspace.getLeavesOfType('markdown').map(leaf=>leaf.view).find(view=>view.editor?.cm===cm);}
  capture(editor,view){
    if(this.unloaded||this.insertingFeedback||!view?.file)return;
    this.updateRunButtons();
    this.loop.update(view.file.path,editor.getValue(),editor.posToOffset(editor.getCursor()));
  }
  baselineOpenViews(){
    if(this.unloaded)return;
    this.installNoteActions();
    for(const leaf of this.app.workspace.getLeavesOfType('markdown')){
      const view=leaf.view;if(!view.file||!view.editor)continue;
      if(!this.loop.notes.has(view.file.path))this.loop.update(view.file.path,view.editor.getValue(),
        view.editor.posToOffset(view.editor.getCursor()),{baseline:true});
    }
    this.refreshEditors();
  }
  refreshEditors(){
    if(this.unloaded)return;
    for(const leaf of this.app.workspace.getLeavesOfType('markdown')){
      const view=leaf.view,cm=view.editor?.cm;if(!view.file||!cm?.state.field(this.feedbackField,false))continue;
      clearTimeout(this.refreshTimers.get(cm));
      this.refreshTimers.set(cm,setTimeout(()=>{
        this.refreshTimers.delete(cm);if(this.unloaded||!cm.state.field(this.feedbackField,false))return;
        const current=this.findView(cm);if(!current?.file)return;
        const allowed=this.core.isAllowed(current.file.path,this.settings);
        const results=[...this.loop.feedback.values()].filter(r=>r.file===current.file.path&&(allowed||r.manual));
        cm.dispatch({effects:this.refreshEffect.of(results)});
      },0));
    }
  }
  updateStatus(){
    if(this.unloaded)return;
    this.updateRunButtons();
    const count=this.loop.pending.size;
    let message=!this.connection?.ready?'AI feedback: setup needed':!this.settings.consentGranted?'AI feedback: enable in settings':this.loop.paused?'AI feedback: paused':this.loop.busy?'AI feedback: reviewing…':
      this.loop.lastError?'AI feedback: connection needs attention':count?`AI feedback: ${count} queued`:'AI feedback: ready';
    if(this.connection?.ready&&!this.loop.paused&&!this.loop.busy&&!count&&!this.loop.lastError&&this.loop.metrics.lastTotalMs)
      message=`AI feedback: ${(this.loop.metrics.lastTotalMs/1000).toFixed(1)}s last review`;
    if(this.loop.manualRunning())message=this.loop.manualRun.scope==='question'?`AI answer: ${this.loop.manualRun.status==='waiting'?'waiting…':this.loop.manualRun.cancelled?'stopping…':'thinking…'}`:`AI assistant: ${this.loop.manualRun.completed}/${this.loop.manualRun.total} passages${this.loop.manualRun.cancelled?' · stopping…':''}`;
    this.status.setText(message);
    this.status.setAttribute('aria-label',message+'. Click to pause or resume.');
  }
  togglePaused(){
    if(!this.settings.consentGranted){new Notice('Open Automatic Paragraph Review settings and choose Connect and enable to start automatic reviews.');return;}
    if(!this.connection?.ready){new Notice(this.connection?.message||'Check the Codex connection in plugin settings.');return;}
    this.settings.enabled=!this.settings.enabled;this.loop.setPaused(!this.settings.enabled);
    this.baselineOpenViews();this.persist();this.updateStatus();
  }
  applySettings(){
    this.settings=this.core.settingsWithDefaults(this.settings);this.loop.updateSettings(this.settings);
    if(this.connection?.ready)this.loop.reviewer.binary=this.connection.binary;
    this.refreshEditors();this.persist();
  }
  persist(){
    if(this.unloaded)return;
    clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.saveNow(),300);
  }
  saveNow(){
    clearTimeout(this.saveTimer);
    const data=JSON.parse(JSON.stringify({version:2,settings:this.settings,state:this.loop.exportState()}));
    this.saveChain=this.saveChain.catch(()=>{}).then(()=>this.saveData(data)).catch(error=>{
      console.error('[Automatic paragraph review] Could not save plugin data.',error);
      if(!this.saveNotice){this.saveNotice=true;new Notice('AI feedback could not be saved. Check vault write permissions.');}
    });
    return this.saveChain;
  }
  async onunload(){
    this.unloaded=true;clearTimeout(this.saveTimer);
    for(const timer of this.refreshTimers.values())clearTimeout(timer);
    for(const timer of this.captureTimers.values())clearTimeout(timer);
    this.questionModal?.close();
    for(const {button,ask}of this.noteActions.values()){button.remove();ask?.remove();}this.noteActions.clear();
    this.loop.stop();await this.saveNow();
  }
};

class NoteQuestionModal extends Modal {
  constructor(plugin,view){
    super(plugin.app);this.plugin=plugin;this.view=view;this.file=view.file;
    this.snapshot=view.editor.getValue();this.selection=plugin.selectionFor(view);this.closed=false;
  }
  element(tag,text,parent=this.contentEl){
    const el=this.contentEl.ownerDocument.createElement(tag);if(text)el.textContent=text;parent.appendChild(el);return el;
  }
  onOpen(){
    this.modalEl?.classList.add('automatic-ai-question-modal');this.contentEl.replaceChildren();
    this.element('h2','Ask AI about this note');
    const contextLabel=this.element('label','Context');this.scope=this.element('select','',contextLabel);
    if(this.selection){const option=this.element('option','Selected text',this.scope);option.value='selection';}
    const whole=this.element('option','Whole note',this.scope);whole.value='note';this.scope.value=this.selection?'selection':'note';
    this.contextInfo=this.element('p','');this.contextInfo.className='setting-item-description';
    this.scope.addEventListener('change',()=>{this.answerEl.replaceChildren();this.describeContext();});
    const label=this.element('label','Your question');this.input=this.element('textarea','',label);
    this.input.rows=4;this.input.maxLength=2000;this.input.placeholder='For example: How does this connect to the earlier discussion of sonata form?';
    this.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();this.submit();}});
    this.ask=this.element('button','Ask AI');this.ask.addEventListener('click',()=>this.submit());
    this.status=this.element('p','');this.status.setAttribute('role','status');
    this.answerEl=this.element('div','');this.answerEl.className='automatic-ai-question-answer';this.answerEl.setAttribute('aria-live','polite');
    this.element('p','Answers use the chosen note context and general knowledge, without web research. Add inserts below the last passage in that context. Closing this dialog stops a pending question. Add an answer to keep it across app restarts.').className='setting-item-description';
    this.describeContext();
    const saved=this.plugin.questionCache?.get(this.file.path);
    if(saved&&saved.snapshot===this.snapshot&&JSON.stringify(saved.selection)===JSON.stringify(this.currentSelection())){
      this.input.value=saved.question;this.result=saved.run;this.renderAnswer();
    }
    this.input.focus();
  }
  currentSelection(){return this.scope.value==='selection'?this.selection:null;}
  describeContext(){
    try{const context=this.plugin.core.questionContext(this.snapshot,this.currentSelection(),this.plugin.settings);
      this.contextInfo.textContent=`${this.scope.value==='selection'?'Only selected text':'Current note'} · ${context.text.length.toLocaleString()} characters. Frontmatter, fenced code, and hidden comments are omitted. Uses Codex allowance.`;
    }catch(error){this.contextInfo.textContent=error.message;}
  }
  async submit(){
    const plugin=this.plugin;
    if(this.pending){this.cancelRequested=true;this.status.textContent='Stopping answer…';if(this.activeRun&&this.activeRun===plugin.loop.manualRun)plugin.loop.cancelNoteReview();return;}
    const question=this.input.value.trim();if(!question){this.status.textContent='Enter a question first.';this.input.focus();return;}
    this.pending=true;this.cancelRequested=false;this.ask.textContent='Stop answer';this.input.disabled=true;this.scope.disabled=true;this.answerEl.replaceChildren();this.status.textContent='Connecting…';
    try{
      const connection=plugin.connection?.ready?plugin.connection:await plugin.verifyConnection();
      if(this.closed||plugin.unloaded)return;
      if(this.cancelRequested){this.status.textContent='Answer stopped.';return;}
      if(!connection.ready)throw new Error(connection.message);
      this.status.textContent=plugin.loop.busy?'Waiting for the current request…':'Thinking…';
      const prior=plugin.loop.manualRun,promise=plugin.loop.reviewNote(this.file.path,this.snapshot,-1,{selection:this.currentSelection(),question});
      this.activeRun=plugin.loop.manualRun!==prior?plugin.loop.manualRun:null;
      const run=await promise;if(this.closed||plugin.unloaded)return;
      if(run.status==='failed')throw new Error(run.error);
      if(run.status==='cancelled'){this.status.textContent='Answer stopped.';return;}
      this.result=run;this.status.textContent='Answer based on the context captured when this dialog opened.';
      if(!plugin.questionCache)plugin.questionCache=new Map();
      plugin.questionCache.set(this.file.path,{snapshot:this.snapshot,selection:this.currentSelection(),question,run});
      while(plugin.questionCache.size>10)plugin.questionCache.delete(plugin.questionCache.keys().next().value);
      this.renderAnswer();
    }catch(error){if(!this.closed)this.status.textContent=error.message;}
    finally{this.pending=false;this.activeRun=null;if(!this.closed){this.ask.textContent='Ask AI';this.input.disabled=false;this.scope.disabled=false;}}
  }
  addition(index=null){
    const cm=this.view.editor?.cm;if(!cm||this.view.file!==this.file)throw new Error('Open the original note before adding this answer.');
    const comment={...this.result.answer,quote:this.result.anchor.text};
    const result={file:this.file.path,manual:true,paragraph:this.result.anchor,comments:[comment]};
    const ranges=this.plugin.core.feedbackRanges(cm.state.doc.toString(),[result],this.plugin.settings);
    const range=ranges.length===1?ranges[0]:cm.state.doc.toString()===this.snapshot?ranges.find(r=>r.from===this.result.anchor.from):null;
    if(!range)throw new Error('The source passage changed. Ask again before adding the answer.');
    const plan=this.plugin.core.planNoteAddition(cm.state.doc.toString(),result,comment,range.from,this.plugin.settings,index);
    return {cm,result,comment,range,plan};
  }
  addButton(parent,text,index=null){
    const button=this.element('button',text,parent);button.className='automatic-ai-add';
    try{const data=this.addition(index);button.disabled=data.cm.state.readOnly||data.plan.alreadyAdded;if(data.plan.alreadyAdded)button.textContent='Already in note';}
    catch(error){button.disabled=true;button.title=error.message;}
    button.addEventListener('click',()=>{
      try{const data=this.addition(index);if(this.plugin.insertAddition(data.cm,data.result,data.comment,data.range.from,index))this.renderAnswer();}
      catch(error){new Notice(error.message);}
    });
  }
  renderAnswer(){
    this.answerEl.replaceChildren();const answer=this.result.answer;
    if(answer.format==='bullets'){
      const list=this.element('ul','',this.answerEl);list.className='automatic-ai-bullets';
      answer.bullets.forEach((text,index)=>{const li=this.element('li','',list);this.element('span',text,li);this.addButton(li,'Add',index);});
    }else this.element('p',answer.comment,this.answerEl);
    this.addButton(this.answerEl,answer.format==='bullets'?'Add all to note':'Add answer to note');
  }
  onClose(){
    this.closed=true;if(this.activeRun&&this.activeRun===this.plugin.loop.manualRun)this.plugin.loop.cancelNoteReview();
    if(this.plugin.questionModal===this)this.plugin.questionModal=null;
  }
}

class ReviewSettings extends PluginSettingTab {
  display(){
    const plugin=this.plugin; // Obsidian's base class stores plugin.
    this.containerEl.empty();
    this.containerEl.createEl('h2',{text:'Automatic AI feedback'});
    new Setting(this.containerEl).setName('Codex connection').setDesc(plugin.connection?.message||'Check the connection before enabling reviews.').addButton(button=>button.setButtonText('Check connection').onClick(async()=>{button.setDisabled(true);await plugin.verifyConnection();this.display();}));
    this.containerEl.createEl('p',{text:'Highlight text to review only that selection. Use the speech-bubble button or Ask AI about this note command for a specific question, with selected text or the whole note as context.'});
    this.containerEl.createEl('p',{text:'Use Run AI assistant at the top of a note to review its existing text once, including headings and short bullets. This sends the note to Codex and uses account allowance. It also works while automatic reviews are paused.'});
    if(!plugin.settings.consentGranted)new Setting(this.containerEl).setName('Enable automatic feedback').setDesc('Completed passages and nearby prose from the same note will be sent to Codex using your existing sign-in. Account usage limits apply. Your note text will not be changed.').addButton(button=>button.setButtonText('Connect and enable').setCta().onClick(async()=>{button.setDisabled(true);await plugin.connectAndEnable();this.display();}));
    this.containerEl.createEl('p',{text:'Write normally. Feedback appears as a subtle underline. Hover, click, or move your text cursor into the underlined passage to read it. Your Markdown changes only when you choose Add to note.'});
    const update=()=>plugin.applySettings();
    new Setting(this.containerEl).setName('Automatic reviews').setDesc('Pause or resume background reviews.').addToggle(toggle=>toggle.setValue(plugin.settings.enabled).onChange(value=>{
      if(value&&(!plugin.settings.consentGranted||!plugin.connection?.ready)){new Notice('Use Connect and enable, or check the Codex connection first.');this.display();return;}
      plugin.settings.enabled=value;plugin.loop.setPaused(!value);plugin.persist();plugin.updateStatus();
    }));
    new Setting(this.containerEl).setName('Feedback focus').addDropdown(drop=>drop
      .addOption('context','Context and deeper understanding').addOption('clarity','Clarity and organization')
      .addOption('both','Context, explanations, and clarity').setValue(plugin.settings.focus).onChange(value=>{plugin.settings.focus=value;update();}));
    new Setting(this.containerEl).setName('Writing preferences').setDesc('Optional standing instructions. You do not need to prompt each review.').addTextArea(text=>text
      .setValue(plugin.settings.customInstructions).setPlaceholder('For example: explain musical terms and connect them to their historical context.').onChange(value=>{plugin.settings.customInstructions=value;update();}));
    const seconds=(name,desc,key)=>new Setting(this.containerEl).setName(name).setDesc(desc).addText(text=>text.setValue(String(plugin.settings[key]/1000)).onChange(value=>{
      const n=Number(value);if(Number.isFinite(n)&&n>0){plugin.settings[key]=n*1000;update();}
    }));
    seconds('Review completed passages after','Seconds after a completed paragraph or list item. You can keep writing elsewhere.','pauseMs');
    seconds('Review the current passage after','Seconds without changes to the passage you are still writing.','idleMs');
    seconds('Minimum time between AI requests','Batching reduces repeated context and account usage. Default: 30 seconds.','minIntervalMs');
    new Setting(this.containerEl).setName('Passages per request').addDropdown(drop=>{
      for(const n of [1,2,3,4,5])drop.addOption(String(n),String(n));
      drop.setValue(String(plugin.settings.batchSize)).onChange(value=>{plugin.settings.batchSize=Number(value);update();});
    });
    new Setting(this.containerEl).setName('Limit to one note').setDesc('Optional vault-relative path. Empty allows notes you edit, except excluded folders.').addText(text=>text
      .setValue(plugin.settings.onlyFile).setPlaceholder('Class notes/Lecture.md').onChange(value=>{plugin.settings.onlyFile=value.trim();update();}));
    new Setting(this.containerEl).setName('Excluded folders').setDesc('One vault-relative folder per line.').addTextArea(text=>text
      .setValue(plugin.settings.excludedFolders.join('\n')).onChange(value=>{plugin.settings.excludedFolders=value.split('\n').map(x=>x.trim()).filter(Boolean);update();}));
    new Setting(this.containerEl).setName('Codex executable').setDesc('Leave empty for automatic detection, or enter a full executable path. Uses your existing local Codex sign-in.').addText(text=>text
      .setValue(plugin.settings.codexPath).setPlaceholder('Automatic detection').onChange(value=>{plugin.settings.codexPath=value.trim();plugin.connection={ready:false,message:'Executable changed. Check the connection again.'};plugin.loop.setPaused(true);update();}));
    const metrics=plugin.loop.metrics;
    new Setting(this.containerEl).setName('Recorded usage').setDesc(`${metrics.requests} successful requests · ${metrics.paragraphs} passages reviewed · ${metrics.inputTokens.toLocaleString()} input tokens · ${metrics.outputTokens.toLocaleString()} output tokens. These are reported tokens, not a conversion to subscription allowance.`);
    this.containerEl.createEl('p',{cls:'setting-item-description',text:'Reviews send eligible passage text and up to 8,000 preceding characters from the same note to Codex. Feedback and dismissed state are saved locally in this vault’s plugin data. Factual concerns are suggestions to verify, not sourced fact checks.'});
  }
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
}
