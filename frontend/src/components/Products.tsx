import { useState, useMemo, FormEvent } from "react";
import { useApp } from "../context/AppContext";
import Modal from "./Modal";
import {
  getProductDescription,
  getProductUnits,
  aggregateOrderItems,
} from "../utils/helpers";
import type { Product, ProductFormData } from "../types";

interface ProductsProps {
  categoryFilter: string;
  onCategoryFilterChange: (categoryId: string) => void;
}

interface AddToOrderFormData {
  orderId: string;
  quantity: number | string;
  unit: string;
}

export default function Products({
  categoryFilter,
  onCategoryFilterChange,
}: ProductsProps) {
  const {
    categories,
    products,
    orders,
    saveProduct,
    deleteProduct,
    saveOrder,
    showToast,
    getCategoryVat,
    calculatePriceWithVat,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addToOrderModalOpen, setAddToOrderModalOpen] = useState(false);
  const [addToOrderProductId, setAddToOrderProductId] = useState<string | null>(
    null,
  );
  const [addToOrderForm, setAddToOrderForm] = useState<AddToOrderFormData>({
    orderId: "",
    quantity: 1,
    unit: "carton",
  });
  const [form, setForm] = useState<ProductFormData>({
    name: "",
    category_id: "",
    description: "",
    selling_type: "unit",
    unit_label: "",
    price: "",
    package_quantity: 1,
  });

  const filteredProducts = useMemo(() => {
    let result = products;

    if (categoryFilter) {
      result = result.filter((p) => p.category_id === categoryFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.description || "").toLowerCase().includes(term) ||
          (p.category_name || "").toLowerCase().includes(term),
      );
    }

    return result;
  }, [products, categoryFilter, searchTerm]);

  const editableOrders = useMemo(() => {
    return orders.filter(
      (order) =>
        order.order_type !== "mega_buy" &&
        (order.state === "Draft" || order.state === "Delivered"),
    );
  }, [orders]);

  const openModal = (product: Product | null = null) => {
    if (product) {
      setEditingId(product.id);
      let displayPrice: number | string = product.price;
      if (product.selling_type === "package") {
        displayPrice =
          product.unit_price ||
          (product.package_quantity && product.package_quantity > 0
            ? Number((product.price / product.package_quantity).toFixed(2))
            : product.price);
      }
      setForm({
        name: product.name,
        category_id: product.category_id,
        description: product.description || "",
        selling_type: product.selling_type,
        unit_label: product.unit_label || "",
        price: displayPrice,
        package_quantity: product.package_quantity || 1,
      });
    } else {
      setEditingId(null);
      setForm({
        name: "",
        category_id: "",
        description: "",
        selling_type: "unit",
        unit_label: "",
        price: "",
        package_quantity: 1,
      });
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const inputPrice = parseFloat(String(form.price));
      const packageQuantity = parseFloat(String(form.package_quantity)) || 1;

      let price = inputPrice;
      let unitPrice: number | null = inputPrice;
      if (form.selling_type === "package" && packageQuantity > 0) {
        price = Number((inputPrice * packageQuantity).toFixed(2));
      } else {
        unitPrice = null;
      }

      await saveProduct(
        {
          name: form.name,
          category_id: form.category_id,
          description: form.description,
          selling_type: form.selling_type,
          unit_label: form.unit_label,
          price,
          package_quantity: packageQuantity,
          unit_price: unitPrice,
        } as ProductFormData,
        editingId,
      );

      showToast(
        editingId
          ? "Product updated successfully!"
          : "Product created successfully!",
      );
      closeModal();
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteProduct(id);
      showToast("Product deleted successfully!");
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const openAddToOrderModal = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const units = getProductUnits(product);
    setAddToOrderProductId(productId);
    setAddToOrderForm({ orderId: "", quantity: 1, unit: units[0] || "carton" });
    setAddToOrderModalOpen(true);
  };

  const closeAddToOrderModal = () => {
    setAddToOrderModalOpen(false);
    setAddToOrderProductId(null);
  };

  const handleAddToOrder = async (e: FormEvent) => {
    e.preventDefault();

    const order = orders.find((o) => o.id === addToOrderForm.orderId);
    if (!order) {
      showToast("Order not found", "error");
      return;
    }

    const rawItems = [
      {
        product_id: addToOrderProductId!,
        quantity: Number(addToOrderForm.quantity),
        unit: addToOrderForm.unit,
      },
      ...order.items,
    ];

    const updatedItems = aggregateOrderItems(rawItems);

    try {
      await saveOrder(
        {
          person_name: order.person_name,
          order_date: order.order_date,
          items: updatedItems,
        },
        order.id,
      );

      const product = products.find((p) => p.id === addToOrderProductId);
      showToast(
        `Added ${product ? product.name : "product"} to ${order.person_name}'s order!`,
      );
      closeAddToOrderModal();
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const addToOrderProduct = useMemo(() => {
    return products.find((p) => p.id === addToOrderProductId);
  }, [products, addToOrderProductId]);

  const addToOrderUnits = useMemo(() => {
    return addToOrderProduct ? getProductUnits(addToOrderProduct) : ["carton"];
  }, [addToOrderProduct]);

  return (
    <div className="tab active">
      <div className="tab-header">
        <h2>Products</h2>
        <button className="btn btn-primary" onClick={() => openModal()}>
          + Add Product
        </button>
      </div>

      <div className="tab-description">
        Manage your product catalog. Add, edit, and delete products with pricing
        information and selling types (by unit or by package).
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-dropdown">
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="list-container">
        {filteredProducts.length === 0 ? (
          <div className="empty-message">
            {searchTerm || categoryFilter
              ? "No products found"
              : "No products yet. Create one to get started!"}
          </div>
        ) : (
          filteredProducts.map((product) => {
            const vat = getCategoryVat(product.category_id);
            const isPackage = product.selling_type === "package";
            const displayPrice = isPackage ? product.unit_price : product.price;
            const displayPriceWithVat = displayPrice
              ? calculatePriceWithVat(displayPrice, vat)
              : null;

            return (
              <div key={product.id} className="card">
                <div className="product-info">
                  <div className="card-content">
                    <h3>{product.name}</h3>
                    <p>
                      <strong>Category:</strong> {product.category_name}
                    </p>
                    <p>{getProductDescription(product)}</p>
                  </div>
                  <div>
                    {isPackage ? (
                      <span className="selling-type-badge">
                        Carton × {product.package_quantity}{" "}
                        {product.unit_label || product.package_unit || "units"}
                      </span>
                    ) : (
                      <span className="selling-type-badge">
                        Per {product.unit_label}
                      </span>
                    )}
                    {displayPrice && (
                      <span className="unit-price-badge">
                        {displayPrice} kr/{product.unit_label}
                      </span>
                    )}
                    {displayPriceWithVat && (
                      <span className="unit-price-vat-badge">
                        {displayPriceWithVat} kr/{product.unit_label} incl. VAT
                      </span>
                    )}
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => openAddToOrderModal(product.id)}
                  >
                    Add to Order
                  </button>
                  <button
                    className="btn btn-edit"
                    onClick={() => openModal(product)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(product.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Product Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit Product" : "Add New Product"}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="productName">Product Name *</label>
            <input
              type="text"
              id="productName"
              placeholder="e.g., Rice ST25 18kg"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="productCategory">Category *</label>
            <select
              id="productCategory"
              value={form.category_id}
              onChange={(e) =>
                setForm({ ...form, category_id: e.target.value })
              }
              required
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="productDescription">Description</label>
            <textarea
              id="productDescription"
              placeholder="Enter product description"
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="sellingType">Selling Type *</label>
            <select
              id="sellingType"
              value={form.selling_type}
              onChange={(e) =>
                setForm({
                  ...form,
                  selling_type: e.target.value as "unit" | "package",
                })
              }
              required
            >
              <option value="unit">By Unit</option>
              <option value="package">By Package</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="unitLabel">Unit Label *</label>
            <input
              type="text"
              id="unitLabel"
              placeholder="e.g., piece, bag, bottle, kg"
              value={form.unit_label}
              onChange={(e) => setForm({ ...form, unit_label: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="productPrice">Unit Price (kr) *</label>
            <input
              type="number"
              id="productPrice"
              placeholder="e.g., 32.08 (price per unit)"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
          </div>
          {form.selling_type === "package" && (
            <div className="form-group">
              <label htmlFor="packageQuantity">Package Quantity *</label>
              <input
                type="number"
                id="packageQuantity"
                placeholder="e.g., 12 (units per carton)"
                step="0.01"
                value={form.package_quantity}
                onChange={(e) =>
                  setForm({ ...form, package_quantity: e.target.value })
                }
                required
              />
            </div>
          )}
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeModal}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Product
            </button>
          </div>
        </form>
      </Modal>

      {/* Add to Order Modal */}
      <Modal
        isOpen={addToOrderModalOpen}
        onClose={closeAddToOrderModal}
        title={`Add ${addToOrderProduct?.name || "Product"} to Order`}
      >
        {editableOrders.length === 0 ? (
          <>
            <div className="empty-message">
              <p>
                You need to create an order in the Orders tab before adding
                products.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeAddToOrderModal}
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleAddToOrder}>
            <div className="form-group">
              <label htmlFor="addToOrderSelect">Select Order *</label>
              <select
                id="addToOrderSelect"
                value={addToOrderForm.orderId}
                onChange={(e) =>
                  setAddToOrderForm({
                    ...addToOrderForm,
                    orderId: e.target.value,
                  })
                }
                required
              >
                <option value="">Select an order</option>
                {editableOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.person_name} ({order.state})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="addToOrderQuantity">Quantity *</label>
              <input
                type="number"
                id="addToOrderQuantity"
                min="0.01"
                step="0.01"
                value={addToOrderForm.quantity}
                onChange={(e) =>
                  setAddToOrderForm({
                    ...addToOrderForm,
                    quantity: e.target.value,
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="addToOrderUnit">Unit *</label>
              <select
                id="addToOrderUnit"
                value={addToOrderForm.unit}
                onChange={(e) =>
                  setAddToOrderForm({ ...addToOrderForm, unit: e.target.value })
                }
                required
              >
                {addToOrderUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeAddToOrderModal}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Add to Order
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
