'use strict';                  

const app = require('../../app'); 
const models = require('../../models');
const fixtures = require('pow-mongoose-fixtures');

const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001; 
Browser.localhost('example.com', PORT);

describe('cart', () => {

  let browser;

  afterEach((done) => {
    models.dropDatabase(() => {
      done();
    });
  });

  describe('when cart is empty', () => {
    beforeEach((done) => {
      browser = new Browser({ waitDuration: '30s', loadCss: false });

      browser.visit('/cart', (err) => {
        if (err) done.fail(err);
        browser.assert.success();
        done();
      });
    });

    it('displays a no-products-in-cart message', () => {
      browser.assert.text('p.alert.alert-info', 'Your cart is empty');
    });
  });

  describe('when cart contains products', () => {
    let products;

    beforeEach((done) => {
      browser = new Browser({ waitDuration: '30s', loadCss: false });

      fixtures.load(__dirname + '/../fixtures/products.js', models.mongoose, (err) => {
        if (err) done.fail(err);

        models.Product.find({}).then((results) => {
          products = results;

          browser.visit('/', (err) => {
            if (err) done.fail(err);

            browser.pressButton('li.product:nth-child(1) form div button[type=submit]', () => {

              browser.visit('/', (err) => {
                if (err) done.fail(err);

                browser.pressButton('li.product:nth-child(2) form div button[type=submit]', () => {
                  browser.assert.redirected();
                  browser.assert.url('/cart');
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('displays the products in the cart', () => {
      browser.assert.elements('tr', 3);

      browser.assert.element(`tr:nth-child(1) td a[href="/cart/remove/${products[0].id}"]`);
      browser.assert.element(`tr:nth-child(1) td.product-thumb img[src="/images/products/${products[0].image}"]`);
      browser.assert.text('tr:nth-child(1) td:nth-child(3)', products[0].name);
      browser.assert.text('tr:nth-child(1) td:nth-child(4)', products[0].price);
      browser.assert.element(`tr:nth-child(1) td:nth-child(5) input[type=hidden][value="${products[0].id}"]`);

      browser.assert.element(`tr:nth-child(2) td a[href="/cart/remove/${products[1].id}"]`);
      browser.assert.element(`tr:nth-child(2) td.product-thumb img[src="/images/products/${products[1].image}"]`);
      browser.assert.text('tr:nth-child(2) td:nth-child(3)', products[1].name);
      browser.assert.text('tr:nth-child(2) td:nth-child(4)', products[1].price);
      browser.assert.element(`tr:nth-child(2) td:nth-child(5) input[type=hidden][value="${products[1].id}"]`);

      browser.assert.text('tr.info', `Total: ${products[0].price * 2}`);
    });
  });
});