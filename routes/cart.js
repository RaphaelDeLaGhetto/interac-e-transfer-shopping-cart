'use strict';

const express = require('express');
const router = express.Router();
const models = require('../models');
const Cart = require('../lib/cart');
const mailer = require('../mailer');
const ejs = require('ejs');
const Styliner = require('styliner');
const path = require('path');
const QRCode = require('qrcode')

/**
 * GET /
 */
router.get('/', (req, res) => {
  let cart = (typeof req.session.cart !== 'undefined') ? req.session.cart : false;
  res.render('cart', {
    pageTitle: 'crypto-shopping-cart',
    path: req.originalUrl,
    cart: cart,
    messages: req.flash()
  });
});

/**
 * POST /
 */
router.post('/', (req, res) => {
  models.Product.findOne({_id: req.body.id}).then(prod => {
    Cart.addToCart(prod, req.body.option, req.session.cart);
    res.redirect('/cart');
  }).catch(err => {
    res.redirect('/');
  });
});

/**
 * GET /remove/:id/:option?
 */
router.get('/remove/:id/:option?', (req, res) => {
  Cart.removeFromCart(req.params.id, req.params.option || null, req.session.cart);
  res.redirect('/cart');
});

/**
 * POST /checkout
 */
router.post('/checkout', (req, res) => {

  // Get email text content 
  ejs.renderFile(__dirname + "/../views/mailer/orderText.ejs", { cart: req.session.cart }, (err, textEmail) => {
    if (err) {
      console.log(err);
      req.flash('error', 'Something went wrong');
      return res.redirect('/cart');
    }

    // Generate QR code for wallet
    QRCode.toDataURL(process.env.WALLET, (err, qr) => {
      if (err) {
        console.log(err);
      }

      // Get email HTML content 
      ejs.renderFile(__dirname + "/../views/mailer/orderHtml.ejs", { cart: req.session.cart, qr: qr }, (err, htmlEmail) => {
        if (err) {
          console.log(err);
          req.flash('error', 'Something went wrong');
          return res.redirect('/cart');
        }
  
        // Inline CSS processing
        const styliner = new Styliner(__dirname + '/..', {noCSS: false});
        styliner.processHTML(htmlEmail).then((htmlAndCss) => {
  
          // Attach images
          let attachments = req.session.cart.items.map((item) => {
            return { filename: item.image,
                     path: path.resolve(__dirname, '../public/images/products', item.image),
                     cid: item.image }
          });
          // Attach QR
          attachments.push({
            filename: 'qr.png',
            content: new Buffer(qr.split("base64,")[1], "base64"),
            cid: 'qr.png'
          });
  
          let mailOptions = {
            to: req.body.email,
            from: process.env.FROM,
            subject: 'Order received - payment and shipping instructions',
            text: textEmail,
            html: htmlAndCss,
            attachments: attachments
          };
  
          mailer.transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
              console.log(err);
              req.flash('error', 'Something went wrong');
              return res.redirect('/cart');
            }
            Cart.emptyCart(req.session.cart);
            req.flash('success', `An email has been sent to ${req.body.email} with transaction and shipping instructions`);
            res.redirect('/');
          });
        }).catch((err) => {
          console.log(err);
          req.flash('error', 'Something went wrong');
          return res.redirect('/cart');
        });
      });
    });
  });
});

module.exports = router;
