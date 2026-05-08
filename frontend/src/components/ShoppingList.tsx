import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { removeVietnameseTones } from "../utils/helpers";
import type { ProductWithMetadata } from "../types";

export default function ShoppingList() {
  const {
    shoppingList,
    products,
    categories,
    removeFromShoppingList,
    clearShoppingList,
  } = useApp();
  const [searchTerm, setSearchTerm] = useState("");

  // Get products that are in the shopping list
  const shoppingListProducts = useMemo(() => {
    return shoppingList
      .map((productId) => products.find((p) => p.id === productId))
      .filter((p): p is ProductWithMetadata => p !== undefined);
  }, [shoppingList, products]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return shoppingListProducts;
    const term = removeVietnameseTones(searchTerm.toLowerCase());
    return shoppingListProducts.filter((product) => {
      const category = categories.find((c) => c.id === product.category_id);
      const categoryName = category?.name || "";
      return (
        product.id.toLowerCase().includes(term) ||
        removeVietnameseTones(product.name.toLowerCase()).includes(term) ||
        removeVietnameseTones(categoryName.toLowerCase()).includes(term)
      );
    });
  }, [shoppingListProducts, categories, searchTerm]);

  const handleClearAll = async () => {
    if (
      shoppingList.length > 0 &&
      window.confirm("Are you sure you want to clear the entire shopping list?")
    ) {
      await clearShoppingList();
    }
  };

  return (
    <main className="content">
      <div className="page-header">
        <h2>Shopping List</h2>
        <p className="page-subtitle">
          Products people want to buy in the current mega buy order
        </p>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search shopping list..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {shoppingList.length > 0 && (
          <button className="btn btn-danger" onClick={handleClearAll}>
            Clear All
          </button>
        )}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="empty-state">
          <p>
            {searchTerm
              ? "No items match your search"
              : "Shopping list is empty. Add products from the Products tab."}
          </p>
        </div>
      ) : (
        <div className="cards-grid">
          {filteredProducts.map((product) => {
            const category = categories.find(
              (c) => c.id === product.category_id,
            );

            return (
              <div key={product.id} className="card">
                <div className="card-content">
                  <h3>
                    {product.id} - {product.name}
                  </h3>
                  <p className="card-meta">
                    {category?.name || "No category"} • {product.price} kr/
                    {product.unit_label || "unit"}
                    {product.selling_type === "package" &&
                      ` • ${product.package_quantity} per carton`}
                  </p>
                </div>
                <div className="card-actions">
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeFromShoppingList(product.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
