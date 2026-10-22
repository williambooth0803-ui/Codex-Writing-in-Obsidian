'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ReviewEngine,CodexReviewer,settingsWithDefaults,selectedBlocks,resolveSelected,questionContext,feedbackRanges,planNoteAddition}=require('../review-core');
const settings=settingsWithDefaults({enabled:false});
const reply=targets=>({reviews:targets.map(t=>({id:t.id,comments:[{id:'comment-'+t.id,category:'context',format:'paragraph',bullets:[],quote:t.text,comment:'The tonic gives these contrasting themes a shared tonal home.'}]})),aiMs:2,usage:{input_tokens:10,output_tokens:5}});
const answer={comment:{id:'answer',category:'context',format:'paragraph',bullets:[],quote:'answer',comment:'The tonic is the home key. Returning themes there resolves the exposition’s tonal contrast.'},aiMs:3,usage:{input_tokens:20,output_tokens:10}};
const note='Private unselected introduction.\n\nThe recapitulation resolves tonal contrast by returning contrasting themes to the tonic.\n\nUnselected conclusion.';
const from=note.indexOf('tonal contrast'),to=note.indexOf('.\n\nUnselected');const selection={from,to};

test('selection clips exact partial paragraphs, excludes protected regions, and rejects invalid ranges',()=>{
 const parts=selectedBlocks(note,selection);assert.equal(parts.length,1);assert.equal(parts[0].text,note.slice(from,to));assert.equal(parts[0].from,from);assert.equal(parts[0].to,to);
 const protectedNote='---\nsecret: value\n---\nVisible text.\n\n```js\ncodeSecret\n```\n%% hiddenSecret %%\nLast line.';
 const all=selectedBlocks(protectedNote,{from:0,to:protectedNote.length});assert.equal(all.map(p=>p.text).join(' '),'Visible text. Last line.');
 assert.throws(()=>selectedBlocks(note,{from:to,to:from}),/Select/);assert.throws(()=>selectedBlocks(note,{from:-1,to}),/Select/);
});
test('selected reviews send only highlighted text, persist exact anchors, and keep automatic settings unchanged',async()=>{
 const calls=[],engine=new ReviewEngine({async reviewBatch(targets,context){calls.push({targets,context});return reply(targets);}},settings);
 try{
  const run=await engine.reviewNote('Note.md',note,-1,{selection});assert.equal(run.scope,'selection');assert.equal(run.completed,1);
  assert.deepEqual(calls[0].targets.map(t=>t.text),[note.slice(from,to)]);assert.equal(calls[0].context,'');assert.equal(engine.paused,true);
  const saved=JSON.parse(JSON.stringify(engine.exportState())),restored=new ReviewEngine({},settings,saved);
  try{const ranges=feedbackRanges(note,[...restored.feedback.values()]);assert.equal(ranges[0].from,from);assert.equal(ranges[0].to,to);}finally{restored.stop();}
 }finally{engine.stop();}
});
test('selection batching never includes unselected surrounding context',async()=>{
 const text='Outside secret.\n\nFirst selected musical point.\n\nSecond selected musical point.\n\nOutside tail.';
 const range={from:text.indexOf('First'),to:text.indexOf('\n\nOutside tail')},calls=[];
 const engine=new ReviewEngine({async reviewBatch(targets,context){calls.push({targets,context});return reply(targets);}},{enabled:false,batchSize:1});
 try{await engine.reviewNote('Note.md',text,-1,{selection:range});assert.equal(calls.length,2);assert.equal(calls[1].context,'First selected musical point.');assert.ok(!JSON.stringify(calls).includes('Outside'));}finally{engine.stop();}
});
test('partial feedback follows unchanged paragraphs and inserts after the full source, with conservative stale and duplicate handling',()=>{
 const p=selectedBlocks(note,selection)[0];assert.equal(resolveSelected('New heading.\n\n'+note,p)[0].from,from+14);
 assert.equal(resolveSelected(note.replace('recapitulation','development'),p).length,0);
 const result={paragraph:p,manual:true,comments:reply([{id:p.id,text:p.text}]).reviews[0].comments},range=feedbackRanges(note,[result])[0];
 const plan=planNoteAddition(note,result,result.comments[0],range.from);assert.equal(plan.from,note.indexOf('\n',to)+1);
 const twice='Repeated passage.\n\nRepeated passage.';const selected=selectedBlocks(twice,{from:19,to:twice.length})[0];assert.equal(resolveSelected(twice,selected).length,1);assert.equal(resolveSelected('Moved.\n\n'+twice,selected).length,0);
});
test('question context uses chosen scope, omits protected data, and refuses silent truncation',()=>{
 assert.equal(questionContext(note,selection).text,note.slice(from,to));assert.ok(questionContext(note).text.includes('introduction'));
 assert.throws(()=>questionContext('a'.repeat(60001)),/60,000/);assert.throws(()=>questionContext('```\nsecret\n```'),/reviewable/);
});
test('questions share the request queue, record usage, and do not overwrite newer tracked note text or saved feedback',async()=>{
 let finish;let concurrent=0,max=0;const engine=new ReviewEngine({
  async reviewBatch(targets){concurrent++;max=Math.max(max,concurrent);await new Promise(r=>finish=r);concurrent--;return reply(targets);},
  async answerQuestion(question,context){concurrent++;max=Math.max(max,concurrent);assert.equal(context,note.slice(from,to));concurrent--;return answer;}
 },{enabled:true,minIntervalMs:0});
 try{
  engine.update('Note.md',note,note.length);for(const job of engine.pending.values())job.due=0;const auto=engine.run();
  const question=engine.reviewNote('Note.md',note,-1,{selection,question:'Why does this resolve the contrast?'});assert.equal(engine.manualRun.status,'waiting');
  const newer=note+'\n\nNewer writing remains tracked.';engine.update('Note.md',newer,newer.length);finish();await auto;const run=await question;
  assert.equal(run.status,'completed');assert.equal(run.answer.comment,answer.comment.comment);assert.equal(max,1);assert.equal(engine.notes.get('Note.md').text,newer);assert.equal(engine.metrics.requests,2);assert.equal(engine.paused,false);
  const saved=engine.exportState();assert.ok(!JSON.stringify(saved).includes('Why does this resolve'));assert.ok(saved.feedback.length>0);
 }finally{engine.stop();}
});
test('cancelled or failed questions do not return an answer; invalid or oversized requests do not call AI',async()=>{
 let finish,stops=0,calls=0;const engine=new ReviewEngine({async answerQuestion(){calls++;await new Promise(r=>finish=r);return answer;},stop(){stops++;}},settings);
 try{
  await assert.rejects(engine.reviewNote('Note.md',note,-1,{question:''}),/question/);
  await assert.rejects(engine.reviewNote('Note.md','a'.repeat(60001),-1,{question:'Explain'}),/60,000/);assert.equal(calls,0);
  const pending=engine.reviewNote('Note.md',note,-1,{question:'Explain the contrast.'});engine.cancelNoteReview();finish();const run=await pending;
  assert.equal(run.status,'cancelled');assert.equal(run.answer,undefined);assert.equal(stops,1);assert.equal(engine.paused,true);
  engine.reviewer.answerQuestion=async()=>{throw new Error('Connection failed');};const failed=await engine.reviewNote('Note.md',note,-1,{question:'Explain'});assert.equal(failed.status,'failed');assert.equal(engine.metrics.errors,1);
 }finally{engine.stop();}
});
test('question client uses a dedicated schema and validates bullet or paragraph answers without study questions',async()=>{
 const reviewer=new CodexReviewer();let prompt,schema;
 reviewer.request=async(p,s)=>{prompt=p;schema=s;return {format:'bullets',comment:'',bullets:['The tonic supplies a tonal home.','Contrasting themes can retain different textures.'],aiMs:1,usage:{input_tokens:3}};};
 const response=await reviewer.answerQuestion('Explain the contrast.',note,settings);assert.equal(response.comment.bullets.length,2);assert.ok(schema.properties.bullets);assert.ok(prompt.includes('NOTE_CONTEXT'));assert.ok(!schema.properties.reviews);
 reviewer.request=async()=>({format:'paragraph',comment:'Could this be explained?',bullets:[]});await assert.rejects(reviewer.answerQuestion('Explain',note,settings),/invalid answer/);
});
