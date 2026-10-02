#!/usr/bin/env node
'use strict';
/**
 * crawl-missing-by-id.js
 * 按 missing.json（{id,rank}）逐件爬 mzakka detail 頁，append 入 jsonl。
 * - 可中斷重跑：已喺輸出檔嘅 id 自動跳過
 * - 單件失敗重試若干次後記入 fail 檔並跳過，唔殺死全程
 * - 含停產商品（前端自己過濾販売終了）
 */
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {fetchHtml,extractDescriptionFromDetailHtml}=require('../scripts/fetch-mzakka-description');
const {parseMzakkaDetailPage}=require('../utils/mzakkaNewItems');

const ROOT=path.join(__dirname,'..');
const MISSING=path.join(ROOT,'tmp/new-import/missing.json');
const OUT=path.join(ROOT,'tmp/new-import/missing-items.jsonl');
const FAIL=path.join(ROOT,'tmp/new-import/missing-failed.jsonl');
const DELAY=Number(process.env.CRAWL_DELAY||700);
const RETRIES=4;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function detailUrl(id){return `https://mzakka.com/pc/detail/item.php?item_id=${encodeURIComponent(id)}`;}

async function loadDone(){
  const done=new Set();
  for(const f of [OUT]){
    if(!fs.existsSync(f))continue;
    const rl=readline.createInterface({input:fs.createReadStream(f),crlfDelay:Infinity});
    for await(const line of rl){if(!line.trim())continue;try{const o=JSON.parse(line);if(o.id)done.add(String(o.id));}catch{}}
    rl.close();
  }
  return done;
}
async function crawlOne(id){
  const url=detailUrl(id);
  let lastErr;
  for(let a=0;a<=RETRIES;a++){
    try{
      const html=await fetchHtml(url,{label:`item ${id}`});
      const it=parseMzakkaDetailPage(html,{productUrl:url,extractDescription:extractDescriptionFromDetailHtml});
      return it;
    }catch(e){
      lastErr=e;
      await sleep(Math.min(8000,500*Math.pow(2,a)));
    }
  }
  throw lastErr;
}

(async()=>{
  const missing=JSON.parse(fs.readFileSync(MISSING,'utf8'));
  const done=await loadDone();
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  const out=fs.createWriteStream(OUT,{flags:'a'});
  const fail=fs.createWriteStream(FAIL,{flags:'a'});
  let ok=0,skip=0,bad=0,n=0;
  const t0=Date.now();
  for(const m of missing){
    n++;
    if(done.has(String(m.id))){skip++;continue;}
    let it;
    try{ it=await crawlOne(m.id);}catch(e){
      fail.write(JSON.stringify({id:m.id,rank:m.rank,error:String(e.message||e)})+'\n');
      bad++;
    }
    if(it){
      out.write(JSON.stringify({...it, newRank:m.rank})+'\n');
      ok++;
    }
    if(n%50===0){
      const el=((Date.now()-t0)/1000).toFixed(0);
      console.log(`progress ${n}/${missing.length} crawled_ok=${ok} failed=${bad} cached=${skip} elapsed=${el}s`);
    }
    await sleep(DELAY);
  }
  out.end();fail.end();
  console.log(`DONE total=${missing.length} ok=${ok} fail=${bad} cached=${skip}`);
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
