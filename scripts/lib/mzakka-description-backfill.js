'use strict';

function isLiveIdMismatch(product, record) {
  return String(record.id || '').trim() !== String(product.source_key || '').trim();
}

function hasCompleteNarrative(record) {
  return Array.isArray(record.sections)
    && record.sections.some((section) => section && section.sourceAnchor === 'item_info');
}

function selectDescriptionCandidates(products, completedIds = new Set()) {
  return products.filter((product) => (
    product.source_url
    && (!product.raw_payload || product.raw_payload.descriptionVersion !== 'mzakka-description-v2')
  ));
}

function recordFailureAttempts(failures, attempts, skippedIds, countedIds = new Set(), maxAttempts = 3) {
  for (const failure of failures) {
    const id = String(failure.id || '');
    if (!id || countedIds.has(id)) continue;
    countedIds.add(id);
    const count = (Number(attempts[id]) || 0) + 1;
    attempts[id] = count;
    if (/detail ID mismatch/.test(String(failure.error || '')) || count >= maxAttempts) {
      skippedIds.add(id);
    }
  }
}

async function runDescriptionBackfill({
  products,
  fetchDetail,
  upload,
  persist = () => {},
  completedIds = new Set(),
  concurrency = 3,
  delayMs = 250,
  limit = 100,
  logger = console,
}) {
  const pending = selectDescriptionCandidates(products, completedIds);
  const parsedLimit = Number(limit);
  const batchLimit = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 100)
    : 100;
  const selected = pending.slice(0, batchLimit);
  const summary = {
    status: 'running',
    candidates: pending.length,
    selected: selected.length,
    fetched: 0,
    imported: 0,
    unchanged: 0,
    idMismatch: 0,
    failed: 0,
    failures: [],
  };
  let cursor = 0;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function worker() {
    while (cursor < selected.length) {
      const product = selected[cursor++];
      const id = String(product.source_key);
      try {
        const item = await fetchDetail(product);
        if (isLiveIdMismatch(product, item)) {
          summary.idMismatch++;
          summary.failures.push({ id, error: `detail ID mismatch: got ${item.id || '(none)'}` });
        } else {
          item.descriptionVersion = 'mzakka-description-v2';
          item.descriptionLayout = hasCompleteNarrative(item) ? 'modern-heading' : 'legacy';
          const result = await upload([item]);
          if (Number(result.productsUpserted) !== 1) {
            throw new Error(`expected 1 upsert, got ${result.productsUpserted}`);
          }
          completedIds.add(id);
          summary.fetched++;
          summary.imported += Number(result.productsUpserted);
          if (item.description === product.description_zh_hk) summary.unchanged++;
        }
      } catch (error) {
        summary.failed++;
        summary.failures.push({ id, error: String((error && error.message) || error) });
      }
      await persist(summary, completedIds);
      if (summary.fetched % 100 === 0 && summary.fetched > 0) {
        logger.log(`DESCRIPTION_BACKFILL ${JSON.stringify({ ...summary, failures: summary.failures.length })}`);
      }
      if (delayMs) await sleep(delayMs);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  summary.status = summary.failed || summary.idMismatch ? 'completed-with-failures' : 'completed';
  await persist(summary, completedIds);
  return summary;
}

module.exports = {
  hasCompleteNarrative,
  isLiveIdMismatch,
  recordFailureAttempts,
  runDescriptionBackfill,
  selectDescriptionCandidates,
};
