import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(new URL("./prepare-approved-blog.mts",import.meta.url));
test("approved revision is prepared once, outside main, without overwriting an existing guide",()=>{
  const root=mkdtempSync(path.join(tmpdir(),"tok-approved-"));
  const git=(...args)=>execFileSync("git",args,{cwd:root,stdio:"pipe"});
  const catalog=path.join(root,"src/content/blog.json"), privateInput=path.join(root,"snapshot.json");
  const run=()=>spawnSync(process.execPath,["--experimental-strip-types",script,privateInput],{cwd:root,encoding:"utf8"});
  try {
    git("init","-b","main"); git("remote","add","origin","https://github.com/Mtnrconcept1/cloud-rebuild.git");
    mkdirSync(path.dirname(catalog),{recursive:true});writeFileSync(catalog,"[]\n");
    git("add","src/content/blog.json");git("-c","user.name=TOK Test","-c","user.email=test@example.invalid","-c","commit.gpgsign=false","commit","-m","fixture");
    const document={title:"Un guide",description:"Une description relue",summary:"Résumé",language:"fr",sections:[{heading:"Conseils",paragraphs:["table ".repeat(660)],sourceIds:["tok"]}],faq:[],links:[],sources:[{id:"tok",title:"TOK",url:"https://www.thetok.ch/",checkedAt:"2026-11-01T10:00:00Z"}]};
    const snapshot={article:{id:"a",slug:"guide-test",version:1,current_revision:1,approved_revision:1},revision:{article_id:"a",revision:1,profile_version:1,document},profileVersion:1};
    writeFileSync(privateInput,JSON.stringify(snapshot)); assert.notEqual(run().status,0);
    git("switch","-c","test/publication");const first=run();assert.equal(first.status,0,first.stderr);
    const initial=readFileSync(catalog,"utf8");assert.equal(JSON.parse(initial).length,1);assert.ok(!initial.includes("approved_revision"));
    assert.equal(run().status,0); assert.equal(readFileSync(catalog,"utf8"),initial);
    snapshot.revision.document.title="Conflit";writeFileSync(privateInput,JSON.stringify(snapshot));assert.notEqual(run().status,0);
    snapshot.article.approved_revision=null;writeFileSync(privateInput,JSON.stringify(snapshot));assert.notEqual(run().status,0);
    assert.equal(readFileSync(catalog,"utf8"),initial);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
