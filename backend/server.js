require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../public")));

// Route imports
const categoriesRoutes = require("./routes/categories");
const productsRoutes = require("./routes/products");
const ordersRoutes = require("./routes/orders");
const adminRoutes = require("./routes/admin");
const favoriteListRoutes = require("./routes/favoriteList");
const deliveryStatusRoutes = require("./routes/deliveryStatus");
const paymentStatusRoutes = require("./routes/paymentStatus");
const discountProductsRoutes = require("./routes/discountProducts");

// Mount routes
app.use("/api/categories", categoriesRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/favorite-list", favoriteListRoutes);
app.use("/api/delivery-status", deliveryStatusRoutes);
app.use("/api/payment-status", paymentStatusRoutes);
app.use("/api/discount-products", discountProductsRoutes);

// Export app for Vercel serverless; start server when running locally
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Connected to Supabase: ${process.env.SUPABASE_URL}`);
  });
}

module.exports = app;
