'use strict';
const fs=require('node:fs');const path=require('node:path');const {ReviewEngine,CodexReviewer}=require('./review-core');
const samples=[
  {subject:'Music history',text:'Mussorgsky uses non-functional harmony and recurring Russian folk material in Boris Godunov. Writing an opera in Russian also contributes to the national character of the work.'},
  {subject:'Musical form',text:'In sonata form, the exposition introduces contrasting tonal areas. The recapitulation brings the main thematic material back and generally resolves the tonal contrast in the tonic.'},
  {subject:'Learning and memory',text:'Retrieval practice means trying to recall what I learned without looking back at my notes. It is different from rereading the same page.'}
];
async function main(){
  const loop=new ReviewEngine(new CodexReviewer(),{minIntervalMs:0,enabled:true});const results=[];
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
      version:require('./manifest.json').version,testedAt:new Date().toISOString(),trigger:'Automatic 8-second delay after paragraph completion',
      mode:'Three passages in one real Codex request',metrics:loop.metrics,samples:results
    },null,2));
  }finally{loop.stop();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
