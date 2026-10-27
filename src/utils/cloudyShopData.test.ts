import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUDY_SHOP_CONTACTS,
  CLOUDY_SHOP_INVENTORY,
  CLOUDY_SHOP_SOURCE_FILE,
} from '../data/cloudyShopData';

test('Cloudy Shop source data is clean by default', () => {
  assert.equal(CLOUDY_SHOP_SOURCE_FILE, '');
  assert.equal(CLOUDY_SHOP_INVENTORY.length, 0);
  assert.equal(CLOUDY_SHOP_CONTACTS.length, 0);
  assert.equal(
    CLOUDY_SHOP_INVENTORY.reduce((total, item) => total + item.stockQty, 0),
    0
  );
  assert.equal(
    CLOUDY_SHOP_INVENTORY.reduce(
      (total, item) => total + item.stockQty * item.valuationRate,
      0
    ),
    0
  );
});
