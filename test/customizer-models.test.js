const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeTemplateZone, validateRosterItems } = require('../utils/customizer/validation');
const { buildDesignSession } = require('../models/customizer/sessions');

test('customizer migration defines core session and registry tables', () => {
  const migrationPath = path.join(__dirname, '..', 'migrations', '20261015_customizer_phase1.sql');
  assert.ok(fs.existsSync(migrationPath));
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_product_types/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_templates/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_template_zones/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_sessions/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_session_designs/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_session_previews/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_rosters/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_pricing_rules/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_quote_requests/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+customizer_order_drafts/i);
});

test('customizer seed migration defines starter catalog and pricing rules', () => {
  const migrationPath = path.join(__dirname, '..', 'migrations', '20261015_customizer_seed.sql');
  assert.ok(fs.existsSync(migrationPath));
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /football-home/);
  assert.match(sql, /polo-blank/);
  assert.match(sql, /Customizer Base Unit/);
});

test('normalizeTemplateZone fills defaults and maps snake_case fields', () => {
  const zone = normalizeTemplateZone({
    zone_key: 'front-body',
    zone_name: 'Front Body',
    sort_order: 4,
    allow_logo: true,
  });

  assert.equal(zone.zoneKey, 'front-body');
  assert.equal(zone.zoneName, 'Front Body');
  assert.equal(zone.sortOrder, 4);
  assert.equal(zone.allowColor, true);
  assert.equal(zone.allowLogo, true);
  assert.equal(zone.allowPattern, false);
  assert.equal(zone.allowText, false);
});

test('buildDesignSession returns stable session-first shape', () => {
  const session = buildDesignSession({
    selection: { productTypeId: 1, templateId: 2 },
    design: {
      zones: [{ zoneKey: 'front-body', color: '#ffffff' }],
      texts: { teamName: 'Rovers' },
    },
    roster: { items: [] },
  });

  assert.equal(session.status, 'draft');
  assert.equal(session.selection.productTypeId, 1);
  assert.equal(session.selection.templateId, 2);
  assert.equal(session.design.zones.length, 1);
  assert.equal(session.design.texts.teamName, 'Rovers');
  assert.deepEqual(session.uploadedAssets, []);
});

test('validateRosterItems normalizes valid rows and reports total quantity', () => {
  const result = validateRosterItems([
    { player_name: 'Chan', player_number: '7', size_code: 'm' },
    { playerName: 'Lee', playerNumber: '10', sizeCode: 'L', quantity: 2 },
  ]);

  assert.equal(result.valid, true);
  assert.equal(result.normalizedItems[0].sizeCode, 'M');
  assert.equal(result.totalQuantity, 3);
});

test('validateRosterItems reports required field errors', () => {
  const result = validateRosterItems([{ playerName: '', playerNumber: '', sizeCode: '' }]);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 3);
});
