'use strict';
// Optional live schema check: sends only two synthetic passages to the signed-in Codex CLI.
const fs=require('node:fs');const {CodexReviewer,settingsWithDefaults,planNoteAddition,wholeNoteBlocks,feedbackRanges}=require('./review-core');
async function main(){
 const targets=[{id:'comparison',text:'Major-key and minor-key sonata expositions often establish different contrasting tonal areas.'},{id:'mechanism',text:'The recapitulation resolves the tonal contrast introduced by the exposition.'}];
 const reviewer=new CodexReviewer();
 try{
  const answer=await reviewer.reviewBatch(targets,'',settingsWithDefaults({customInstructions:'For this synthetic format validation, give comparison a bullet group and mechanism a paragraph. Supply useful musical context in both.'}));
  if(answer.reviews[0].comments[0]?.format!=='bullets'||answer.reviews[1].comments[0]?.format!=='paragraph')throw new Error('Expected one bullet group and one paragraph for this validation.');
  const note=targets.map(t=>t.text).join('\n\n');const planned=answer.reviews.map((review,index)=>{
   const paragraph=wholeNoteBlocks(note)[index],result={paragraph,manual:true,comments:review.comments},range=feedbackRanges(note,[result])[0];
   return {id:review.id,format:review.comments[0].format,plan:planNoteAddition(note,result,review.comments[0],range.from)};
  });
  fs.writeFileSync(process.argv[2]||'addable-feedback-benchmark-results-1.0.4.json',JSON.stringify({version:'1.0.4',testedAt:new Date().toISOString(),targets,...answer,planned},null,2)+'\n');
  console.log(JSON.stringify({aiSeconds:Number((answer.aiMs/1000).toFixed(2)),formats:planned.map(p=>p.format),bulletCount:answer.reviews[0].comments[0].bullets.length}));
 }finally{reviewer.stop();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
