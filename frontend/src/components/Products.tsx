import { useState, useMemo, useRef, FormEvent, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useI18n } from "../i18n";
import Modal from "./Modal";
import {
  getProductDescription,
  getProductUnits,
  aggregateOrderItems,
  removeVietnameseTones,
} from "../utils/helpers";
import type { ProductWithMetadata, ProductFormData } from "../types";

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
    fetchProducts,
    addToShoppingList,
    removeFromShoppingList,
    isInShoppingList,
  } = useApp();
  const { t } = useI18n();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);

  const filteredProducts = useMemo(() => {
    let result = products;

    if (categoryFilter) {
      result = result.filter((p) => p.category_id === categoryFilter);
    }

    if (searchTerm) {
      const term = removeVietnameseTones(searchTerm.toLowerCase());
      result = result.filter((p) => {
        const category = categories.find((c) => c.id === p.category_id);
        const categoryName = category?.name || "";
        return (
          removeVietnameseTones(p.name.toLowerCase()).includes(term) ||
          removeVietnameseTones((p.description || "").toLowerCase()).includes(
            term,
          ) ||
          removeVietnameseTones(categoryName.toLowerCase()).includes(term)
        );
      });
    }

    return result;
  }, [products, categories, categoryFilter, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, itemsPerPage]);

  const editableOrders = useMemo(() => {
    return orders.filter(
      (order) =>
        order.order_type !== "mega_buy" &&
        (order.state === "Draft" || order.state === "Delivered"),
    );
  }, [orders]);

  const openModal = (product: ProductWithMetadata | null = null) => {
    if (product) {
      setEditingId(product.id);
      // product.price is the unit price
      const displayPrice = product.price;
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
        editingId ? t("products.productUpdated") : t("products.productCreated"),
      );
      closeModal();
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("products.deleteConfirm"))) return;
    try {
      await deleteProduct(id);
      showToast(t("products.productDeleted"));
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
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
      showToast(t("common.noResults"), "error");
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
        t("products.addedToOrder")
          .replace(
            "{product}",
            product ? `${product.id} - ${product.name}` : "product",
          )
          .replace("{person}", order.person_name),
      );
      closeAddToOrderModal();
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
    }
  };

  const addToOrderProduct = useMemo(() => {
    return products.find((p) => p.id === addToOrderProductId);
  }, [products, addToOrderProductId]);

  const addToOrderUnits = useMemo(() => {
    return addToOrderProduct ? getProductUnits(addToOrderProduct) : ["carton"];
  }, [addToOrderProduct]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setImporting(true);
    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      showToast(data.message);
      if (data.errors && data.errors.length > 0) {
        console.warn("Import warnings:", data.errors);
        // Show first few errors to user
        const errorSummary = data.errors.slice(0, 5).join("\n");
        const moreCount = data.errors.length - 5;
        const suffix =
          moreCount > 0
            ? `\n... ${t("common.and")} ${moreCount} ${t("common.more")}`
            : "";
        showToast(
          `${t("products.importErrors")}:\n${errorSummary}${suffix}`,
          "error",
        );
      }
      await fetchProducts();
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
    } finally {
      setImporting(false);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="tab active">
      <div className="tab-header">
        <h2>{t("products.title")}</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx,.xls"
            style={{ display: "none" }}
          />
          <button
            className="btn btn-primary"
            onClick={handleImportClick}
            disabled={importing}
          >
            {importing ? t("products.importing") : t("products.importProducts")}
          </button>
          <button className="btn btn-primary" onClick={() => openModal()}>
            + {t("products.newProduct")}
          </button>
        </div>
      </div>

      <div className="tab-description">{t("products.pageDescription")}</div>

      <div className="filter-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder={t("common.searchProducts")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-dropdown">
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
          >
            <option value="">{t("products.allCategories")}</option>
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
              ? t("products.noProductsFound")
              : t("products.noProductsYet")}
          </div>
        ) : (
          paginatedProducts.map((product) => {
            const vat = getCategoryVat(product.category_id);
            const isPackage = product.selling_type === "package";
            // product.price is the unit price
            const displayPrice = product.price;
            const displayPriceWithVat = displayPrice
              ? calculatePriceWithVat(displayPrice, vat)
              : null;
            const category = categories.find(
              (c) => c.id === product.category_id,
            );
            const categoryName = category?.name || "Unknown";

            return (
              <div key={product.id} className="card">
                <div className="product-info">
                  <div className="card-content">
                    <h3>
                      {product.id} - {product.name}
                    </h3>
                    <p>
                      <strong>{t("common.category")}:</strong> {categoryName}
                    </p>
                    <p>{getProductDescription(product)}</p>
                  </div>
                  <div>
                    {isPackage ? (
                      <span className="selling-type-badge">
                        {t("products.cartonLabel")
                          .replace("{qty}", String(product.package_quantity))
                          .replace(
                            "{unit}",
                            product.unit_label ||
                              product.package_unit ||
                              "units",
                          )}
                      </span>
                    ) : (
                      <span className="selling-type-badge">
                        {t("products.perUnit")} {product.unit_label}
                      </span>
                    )}
                    {displayPrice && (
                      <span className="unit-price-badge">
                        {displayPrice} kr/{product.unit_label}
                      </span>
                    )}
                    {displayPriceWithVat && (
                      <span className="unit-price-vat-badge">
                        {displayPriceWithVat} kr/{product.unit_label}{" "}
                        {t("common.inclVat")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="card-actions">
                  {isInShoppingList(product.id) ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => removeFromShoppingList(product.id)}
                    >
                      {t("products.removeFromList")}
                    </button>
                  ) : (
                    <button
                      className="btn btn-favorite"
                      onClick={() => addToShoppingList(product.id)}
                    >
                      {t("products.addToList")}
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => openAddToOrderModal(product.id)}
                  >
                    {t("products.addToOrder")}
                  </button>
                  <button
                    className="btn btn-edit"
                    onClick={() => openModal(product)}
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(product.id)}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {filteredProducts.length > 0 && (
        <div className="pagination">
          <div className="pagination-info">
            {t("common.showing")} {startIndex + 1} {t("common.to")}{" "}
            {Math.min(endIndex, filteredProducts.length)} {t("common.of")}{" "}
            {filteredProducts.length} {t("common.items")}
          </div>
          <div className="pagination-controls">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              {t("common.first")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              {t("common.previous")}
            </button>
            <span className="pagination-pages">
              {t("common.page")}{" "}
              <input
                type="number"
                min={1}
                max={totalPages || 1}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value, 10);
                  if (!isNaN(page) && page >= 1 && page <= totalPages) {
                    setCurrentPage(page);
                  }
                }}
                onBlur={(e) => {
                  const page = parseInt(e.target.value, 10);
                  if (isNaN(page) || page < 1) {
                    setCurrentPage(1);
                  } else if (page > totalPages) {
                    setCurrentPage(totalPages);
                  }
                }}
                className="page-input"
              />{" "}
              {t("common.of")} {totalPages || 1}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              {t("common.next")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
            >
              {t("common.last")}
            </button>
          </div>
          <div className="pagination-size">
            <label>{t("common.itemsPerPage")}:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

      {/* Product Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? t("products.editProduct") : t("products.newProduct")}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="productName">{t("products.productName")} *</label>
            <input
              type="text"
              id="productName"
              placeholder={t("products.placeholder.productName")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="productCategory">{t("products.category")} *</label>
            <select
              id="productCategory"
              value={form.category_id}
              onChange={(e) =>
                setForm({ ...form, category_id: e.target.value })
              }
              required
            >
              <option value="">{t("products.selectCategory")}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="productDescription">
              {t("products.description")}
            </label>
            <textarea
              id="productDescription"
              placeholder={t("products.placeholder.description")}
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="sellingType">{t("products.sellingType")} *</label>
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
              <option value="unit">{t("products.perUnit")}</option>
              <option value="package">{t("products.perPackage")}</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="unitLabel">{t("products.unitLabel")} *</label>
            <input
              type="text"
              id="unitLabel"
              placeholder={t("products.placeholder.unitLabel")}
              value={form.unit_label}
              onChange={(e) => setForm({ ...form, unit_label: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="productPrice">{t("products.unitPrice")} *</label>
            <input
              type="number"
              id="productPrice"
              placeholder={t("products.placeholder.price")}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
          </div>
          {form.selling_type === "package" && (
            <div className="form-group">
              <label htmlFor="packageQuantity">
                {t("products.packageQuantity")} *
              </label>
              <input
                type="number"
                id="packageQuantity"
                placeholder={t("products.placeholder.packageQuantity")}
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
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add to Order Modal */}
      <Modal
        isOpen={addToOrderModalOpen}
        onClose={closeAddToOrderModal}
        title={`${t("addToOrder.title")}: ${addToOrderProduct?.id || ""} - ${addToOrderProduct?.name || ""}`}
      >
        {editableOrders.length === 0 ? (
          <>
            <div className="empty-message">
              <p>{t("orders.description")}</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeAddToOrderModal}
              >
                {t("common.close")}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleAddToOrder}>
            <div className="form-group">
              <label htmlFor="addToOrderSelect">
                {t("addToOrder.selectOrder")} *
              </label>
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
                <option value="">{t("addToOrder.selectOrder")}</option>
                {editableOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.person_name} ({order.state})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="addToOrderQuantity">
                {t("addToOrder.quantity")} *
              </label>
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
              <label htmlFor="addToOrderUnit">{t("addToOrder.unit")} *</label>
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
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-primary">
                {t("products.addToOrder")}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
