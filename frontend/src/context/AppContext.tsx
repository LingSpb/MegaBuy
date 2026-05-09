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

export interface DiscountProduct {
  id: number;
  product_id: string;
  product_name: string;
  original_price: number;
  discount_price: number;
  package_quantity: number;
  unit_label: string;
  note: string | null;
  created_at: string;
}

interface AppContextValue {
  categories: Category[];
  products: ProductWithMetadata[];
  orders: Order[];
  shoppingList: string[];
  discountProducts: DiscountProduct[];
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
  updateOrderItem: (
    orderId: string,
    productId: string,
    quantity: number,
    unit?: string,
  ) => Promise<void>;
  bulkUpdateOrderItems: (
    edits: Array<{
      orderId: string;
      productId: string;
      quantity: number;
      unit: string;
    }>,
  ) => Promise<{
    successCount: number;
    failCount: number;
    results: Array<{
      orderId: string;
      productId: string;
      success: boolean;
      error?: string;
    }>;
  }>;
  getCategoryVat: (categoryId: string) => number;
  calculatePriceWithVat: (price: number, vatPercent: number) => number;
  fetchShoppingList: () => Promise<void>;
  addToShoppingList: (
    productId: string,
    addedBy?: string,
    note?: string,
  ) => Promise<void>;
  removeFromShoppingList: (productId: string) => Promise<void>;
  clearShoppingList: () => Promise<void>;
  isInShoppingList: (productId: string) => boolean;
  fetchDiscountProducts: () => Promise<void>;
  addDiscountProduct: (
    productId: string,
    discountPrice: number,
    note?: string,
  ) => Promise<void>;
  removeDiscountProduct: (productId: string) => Promise<void>;
  clearDiscountProducts: () => Promise<void>;
  getDiscountPrice: (productId: string) => number | null;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductWithMetadata[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [shoppingList, setShoppingList] = useState<string[]>([]);
  const [discountProducts, setDiscountProducts] = useState<DiscountProduct[]>(
    [],
  );
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

  // Update a single order item quantity
  const updateOrderItem = useCallback(
    async (
      orderId: string,
      productId: string,
      quantity: number,
      unit?: string,
    ) => {
      console.log("updateOrderItem API call:", {
        orderId,
        productId,
        quantity,
        unit,
      });
      const res = await fetch(`/api/orders/${orderId}/items/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, unit }),
      });
      console.log("updateOrderItem response status:", res.status);
      if (!res.ok) {
        const data = await res.json();
        console.error("updateOrderItem error response:", data);
        throw new Error(data.error || "Failed to update order item");
      }
      await fetchOrders();
    },
    [fetchOrders],
  );

  const bulkUpdateOrderItems = useCallback(
    async (
      edits: Array<{
        orderId: string;
        productId: string;
        quantity: number;
        unit: string;
      }>,
    ): Promise<{
      successCount: number;
      failCount: number;
      results: Array<{
        orderId: string;
        productId: string;
        success: boolean;
        error?: string;
      }>;
    }> => {
      console.log("bulkUpdateOrderItems API call:", edits.length, "edits");
      const res = await fetch("/api/admin/bulk-update-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits }),
      });
      console.log("bulkUpdateOrderItems response status:", res.status);
      const data = await res.json();
      if (!res.ok) {
        console.error("bulkUpdateOrderItems error response:", data);
        throw new Error(data.error || "Failed to bulk update order items");
      }
      await fetchOrders();
      return data;
    },
    [fetchOrders],
  );

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

  // Favorite list (stores product IDs)
  const fetchShoppingList = useCallback(async () => {
    try {
      const res = await fetch("/api/favorite-list");
      if (!res.ok) throw new Error("Failed to load favorite list");
      const data = await res.json();
      // Extract product IDs from response
      setShoppingList(
        data.map((item: { product_id: string }) => item.product_id),
      );
    } catch (error) {
      showToast(
        "Error loading favorite list: " + (error as Error).message,
        "error",
      );
    }
  }, [showToast]);

  const addToShoppingList = useCallback(
    async (productId: string, addedBy?: string, note?: string) => {
      try {
        const res = await fetch("/api/favorite-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            added_by: addedBy,
            note,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to add to favorite list");
        }
        setShoppingList((prev) => [productId, ...prev]);
        showToast("Added to favorite list");
      } catch (error) {
        showToast((error as Error).message, "error");
      }
    },
    [showToast],
  );

  const removeFromShoppingList = useCallback(
    async (productId: string) => {
      try {
        const res = await fetch(`/api/favorite-list/${productId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove from favorite list");
        setShoppingList((prev) => prev.filter((id) => id !== productId));
        showToast("Removed from favorite list");
      } catch (error) {
        showToast((error as Error).message, "error");
      }
    },
    [showToast],
  );

  const clearShoppingList = useCallback(async () => {
    try {
      const res = await fetch("/api/favorite-list", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear favorite list");
      setShoppingList([]);
      showToast("Favorite list cleared");
    } catch (error) {
      showToast((error as Error).message, "error");
    }
  }, [showToast]);

  const isInShoppingList = useCallback(
    (productId: string): boolean => {
      return shoppingList.includes(productId);
    },
    [shoppingList],
  );

  // Discount Products
  const fetchDiscountProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/discount-products");
      if (!res.ok) throw new Error("Failed to load discount products");
      const data = await res.json();
      setDiscountProducts(data);
    } catch (error) {
      showToast(
        "Error loading discount products: " + (error as Error).message,
        "error",
      );
    }
  }, [showToast]);

  const addDiscountProduct = useCallback(
    async (productId: string, discountPrice: number, note?: string) => {
      try {
        const res = await fetch("/api/discount-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            discount_price: discountPrice,
            note,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to add discount");
        }
        await fetchDiscountProducts();
        showToast("Discount added");
      } catch (error) {
        showToast((error as Error).message, "error");
      }
    },
    [fetchDiscountProducts, showToast],
  );

  const removeDiscountProduct = useCallback(
    async (productId: string) => {
      try {
        const res = await fetch(`/api/discount-products/${productId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove discount");
        setDiscountProducts((prev) =>
          prev.filter((d) => d.product_id !== productId),
        );
        showToast("Discount removed");
      } catch (error) {
        showToast((error as Error).message, "error");
      }
    },
    [showToast],
  );

  const clearDiscountProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/discount-products", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear discounts");
      setDiscountProducts([]);
      showToast("Discounts cleared");
    } catch (error) {
      showToast((error as Error).message, "error");
    }
  }, [showToast]);

  const getDiscountPrice = useCallback(
    (productId: string): number | null => {
      const discount = discountProducts.find((d) => d.product_id === productId);
      return discount ? discount.discount_price : null;
    },
    [discountProducts],
  );

  // Load initial data
  useEffect(() => {
    fetchCategories();
    fetchProducts();
    fetchOrders();
    fetchShoppingList();
    fetchDiscountProducts();
  }, [
    fetchCategories,
    fetchProducts,
    fetchOrders,
    fetchShoppingList,
    fetchDiscountProducts,
  ]);

  const value: AppContextValue = {
    categories,
    products,
    orders,
    shoppingList,
    discountProducts,
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
    updateOrderItem,
    bulkUpdateOrderItems,
    getCategoryVat,
    calculatePriceWithVat,
    fetchShoppingList,
    addToShoppingList,
    removeFromShoppingList,
    clearShoppingList,
    isInShoppingList,
    fetchDiscountProducts,
    addDiscountProduct,
    removeDiscountProduct,
    clearDiscountProducts,
    getDiscountPrice,
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
