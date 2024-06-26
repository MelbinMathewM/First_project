const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Cart = new Schema({
    userId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Customer',
        required : true
    },
    productId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Product',
        required : true
    },
    productImage: {
        type: [String],
        required: true
    },
    productName: {
        type: String,
        required: true
    },
    productPrice: {
        type: Number,
        required: true
    },
    productDiscPrice : {
        type : Number,
        required : true
    },
    productColor : {
        type : String,
        required : true
    },
    productSize : {
        type : String,
        required : true
    },
    productQuantity : {
        type : Number,
        required : true
    },
    cartPrice : {
        type : Number,
        required : true
    },
    availableQty : {
        type : Number
    }
});

module.exports = mongoose.model("Cart",Cart);