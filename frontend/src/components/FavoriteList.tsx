import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { useI18n } from "../i18n";
import { removeVietnameseTones } from "../utils/helpers";
import type { ProductWithMetadata } from "../types";

export default function FavoriteList() {
  const {
    favoriteList,
    products,
    categories,
    removeFromFavoriteList,
    clearFavoriteList,
  } = useApp();
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");

  // Get products that are in the favorite list
  const favoriteListProducts = useMemo(() => {
    return favoriteList
      .map((productId) => products.find((p) => p.id === productId))
      .filter((p): p is ProductWithMetadata => p !== undefined);
  }, [favoriteList, products]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return favoriteListProducts;
    const term = removeVietnameseTones(searchTerm.toLowerCase());
    return favoriteListProducts.filter((product) => {
      const category = categories.find((c) => c.id === product.category_id);
      const categoryName = category?.name || "";
      return (
        product.id.toLowerCase().includes(term) ||
        removeVietnameseTones(product.name.toLowerCase()).includes(term) ||
        removeVietnameseTones(categoryName.toLowerCase()).includes(term)
      );
    });
  }, [favoriteListProducts, categories, searchTerm]);

  const handleClearAll = async () => {
    if (
      favoriteList.length > 0 &&
      window.confirm(t("favoriteList.clearConfirm"))
    ) {
      await clearFavoriteList();
    }
  };

  return (
    <main className="content">
      <div className="page-header">
        <h2>{t("favoriteList.title")}</h2>
        <p className="page-subtitle">{t("favoriteList.subtitle")}</p>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder={t("common.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {favoriteList.length > 0 && (
          <button className="btn btn-danger" onClick={handleClearAll}>
            {t("common.clearAll")}
          </button>
        )}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="empty-state">
          <p>{searchTerm ? t("common.noResults") : t("favoriteList.empty")}</p>
        </div>
      ) : (
        <div className="cards-grid">
          {filteredProducts.map((product) => {
            const category = categories.find(
              (c) => c.id === product.category_id,
            );
            const categoryName =
              category?.name || product.category_id || t("common.noCategory");

            return (
              <div key={product.id} className="card">
                <div className="card-content">
                  <h3>
                    {product.id} - {product.name}
                  </h3>
                  <p className="card-meta">
                    {categoryName} • {product.price} kr/
                    {product.unit_label || t("orders.unit")}
                    {product.selling_type === "package" &&
                      ` • ${product.package_quantity} ${t("common.perCarton")}`}
                  </p>
                </div>
                <div className="card-actions">
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeFromFavoriteList(product.id)}
                  >
                    {t("common.remove")}
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
