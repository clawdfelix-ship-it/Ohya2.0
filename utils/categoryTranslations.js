const CATEGORY_TRANSLATIONS = new Map([
  ['メーカー別', '按品牌'],
  ['タイプ・サイズ別', '類型・尺寸'],
  ['特徴・内部構造別', '特徵・內部構造'],
  ['素材別', '按素材'],
  ['パッケージタイプ別', '包裝類型'],
  ['二次元イラスト', '二次元插畫'],
  ['ヒダ系', '皺褶系'],
  ['イボ系', '顆粒系'],
  ['中型ホール', '中型飛機杯'],
  ['大型ホール', '大型飛機杯'],
  ['小型ホール', '小型飛機杯'],
  ['ミニホール', '迷你飛機杯'],
  ['カップホール', '杯型飛機杯'],
  ['電動ホール', '電動飛機杯'],
  ['イラスト系パッケージ', '插畫系包裝'],
]);

function normalizeCategoryName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function translateCategoryName(name) {
  const sourceName = normalizeCategoryName(name);
  const translatedName = CATEGORY_TRANSLATIONS.get(sourceName) || sourceName;
  return {
    sourceName,
    translatedName,
    didTranslate: Boolean(sourceName && translatedName !== sourceName),
  };
}

function resolveStorefrontCategoryName(name, nameZhHk) {
  const sourceName = normalizeCategoryName(name);
  const zhName = normalizeCategoryName(nameZhHk);

  if (zhName && zhName !== sourceName) {
    return zhName;
  }

  return translateCategoryName(sourceName).translatedName;
}

function shouldBackfillCategoryName(name, nameZhHk) {
  const sourceName = normalizeCategoryName(name);
  const zhName = normalizeCategoryName(nameZhHk);
  if (!sourceName) return false;

  const { didTranslate, translatedName } = translateCategoryName(sourceName);
  if (!didTranslate) return false;

  if (!zhName) return true;
  if (zhName === sourceName) return true;
  if (zhName === translatedName) return false;
  return false;
}

module.exports = {
  CATEGORY_TRANSLATIONS,
  normalizeCategoryName,
  translateCategoryName,
  resolveStorefrontCategoryName,
  shouldBackfillCategoryName,
};
