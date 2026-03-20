require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const supabase = require('./lib/supabase');
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// ==================== UTILITY FUNCTIONS ====================

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

function aggregateMegaBuyItems(products, sourceOrders) {
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
    const product = products.find(p => p.id === productId);
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

// ==================== SUPABASE DATA HELPERS ====================

async function fetchCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function fetchOrders() {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: true });
  if (ordersError) throw ordersError;

  // Fetch all order items
  const { data: allItems, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .order('sort_order', { ascending: true });
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
      line_total: item.line_total != null ? Number(item.line_total) : null
    });
  }

  return orders.map(order => ({
    ...order,
    items: itemsByOrder[order.id] || []
  }));
}

async function fetchOrderById(orderId) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (orderError) return null;

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('sort_order', { ascending: true });
  if (itemsError) throw itemsError;

  return {
    ...order,
    items: (items || []).map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity),
      unit: item.unit,
      unit_price: item.unit_price != null ? Number(item.unit_price) : null,
      line_total: item.line_total != null ? Number(item.line_total) : null
    }))
  };
}

async function saveOrderItems(orderId, items) {
  // Delete existing items
  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', orderId);
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
      sort_order: index
    }));

    const { error: insertError } = await supabase
      .from('order_items')
      .insert(rows);
    if (insertError) throw insertError;
  }
}

// ==================== CATEGORY ROUTES ====================

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await fetchCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load categories: ' + error.message });
  }
});

// Get category by ID
app.get('/api/categories/:id', async (req, res) => {
  try {
    const { data: category, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load category: ' + error.message });
  }
});

// Create new category
app.post('/api/categories', async (req, res) => {
  const { name, description } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    // Check if category already exists
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .ilike('name', name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const newCategory = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description || '',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('categories')
      .insert(newCategory)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category: ' + error.message });
  }
});

// Update category
app.put('/api/categories/:id', async (req, res) => {
  const { name, description } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const { data: category, error: findError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (findError || !category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check for name conflict
    const { data: conflicts } = await supabase
      .from('categories')
      .select('id')
      .ilike('name', name.trim())
      .neq('id', req.params.id)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return res.status(400).json({ error: 'Category name already exists' });
    }

    const { data, error } = await supabase
      .from('categories')
      .update({ name: name.trim(), description: description || '' })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category: ' + error.message });
  }
});

// Delete category
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', req.params.id)
      .single();

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category has products
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('category_id', req.params.id)
      .limit(1);

    if (products && products.length > 0) {
      return res.status(400).json({ error: 'Cannot delete category with products' });
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category: ' + error.message });
  }
});

// ==================== PRODUCT ROUTES ====================

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await fetchProducts();
    const categories = await fetchCategories();

    const enriched = products.map(product => {
      const category = categories.find(c => c.id === product.category_id);
      return {
        ...product,
        category_name: category ? category.name : 'Unknown'
      };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load products: ' + error.message });
  }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const { data: category } = await supabase
      .from('categories')
      .select('name')
      .eq('id', product.category_id)
      .single();

    res.json({
      ...product,
      category_name: category ? category.name : 'Unknown'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load product: ' + error.message });
  }
});

// Create new product
app.post('/api/products', async (req, res) => {
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

  try {
    // Check if category exists
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', category_id)
      .single();

    if (!category) {
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

    const { data, error } = await supabase
      .from('products')
      .insert(newProduct)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product: ' + error.message });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
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

  try {
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if category exists
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', category_id)
      .single();

    if (!category) {
      return res.status(400).json({ error: 'Category not found' });
    }

    const updates = {
      name: name.trim(),
      category_id,
      description: description || '',
      selling_type,
      unit_label: (req.body.unit_label || (selling_type === 'package' ? 'unit' : 'piece')).trim(),
      unit_price: selling_type === 'package' ? parseFloat(req.body.unit_price) || null : null,
      price: parseFloat(price),
      package_quantity: selling_type === 'package' ? parseInt(package_quantity) || 1 : 1,
      package_unit: selling_type === 'package' ? (req.body.package_unit || 'units') : null
    };

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product: ' + error.message });
  }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', req.params.id)
      .single();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if product is used in orders
    const { data: usedItems } = await supabase
      .from('order_items')
      .select('id')
      .eq('product_id', req.params.id)
      .limit(1);

    if (usedItems && usedItems.length > 0) {
      return res.status(400).json({ error: 'Cannot delete product used in orders' });
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product: ' + error.message });
  }
});

// ==================== ORDER ROUTES ====================

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await fetchOrders();
    const products = await fetchProducts();
    const hydrated = orders.map(order => hydrateOrderPricing(order, products));
    res.json(hydrated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load orders: ' + error.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const products = await fetchProducts();
    res.json(hydrateOrderPricing(order, products));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load order: ' + error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  const { person_name, order_date, items } = req.body;

  if (!person_name || person_name.trim() === '') {
    return res.status(400).json({ error: 'Person name is required' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must include at least one item' });
  }

  try {
    const products = await fetchProducts();
    const orderItems = [];
    let orderTotal = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const quantity = Number(item.quantity);
      const unit = normalizeUnit(item.unit);
      const product = products.find(p => p.id === item.product_id);

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

    const orderId = `ord_${Date.now()}`;
    const now = new Date().toISOString();

    const newOrder = {
      id: orderId,
      person_name: person_name.trim(),
      order_date: order_date || new Date().toISOString().split('T')[0],
      state: 'Draft',
      total_amount: Number(orderTotal.toFixed(2)),
      created_at: now,
      updated_at: now
    };

    const { data: savedOrder, error: orderError } = await supabase
      .from('orders')
      .insert(newOrder)
      .select()
      .single();

    if (orderError) throw orderError;

    await saveOrderItems(orderId, orderItems);

    res.status(201).json({
      ...savedOrder,
      items: orderItems
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create order: ' + error.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  const { person_name, order_date, items } = req.body;

  try {
    const order = await fetchOrderById(req.params.id);

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

    const products = await fetchProducts();
    const orderItems = [];
    let orderTotal = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const quantity = Number(item.quantity);
      const unit = normalizeUnit(item.unit);
      const product = products.find(p => p.id === item.product_id);

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

    const now = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        person_name: person_name.trim(),
        order_date: order_date || order.order_date,
        total_amount: Number(orderTotal.toFixed(2)),
        updated_at: now
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await saveOrderItems(req.params.id, orderItems);

    res.json({
      ...updatedOrder,
      items: orderItems
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order: ' + error.message });
  }
});

app.post('/api/orders/mega-buy', async (req, res) => {
  try {
    const allOrders = await fetchOrders();
    const products = await fetchProducts();

    // Hydrate all orders for proper pricing
    const hydratedOrders = allOrders.map(o => hydrateOrderPricing(o, products));

    const sourceOrders = hydratedOrders.filter(order => order.state === 'Draft' && order.order_type !== 'mega_buy');

    if (sourceOrders.length < 2) {
      return res.status(400).json({ error: 'Mega Buy requires at least 2 Draft normal orders' });
    }

    const sourceOrderIds = sourceOrders.map(order => order.id);

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
      person_name: req.body.person_name || 'Mega Buy Order',
      order_date: req.body.order_date || new Date().toISOString().split('T')[0],
      state: 'Draft',
      order_type: 'mega_buy',
      child_order_ids: sourceOrderIds,
      source_order_ids: sourceOrderIds,
      immutable_items: true,
      total_amount: aggregated.total_amount,
      created_at: now,
      updated_at: now
    };

    const { data: savedOrder, error: orderError } = await supabase
      .from('orders')
      .insert(megaOrder)
      .select()
      .single();

    if (orderError) throw orderError;

    await saveOrderItems(orderId, aggregated.items);

    res.status(201).json({
      ...savedOrder,
      items: aggregated.items
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create Mega Buy order: ' + error.message });
  }
});

app.post('/api/orders/:id/recalculate', async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.order_type !== 'mega_buy') {
      return res.status(400).json({ error: 'Only Mega Buy orders can be recalculated' });
    }

    if (order.state !== 'Draft') {
      return res.status(400).json({ error: 'Only Draft Mega Buy orders can be recalculated' });
    }

    const allOrders = await fetchOrders();
    const products = await fetchProducts();
    const hydratedOrders = allOrders.map(o => hydrateOrderPricing(o, products));

    const sourceOrders = hydratedOrders.filter(item => item.state === 'Draft' && item.order_type !== 'mega_buy');

    if (sourceOrders.length < 2) {
      return res.status(400).json({ error: 'Mega Buy recalculation requires at least 2 Draft normal orders' });
    }

    const childOrderIds = sourceOrders.map(item => item.id);

    let aggregated;
    try {
      aggregated = aggregateMegaBuyItems(products, sourceOrders);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const now = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        total_amount: aggregated.total_amount,
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        updated_at: now
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await saveOrderItems(req.params.id, aggregated.items);

    res.json({
      ...updatedOrder,
      items: aggregated.items
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to recalculate order: ' + error.message });
  }
});

app.post('/api/orders/:id/place', async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

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

    // Fetch child orders
    const { data: sourceOrders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .in('id', childOrderIds);

    if (fetchError) throw fetchError;

    if (sourceOrders.length !== childOrderIds.length) {
      return res.status(400).json({ error: 'One or more source orders no longer exist' });
    }

    if (sourceOrders.some(item => item.order_type === 'mega_buy')) {
      return res.status(400).json({ error: 'Mega Buy order cannot have Mega Buy child orders' });
    }

    if (sourceOrders.some(item => item.state !== 'Draft')) {
      return res.status(400).json({ error: 'All child orders must be Draft before placing Mega Buy order' });
    }

    const now = new Date().toISOString();

    // Lock all child orders
    for (const childOrder of sourceOrders) {
      const { error: lockError } = await supabase
        .from('orders')
        .update({
          state: 'Locked',
          locked_by_mega_order_id: order.id,
          locked_at: now,
          updated_at: now
        })
        .eq('id', childOrder.id);

      if (lockError) throw lockError;
    }

    // Lock the mega order
    const { error: megaLockError } = await supabase
      .from('orders')
      .update({
        state: 'Locked',
        child_order_ids: childOrderIds,
        source_order_ids: childOrderIds,
        placed_at: now,
        updated_at: now
      })
      .eq('id', req.params.id);

    if (megaLockError) throw megaLockError;

    res.json({
      message: 'Mega Buy order placed successfully',
      mega_order_id: order.id,
      child_order_ids: childOrderIds,
      state: 'Locked'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to place order: ' + error.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const order = await fetchOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.state !== 'Draft') {
      return res.status(400).json({ error: 'Only Draft orders can be deleted' });
    }

    // order_items deleted via ON DELETE CASCADE
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete order: ' + error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Connected to Supabase: ${process.env.SUPABASE_URL}`);
});
