'use strict';
const fs=require('node:fs');const path=require('node:path');const {ReviewEngine,CodexReviewer}=require('./review-core');
const samples=[
  {subject:'Statistics',text:'Students who attend more lectures tend to score higher on exams. This correlation proves that attendance alone causes better exam results, so the study does not need to account for prior knowledge, motivation, or time spent studying outside class.'},
  {subject:'Music history',text:'In sonata form, the exposition introduces the main thematic material and establishes a contrast between tonal areas. The development transforms that material and moves through different keys. The recapitulation brings the main themes back, generally resolving the earlier tonal contrast in the tonic.'},
  {subject:'Learning and memory',text:'Retrieval practice means trying to recall information without looking at the notes. Rereading feels easier because the material becomes familiar. If a page feels familiar, that guarantees I will be able to explain the same material from memory a week later, even without testing myself.'}
];
async function main(){
  const loop=new ReviewEngine(new CodexReviewer(),{minIntervalMs:0});const results=[];
  loop.on('started',job=>console.log(JSON.stringify({event:'automatic-batch-started',passages:job.count})));
  const completed=new Promise((resolve,reject)=>{
    loop.on('review-error',({error})=>reject(error));
    loop.on('completed',result=>{
      const subject=samples.find(s=>s.text===result.paragraph.text)?.subject;
      results.push({subject,paragraph:result.paragraph.text,comments:result.comments,
        aiMs:result.aiMs,totalMs:result.totalMs,stale:result.stale});
      console.log(JSON.stringify({event:'reviewed',subject,totalSeconds:Number((result.totalMs/1000).toFixed(2)),comments:result.comments.length}));
      if(results.length===samples.length)resolve();
    });
  });
  const note=samples.map(s=>`## ${s.subject}\n\n${s.text}\n\n`).join('');
  loop.update('Synthetic benchmark.md',note,note.length);
  try{
    await completed;
    fs.writeFileSync(process.argv[2]||path.join(__dirname,'benchmark-results.json'),JSON.stringify({
      version:'1.0.0',testedAt:new Date().toISOString(),trigger:'Automatic 8-second delay after paragraph completion',
      mode:'Three passages in one real Codex request',metrics:loop.metrics,samples:results
    },null,2));
  }finally{loop.stop();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
