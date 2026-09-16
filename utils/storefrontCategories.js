function buildCategoryTree(rows = [], { includeAll = true, totalCount = 0 } = {}) {
  const roots = [];
  const flat = [];

  if (includeAll) {
    flat.push({
      id: 0,
      slug: 'all',
      name: '全部商品',
      count: Number(totalCount || 0),
      children: [],
    });
  }

  for (const row of rows) {
    const root = {
      id: Number(row.id),
      slug: String(row.slug),
      name: String(row.name),
      count: Number(row.count || 0),
      children: Array.isArray(row.children)
        ? row.children.map((child) => ({
            id: Number(child.id),
            slug: String(child.slug),
            name: String(child.name),
            count: Number(child.count || 0),
          }))
        : [],
    };
    roots.push(root);
    flat.push({
      id: root.id,
      slug: root.slug,
      name: root.name,
      count: root.count,
    });
    for (const child of root.children) {
      flat.push({
        id: child.id,
        slug: child.slug,
        name: `${root.name} / ${child.name}`,
        count: child.count,
        parentSlug: root.slug,
      });
    }
  }

  return {
    flat,
    tree: roots,
  };
}

module.exports = {
  buildCategoryTree,
};
