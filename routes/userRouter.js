//express require
const express = require('express');
const u_route = express();
const session = require('express-session');

//requires
const config = require('../config/config');
const userController = require('../controllers/userController');
const accountController = require('../controllers/accountController');
const loginController = require('../controllers/loginController');
const orderController = require('../controllers/orderController');
const userAuth = require('../middleWare/userAuth');
const passport = require('passport');
const multer = require('multer');
const nocache = require('nocache');
const path = require('path');

//session handling
u_route.use(session({
    secret: config.sessionSecretos,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

u_route.use(userAuth.authMiddleware)
u_route.use(nocache());

//googleAuth
u_route.use(passport.initialize());
u_route.use(passport.session());

//use parcers
u_route.use(express.json());
u_route.use(express.urlencoded({extended : true}));

//set engines and views
u_route.set('view engine','ejs');
u_route.set('views','./views/users');
u_route.use(express.static('public'));


//set multer for userImages
const storage = multer.diskStorage({
    destination : (req,file,cb) => {
        cb(null,path.join(__dirname,'../public/userImages'));
    },
    filename : (req,file,cb) => {
        const name = Date.now() + "-" + file.originalname;
        cb(null,name);
    }
});
const upload = multer({ storage : storage });

u_route.use(userAuth.checkUserStatus);

//routes

//main user routes
u_route.get('/',userAuth.authMiddleware,userController.loadHome);
u_route.get('/shop',userAuth.authMiddleware,userController.loadShop);
u_route.get('/product_details/:productId',userAuth.authMiddleware,userController.loadProductDetail);


//register routes
u_route.get('/register',userAuth.isLogout,loginController.loadRegister);
u_route.post('/register',upload.single('userImage'),loginController.insertUser);

// //google auth
u_route.get('/auth/google/callback',passport.authenticate('google', { failureRedirect: '/login' }),loginController.googleSuccess);
u_route.get('/auth/google',passport.authenticate('google', { scope: ['profile', 'email'] }));

//otp routes
u_route.get('/otp_validation',userAuth.isLogout,loginController.loadOTP);
u_route.post('/otp_validation',loginController.verifyOTP);
u_route.post('/otp_resend',loginController.resendOTP);

//login routes
u_route.get('/login',userAuth.isLogout,loginController.loadLogin);
u_route.post('/login',loginController.verifyUser);

//cart routes
u_route.get('/cart',userAuth.isLogin,userController.loadCart);
u_route.post('/add_cart',userController.insertCart);
u_route.post('/update_cart',userController.updateCart);
u_route.get('/cart/delete_cart',userAuth.isLogin,userController.deleteCart);

//checkout routes
u_route.get('/checkout',userAuth.isLogin,orderController.loadCheckout);
u_route.post('/checkout/add_address',orderController.checkoutAddAdress);
u_route.post('/checkout',orderController.addCheckout);
u_route.get('/razorpay_key',orderController.RazorPayKey);
u_route.post('/verify_razorpay_payment', orderController.verifyRazorpayPayment);

//profile routes
u_route.get('/account/profile',userAuth.isLogin,accountController.loadProfile);
u_route.get('/account/profile/edit_password',userAuth.isLogin,userAuth.isLogin,accountController.loadEditPassword);
u_route.post('/account/profile/edit_password',accountController.updatePassword);
u_route.get('/account/profile/edit_details',userAuth.isLogin,userAuth.isLogin,accountController.loadEditDetail);
u_route.post('/account/profile/edit_details',accountController.updateDetail);

//wishlist routes
u_route.get('/account/wishlist',userAuth.isLogin,userController.loadWishlist);
u_route.post('/account/wishlist/add_wishlist',userAuth.isLogin,userController.insertWishlist);
u_route.delete('/account/wishlist/delete/:id',userController.removeWishlist);

//order routes
u_route.get('/account/orders',userAuth.isLogin,orderController.loadOrder);
u_route.get('/account/orders/order_details',userAuth.isLogin,orderController.loadOrderDetail);
u_route.post('/account/orders/order_details/cancel_order',orderController.cancelOrder);
u_route.post('/account/orders/order_details/return_order',orderController.returnOrder);

//address routes
u_route.get('/account/address',userAuth.isLogin,accountController.loadAddress);
u_route.get('/account/address/add_address',userAuth.isLogin,userAuth.isLogin,accountController.loadAddAddress);
u_route.post('/account/address/add_address',accountController.insertAddress);
u_route.get('/account/address/edit_address',userAuth.isLogin,userAuth.isLogin,accountController.loadEditAddress);
u_route.post('/account/address/edit_address',accountController.updateAddress);
u_route.get('/account/address/delete_address',userAuth.isLogin,accountController.deleteAddress);

//wallet routes
u_route.get('/account/wallet',accountController.loadWallet);
u_route.post('/account/wallet/add_money',accountController.addMoneyToWallet);

//coupon routes
u_route.get('/account/coupons',orderController.loadCoupon);
u_route.post('/checkout/apply_coupon',orderController.applyCoupon);
u_route.post('/checkout/remove_coupon',orderController.removeCoupon);

//logout routes
u_route.get('/logout',userAuth.isLogin,loginController.logoutUser);

module.exports = u_route;
