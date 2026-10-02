#!/usr/bin/env node
'use strict';
/**
 * lean-import-missing.js
 * 精簡導入 missing-items.jsonl -> Neon（直連，非 pooler）。
 * - 每件：upsert product / sku，media 與 sections 各用單一多行 INSERT
 * - 每 COMMIT_EVERY 件提交一次；進度寫 log，可中斷重跑（全 upsert/冧插安全）
 * - 停產商品都入（前端過濾），但 status 設 active；售完由 stock=0 反映
 */
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const {
  toProductUpsertInput,toProductMediaRows,toProductSectionRows,toSkuUpsertInput,
}=require('../utils/mzakkaImport');
const {resolveItemNode,loadDbNodeMap}=require('../utils/mzakkaCategoryResolver');

const ROOT=path.join(__dirname,'..');
const FILE=path.join(ROOT,'tmp/new-import/missing-items.jsonl');
const url=(process.env.DATABASE_URL||'').trim();
const useSsl=/sslmode=(require|verify-ca|verify-full)/i.test(url);
const COMMIT_EVERY=Number(process.env.COMMIT_EVERY||5);
const START=Number(process.env.START_AT||0);

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const items=fs.readFileSync(FILE,'utf8').trim().split('\n').map(JSON.parse);
  const pool=new Pool({connectionString:url,ssl:useSsl?{rejectUnauthorized:false}:false,max:1});
  const dbNodeMap=await loadDbNodeMap(pool);

  async function importOne(client,item){
    const {nodeId}=resolveItemNode(item);
    const categoryId=nodeId!=null ? (dbNodeMap.get(nodeId)||null) : null;
    const p=toProductUpsertInput(item,categoryId);
    const pr=await client.query(
      `INSERT INTO products
       (name,name_zh_hk,slug,description,description_zh_hk,short_description_zh_hk,
        price,original_price,category_id,image_url,gallery_images,status,
        source,source_key,source_url,sync_status,raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::json,$12,$13,$14,$15,$16,$17::json)
       ON CONFLICT (slug) DO UPDATE SET
         name=EXCLUDED.name,name_zh_hk=EXCLUDED.name_zh_hk,
         description=EXCLUDED.description,description_zh_hk=EXCLUDED.description_zh_hk,
         price=EXCLUDED.price,original_price=EXCLUDED.original_price,
         category_id=COALESCE(EXCLUDED.category_id, products.category_id),
         image_url=EXCLUDED.image_url,gallery_images=EXCLUDED.gallery_images,
         source_url=EXCLUDED.source_url,raw_payload=EXCLUDED.raw_payload,
         status='active',updated_at=NOW()
       RETURNING id`,
      [p.name,p.name_zh_hk,p.slug,p.description,p.description_zh_hk,p.short_description_zh_hk,
       p.price,p.original_price,p.category_id,p.image_url,JSON.stringify(p.gallery_images||[]),
       p.status,p.source,p.source_key,p.source_url,p.sync_status,JSON.stringify(p.raw_payload||{})]);
    const pid=pr.rows[0].id;

    const s=toSkuUpsertInput(item,pid);
    await client.query(
      `INSERT INTO product_skus(product_id,sku,attributes,stock,is_active)
       VALUES($1,$2,$3::json,$4,$5)
       ON CONFLICT(sku) DO UPDATE SET product_id=EXCLUDED.product_id,
         attributes=EXCLUDED.attributes,stock=EXCLUDED.stock,is_active=EXCLUDED.is_active,
         updated_at=NOW()`,
      [s.product_id,s.sku,JSON.stringify(s.attributes),s.stock,s.is_active]);

    const media=toProductMediaRows(item,pid);
    await client.query('DELETE FROM mzakka_product_media WHERE product_id=$1',[pid]);
    if(media.length){
      const ph=media.map((_,j)=>`($${j*6+1},$${j*6+2},$${j*6+3},$${j*6+4},$${j*6+5},$${j*6+6})`).join(',');
      const ap=[];media.forEach(m=>ap.push(m.product_id,m.media_url,m.media_type,m.alt_text,m.sort_order,m.source_key));
      await client.query(
        `INSERT INTO mzakka_product_media(product_id,media_url,media_type,alt_text,sort_order,source_key) VALUES ${ph}`,ap);
    }

    const secs=toProductSectionRows(item,pid);
    await client.query('DELETE FROM mzakka_product_sections WHERE product_id=$1',[pid]);
    if(secs.length){
      const ph=secs.map((_,j)=>`($${j*8+1},$${j*8+2},$${j*8+3},$${j*8+4},$${j*8+5},$${j*8+6},$${j*8+7}::json,$${j*8+8})`).join(',');
      const ap=[];secs.forEach(x=>ap.push(x.product_id,x.section_type,x.title,x.sort_order,x.content_html,x.content_text,x.content_json?JSON.stringify(x.content_json):null,x.source_anchor));
      await client.query(
        `INSERT INTO mzakka_product_sections(product_id,section_type,title,sort_order,content_html,content_text,content_json,source_anchor) VALUES ${ph}`,ap);
    }
  }

  const client=await pool.connect();
  const t0=Date.now();let done=0;
  for(let i=START;i<items.length;i++){
    // retry whole item a few times
    for(let a=0;a<4;a++){
      try{ await importOne(client,items[i]); break;}
      catch(e){
        try{await client.query('ROLLBACK');}catch{}
        if(a===3){console.log(`FAIL item ${items[i].id}: ${String(e.message||e).slice(0,120)}`);}
        await sleep(800*(a+1));
      }
    }
    done++;
    if(done%COMMIT_EVERY===0){ await client.query('COMMIT'); }
    if(done%25===0){
      const el=((Date.now()-t0)/1000).toFixed(0);
      const rate=(done/(Date.now()-t0)*1000).toFixed(2);
      console.log(`${i+1}/${items.length} imported (${done}) elapsed=${el}s rate=${rate}/s`);
    }
  }
  await client.query('COMMIT').catch(()=>{});
  client.release();await pool.end();
  console.log(`DONE imported=${done} in ${((Date.now()-t0)/1000).toFixed(0)}s`);
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
