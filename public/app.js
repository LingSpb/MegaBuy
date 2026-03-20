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
        <small>Created: ${new Date(category.created_at).toLocaleDateString()}</small>
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
        <small>Created: ${new Date(category.created_at).toLocaleDateString()}</small>
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
        <button class="btn btn-primary" onclick="openAddToOrderModal('${product.id}')">Add to Order</button>
        <button class="btn btn-edit" onclick="editProduct('${product.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteProduct('${product.id}')">Delete</button>
      </div>
    </div>
  `).join('');
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
        <button class="btn btn-primary" onclick="openAddToOrderModal('${product.id}')">Add to Order</button>
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
  const canEditNormalOrder = order.order_type !== 'mega_buy' && (
    order.state === 'Draft' || (order.state === 'Delivered' && Boolean(order.locked_by_mega_order_id))
  );

  return `
    <div class="card order-card">
      <div class="card-content">
        <div class="order-header">
          <h3>${escapeHtml(order.id)}</h3>
          <span class="state-badge ${getOrderStateClass(order.state)}">${escapeHtml(order.state)}</span>
          ${order.order_type === 'mega_buy' ? `<span class="selling-type-badge">Mega Buy</span>` : ''}
        </div>
        <p><strong>Person:</strong> ${escapeHtml(order.person_name)}</p>
        <p><strong>Date:</strong> ${escapeHtml(order.order_date)}</p>
        <p><strong>Items:</strong> ${order.items.length}</p>
        <p><strong>Total:</strong> ${Number(order.total_amount || 0).toFixed(2)} kr</p>
        ${order.order_type === 'mega_buy' ? `<p><strong>Child Orders:</strong> ${childOrderIds.map(id => escapeHtml(id)).join(', ') || 'N/A'}</p>` : ''}
        <small>${formatOrderItemsSummary(order.items)}</small>
      </div>
      <div class="card-actions order-actions">
        ${canEditNormalOrder ? `<button class="btn btn-edit" onclick="editOrder('${order.id}')">Edit</button>` : ''}
        ${(order.state === 'Draft' || (order.order_type === 'mega_buy' && order.state === 'Closed')) ? `<button class="btn btn-danger" onclick="deleteOrder('${order.id}')">Delete</button>` : ''}
        ${(order.state === 'Draft' || order.state === 'Delivered') && order.order_type === 'mega_buy' ? `<button class="btn btn-dark" onclick="recalculateMegaBuyOrder('${order.id}')">Recalculate</button>` : ''}
        ${order.state === 'Draft' && order.order_type === 'mega_buy' ? `<button class="btn btn-primary" onclick="placeMegaBuyOrder('${order.id}')">Place Order</button>` : ''}
        ${order.state === 'Locked' && order.order_type === 'mega_buy' ? `<button class="btn btn-primary" onclick="deliverMegaBuyOrder('${order.id}')">Deliver Order</button>` : ''}
        ${order.state === 'Delivered' && order.order_type === 'mega_buy' ? `<button class="btn btn-primary" onclick="closeMegaBuyOrder('${order.id}')">Close Order</button>` : ''}
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

  const sortedNormal = [...activeNormalOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
    // Check if packageUnit is different from unitLabel and not just a plural form
    const isSingularForm = packageUnit.endsWith('s') && packageUnit.slice(0, -1) === unitLabel;
    if (packageUnit !== unitLabel && !isSingularForm) {
      units.add(packageUnit);
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
  
  // Add the new item to the existing order items
  const updatedItems = [...order.items, {
    product_id: addToOrderProductId,
    quantity: quantity,
    unit: unit
  }];
  
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
