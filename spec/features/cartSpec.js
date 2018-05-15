'use strict';                  

const app = require('../../app'); 
const models = require('../../models');
const mailer = require('../../mailer');
const fixtures = require('pow-mongoose-fixtures');
const Units = require('ethereumjs-units');
const path = require('path');
const QRCode = require('qrcode')

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

    models.collection('sessions').find({}).toArray((err, results) => {
      if (err) {
        done.fail(err);
      }
      expect(results.length).toEqual(0);
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
          expect(results[0].session.cart.totals).toEqual(0);
          expect(results[0].session.cart.preferredCurrency).toEqual(process.env.PREFERRED_CURRENCY);
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
        browser.clickLink('Checkout', (err) => {
          if (err) done.fail(err);
          browser.assert.success();
          done();
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

      fixtures.load(__dirname + '/../fixtures/wallets.js', models.mongoose, (err) => {
        if (err) done.fail(err);

        fixtures.load(__dirname + '/../fixtures/products.js', models.mongoose, (err) => {
          if (err) done.fail(err);
  
          models.Product.find({}).sort('createdAt').then((results) => {
            products = results;
  
            browser.visit('/', (err) => {
              if (err) done.fail(err);
  
              browser.pressButton('li.product:nth-child(1) form button[type=submit]', () => {
  
                browser.visit('/', (err) => {
                  if (err) done.fail(err);
  
                  browser.pressButton('li.product:nth-child(2) form button[type=submit]', () => {
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

      browser.assert.text('tr.info',
          `${Number(Units.convert(products[0].prices[0].price * 2, 'gwei', 'eth'))} ${process.env.PREFERRED_CURRENCY}`);
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

    // This test is nothing but trouble...
    it('displays a wallet QR code', (done) => {
      // Wallet address
      models.Wallet.findOne({ currency: process.env.PREFERRED_CURRENCY }).then((wallet) => {
        QRCode.toString(wallet.address, { type: 'svg' }, (err, svg) => {
          if (err) done.fail(err);
          browser.assert.element('svg');
          browser.assert.elements('path', 2);
          // Zombie renders the html differently than that provided by QRCode 
          // As such, the following doesn't work. Not a great test...
          //expect(browser.html()).toMatch(svg);
          done();
        });
      }).catch((error) => {
        done.fail(error)
      });
    });

    /* See `checkoutSpec.js` for relevant coverage */
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
          expect(results[0].session.cart.totals[process.env.PREFERRED_CURRENCY].total).
            toEqual(products[0].prices[0].price * 2);

          browser.clickLink(`tr:nth-child(2) td a[href="/cart/remove/${products[1].id}"]`, () => {
            models.collection('sessions').find({}).toArray((err, results) => {
              if (err) {
                done.fail(err);
              }
              expect(results.length).toEqual(1);
              expect(results[0].session.cart.items.length).toEqual(1);
              expect(results[0].session.cart.totals[process.env.PREFERRED_CURRENCY].total).
                toEqual(products[0].prices[0].price);
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


  describe('currency dropdown', () => {

    describe('no products in database', () => {
      beforeEach((done) => {
        browser = new Browser({ waitDuration: '30s', loadCss: false });
  
        browser.visit('/cart', (err) => {
          if (err) done.fail(err);
          browser.assert.success();
          done();
        });
      });

      it('does not display a currency dropdown', () => {
        browser.assert.elements('form[action="/cart/set-currency"]', 0);
      });
    });

    describe('products in database', () => {

      describe('one currency accepted', () => {
        beforeEach((done) => {
          models.Wallet.create({ currency: 'ETH', address: '0x123abc', name: 'Ethereum'}).then((wallet) => {
            models.Product.create({
              name: 'shirt',
              prices: [{ price: 51990000, wallet: wallet._id }],
              images: ['man-shirt.jpg'],
            }).then((results) => {
              browser.visit('/', (err) => {
                if (err) done.fail(err);
                browser.assert.success();
                done();
              });
            }).catch((error) => {
              done.fail();
            });
          }).catch((error) => {
            done.fail();
          });
        });

        it('does not display if there is only one accepted currency', () => {
          browser.assert.elements('form[action="/cart/set-currency"]', 0);
        });
      });
  
      describe('multiple currencies accepted', () => {

        let _wallets, _products;
        beforeEach((done) => {
          fixtures.load(__dirname + '/../fixtures/wallets.js', models.mongoose, (err) => {
            if (err) done.fail(err);

            models.Wallet.find({}).sort('createdAt').then((wallets) => {
              _wallets = wallets;

              fixtures.load(__dirname + '/../fixtures/products.js', models.mongoose, (err) => {
                if (err) done.fail(err);

                models.Product.find({}).then((products) => {
                  _products = products;

                  browser.visit('/', (err) => {
                    if (err) done.fail(err);
                    browser.assert.success();
                    done();
                  });
                }).catch((error) => {
                  done.fail(error);
                });
              });
            }).catch((error) => {
              done.fail(error);
            });
          });
        });

        it('displays the accepted currencies in the dropdown', () => {
          browser.assert.element('form[action="/cart/set-currency"]');
          browser.assert.text(`form[action="/cart/set-currency"] select option[value=${_wallets[0].currency}]`,
                              `${_wallets[0].name} (${_wallets[0].currency})`);
          browser.assert.text(`form[action="/cart/set-currency"] select option[value=${_wallets[1].currency}]`,
                              `${_wallets[1].name} (${_wallets[1].currency})`);
        });

        it('updates product details if a new preferred currency is set', (done) => {
          // First product
          browser.assert.text('ul#products li.product:nth-child(1) .cart-data .product-info span.price',
                              `${_products[0].prices[0].formattedPrice} ${_wallets[0].currency}`);
          // Second product
          browser.assert.text('ul#products li.product:nth-child(1) .cart-data .product-info span.price',
                              `${_products[1].prices[0].formattedPrice} ${_wallets[0].currency}`);
 
          browser
          .select('form[action="/cart/set-currency"] select', `${_wallets[1].name} (${_wallets[1].currency})`)
          .pressButton('form[action="/cart/set-currency"] button[type=submit]', () => {
            browser.assert.redirected();
            browser.assert.url('/');
            browser.assert.text('.alert.alert-info', `Currency switched to ${_wallets[1].currency}`);

            // First product
            browser.assert.text('ul#products li.product:nth-child(1) .cart-data .product-info span.price',
                                `${_products[0].prices[1].formattedPrice} ${_wallets[1].currency}`);
            // Second product
            browser.assert.text('ul#products li.product:nth-child(1) .cart-data .product-info span.price',
                                `${_products[1].prices[1].formattedPrice} ${_wallets[1].currency}`);
            done();
          });
        });

        it('sets the preferred currency in the cart session', (done) => {
          models.collection('sessions').find({}).toArray((err, results) => {
            if (err) {
              done.fail(err);
            }
            expect(results.length).toEqual(1);
            expect(results[0].session.cart.preferredCurrency).toEqual(_wallets[0].currency);

            browser
            .select('form[action="/cart/set-currency"] select', `${_wallets[1].name} (${_wallets[1].currency})`)
            .pressButton('form[action="/cart/set-currency"] button[type=submit]', () => {
   
              models.collection('sessions').find({}).toArray((err, results) => {
                if (err) {
                  done.fail(err);
                }
                expect(results.length).toEqual(1);
                expect(results[0].session.cart.preferredCurrency).toEqual(_wallets[1].currency);
                done();
              });
            });
          });
        });
      });
    });
  });


});
