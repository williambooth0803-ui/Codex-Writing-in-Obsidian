'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');
const {ReviewEngine,blocks,feedbackRanges,settingsWithDefaults,isAllowed,hash}=require('./review-core');
const text='Students who attend lectures score higher on exams. This proves attendance alone causes higher scores.';
const other='Rereading feels familiar, so it guarantees I can recall the material from memory a week later.';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function answer(targets){return {reviews:targets.map(t=>({id:t.id,comments:[{id:hash(t.id),category:'reasoning',quote:t.text.slice(0,30),comment:'What evidence supports the causal inference?'}]})),aiMs:1,usage:{input_tokens:100,output_tokens:10}};}
function setup(reviewBatch=async targets=>answer(targets),settings={},saved={}){
  const reviewer={reviewBatch,stop(){}};const engine=new ReviewEngine(reviewer,{enabled:true,...settings},saved);
  Object.assign(engine.settings,{pauseMs:8,idleMs:20,minIntervalMs:0});return engine;
}

test('segments prose, bullets, Unicode and CRLF with exact offsets; excludes code and frontmatter',()=>{
  const doc='---\r\nsecret: '+text+'\r\n---\r\n# Heading\r\n\r\n- '+text+'\r\n- '+other+'\r\n\r\n```js\r\n'+text+'\r\n```\r\n\r\nMusic 🎵 and an accented café can remain in a sentence without breaking offset calculations.\r\n\r\n';
  const parsed=blocks(doc);assert.equal(parsed.length,3);
  for(const b of parsed)assert.equal(doc.slice(b.from,b.to),b.text);
  assert.ok(parsed.every(b=>b.complete));
  assert.equal(blocks(text)[0].complete,false);assert.equal(blocks(text+'\n')[0].complete,false);
  assert.equal(blocks(text+'\n\n')[0].complete,true);
  assert.equal(blocks(text+'\n\n'+text+'\n\n').length,0);
  assert.equal(blocks('%%\n'+text+'\n%%\n').length,0);
});
test('completed paragraph reviews automatically while next paragraph is being typed',async()=>{
  let calls=0;const loop=setup(async targets=>{calls++;return answer(targets);});
  try{
    const completed=once(loop,'completed');loop.update('a.md',text+'\n\nMeanwhile I keep typing.',text.length+20);
    const [result]=await completed;assert.equal(result.stale,false);assert.equal(calls,1);
    loop.update('a.md',text+'\n\nMeanwhile I keep typing more.',text.length+28);
    await wait(12);assert.equal(calls,1);
  }finally{loop.stop();}
});
test('active passage is reviewed after its own idle delay without a blank line',async()=>{
  const loop=setup();try{const completed=once(loop,'completed');loop.update('a.md',text,text.length);
    const[result]=await completed;assert.ok(result.totalMs>=15);assert.equal(result.comments.length,1);
  }finally{loop.stop();}
});
test('batches ready passages from one note and accounts for one request',async()=>{
  const sizes=[];const loop=setup(async targets=>{sizes.push(targets.length);return answer(targets);});
  try{const completed=once(loop,'completed');loop.update('a.md',text+'\n\n'+other+'\n\n',9999);
    await completed;await wait(5);assert.deepEqual(sizes,[2]);assert.equal(loop.metrics.requests,1);
    assert.equal(loop.metrics.paragraphs,2);assert.equal(loop.metrics.inputTokens,100);
  }finally{loop.stop();}
});
test('stale feedback is discarded when the passage is edited during review',async()=>{
  let finish;const loop=setup(targets=>new Promise(resolve=>{finish=()=>resolve(answer(targets));}));
  try{const started=once(loop,'started');loop.update('a.md',text+'\n\n',9999);await started;
    loop.update('a.md','Changed: '+text,5);const completed=once(loop,'completed');finish();
    const[result]=await completed;assert.equal(result.stale,true);assert.equal(loop.feedback.size,0);
  }finally{loop.stop();}
});
test('saved feedback and dismissed comments survive restart; baseline does not call AI',async()=>{
  let calls=0;const loop=setup(async targets=>{calls++;return answer(targets);});
  let saved;try{const completed=once(loop,'completed');loop.update('a.md',text+'\n\n',9999);const[result]=await completed;
    loop.dismiss(result.key,result.comments[0].id);saved=JSON.parse(JSON.stringify(loop.exportState()));
  }finally{loop.stop();}
  const restored=setup(async targets=>{calls++;return answer(targets);},{},saved);
  try{restored.update('a.md',text+'\n\n',9999,{baseline:true});restored.update('a.md',text+'\n\nNext.',9999);
    await wait(25);assert.equal(calls,1);assert.equal([...restored.feedback.values()][0].comments.length,0);
  }finally{restored.stop();}
});
test('hover ranges follow exact quotes after other text moves; ambiguous quote uses whole block',()=>{
  const paragraph=blocks(text+'\n\n')[0];const result={key:'k',paragraph,comments:[{id:'c',quote:'attendance alone',comment:'Check',category:'reasoning'}]};
  const doc='# New heading\n\n'+text+'\n\n';const range=feedbackRanges(doc,[result])[0];
  assert.equal(doc.slice(range.from,range.to),'attendance alone');
  const repeated=text+' Attendance attendance attendance.';const r={...result,paragraph:blocks(repeated+'\n\n')[0],comments:[{id:'c',quote:'attendance',comment:'Check'}]};
  const ambiguous=feedbackRanges(repeated+'\n\n',[r])[0];assert.equal(ambiguous.to-ambiguous.from,repeated.length);
});
test('exclusions stop requests and rename/delete update saved anchors',async()=>{
  assert.equal(isAllowed('Templates/a.md',settingsWithDefaults()),false);
  assert.equal(isAllowed('Templates2/a.md',settingsWithDefaults()),true);
  const loop=setup();try{loop.update('Templates/a.md',text+'\n\n',9999);assert.equal(loop.pending.size,0);
    const completed=once(loop,'completed');loop.update('old.md',text+'\n\n',9999);await completed;
    loop.renameFile('old.md','new.md');assert.equal([...loop.feedback.values()][0].file,'new.md');
    loop.forgetFile('new.md');assert.equal(loop.feedback.size,0);assert.equal(loop.done.size,0);
  }finally{loop.stop();}
});
test('pause discards in-flight results and prevents new automatic requests',async()=>{
  let finish,calls=0;const loop=setup(targets=>{calls++;return new Promise(resolve=>{finish=()=>resolve(answer(targets));});});
  try{const started=once(loop,'started');loop.update('a.md',text+'\n\n',9999);await started;
    loop.setPaused(true);finish();await wait(5);loop.update('b.md',other+'\n\n',9999);
    await wait(25);assert.equal(calls,1);assert.equal(loop.feedback.size,0);
  }finally{loop.stop();}
});
test('request throttle delays subsequent batches without blocking local writing',async()=>{
  const timestamps=[];const loop=setup(async targets=>{timestamps.push(performance.now());return answer(targets);});
  loop.settings.minIntervalMs=45;
  try{let completed=once(loop,'completed');loop.update('a.md',text+'\n\n',9999);await completed;
    completed=once(loop,'completed');loop.update('b.md',other+'\n\n',9999);await completed;
    assert.ok(timestamps[1]-timestamps[0]>=40);
  }finally{loop.stop();}
});

test('context omits metadata, fenced code, and hidden comments',async()=>{
  let context;const loop=setup(async(targets,c)=>{context=c;return answer(targets);});
  try{const old='---\nprivate: TOP_SECRET\n---\n\n```text\nCODE_SECRET\n```\n\n%%\nCOMMENT_SECRET\n%%\n\n'+text+'\n\n';
    loop.update('a.md',old,9999,{baseline:true});
    const completed=once(loop,'completed');loop.update('a.md',old+other+'\n\n',9999);await completed;
    assert.ok(context.includes(text));assert.equal(/SECRET/.test(context),false);
  }finally{loop.stop();}
});
test('rename during an in-flight review preserves the correct annotation',async()=>{
  let finish;const loop=setup(targets=>new Promise(resolve=>{finish=()=>resolve(answer(targets));}));
  try{const started=once(loop,'started');loop.update('old.md',text+'\n\n',9999);await started;
    loop.renameFile('old.md','new.md');const completed=once(loop,'completed');finish();const[result]=await completed;
    assert.equal(result.stale,false);assert.equal(result.file,'new.md');assert.equal([...loop.feedback.values()][0].file,'new.md');
  }finally{loop.stop();}
});
test('failure queues a bounded retry and pause/resume clears the cooldown',async()=>{
  let calls=0;const loop=setup(async targets=>{calls++;if(calls===1)throw new Error('Temporary connection failure');return answer(targets);});
  try{const failed=once(loop,'review-error');loop.update('a.md',text+'\n\n',9999);await failed;
    assert.ok(loop.backoffUntil>performance.now());assert.equal(loop.pending.size,1);
    loop.setPaused(true);const completed=once(loop,'completed');loop.setPaused(false);await completed;
    assert.equal(calls,2);assert.equal(loop.lastError,null);assert.equal(loop.metrics.errors,1);
  }finally{loop.stop();}
});
