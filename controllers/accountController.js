const Address = require('../model/addressModel');
const Product = require('../model/productModel');
const User = require('../model/userModel');
const Wallet = require('../model/walletModel');
const bcrypt = require('bcrypt');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpayInstance = new Razorpay({
    key_id: process.env.key_id,
    key_secret: process.env.key_secret,
});

const securePassword = async (password) => {
    try {
        const hashPassword = await bcrypt.hash(password, 10);
        return hashPassword;
    } catch (error) {
        res.send(error);
    }
};

const loadProfile = async (req, res) => {
    try {
        const userId = req.session.user_id;
        const products = await Product.find();
        const user = await User.findById(userId);
        const defaultImage = '/static/userImages/default.jpg';
        const profileImage = user.userImage ? `/static/userImages/${user.userImage}` : defaultImage;
        res.render(`profile`, { products: products, user: user, profileImage : profileImage });
    } catch (error) {
        res.send(error)
    }
};

const updatePassword = async (req, res) => {
    try {
        const { opassword, password } = req.body;
        const userId = req.session.user_id;
        const uData = await User.findById(userId);
        if (!uData) {
            return res.status(404).json({ success : false, message: "User not found" });
        }
        const passwordMatch = await bcrypt.compare(opassword,uData.password);
        if(!passwordMatch){
            return res.status(400).json({ success : false, message : 'Your old password is incorrect!'});
        }
        const npassword = await securePassword(password);
        const userData = await User.findByIdAndUpdate(userId, {
            $set: {
                password: npassword
            }
        }, { new: true });
        if (userData) {
            res.status(200).json({ success : true, message : 'Password updated successfully'});
        } else {
            res.status(400).json({ message: "Couldn't update password" });
        }
    } catch (error) {
        res.status(500).json(error);
    }
};

const updateDetail = async (req, res) => {
    try {
        const { customerName, userName, userMobile, password } = req.body;
        const userId = req.session.user_id;
        const existingUserName = await User.findOne({ userName: userName, _id : { $ne : userId } });
        if (existingUserName) {
            return res.status(400).json({ success : false, message: "Username already exists" })
        }
        const uData = await User.findById(userId);
        if (!uData) {
            return res.status(404).json({ success : false, message: "User not found" });
        }
        const passwordMatch = await bcrypt.compare(password, uData.password);
        if (passwordMatch) {
            const userData = await User.findByIdAndUpdate(userId, {
                $set: {
                    customerName: customerName,
                    userName: userName,
                    userMobile: userMobile
                }
            }, { new: true });
            if (userData) {
                res.status(200).json({ success : true, message : 'User details updated'});
            } else {
                res.status(400).json({ success : false, message : "Didn\'t update details"});
            }
        } else {
            res.status(400).json({ success : false, message : "Incorrect Password!"});
        }
    } catch (error) {
        res.status(500).json({ success : false, error : "Some error occured"});
    }
};

const loadAddress = async (req, res) => {
    try {
        const userId = req.session.user_id
        const user = await User.findById(userId);
        const addresses = await Address.find({ user_id: user._id });
        res.render('address', { user: user, addresses: addresses });
    } catch (error) {
        res.send(error);
    }
};

const insertAddress = async (req, res) => {
    try {
        const { addressName, addressEmail, addressMobile, addressHouse, addressStreet, addressPost, addressMark, addressCity, addressDistrict, addressState, addressPin } = req.body;
        const userId = req.session.user_id;
        const address = new Address({
            user_id: userId,
            addressName,
            addressEmail,
            addressMobile,
            addressHouse,
            addressStreet,
            addressPost,
            addressMark,
            addressCity,
            addressDistrict,
            addressState,
            addressPin
        });
        const addressData = await address.save();
        if (addressData) {
            res.status(201).json({ message: 'Address added successfully.' });
        } else {
            res.status(404).json({ message: "Couldn't insert address." });
        }
    } catch (error) {
        res.status(500).json({ message: 'An unexpected error occurred. Please try again later.' });
    }
};

const updateAddress = async (req, res) => {
    try {
        const id = req.params.id;
        const { addressName, addressEmail, addressMobile, addressHouse, addressStreet, addressPost, addressMark, addressCity, addressDistrict, addressState, addressPin } = req.body;
        const addressData = await Address.findByIdAndUpdate({ _id: id }, {
            $set: {
                addressName: addressName,
                addressEmail: addressEmail,
                addressMobile: addressMobile,
                addressHouse: addressHouse,
                addressStreet: addressStreet,
                addressPost: addressPost,
                addressMark: addressMark,
                addressCity: addressCity,
                addressDistrict: addressDistrict,
                addressState: addressState,
                addressPin: addressPin
            }
        });
        if (addressData) {
            res.status(201).json({ message: 'Address updated successfully.' });
        } else {
            res.status(404).json({ message: "Couldn't update address." });
        }
    } catch (error) {
        res.status(500).json({ message: 'An unexpected error occurred. Please try again later.' });
    }
};


const deleteAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const addressData = await Address.findByIdAndDelete(addressId);
        if (!addressData) {
            return res.status(404).json({ message: 'Address not found' });
        }
        res.status(200).json({ message: 'Address deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'There was a problem deleting the address', error: error.message });
    }
};

const getBalance = async function(userId) {
    const wallet = await Wallet.findOne({ user: userId });
    return wallet ? wallet.balance : 0;
};

const getTransactions = async function(userId) {
    const wallet = await Wallet.findOne({ user: userId });
    return wallet ? wallet.transactions.sort((a, b) => b.date - a.date) : [];
};

const addMoney = async function(userId, amount) {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
        throw new Error('Wallet not found');
    }
    wallet.balance += amount * 100;
    wallet.transactions.push({
        description: 'Money added',
        amount: amount * 100,
        balance: wallet.balance
    });

    await wallet.save();
};

const loadWallet = async (req,res) => {
    try{
        const userId = req.session.user_id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send('User not found');
        }
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            wallet = new Wallet({ user: userId });
            await wallet.save();
        }
        const walletBalance = await getBalance(userId);
        const transactions = await getTransactions(userId);
        res.render('wallet',{walletBalance,transactions});
    }catch(error){
        res.status(500).send('Internal Server Error');
    }
};

const addMoneyToWallet = async (req, res) => {
    try {
        const { amount } = req.body;
        const options = {
            amount: amount * 100,
            currency: 'INR',
            receipt: `receipt_order_${Math.random() * 1000}`,
        };
        const order = await razorpayInstance.orders.create(options);
        if (!order) return res.status(400).send('Error creating Razorpay order');
        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
        });
    } catch (error) {
        console.error('Error adding money to wallet:', error);
        res.status(500).send('Internal Server Error');
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body;
        const expectedSignature = crypto.createHmac('sha256', process.env.key_secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');
        if (razorpay_signature !== expectedSignature) {
            return res.status(400).send('Invalid payment signature');
        }
        const userId = req.session.user_id;
        await addMoney(userId, amount/100);
        res.json({ success: true });
    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        res.status(500).send('Internal Server Error');
    }
};


module.exports = {
    loadProfile,
    updatePassword,
    updateDetail,
    loadAddress,
    insertAddress,
    updateAddress,
    deleteAddress,
    loadWallet,
    addMoneyToWallet,
    verifyPayment
}