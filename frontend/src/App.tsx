import { useState, useCallback } from "react";
import { AppProvider } from "./context/AppContext";
import { I18nProvider, useI18n } from "./i18n";
import Toast from "./components/Toast";
import Categories from "./components/Categories";
import Products from "./components/Products";
import Orders from "./components/Orders";
import FavoriteList from "./components/FavoriteList";
import "./App.css";

type TabName = "orders" | "categories" | "products" | "shopping-list";

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabName>("orders");
  const [categoryFilter, setCategoryFilter] = useState("");
  const { t, language, setLanguage } = useI18n();

  const handleNavigateToProducts = useCallback((categoryId: string) => {
    setCategoryFilter(categoryId);
    setActiveTab("products");
  }, []);

  const handleTabChange = (tab: TabName) => {
    setActiveTab(tab);
    if (tab !== "products") {
      setCategoryFilter("");
    }
  };

  return (
    <div className="container">
      <nav className="navbar">
        <h1>{t("app.title")}</h1>
        <div className="nav-links">
          <button
            className={`nav-btn ${activeTab === "orders" ? "active" : ""}`}
            onClick={() => handleTabChange("orders")}
          >
            {t("nav.orders")}
          </button>
          <button
            className={`nav-btn ${activeTab === "shopping-list" ? "active" : ""}`}
            onClick={() => handleTabChange("shopping-list")}
          >
            {t("nav.shoppingList")}
          </button>
          <button
            className={`nav-btn ${activeTab === "products" ? "active" : ""}`}
            onClick={() => handleTabChange("products")}
          >
            {t("nav.products")}
          </button>
          <button
            className={`nav-btn ${activeTab === "categories" ? "active" : ""}`}
            onClick={() => handleTabChange("categories")}
          >
            {t("nav.categories")}
          </button>
        </div>
        <div className="language-switcher">
          <button
            className={`lang-btn ${language === "vi" ? "active" : ""}`}
            onClick={() => setLanguage("vi")}
          >
            VI
          </button>
          <button
            className={`lang-btn ${language === "en" ? "active" : ""}`}
            onClick={() => setLanguage("en")}
          >
            EN
          </button>
        </div>
      </nav>

      {activeTab === "orders" && <Orders />}
      {activeTab === "categories" && (
        <Categories onNavigateToProducts={handleNavigateToProducts} />
      )}
      {activeTab === "products" && (
        <Products
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
        />
      )}
      {activeTab === "shopping-list" && <FavoriteList />}

      <Toast />
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </I18nProvider>
  );
}

export default App;
