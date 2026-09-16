function getFallbackCenterModules() {
  return [
    { title: '新貨入荷：最新上架商品', subtitle: '即刻睇吓新上架有咩值得入手', href: '/products?page=1', image_url: '/assets/mzakka/banners/214x78.jpg' },
    { title: '人氣熱選：精選分類推薦', subtitle: '由【商品分類】開始搵你想要嘅類型', href: '/products?page=1', image_url: '/assets/mzakka/banners/M_zakka_214x78.jpg' },
    { title: '會員服務：快速登入/註冊', subtitle: '建立帳戶後更方便追蹤同管理訂單', href: '/login', image_url: '/assets/mzakka/banners/214_78(1).png' },
  ];
}

function partitionHomeModules(modules = []) {
  const clean = (Array.isArray(modules) ? modules : [])
    .filter(Boolean)
    .map((module, index) => ({
      key: module.module_key || module.moduleKey || `module-${index}`,
      type: module.module_type || module.moduleType || 'banner',
      title: module.title || null,
      subtitle: module.subtitle || null,
      href: module.target_url || module.targetUrl || '/products?page=1',
      image_url: module.image_url || module.imageUrl || null,
      sort_order: Number(module.sort_order != null ? module.sort_order : module.sortOrder || index),
      payload: module.payload_json || module.payload || null,
    }))
    .filter((module) => module.image_url);

  const ordered = clean.slice().sort((a, b) => a.sort_order - b.sort_order);
  const center = ordered.slice(0, 3);
  const left = ordered.slice(3, 5);
  const right = ordered.slice(5, 6);

  return {
    all: ordered,
    center: center.length ? center : getFallbackCenterModules(),
    left,
    right,
  };
}

module.exports = {
  getFallbackCenterModules,
  partitionHomeModules,
};
