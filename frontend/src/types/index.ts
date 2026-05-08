// Category types
export interface Category {
  id: string;
  name: string;
  description?: string;
  vat?: number;
  created_at?: string;
}

// Product types - raw product data (5 core fields, id is the product code)
export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  package_quantity: number;
}

// Extended product with metadata (for API responses)
export interface ProductWithMetadata extends Product {
  category_id: string;
  description?: string;
  selling_type: "unit" | "package";
  unit_label?: string;
  unit_price?: number;
  package_unit?: string;
  units?: string[];
  created_at?: string;
}

// Order item types
export interface OrderItem {
  product_id: string;
  product_name?: string;
  quantity: number;
  unit: string;
  unit_price?: number | null;
  line_total?: number | null;
}

// Order types
export interface Order {
  id: string;
  person_name: string;
  order_date: string;
  state: "Draft" | "Locked" | "Delivered" | "Closed";
  order_type?: "mega_buy" | null;
  child_order_ids?: string[];
  source_order_ids?: string[];
  immutable_items?: boolean;
  total_amount?: number;
  locked_by_mega_order_id?: string | null;
  locked_at?: string | null;
  placed_at?: string | null;
  delivered_at?: string | null;
  has_secret_phrase?: boolean;
  items: OrderItem[];
  created_at?: string;
  updated_at?: string;
}

// Form types
export interface CategoryFormData {
  name: string;
  description: string;
  vat: number | string;
}

export interface ProductFormData {
  name: string;
  category_id: string;
  description: string;
  selling_type: "unit" | "package";
  unit_label: string;
  price: number | string;
  package_quantity: number | string;
}

export interface OrderFormData {
  person_name: string;
  order_date: string;
  secret_phrase?: string;
  items: OrderItemFormData[];
}

export interface OrderItemFormData {
  product_id: string;
  quantity: number | string;
  unit: string;
}

// Toast types
export interface ToastState {
  message: string;
  type: "success" | "error";
  show: boolean;
}

// Loading state
export interface LoadingState {
  categories: boolean;
  products: boolean;
  orders: boolean;
}

// Product details modal data
export interface ProductDetailsData {
  productInfoText: string;
  totalSum: string;
  productPrice: number;
  unitPrice: number;
  packageQuantity: number;
  breakdown: Array<{
    personName: string;
    orderId: string;
    itemsSummary: string;
  }>;
  productId: string;
}
