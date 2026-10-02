#!/usr/bin/env node
'use strict';
/**
 * crawl-rank1to500.js
 * 由 data/new-arrivals.json 抽 rank 1..500 嘅 item id，爬 detail 寫 jsonl
 * 用昨日 scripts/crawl-missing-by-id.js 同一個 fetcher/parser；輸出 tmp/new-import/rank1to500.jsonl
 */
const fs=require('node:fs');
const path=require('node:path');
const {fetchHtml,extractDescriptionFromDetailHtml}=require('./fetch-mzakka-description');
const {parseMzakkaDetailPage}=require('../utils/mzakkaNewItems');

const ROOT=path.join(__dirname,'..');
const NEW_ARR=JSON.parse(fs.readFileSync(path.join(ROOT,'data/new-arrivals.json'),'utf8'));
const OUT=path.join(ROOT,'tmp/new-import/rank1to500.jsonl');
const DELAY=Number(process.env.CRAWL_DELAY||600);
const LIMIT=Number(process.env.LIMIT||500);
const RETRIES=4;

function detailUrl(id){return `https://mzakka.com/pc/detail/item.php?item_id=${encodeURIComponent(id)}`;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchOne(id){
  const url=detailUrl(id);
  let last;
  for(let a=0;a<=RETRIES;a++){
    try{ const html=await fetchHtml(url,{label:`item ${id}`});
         return parseMzakkaDetailPage(html,{productUrl:url,extractDescription:extractDescriptionFromDetailHtml});
    }catch(e){ last=e; await sleep(Math.min(8000,500*Math.pow(2,a)));}
  }
  throw last;
}

(async()=>{
  const items=NEW_ARR.items.slice(0,LIMIT).map((id,i)=>({id:String(id),rank:i+1}));
  // de-dup against what we already crawled in this run
  const done=new Set();
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  const out=fs.createWriteStream(OUT,{flags:'w'});
  let ok=0,bad=0;
  const t0=Date.now();
  for(const it of items){
    if(done.has(it.id))continue;
    try{
      const r=await fetchOne(it.id);
      out.write(JSON.stringify({...r,newRank:it.rank})+'\n');
      ok++; done.add(it.id);
    }catch(e){
      console.log(`FAIL ${it.id}: ${String(e.message||e).slice(0,80)}`);
      bad++;
    }
    if(ok%25===0 && ok){
      const el=((Date.now()-t0)/1000).toFixed(0);
      console.log(`progress ${ok}/${items.length} fail=${bad} elapsed=${el}s`);
    }
    await sleep(DELAY);
  }
  out.end();
  console.log(`DONE total=${items.length} ok=${ok} fail=${bad} in ${((Date.now()-t0)/1000).toFixed(0)}s`);
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
