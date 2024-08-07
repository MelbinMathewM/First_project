const session = require('express-session');
const Product = require('../model/productModel');
const User = require('../model/userModel');
const Category = require('../model/categoryModel');
const Brand = require('../model/brandModel');
const Offer = require('../model/offerModel');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const path = require('path');


const loadProducts = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        const searchRegex = new RegExp(search, 'i');

        const matchingCategories = await Category.find({ categoryName: { $regex: searchRegex } });
        const matchingBrands = await Brand.find({ brandName: { $regex: searchRegex } });

        const categoryIds = matchingCategories.map(category => category._id);
        const brandIds = matchingBrands.map(brand => brand._id);

        const query = {
            is_delete: false,
            $or: [
                { productName: { $regex: searchRegex } },
                { productDescription: { $regex: searchRegex } },
                { frameMaterial: { $regex: searchRegex } },
                { frameShape: { $regex: searchRegex } },
                { frameStyle: { $regex: searchRegex } },
                { lensType: { $regex: searchRegex } },
                { specialFeatures: { $regex: searchRegex } },
                ...(categoryIds.length ? [{ productCategory: { $in: categoryIds } }] : []),
                ...(brandIds.length ? [{ productBrand: { $in: brandIds } }] : [])
            ]
        };

        const products = await Product.find(query)
            .populate('productCategory', 'categoryName')
            .populate('productBrand', 'brandName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalProducts = await Product.countDocuments(query);

        res.render('products', {
            products,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalProducts / limit),
            limit,
            search
        });
    } catch (error) {
        res.status(500).send(error);
    }
};


const loadAddProducts = async (req, res) => {
    try {
        const categories = await Category.find();
        const brands = await Brand.find();
        const offers = await Offer.find();
        res.render('add_products', { categories: categories, brands: brands, offers : offers });
    } catch (error) {
        res.send(error);
    }
};

const insertProduct = async (req, res) => {
    try {
        const { productName, productGender, productDescription, productCategory, productBrand, frameMaterial, frameShape, frameStyle, lensType, specialFeatures } = req.body;
        if (!mongoose.Types.ObjectId.isValid(productCategory)) {
            return res.status(400).send('Invalid category ID.');
        }
        if (!mongoose.Types.ObjectId.isValid(productBrand)) {
            return res.status(400).send('Invalid brand ID.');
        }
        const category = await Category.findById(productCategory);
        if (!category) {
            return res.status(404).send({ success: false, message: 'Category not found.' });
        }
        const brand = await Brand.findById(productBrand);
        if (!brand) {
            return res.status(404).send({ success: false, message: 'Brand not found.' });
        }
        // Handle variant fields
        const variantColors = req.body.variants.map(variant => variant.color);
        const variantPrices = req.body.variants.map(variant => variant.price);
        const variantSizes = req.body.variants.map(variant => variant.sizes);
        const variantQuantities = req.body.variants.map(variant => variant.quantities);
        // Validate variant data arrays
        if (!Array.isArray(variantColors) || !Array.isArray(variantPrices) || !Array.isArray(variantSizes) ||
            !Array.isArray(variantQuantities)) {
            console.error('Variant data is invalid');
            return res.status(400).send({ success: false, message: 'Variant data is invalid.' });
        }
        // Group subvariants by color
        const variants = [];
        variantColors.forEach((color, colorIndex) => {
            const colorImages = (req.files[`variantImages[${colorIndex}][]`] || []).map(file => file.filename);
            const subVariants = variantSizes[colorIndex].map((size, sizeIndex) => ({
                size: size,
                quantity: variantQuantities[colorIndex][sizeIndex]
            }));
            const price = variantPrices[colorIndex];
            const discountPrice = Math.floor(price - (price * 0.05));
            variants.push({
                color,
                price,
                discountPrice,
                images: colorImages,
                subVariants
            });
        });
        const product = new Product({
            productName,
            productCategory: category._id,
            productBrand: brand._id,
            productGender,
            frameMaterial,
            frameShape,
            frameStyle,
            lensType,
            specialFeatures,
            productDescription,
            variants,
            is_delete: false
        });
        const productData = await product.save();
        res.status(201).json({ success: true, message: 'Product created successfully', product: productData });
    } catch (error) {
        res.status(500).send({ success: false, message: 'Server error' });
    }
};

const loadDetailProduct = async (req,res) => {
    try{
        const productId = req.query.id
        const productData = await Product.findById(productId).populate('productCategory').populate('productBrand');
        if (!productData) {
            return res.status(404).send("Product not found");
        }
        // Transform the product data
        const { _id, productName, productGender, productDescription, productImage, frameMaterial, frameShape, frameStyle, lensType, specialFeatures, variants, is_delete } = productData;
        const productCategory = productData.productCategory ? productData.productCategory.categoryName : null;
        const productBrand = productData.productBrand ? productData.productBrand.brandName : null;
        const transformedProductData = { _id, productName, productGender, productDescription, productCategory, productBrand, productImage, frameMaterial, frameShape, frameStyle, lensType, specialFeatures, variants, is_delete };   
        res.render('detail_products', { product: transformedProductData });
    }catch(error){
        res.send(error);
    }
}

const loadEditProduct = async (req, res) => {
    try {
        const id = req.query.id;
        const productData = await Product.findById({ _id: id });
        const categories = await Category.find();
        const brands = await Brand.find();
        if (productData) {
            return res.render('edit_products', { product: productData, categories: categories, brands: brands });
        } else {
            return res.redirect('/products');
        }
    } catch (error) {
        res.send(error);
    }
};

const updateProduct = async (req, res) => {
    const productId = req.body.productId;
    try {
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }
        product.productName = req.body.productName;
        product.productCategory = req.body.productCategory;
        product.productBrand = req.body.productBrand;
        product.productDescription = req.body.productDescription;
        product.productGender = req.body.productGender;
        product.frameMaterial = req.body.frameMaterial;
        product.frameShape = req.body.frameShape;
        product.frameStyle = req.body.frameStyle;
        product.lensType = req.body.lensType;
        product.specialFeatures = req.body.specialFeatures;
        const variants = req.body.variants || [];
        //update variants
        const updatedVariants = variants.map((variant, variantIndex) => {
            const updatedVariant = {
                color: variant.color,
                price: variant.price,
                discountPrice: Math.floor(variant.price - (variant.price * 0.05)),
                images: variant.existingImages ? (Array.isArray(variant.existingImages) ? variant.existingImages : [variant.existingImages]) : [],
                subVariants: variant.subVariants ? variant.subVariants.map(subVariant => ({
                    size: subVariant.size,
                    quantity: subVariant.quantity
                })) : []
            };
            // Add newly uploaded images
            const uploadedImages = req.files.filter(file => file.fieldname.startsWith(`variants[${variantIndex}][newImages]`));
            if (uploadedImages && uploadedImages.length > 0) {
                uploadedImages.forEach(file => {
                    updatedVariant.images.push(file.filename);
                });
            }
            // Remove images if specified
            if (variant.removedImages) {
                const removedImages = Array.isArray(variant.removedImages) ? variant.removedImages : [variant.removedImages];
                removedImages.forEach(imageIndex => {
                    const imagePath = path.join(__dirname, '../public/productImages/', updatedVariant.images[imageIndex]);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                    updatedVariant.images.splice(imageIndex, 1);
                });
            }
            return updatedVariant;
        });
        product.variants = updatedVariants;
        await product.save();
        res.json({ success: true, message: "Product updated successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error updating product." });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.query.id;
        const productData = await Product.findByIdAndUpdate(productId, { is_delete: true });
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.send(error);
    }
};

const loadUnlistedProduct = async (req, res) => {
    try {
        const productData = await Product.find({ is_delete: true }).populate('productCategory').populate('productBrand');
        const transformedProductData = productData.map(product => {
            const { _id, productName, productGender, productDescription, productImage,frameMaterial, frameShape, frameStyle, lensType, specialFeatures, variants, is_delete } = product;
            const productCategory = product.productCategory ? product.productCategory.categoryName : null;
            const productBrand = product.productBrand ? product.productBrand.brandName : null;
            return { _id, productName, productGender, productDescription, productCategory, productBrand, productImage,frameMaterial, frameShape, frameStyle, lensType, specialFeatures, variants, is_delete };
        });
        res.render('unlisted_products', { products: transformedProductData });
    } catch (error) {
        res.send(error);
    }
};

const reAddProduct = async (req, res) => {
    try {
        const productId = req.query.id;
        const productData = await Product.findByIdAndUpdate(productId, { is_delete: false }, { new: true });
        if (!productData) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json({ message: 'Product added to Products' });
    } catch (error) {
        res.send(error);
    }
};

const loadCategory = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 8 } = req.query;
        const skip = ( page - 1) * limit;
        const searchRegex = new RegExp(search, 'i');
        const query = {
            is_delete : false,
            $or : [
                { categoryName : { $regex : searchRegex } }
            ]
        }
        const categoryData = await Category.find(query).skip(skip).limit(parseInt(limit));
        const totalCategories = await Category.countDocuments(query); 
        return res.render('categories', { categories: categoryData,currentPage : parseInt(page), totalPages : Math.ceil(totalCategories/limit), limit, search });
    } catch (error) {
        res.send(error);
    }
};

const insertCategory = async (req, res) => {
    try {
        const { categoryName } = req.body;
        if (!categoryName) {
            return res.status(400).json({ message: "Category name is required" });
        }
        const existingCategory = await Category.findOne({ categoryName }).collation({ locale: "en", strength: 2 });

        if (existingCategory) {
            const categories = await Category.find();
            return res.status(400).json({ message: "Category already exists!", categories });
        } else {
            const category = new Category({
                categoryName,
                is_delete: false
            });
            const categoryData = await category.save();
            return res.status(201).json({ message: "Category added successfully", categoryData });
        }
    } catch (error) {
        console.error("Error inserting category:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};


const updateCategory = async (req, res) => {
    try {
        const { categoryId, categoryName } = req.body;

        if (!categoryName) {
            return res.status(400).json({ message: "Category name is required" });
        }

        const existingCategory = await Category.findOne({ categoryName, _id: { $ne: categoryId } });
        if (existingCategory) {
            return res.status(400).json({ message: "Category already exists!" });
        }

        const categoryData = await Category.findByIdAndUpdate(categoryId, { categoryName }, { new: true });
        return res.status(201).json({ message: "Category edited successfully" });
    } catch (error) {
        console.error("Error updating category:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;
        const categoryData = await Category.findByIdAndUpdate(categoryId, { is_delete: true });
        if (categoryData) {
            res.status(200).json({ message: 'Category deleted successfully' });
        } else {
            res.status(200).json({ message: 'Category deletion unsuccessfull' });
        }
    } catch (error) {
        res.send(error);
    }
};

const loadUnlistedCategory = async (req, res) => {
    try {
        const categoryData = await Category.find({is_delete : true});
        res.render('unlisted_categories', { categories: categoryData });
    } catch (error) {
        res.send(error);
    }
};

const reAddCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;
        const categoryData = await Category.findByIdAndUpdate(categoryId, { is_delete: false }, { new: true });
        if (!categoryData) {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.status(200).json({ message: 'Category added to Categories' });
    } catch (error) {
        res.send(error);
    }
};

const loadBrand = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 8} = req.query;
        const skip = (page - 1) * limit;
        const searchRegex = new RegExp(search, 'i');
        const query = {
            is_delete : false,
            $or : [
                { brandName : { $regex : searchRegex } }
            ]
        }

        const brandData = await Brand.find(query).skip(skip).limit(parseInt(limit));
        const totalBrands = await Brand.countDocuments(query);
        return res.render('brands', { brands: brandData, currentPage : parseInt(page), totalPages : Math.ceil(totalBrands/limit), search, limit });
    } catch (error) {
        res.send(error);
    }
};

const insertBrand = async (req, res) => {
    try {
        const { brandName } = req.body;
        const existingBrand = await Brand.findOne({ brandName });
        if (existingBrand) {
            res.send('Brand already exists');
        }
        const brand = new Brand({
            brandName: brandName
        });
        const brandData = await brand.save();
        res.redirect('/admin/brands');
    } catch (error) {
        res.send(error);
    }
};

const updateBrand = async (req, res) => {
    try {
        const brandId = new mongoose.Types.ObjectId(req.body.brandId);
        const { brandName } = req.body;
        const brandData = await Brand.findByIdAndUpdate(brandId, { brandName: brandName }, { new: true });
        res.redirect('/admin/brands');
    } catch (error) {
        res.send(error);
    }
};

const deleteBrand = async (req, res) => {
    try {
        const brandId = req.query.id;
        const brandData = await Brand.findByIdAndUpdate(brandId, { is_delete: true });
        if (brandData) {
            res.status(200).json({ message: 'Brand deleted successfully' });
        } else {
            res.status(404).json({ message: 'Brand deletion unsuccessfull!' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

const loadUnlistedBrand = async (req, res) => {
    try {
        const brand = await Brand.find({ is_delete: true });
        res.render('unlisted_brands', { brands: brand });
    } catch (error) {
        res.send(error);
    }
};

const reAddBrand = async (req, res) => {
    try {
        const brandId = req.query.id;
        const brandData = await Brand.findByIdAndUpdate(brandId, { is_delete: false }, { new: true });
        if (!brandData) {
            return res.status(404).json({ message: 'Brand not found' });
        }
        res.status(200).json({ message: 'Brand added to Brands' });
    } catch (error) {
        res.send(error);
    }
};

module.exports = {
    loadProducts,
    loadAddProducts,
    insertProduct,
    loadDetailProduct,
    loadEditProduct,
    updateProduct,
    deleteProduct,
    loadUnlistedProduct,
    reAddProduct,
    loadCategory,
    insertCategory,
    updateCategory,
    deleteCategory,
    loadUnlistedCategory,
    reAddCategory,
    loadBrand,
    insertBrand,
    updateBrand,
    deleteBrand,
    loadUnlistedBrand,
    reAddBrand
}