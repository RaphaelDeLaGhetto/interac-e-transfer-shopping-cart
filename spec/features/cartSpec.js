'use strict';                  

const app = require('../../app'); 
const models = require('../../models');
const mailer = require('../../mailer');
const fixtures = require('pow-mongoose-fixtures');
const currencyFormatter = require('currency-formatter');
const path = require('path');

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

  it('adds a session containing an empty cart on first visit', (done) => {
    browser = new Browser({ waitDuration: '30s', loadCss: false });

    models.collection('sessions').count({}, (err, results) => {
      if (err) {
        done.fail(err);
      }
      expect(results).toEqual(0);
      browser.visit('/cart', (err) => {
        if (err) {
          done.fail(err);
        }
        models.collection('sessions').find({}).toArray((err, results) => {
          if (err) {
            done.fail(err);
          }
          expect(results.length).toEqual(1);
          expect(results[0]._id).not.toBe(undefined);
          expect(results[0].session).not.toBe(undefined);
          expect(results[0].session.cookie).not.toBe(undefined);
          expect(results[0].session.cart).not.toBe(undefined);
          expect(results[0].session.cart.items).toEqual([]);
          expect(results[0].session.cart.total).toEqual(0);
          expect(results[0].expires).not.toBe(undefined);
          done();
        });
      });
    });
  });

  describe('when cart is empty', () => {
    beforeEach((done) => {
      browser = new Browser({ waitDuration: '30s', loadCss: false });

      browser.visit('/', (err) => {
        if (err) done.fail(err);

        fixtures.load(__dirname + '/../fixtures/products.js', models.mongoose, (err) => {
          if (err) done.fail(err);

          browser.visit('/', (err) => {
            if (err) done.fail(err);
            browser.clickLink('Checkout', (err) => {
              if (err) done.fail(err);
              browser.assert.success();
              done();
            });
          });
        });
      });
    });

    it('displays a no-products-in-cart message', () => {
      browser.assert.text('p.alert.alert-info', 'Your cart is empty');
    });

    it('displays a continue-shopping message', () => {
      browser.assert.link('.navbar-header a.navbar-brand', 'Continue shopping', '/');
      browser.assert.elements('i.fa.fa-shopping-cart.go-to-cart-lnk', 0);
    });

    it('does not display an order form', () => {
      browser.assert.elements('form', 0);
    });
  });

  describe('when cart contains products', () => {
    let products;

    beforeEach((done) => {
      browser = new Browser({ waitDuration: '30s', loadCss: false });

      fixtures.load(__dirname + '/../fixtures/products.js', models.mongoose, (err) => {
        if (err) done.fail(err);

        models.Product.find({}).sort('createdAt').then((results) => {
          products = results;

          browser.visit('/', (err) => {
            if (err) done.fail(err);
            browser.assert.success();

            browser.pressButton('li.product:nth-child(1) form button[type=submit]', (err) => {
              if (err) done.fail(err);

              browser.visit('/', (err) => {
                if (err) done.fail(err);

                browser.pressButton('li.product:nth-child(2) form button[type=submit]', (err) => {
                  if (err) done.fail(err);
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

      browser.assert.element(`tr:nth-child(1) td a[href="/cart/remove/${products[0].id}/${products[0].options[0]}"]`);
      browser.assert.element(`tr:nth-child(1) td.product-thumb img[src="/images/products/${products[0].images[0]}"]`);
      browser.assert.text('tr:nth-child(1) td:nth-child(3)', `${products[0].name} - ${products[0].options[0]}`);
      browser.assert.text('tr:nth-child(1) td:nth-child(4)', products[0].formattedPrice);

      browser.assert.element(`tr:nth-child(2) td a[href="/cart/remove/${products[1].id}"]`);
      browser.assert.element(`tr:nth-child(2) td.product-thumb img[src="/images/products/${products[1].images[0]}"]`);
      browser.assert.text('tr:nth-child(2) td:nth-child(3)', products[1].name);
      browser.assert.text('tr:nth-child(2) td:nth-child(4)', products[1].formattedPrice);

      browser.assert.text('tr.info', `${currencyFormatter.format(products[0].price * 2, { code: 'CAD' })}`);
    });

    it('displays product variants in the cart', (done) => {
      browser.visit('/', (err) => {
        if (err) done.fail(err);

        browser
        .select('li.product:nth-child(1) form select', products[0].options[2])
        .pressButton('li.product:nth-child(1) form button[type=submit]', () => {
          browser.assert.redirected();
          browser.assert.url('/cart');
 
          browser.assert.elements('tr', 4);
    
          browser.assert.text('tr:nth-child(1) td:nth-child(3)', `${products[0].name} - ${products[0].options[0]}`);
          browser.assert.text('tr:nth-child(2) td:nth-child(3)', products[1].name);
          browser.assert.text('tr:nth-child(3) td:nth-child(3)', `${products[0].name} - ${products[0].options[2]}`);

          done();
        });
      });
    });

    /* See `checkoutCustomerSpec.js` for relevant coverage */
    it('displays an order submission form', () => {
      browser.assert.element('form.form-horizontal[action="/cart/checkout"]');
    });


    describe('removing item from cart', () => {

      it('removes the item from the session cart', (done) => {
        models.collection('sessions').find({}).toArray((err, results) => {
          if (err) {
            done.fail(err);
          }
          expect(results.length).toEqual(1);
          expect(results[0].session.cart.items.length).toEqual(2);
          expect(results[0].session.cart.total).toEqual(products[0].price * 2);

          browser.clickLink(`tr:nth-child(2) td a[href="/cart/remove/${products[1].id}"]`, () => {
            models.collection('sessions').find({}).toArray((err, results) => {
              if (err) {
                done.fail(err);
              }
              expect(results.length).toEqual(1);
              expect(results[0].session.cart.items.length).toEqual(1);
              expect(results[0].session.cart.total).toEqual(products[0].price);
              expect(results[0].session.cart.items[0].name).toEqual(products[0].name);

              done();
            });
          });
        });
      });

      it('removes the item from the display', (done) => {
        browser.assert.elements('tr', 3);
        browser.assert.element(`tr:nth-child(2) td.product-thumb img[src="/images/products/${products[1].images[0]}"]`);

        browser.clickLink(`tr:nth-child(2) td a[href="/cart/remove/${products[1].id}"]`, () => {
          browser.assert.elements('tr', 2);
          browser.assert.elements(`tr:nth-child(2) td.product-thumb img[src="/images/products/${products[1].images[0]}"]`, 0);
          done();
        });
      });

      it('removes correct product variant from the cart', (done) => {
        browser.assert.elements('tr', 3);
        browser.visit('/', (err) => {
          if (err) done.fail(err);
  
          browser
            .select('li.product:nth-child(1) form select', products[0].options[2])
            .pressButton('li.product:nth-child(1) form button[type=submit]', () => {
              browser.assert.redirected();
              browser.assert.url('/cart');
     
              browser.assert.elements('tr', 4);
        
              browser.assert.text('tr:nth-child(1) td:nth-child(3)', `${products[0].name} - ${products[0].options[0]}`);
              browser.assert.text('tr:nth-child(2) td:nth-child(3)', products[1].name);
              browser.assert.text('tr:nth-child(3) td:nth-child(3)', `${products[0].name} - ${products[0].options[2]}`);
    
              browser.clickLink(`tr:nth-child(3) td a[href="/cart/remove/${products[0].id}/${products[0].options[2]}"]`, () => {
                browser.assert.elements('tr', 3);
                browser.assert.text('tr:nth-child(1) td:nth-child(3)', `${products[0].name} - ${products[0].options[0]}`);
                browser.assert.text('tr:nth-child(2) td:nth-child(3)', products[1].name);
 
                done();
              });
            });
        });
      });

      it('sets a sensible URL for the Continue Shopping link', (done) => {
        browser.assert.link('.navbar-header a.navbar-brand', 'Continue shopping', '/');
        browser.clickLink(`tr:nth-child(2) td a[href="/cart/remove/${products[1].id}"]`, () => {
          browser.assert.link('.navbar-header a.navbar-brand', 'Continue shopping', '/');
          done();
        });
      });
    });
  });
});
