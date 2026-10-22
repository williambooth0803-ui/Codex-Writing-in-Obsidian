'use strict';
// Optional live check: two Codex requests using synthetic text, never personal notes.
const fs=require('node:fs');const {ReviewEngine,CodexReviewer}=require('./review-core');
async function main(){
 const note='Unselected introductory text.\n\nThe recapitulation resolves tonal contrast by returning contrasting themes to the tonic.\n\nUnselected closing text.';
 const selection={from:note.indexOf('The recapitulation'),to:note.indexOf('\n\nUnselected closing')};
 const reviewer=new CodexReviewer(),engine=new ReviewEngine(reviewer,{enabled:false});
 try{
  const start=performance.now();const selected=await engine.reviewNote('Synthetic.md',note,-1,{selection});
  if(selected.status!=='completed')throw new Error(selected.error||selected.status);
  const selectionMs=performance.now()-start;
  const question='How does returning a theme in the tonic resolve the contrast if its melody remains different?';
  const qStart=performance.now(),answered=await engine.reviewNote('Synthetic.md',note,-1,{selection,question});
  if(answered.status!=='completed')throw new Error(answered.error||answered.status);
  const questionMs=performance.now()-qStart;
  fs.writeFileSync(process.argv[2]||'selection-question-benchmark-results-1.0.5.json',JSON.stringify({version:'1.0.5',testedAt:new Date().toISOString(),syntheticNote:note,selection,question,selectionMs,questionMs,selectionRun:selected,questionRun:answered,feedback:[...engine.feedback.values()],automaticStillPaused:engine.paused,metrics:engine.metrics},null,2)+'\n');
  console.log(JSON.stringify({selectionSeconds:Number((selectionMs/1000).toFixed(2)),questionSeconds:Number((questionMs/1000).toFixed(2)),answerFormat:answered.answer.format,automaticStillPaused:engine.paused}));
 }finally{engine.stop();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
