#!/usr/bin/env node
'use strict';
/**
 * attach-new-items-to-storefront.js
 * 為新 import 件產品 upsert product_storefront，source = storefront_category_map。
 * 直接查 map (mzakka_category_id -> storefront_category_id)；支援一對多。
 * 每 100 件 commit 一次；中斷安全（INSERT ... WHERE NOT EXISTS）。
 */
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');

const url=(process.env.DATABASE_URL||'').trim();
const useSsl=/sslmode=(require|verify-ca|verify-full)/i.test(url);

(async()=>{
  const pool=new Pool({connectionString:url,ssl:useSsl?{rejectUnauthorized:false}:false,max:1});
  const client=await pool.connect();
  const t0=Date.now();

  // pull new items + pre-existing that lost ps
  const ids=fs.readFileSync(path.join(__dirname,'..','tmp/new-import/missing-items.jsonl'),'utf8')
    .trim().split('\n').map(JSON.parse);
  const slugs=ids.map(it=>'mzakka-'+String(it.id).toLowerCase());
  const {rows: need} = await client.query(`
    SELECT id, category_id FROM products
    WHERE category_id IS NOT NULL
      AND (slug = ANY($1::text[])
           OR NOT EXISTS (SELECT 1 FROM product_storefront ps WHERE ps.product_id=products.id))
      AND source='mzakka'
  `,[slugs]);
  console.log('candidates:', need.length);

  let done=0, fail=0, noMap=0;
  const noMapCats=new Set();
  for(let i=0;i<need.length;i++){
    const p=need[i];
    const {rows: ms} = await client.query(
      `SELECT storefront_category_id FROM storefront_category_map WHERE mzakka_category_id=$1`,
      [p.category_id]);
    if(!ms.length){ noMap++; noMapCats.add(p.category_id); continue; }
    for(let a=0;a<3;a++){
      try{ await client.query('BEGIN');
        for(const m of ms){
          await client.query(`UPDATE products SET updated_at=NOW() WHERE id=$1`,[p.id]);
          await client.query(`INSERT INTO product_storefront(product_id,storefront_category_id)
                              SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM product_storefront WHERE product_id=$1 AND storefront_category_id=$2)`,
            [p.id, m.storefront_category_id]);
        }
        await client.query('COMMIT'); done++; break;
      }catch(e){
        try{await client.query('ROLLBACK');}catch{}
        if(a===2){fail++;console.log('FAIL',p.id,e.message.slice(0,80));}
        await new Promise(r=>setTimeout(r,500*(a+1)));
      }
    }
    if(done%200===0&&done) console.log(done+'/'+need.length, ((Date.now()-t0)/1000).toFixed(0)+'s');
  }
  await client.query('COMMIT').catch(()=>{});
  client.release();await pool.end();
  console.log(`DONE attached=${done} fail=${fail} noMap=${noMap} unique_noMapCats=${noMapCats.size}`);
  if(noMapCats.size && noMapCats.size<30) console.log('noMap cats:', [...noMapCats].sort((a,b)=>a-b));
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
