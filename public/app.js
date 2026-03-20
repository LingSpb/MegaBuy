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
    <div class="card">
      <div class="card-content">
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.description || 'No description')}</p>
        <small>Created: ${new Date(category.created_at).toLocaleDateString()}</small>
      </div>
      <div class="card-actions">
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
    <div class="card">
      <div class="card-content">
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.description || 'No description')}</p>
        <small>Created: ${new Date(category.created_at).toLocaleDateString()}</small>
      </div>
      <div class="card-actions">
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
  document.getElementById('categoryModal').classList.add('show');
}

async function saveCategoryHandler(event) {
  event.preventDefault();

  const name = document.getElementById('categoryName').value;
  const description = document.getElementById('categoryDescription').value;

  try {
    const url = currentCategoryId ? `/api/categories/${currentCategoryId}` : '/api/categories';
    const method = currentCategoryId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
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
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Failed to load products');
    allProducts = await response.json();
    displayProducts();
    renderOrderProductOptions();
  } catch (error) {
    showToast('Error loading products: ' + error.message, 'error');
  }
}

function displayProducts() {
  const container = document.getElementById('products-list');

  if (allProducts.length === 0) {
    container.innerHTML = '<div class="empty-message">No products yet. Create one to get started!</div>';
    return;
  }

  container.innerHTML = allProducts.map(product => `
    <div class="card">
      <div class="product-info">
        <div class="card-content">
          <h3>${escapeHtml(product.name)}</h3>
          <p><strong>Category:</strong> ${escapeHtml(product.category_name)}</p>
          <p>${escapeHtml(product.description || 'No description')}</p>
          <small>Created: ${new Date(product.created_at).toLocaleDateString()}</small>
        </div>
        <div>
          <span class="price-badge">${product.price} kr</span>
          ${product.selling_type === 'package'
            ? `<span class="selling-type-badge">Carton × ${product.package_quantity} ${product.package_unit || product.unit_label || 'units'}</span>`
            : `<span class="selling-type-badge">Per ${product.unit_label || 'unit'}</span>`
          }
          ${product.unit_price ? `<span class="unit-price-badge">${product.unit_price} kr/${product.unit_label || 'unit'}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-edit" onclick="editProduct('${product.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteProduct('${product.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function filterProducts() {
  const searchTerm = document.getElementById('productSearch').value.toLowerCase();
  const filtered = allProducts.filter(prod => 
    prod.name.toLowerCase().includes(searchTerm) ||
    prod.description.toLowerCase().includes(searchTerm) ||
    prod.category_name.toLowerCase().includes(searchTerm)
  );

  const container = document.getElementById('products-list');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-message">No products found</div>';
    return;
  }

  container.innerHTML = filtered.map(product => `
    <div class="card">
      <div class="product-info">
        <div class="card-content">
          <h3>${escapeHtml(product.name)}</h3>
          <p><strong>Category:</strong> ${escapeHtml(product.category_name)}</p>
          <p>${escapeHtml(product.description || 'No description')}</p>
          <small>Created: ${new Date(product.created_at).toLocaleDateString()}</small>
        </div>
        <div>
          <span class="price-badge">${product.price} kr</span>
          ${product.selling_type === 'package'
            ? `<span class="selling-type-badge">Carton × ${product.package_quantity} ${product.package_unit || product.unit_label || 'units'}</span>`
            : `<span class="selling-type-badge">Per ${product.unit_label || 'unit'}</span>`
          }
          ${product.unit_price ? `<span class="unit-price-badge">${product.unit_price} kr/${product.unit_label || 'unit'}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-edit" onclick="editProduct('${product.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteProduct('${product.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function updateCategoryDropdown() {
  const select = document.getElementById('productCategory');
  select.innerHTML = '<option value="">Select a category</option>' + 
    allCategories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
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
  document.getElementById('productPrice').value = product.price;
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
  const price = document.getElementById('productPrice').value;
  const package_quantity = document.getElementById('packageQuantity').value;

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
        price: parseFloat(price),
        package_quantity: parseInt(package_quantity) || 1
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
    productGroup.units.set(unit, (productGroup.units.get(unit) || 0) + quantity);
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

function renderOrderCard(order) {
  const childOrderIds = Array.isArray(order.child_order_ids) && order.child_order_ids.length > 0
    ? order.child_order_ids
    : (Array.isArray(order.source_order_ids) ? order.source_order_ids : []);

  return `
    <div class="card order-card">
      <div class="card-content">
        <h3>${escapeHtml(order.id)}</h3>
        <p><strong>Person:</strong> ${escapeHtml(order.person_name)}</p>
        <p><strong>Date:</strong> ${escapeHtml(order.order_date)}</p>
        <p><strong>Items:</strong> ${order.items.length}</p>
        <p><strong>Total:</strong> ${Number(order.total_amount || 0).toFixed(2)} kr</p>
        ${order.order_type === 'mega_buy' ? `<p><strong>Child Orders:</strong> ${childOrderIds.map(id => escapeHtml(id)).join(', ') || 'N/A'}</p>` : ''}
        <small>${formatOrderItemsSummary(order.items)}</small>
      </div>
      <div class="card-actions order-actions">
        <span class="state-badge ${getOrderStateClass(order.state)}">${escapeHtml(order.state)}</span>
        ${order.order_type === 'mega_buy' ? `<span class="selling-type-badge">Mega Buy</span>` : ''}
        ${order.state === 'Draft' && order.order_type !== 'mega_buy' ? `<button class="btn btn-edit" onclick="editOrder('${order.id}')">Edit</button>` : ''}
        ${order.state === 'Draft' ? `<button class="btn btn-danger" onclick="deleteOrder('${order.id}')">Delete</button>` : ''}
        ${order.state === 'Draft' && order.order_type === 'mega_buy' ? `<button class="btn btn-dark" onclick="recalculateMegaBuyOrder('${order.id}')">Recalculate</button>` : ''}
        ${order.state === 'Draft' && order.order_type === 'mega_buy' ? `<button class="btn btn-primary" onclick="placeMegaBuyOrder('${order.id}')">Place Order</button>` : ''}
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

  const activeNormalOrders = allOrders.filter(o => o.order_type !== 'mega_buy' && o.state === 'Draft');
  const activeMegaOrders = allOrders.filter(o => o.order_type === 'mega_buy');
  const archivedOrders = allOrders.filter(o => o.state !== 'Draft' && o.order_type !== 'mega_buy')
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

  const sortedNormal = [...activeNormalOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const sortedMega = [...activeMegaOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  normalContainer.innerHTML = sortedNormal.length > 0
    ? sortedNormal.map(renderOrderCard).join('')
    : '<div class="empty-message">No normal draft orders</div>';

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

  const normalMatches = allOrders.filter(o => o.order_type !== 'mega_buy' && o.state === 'Draft' && matches(o))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const megaMatches = allOrders.filter(o => o.order_type === 'mega_buy' && matches(o))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const archivedMatches = allOrders.filter(o => o.state !== 'Draft' && o.order_type !== 'mega_buy' && matches(o))
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

async function placeMegaBuyOrder(orderId) {
  if (!confirm('Place this Mega Buy order? This will lock this order and all child orders.')) {
    return;
  }

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
  const units = new Set(['carton']);
  const unitLabel = String(product.unit_label || '').toLowerCase();
  const packageUnit = String(product.package_unit || '').toLowerCase();

  if (unitLabel) units.add(unitLabel);
  if (packageUnit) {
    units.add(packageUnit);
    if (packageUnit.endsWith('s') && packageUnit.length > 1) {
      units.add(packageUnit.slice(0, -1));
    }
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

  itemsContainer.appendChild(row);

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

  if (order.state !== 'Draft') {
    showToast('Only Draft orders can be edited', 'error');
    return;
  }

  currentOrderId = orderId;
  document.getElementById('orderModalTitle').textContent = `Edit Order ${order.id}`;
  document.getElementById('orderPersonName').value = order.person_name;
  document.getElementById('orderDate').value = order.order_date;
  document.getElementById('orderState').value = 'Draft';
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
      return product.unit_price ? Number(product.unit_price) : null;
    }
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

async function saveOrderHandler(event) {
  event.preventDefault();

  const personName = document.getElementById('orderPersonName').value.trim();
  const orderDate = document.getElementById('orderDate').value;
  const rows = Array.from(document.querySelectorAll('.order-item-row'));

  const items = rows.map(row => ({
    product_id: row.querySelector('.order-product').value,
    quantity: Number(row.querySelector('.order-qty').value),
    unit: row.querySelector('.order-unit').value
  }));

  if (!personName) {
    showToast('Person name is required', 'error');
    return;
  }

  if (items.some(item => !item.product_id || !item.unit || !item.quantity || item.quantity <= 0)) {
    showToast('Each order item must have product, quantity and unit', 'error');
    return;
  }

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
  if (!confirm('Are you sure you want to delete this draft order?')) return;

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

// Close modals when clicking outside
window.onclick = (event) => {
  const categoryModal = document.getElementById('categoryModal');
  const productModal = document.getElementById('productModal');
  const orderModal = document.getElementById('orderModal');

  if (event.target === categoryModal) {
    closeCategoryModal();
  }
  if (event.target === productModal) {
    closeProductModal();
  }
  if (event.target === orderModal) {
    closeOrderModal();
  }
};
