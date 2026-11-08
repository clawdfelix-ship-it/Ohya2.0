'use strict';

/**
 * Bounded, resumable crawl. `seen` is only for new-item discovery; refresh must
 * revisit known IDs and include ended items so the importer can deactivate them.
 * `knownIds` comes from the database, not the local discovery cache.
 */
async function runSyncAllCategories({
  leaves,
  state,
  seen,
  knownIds = seen,
  crawl,
  upload,
  persist = () => {},
  logger = console,
  batchSize = 15,
  refreshExisting = false,
  includeEnded = false,
  delayMs = 120,
  startLeaf = null,
  now = new Date(),
  dryRun = false,
  maxLeaves = 0,
  maxPagesPerLeaf = 0,
  limit = 0,
}) {
  if (!Array.isArray(leaves) || !leaves.length) throw new Error('No leaf categories configured');
  const summary = {
    status: dryRun ? 'dry-run' : 'running',
    mode: refreshExisting ? 'refresh' : 'discovery',
    startedAt: now.toISOString(),
    categoriesCompleted: 0,
    itemsListed: 0,
    submitted: 0,
    refreshed: 0,
    skippedFailed: 0,
    skippedUnknownEnded: 0,
    productsUpserted: 0,
  };
  const pending = [];
  const resumePage = Number(state.lastPage) || 0;
  const save = () => {
    if (!dryRun) persist(state, seen, summary);
  };

  async function flush() {
    if (!pending.length || dryRun) return;
    const batch = pending.slice(0, batchSize);
    // Keep pending records until upload succeeds. A failed batch must not be
    // marked as seen, otherwise retry would permanently skip those products.
    const result = await upload(batch);
    pending.splice(0, batch.length);
    summary.submitted += batch.length;
    summary.productsUpserted += Number(result.productsUpserted) || 0;
    if (summary.mode === 'refresh') summary.refreshed += batch.length;
    else {
      state.totalNew = (Number(state.totalNew) || 0) + batch.length;
      for (const record of batch) if (record.id) seen.add(String(record.id));
    }
    state.totalUploaded = (Number(state.totalUploaded) || 0) + batch.length;
  }

  // A legacy completed state contains the final index and all leaf IDs. Treat
  // it as a new cycle, not an instruction to crawl the last category forever.
  const completed = state.done.length >= leaves.length
    && (!state.lastPage || state.lastPage === 0);
  let startIndex = completed ? 0 : Math.max(0, Number(state.leafIndex) || 0);
  if (startLeaf != null) startIndex = Number(startLeaf);
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= leaves.length) startIndex = 0;
  if (startIndex === 0 && !resumePage && !dryRun) state.done = [];
  const endIndex = maxLeaves ? Math.min(leaves.length, startIndex + maxLeaves) : leaves.length;

  try {
    for (let index = startIndex; index < endIndex; index++) {
      const leaf = leaves[index];
      if (!dryRun) state.leafIndex = index;
      let page = index === startIndex && resumePage ? resumePage + 1 : 1;
      let pagesFetched = 0;
      let leafCompleted = false;
      logger.log(`=== ${summary.mode} leaf ${index + 1}/${leaves.length} id=${leaf.id} (page ${page}) ===`);

      while (true) {
        const result = await crawl({
          categoryId: leaf.id,
          startPage: page,
          pages: 1,
          limit,
          delayMs,
          includeEnded: refreshExisting || includeEnded,
          seenIds: refreshExisting ? new Set() : seen,
        });
        summary.itemsListed += Number(result.listItemsSeen) || 0;
        summary.skippedFailed += Number(result.skippedFailed) || 0;
        const records = limit ? (result.records || []).slice(0, limit) : (result.records || []);
        for (const record of records) {
          if (refreshExisting && record.isEnded && !knownIds.has(String(record.id || ''))) {
            summary.skippedUnknownEnded++;
            continue;
          }
          pending.push(record);
          if (pending.length >= batchSize) await flush();
        }
        // Persist only after every fetched record is durably accepted upstream.
        await flush();
        if (!dryRun) state.lastPage = page;
        save();
        logger.log(`  page ${page}/${result.totalPages} listed=${result.listItemsSeen} records=${records.length} failed=${result.skippedFailed}`);
        pagesFetched++;
        if (maxPagesPerLeaf && pagesFetched >= maxPagesPerLeaf) break;
        if (result.totalPages != null && page >= result.totalPages) leafCompleted = true;
        if (!result.listItemsSeen) leafCompleted = true;
        if (leafCompleted) break;
        page++;
      }

      if (!dryRun && leafCompleted) {
        if (!state.done.includes(leaf.id)) state.done.push(leaf.id);
        state.lastPage = 0;
      }
      if (!dryRun && leafCompleted) {
        summary.categoriesCompleted++;
        save();
      }
    }

    const allCompleted = endIndex >= leaves.length && state.done.length >= leaves.length;
    if (!dryRun && allCompleted) {
      state.leafIndex = 0;
      state.lastPage = 0;
      state.done = [];
      if (refreshExisting) state.lastRefreshAt = now.toISOString();
      else state.lastDiscoveryAt = now.toISOString();
      summary.status = 'completed';
    } else if (!dryRun) {
      state.leafIndex = state.lastPage ? startIndex : endIndex;
      summary.status = 'paused';
    }
    save();
    return summary;
  } catch (error) {
    summary.status = dryRun ? 'dry-run-failed' : 'failed';
    summary.error = String((error && error.message) || error);
    save();
    throw error;
  }
}

module.exports = { runSyncAllCategories };
