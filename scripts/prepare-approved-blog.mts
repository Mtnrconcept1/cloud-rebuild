import { execFileSync } from "node:child_process";
import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { approvedBlogEntry } from "../src/marketing/growth/blogExport.ts";

if (process.argv.length !== 3) throw new Error("Usage: node --experimental-strip-types scripts/prepare-approved-blog.mts RELEVE_PRIVE.json");
const git = (...args: string[]) => execFileSync("git",args,{encoding:"utf8"}).trim();
const branch = git("branch","--show-current");
if (!branch || ["main","master"].includes(branch)) throw new Error("Une branche de publication dédiée est requise.");
const origin = git("remote","get-url","origin");
if (!/^(?:https:\/\/github\.com\/|git@github\.com:)Mtnrconcept1\/cloud-rebuild(?:\.git)?$/i.test(origin)) throw new Error("Le dépôt cible doit être Mtnrconcept1/cloud-rebuild.");
const root = git("rev-parse","--show-toplevel");
const catalog = path.join(root,"src","content","blog.json");
const snapshot = JSON.parse(readFileSync(process.argv[2],"utf8"));
const today = new Intl.DateTimeFormat("sv-SE",{ timeZone:"Europe/Zurich" }).format(new Date());
const entry = approvedBlogEntry(snapshot.article,snapshot.revision,snapshot.profileVersion,today);
const lock = catalog+".publish-lock";
const lockFd = openSync(lock,"wx");
const temporary = catalog+".tmp-"+process.pid;
try {
  const articles = JSON.parse(readFileSync(catalog,"utf8"));
  const existing = articles.find((item: {slug:string}) => item.slug === entry.slug);
  if (existing) {
    // An existing URL, including a manual guide, is never silently overwritten.
    if (existing.title !== entry.title || existing.description !== entry.description || JSON.stringify(existing.blocks) !== JSON.stringify(entry.blocks))
      throw new Error("Ce slug existe avec un autre contenu. Préparer une révision explicite de la page.");
    console.log("Révision déjà présente pour "+entry.slug);
  } else {
    const dirty = git("-C",root,"status","--porcelain","--","src/content/blog.json");
    if (dirty) throw new Error("Le catalogue contient déjà des modifications. Les vérifier avant ajout.");
    writeFileSync(temporary,JSON.stringify([entry,...articles],null,2)+"\n",{flag:"wx"});
    renameSync(temporary,catalog);
    console.log("Entrée préparée sur "+branch+" : "+entry.slug);
  }
} finally {
  closeSync(lockFd); rmSync(lock,{force:true}); rmSync(temporary,{force:true});
}
