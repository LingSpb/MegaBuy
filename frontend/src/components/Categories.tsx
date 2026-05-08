import { useState, useMemo, FormEvent } from "react";
import { useApp } from "../context/AppContext";
import { useI18n } from "../i18n";
import Modal from "./Modal";
import { removeVietnameseTones } from "../utils/helpers";
import type { Category, CategoryFormData } from "../types";

interface CategoriesProps {
  onNavigateToProducts: (categoryId: string) => void;
}

export default function Categories({ onNavigateToProducts }: CategoriesProps) {
  const { categories, saveCategory, deleteCategory, showToast } = useApp();
  const { t } = useI18n();
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
          ? t("categories.categoryUpdated")
          : t("categories.categoryCreated"),
      );
      closeModal();
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("categories.deleteConfirm"))) return;
    try {
      await deleteCategory(id);
      showToast(t("categories.categoryDeleted"));
    } catch (error) {
      showToast(t("toast.error") + ": " + (error as Error).message, "error");
    }
  };

  return (
    <div className="tab active">
      <div className="tab-header">
        <h2>{t("categories.title")}</h2>
        <button className="btn btn-primary" onClick={() => openModal()}>
          + {t("categories.newCategory")}
        </button>
      </div>

      <div className="tab-description">{t("categories.pageDescription")}</div>

      <div className="search-box">
        <input
          type="text"
          placeholder={t("common.searchCategories")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="list-container">
        {filteredCategories.length === 0 ? (
          <div className="empty-message">
            {searchTerm
              ? t("categories.noCategoriesFound")
              : t("categories.noCategoriesYet")}
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
                <p>{category.description || t("common.noDescription")}</p>
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
                  {t("common.edit")}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(category.id)}
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={
          editingId ? t("categories.editCategory") : t("categories.newCategory")
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="categoryName">
              {t("categories.categoryName")} *
            </label>
            <input
              type="text"
              id="categoryName"
              placeholder={t("categories.placeholder.name")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="categoryDescription">
              {t("categories.description")}
            </label>
            <textarea
              id="categoryDescription"
              placeholder={t("categories.placeholder.description")}
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="categoryVat">{t("categories.vat")}</label>
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
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
