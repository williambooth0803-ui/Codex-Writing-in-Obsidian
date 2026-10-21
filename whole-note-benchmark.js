'use strict';
// Optional live check: sends only these synthetic passages to your signed-in Codex CLI.
const fs=require('node:fs');const path=require('node:path');const {ReviewEngine,CodexReviewer}=require('./review-core');
const note='# Sonata form\n\n- Exposition: contrasting keys\n\nThe recapitulation brings back the main thematic material in the tonic. This resolves the tonal contrast introduced by the exposition.\n';
async function main(){
  const loop=new ReviewEngine(new CodexReviewer(),{enabled:false});const start=performance.now(),samples=[];
  loop.on('completed',result=>samples.push({paragraph:result.paragraph.text,comments:result.comments,totalMs:result.totalMs,stale:result.stale}));
  try{
    const run=await loop.reviewNote('Synthetic whole-note benchmark.md',note);
    const result={version:require('./manifest.json').version,testedAt:new Date().toISOString(),mode:'Explicit whole-note review with automatic reviews paused',totalMs:performance.now()-start,run,automaticStillPaused:loop.paused,metrics:loop.metrics,samples};
    fs.writeFileSync(process.argv[2]||path.join(__dirname,'whole-note-benchmark-results-1.0.3.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({status:run.status,passages:run.completed,comments:run.comments,totalSeconds:Number((result.totalMs/1000).toFixed(2)),automaticStillPaused:loop.paused}));
    if(run.status!=='completed')throw new Error(run.error||run.status);
  }finally{loop.stop();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
