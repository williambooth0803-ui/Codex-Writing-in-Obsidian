'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');
const {discoverCodex,ReviewEngine,settingsWithDefaults,hash}=require('../review-core');
const root=path.resolve(__dirname,'..');

test('connection discovery handles a missing executable, sign-out, old CLI, and a supported sign-in',async()=>{
  const missing=await discoverCodex('/missing/codex',{run:async()=>({code:null,error:'ENOENT',stdout:'',stderr:''})});assert.equal(missing.ready,false);
  const runner=(loggedIn=true,supported=true)=>async(binary,args)=>{
    if(args[0]==='--version')return{code:0,stdout:'codex-cli 0.163.0',stderr:''};
    if(args[0]==='exec')return{code:0,stdout:supported?'--output-schema --ignore-user-config --ephemeral':'old help',stderr:''};
    return {code:loggedIn?0:1,stdout:loggedIn?'Logged in using ChatGPT':'Not logged in',stderr:''};
  };
  assert.equal((await discoverCodex('/fake/codex',{run:runner(false)})).ready,false);
  assert.match((await discoverCodex('/fake/codex',{run:runner(true,false)})).message,/Update/);
  assert.equal((await discoverCodex('/fake/codex',{run:runner()})).ready,true);
  assert.equal(settingsWithDefaults().enabled,false);
  assert.equal(settingsWithDefaults({maxContextChars:0}).maxContextChars,0);
});

test('fresh three-file installation reviews using an embedded schema and removes its temporary schema',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'obsidian-release-test-'));
  try{
    const install=path.join(temp,'automatic-paragraph-review');fs.mkdirSync(install);
    for(const name of ['main.js','manifest.json','styles.css'])fs.copyFileSync(path.join(root,name),path.join(install,name));
    const capture=path.join(temp,'schema-path.txt'),fake=path.join(temp,'fake-codex');
    fs.writeFileSync(fake,`#!${process.execPath}\nconst fs=require('node:fs');\nconst args=process.argv.slice(2);\nconst schema=args[args.indexOf('--output-schema')+1];\nif(!fs.existsSync(schema)||!JSON.parse(fs.readFileSync(schema)).properties.reviews)process.exit(9);\nfs.writeFileSync(${JSON.stringify(capture)},schema);\nlet input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{const data=JSON.parse(input.split('NOTE_DATA: ')[1]);console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({reviews:data.targets.map(t=>({id:t.id,comments:[{category:'question',quote:t.text.slice(0,20),comment:'What does this mean?'},{category:'context',quote:t.text.slice(0,20),comment:'Could this be explained?'},{category:'context',quote:t.text.slice(0,20),comment:'A controlled comparison isolates one variable while keeping the others similar.'}]}))})}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}));});\n`,{mode:0o755});
    const sandbox={module:{exports:{}},process,performance,console,setTimeout,clearTimeout,require(name){
      if(name==='obsidian')return{Plugin:class{},PluginSettingTab:class{},MarkdownView:class{}};
      if(name==='@codemirror/state'||name==='@codemirror/view')return{};
      return require(name);
    }};
    vm.runInNewContext(fs.readFileSync(path.join(install,'main.js'),'utf8'),sandbox);
    const plugin=new sandbox.module.exports();plugin.app={vault:{adapter:{getBasePath:()=>temp}}};plugin.manifest={dir:'automatic-paragraph-review'};
    plugin.loadData=async()=>{throw new Error('captured bundled core');};
    await assert.rejects(plugin.onload(),/captured bundled core/);
    const reviewer=new plugin.core.CodexReviewer({binary:fake,cwd:install});
    const answer=await reviewer.reviewBatch([{id:'one',text:'A synthetic sample paragraph that should receive no fabricated feedback.'}],'',settingsWithDefaults());
    assert.equal(answer.reviews.length,1);assert.equal(answer.reviews[0].comments.length,1);assert.equal(answer.reviews[0].comments[0].category,'context');assert.match(answer.reviews[0].comments[0].comment,/controlled comparison/);
    assert.equal(fs.existsSync(fs.readFileSync(capture,'utf8')),false);
    assert.deepEqual(fs.readdirSync(install).sort(),['main.js','manifest.json','styles.css']);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('accelerated class-length workload preserves queue, history, deduplication, and folder moves',async()=>{
  const reviewer={async reviewBatch(targets){return{reviews:targets.map(t=>({id:t.id,comments:[{id:hash(t.id),category:'context',quote:t.text.slice(0,25),comment:'A concrete example links this concept to a familiar situation.'}]})),aiMs:1,usage:{input_tokens:100,output_tokens:10}};},stop(){}};
  const engine=new ReviewEngine(reviewer,{enabled:true,minIntervalMs:0,batchSize:3});let note='';
  try{
    for(let minute=0;minute<60;minute++){
      for(let part=0;part<2;part++)note+=`Minute ${minute}, passage ${part}: the lecture introduces a distinct concept and an inference worth examining in its context.\n\n`;
      engine.update('Class/Lecture.md',note,note.length);
      for(const job of engine.pending.values())job.due=performance.now()-1;
      await engine.run();
      assert.equal(engine.pending.size,0);
    }
    assert.equal(engine.metrics.paragraphs,120);assert.equal(engine.metrics.requests,60);
    engine.renameFile('Class','Archive/Class');assert.ok([...engine.feedback.values()].every(r=>r.file==='Archive/Class/Lecture.md'));
    const saved=JSON.parse(JSON.stringify(engine.exportState()));engine.stop();
    const restored=new ReviewEngine(reviewer,{enabled:true},saved);
    restored.update('Archive/Class/Lecture.md',note,note.length,{baseline:true});assert.equal(restored.pending.size,0);
    restored.forgetFile('Archive');assert.equal(restored.feedback.size,0);restored.stop();
  }finally{engine.stop();}
});
