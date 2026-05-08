import { useState, useMemo, FormEvent } from "react";
import { useApp } from "../context/AppContext";
import Modal from "./Modal";
import { removeVietnameseTones } from "../utils/helpers";
import type { Category, CategoryFormData } from "../types";

interface CategoriesProps {
  onNavigateToProducts: (categoryId: string) => void;
}

export default function Categories({ onNavigateToProducts }: CategoriesProps) {
  const { categories, saveCategory, deleteCategory, showToast } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormData>({
    name: "",
    description: "",
    vat: 6,
  });

  const filteredCategories = useMemo(() => {
    if (!searchTerm) return categories;
    const term = removeVietnameseTones(searchTerm.toLowerCase());
    return categories.filter(
      (cat) =>
        removeVietnameseTones(cat.name.toLowerCase()).includes(term) ||
        removeVietnameseTones((cat.description || "").toLowerCase()).includes(
          term,
        ),
    );
  }, [categories, searchTerm]);

  const openModal = (category: Category | null = null) => {
    if (category) {
      setEditingId(category.id);
      setForm({
        name: category.name,
        description: category.description || "",
        vat: category.vat != null ? category.vat : 6,
      });
    } else {
      setEditingId(null);
      setForm({ name: "", description: "", vat: 6 });
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm({ name: "", description: "", vat: 6 });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await saveCategory(
        {
          name: form.name,
          description: form.description,
          vat: form.vat !== "" ? Number(form.vat) : 6,
        },
        editingId,
      );
      showToast(
        editingId
          ? "Category updated successfully!"
          : "Category created successfully!",
      );
      closeModal();
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this category?")) return;
    try {
      await deleteCategory(id);
      showToast("Category deleted successfully!");
    } catch (error) {
      showToast("Error: " + (error as Error).message, "error");
    }
  };

  return (
    <div className="tab active">
      <div className="tab-header">
        <h2>Product Categories</h2>
        <button className="btn btn-primary" onClick={() => openModal()}>
          + Add Category
        </button>
      </div>

      <div className="tab-description">
        Manage product categories for organizing your inventory. Create, edit,
        and delete categories to keep your catalog organized.
      </div>

      <div className="search-box">
        <input
          type="text"
          placeholder="Search categories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="list-container">
        {filteredCategories.length === 0 ? (
          <div className="empty-message">
            {searchTerm
              ? "No categories found"
              : "No categories yet. Create one to get started!"}
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div
              key={category.id}
              className="card card-clickable"
              onClick={() => onNavigateToProducts(category.id)}
            >
              <div className="card-content">
                <h3>{category.name}</h3>
                <p>{category.description || "No description"}</p>
                <p className="vat-info">
                  VAT: {category.vat != null ? category.vat : 6}%
                </p>
              </div>
              <div
                className="card-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="btn btn-edit"
                  onClick={() => openModal(category)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(category.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit Category" : "Add New Category"}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="categoryName">Category Name *</label>
            <input
              type="text"
              id="categoryName"
              placeholder="e.g., Staples, Beverages"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="categoryDescription">Description</label>
            <textarea
              id="categoryDescription"
              placeholder="Enter category description"
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="categoryVat">VAT (%)</label>
            <input
              type="number"
              id="categoryVat"
              placeholder="e.g., 6"
              step="0.01"
              min="0"
              max="100"
              value={form.vat}
              onChange={(e) => setForm({ ...form, vat: e.target.value })}
            />
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeModal}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Category
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
