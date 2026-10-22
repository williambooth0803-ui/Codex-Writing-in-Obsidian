'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeComment,blocks,wholeNoteBlocks,feedbackRanges,planNoteAddition,DEFAULTS}=require('../review-core');
const original='The exposition introduces contrasting tonal areas in sonata form.';
const bullet={id:'bullet',category:'context',quote:'contrasting tonal areas',format:'bullets',comment:'',bullets:['Major-key works often move to the dominant.','Minor-key works often move to the relative major.']};
function source(text,manual=false,settings=DEFAULTS){const paragraph=(manual?wholeNoteBlocks(text,settings):blocks(text,settings))[0];const result={key:'saved',file:'Note.md',paragraph,manual,comments:[bullet]};const range=feedbackRanges(text,[result],settings)[0];return{result,from:range.from};}
const apply=(text,plan)=>text.slice(0,plan.from)+plan.insert+text.slice(plan.to??plan.from);

test('feedback validation accepts 2-5 note-style bullets or legacy paragraphs, rejects malformed and question-style lists',()=>{
 const t={id:'source',text:original};const valid=normalizeComment(bullet,t);assert.equal(valid.bullets.length,2);assert.equal(valid.comment,'');
 for(const bullets of [['One.'],Array(6).fill('Repeated.'),['Same.','Same.'],['First.','What does this mean?'],['First.','Second\nHidden line'],['First.',null]])assert.equal(normalizeComment({...bullet,bullets},t),null);
 const legacy=normalizeComment({category:'context',quote:bullet.quote,comment:'A coherent explanation. Another sentence.'},t);assert.equal(legacy.format,'paragraph');assert.deepEqual(legacy.bullets,[]);
 assert.equal(normalizeComment({...bullet,format:'html'},t),null);
});
test('whole bullet groups insert below the source, preserve following text, avoid duplicates and allow re-adding after undo',()=>{
 const text=original+'\n\n## Next topic\n\nOther notes stay unchanged.\n';const{result,from}=source(text);
 const plan=planNoteAddition(text,result,bullet,from);const after=apply(text,plan);
 assert.ok(after.startsWith(original+'\n\n- '+bullet.bullets[0]+'\n- '+bullet.bullets[1]+'\n\n## Next topic'));
 assert.equal(planNoteAddition(after,result,bullet,from).alreadyAdded,true);
 assert.equal(planNoteAddition(text,result,bullet,from).alreadyAdded,false);
 const one=apply(text,planNoteAddition(text,result,bullet,from,DEFAULTS,0));const remaining=planNoteAddition(one,result,bullet,from);
 assert.deepEqual(remaining.remaining,[1]);assert.ok(apply(one,remaining).includes('- '+bullet.bullets[0]+'\n- '+bullet.bullets[1]));
 const second=apply(text,planNoteAddition(text,result,bullet,from,DEFAULTS,1));assert.ok(apply(second,planNoteAddition(second,result,bullet,from)).includes('- '+bullet.bullets[0]+'\n- '+bullet.bullets[1]));
});
test('additions to list items become nested bullets and retain ordered/task-list structure',()=>{
 for(const prefix of ['- ','  - ','12. ','- [ ] ']){
  const text=prefix+original+'\n'+prefix+'Next list item stays here.\n';const{result,from}=source(text);const plan=planNoteAddition(text,result,bullet,from),after=apply(text,plan);
  const indent=prefix==='- [ ] '?'  ':' '.repeat(prefix.length);
  assert.ok(after.includes('\n'+indent+'- '+bullet.bullets[0]+'\n'+indent+'- '+bullet.bullets[1]));
  assert.ok(after.endsWith(prefix+'Next list item stays here.\n'));
 }
});
test('paragraph additions preserve CRLF, Unicode and source text, escape Markdown, and stop on stale source',()=>{
 const text=original+' 🎵\r\n\r\nFollowing paragraph.\r\n',c={...bullet,id:'p',format:'paragraph',bullets:[],comment:'A <term> with [[links]] and *emphasis* is plain text.'};
 const{result,from}=source(text);const plan=planNoteAddition(text,result,c,from),after=apply(text,plan);
 assert.ok(after.startsWith(original+' 🎵\r\n\r\nA \\<term\\> with \\[\\[links\\]\\] and \\*emphasis\\* is plain text.\r\n\r\nFollowing'));
 assert.equal(after.replaceAll('\r\n','').includes('\n'),false);
 assert.throws(()=>planNoteAddition(text.replace('exposition','development'),result,c,from),/changed/);
});
test('long split passages insert after their full source paragraph and duplicate manual passages use the clicked occurrence',()=>{
 const settings={...DEFAULTS,maxChars:500},text=original+' '+('A sustained musical explanation fills this paragraph. '.repeat(20))+'\n\nNext topic.';
 const{result,from}=source(text,true,settings);const plan=planNoteAddition(text,result,bullet,from,settings);
 assert.equal(plan.from,text.indexOf('\n')+1);assert.ok(apply(text,plan).startsWith(text.slice(0,plan.from)));
 const twice=original+'\n\n'+original+'\n';const b=wholeNoteBlocks(twice)[0],r={key:'same',paragraph:b,manual:true,comments:[bullet]},ranges=feedbackRanges(twice,[r]);
 const second=planNoteAddition(twice,r,bullet,ranges[1].from);assert.equal(second.from,twice.length);
});
