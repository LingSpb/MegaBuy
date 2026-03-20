const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const LEGACY_STORE_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Migration logic: if old store.json exists but new files don't, split the data
function migrateFromLegacyFormat() {
  if (fs.existsSync(LEGACY_STORE_FILE) && !fs.existsSync(CATALOG_FILE) && !fs.existsSync(ORDERS_FILE)) {
    console.log('Migrating from legacy store.json format...');
    const legacyData = JSON.parse(fs.readFileSync(LEGACY_STORE_FILE, 'utf8'));
    
    // Write catalog
    const catalogData = {
      categories: legacyData.categories || [],
      products: legacyData.products || []
    };
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalogData, null, 2));
    
    // Write orders
    const ordersData = legacyData.orders || [];
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(ordersData, null, 2));
    
    console.log('Migration complete. New files created: catalog.json, orders.json');
  }
}

// Initialize data files if they don't exist
function initializeDataFiles() {
  if (!fs.existsSync(CATALOG_FILE)) {
    const initialCatalog = { categories: [], products: [] };
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(initialCatalog, null, 2));
  }
  
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
  }
}

// Run migration if needed, then initialize
migrateFromLegacyFormat();
initializeDataFiles();

// Utility functions to read/write data
function readCatalog() {
  const data = fs.readFileSync(CATALOG_FILE, 'utf8');
  const parsed = JSON.parse(data);
  return {
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    products: Array.isArray(parsed.products) ? parsed.products : []
  };
}

function writeCatalog(catalog) {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}

function readOrders() {
  const data = fs.readFileSync(ORDERS_FILE, 'utf8');
  const parsed = JSON.parse(data);
  return Array.isArray(parsed) ? parsed : [];
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function readData() {
  const catalog = readCatalog();
  const orders = readOrders().map(order => hydrateOrderPricing(order, catalog.products));
  return {
    categories: catalog.categories,
    products: catalog.products,
    orders: orders
  };
}

function writeData(data) {
  writeCatalog({
    categories: data.categories || [],
    products: data.products || []
  });
  writeOrders(data.orders || []);
}

function normalizeUnit(value) {
  return String(value || '').trim().toLowerCase();
}

function buildProductUnits(product) {
  const units = new Set(['carton']);
  const unitLabel = normalizeUnit(product.unit_label);
  const packageUnit = normalizeUnit(product.package_unit);

  if (unitLabel) {
    units.add(unitLabel);
  }
  if (packageUnit) {
    units.add(packageUnit);
    if (packageUnit.endsWith('s') && packageUnit.length > 1) {
      units.add(packageUnit.slice(0, -1));
    }
  }

  return Array.from(units);
}

function getProductUnitPrice(product, unit) {
  const normalizedUnit = normalizeUnit(unit);
  const normalizedUnitLabel = normalizeUnit(product.unit_label);
  const normalizedPackageUnit = normalizeUnit(product.package_unit);
  const singularPackageUnit = normalizedPackageUnit.endsWith('s')
    ? normalizedPackageUnit.slice(0, -1)
    : normalizedPackageUnit;

  if (normalizedUnit === 'carton') {
    return Number(product.price);
  }

  if (normalizedUnit === normalizedUnitLabel || normalizedUnit === normalizedPackageUnit || normalizedUnit === singularPackageUnit) {
    if (product.selling_type === 'package') {
      return product.unit_price ? Number(product.unit_price) : null;
    }
    return Number(product.price);
  }

  return null;
}

function toSingularUnit(value) {
  const normalized = normalizeUnit(value);
  if (!normalized) return '';
  if (normalized.endsWith('s') && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function getSmallUnitForProduct(product) {
  const unitLabel = toSingularUnit(product.unit_label);
  if (unitLabel && unitLabel !== 'carton') {
    return unitLabel;
  }

  const packageUnit = toSingularUnit(product.package_unit);
  if (packageUnit && packageUnit !== 'carton') {
    return packageUnit;
  }

  return 'unit';
}

function hydrateOrderPricing(order, products) {
  if (!order || !Array.isArray(order.items)) {
    return {
      ...order,
      items: [],
      total_amount: Number((Number(order?.total_amount) || 0).toFixed(2))
    };
  }

  let totalAmount = 0;
  const hydratedItems = order.items.map(item => {
    const product = products.find(p => p.id === item.product_id);
    const quantity = Number(item.quantity) || 0;
    const unit = normalizeUnit(item.unit);

    if (!product) {
      const existingLineTotal = item.line_total == null ? null : Number(item.line_total);
      if (existingLineTotal !== null && Number.isFinite(existingLineTotal)) {
        totalAmount += existingLineTotal;
      }

      return {
        ...item,
        quantity,
        unit,
        line_total: existingLineTotal
      };
    }

    const unitPrice = getProductUnitPrice(product, unit);
    const lineTotal = unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

    if (lineTotal !== null) {
      totalAmount += lineTotal;
    }

    return {
      ...item,
      product_name: item.product_name || product.name,
      quantity,
      unit,
      unit_price: unitPrice,
      line_total: lineTotal
    };
  });

  return {
    ...order,
    items: hydratedItems,
    total_amount: Number(totalAmount.toFixed(2))
  };
}

function aggregateMegaBuyItems(data, sourceOrders) {
  const perProduct = new Map();

  sourceOrders.forEach(order => {
    order.items.forEach(item => {
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
    const product = data.products.find(p => p.id === productId);
    if (!product) {
      throw new Error(`Product '${productId}' was not found while aggregating`);
    }

    if (product.selling_type === 'package') {
      const cartonSize = Number(product.package_quantity) || 1;
      const smallUnit = getSmallUnitForProduct(product);
      const packageUnit = toSingularUnit(product.package_unit);

      let totalSmallUnits = 0;

      sourceItems.forEach(item => {
        const itemUnit = toSingularUnit(item.unit);
        const quantity = Number(item.quantity) || 0;

        if (itemUnit === 'carton') {
          totalSmallUnits += quantity * cartonSize;
          return;
        }

        if (itemUnit === smallUnit || (packageUnit && itemUnit === packageUnit)) {
          totalSmallUnits += quantity;
        }
      });

      const cartonCount = Math.floor(totalSmallUnits / cartonSize);
      const remainder = totalSmallUnits % cartonSize;

      if (cartonCount > 0) {
        const unitPrice = getProductUnitPrice(product, 'carton');
        const lineTotal = unitPrice !== null ? Number((unitPrice * cartonCount).toFixed(2)) : null;
        if (lineTotal !== null) {
          totalAmount += lineTotal;
        }
        mergedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: cartonCount,
          unit: 'carton',
          unit_price: unitPrice,
          line_total: lineTotal
        });
      }

      if (remainder > 0) {
        const unitPrice = getProductUnitPrice(product, smallUnit);
        const lineTotal = unitPrice !== null ? Number((unitPrice * remainder).toFixed(2)) : null;
        if (lineTotal !== null) {
          totalAmount += lineTotal;
        }
        mergedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: remainder,
          unit: smallUnit,
          unit_price: unitPrice,
          line_total: lineTotal
        });
      }

      continue;
    }

    const perUnit = new Map();

    sourceItems.forEach(item => {
      const unitKey = toSingularUnit(item.unit) || 'unit';
      const quantity = Number(item.quantity) || 0;
      perUnit.set(unitKey, (perUnit.get(unitKey) || 0) + quantity);
    });

    for (const [unitKey, quantity] of perUnit.entries()) {
      const unitPrice = getProductUnitPrice(product, unitKey);
      const lineTotal = unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;
      if (lineTotal !== null) {
        totalAmount += lineTotal;
      }

      mergedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit: unitKey,
        unit_price: unitPrice,
        line_total: lineTotal
      });
    }
  }

  return {
    items: mergedItems,
    total_amount: Number(totalAmount.toFixed(2))
  };
}

function getMegaChildOrderIds(order) {
  if (Array.isArray(order.child_order_ids) && order.child_order_ids.length > 0) {
    return order.child_order_ids;
  }

  if (Array.isArray(order.source_order_ids) && order.source_order_ids.length > 0) {
    return order.source_order_ids;
  }

  return [];
}

// ==================== CATEGORY ROUTES ====================

// Get all categories
app.get('/api/categories', (req, res) => {
  const data = readData();
  res.json(data.categories);
});

// Get category by ID
app.get('/api/categories/:id', (req, res) => {
  const data = readData();
  const category = data.categories.find(c => c.id === req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }
  res.json(category);
});

// Create new category
app.post('/api/categories', (req, res) => {
  const { name, description } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const data = readData();
  
  // Check if category already exists
  if (data.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'Category already exists' });
  }

  const newCategory = {
    id: Date.now().toString(),
    name: name.trim(),
    description: description || '',
    created_at: new Date().toISOString()
  };

  data.categories.push(newCategory);
  writeData(data);
  res.status(201).json(newCategory);
});

// Update category
app.put('/api/categories/:id', (req, res) => {
  const { name, description } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const data = readData();
  const category = data.categories.find(c => c.id === req.params.id);
  
  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }

  // Check if new name conflicts with another category
  if (data.categories.find(c => c.id !== req.params.id && c.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'Category name already exists' });
  }

  category.name = name.trim();
  category.description = description || '';
  writeData(data);
  res.json(category);
});

// Delete category
app.delete('/api/categories/:id', (req, res) => {
  const data = readData();
  const categoryIndex = data.categories.findIndex(c => c.id === req.params.id);
  
  if (categoryIndex === -1) {
    return res.status(404).json({ error: 'Category not found' });
  }

  // Check if category has products
  const hasProducts = data.products.some(p => p.category_id === req.params.id);
  if (hasProducts) {
    return res.status(400).json({ error: 'Cannot delete category with products' });
  }

  data.categories.splice(categoryIndex, 1);
  writeData(data);
  res.json({ message: 'Category deleted successfully' });
});

// ==================== PRODUCT ROUTES ====================

// Get all products
app.get('/api/products', (req, res) => {
  const data = readData();
  const products = data.products.map(product => {
    const category = data.categories.find(c => c.id === product.category_id);
    return {
      ...product,
      category_name: category ? category.name : 'Unknown'
    };
  });
  res.json(products);
});

// Get product by ID
app.get('/api/products/:id', (req, res) => {
  const data = readData();
  const product = data.products.find(p => p.id === req.params.id);
  
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const category = data.categories.find(c => c.id === product.category_id);
  res.json({
    ...product,
    category_name: category ? category.name : 'Unknown'
  });
});

// Create new product
app.post('/api/products', (req, res) => {
  const { name, category_id, description, selling_type, price, package_quantity } = req.body;

  // Validation
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Product name is required' });
  }
  if (!category_id) {
    return res.status(400).json({ error: 'Category ID is required' });
  }
  if (!selling_type || !['unit', 'package'].includes(selling_type)) {
    return res.status(400).json({ error: 'Selling type must be "unit" or "package"' });
  }
  if (!price || price <= 0) {
    return res.status(400).json({ error: 'Price must be greater than 0' });
  }

  const data = readData();

  // Check if category exists
  if (!data.categories.find(c => c.id === category_id)) {
    return res.status(400).json({ error: 'Category not found' });
  }

  const newProduct = {
    id: Date.now().toString(),
    name: name.trim(),
    category_id,
    description: description || '',
    selling_type,
    unit_label: (req.body.unit_label || (selling_type === 'package' ? 'unit' : 'piece')).trim(),
    unit_price: selling_type === 'package' ? parseFloat(req.body.unit_price) || null : null,
    price: parseFloat(price),
    package_quantity: selling_type === 'package' ? parseInt(package_quantity) || 1 : 1,
    package_unit: selling_type === 'package' ? (req.body.package_unit || 'units') : null,
    created_at: new Date().toISOString()
  };

  data.products.push(newProduct);
  writeData(data);
  res.status(201).json(newProduct);
});

// Update product
app.put('/api/products/:id', (req, res) => {
  const { name, category_id, description, selling_type, price, package_quantity } = req.body;

  // Validation
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Product name is required' });
  }
  if (!category_id) {
    return res.status(400).json({ error: 'Category ID is required' });
  }
  if (!selling_type || !['unit', 'package'].includes(selling_type)) {
    return res.status(400).json({ error: 'Selling type must be "unit" or "package"' });
  }
  if (!price || price <= 0) {
    return res.status(400).json({ error: 'Price must be greater than 0' });
  }

  const data = readData();
  const product = data.products.find(p => p.id === req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Check if category exists
  if (!data.categories.find(c => c.id === category_id)) {
    return res.status(400).json({ error: 'Category not found' });
  }

  product.name = name.trim();
  product.category_id = category_id;
  product.description = description || '';
  product.selling_type = selling_type;
  product.unit_label = (req.body.unit_label || (selling_type === 'package' ? 'unit' : 'piece')).trim();
  product.unit_price = selling_type === 'package' ? parseFloat(req.body.unit_price) || null : null;
  product.price = parseFloat(price);
  product.package_quantity = selling_type === 'package' ? parseInt(package_quantity) || 1 : 1;
  product.package_unit = selling_type === 'package' ? (req.body.package_unit || 'units') : null;

  writeData(data);
  res.json(product);
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  const data = readData();
  const productIndex = data.products.findIndex(p => p.id === req.params.id);

  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const hasOrderItems = data.orders.some(order =>
    Array.isArray(order.items) && order.items.some(item => item.product_id === req.params.id)
  );
  if (hasOrderItems) {
    return res.status(400).json({ error: 'Cannot delete product used in orders' });
  }

  data.products.splice(productIndex, 1);
  writeData(data);
  res.json({ message: 'Product deleted successfully' });
});

// ==================== ORDER ROUTES ====================

app.get('/api/orders', (req, res) => {
  const data = readData();
  res.json(data.orders);
});

app.get('/api/orders/:id', (req, res) => {
  const data = readData();
  const order = data.orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json(order);
});

app.post('/api/orders', (req, res) => {
  const data = readData();
  const { person_name, order_date, items } = req.body;

  if (!person_name || person_name.trim() === '') {
    return res.status(400).json({ error: 'Person name is required' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must include at least one item' });
  }

  const orderItems = [];
  let orderTotal = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const quantity = Number(item.quantity);
    const unit = normalizeUnit(item.unit);
    const product = data.products.find(p => p.id === item.product_id);

    if (!product) {
      return res.status(400).json({ error: `Product not found at line ${index + 1}` });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: `Quantity must be greater than 0 at line ${index + 1}` });
    }

    if (!unit) {
      return res.status(400).json({ error: `Unit is required at line ${index + 1}` });
    }

    const allowedUnits = buildProductUnits(product);
    if (!allowedUnits.includes(unit)) {
      return res.status(400).json({
        error: `Unit '${item.unit}' is not valid for ${product.name}. Allowed units: ${allowedUnits.join(', ')}`
      });
    }

    const unitPrice = getProductUnitPrice(product, unit);
    const lineTotal = unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

    if (lineTotal !== null) {
      orderTotal += lineTotal;
    }

    orderItems.push({
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit,
      unit_price: unitPrice,
      line_total: lineTotal
    });
  }

  const newOrder = {
    id: `ord_${Date.now()}`,
    person_name: person_name.trim(),
    order_date: order_date || new Date().toISOString().split('T')[0],
    state: 'Draft',
    items: orderItems,
    total_amount: Number(orderTotal.toFixed(2)),
    created_at: new Date().toISOString()
  };

  data.orders.push(newOrder);
  writeData(data);
  res.status(201).json(newOrder);
});

app.put('/api/orders/:id', (req, res) => {
  const data = readData();
  const order = data.orders.find(o => o.id === req.params.id);
  const { person_name, order_date, items } = req.body;

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.state !== 'Draft') {
    return res.status(400).json({ error: 'Only Draft orders can be edited' });
  }

  if (order.order_type === 'mega_buy') {
    return res.status(400).json({ error: 'Mega Buy order product list and quantity are auto-generated and cannot be edited manually' });
  }

  if (!person_name || person_name.trim() === '') {
    return res.status(400).json({ error: 'Person name is required' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must include at least one item' });
  }

  const orderItems = [];
  let orderTotal = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const quantity = Number(item.quantity);
    const unit = normalizeUnit(item.unit);
    const product = data.products.find(p => p.id === item.product_id);

    if (!product) {
      return res.status(400).json({ error: `Product not found at line ${index + 1}` });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: `Quantity must be greater than 0 at line ${index + 1}` });
    }

    if (!unit) {
      return res.status(400).json({ error: `Unit is required at line ${index + 1}` });
    }

    const allowedUnits = buildProductUnits(product);
    if (!allowedUnits.includes(unit)) {
      return res.status(400).json({
        error: `Unit '${item.unit}' is not valid for ${product.name}. Allowed units: ${allowedUnits.join(', ')}`
      });
    }

    const unitPrice = getProductUnitPrice(product, unit);
    const lineTotal = unitPrice !== null ? Number((unitPrice * quantity).toFixed(2)) : null;

    if (lineTotal !== null) {
      orderTotal += lineTotal;
    }

    orderItems.push({
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit,
      unit_price: unitPrice,
      line_total: lineTotal
    });
  }

  order.person_name = person_name.trim();
  order.order_date = order_date || order.order_date;
  order.items = orderItems;
  order.total_amount = Number(orderTotal.toFixed(2));
  order.updated_at = new Date().toISOString();

  writeData(data);
  res.json(order);
});

app.post('/api/orders/mega-buy', (req, res) => {
  const data = readData();
  const sourceOrders = data.orders.filter(order => order.state === 'Draft' && order.order_type !== 'mega_buy');

  if (sourceOrders.length < 2) {
    return res.status(400).json({ error: 'Mega Buy requires at least 2 Draft normal orders' });
  }

  const sourceOrderIds = sourceOrders.map(order => order.id);

  let aggregated;
  try {
    aggregated = aggregateMegaBuyItems(data, sourceOrders);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const megaOrder = {
    id: `ord_${Date.now()}`,
    person_name: req.body.person_name || 'Mega Buy Order',
    order_date: req.body.order_date || new Date().toISOString().split('T')[0],
    state: 'Draft',
    order_type: 'mega_buy',
    child_order_ids: sourceOrderIds,
    source_order_ids: sourceOrderIds,
    immutable_items: true,
    items: aggregated.items,
    total_amount: aggregated.total_amount,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  data.orders.push(megaOrder);
  writeData(data);
  res.status(201).json(megaOrder);
});

app.post('/api/orders/:id/recalculate', (req, res) => {
  const data = readData();
  const order = data.orders.find(item => item.id === req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.order_type !== 'mega_buy') {
    return res.status(400).json({ error: 'Only Mega Buy orders can be recalculated' });
  }

  if (order.state !== 'Draft') {
    return res.status(400).json({ error: 'Only Draft Mega Buy orders can be recalculated' });
  }

  const sourceOrders = data.orders.filter(item => item.state === 'Draft' && item.order_type !== 'mega_buy');

  if (sourceOrders.length < 2) {
    return res.status(400).json({ error: 'Mega Buy recalculation requires at least 2 Draft normal orders' });
  }

  const childOrderIds = sourceOrders.map(item => item.id);

  let aggregated;
  try {
    aggregated = aggregateMegaBuyItems(data, sourceOrders);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  order.items = aggregated.items;
  order.total_amount = aggregated.total_amount;
  order.child_order_ids = childOrderIds;
  order.source_order_ids = childOrderIds;
  order.updated_at = new Date().toISOString();
  writeData(data);

  res.json(order);
});

app.post('/api/orders/:id/place', (req, res) => {
  const data = readData();
  const order = data.orders.find(item => item.id === req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.order_type !== 'mega_buy') {
    return res.status(400).json({ error: 'Only Mega Buy orders can be placed with this action' });
  }

  if (order.state !== 'Draft') {
    return res.status(400).json({ error: 'Only Draft Mega Buy orders can be placed' });
  }

  const childOrderIds = getMegaChildOrderIds(order);

  if (childOrderIds.length < 2) {
    return res.status(400).json({ error: 'Mega Buy order has invalid source orders' });
  }

  const sourceOrders = childOrderIds.map(orderId => data.orders.find(item => item.id === orderId));

  if (sourceOrders.some(item => !item)) {
    return res.status(400).json({ error: 'One or more source orders no longer exist' });
  }

  if (sourceOrders.some(item => item.order_type === 'mega_buy')) {
    return res.status(400).json({ error: 'Mega Buy order cannot have Mega Buy child orders' });
  }

  if (sourceOrders.some(item => item.state !== 'Draft')) {
    return res.status(400).json({ error: 'All child orders must be Draft before placing Mega Buy order' });
  }

  const now = new Date().toISOString();

  sourceOrders.forEach(childOrder => {
    childOrder.state = 'Locked';
    childOrder.locked_by_mega_order_id = order.id;
    childOrder.locked_at = now;
    childOrder.updated_at = now;
  });

  order.state = 'Locked';
  order.child_order_ids = childOrderIds;
  order.source_order_ids = childOrderIds;
  order.placed_at = now;
  order.updated_at = now;

  writeData(data);

  res.json({
    message: 'Mega Buy order placed successfully',
    mega_order_id: order.id,
    child_order_ids: childOrderIds,
    state: order.state
  });
});

app.delete('/api/orders/:id', (req, res) => {
  const data = readData();
  const orderIndex = data.orders.findIndex(o => o.id === req.params.id);

  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (data.orders[orderIndex].state !== 'Draft') {
    return res.status(400).json({ error: 'Only Draft orders can be deleted' });
  }

  data.orders.splice(orderIndex, 1);
  writeData(data);
  res.json({ message: 'Order deleted successfully' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
