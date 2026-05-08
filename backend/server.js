require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const supabase = require("./lib/supabase");
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../public")));

// ==================== UTILITY FUNCTIONS ====================

function normalizeUnit(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildProductUnits(product) {
  const units = new Set();
  const unitLabel = normalizeUnit(product.unit_label);
  const packageUnit = normalizeUnit(product.package_unit);

  if (product.selling_type === "package") {
    // Package type: show carton and small unit
    units.add("carton");
    if (unitLabel) {
      units.add(unitLabel);
    }
    if (packageUnit) {
      units.add(packageUnit);
      if (packageUnit.endsWith("s") && packageUnit.length > 1) {
        units.add(packageUnit.slice(0, -1));
      }
    }
  } else {
    // Unit type: show only the small unit, no carton
    if (unitLabel) {
      units.add(unitLabel);
    } else {
      units.add("unit");
    }
  }

  return Array.from(units);
}

function getProductUnitPrice(product, unit) {
  const normalizedUnit = normalizeUnit(unit);
  const normalizedUnitLabel = normalizeUnit(product.unit_label);
  const normalizedPackageUnit = normalizeUnit(product.package_unit);
  const singularPackageUnit = normalizedPackageUnit.endsWith("s")
    ? normalizedPackageUnit.slice(0, -1)
    : normalizedPackageUnit;

  if (normalizedUnit === "carton") {
    return Number(product.price);
  }

  if (
    normalizedUnit === normalizedUnitLabel ||
    normalizedUnit === normalizedPackageUnit ||
    normalizedUnit === singularPackageUnit
  ) {
    if (product.selling_type === "package") {
      if (product.unit_price) {
        return Number(product.unit_price);
      }
      // Calculate unit price from carton price / package quantity
      const packageQuantity = Number(product.package_quantity) || 1;
      return Number((Number(product.price) / packageQuantity).toFixed(2));
    }
    return Number(product.price);
  }

  return null;
}

function toSingularUnit(value) {
  const normalized = normalizeUnit(value);
  if (!normalized) return "";
  if (normalized.endsWith("s") && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function getSmallUnitForProduct(product) {
  const unitLabel = toSingularUnit(product.unit_label);
  if (unitLabel && unitLabel !== "carton") {
    return unitLabel;
  }

  const packageUnit = toSingularUnit(product.package_unit);
  if (packageUnit && packageUnit !== "carton") {
    return packageUnit;
  }

  return "unit";
}

/**
 * Get available units for a product based on package_quantity
 * - If package_quantity > 1: ["unit", "carton"]
 * - Otherwise: ["unit"]
 */
function getAvailableUnits(product) {
  const packageQty = Number(product.package_quantity) || 1;
  if (packageQty > 1) {
    return ["unit", "carton"];
  }
  return ["unit"];
}

function hydrateOrderPricing(order, products) {
  if (!order || !Array.isArray(order.items)) {
    return {
      ...order,
      items: [],
      total_amount: Number((Number(order?.total_amount) || 0).toFixed(2)),
    };
  }

  let totalAmount = 0;
  const hydratedItems = order.items.map((item) => {
    const product = products.find((p) => p.id === item.product_id);
    const quantity = Number(item.quantity) || 0;
    const unit = normalizeUnit(item.unit);

    if (!product) {
      const existingLineTotal =
        item.line_total == null ? null : Number(item.line_total);
      if (existingLineTotal !== null && Number.isFinite(existingLineTotal)) {
        totalAmount += existingLineTotal;
      }

      return {
        ...item,
        quantity,
        unit,
        line_total: existingLineTotal,
      };
    }

    const unitPrice = getProductUnitPrice(product, unit);
    const lineTotal =
      unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

    if (lineTotal !== null) {
      totalAmount += lineTotal;
    }

    return {
      ...item,
      product_name: item.product_name || product.name,
      quantity,
      unit,
      unit_price: unitPrice,
      line_total: lineTotal,
    };
  });

  return {
    ...order,
    items: hydratedItems,
    total_amount: Number(totalAmount.toFixed(2)),
  };
}

function aggregateMegaBuyItems(products, sourceOrders) {
  const perProduct = new Map();

  sourceOrders.forEach((order) => {
    order.items.forEach((item) => {
      const key = item.product_id;
      if (!perProduct.has(key)) {
        perProduct.set(key, []);
      }
      perProduct.get(key).push(item);
    });
  });

  const mergedItems = [];
  let totalAmount = 0;

  for (const [productId, sourceItems] of perProduct.entries()) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      throw new Error(`Product '${productId}' was not found while aggregating`);
    }

    if (product.selling_type === "package") {
      const cartonSize = Number(product.package_quantity) || 1;
      const smallUnit = getSmallUnitForProduct(product);
      const packageUnit = toSingularUnit(product.package_unit);

      let totalSmallUnits = 0;

      sourceItems.forEach((item) => {
        const itemUnit = toSingularUnit(item.unit);
        const quantity = Number(item.quantity) || 0;

        if (itemUnit === "carton") {
          totalSmallUnits += quantity * cartonSize;
          return;
        }

        if (
          itemUnit === smallUnit ||
          (packageUnit && itemUnit === packageUnit)
        ) {
          totalSmallUnits += quantity;
        }
      });

      // Round totalSmallUnits to 2 decimal places to avoid floating-point precision issues
      totalSmallUnits = Number(totalSmallUnits.toFixed(2));
      const cartonCount = Math.floor(totalSmallUnits / cartonSize);
      // Round remainder to 2 decimal places to avoid floating-point precision issues
      const remainder = Number((totalSmallUnits % cartonSize).toFixed(2));

      if (cartonCount > 0) {
        const unitPrice = getProductUnitPrice(product, "carton");
        const lineTotal =
          unitPrice !== null
            ? Number((unitPrice * cartonCount).toFixed(2))
            : null;
        if (lineTotal !== null) {
          totalAmount += lineTotal;
        }
        mergedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: cartonCount,
          unit: "carton",
          unit_price: unitPrice,
          line_total: lineTotal,
        });
      }

      if (remainder > 0) {
        const unitPrice = getProductUnitPrice(product, smallUnit);
        const lineTotal =
          unitPrice !== null
            ? Number((unitPrice * remainder).toFixed(2))
            : null;
        if (lineTotal !== null) {
          totalAmount += lineTotal;
        }
        mergedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: remainder,
          unit: smallUnit,
          unit_price: unitPrice,
          line_total: lineTotal,
        });
      }

      continue;
    }

    const perUnit = new Map();

    sourceItems.forEach((item) => {
      const unitKey = toSingularUnit(item.unit) || "unit";
      const quantity = Number(item.quantity) || 0;
      // Round to 2 decimal places to avoid floating-point precision issues
      perUnit.set(
        unitKey,
        Number(((perUnit.get(unitKey) || 0) + quantity).toFixed(2)),
      );
    });

    for (const [unitKey, quantity] of perUnit.entries()) {
      const unitPrice = getProductUnitPrice(product, unitKey);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;
      if (lineTotal !== null) {
        totalAmount += lineTotal;
      }

      mergedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit: unitKey,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }
  }

  return {
    items: mergedItems,
    total_amount: Number(totalAmount.toFixed(2)),
  };
}

function getMegaChildOrderIds(order) {
  if (
    Array.isArray(order.child_order_ids) &&
    order.child_order_ids.length > 0
  ) {
    return order.child_order_ids;
  }

  if (
    Array.isArray(order.source_order_ids) &&
    order.source_order_ids.length > 0
  ) {
    return order.source_order_ids;
  }

  return [];
}

// ==================== SUPABASE DATA HELPERS ====================

async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

async function fetchProducts() {
  // Join products with product_metadata
  const { data, error } = await supabase
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
    .order("name", { ascending: true });
  if (error) throw error;

  // Flatten the joined data
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: p.price,
    package_quantity: p.package_quantity,
    // Metadata fields (may be null if no metadata exists)
    category_id: p.product_metadata?.category_id,
    description: p.product_metadata?.description || "",
    selling_type: p.product_metadata?.selling_type || "package",
    unit_label: p.product_metadata?.unit_label || "unit",
    unit_price: p.product_metadata?.unit_price,
    package_unit: p.product_metadata?.package_unit || "units",
    created_at: p.product_metadata?.created_at,
  }));
}

async function fetchOrders() {
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: true });
  if (ordersError) throw ordersError;

  // Fetch all order items
  const { data: allItems, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .order("sort_order", { ascending: true });
  if (itemsError) throw itemsError;

  // Group items by order_id
  const itemsByOrder = {};
  for (const item of allItems) {
    if (!itemsByOrder[item.order_id]) {
      itemsByOrder[item.order_id] = [];
    }
    itemsByOrder[item.order_id].push({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity),
      unit: item.unit,
      unit_price: item.unit_price != null ? Number(item.unit_price) : null,
      line_total: item.line_total != null ? Number(item.line_total) : null,
    });
  }

  return orders.map((order) => {
    const { secret_phrase, ...rest } = order;
    return {
      ...rest,
      has_secret_phrase: Boolean(secret_phrase),
      items: itemsByOrder[order.id] || [],
    };
  });
}

async function fetchOrderById(orderId) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (orderError) return null;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (itemsError) throw itemsError;

  return {
    ...order,
    items: (items || []).map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity),
      unit: item.unit,
      unit_price: item.unit_price != null ? Number(item.unit_price) : null,
      line_total: item.line_total != null ? Number(item.line_total) : null,
    })),
  };
}

async function saveOrderItems(orderId, items) {
  // Delete existing items
  const { error: deleteError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);
  if (deleteError) throw deleteError;

  // Insert new items
  if (items.length > 0) {
    const rows = items.map((item, index) => ({
      order_id: orderId,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: item.line_total,
      sort_order: index,
    }));

    const { error: insertError } = await supabase
      .from("order_items")
      .insert(rows);
    if (insertError) throw insertError;
  }
}

// ==================== CATEGORY ROUTES ====================

// Get all categories
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await fetchCategories();
    res.json(categories);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load categories: " + error.message });
  }
});

// Get category by ID
app.get("/api/categories/:id", async (req, res) => {
  try {
    const { data: category, error } = await supabase
      .from("categories")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(category);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load category: " + error.message });
  }
});

// Create new category
app.post("/api/categories", async (req, res) => {
  const { name, description, vat } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Category name is required" });
  }

  try {
    // Check if category already exists
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .ilike("name", name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const newCategory = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description || "",
      vat: vat != null ? Number(vat) : 6,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("categories")
      .insert(newCategory)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to create category: " + error.message });
  }
});

// Update category
app.put("/api/categories/:id", async (req, res) => {
  const { name, description, vat } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Category name is required" });
  }

  try {
    const { data: category, error: findError } = await supabase
      .from("categories")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (findError || !category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check for name conflict
    const { data: conflicts } = await supabase
      .from("categories")
      .select("id")
      .ilike("name", name.trim())
      .neq("id", req.params.id)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return res.status(400).json({ error: "Category name already exists" });
    }

    const { data, error } = await supabase
      .from("categories")
      .update({
        name: name.trim(),
        description: description || "",
        vat: vat != null ? Number(vat) : (category.vat ?? 6),
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update category: " + error.message });
  }
});

// Delete category
app.delete("/api/categories/:id", async (req, res) => {
  try {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", req.params.id)
      .single();

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check if category has products (via product_metadata)
    const { data: products } = await supabase
      .from("product_metadata")
      .select("product_id")
      .eq("category_id", req.params.id)
      .limit(1);

    if (products && products.length > 0) {
      return res
        .status(400)
        .json({ error: "Cannot delete category with products" });
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete category: " + error.message });
  }
});

// ==================== PRODUCT ROUTES ====================

// Get all products
app.get("/api/products", async (req, res) => {
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
app.get("/api/products/:id", async (req, res) => {
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
app.post("/api/products", async (req, res) => {
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
    // Check if category exists
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", category_id)
      .single();

    if (!category) {
      return res.status(400).json({ error: "Category not found" });
    }

    const productId = req.body.id || Date.now().toString();
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
app.put("/api/products/:id", async (req, res) => {
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

// Delete product
app.delete("/api/products/:id", async (req, res) => {
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

// ==================== ORDER ROUTES ====================

app.get("/api/orders", async (req, res) => {
  try {
    const orders = await fetchOrders();
    const products = await fetchProducts();
    const hydrated = orders.map((order) =>
      hydrateOrderPricing(order, products),
    );
    res.json(hydrated);
  } catch (error) {
    res.status(500).json({ error: "Failed to load orders: " + error.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    const products = await fetchProducts();
    const hydrated = hydrateOrderPricing(order, products);
    const { secret_phrase, ...orderResponse } = hydrated;
    res.json({
      ...orderResponse,
      has_secret_phrase: Boolean(secret_phrase),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load order: " + error.message });
  }
});

app.post("/api/orders", async (req, res) => {
  const { person_name, order_date, secret_phrase, items } = req.body;

  if (!person_name || person_name.trim() === "") {
    return res.status(400).json({ error: "Person name is required" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: "Order must include at least one item" });
  }

  try {
    // Check for duplicate person name (case-insensitive, only for normal orders)
    const { data: existingOrders } = await supabase
      .from("orders")
      .select("id, person_name")
      .ilike("person_name", person_name.trim())
      .is("order_type", null);

    if (existingOrders && existingOrders.length > 0) {
      return res.status(400).json({
        error: `An order for "${person_name.trim()}" already exists`,
      });
    }

    const products = await fetchProducts();
    const orderItems = [];
    let orderTotal = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const quantity = Number(item.quantity);
      const unit = normalizeUnit(item.unit);
      const product = products.find((p) => p.id === item.product_id);

      if (!product) {
        return res
          .status(400)
          .json({ error: `Product not found at line ${index + 1}` });
      }

      if (!quantity || quantity <= 0) {
        return res.status(400).json({
          error: `Quantity must be greater than 0 at line ${index + 1}`,
        });
      }

      if (!unit) {
        return res
          .status(400)
          .json({ error: `Unit is required at line ${index + 1}` });
      }

      const allowedUnits = buildProductUnits(product);
      if (!allowedUnits.includes(unit)) {
        return res.status(400).json({
          error: `Unit '${item.unit}' is not valid for ${product.name}. Allowed units: ${allowedUnits.join(", ")}`,
        });
      }

      const unitPrice = getProductUnitPrice(product, unit);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

      if (lineTotal !== null) {
        orderTotal += lineTotal;
      }

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    const orderId = `ord_${Date.now()}`;
    const now = new Date().toISOString();

    const newOrder = {
      id: orderId,
      person_name: person_name.trim(),
      order_date: order_date || new Date().toISOString().split("T")[0],
      state: "Draft",
      secret_phrase: secret_phrase || null,
      total_amount: Number(orderTotal.toFixed(2)),
      created_at: now,
      updated_at: now,
    };

    const { data: savedOrder, error: orderError } = await supabase
      .from("orders")
      .insert(newOrder)
      .select()
      .single();

    if (orderError) throw orderError;

    await saveOrderItems(orderId, orderItems);

    const { secret_phrase: _, ...orderResponse } = savedOrder;
    res.status(201).json({
      ...orderResponse,
      has_secret_phrase: Boolean(savedOrder.secret_phrase),
      items: orderItems,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create order: " + error.message });
  }
});

app.put("/api/orders/:id", async (req, res) => {
  const { person_name, order_date, items } = req.body;

  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type === "mega_buy") {
      return res.status(400).json({
        error:
          "Mega Buy order product list and quantity are auto-generated and cannot be edited manually",
      });
    }

    const isEditableDeliveredChild =
      order.state === "Delivered" && Boolean(order.locked_by_mega_order_id);
    if (order.state !== "Draft" && !isEditableDeliveredChild) {
      return res.status(400).json({
        error:
          "Only Draft orders and Delivered child orders from a Mega Buy can be edited",
      });
    }

    if (!person_name || person_name.trim() === "") {
      return res.status(400).json({ error: "Person name is required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Order must include at least one item" });
    }

    const products = await fetchProducts();
    const orderItems = [];
    let orderTotal = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const quantity = Number(item.quantity);
      const unit = normalizeUnit(item.unit);
      const product = products.find((p) => p.id === item.product_id);

      if (!product) {
        return res
          .status(400)
          .json({ error: `Product not found at line ${index + 1}` });
      }

      if (!quantity || quantity <= 0) {
        return res.status(400).json({
          error: `Quantity must be greater than 0 at line ${index + 1}`,
        });
      }

      if (!unit) {
        return res
          .status(400)
          .json({ error: `Unit is required at line ${index + 1}` });
      }

      const allowedUnits = buildProductUnits(product);
      if (!allowedUnits.includes(unit)) {
        return res.status(400).json({
          error: `Unit '${item.unit}' is not valid for ${product.name}. Allowed units: ${allowedUnits.join(", ")}`,
        });
      }

      const unitPrice = getProductUnitPrice(product, unit);
      const lineTotal =
        unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

      if (lineTotal !== null) {
        orderTotal += lineTotal;
      }

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    const now = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        person_name: person_name.trim(),
        order_date: order_date || order.order_date,
        total_amount: Number(orderTotal.toFixed(2)),
        updated_at: now,
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await saveOrderItems(req.params.id, orderItems);

    const { secret_phrase: _, ...orderResponse } = updatedOrder;
    res.json({
      ...orderResponse,
      has_secret_phrase: Boolean(updatedOrder.secret_phrase),
      items: orderItems,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order: " + error.message });
  }
});

app.post("/api/orders/mega-buy", async (req, res) => {
  try {
    const allOrders = await fetchOrders();
    const products = await fetchProducts();

    // Hydrate all orders for proper pricing
    const hydratedOrders = allOrders.map((o) =>
      hydrateOrderPricing(o, products),
    );

    // Get all order IDs that are already assigned to a mega order
    const assignedOrderIds = new Set();
    hydratedOrders.forEach((o) => {
      if (o.order_type === "mega_buy" && Array.isArray(o.child_order_ids)) {
        o.child_order_ids.forEach((id) => assignedOrderIds.add(id));
      }
    });

    const sourceOrders = hydratedOrders.filter(
      (order) =>
        order.state === "Draft" &&
        order.order_type !== "mega_buy" &&
        !assignedOrderIds.has(order.id),
    );

    if (sourceOrders.length < 2) {
      return res.status(400).json({
        error:
          "Mega Buy requires at least 2 Draft normal orders that are not already assigned to another Mega order",
      });
    }

    const sourceOrderIds = sourceOrders.map((order) => order.id);

    let aggregated;
    try {
      aggregated = aggregateMegaBuyItems(products, sourceOrders);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const orderId = `ord_${Date.now()}`;
    const now = new Date().toISOString();

    const megaOrder = {
      id: orderId,
      person_name: req.body.person_name || "Mega Buy Order",
      order_date: req.body.order_date || new Date().toISOString().split("T")[0],
      state: "Draft",
      order_type: "mega_buy",
      child_order_ids: sourceOrderIds,
      source_order_ids: sourceOrderIds,
      immutable_items: true,
      total_amount: aggregated.total_amount,
      created_at: now,
      updated_at: now,
    };

    const { data: savedOrder, error: orderError } = await supabase
      .from("orders")
      .insert(megaOrder)
      .select()
      .single();

    if (orderError) throw orderError;

    await saveOrderItems(orderId, aggregated.items);

    const { secret_phrase, ...orderResponse } = savedOrder;
    res.status(201).json({
      ...orderResponse,
      has_secret_phrase: Boolean(secret_phrase),
      items: aggregated.items,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to create Mega Buy order: " + error.message });
  }
});

app.post("/api/orders/:id/recalculate", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res
        .status(400)
        .json({ error: "Only Mega Buy orders can be recalculated" });
    }

    if (!["Draft", "Delivered"].includes(order.state)) {
      return res.status(400).json({
        error: "Only Draft or Delivered Mega Buy orders can be recalculated",
      });
    }

    const allOrders = await fetchOrders();
    const products = await fetchProducts();
    const hydratedOrders = allOrders.map((o) =>
      hydrateOrderPricing(o, products),
    );

    let sourceOrders = [];
    let childOrderIds = [];

    if (order.state === "Draft") {
      // Get all order IDs that are already assigned to another mega order (not this one)
      const assignedOrderIds = new Set();
      hydratedOrders.forEach((o) => {
        if (
          o.order_type === "mega_buy" &&
          o.id !== order.id &&
          Array.isArray(o.child_order_ids)
        ) {
          o.child_order_ids.forEach((id) => assignedOrderIds.add(id));
        }
      });

      sourceOrders = hydratedOrders.filter(
        (item) =>
          item.state === "Draft" &&
          item.order_type !== "mega_buy" &&
          !assignedOrderIds.has(item.id),
      );

      if (sourceOrders.length < 2) {
        return res.status(400).json({
          error:
            "Mega Buy recalculation requires at least 2 Draft normal orders that are not already assigned to another Mega order",
        });
      }

      childOrderIds = sourceOrders.map((item) => item.id);
    } else {
      childOrderIds = getMegaChildOrderIds(order);

      if (childOrderIds.length === 0) {
        return res.status(400).json({
          error:
            "Delivered Mega Buy order has no child orders to recalculate from",
        });
      }

      sourceOrders = hydratedOrders.filter(
        (item) =>
          childOrderIds.includes(item.id) &&
          item.order_type !== "mega_buy" &&
          item.state === "Delivered",
      );

      if (sourceOrders.length !== childOrderIds.length) {
        return res.status(400).json({
          error:
            "All child orders must be in Delivered state before recalculating a Delivered Mega Buy order",
        });
      }
    }

    let aggregated;
    try {
      aggregated = aggregateMegaBuyItems(products, sourceOrders);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const now = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        total_amount: aggregated.total_amount,
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        updated_at: now,
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await saveOrderItems(req.params.id, aggregated.items);

    const { secret_phrase, ...orderResponse } = updatedOrder;
    res.json({
      ...orderResponse,
      has_secret_phrase: Boolean(secret_phrase),
      items: aggregated.items,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to recalculate order: " + error.message });
  }
});

app.post("/api/orders/:id/place", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res
        .status(400)
        .json({ error: "Only Mega Buy orders can be placed with this action" });
    }

    if (order.state !== "Draft") {
      return res
        .status(400)
        .json({ error: "Only Draft Mega Buy orders can be placed" });
    }

    // Recalculate mega order before placing - re-select all Draft normal orders not assigned to another mega order
    const allOrders = await fetchOrders();
    const products = await fetchProducts();
    const hydratedOrders = allOrders.map((o) =>
      hydrateOrderPricing(o, products),
    );

    // Get all order IDs that are already assigned to another mega order (not this one)
    const assignedOrderIds = new Set();
    hydratedOrders.forEach((o) => {
      if (
        o.order_type === "mega_buy" &&
        o.id !== order.id &&
        Array.isArray(o.child_order_ids)
      ) {
        o.child_order_ids.forEach((id) => assignedOrderIds.add(id));
      }
    });

    const sourceOrders = hydratedOrders.filter(
      (item) =>
        item.state === "Draft" &&
        item.order_type !== "mega_buy" &&
        !assignedOrderIds.has(item.id),
    );

    if (sourceOrders.length < 2) {
      return res.status(400).json({
        error:
          "Mega Buy order requires at least 2 Draft normal orders that are not already assigned to another Mega order",
      });
    }

    const childOrderIds = sourceOrders.map((item) => item.id);

    // Aggregate items from source orders
    let aggregated;
    try {
      aggregated = aggregateMegaBuyItems(products, sourceOrders);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const now = new Date().toISOString();

    // Lock all child orders
    for (const childOrder of sourceOrders) {
      const { error: lockError } = await supabase
        .from("orders")
        .update({
          state: "Locked",
          locked_by_mega_order_id: order.id,
          locked_at: now,
          updated_at: now,
        })
        .eq("id", childOrder.id);

      if (lockError) throw lockError;
    }

    // Update and lock the mega order with recalculated items
    const { error: megaLockError } = await supabase
      .from("orders")
      .update({
        state: "Locked",
        total_amount: aggregated.total_amount,
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        placed_at: now,
        updated_at: now,
      })
      .eq("id", req.params.id);

    if (megaLockError) throw megaLockError;

    // Save recalculated items
    await saveOrderItems(req.params.id, aggregated.items);

    res.json({
      message: "Mega Buy order placed successfully",
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: "Locked",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to place order: " + error.message });
  }
});

app.post("/api/orders/:id/deliver", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res.status(400).json({
        error: "Only Mega Buy orders can be delivered with this action",
      });
    }

    if (order.state !== "Locked") {
      return res
        .status(400)
        .json({ error: "Only Locked Mega Buy orders can be delivered" });
    }

    const childOrderIds = getMegaChildOrderIds(order);

    if (childOrderIds.length < 2) {
      return res
        .status(400)
        .json({ error: "Mega Buy order has invalid source orders" });
    }

    const { data: sourceOrders, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .in("id", childOrderIds);

    if (fetchError) throw fetchError;

    if (sourceOrders.length !== childOrderIds.length) {
      return res
        .status(400)
        .json({ error: "One or more source orders no longer exist" });
    }

    if (sourceOrders.some((item) => item.order_type === "mega_buy")) {
      return res
        .status(400)
        .json({ error: "Mega Buy order cannot have Mega Buy child orders" });
    }

    if (sourceOrders.some((item) => item.state !== "Locked")) {
      return res.status(400).json({
        error:
          "All child orders must be Locked before delivering Mega Buy order",
      });
    }

    const now = new Date().toISOString();

    for (const childOrder of sourceOrders) {
      const { error: deliverError } = await supabase
        .from("orders")
        .update({
          state: "Delivered",
          updated_at: now,
          delivered_at: now,
        })
        .eq("id", childOrder.id);

      if (deliverError) throw deliverError;
    }

    const { error: megaDeliverError } = await supabase
      .from("orders")
      .update({
        state: "Delivered",
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        updated_at: now,
        delivered_at: now,
      })
      .eq("id", req.params.id);

    if (megaDeliverError) throw megaDeliverError;

    res.json({
      message: "Mega Buy order delivered successfully",
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: "Delivered",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to deliver order: " + error.message });
  }
});

// Hidden unlock endpoint - returns Locked Mega order and its children to Draft state
app.get("/api/orders/:id/unlock", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res
        .status(400)
        .json({ error: "Only Mega Buy orders can be unlocked" });
    }

    if (order.state !== "Locked") {
      return res
        .status(400)
        .json({ error: "Only Locked Mega Buy orders can be unlocked" });
    }

    const childOrderIds = getMegaChildOrderIds(order);

    if (childOrderIds.length < 2) {
      return res
        .status(400)
        .json({ error: "Mega Buy order has invalid source orders" });
    }

    const { data: sourceOrders, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .in("id", childOrderIds);

    if (fetchError) throw fetchError;

    if (sourceOrders.length !== childOrderIds.length) {
      return res
        .status(400)
        .json({ error: "One or more source orders no longer exist" });
    }

    if (sourceOrders.some((item) => item.order_type === "mega_buy")) {
      return res
        .status(400)
        .json({ error: "Mega Buy order cannot have Mega Buy child orders" });
    }

    if (sourceOrders.some((item) => item.state !== "Locked")) {
      return res.status(400).json({
        error: "All child orders must be Locked to unlock Mega Buy order",
      });
    }

    const now = new Date().toISOString();

    // Unlock all child orders - return them to Draft state
    for (const childOrder of sourceOrders) {
      const { error: unlockError } = await supabase
        .from("orders")
        .update({
          state: "Draft",
          locked_by_mega_order_id: null,
          locked_at: null,
          updated_at: now,
        })
        .eq("id", childOrder.id);

      if (unlockError) throw unlockError;
    }

    // Unlock the mega order - return to Draft state
    const { error: megaUnlockError } = await supabase
      .from("orders")
      .update({
        state: "Draft",
        placed_at: null,
        updated_at: now,
      })
      .eq("id", req.params.id);

    if (megaUnlockError) throw megaUnlockError;

    res.json({
      message: "Mega Buy order unlocked successfully",
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: "Draft",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to unlock order: " + error.message });
  }
});

app.post("/api/orders/:id/close", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "mega_buy") {
      return res
        .status(400)
        .json({ error: "Only Mega Buy orders can be closed with this action" });
    }

    if (order.state !== "Delivered") {
      return res
        .status(400)
        .json({ error: "Only Delivered Mega Buy orders can be closed" });
    }

    const childOrderIds = getMegaChildOrderIds(order);

    if (childOrderIds.length < 2) {
      return res
        .status(400)
        .json({ error: "Mega Buy order has invalid source orders" });
    }

    const { data: sourceOrders, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .in("id", childOrderIds);

    if (fetchError) throw fetchError;

    if (sourceOrders.length !== childOrderIds.length) {
      return res
        .status(400)
        .json({ error: "One or more source orders no longer exist" });
    }

    if (sourceOrders.some((item) => item.order_type === "mega_buy")) {
      return res
        .status(400)
        .json({ error: "Mega Buy order cannot have Mega Buy child orders" });
    }

    if (sourceOrders.some((item) => item.state !== "Delivered")) {
      return res.status(400).json({
        error:
          "All child orders must be Delivered before closing Mega Buy order",
      });
    }

    const now = new Date().toISOString();

    for (const childOrder of sourceOrders) {
      const { error: closeError } = await supabase
        .from("orders")
        .update({
          state: "Closed",
          updated_at: now,
        })
        .eq("id", childOrder.id);

      if (closeError) throw closeError;
    }

    const { error: megaCloseError } = await supabase
      .from("orders")
      .update({
        state: "Closed",
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        updated_at: now,
      })
      .eq("id", req.params.id);

    if (megaCloseError) throw megaCloseError;

    res.json({
      message: "Mega Buy order closed successfully",
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: "Closed",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to close order: " + error.message });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Validate secret phrase if order has one
    if (order.secret_phrase) {
      const { secret_phrase } = req.body || {};
      if (!secret_phrase || secret_phrase !== order.secret_phrase) {
        return res.status(403).json({ error: "Incorrect secret phrase" });
      }
    }

    if (order.order_type === "mega_buy" && order.state === "Closed") {
      const childOrderIds = getMegaChildOrderIds(order);

      if (childOrderIds.length > 0) {
        const { data: sourceOrders, error: fetchError } = await supabase
          .from("orders")
          .select("*")
          .in("id", childOrderIds);

        if (fetchError) throw fetchError;

        if (sourceOrders.length !== childOrderIds.length) {
          return res
            .status(400)
            .json({ error: "One or more child orders no longer exist" });
        }

        if (sourceOrders.some((item) => item.order_type === "mega_buy")) {
          return res.status(400).json({
            error: "Mega Buy order cannot have Mega Buy child orders",
          });
        }

        if (sourceOrders.some((item) => item.state !== "Closed")) {
          return res.status(400).json({
            error:
              "All child orders must be Closed before deleting a Closed Mega Buy order",
          });
        }

        const { error: childDeleteError } = await supabase
          .from("orders")
          .delete()
          .in("id", childOrderIds);

        if (childDeleteError) throw childDeleteError;
      }

      const { error: megaDeleteError } = await supabase
        .from("orders")
        .delete()
        .eq("id", req.params.id);

      if (megaDeleteError) throw megaDeleteError;

      return res.json({
        message: "Closed Mega Buy order and child orders deleted successfully",
        mega_order_id: order.id,
        child_order_ids: childOrderIds,
      });
    }

    if (order.state !== "Draft") {
      return res.status(400).json({
        error:
          "Only Draft orders can be deleted, except Closed Mega Buy orders which delete with their child orders",
      });
    }

    // order_items deleted via ON DELETE CASCADE
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete order: " + error.message });
  }
});

// Export app for Vercel serverless; start server when running locally
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Connected to Supabase: ${process.env.SUPABASE_URL}`);
  });
}

module.exports = app;
