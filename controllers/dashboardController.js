const Admin = require('../model/adminModel');
const User = require('../model/userModel');
const Order = require('../model/orderModel');
const Product = require('../model/productModel');
const Category = require('../model/categoryModel');
const Coupon = require('../model/couponModel');
const Offer = require('../model/offerModel');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const loadDashboard = async (req, res) => {
    try {
        res.render('dashboard');
    } catch (error) {
        res.send(error);
    }
};

const loadSalesData = async (req, res) => {
    const filter = req.query.filter;
    let matchStage = {};
    let groupStage = {};
    let dateFormat;
    switch (filter) {
        case 'yearly':
            dateFormat = '%Y';
            break;
        case 'monthly':
            dateFormat = '%Y-%m';
            break;
        case 'weekly':
            dateFormat = '%Y-%U';
            break;
        case 'daily':
            dateFormat = '%Y-%m-%d';
            break;
        default:
            dateFormat = '%Y-%m-%d';
    }
    groupStage = {
        _id: { $dateToString: { format: dateFormat, date: "$items.deliveryDate" } },
        totalSales: { $sum: "$items.productPrice" },
        totalDiscount: { 
            $sum: {
                $add: [
                    { $ifNull: ["$items.offerDiscount", 0] },
                    { $ifNull: ["$items.couponDiscount", 0] }
                ]
            }
        },
        totalQuantity: { $sum: "$items.quantity" },
        totalOrders: { $sum: 1 }
    };
    try {
        const salesData = await Order.aggregate([
            { $unwind: "$items" },
            { $group: groupStage },
            { $sort: { _id: 1 } }
        ]);
        const labels = salesData.map(data => data._id);
        const totalSales = salesData.map(data => data.totalSales/1000);
        const totalDiscount = salesData.map(data => data.totalDiscount/1000);
        const totalQuantity = salesData.map(data => data.totalQuantity);
        const totalOrders = salesData.map(data => data.totalOrders);
        res.json({ labels, totalSales, totalDiscount, totalQuantity, totalOrders });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

const getTopProducts = async (req, res) => {
    try {
        const bestSellingProducts = await Order.aggregate([
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product_id',
                    totalSold: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.productPrice', '$items.quantity'] } }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);
        res.json(bestSellingProducts);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

const getTopCategories = async (req, res) => {
    try {
        const bestSellingCategories = await Order.aggregate([
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.productCategory',
                    totalSold: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.productPrice', '$items.quantity'] } }
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$category' },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);
        res.json(bestSellingCategories);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

const getTopBrands = async (req, res) => {
    try {
        const bestSellingBrands = await Order.aggregate([
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.productBrand',
                    totalSold: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.productPrice', '$items.quantity'] } }
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'brand'
                }
            },
            { $unwind: '$brand' },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);
        res.json(bestSellingBrands);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

const getSalesReport = async (req, res) => {
    try {
        let { startDate, endDate, period } = req.query;
        const matchStage = {
            $match: {
                "items.orderStatus": { $nin: ["Canceled", "Returned"] }
            }
        };
        const now = new Date();
        if (startDate) startDate = new Date(startDate);
        if (endDate) {
            endDate = new Date(endDate);
            endDate.setHours(23, 59, 59, 999);
        }
        if (period && period !== 'select') {
            switch (period) {
                case 'daily':
                    startDate = new Date(now.setHours(0, 0, 0, 0));
                    endDate = new Date(now.setHours(23, 59, 59, 999));
                    break;
                case 'weekly':
                    startDate = new Date(now.setDate(now.getDate() - now.getDay() - 6));
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now.setDate(now.getDate() - now.getDay() + 7));
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'monthly':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'yearly':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(now.getFullYear(), 11, 31);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                default:
                    throw new Error('Invalid period selected');
            }
        } else if (startDate && endDate) {
            matchStage.$match["items.deliveryDate"] = {
                $gte: startDate,
                $lte: endDate
            };
        }
        if (startDate && endDate) {
            matchStage.$match["items.deliveryDate"] = {
                $gte: startDate,
                $lte: endDate
            };
        }
        let groupStage;
        switch (period) {
            case 'daily':
                groupStage = {
                    $group: {
                        _id: {
                            year: { $year: "$items.deliveryDate" },
                            month: { $month: "$items.deliveryDate" },
                            day: { $dayOfMonth: "$items.deliveryDate" },
                            product_id: "$items.product_id"
                        },
                        totalQuantity: { $sum: "$items.quantity" },
                        totalSales: { $sum: { $multiply: ["$items.quantity", "$items.productPrice"] } },
                        totalDiscount: { $sum: { $ifNull: ["$items.offerDiscount", 0] } },
                        totalCoupons: { $sum: { $ifNull: ["$items.couponDiscount", 0] } },
                        totalOrders: { $sum: 1 }
                    }
                };
                break;
            case 'weekly':
                groupStage = {
                    $group: {
                        _id: {
                            year: { $year: "$items.deliveryDate" },
                            week: { $isoWeek: "$items.deliveryDate" },
                            product_id: "$items.product_id"
                        },
                        totalQuantity: { $sum: "$items.quantity" },
                        totalSales: { $sum: { $multiply: ["$items.quantity", "$items.productPrice"] } },
                        totalDiscount: { $sum: { $ifNull: ["$items.offerDiscount", 0] } },
                        totalCoupons: { $sum: { $ifNull: ["$items.couponDiscount", 0] } },
                        totalOrders: { $sum: 1 }
                    }
                };
                break;
            case 'monthly':
                groupStage = {
                    $group: {
                        _id: {
                            year: { $year: "$items.deliveryDate" },
                            month: { $month: "$items.deliveryDate" },
                            product_id: "$items.product_id"
                        },
                        totalQuantity: { $sum: "$items.quantity" },
                        totalSales: { $sum: { $multiply: ["$items.quantity", "$items.productPrice"] } },
                        totalDiscount: { $sum: { $ifNull: ["$items.offerDiscount", 0] } },
                        totalCoupons: { $sum: { $ifNull: ["$items.couponDiscount", 0] } },
                        totalOrders: { $sum: 1 }
                    }
                };
                break;
            case 'yearly':
                groupStage = {
                    $group: {
                        _id: {
                            year: { $year: "$items.deliveryDate" },
                            product_id: "$items.product_id"
                        },
                        totalQuantity: { $sum: "$items.quantity" },
                        totalSales: { $sum: { $multiply: ["$items.quantity", "$items.productPrice"] } },
                        totalDiscount: { $sum: { $ifNull: ["$items.offerDiscount", 0] } },
                        totalCoupons: { $sum: { $ifNull: ["$items.couponDiscount", 0] } },
                        totalOrders: { $sum: 1 }
                    }
                };
                break;
            default:
                groupStage = {
                    $group: {
                        _id: {
                            year: { $year: "$items.deliveryDate" },
                            month: { $month: "$items.deliveryDate" },
                            day: { $dayOfMonth: "$items.deliveryDate" },
                            product_id: "$items.product_id"
                        },
                        totalQuantity: { $sum: "$items.quantity" },
                        totalSales: { $sum: { $multiply: ["$items.quantity", "$items.productPrice"] } },
                        totalDiscount: { $sum: { $ifNull: ["$items.offerDiscount", 0] } },
                        totalCoupons: { $sum: { $ifNull: ["$items.couponDiscount", 0] } },
                        totalOrders: { $sum: 1 }
                    }
                };
                break;
        }
        const projectStage = {
            $project: {
                _id: 0,
                year: "$_id.year",
                month: { $ifNull: ["$_id.month", null] },
                day: { $ifNull: ["$_id.day", null] },
                week: { $ifNull: ["$_id.week", null] },
                product: "$productDetails.productName",
                totalQuantity: 1,
                totalSales: 1,
                totalDiscount: 1,
                totalCoupons: 1,
                totalOrders: 1
            }
        };
        const pipeline = [
            { $unwind: "$items" },
            matchStage,
            groupStage,
            {
                $lookup: {
                    from: 'products',
                    localField: '_id.product_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: "$productDetails" },
            projectStage
        ];
        const salesReport = await Order.aggregate(pipeline);
        const overallPipeline = [
            { $unwind: "$items" },
            matchStage,
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: { $multiply: ["$items.quantity", "$items.productPrice"] } },
                    totalDiscount: { $sum: { $ifNull: ["$items.offerDiscount", 0] } },
                    totalCoupons: { $sum: { $ifNull: ["$items.couponDiscount", 0] } },
                    totalOrders: { $sum: 1 },
                    totalQuantity: { $sum: "$items.quantity" }
                }
            }
        ];
        const overallSales = await Order.aggregate(overallPipeline);
        const overallReport = overallSales[0] || {
            totalSales: 0,
            totalDiscount: 0,
            totalCoupons: 0,
            totalOrders: 0,
            totalQuantity: 0
        };
        return { salesReport, overallReport };
    } catch (error) {
        console.error('Error loading sales report:', error);
        res.status(500).send('Internal Server Error');
    }
};

const loadSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, period } = req.query;
        const { salesReport, overallReport } = await getSalesReport(req);
        res.render('sales_report', {
            salesReport,
            startDate: startDate ? new Date(startDate).toISOString().split('T')[0] : '',
            endDate: endDate ? new Date(endDate).toISOString().split('T')[0] : '',
            period,
            overallReport
        });
    } catch (error) {
        console.error('Error rendering sales report page:', error);
        res.status(500).send('Internal Server Error');
    }
};

const downloadPDF = async (req, res) => {
    try {
        const { salesReport, overallReport } = await getSalesReport(req);
        const pdfPath = await generatePDF({ salesReport, overallReport }, 'sales_report');
        console.log(pdfPath);
        res.download(pdfPath, 'sales_report.pdf');
    } catch (error) {
        console.error('Error downloading sales report:', error);
        res.status(500).send('Internal Server Error');
    }
};

const generatePDF = async ({ salesReport, overallReport }, filename) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const outputPath = path.join(__dirname, '..', 'public', 'pdf', `${filename}.pdf`);

        // Ensure the directory exists
        const directory = path.dirname(outputPath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // PDF content generation
        doc.font('Helvetica').fontSize(24);
        doc.text('Sales Report', { align: 'center' }).moveDown();

        // Overall Report
        doc.fontSize(20);
        doc.text('Overall Report', { align: 'left' }).moveDown();

        doc.fontSize(16);
        doc.text(`Total Sales: ${overallReport.totalSales.toFixed(2)}`);
        doc.text(`Total Discount: ${overallReport.totalDiscount.toFixed(2)}`);
        doc.text(`Total Coupons: ${overallReport.totalCoupons.toFixed(2)}`);
        doc.text(`Total Orders: ${overallReport.totalOrders}`);
        doc.text(`Total Quantity: ${overallReport.totalQuantity}`).moveDown();

        // Sales Report Details Header
        doc.fontSize(16);
        doc.text('Sales Report Details', { align: 'left' }).moveDown();

        const tableHeaders = [
            'Product', 'Date', 'Qty', 'Sales',
            'Discount', 'Coupons', 'Orders'
        ];
        const columnWidths = [100, 70, 40, 70, 70, 70, 50];

        const drawRow = (y, item) => {
            doc.fontSize(12);
            doc.text(item.product, 50, y, { width: columnWidths[0], align: 'left' });

            let dateText;
            if (item.day) {
                dateText = `${item.year}-${item.month}-${item.day}`;
            } else if (item.week) {
                dateText = `${item.year}-W${item.week}`;
            } else if (item.month) {
                dateText = `${item.year}-${item.month}`;
            } else {
                dateText = `${item.year}`;
            }
            doc.text(dateText, 150, y, { width: columnWidths[1], align: 'left' });

            doc.text(item.totalQuantity, 220, y, { width: columnWidths[2], align: 'right' });
            doc.text(item.totalSales.toFixed(2), 260, y, { width: columnWidths[3], align: 'right' });
            doc.text(item.totalDiscount.toFixed(2), 330, y, { width: columnWidths[4], align: 'right' });
            doc.text(item.totalCoupons.toFixed(2), 400, y, { width: columnWidths[5], align: 'right' });
            doc.text(item.totalOrders, 470, y, { width: columnWidths[6], align: 'right' });
        };

        // Draw table headers
        let y = doc.y;
        doc.fontSize(14);
        tableHeaders.forEach((header, i) => {
            doc.text(header, 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: columnWidths[i], align: i > 1 ? 'right' : 'left' });
        });
        y += 20;

        // Draw table rows
        salesReport.forEach(item => {
            if (y > doc.page.height - 50) {
                doc.addPage();
                y = 50;
            }
            drawRow(y, item);
            y += 20;
        });

        doc.end();

        stream.on('finish', () => {
            resolve(outputPath);
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
};

const downloadExcel = async (req, res) => {
    try {
        const { salesReport, overallReport } = await getSalesReport(req);
        const filename = `sales_report_${new Date().toISOString().split('T')[0]}`;
        const filePath = await generateExcel({ salesReport, overallReport }, filename);
        res.download(filePath, (err) => {
            if (err) {
                console.error('Error downloading the file:', err);
                res.status(500).send('Error downloading the file.');
            }
        });
    } catch (error) {
        console.error('Error generating the sales report:', error);
        res.status(500).send('Error generating the sales report.');
    }
};

const generateExcel = async ({ salesReport, overallReport }, filename) => {
    return new Promise((resolve, reject) => {
        const wb = xlsx.utils.book_new();
        // Overall Report
        const overallData = [
            ['Overall Report'],
            ['Total Sales', overallReport.totalSales.toFixed(2)],
            ['Total Discount', overallReport.totalDiscount.toFixed(2)],
            ['Total Coupons', overallReport.totalCoupons.toFixed(2)],
            ['Total Orders', overallReport.totalOrders],
            ['Total Quantity', overallReport.totalQuantity]
        ];
        const overallSheet = xlsx.utils.aoa_to_sheet(overallData);
        xlsx.utils.book_append_sheet(wb, overallSheet, 'Overall Report');
        // Sales Report Details
        const salesData = [
            ['Product', 'Date/Week/Month/Year', 'Total Quantity', 'Total Sales', 'Total Discount', 'Total Coupons', 'Total Orders']
        ];
        salesReport.forEach(item => {
            let dateInfo = '';
            if (item.day) {
                dateInfo = `${item.year}-${item.month}-${item.day}`;
            } else if (item.week) {
                dateInfo = `${item.year}-W${item.week}`;
            } else if (item.month) {
                dateInfo = `${item.year}-${item.month}`;
            } else {
                dateInfo = `${item.year}`;
            }
            salesData.push([
                item.product,
                dateInfo,
                item.totalQuantity,
                item.totalSales.toFixed(2),
                item.totalDiscount.toFixed(2),
                item.totalCoupons.toFixed(2),
                item.totalOrders
            ]);
        });
        const salesSheet = xlsx.utils.aoa_to_sheet(salesData);
        xlsx.utils.book_append_sheet(wb, salesSheet, 'Sales Report');
        const outputPath = path.join(__dirname, '..', 'public', 'excel', `${filename}.xlsx`);
        const directory = path.dirname(outputPath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        // Write the workbook to a file
        xlsx.writeFile(wb, outputPath);
        resolve(outputPath);
    });
};

module.exports = {
    loadDashboard,
    loadSalesData,
    getTopProducts,
    getTopCategories,
    getTopBrands,
    loadSalesReport,
    downloadPDF,
    downloadExcel
};