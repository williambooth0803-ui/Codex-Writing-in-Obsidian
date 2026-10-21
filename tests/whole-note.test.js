'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {ReviewEngine,wholeNoteBlocks,feedbackRanges,hash}=require('../review-core');
const paragraph='The exposition introduces contrasting tonal areas, and the recapitulation resolves that contrast in the tonic.';
const addition='Retrieval practice means recalling material without looking back, followed by checking the accuracy of the recall.';
function answer(targets){return{reviews:targets.map(t=>({id:t.id,comments:[{id:hash(t.id),category:'context',quote:t.text.slice(0,20),comment:'The tonal return provides a sense of resolution by placing the contrasting material in the home key.'}]})),aiMs:1,usage:{input_tokens:20,output_tokens:10}};}
function create(reviewBatch=async targets=>answer(targets),settings={},saved={}){return new ReviewEngine({reviewBatch,stop(){}},{enabled:false,...settings},saved);}

test('whole-note extraction includes headings, short bullets, quotes and tables, splits long text, and excludes protected content',()=>{
  const long=('Music 🎵 and meaning. ').repeat(400);
  const text='---\nsecret: hidden metadata\n---\n# Sonata\n\n- Tonic\n- Dominant\n\n> Quoted note\n\n| Term | Role |\n| --- | --- |\n| Tonic | Home |\n\n```js\nhidden code\n```\n\n%%\nhidden comment\n%%\n\n'+long;
  const parsed=wholeNoteBlocks(text);
  assert.ok(parsed.some(b=>b.text==='Sonata'));assert.ok(parsed.some(b=>b.text==='Tonic'));
  assert.ok(parsed.some(b=>b.text.includes('Quoted note')));assert.ok(parsed.some(b=>b.text.includes('| Term |')));
  assert.ok(parsed.filter(b=>b.text.includes('Music')).length>1);
  for(const b of parsed){assert.equal(text.slice(b.from,b.to),b.text);assert.ok(b.text.length<=5000);assert.ok(!/hidden/.test(b.text));assert.ok(!/[\uD800-\uDBFF]$/.test(b.text));}
});

test('explicit whole-note review reruns existing text while automatic reviews remain paused and restrictions remain unchanged',async()=>{
  let calls=0;const loop=create(async targets=>{calls++;return answer(targets);},{onlyFile:'Other.md',batchSize:2});
  const file='Templates/Existing.md',text='# Sonata\n\n- Tonic\n- Tonic\n\n'+paragraph;
  try{
    const first=await loop.reviewNote(file,text);assert.equal(first.status,'completed');assert.equal(first.total,3);assert.equal(calls,2);
    assert.equal(loop.paused,true);assert.equal(loop.settings.enabled,false);assert.equal(loop.settings.onlyFile,'Other.md');
    const saved=loop.exportState();const tonic=[...loop.feedback.values()].find(r=>r.paragraph.text==='Tonic');assert.ok(tonic.manual);
    assert.equal(feedbackRanges(text,[tonic]).length,2,'identical short bullets share a reviewed comment');
    const restored=create(undefined,{onlyFile:'Other.md'},saved);assert.ok(feedbackRanges(text,[...restored.feedback.values()]).length>=3);restored.stop();
    await loop.reviewNote(file,text);assert.equal(calls,4,'explicit rerun ignores the prior done set');
  }finally{loop.stop();}
});

test('whole-note review waits for an automatic request instead of launching concurrent Codex processes',async()=>{
  let finishAutomatic,calls=0,active=0,maxActive=0;
  const loop=create(async targets=>{calls++;active++;maxActive=Math.max(maxActive,active);
    if(calls===1)await new Promise(resolve=>{finishAutomatic=resolve;});
    active--;return answer(targets);
  },{enabled:true,minIntervalMs:300000});
  try{
    loop.update('a.md',paragraph+'\n\n',-1);for(const job of loop.pending.values())job.due=0;
    const automatic=loop.run();assert.equal(loop.busy,true);
    const manual=loop.reviewNote('a.md',paragraph+'\n\n');assert.equal(loop.manualRun.status,'waiting');assert.equal(calls,1);
    finishAutomatic();await automatic;await manual;assert.equal(calls,2);assert.equal(maxActive,1);assert.equal(loop.manualRun.status,'completed');
  }finally{loop.stop();}
});

test('edits during a whole-note run discard stale feedback and renames preserve later results',async()=>{
  let finish,calls=0;const loop=create(async targets=>{calls++;if(calls===1)return new Promise(resolve=>{finish=()=>resolve(answer(targets));});return answer(targets);},{batchSize:1});
  try{
    const text=paragraph+'\n\n'+addition;const work=loop.reviewNote('a.md',text);
    loop.update('a.md','The original paragraph was changed.\n\n'+addition);loop.renameFile('a.md','Moved.md');finish();
    const run=await work;assert.equal(run.status,'completed');assert.equal(run.skipped,1);assert.equal(run.completed,2);
    assert.equal(loop.feedback.size,1);assert.equal([...loop.feedback.values()][0].file,'Moved.md');
    assert.equal([...loop.feedback.values()][0].paragraph.text,addition);
  }finally{loop.stop();}
});

test('cancelling a whole-note review discards its in-flight result and leaves the automatic setting alone',async()=>{
  let finish,stops=0;const loop=create(targets=>new Promise(resolve=>{finish=()=>resolve(answer(targets));}));loop.reviewer.stop=()=>{stops++;};
  try{
    const work=loop.reviewNote('a.md',paragraph);assert.equal(loop.cancelNoteReview(),true);assert.equal(stops,1);
    finish();const run=await work;assert.equal(run.status,'cancelled');assert.equal(loop.feedback.size,0);assert.equal(loop.metrics.requests,0);
    assert.equal(loop.paused,true);assert.equal(loop.settings.enabled,false);assert.equal(loop.busy,false);
    loop.reviewer.reviewBatch=async targets=>answer(targets);assert.equal((await loop.reviewNote('a.md',paragraph)).status,'completed');
  }finally{loop.stop();}
});

test('new automatic work stays queued during the manual run and is reviewed afterward',async()=>{
  let finish,calls=0;const loop=create(async targets=>{calls++;if(calls===1)return new Promise(resolve=>{finish=()=>resolve(answer(targets));});return answer(targets);},{enabled:true,minIntervalMs:300000});
  try{
    const work=loop.reviewNote('a.md',paragraph+'\n\n');
    loop.update('a.md',paragraph+'\n\n'+addition+'\n\n',-1);assert.equal(loop.pending.size,1);
    await loop.run();assert.equal(calls,1);finish();await work;assert.equal(loop.pending.size,1);
    loop.lastStarted=-Infinity;for(const job of loop.pending.values())job.due=0;await loop.run();
    assert.equal(calls,2);assert.equal(loop.pending.size,0);assert.equal(loop.settings.enabled,true);
  }finally{loop.stop();}
});

test('manual failures preserve completed feedback, stop the run, and report failure without silently enabling automatic reviews',async()=>{
  let calls=0;const loop=create(async targets=>{if(++calls===2)throw new Error('Codex needs sign-in.');return answer(targets);},{batchSize:1});
  try{
    const run=await loop.reviewNote('a.md',paragraph+'\n\n'+addition);assert.equal(run.status,'failed');assert.equal(run.completed,1);
    assert.match(run.error,/sign-in/);assert.equal(loop.feedback.size,1);assert.equal(loop.metrics.errors,1);assert.equal(loop.paused,true);assert.equal(loop.busy,false);
    await assert.rejects(loop.reviewNote('empty.md','```\nprotected code only\n```'),/no reviewable text/);
  }finally{loop.stop();}
});
