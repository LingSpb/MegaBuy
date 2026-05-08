import { useState, useCallback } from "react";
import { AppProvider } from "./context/AppContext";
import Toast from "./components/Toast";
import Categories from "./components/Categories";
import Products from "./components/Products";
import Orders from "./components/Orders";
import "./App.css";

type TabName = "orders" | "categories" | "products";

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabName>("orders");
  const [categoryFilter, setCategoryFilter] = useState("");

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
        <h1>MegaBuy</h1>
        <div className="nav-links">
          <button
            className={`nav-btn ${activeTab === "orders" ? "active" : ""}`}
            onClick={() => handleTabChange("orders")}
          >
            Orders
          </button>
          <button
            className={`nav-btn ${activeTab === "categories" ? "active" : ""}`}
            onClick={() => handleTabChange("categories")}
          >
            Categories
          </button>
          <button
            className={`nav-btn ${activeTab === "products" ? "active" : ""}`}
            onClick={() => handleTabChange("products")}
          >
            Products
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

      <Toast />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
