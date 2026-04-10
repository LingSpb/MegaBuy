let currentCategoryId = null;
let currentProductId = null;
let currentOrderId = null;
let allCategories = [];
let allProducts = [];
let allOrders = [];

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadProducts();
  loadOrders();
});

// ==================== TAB NAVIGATION ====================
function showTab(clickEvent, tabName) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(`${tabName}-tab`).classList.add('active');
  if (clickEvent && clickEvent.target) {
    clickEvent.target.classList.add('active');
  }

  if (tabName === 'categories') {
    loadCategories();
  } else if (tabName === 'products') {
    loadProducts();
  } else {
    loadOrders();
  }
}

// ==================== CATEGORIES ====================
async function loadCategories() {
  try {
    const response = await fetch('/api/categories');
    if (!response.ok) throw new Error('Failed to load categories');
    allCategories = await response.json();
    displayCategories();
    updateCategoryDropdown();
  } catch (error) {
    showToast('Error loading categories: ' + error.message, 'error');
  }
}

function displayCategories() {
  const container = document.getElementById('categories-list');
  
  if (allCategories.length === 0) {
    container.innerHTML = '<div class="empty-message">No categories yet. Create one to get started!</div>';
    return;
  }

  container.innerHTML = allCategories.map(category => `
    <div class="card card-clickable" onclick="navigateToProductsByCategory('${category.id}')">
      <div class="card-content">
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.description || 'No description')}</p>
        <p class="vat-info">VAT: ${category.vat != null ? category.vat : 6}%</p>
      </div>
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-edit" onclick="editCategory('${category.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteCategory('${category.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function filterCategories() {
  const searchTerm = document.getElementById('categorySearch').value.toLowerCase();
  const filtered = allCategories.filter(cat => 
    cat.name.toLowerCase().includes(searchTerm) ||
    cat.description.toLowerCase().includes(searchTerm)
  );
  
  const container = document.getElementById('categories-list');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-message">No categories found</div>';
    return;
  }

  container.innerHTML = filtered.map(category => `
    <div class="card card-clickable" onclick="navigateToProductsByCategory('${category.id}')">
      <div class="card-content">
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.description || 'No description')}</p>
        <p class="vat-info">VAT: ${category.vat != null ? category.vat : 6}%</p>
      </div>
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-edit" onclick="editCategory('${category.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteCategory('${category.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function openCategoryModal() {
  currentCategoryId = null;
  document.getElementById('categoryModalTitle').textContent = 'Add New Category';
  document.getElementById('categoryName').value = '';
  document.getElementById('categoryDescription').value = '';
  document.getElementById('categoryVat').value = '6';
  document.getElementById('categoryModal').classList.add('show');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('show');
  currentCategoryId = null;
}

function editCategory(categoryId) {
  const category = allCategories.find(c => c.id === categoryId);
  if (!category) return;

  currentCategoryId = categoryId;
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  document.getElementById('categoryName').value = category.name;
  document.getElementById('categoryDescription').value = category.description;
  document.getElementById('categoryVat').value = category.vat != null ? category.vat : 6;
  document.getElementById('categoryModal').classList.add('show');
}

async function saveCategoryHandler(event) {
  event.preventDefault();

  const name = document.getElementById('categoryName').value;
  const description = document.getElementById('categoryDescription').value;
  const vat = document.getElementById('categoryVat').value;

  try {
    const url = currentCategoryId ? `/api/categories/${currentCategoryId}` : '/api/categories';
    const method = currentCategoryId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, vat: vat !== '' ? Number(vat) : 6 })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to save category');
    }

    showToast(currentCategoryId ? 'Category updated successfully!' : 'Category created successfully!');
    closeCategoryModal();
    loadCategories();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function deleteCategory(categoryId) {
  if (!confirm('Are you sure you want to delete this category?')) return;

  try {
    const response = await fetch(`/api/categories/${categoryId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete category');
    }

    showToast('Category deleted successfully!');
    loadCategories();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

// ==================== PRODUCTS ====================

function getCategoryVat(categoryId) {
  const category = allCategories.find(c => c.id === categoryId);
  return category && category.vat != null ? category.vat : 6;
}

function calculatePriceWithVat(price, vatPercent) {
  return Number((price * (1 + vatPercent / 100)).toFixed(2));
}

function calculateOrderTotalWithVat(order) {
  if (!order || !Array.isArray(order.items)) return 0;
  
  let totalWithVat = 0;
  order.items.forEach(item => {
    const product = allProducts.find(p => p.id === item.product_id);
    const vat = product ? getCategoryVat(product.category_id) : 6;
    const lineTotal = Number(item.line_total) || 0;
    totalWithVat += calculatePriceWithVat(lineTotal, vat);
  });
  
  return Number(totalWithVat.toFixed(2));
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Failed to load products');
    allProducts = await response.json();
    filterProducts();
    renderOrderProductOptions();
  } catch (error) {
    showToast('Error loading products: ' + error.message, 'error');
  }
}

function getProductDescription(product) {
  // If product has a description, use it
  if (product.description && product.description.trim()) {
    return product.description;
  }
  
  // Auto-generate description for package (carton) products
  if (product.selling_type === 'package') {
    const unitLabel = product.unit_label || 'unit';
    const packageQuantity = product.package_quantity || 1;
    // Prefer unit_label over package_unit (package_unit defaults to 'units' which is not meaningful)
    const pkgUnit = product.package_unit;
    const packageUnit = unitLabel || (pkgUnit && pkgUnit !== 'units' && pkgUnit !== 'unit' ? pkgUnit : 'units');
    
    // Calculate unit_price if not available (price / package_quantity)
    let unitPrice = product.unit_price;
    if (!unitPrice && product.price && packageQuantity > 0) {
      unitPrice = Number((product.price / packageQuantity).toFixed(2));
    }
    
    if (unitPrice) {
      return `${unitPrice} kr/${unitLabel}. Sold by carton (${packageQuantity} ${packageUnit} per carton)`;
    } else {
      return `Sold by carton (${packageQuantity} ${packageUnit} per carton)`;
    }
  }
  
  return 'No description';
}

function displayProducts() {
  const container = document.getElementById('products-list');

  if (allProducts.length === 0) {
    container.innerHTML = '<div class="empty-message">No products yet. Create one to get started!</div>';
    return;
  }

  container.innerHTML = allProducts.map(product => {
    const vat = getCategoryVat(product.category_id);
    const isPackage = product.selling_type === 'package';
    // For unit products, use product.price; for package products, use unit_price
    const displayPrice = isPackage ? product.unit_price : product.price;
    const displayPriceWithVat = displayPrice ? calculatePriceWithVat(displayPrice, vat) : null;
    
    return `
    <div class="card">
      <div class="product-info">
        <div class="card-content">
          <h3>${escapeHtml(product.name)}</h3>
          <p><strong>Category:</strong> ${escapeHtml(product.category_name)}</p>
          <p>${escapeHtml(getProductDescription(product))}</p>
        </div>
        <div>
          ${isPackage
            ? `<span class="selling-type-badge">Carton × ${product.package_quantity} ${product.unit_label || product.package_unit || 'units'}</span>`
            : `<span class="selling-type-badge">Per ${product.unit_label}</span>`
          }
          ${displayPrice ? `<span class="unit-price-badge">${displayPrice} kr/${product.unit_label}</span>` : ''}
          ${displayPriceWithVat ? `<span class="unit-price-vat-badge">${displayPriceWithVat} kr/${product.unit_label} incl. VAT</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary" onclick="openAddToOrderModal('${product.id}')">Add to Order</button>
        <button class="btn btn-edit" onclick="editProduct('${product.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteProduct('${product.id}')">Delete</button>
      </div>
    </div>
  `;
  }).join('');
}

function filterProducts() {
  const searchTerm = document.getElementById('productSearch').value.toLowerCase();
  const categoryFilter = document.getElementById('categoryFilter').value;
  
  let filtered = allProducts;
  
  // Filter by category if selected
  if (categoryFilter) {
    filtered = filtered.filter(prod => prod.category_id === categoryFilter);
  }
  
  // Filter by search term
  if (searchTerm) {
    filtered = filtered.filter(prod => 
      prod.name.toLowerCase().includes(searchTerm) ||
      prod.description.toLowerCase().includes(searchTerm) ||
      prod.category_name.toLowerCase().includes(searchTerm)
    );
  }

  const container = document.getElementById('products-list');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-message">No products found</div>';
    return;
  }

  container.innerHTML = filtered.map(product => {
    const vat = getCategoryVat(product.category_id);
    const isPackage = product.selling_type === 'package';
    // For unit products, use product.price; for package products, use unit_price
    const displayPrice = isPackage ? product.unit_price : product.price;
    const displayPriceWithVat = displayPrice ? calculatePriceWithVat(displayPrice, vat) : null;
    
    return `
    <div class="card">
      <div class="product-info">
        <div class="card-content">
          <h3>${escapeHtml(product.name)}</h3>
          <p><strong>Category:</strong> ${escapeHtml(product.category_name)}</p>
          <p>${escapeHtml(getProductDescription(product))}</p>
        </div>
        <div>
          ${isPackage
            ? `<span class="selling-type-badge">Carton × ${product.package_quantity} ${product.unit_label || product.package_unit || 'units'}</span>`
            : `<span class="selling-type-badge">Per ${product.unit_label}</span>`
          }
          ${displayPrice ? `<span class="unit-price-badge">${displayPrice} kr/${product.unit_label}</span>` : ''}
          ${displayPriceWithVat ? `<span class="unit-price-vat-badge">${displayPriceWithVat} kr/${product.unit_label} incl. VAT</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary" onclick="openAddToOrderModal('${product.id}')">Add to Order</button>
        <button class="btn btn-edit" onclick="editProduct('${product.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteProduct('${product.id}')">Delete</button>
      </div>
    </div>
  `;
  }).join('');
}

function updateCategoryDropdown() {
  const select = document.getElementById('productCategory');
  select.innerHTML = '<option value="">Select a category</option>' + 
    allCategories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
  
  // Also update the category filter dropdown
  const filterSelect = document.getElementById('categoryFilter');
  if (filterSelect) {
    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Categories</option>' + 
      allCategories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
    // Preserve the current selection if it still exists
    if (currentValue && allCategories.some(cat => cat.id === currentValue)) {
      filterSelect.value = currentValue;
    }
  }
}

// Navigate to Products tab with a specific category filter
function navigateToProductsByCategory(categoryId) {
  // Set the category filter
  const filterSelect = document.getElementById('categoryFilter');
  if (filterSelect) {
    filterSelect.value = categoryId;
  }
  
  // Switch to products tab
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById('products-tab').classList.add('active');
  // Find and activate the Products nav button
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    if (btn.textContent === 'Products') {
      btn.classList.add('active');
    }
  });
  
  // Load products and apply filter
  loadProducts().then(() => {
    filterProducts();
  });
}

function togglePackageQuantity() {
  const sellingType = document.getElementById('sellingType').value;
  const packageGroup = document.getElementById('packageQuantityGroup');
  const packageInput = document.getElementById('packageQuantity');

  if (sellingType === 'package') {
    packageGroup.style.display = 'block';
    packageInput.required = true;
  } else {
    packageGroup.style.display = 'none';
    packageInput.required = false;
  }
}

function openProductModal() {
  currentProductId = null;
  document.getElementById('productModalTitle').textContent = 'Add New Product';
  document.getElementById('productName').value = '';
  document.getElementById('productCategory').value = '';
  document.getElementById('productDescription').value = '';
  document.getElementById('sellingType').value = 'unit';
  document.getElementById('unitLabel').value = '';
  document.getElementById('productPrice').value = '';
  document.getElementById('packageQuantity').value = '';
  togglePackageQuantity();
  document.getElementById('productModal').classList.add('show');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('show');
  currentProductId = null;
}

function editProduct(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  currentProductId = productId;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('productName').value = product.name;
  document.getElementById('productCategory').value = product.category_id;
  document.getElementById('productDescription').value = product.description;
  document.getElementById('sellingType').value = product.selling_type;
  document.getElementById('unitLabel').value = product.unit_label || '';
  
  // Display unit price in the form (for package products, use stored unit_price or calculate from carton price)
  let displayPrice = product.price;
  if (product.selling_type === 'package') {
    displayPrice = product.unit_price || (product.package_quantity > 0 ? Number((product.price / product.package_quantity).toFixed(2)) : product.price);
  }
  document.getElementById('productPrice').value = displayPrice;
  
  document.getElementById('packageQuantity').value = product.package_quantity;
  togglePackageQuantity();
  document.getElementById('productModal').classList.add('show');
}

async function saveProductHandler(event) {
  event.preventDefault();

  const name = document.getElementById('productName').value;
  const category_id = document.getElementById('productCategory').value;
  const description = document.getElementById('productDescription').value;
  const selling_type = document.getElementById('sellingType').value;
  const unit_label = document.getElementById('unitLabel').value.trim();
  const inputPrice = parseFloat(document.getElementById('productPrice').value);
  const package_quantity = parseFloat(document.getElementById('packageQuantity').value) || 1;

  // Input price is always unit price
  // For package products, calculate carton price (unit_price * package_quantity)
  let price = inputPrice;
  let unit_price = inputPrice;
  if (selling_type === 'package' && package_quantity > 0) {
    price = Number((inputPrice * package_quantity).toFixed(2)); // carton price
  } else {
    unit_price = null; // unit products don't need separate unit_price
  }

  try {
    const url = currentProductId ? `/api/products/${currentProductId}` : '/api/products';
    const method = currentProductId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category_id,
        description,
        selling_type,
        unit_label,
        price,
        package_quantity,
        unit_price
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to save product');
    }

    showToast(currentProductId ? 'Product updated successfully!' : 'Product created successfully!');
    closeProductModal();
    loadProducts();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product?')) return;

  try {
    const response = await fetch(`/api/products/${productId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete product');
    }

    showToast('Product deleted successfully!');
    loadProducts();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

// ==================== ORDERS ====================
async function loadOrders() {
  try {
    const response = await fetch('/api/orders');
    if (!response.ok) throw new Error('Failed to load orders');
    allOrders = await response.json();
    displayOrders();
  } catch (error) {
    showToast('Error loading orders: ' + error.message, 'error');
  }
}

function getOrderStateClass(state) {
  const normalized = String(state || '').toLowerCase();
  if (normalized === 'draft') return 'state-draft';
  if (normalized === 'locked') return 'state-locked';
  if (normalized === 'delivered') return 'state-delivered';
  return 'state-closed';
}

function formatOrderItemsSummary(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  const grouped = new Map();

  items.forEach(item => {
    const productKey = item.product_id || item.product_name || 'unknown-product';
    const productName = item.product_name || 'Unknown product';
    const unit = String(item.unit || 'unit');
    const quantity = Number(item.quantity) || 0;

    if (!grouped.has(productKey)) {
      grouped.set(productKey, {
        productName,
        units: new Map()
      });
    }

    const productGroup = grouped.get(productKey);
    // Round to 2 decimal places to avoid floating-point precision issues
    productGroup.units.set(unit, Number(((productGroup.units.get(unit) || 0) + quantity).toFixed(2)));
  });

  return Array.from(grouped.values())
    .map(group => {
      const unitSummary = Array.from(group.units.entries())
        .map(([unit, quantity]) => `${quantity} ${escapeHtml(unit)}`)
        .join(', ');
      return `${escapeHtml(group.productName)} (${unitSummary})`;
    })
    .join(' • ');
}

function formatMegaOrderProductsGrid(items, megaOrderId) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<div class="mega-products-empty">No products</div>';
  }

  const grouped = new Map();

  items.forEach(item => {
    const productKey = item.product_id || item.product_name || 'unknown-product';
    const productName = item.product_name || 'Unknown product';
    const unit = String(item.unit || 'unit').toLowerCase();
    const quantity = Number(item.quantity) || 0;

    // Look up product info from allProducts
    const product = allProducts.find(p => p.id === item.product_id);

    if (!grouped.has(productKey)) {
      // Prefer unit_label over package_unit (package_unit defaults to 'units' which is not meaningful)
      const pkgUnit = product?.package_unit;
      const unitLabel = product?.unit_label;
      const displayUnit = unitLabel || (pkgUnit && pkgUnit !== 'units' && pkgUnit !== 'unit' ? pkgUnit : 'unit');
      
      grouped.set(productKey, {
        productName,
        productId: item.product_id,
        sellingType: product?.selling_type || 'unit',
        packageQuantity: Number(product?.package_quantity) || 1,
        packageUnit: displayUnit,
        units: new Map()
      });
    }

    const productGroup = grouped.get(productKey);
    // Round to 2 decimal places to avoid floating-point precision issues
    productGroup.units.set(unit, Number(((productGroup.units.get(unit) || 0) + quantity).toFixed(2)));
  });

  const productCards = Array.from(grouped.values()).map(group => {
    const unitSummary = Array.from(group.units.entries())
      .map(([unit, quantity]) => `${quantity} ${escapeHtml(unit)}`)
      .join(', ');
    
    // Check if product is sold by package and has items below package quantity
    let isBelowPackage = false;
    if (group.sellingType === 'package') {
      // Check if there's any non-carton unit with quantity less than package quantity
      for (const [unit, quantity] of group.units.entries()) {
        if (unit !== 'carton' && quantity < group.packageQuantity) {
          isBelowPackage = true;
          break;
        }
      }
    }
    
    // Highlight only carton products below package quantity, but make all products clickable
    const highlightClass = isBelowPackage ? ' mega-product-item-warning' : '';
    const clickHandler = ` onclick="showProductDetailsModal('${megaOrderId}', '${group.productId}')"`;
    return `<div class="mega-product-item mega-product-item-clickable${highlightClass}"${clickHandler}>${escapeHtml(group.productName)}<span class="mega-product-qty">${unitSummary}</span></div>`;
  });

  return productCards.join('');
}

function showProductDetailsModal(megaOrderId, productId) {
  const megaOrder = allOrders.find(o => o.id === megaOrderId);
  const product = allProducts.find(p => p.id === productId);
  
  if (!megaOrder || !product) {
    showToast('Could not find order or product details', 'error');
    return;
  }

  // Get child order IDs
  const childOrderIds = Array.isArray(megaOrder.child_order_ids) && megaOrder.child_order_ids.length > 0
    ? megaOrder.child_order_ids
    : (Array.isArray(megaOrder.source_order_ids) ? megaOrder.source_order_ids : []);

  // Get child orders
  const childOrders = allOrders.filter(o => childOrderIds.includes(o.id));

  // Build product info string based on selling type
  // Prefer unit_label over package_unit (package_unit defaults to 'units' which is not meaningful)
  const pkgUnit = product.package_unit;
  const packageUnit = product.unit_label || (pkgUnit && pkgUnit !== 'units' && pkgUnit !== 'unit' ? pkgUnit : 'unit');
  const packageQuantity = product.package_quantity || 1;
  const isPackageProduct = product.selling_type === 'package';
  const productInfoText = isPackageProduct 
    ? `${product.name}: carton × ${packageQuantity} ${packageUnit}`
    : product.name;

  // Build breakdown by person and calculate total
  const breakdown = [];
  const totalByUnit = new Map();
  
  childOrders.forEach(order => {
    const orderItems = order.items.filter(item => item.product_id === productId);
    if (orderItems.length > 0) {
      const personName = order.person_name;
      const orderId = order.id;
      const itemsSummary = orderItems.map(item => {
        const qty = Number(item.quantity) || 0;
        const unit = (item.unit || 'unit').toLowerCase();
        // Add to total - round to 2 decimal places to avoid floating-point precision issues
        totalByUnit.set(unit, Number(((totalByUnit.get(unit) || 0) + qty).toFixed(2)));
        return `${qty} ${unit}`;
      }).join(', ');
      breakdown.push({ personName, orderId, itemsSummary });
    }
  });

  // Build total sum string
  const totalSum = Array.from(totalByUnit.entries())
    .map(([unit, qty]) => `${qty} ${unit}`)
    .join(', ');

  // Set modal content - make product info clickable
  const productInfoEl = document.getElementById('productDetailsInfo');
  productInfoEl.innerHTML = `<a href="#" class="product-details-link" onclick="navigateToProduct('${productId}'); return false;">${escapeHtml(productInfoText)}</a>`;
  document.getElementById('productDetailsTotalSum').textContent = totalSum || '0';
  
  const breakdownList = document.getElementById('productDetailsBreakdown');
  if (breakdown.length > 0) {
    breakdownList.innerHTML = breakdown
      .map(b => `<span class="product-breakdown-item"><a href="#" class="product-breakdown-link" onclick="navigateToOrder('${b.orderId}'); return false;"><strong>${escapeHtml(b.personName)}</strong> (${escapeHtml(b.itemsSummary)})</a></span>`)
      .join('');
  } else {
    breakdownList.innerHTML = '<span class="product-breakdown-empty">No orders found</span>';
  }

  // Show modal
  document.getElementById('productDetailsModal').classList.add('show');
}

// Navigate to Products tab and highlight a specific product
function navigateToProduct(productId) {
  closeProductDetailsModal();
  
  // Switch to products tab
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById('products-tab').classList.add('active');
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    if (btn.textContent === 'Products') {
      btn.classList.add('active');
    }
  });
  
  // Clear filters to ensure product is visible
  document.getElementById('productSearch').value = '';
  document.getElementById('categoryFilter').value = '';
  
  // Load products and then scroll to the specific product
  loadProducts().then(() => {
    // Find and highlight the product card
    setTimeout(() => {
      const productCards = document.querySelectorAll('#products-list .card');
      for (const card of productCards) {
        const editBtn = card.querySelector('.btn-edit[onclick*="' + productId + '"]');
        if (editBtn) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('card-highlight');
          setTimeout(() => card.classList.remove('card-highlight'), 2000);
          break;
        }
      }
    }, 100);
  });
}

// Navigate to Orders tab and highlight a specific order
function navigateToOrder(orderId) {
  closeProductDetailsModal();
  
  // Switch to orders tab
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById('orders-tab').classList.add('active');
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    if (btn.textContent === 'Orders') {
      btn.classList.add('active');
    }
  });
  
  // Clear search filter
  document.getElementById('orderSearch').value = '';
  
  // Load orders and then scroll to the specific order
  loadOrders().then(() => {
    setTimeout(() => {
      // Look in normal orders, mega orders, and archived sections
      const allOrderCards = document.querySelectorAll('.order-card');
      for (const card of allOrderCards) {
        const header = card.querySelector('h3');
        if (header && header.textContent === orderId) {
          // If in archived section, expand it first
          const archivedList = document.getElementById('archived-orders-list');
          if (archivedList && archivedList.contains(card)) {
            archivedList.style.display = 'grid';
            const icon = document.getElementById('archived-toggle-icon');
            if (icon) icon.textContent = '▼';
          }
          
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('card-highlight');
          setTimeout(() => card.classList.remove('card-highlight'), 2000);
          break;
        }
      }
    }, 100);
  });
}

function closeProductDetailsModal() {
  document.getElementById('productDetailsModal').classList.remove('show');
}

function renderOrderCard(order) {
  const childOrderIds = Array.isArray(order.child_order_ids) && order.child_order_ids.length > 0
    ? order.child_order_ids
    : (Array.isArray(order.source_order_ids) ? order.source_order_ids : []);
  const canEditNormalOrder = order.order_type !== 'mega_buy' && (
    order.state === 'Draft' || (order.state === 'Delivered' && Boolean(order.locked_by_mega_order_id))
  );

  const isMegaBuy = order.order_type === 'mega_buy';
  const totalAmount = Number(order.total_amount || 0);
  const totalWithVat = calculateOrderTotalWithVat(order);

  return `
    <div class="card order-card ${isMegaBuy ? 'mega-order-card' : ''}">
      <div class="card-content">
        <div class="order-header">
          <h3>${escapeHtml(order.id)}</h3>
          <span class="state-badge ${getOrderStateClass(order.state)}">${escapeHtml(order.state)}</span>
          ${isMegaBuy ? `<span class="selling-type-badge">Mega Buy</span>` : ''}
        </div>
        <p><strong>Person:</strong> ${escapeHtml(order.person_name)}</p>
        <p><strong>Updated:</strong> ${escapeHtml(formatOrderDate(order.updated_at || order.order_date))}</p>
        <p><strong>Items:</strong> ${order.items.length}</p>
        <p><strong>Total:</strong> ${totalAmount.toFixed(2)} kr <span class="total-vat-text">(${totalWithVat.toFixed(2)} kr incl. VAT)</span></p>
        ${isMegaBuy ? `
          ${order.delivered_at ? `<p><strong>Delivered:</strong> ${escapeHtml(formatOrderDate(order.delivered_at))}</p>` : ''}
          <div class="mega-order-section">
            <strong>Child Orders:</strong>
            <div class="mega-child-orders">${childOrderIds.map(id => `<span class="child-order-tag">${escapeHtml(id)}</span>`).join('') || 'N/A'}</div>
          </div>
          <div class="mega-order-section">
            <strong>Products:</strong>
            <div class="mega-products-grid">${formatMegaOrderProductsGrid(order.items, order.id)}</div>
          </div>
        ` : `<small>${formatOrderItemsSummary(order.items)}</small>`}
      </div>
      <div class="card-actions order-actions">
        ${canEditNormalOrder ? `<button class="btn btn-edit" onclick="editOrder('${order.id}')">Edit</button>` : ''}
        ${(order.state === 'Draft' || (isMegaBuy && order.state === 'Closed')) ? `<button class="btn btn-danger" onclick="deleteOrder('${order.id}')">Delete</button>` : ''}
        ${(order.state === 'Draft' || order.state === 'Delivered') && isMegaBuy ? `<button class="btn btn-dark" onclick="recalculateMegaBuyOrder('${order.id}')">Recalculate</button>` : ''}
        ${order.state === 'Draft' && isMegaBuy ? `<button class="btn btn-primary" onclick="placeMegaBuyOrder('${order.id}')">Place Order</button>` : ''}
        ${order.state === 'Locked' && isMegaBuy ? `<button class="btn btn-primary" onclick="deliverMegaBuyOrder('${order.id}')">Deliver Order</button>` : ''}
        ${order.state === 'Delivered' && isMegaBuy ? `<button class="btn btn-primary" onclick="closeMegaBuyOrder('${order.id}')">Close Order</button>` : ''}
        ${isMegaBuy ? `<button class="btn btn-secondary" onclick="printMegaOrderInvoice('${order.id}')">Print Invoice</button>` : ''}
      </div>
    </div>
  `;
}

function renderArchivedSection(archivedOrders) {
  const section = document.getElementById('archived-orders-section');
  const listEl = document.getElementById('archived-orders-list');
  const countBadge = document.getElementById('archived-count-badge');
  if (!section || !listEl || !countBadge) return;

  if (archivedOrders.length === 0) {
    section.style.display = 'none';
    return;
  }

  countBadge.textContent = archivedOrders.length;
  section.style.display = 'block';
  listEl.innerHTML = archivedOrders.map(renderOrderCard).join('');
}

function displayOrders() {
  const normalContainer = document.getElementById('normal-orders-list');
  const megaContainer = document.getElementById('mega-orders-list');
  if (!normalContainer || !megaContainer) return;

  const activeNormalOrders = allOrders.filter(o => o.order_type !== 'mega_buy' && o.state !== 'Closed');
  const activeMegaOrders = allOrders.filter(o => o.order_type === 'mega_buy');
  const archivedOrders = allOrders.filter(o => o.order_type !== 'mega_buy' && o.state === 'Closed')
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

  const sortedNormal = [...activeNormalOrders].sort((a, b) => (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0));
  const sortedMega = [...activeMegaOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  normalContainer.innerHTML = sortedNormal.length > 0
    ? sortedNormal.map(renderOrderCard).join('')
    : '<div class="empty-message">No normal orders</div>';

  megaContainer.innerHTML = sortedMega.length > 0
    ? sortedMega.map(renderOrderCard).join('')
    : '<div class="empty-message">No Mega Buy orders</div>';

  renderArchivedSection(archivedOrders);
}

function filterOrders() {
  const searchInput = document.getElementById('orderSearch');
  const normalContainer = document.getElementById('normal-orders-list');
  const megaContainer = document.getElementById('mega-orders-list');
  if (!searchInput || !normalContainer || !megaContainer) return;

  const searchTerm = searchInput.value.toLowerCase().trim();

  // If search is cleared, restore normal split view
  if (!searchTerm) {
    displayOrders();
    return;
  }

  const matches = order =>
    order.id.toLowerCase().includes(searchTerm) ||
    order.person_name.toLowerCase().includes(searchTerm) ||
    order.state.toLowerCase().includes(searchTerm);

  const normalMatches = allOrders.filter(o => o.order_type !== 'mega_buy' && o.state !== 'Closed' && matches(o))
    .sort((a, b) => (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0));
  const megaMatches = allOrders.filter(o => o.order_type === 'mega_buy' && matches(o))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const archivedMatches = allOrders.filter(o => o.order_type !== 'mega_buy' && o.state === 'Closed' && matches(o))
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

  normalContainer.innerHTML = normalMatches.length > 0
    ? normalMatches.map(renderOrderCard).join('')
    : '<div class="empty-message">No matching normal orders</div>';

  megaContainer.innerHTML = megaMatches.length > 0
    ? megaMatches.map(renderOrderCard).join('')
    : '<div class="empty-message">No matching Mega Buy orders</div>';

  renderArchivedSection(archivedMatches);

  // Auto-expand archive if search matches archived orders
  if (archivedMatches.length > 0) {
    const listEl = document.getElementById('archived-orders-list');
    const icon = document.getElementById('archived-toggle-icon');
    if (listEl) listEl.style.display = 'grid';
    if (icon) icon.textContent = '▼';
  }
}

function toggleArchivedOrders() {
  const listEl = document.getElementById('archived-orders-list');
  const icon = document.getElementById('archived-toggle-icon');
  if (!listEl || !icon) return;
  const isOpen = listEl.style.display !== 'none';
  listEl.style.display = isOpen ? 'none' : 'grid';
  icon.textContent = isOpen ? '▶' : '▼';
}

async function addMegaBuyOrder() {
  const sourceOrders = allOrders.filter(order => order.state === 'Draft' && order.order_type !== 'mega_buy');

  if (sourceOrders.length < 2) {
    showToast('Need at least 2 Draft normal orders to create Mega Buy order', 'error');
    return;
  }

  const sourceIds = sourceOrders.map(order => order.id);

  try {
    const response = await fetch('/api/orders/mega-buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_name: 'Mega Buy Order',
        order_date: new Date().toISOString().split('T')[0],
        source_order_ids: sourceIds
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create Mega Buy order');
    }

    showToast(`Mega Buy order created from ${sourceIds.length} Draft normal orders`);
    loadOrders();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function recalculateMegaBuyOrder(orderId) {
  try {
    const response = await fetch(`/api/orders/${orderId}/recalculate`, {
      method: 'POST'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to recalculate Mega Buy order');
    }

    showToast('Mega Buy order recalculated successfully!');
    loadOrders();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

let pendingPlaceMegaOrderId = null;

function placeMegaBuyOrder(orderId) {
  const megaOrder = allOrders.find(o => o.id === orderId);
  if (!megaOrder) {
    showToast('Order not found', 'error');
    return;
  }

  pendingPlaceMegaOrderId = orderId;

  // Build product summary for the order details
  const orderDetails = formatOrderDetailsForCopy(megaOrder.items);
  document.getElementById('placeMegaOrderDetails').textContent = orderDetails;

  // Show the modal
  document.getElementById('placeMegaOrderModal').classList.add('show');
}

function formatOrderDetailsForCopy(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'No products';
  }

  const grouped = new Map();

  items.forEach(item => {
    const productKey = item.product_id || item.product_name || 'unknown-product';
    const productName = item.product_name || 'Unknown product';
    const unit = String(item.unit || 'unit');
    const quantity = Number(item.quantity) || 0;

    if (!grouped.has(productKey)) {
      grouped.set(productKey, {
        productName,
        units: new Map()
      });
    }

    const productGroup = grouped.get(productKey);
    // Round to 2 decimal places to avoid floating-point precision issues
    productGroup.units.set(unit, Number(((productGroup.units.get(unit) || 0) + quantity).toFixed(2)));
  });

  return Array.from(grouped.values())
    .map(group => {
      const unitSummary = Array.from(group.units.entries())
        .map(([unit, quantity]) => `${quantity} ${unit}`)
        .join(', ');
      return `${group.productName} (${unitSummary})`;
    })
    .join(' • ');
}

function closePlaceMegaOrderModal() {
  document.getElementById('placeMegaOrderModal').classList.remove('show');
  pendingPlaceMegaOrderId = null;
}

function copyOrderDetails() {
  const orderDetails = document.getElementById('placeMegaOrderDetails').textContent;
  navigator.clipboard.writeText(orderDetails).then(() => {
    showToast('Order details copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}

async function confirmPlaceMegaBuyOrder() {
  if (!pendingPlaceMegaOrderId) {
    showToast('No order selected', 'error');
    return;
  }

  const orderId = pendingPlaceMegaOrderId;
  closePlaceMegaOrderModal();

  try {
    const response = await fetch(`/api/orders/${orderId}/place`, {
      method: 'POST'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to place Mega Buy order');
    }

    showToast('Mega Buy order placed and all child orders locked!');
    loadOrders();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function deliverMegaBuyOrder(orderId) {
  if (!confirm('Deliver this Mega Buy order? This will mark the Mega order and all child orders as Delivered.')) {
    return;
  }

  try {
    const response = await fetch(`/api/orders/${orderId}/deliver`, {
      method: 'POST'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to deliver Mega Buy order');
    }

    showToast('Mega Buy order delivered and child orders are now Delivered!');
    loadOrders();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function closeMegaBuyOrder(orderId) {
  if (!confirm('Close this Delivered Mega Buy order? This will move all child orders to Closed and archive.')) {
    return;
  }

  try {
    const response = await fetch(`/api/orders/${orderId}/close`, {
      method: 'POST'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to close Mega Buy order');
    }

    showToast('Mega Buy order closed and child orders moved to archive!');
    loadOrders();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function printMegaOrderInvoice(orderId) {
  // Always recalculate the mega order before printing to ensure latest data
  try {
    const recalcResponse = await fetch(`/api/orders/${orderId}/recalculate`, {
      method: 'POST'
    });

    if (!recalcResponse.ok) {
      const errorData = await recalcResponse.json();
      throw new Error(errorData.error || 'Failed to recalculate order before printing');
    }

    // Reload orders to get the updated data
    const ordersResponse = await fetch('/api/orders');
    if (ordersResponse.ok) {
      allOrders = await ordersResponse.json();
    }
  } catch (error) {
    showToast('Warning: Could not recalculate order - ' + error.message, 'error');
  }

  const megaOrder = allOrders.find(o => o.id === orderId);
  if (!megaOrder) {
    showToast('Could not find order', 'error');
    return;
  }

  // Group items by product and convert to small units
  const productGroups = new Map();

  megaOrder.items.forEach(item => {
    const productKey = item.product_id || item.product_name || 'unknown';
    const product = allProducts.find(p => p.id === item.product_id);
    const productName = item.product_name || product?.name || 'Unknown Product';
    const unit = String(item.unit || 'unit').toLowerCase();
    const quantity = Number(item.quantity) || 0;
    
    // Get product details
    const packageQuantity = Number(product?.package_quantity) || 1;
    const unitLabel = product?.unit_label || 'unit';
    const isPackageProduct = product?.selling_type === 'package';
    const categoryId = product?.category_id;
    const vat = getCategoryVat(categoryId);
    
    // Get unit price (price per small unit, not carton)
    let unitPrice = Number(product?.unit_price) || 0;
    if (!unitPrice && product) {
      // Calculate unit price from carton price
      unitPrice = Number(product.price) / packageQuantity || 0;
    }
    // Fallback to item's unit_price if product not found
    if (!unitPrice) {
      unitPrice = Number(item.unit_price) || 0;
    }

    // Convert carton to small units
    let smallUnitQuantity = quantity;
    let displayUnit = unit;
    
    if (unit === 'carton' && isPackageProduct) {
      // Convert carton to small units
      smallUnitQuantity = quantity * packageQuantity;
      displayUnit = unitLabel;
    } else if (isPackageProduct && unit !== unitLabel) {
      // If it's a different unit, keep as is but use the unit label
      displayUnit = unit;
    }

    if (!productGroups.has(productKey)) {
      productGroups.set(productKey, {
        productName,
        unitLabel: unitLabel,
        unitPrice: unitPrice,
        vat: vat,
        totalQuantity: 0
      });
    }

    const group = productGroups.get(productKey);
    group.totalQuantity = Number((group.totalQuantity + smallUnitQuantity).toFixed(2));
  });

  // Calculate totals for each product
  let grandTotal = 0;
  let grandTotalWithVat = 0;
  const invoiceLines = [];

  productGroups.forEach(group => {
    const totalPrice = Number((group.totalQuantity * group.unitPrice).toFixed(2));
    const totalPriceWithVat = calculatePriceWithVat(totalPrice, group.vat);
    grandTotal += totalPrice;
    grandTotalWithVat += totalPriceWithVat;
    invoiceLines.push({
      productName: group.productName,
      quantity: group.totalQuantity,
      unit: group.unitLabel,
      unitPrice: group.unitPrice,
      totalPrice,
      vat: group.vat,
      totalPriceWithVat
    });
  });

  // Generate invoice HTML
  const invoiceHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice - ${escapeHtml(megaOrder.id)}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          text-align: center;
          color: #333;
          border-bottom: 2px solid #667eea;
          padding-bottom: 10px;
        }
        .invoice-header {
          margin-bottom: 30px;
        }
        .invoice-header p {
          margin: 5px 0;
          color: #666;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 10px 6px;
          text-align: left;
          font-size: 13px;
        }
        th {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .number-col {
          text-align: right;
        }
        .total-row {
          font-weight: bold;
          background-color: #f0f0f0 !important;
        }
        .total-row td {
          border-top: 2px solid #333;
        }
        .grand-total-vat {
          background-color: #e8f5e9 !important;
        }
        @media print {
          body { margin: 0; padding: 10px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>MegaBuy Invoice</h1>
      <div class="invoice-header">
        <p><strong>Order ID:</strong> ${escapeHtml(megaOrder.id)}</p>
        <p><strong>Date:</strong> ${escapeHtml(formatOrderDate(megaOrder.updated_at || megaOrder.order_date))}</p>
        <p><strong>State:</strong> ${escapeHtml(megaOrder.state)}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Product Name</th>
            <th class="number-col">Qty</th>
            <th>Unit</th>
            <th class="number-col">Unit Price (kr)</th>
            <th class="number-col">Total (kr)</th>
            <th class="number-col">VAT %</th>
            <th class="number-col">Total incl. VAT (kr)</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceLines.map(line => `
            <tr>
              <td>${escapeHtml(line.productName)}</td>
              <td class="number-col">${line.quantity}</td>
              <td>${escapeHtml(line.unit)}</td>
              <td class="number-col">${line.unitPrice.toFixed(2)}</td>
              <td class="number-col">${line.totalPrice.toFixed(2)}</td>
              <td class="number-col">${line.vat}%</td>
              <td class="number-col">${line.totalPriceWithVat.toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="4"><strong>Grand Total (excl. VAT)</strong></td>
            <td class="number-col"><strong>${grandTotal.toFixed(2)} kr</strong></td>
            <td colspan="2"></td>
          </tr>
          <tr class="total-row grand-total-vat">
            <td colspan="6"><strong>Grand Total (incl. VAT)</strong></td>
            <td class="number-col"><strong>${grandTotalWithVat.toFixed(2)} kr</strong></td>
          </tr>
        </tbody>
      </table>
      <p class="no-print" style="text-align: center; margin-top: 30px;">
        <button onclick="window.print()" style="padding: 10px 30px; font-size: 16px; cursor: pointer;">Print Invoice</button>
      </p>
    </body>
    </html>
  `;

  // Open in new window and print
  const printWindow = window.open('', '_blank');
  printWindow.document.write(invoiceHtml);
  printWindow.document.close();
}

function openOrderModal() {
  currentOrderId = null;
  document.getElementById('orderModalTitle').textContent = 'Create New Order';
  document.getElementById('orderPersonName').value = '';
  document.getElementById('orderDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('orderState').value = 'Draft';
  document.getElementById('orderItems').innerHTML = '';
  addOrderItemRow();
  document.getElementById('orderModal').classList.add('show');
}

function closeOrderModal() {
  document.getElementById('orderModal').classList.remove('show');
  currentOrderId = null;
}

function getProductUnits(product) {
  const units = new Set();
  const unitLabel = String(product.unit_label || '').toLowerCase();
  const packageUnit = String(product.package_unit || '').toLowerCase();

  if (product.selling_type === 'package') {
    // Package type: show carton and small unit
    units.add('carton');
    if (unitLabel) units.add(unitLabel);
    if (packageUnit && packageUnit !== 'units' && packageUnit !== 'unit') {
      const isSingularForm = packageUnit.endsWith('s') && packageUnit.slice(0, -1) === unitLabel;
      if (packageUnit !== unitLabel && !isSingularForm) {
        units.add(packageUnit);
      }
    }
  } else {
    // Unit type: show only the small unit, no carton
    units.add(unitLabel);
  }

  return Array.from(units);
}

function renderOrderProductOptions() {
  const selects = document.querySelectorAll('.order-product');
  selects.forEach(select => {
    const selected = select.value;
    select.innerHTML = '<option value="">Select product</option>' +
      allProducts.map(product => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join('');
    select.value = selected;
  });
}

function addOrderItemRow(existingItem = null) {
  const itemsContainer = document.getElementById('orderItems');
  const row = document.createElement('div');
  row.className = 'order-item-row';
  row.innerHTML = `
    <select class="order-product" onchange="onOrderProductChange(this)">
      <option value="">Select product</option>
      ${allProducts.map(product => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join('')}
    </select>
    <input class="order-qty" type="number" min="0.01" step="0.01" value="1" onchange="updateOrderTotal()">
    <select class="order-unit" onchange="updateOrderTotal()">
      <option value="carton">carton</option>
    </select>
    <span class="order-line-total">0.00 kr</span>
    <button type="button" class="btn btn-danger" onclick="removeOrderItemRow(this)">Remove</button>
  `;

  // New items go to the top, existing items (when loading order) go to the bottom
  if (existingItem) {
    itemsContainer.appendChild(row);
  } else {
    itemsContainer.prepend(row);
  }

  if (existingItem) {
    row.querySelector('.order-product').value = existingItem.product_id;
    onOrderProductChange(row.querySelector('.order-product'));
    row.querySelector('.order-unit').value = existingItem.unit;
    row.querySelector('.order-qty').value = existingItem.quantity;
  }

  updateOrderTotal();
}

function editOrder(orderId) {
  const order = allOrders.find(item => item.id === orderId);
  if (!order) return;

  if (order.order_type === 'mega_buy') {
    showToast('Mega Buy order items are auto-generated and cannot be edited manually', 'error');
    return;
  }

  const isEditableDeliveredChild = order.state === 'Delivered' && Boolean(order.locked_by_mega_order_id);
  if (order.state !== 'Draft' && !isEditableDeliveredChild) {
    showToast('Only Draft orders and Delivered child orders from a Mega Buy can be edited', 'error');
    return;
  }

  currentOrderId = orderId;
  document.getElementById('orderModalTitle').textContent = `Edit Order ${order.id}`;
  document.getElementById('orderPersonName').value = order.person_name;
  document.getElementById('orderDate').value = order.order_date;
  document.getElementById('orderState').value = order.state;
  document.getElementById('orderItems').innerHTML = '';

  order.items.forEach(item => addOrderItemRow(item));

  document.getElementById('orderModal').classList.add('show');
}

function onOrderProductChange(selectElement) {
  const row = selectElement.closest('.order-item-row');
  const unitSelect = row.querySelector('.order-unit');
  const product = allProducts.find(item => item.id === selectElement.value);

  if (!product) {
    unitSelect.innerHTML = '<option value="carton">carton</option>';
    updateOrderTotal();
    return;
  }

  const units = getProductUnits(product);
  unitSelect.innerHTML = units.map(unit => `<option value="${unit}">${escapeHtml(unit)}</option>`).join('');
  unitSelect.value = 'carton';
  updateOrderTotal();
}

function removeOrderItemRow(buttonElement) {
  const rows = document.querySelectorAll('.order-item-row');
  if (rows.length <= 1) {
    showToast('An order needs at least one item', 'error');
    return;
  }

  buttonElement.closest('.order-item-row').remove();
  updateOrderTotal();
}

function getUnitPrice(product, unit) {
  const normalizedUnit = String(unit || '').toLowerCase();
  const unitLabel = String(product.unit_label || '').toLowerCase();
  const packageUnit = String(product.package_unit || '').toLowerCase();
  const singularPackageUnit = packageUnit.endsWith('s') ? packageUnit.slice(0, -1) : packageUnit;

  if (normalizedUnit === 'carton') {
    return Number(product.price);
  }

  if (normalizedUnit === unitLabel || normalizedUnit === packageUnit || normalizedUnit === singularPackageUnit) {
    if (product.selling_type === 'package') {
      if (product.unit_price) {
        return Number(product.unit_price);
      }
      // Calculate unit price from carton price / package quantity
      const packageQuantity = Number(product.package_quantity) || 1;
      return Number((Number(product.price) / packageQuantity).toFixed(2));
    }
    return Number(product.price);
  }

  // Handle fallback "unit" for unit-type products without a unit_label
  if (normalizedUnit === 'unit' && product.selling_type === 'unit') {
    return Number(product.price);
  }

  return null;
}

function updateOrderTotal() {
  const rows = document.querySelectorAll('.order-item-row');
  let total = 0;

  rows.forEach(row => {
    const productId = row.querySelector('.order-product').value;
    const quantity = Number(row.querySelector('.order-qty').value);
    const unit = row.querySelector('.order-unit').value;
    const lineElement = row.querySelector('.order-line-total');
    const product = allProducts.find(item => item.id === productId);

    if (!product || !quantity || quantity <= 0) {
      lineElement.textContent = '0.00 kr';
      return;
    }

    const unitPrice = getUnitPrice(product, unit);
    if (unitPrice === null) {
      lineElement.textContent = 'N/A';
      return;
    }

    const lineTotal = Number((unitPrice * quantity).toFixed(2));
    total += lineTotal;
    lineElement.textContent = `${lineTotal.toFixed(2)} kr`;
  });

  document.getElementById('orderTotalValue').textContent = `${total.toFixed(2)} kr`;
}

function aggregateOrderItems(items) {
  // Aggregate items with the same product_id and unit
  const aggregated = new Map();
  
  items.forEach(item => {
    const key = `${item.product_id}|${item.unit}`;
    if (aggregated.has(key)) {
      aggregated.get(key).quantity += item.quantity;
    } else {
      aggregated.set(key, { ...item });
    }
  });
  
  return Array.from(aggregated.values());
}

async function saveOrderHandler(event) {
  event.preventDefault();

  const personName = document.getElementById('orderPersonName').value.trim();
  const orderDate = document.getElementById('orderDate').value;
  const rows = Array.from(document.querySelectorAll('.order-item-row'));

  const rawItems = rows.map(row => ({
    product_id: row.querySelector('.order-product').value,
    quantity: Number(row.querySelector('.order-qty').value),
    unit: row.querySelector('.order-unit').value
  }));

  if (!personName) {
    showToast('Person name is required', 'error');
    return;
  }

  if (rawItems.some(item => !item.product_id || !item.unit || !item.quantity || item.quantity <= 0)) {
    showToast('Each order item must have product, quantity and unit', 'error');
    return;
  }

  // Aggregate items with the same product and unit
  const items = aggregateOrderItems(rawItems);

  try {
    const isEditMode = Boolean(currentOrderId);
    const response = await fetch(isEditMode ? `/api/orders/${currentOrderId}` : '/api/orders', {
      method: isEditMode ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_name: personName,
        order_date: orderDate,
        items
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Failed to ${isEditMode ? 'update' : 'create'} order`);
    }

    showToast(`Order ${isEditMode ? 'updated' : 'created'} successfully!`);
    closeOrderModal();
    loadOrders();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function deleteOrder(orderId) {
  const order = allOrders.find(item => item.id === orderId);
  if (!order) {
    showToast('Order not found', 'error');
    return;
  }

  const confirmationMessage = order.order_type === 'mega_buy' && order.state === 'Closed'
    ? 'Delete this Closed Mega Buy order? This will also delete all its child orders.'
    : 'Are you sure you want to delete this draft order?';

  if (!confirm(confirmationMessage)) return;

  try {
    const response = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete order');
    }

    showToast('Order deleted successfully!');
    loadOrders();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

// ==================== ADD TO ORDER ====================
let addToOrderProductId = null;

function getEditableOrders() {
  // Return normal orders in Draft or Delivered state
  return allOrders.filter(order => 
    order.order_type !== 'mega_buy' && 
    (order.state === 'Draft' || order.state === 'Delivered')
  );
}

function openAddToOrderModal(productId) {
  addToOrderProductId = productId;
  const product = allProducts.find(p => p.id === productId);
  const editableOrders = getEditableOrders();
  
  const modal = document.getElementById('addToOrderModal');
  const contentContainer = document.getElementById('addToOrderContent');
  const productNameEl = document.getElementById('addToOrderProductName');
  
  productNameEl.textContent = product ? product.name : 'Unknown Product';
  
  if (editableOrders.length === 0) {
    // No editable orders - show message
    contentContainer.innerHTML = `
      <div class="empty-message">
        <p>You need to create an order in the Orders tab before adding products.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="closeAddToOrderModal()">Close</button>
      </div>
    `;
  } else {
    // Show form to add product to an order
    const units = product ? getProductUnits(product) : ['carton'];
    contentContainer.innerHTML = `
      <form onsubmit="addProductToOrderHandler(event)">
        <div class="form-group">
          <label for="addToOrderSelect">Select Order *</label>
          <select id="addToOrderSelect" required>
            <option value="">Select an order</option>
            ${editableOrders.map(order => `
              <option value="${order.id}">${escapeHtml(order.person_name)} (${order.state})</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="addToOrderQuantity">Quantity *</label>
          <input 
            type="number" 
            id="addToOrderQuantity" 
            min="0.01" 
            step="0.01" 
            value="1" 
            required
          >
        </div>
        <div class="form-group">
          <label for="addToOrderUnit">Unit *</label>
          <select id="addToOrderUnit" required>
            ${units.map(unit => `<option value="${unit}">${escapeHtml(unit)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeAddToOrderModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add to Order</button>
        </div>
      </form>
    `;
  }
  
  modal.classList.add('show');
}

function closeAddToOrderModal() {
  document.getElementById('addToOrderModal').classList.remove('show');
  addToOrderProductId = null;
}

async function addProductToOrderHandler(event) {
  event.preventDefault();
  
  const orderId = document.getElementById('addToOrderSelect').value;
  const quantity = Number(document.getElementById('addToOrderQuantity').value);
  const unit = document.getElementById('addToOrderUnit').value;
  
  if (!orderId || !addToOrderProductId || !quantity || quantity <= 0 || !unit) {
    showToast('Please fill in all fields', 'error');
    return;
  }
  
  const order = allOrders.find(o => o.id === orderId);
  if (!order) {
    showToast('Order not found', 'error');
    return;
  }
  
  // Add the new item to the top of the existing order items
  const rawItems = [{
    product_id: addToOrderProductId,
    quantity: quantity,
    unit: unit
  }, ...order.items];
  
  // Aggregate items with the same product and unit
  const updatedItems = aggregateOrderItems(rawItems);
  
  try {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_name: order.person_name,
        order_date: order.order_date,
        items: updatedItems
      })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add product to order');
    }
    
    const product = allProducts.find(p => p.id === addToOrderProductId);
    showToast(`Added ${product ? product.name : 'product'} to ${order.person_name}'s order!`);
    closeAddToOrderModal();
    loadOrders();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

// ==================== UTILITY FUNCTIONS ====================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatOrderDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const datePart = date.toISOString().split('T')[0];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

// Close modals when clicking outside
window.onclick = (event) => {
  const categoryModal = document.getElementById('categoryModal');
  const productModal = document.getElementById('productModal');
  const orderModal = document.getElementById('orderModal');
  const addToOrderModal = document.getElementById('addToOrderModal');

  if (event.target === categoryModal) {
    closeCategoryModal();
  }
  if (event.target === productModal) {
    closeProductModal();
  }
  if (event.target === orderModal) {
    closeOrderModal();
  }
  if (event.target === addToOrderModal) {
    closeAddToOrderModal();
  }
};
