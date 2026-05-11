const test = require('node:test');
const assert = require('node:assert/strict');

test('cleanupGalleryImages: keeps only item/<SKU>/ images, dedupes, and caps to 12', () => {
  const { cleanupGalleryImages } = require('../scripts/cleanup-gallery-images');

  const imageUrl = 'https://i.mzakka.com/item/W9183/main.jpg';
  const gallery = [
    'https://i.mzakka.com/item/W9183/main.jpg',
    'https://i.mzakka.com/item/W9183/W9183-01-670x.jpg',
    'https://i.mzakka.com/item/W9183/W9183-02-670x.jpg',
    'https://i.mzakka.com/h1.png',
    'https://i.mzakka.com/bn_head.png',
    'https://i.mzakka.com/item/W9184/list.jpg',
    'https://i.mzakka.com/item/W9183/W9183-03-670x.jpg',
    'https://i.mzakka.com/item/W9183/W9183-04-670x.jpg',
    'https://i.mzakka.com/item/W9183/W9183-04-670x.jpg',
  ];

  const out = cleanupGalleryImages({ imageUrl, galleryImages: gallery, maxImages: 12 });
  assert.deepEqual(out, [
    'https://i.mzakka.com/item/W9183/main.jpg',
    'https://i.mzakka.com/item/W9183/W9183-01-670x.jpg',
    'https://i.mzakka.com/item/W9183/W9183-02-670x.jpg',
    'https://i.mzakka.com/item/W9183/W9183-03-670x.jpg',
    'https://i.mzakka.com/item/W9183/W9183-04-670x.jpg',
  ]);
});

test('cleanupGalleryImages: falls back to [imageUrl] when prefix cannot be extracted', () => {
  const { cleanupGalleryImages } = require('../scripts/cleanup-gallery-images');
  const out = cleanupGalleryImages({
    imageUrl: 'https://i.mzakka.com/imgs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
    galleryImages: ['https://i.mzakka.com/h1.png'],
    maxImages: 12,
  });
  assert.deepEqual(out, ['https://i.mzakka.com/imgs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg']);
});

test('cleanup gallery script: parses args', () => {
  const { parseArgs } = require('../scripts/cleanup-gallery-images');
  const args = parseArgs(['node', 'script', '--dry-run', '--limit', '50', '--max-images', '12', '--sample', '3']);
  assert.deepEqual(args, { dryRun: true, limit: 50, maxImages: 12, sample: 3 });
});

