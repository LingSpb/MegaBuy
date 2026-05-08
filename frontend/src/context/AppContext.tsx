import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import type {
  Category,
  ProductWithMetadata,
  Order,
  CategoryFormData,
  ProductFormData,
  OrderFormData,
  LoadingState,
  ToastState,
} from "../types";

interface AppContextValue {
  categories: Category[];
  products: ProductWithMetadata[];
  orders: Order[];
  loading: LoadingState;
  toast: ToastState;
  showToast: (message: string, type?: "success" | "error") => void;
  fetchCategories: () => Promise<void>;
  saveCategory: (
    category: CategoryFormData,
    id?: string | null,
  ) => Promise<Category>;
  deleteCategory: (id: string) => Promise<void>;
  fetchProducts: () => Promise<void>;
  saveProduct: (
    product: ProductFormData,
    id?: string | null,
  ) => Promise<ProductWithMetadata>;
  deleteProduct: (id: string) => Promise<void>;
  fetchOrders: () => Promise<void>;
  saveOrder: (order: OrderFormData, id?: string | null) => Promise<Order>;
  deleteOrder: (id: string, secretPhrase?: string) => Promise<void>;
  createMegaBuyOrder: (
    personName: string,
    orderDate: string,
    sourceOrderIds: string[],
  ) => Promise<Order>;
  recalculateMegaBuyOrder: (id: string) => Promise<Order>;
  placeMegaBuyOrder: (id: string) => Promise<Order>;
  deliverMegaBuyOrder: (id: string) => Promise<Order>;
  closeMegaBuyOrder: (id: string) => Promise<Order>;
  getCategoryVat: (categoryId: string) => number;
  calculatePriceWithVat: (price: number, vatPercent: number) => number;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductWithMetadata[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<LoadingState>({
    categories: false,
    products: false,
    orders: false,
  });
  const [toast, setToast] = useState<ToastState>({
    message: "",
    type: "success",
    show: false,
  });

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ message, type, show: true });
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
    },
    [],
  );

  // Categories
  const fetchCategories = useCallback(async () => {
    setLoading((prev) => ({ ...prev, categories: true }));
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      const data = await res.json();
      setCategories(data);
    } catch (error) {
      showToast(
        "Error loading categories: " + (error as Error).message,
        "error",
      );
    } finally {
      setLoading((prev) => ({ ...prev, categories: false }));
    }
  }, [showToast]);

  const saveCategory = useCallback(
    async (category: CategoryFormData, id: string | null = null) => {
      const url = id ? `/api/categories/${id}` : "/api/categories";
      const method = id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save category");
      await fetchCategories();
      return data;
    },
    [fetchCategories],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete category");
      await fetchCategories();
      return data;
    },
    [fetchCategories],
  );

  // Products
  const fetchProducts = useCallback(async () => {
    setLoading((prev) => ({ ...prev, products: true }));
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(data);
    } catch (error) {
      showToast("Error loading products: " + (error as Error).message, "error");
    } finally {
      setLoading((prev) => ({ ...prev, products: false }));
    }
  }, [showToast]);

  const saveProduct = useCallback(
    async (product: ProductFormData, id: string | null = null) => {
      const url = id ? `/api/products/${id}` : "/api/products";
      const method = id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save product");
      await fetchProducts();
      return data;
    },
    [fetchProducts],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete product");
      await fetchProducts();
      return data;
    },
    [fetchProducts],
  );

  // Orders
  const fetchOrders = useCallback(async () => {
    setLoading((prev) => ({ ...prev, orders: true }));
    try {
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      setOrders(data);
    } catch (error) {
      showToast("Error loading orders: " + (error as Error).message, "error");
    } finally {
      setLoading((prev) => ({ ...prev, orders: false }));
    }
  }, [showToast]);

  const saveOrder = useCallback(
    async (order: OrderFormData, id: string | null = null) => {
      const url = id ? `/api/orders/${id}` : "/api/orders";
      const method = id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save order");
      await fetchOrders();
      return data;
    },
    [fetchOrders],
  );

  const deleteOrder = useCallback(
    async (id: string, secretPhrase?: string) => {
      const res = await fetch(`/api/orders/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret_phrase: secretPhrase }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete order");
      await fetchOrders();
      return data;
    },
    [fetchOrders],
  );

  const createMegaBuyOrder = useCallback(
    async (personName: string, orderDate: string, sourceOrderIds: string[]) => {
      const res = await fetch("/api/orders/mega-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_name: personName,
          order_date: orderDate,
          source_order_ids: sourceOrderIds,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to create Mega Buy order");
      await fetchOrders();
      return data;
    },
    [fetchOrders],
  );

  const recalculateMegaBuyOrder = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/orders/${id}/recalculate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to recalculate order");
      await fetchOrders();
      return data;
    },
    [fetchOrders],
  );

  const placeMegaBuyOrder = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/orders/${id}/place`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to place order");
      await fetchOrders();
      return data;
    },
    [fetchOrders],
  );

  const deliverMegaBuyOrder = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/orders/${id}/deliver`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to deliver order");
      await fetchOrders();
      return data;
    },
    [fetchOrders],
  );

  const closeMegaBuyOrder = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/orders/${id}/close`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to close order");
      await fetchOrders();
      return data;
    },
    [fetchOrders],
  );

  // Load initial data
  useEffect(() => {
    fetchCategories();
    fetchProducts();
    fetchOrders();
  }, [fetchCategories, fetchProducts, fetchOrders]);

  // Helper functions
  const getCategoryVat = useCallback(
    (categoryId: string): number => {
      const category = categories.find((c) => c.id === categoryId);
      return category && category.vat != null ? category.vat : 6;
    },
    [categories],
  );

  const calculatePriceWithVat = useCallback(
    (price: number, vatPercent: number): number => {
      return Number((price * (1 + vatPercent / 100)).toFixed(2));
    },
    [],
  );

  const value: AppContextValue = {
    categories,
    products,
    orders,
    loading,
    toast,
    showToast,
    fetchCategories,
    saveCategory,
    deleteCategory,
    fetchProducts,
    saveProduct,
    deleteProduct,
    fetchOrders,
    saveOrder,
    deleteOrder,
    createMegaBuyOrder,
    recalculateMegaBuyOrder,
    placeMegaBuyOrder,
    deliverMegaBuyOrder,
    closeMegaBuyOrder,
    getCategoryVat,
    calculatePriceWithVat,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
