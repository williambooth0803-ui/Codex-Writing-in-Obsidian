'use strict';
const { Plugin, PluginSettingTab, Setting, Notice, MarkdownView } = require('obsidian');
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
      if(this.unloaded)return;
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
    this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{
      this.loop.renameFile(oldPath,file.path);this.baselineOpenViews();
    }));
    this.registerEvent(this.app.vault.on('delete',file=>this.loop.forgetFile(file.path)));
    this.app.workspace.onLayoutReady(()=>this.baselineOpenViews());
    this.addCommand({id:'toggle-automatic-review',name:'Pause/resume automatic reviews',callback:()=>this.togglePaused()});
    this.addCommand({id:'run-ai-assistant',name:'Run AI assistant on the whole note',callback:()=>this.runCurrentNote()});
    this.addCommand({id:'stop-ai-assistant',name:'Stop the whole-note AI assistant',callback:()=>this.loop.cancelNoteReview()});
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
    for(const [view,action]of this.noteActions)if(!views.includes(view)){action.button.remove();this.noteActions.delete(view);}
    for(const view of views){
      if(this.noteActions.has(view)||!view.addAction)continue;
      const button=view.addAction('sparkles','Run AI assistant',()=>{if(button.getAttribute('aria-disabled')!=='true')this.runCurrentNote(view);});
      button.classList.add('automatic-ai-run-button');button.setAttribute('role','button');button.setAttribute('tabindex','0');
      const label=button.ownerDocument.createElement('span');label.className='automatic-ai-run-label';button.appendChild(label);
      this.registerDomEvent(button,'keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(button.getAttribute('aria-disabled')!=='true')this.runCurrentNote(view);}});
      this.noteActions.set(view,{button,label});
    }
    this.updateRunButtons();
  }
  updateRunButtons(){
    if(!this.noteActions)return;
    const run=this.loop.manualRun,active=this.loop.manualRunning();
    for(const [view,{button,label}]of this.noteActions){
      const same=active&&run.file===view.file?.path;
      const disabled=!!this.launchingManual||!view.file||(active&&(!same||run.cancelled));
      const text=this.launchingManual?'Preparing AI assistant…':active?
        run.cancelled?'Stopping AI assistant…':same?`Stop AI assistant (${run.completed}/${run.total})`:'AI assistant running…':'Run AI assistant';
      label.textContent=text;button.setAttribute('aria-label',text);button.setAttribute('aria-disabled',String(disabled));
      button.setAttribute('title',same?'Stop the current whole-note review.':'Review the whole note with Codex. Uses account allowance; automatic-review settings stay unchanged.');
      button.classList.toggle('automatic-ai-run-disabled',disabled);
    }
  }
  async runCurrentNote(view=this.app.workspace.getActiveViewOfType(MarkdownView)){
    if(this.unloaded||this.launchingManual)return;
    if(this.loop.manualRunning()){
      if(view?.file?.path===this.loop.manualRun.file)this.loop.cancelNoteReview();
      else new Notice('The AI assistant is already reviewing another note.');
      return;
    }
    const file=view?.file;if(!file){new Notice('Open a Markdown note first.');return;}
    this.launchingManual=true;this.updateRunButtons();
    try{
      const connection=this.connection?.ready?this.connection:await this.verifyConnection();
      if(this.unloaded)return;
      if(!connection.ready){new Notice(connection.message);return;}
      const text=view.file===file&&view.editor?view.editor.getValue():await this.app.vault.cachedRead(file);
      if(this.unloaded)return;
      this.launchingManual=false;
      await this.loop.reviewNote(file.path,text,view.file===file&&view.editor?view.editor.posToOffset(view.editor.getCursor()):-1);
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
    el('p',range.comment.comment,'automatic-ai-body');
    const footer=el('div','','automatic-ai-footer');
    el('span','AI feedback','automatic-ai-caption',footer);
    const dismiss=el('button','Dismiss','automatic-ai-dismiss',footer);
    dismiss.addEventListener('click',event=>{
      event.preventDefault();this.loop.dismiss(range.key,range.comment.id);
      view.dispatch({effects:[this.openEffect.of(null),closeHoverTooltips]});view.focus();
    });
    return dom;
  }
  findView(cm){return this.app.workspace.getLeavesOfType('markdown').map(leaf=>leaf.view).find(view=>view.editor?.cm===cm);}
  capture(editor,view){
    if(this.unloaded||!view?.file)return;
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
    if(this.loop.manualRunning())message=`AI assistant: ${this.loop.manualRun.completed}/${this.loop.manualRun.total} passages${this.loop.manualRun.cancelled?' · stopping…':''}`;
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
    for(const {button}of this.noteActions.values())button.remove();this.noteActions.clear();
    this.loop.stop();await this.saveNow();
  }
};

class ReviewSettings extends PluginSettingTab {
  display(){
    const plugin=this.plugin; // Obsidian's base class stores plugin.
    this.containerEl.empty();
    this.containerEl.createEl('h2',{text:'Automatic AI feedback'});
    new Setting(this.containerEl).setName('Codex connection').setDesc(plugin.connection?.message||'Check the connection before enabling reviews.').addButton(button=>button.setButtonText('Check connection').onClick(async()=>{button.setDisabled(true);await plugin.verifyConnection();this.display();}));
    this.containerEl.createEl('p',{text:'Use Run AI assistant at the top of a note to review its existing text once, including headings and short bullets. This sends the note to Codex and uses account allowance. It also works while automatic reviews are paused.'});
    if(!plugin.settings.consentGranted)new Setting(this.containerEl).setName('Enable automatic feedback').setDesc('Completed passages and nearby prose from the same note will be sent to Codex using your existing sign-in. Account usage limits apply. Your note text will not be changed.').addButton(button=>button.setButtonText('Connect and enable').setCta().onClick(async()=>{button.setDisabled(true);await plugin.connectAndEnable();this.display();}));
    this.containerEl.createEl('p',{text:'Write normally. Feedback appears as a subtle underline. Hover, click, or move your text cursor into the underlined passage to read it. Your Markdown stays unchanged.'});
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
