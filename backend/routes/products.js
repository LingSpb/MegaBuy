/**
 * Product routes for MegaBuy
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const supabase = require("../lib/supabase");
const { fetchProducts } = require("../lib/products");
const { getAvailableUnits } = require("../utils/pricing");
const {
  extractCategoryFromProductCode,
  ensureCategoryExists,
} = require("../utils/categories");

// Configure multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Get all products
router.get("/", async (req, res) => {
  try {
    const products = await fetchProducts();

    const enriched = products.map((product) => {
      return {
        ...product,
        units: getAvailableUnits(product),
      };
    });

    res.json(enriched);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load products: " + error.message });
  }
});

// Get product by ID
router.get("/:id", async (req, res) => {
  try {
    const { data: rawProduct, error } = await supabase
      .from("products")
      .select(
        `
        *,
        product_metadata (
          category_id,
          description,
          selling_type,
          unit_label,
          unit_price,
          package_unit,
          created_at
        )
      `,
      )
      .eq("id", req.params.id)
      .single();

    if (error || !rawProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Flatten the joined data
    const product = {
      id: rawProduct.id,
      name: rawProduct.name,
      brand: rawProduct.brand,
      price: rawProduct.price,
      package_quantity: rawProduct.package_quantity,
      category_id: rawProduct.product_metadata?.category_id,
      description: rawProduct.product_metadata?.description || "",
      selling_type: rawProduct.product_metadata?.selling_type || "package",
      unit_label: rawProduct.product_metadata?.unit_label || "unit",
      unit_price: rawProduct.product_metadata?.unit_price,
      package_unit: rawProduct.product_metadata?.package_unit || "units",
      created_at: rawProduct.product_metadata?.created_at,
    };

    res.json({
      ...product,
      units: getAvailableUnits(product),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load product: " + error.message });
  }
});

// Create new product
router.post("/", async (req, res) => {
  let {
    name,
    brand,
    category_id,
    description,
    selling_type,
    price,
    package_quantity,
  } = req.body;

  // Validation
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Product name is required" });
  }
  if (!selling_type || !["unit", "package"].includes(selling_type)) {
    return res
      .status(400)
      .json({ error: 'Selling type must be "unit" or "package"' });
  }
  if (!price || price <= 0) {
    return res.status(400).json({ error: "Price must be greater than 0" });
  }

  const productId = req.body.id || Date.now().toString();

  // Auto-derive category from product code if not provided
  if (!category_id) {
    category_id = extractCategoryFromProductCode(productId);
  }

  // Ensure category exists (create if needed)
  if (category_id) {
    await ensureCategoryExists(category_id);
  }

  try {
    const pkgQty =
      selling_type === "package" ? parseFloat(package_quantity) || 1 : 1;

    // Insert into products table (raw data)
    const newProduct = {
      id: productId,
      name: name.trim(),
      brand: brand ? brand.trim() : null,
      price: parseFloat(price),
      package_quantity: pkgQty,
    };

    const { error: productError } = await supabase
      .from("products")
      .insert(newProduct);

    if (productError) throw productError;

    // Insert into product_metadata table
    const metadata = {
      product_id: productId,
      category_id,
      description: description || "",
      selling_type,
      unit_label: (
        req.body.unit_label || (selling_type === "package" ? "unit" : "piece")
      ).trim(),
      unit_price:
        selling_type === "package"
          ? parseFloat(req.body.unit_price) || null
          : null,
      package_unit:
        selling_type === "package" ? req.body.package_unit || "units" : null,
      created_at: new Date().toISOString(),
    };

    const { error: metadataError } = await supabase
      .from("product_metadata")
      .insert(metadata);

    if (metadataError) throw metadataError;

    // Return combined product
    res.status(201).json({
      ...newProduct,
      ...metadata,
      id: productId,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to create product: " + error.message });
  }
});

// Update product
router.put("/:id", async (req, res) => {
  const {
    name,
    brand,
    category_id,
    description,
    selling_type,
    price,
    package_quantity,
  } = req.body;

  // Validation
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Product name is required" });
  }
  if (!category_id) {
    return res.status(400).json({ error: "Category ID is required" });
  }
  if (!selling_type || !["unit", "package"].includes(selling_type)) {
    return res
      .status(400)
      .json({ error: 'Selling type must be "unit" or "package"' });
  }
  if (!price || price <= 0) {
    return res.status(400).json({ error: "Price must be greater than 0" });
  }

  try {
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if product is used in Locked orders
    const { data: lockedItems } = await supabase
      .from("order_items")
      .select("id")
      .eq("product_id", req.params.id);

    if (lockedItems && lockedItems.length > 0) {
      // Check if any of these items are in Locked orders
      const { data: orders } = await supabase
        .from("order_items")
        .select("order_id")
        .eq("product_id", req.params.id);

      if (orders && orders.length > 0) {
        const orderIds = orders.map((item) => item.order_id);
        const { data: lockedOrders } = await supabase
          .from("orders")
          .select("id")
          .in("id", orderIds)
          .eq("state", "Locked")
          .limit(1);

        if (lockedOrders && lockedOrders.length > 0) {
          return res
            .status(400)
            .json({ error: "Cannot edit product used in Locked orders" });
        }
      }
    }

    // Check if category exists
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", category_id)
      .single();

    if (!category) {
      return res.status(400).json({ error: "Category not found" });
    }

    const pkgQty =
      selling_type === "package" ? parseFloat(package_quantity) || 1 : 1;

    // Update products table (raw data)
    const productUpdates = {
      name: name.trim(),
      brand: brand ? brand.trim() : null,
      price: parseFloat(price),
      package_quantity: pkgQty,
    };

    const { error: productError } = await supabase
      .from("products")
      .update(productUpdates)
      .eq("id", req.params.id);

    if (productError) throw productError;

    // Update product_metadata table
    const metadataUpdates = {
      category_id,
      description: description || "",
      selling_type,
      unit_label: (
        req.body.unit_label || (selling_type === "package" ? "unit" : "piece")
      ).trim(),
      unit_price:
        selling_type === "package"
          ? parseFloat(req.body.unit_price) || null
          : null,
      package_unit:
        selling_type === "package" ? req.body.package_unit || "units" : null,
    };

    const { error: metadataError } = await supabase
      .from("product_metadata")
      .update(metadataUpdates)
      .eq("product_id", req.params.id);

    if (metadataError) throw metadataError;

    // Return combined product
    res.json({
      id: req.params.id,
      ...productUpdates,
      ...metadataUpdates,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update product: " + error.message });
  }
});

// Import products from xlsx
router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Parse xlsx file from buffer
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ error: "No data found in file" });
    }

    // Expected columns: product code (id), name, brand, price, package_quantity
    // Support various column name formats
    const normalizeColumnName = (name) =>
      name
        .toLowerCase()
        .replace(/[_\s\-\(\)\.\/\\]/g, "") // Remove underscores, spaces, hyphens, parentheses, dots, slashes
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // Remove diacritics

    const findColumn = (row, ...names) => {
      const normalizedNames = names.map(normalizeColumnName);
      for (const key of Object.keys(row)) {
        const normalizedKey = normalizeColumnName(key);
        if (normalizedNames.includes(normalizedKey)) {
          return row[key];
        }
        // Also check if key contains any of the names
        for (const normalizedName of normalizedNames) {
          if (
            normalizedKey.includes(normalizedName) ||
            normalizedName.includes(normalizedKey)
          ) {
            return row[key];
          }
        }
      }
      return undefined;
    };

    // Log first row columns for debugging
    if (rows.length > 0) {
      console.log("Import: Found columns:", Object.keys(rows[0]));
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because row 1 is header, and we're 0-indexed

      const productCode = String(
        findColumn(
          row,
          "id",
          "productcode",
          "code",
          "product_code",
          "Mã SP",
          "masp",
          "sku",
          "mã",
          "ma",
          "số",
          "so",
        ) || "",
      ).trim();
      const name = String(
        findColumn(
          row,
          "name",
          "productname",
          "product_name",
          "Tên sản phẩm",
          "Tên sản phẩm (VI)",
          "tensanpham",
          "tên",
          "ten",
          "sản phẩm",
          "sanpham",
        ) || "",
      ).trim();
      const brand = String(
        findColumn(
          row,
          "brand",
          "Thương hiệu",
          "thuonghieu",
          "nhãn hiệu",
          "nhanhieu",
        ) || "",
      ).trim();
      const priceRaw = findColumn(
        row,
        "price",
        "Giá",
        "Giá (SEK)",
        "gia",
        "giá bán",
        "giaban",
        "đơn giá",
        "dongia",
        "unit price",
        "unitprice",
      );
      const packageQuantityRaw = findColumn(
        row,
        "packagequantity",
        "package_quantity",
        "qty",
        "quantity",
        "Quy cách",
        "quycach",
        "số lượng",
        "soluong",
        "đóng gói",
        "donggoi",
        "carton",
        "thùng",
        "thung",
      );

      if (!productCode) {
        results.errors.push(`Row ${rowNum}: Missing product code`);
        results.skipped++;
        continue;
      }

      if (!name) {
        results.errors.push(`Row ${rowNum}: Missing product name`);
        results.skipped++;
        continue;
      }

      const unitPrice = parseFloat(priceRaw);
      if (isNaN(unitPrice) || unitPrice < 0) {
        results.errors.push(`Row ${rowNum}: Invalid price "${priceRaw}"`);
        results.skipped++;
        continue;
      }

      // Package quantity is optional, default to 1
      let packageQuantity = 1;
      if (
        packageQuantityRaw !== undefined &&
        packageQuantityRaw !== null &&
        packageQuantityRaw !== ""
      ) {
        packageQuantity = parseFloat(packageQuantityRaw);
        if (isNaN(packageQuantity) || packageQuantity <= 0) {
          packageQuantity = 1; // Default to 1 if invalid
        }
      }

      // Get unit label if available
      const unitLabelRaw = findColumn(
        row,
        "unit",
        "unit_label",
        "unitlabel",
        "đơn vị",
        "donvi",
        "dvt",
        "đơn vị tính",
      );
      const unitLabel = unitLabelRaw ? String(unitLabelRaw).trim() : null;

      // Determine selling type based on package quantity
      const sellingType = packageQuantity > 1 ? "package" : "unit";

      // Store unit price directly (price per unit, not per carton)

      // Check if product exists
      const { data: existingProduct } = await supabase
        .from("products")
        .select("id")
        .eq("id", productCode)
        .single();

      // Extract category from product code
      const categoryId = extractCategoryFromProductCode(productCode);
      if (categoryId) {
        await ensureCategoryExists(categoryId);
      }

      if (existingProduct) {
        // Update existing product
        const updateData = {
          name,
          brand,
          price: unitPrice,
          package_quantity: packageQuantity,
          selling_type: sellingType,
        };
        if (unitLabel) updateData.unit_label = unitLabel;

        const { error: updateError } = await supabase
          .from("products")
          .update(updateData)
          .eq("id", productCode);

        if (updateError) {
          results.errors.push(
            `Row ${rowNum}: Update failed - ${updateError.message}`,
          );
        } else {
          // Upsert product_metadata with category
          if (categoryId) {
            await supabase.from("product_metadata").upsert(
              {
                product_id: productCode,
                category_id: categoryId,
                selling_type: sellingType,
                unit_label: unitLabel || "unit",
              },
              { onConflict: "product_id" },
            );
          }
          results.updated++;
        }
      } else {
        // Create new product
        const insertData = {
          id: productCode,
          name,
          brand,
          price: unitPrice,
          package_quantity: packageQuantity,
          selling_type: sellingType,
        };
        if (unitLabel) insertData.unit_label = unitLabel;

        const { error: insertError } = await supabase
          .from("products")
          .insert(insertData);

        if (insertError) {
          results.errors.push(
            `Row ${rowNum}: Insert failed - ${insertError.message}`,
          );
        } else {
          // Insert product_metadata with category
          if (categoryId) {
            await supabase.from("product_metadata").upsert(
              {
                product_id: productCode,
                category_id: categoryId,
                selling_type: sellingType,
                unit_label: unitLabel || "unit",
              },
              { onConflict: "product_id" },
            );
          }
          results.created++;
        }
      }
    }

    res.json({
      message: `Import complete: ${results.created} created, ${results.updated} updated${results.skipped > 0 ? `, ${results.skipped} skipped` : ""}`,
      created: results.created,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to import products: " + error.message });
  }
});

// Delete product
router.delete("/:id", async (req, res) => {
  try {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", req.params.id)
      .single();

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if product is used in Locked orders only
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id")
      .eq("product_id", req.params.id);

    if (items && items.length > 0) {
      const orderIds = items.map((item) => item.order_id);
      const { data: lockedOrders } = await supabase
        .from("orders")
        .select("id")
        .in("id", orderIds)
        .eq("state", "Locked")
        .limit(1);

      if (lockedOrders && lockedOrders.length > 0) {
        return res
          .status(400)
          .json({ error: "Cannot delete product used in Locked orders" });
      }
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete product: " + error.message });
  }
});

module.exports = router;
