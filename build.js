'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=__dirname;
const core=fs.readFileSync(path.join(root,'review-core.js'),'utf8');
const source=fs.readFileSync(path.join(root,'main-source.js'),'utf8');
if(source.split('/* REVIEW_CORE */').length!==2)throw new Error('Expected one core placeholder');
const bundle=source.replace('/* REVIEW_CORE */',`(()=>{const module={exports:{}};const __dirname=this.pluginRoot;\n${core}\nreturn module.exports;})()`);
fs.writeFileSync(path.join(root,'main.js'),bundle);
console.log('Built main.js with bundled review core (no external package install required).');
