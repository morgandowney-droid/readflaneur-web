'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Section } from '@/types';

interface SectionWithCount extends Section {
  article_count: number;
}

export default function AdminSectionsPage() {
  const router = useRouter();
  const [sections, setSections] = useState<SectionWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Section>>({});
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSection, setNewSection] = useState({
    name: '',
    slug: '',
    description: '',
    icon: '',
    display_order: 0,
  });

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    const supabase = createClient();

    // Check if user is admin
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin') {
      router.push('/');
      return;
    }

    // Fetch sections with article counts
    const { data: sectionsData } = await supabase
      .from('sections')
      .select('*')
      .order('display_order', { ascending: true });

    if (sectionsData) {
      // Get article counts for each section
      const sectionsWithCounts = await Promise.all(
        sectionsData.map(async (section) => {
          const { count } = await supabase
            .from('article_sections')
            .select('*', { count: 'exact', head: true })
            .eq('section_id', section.id);

          return {
            ...section,
            article_count: count || 0,
          };
        })
      );

      setSections(sectionsWithCounts);
    }

    setLoading(false);
  };

  const startEditing = (section: SectionWithCount) => {
    setEditingId(section.id);
    setEditForm({
      name: section.name,
      slug: section.slug,
      description: section.description || '',
      icon: section.icon || '',
      display_order: section.display_order,
      is_active: section.is_active,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveSection = async () => {
    if (!editingId) return;

    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('sections')
      .update({
        name: editForm.name,
        slug: editForm.slug,
        description: editForm.description || null,
        icon: editForm.icon || null,
        display_order: editForm.display_order,
        is_active: editForm.is_active,
      })
      .eq('id', editingId);

    if (!error) {
      await fetchSections();
      setEditingId(null);
      setEditForm({});
    }

    setSaving(false);
  };

  const addSection = async () => {
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('sections')
      .insert({
        name: newSection.name,
        slug: newSection.slug,
        description: newSection.description || null,
        icon: newSection.icon || null,
        display_order: newSection.display_order,
        is_active: true,
      });

    if (!error) {
      await fetchSections();
      setShowAddForm(false);
      setNewSection({
        name: '',
        slug: '',
        description: '',
        icon: '',
        display_order: 0,
      });
    }

    setSaving(false);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-neutral-100 rounded w-48"></div>
            <div className="h-64 bg-neutral-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-light">Manage Sections</h1>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-black text-white text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            Add Section
          </button>
        </div>

        {/* Add Section Form */}
        {showAddForm && (
          <div className="mb-8 p-6 border border-neutral-200 bg-neutral-50">
            <h2 className="text-sm tracking-widest uppercase text-neutral-400 mb-4">
              New Section
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Name</label>
                <input
                  type="text"
                  value={newSection.name}
                  onChange={(e) => {
                    setNewSection({
                      ...newSection,
                      name: e.target.value,
                      slug: generateSlug(e.target.value),
                    });
                  }}
                  className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                  placeholder="Section name"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Slug</label>
                <input
                  type="text"
                  value={newSection.slug}
                  onChange={(e) => setNewSection({ ...newSection, slug: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                  placeholder="section-slug"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Icon (emoji)</label>
                <input
                  type="text"
                  value={newSection.icon}
                  onChange={(e) => setNewSection({ ...newSection, icon: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                  placeholder="e.g. 🎨"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Display Order</label>
                <input
                  type="number"
                  value={newSection.display_order}
                  onChange={(e) => setNewSection({ ...newSection, display_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-neutral-500 mb-1">Description</label>
                <input
                  type="text"
                  value={newSection.description}
                  onChange={(e) => setNewSection({ ...newSection, description: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                  placeholder="Brief description of this section"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={addSection}
                disabled={saving || !newSection.name || !newSection.slug}
                className="px-4 py-2 bg-black text-white text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add Section'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-neutral-200 text-xs tracking-widest uppercase hover:border-neutral-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sections List */}
        <div className="border border-neutral-200">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-xs tracking-widest uppercase text-neutral-400">
            <div>Order</div>
            <div>Section</div>
            <div>Slug</div>
            <div>Articles</div>
            <div>Status</div>
            <div>Actions</div>
          </div>

          {sections.map((section) => (
            <div
              key={section.id}
              className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-4 border-b border-neutral-100 last:border-b-0 items-center"
            >
              {editingId === section.id ? (
                <>
                  <input
                    type="number"
                    value={editForm.display_order}
                    onChange={(e) => setEditForm({ ...editForm, display_order: parseInt(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editForm.icon || ''}
                      onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                      className="w-12 px-2 py-1 border border-neutral-200 focus:border-black focus:outline-none text-sm text-center"
                      placeholder="Icon"
                    />
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="flex-1 px-2 py-1 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    value={editForm.slug}
                    onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                    className="w-32 px-2 py-1 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                  />
                  <span className="text-sm text-neutral-500">{section.article_count}</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.is_active}
                      onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-xs">Active</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={saveSection}
                      disabled={saving}
                      className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="text-xs text-neutral-500 hover:text-black"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm text-neutral-400 w-16">{section.display_order}</span>
                  <div className="flex items-center gap-2">
                    {section.icon && <span className="text-lg">{section.icon}</span>}
                    <span className="font-medium">{section.name}</span>
                  </div>
                  <span className="text-sm text-neutral-500">{section.slug}</span>
                  <span className="text-sm text-neutral-500">{section.article_count}</span>
                  <span className={`text-xs ${section.is_active ? 'text-green-600' : 'text-neutral-400'}`}>
                    {section.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => startEditing(section)}
                    className="text-xs text-neutral-500 hover:text-black"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 text-xs text-neutral-400">
          <p>
            Sections are used to categorize articles and enable topic-based filtering.
            The AI automatically assigns sections when generating articles.
          </p>
        </div>
      </div>
    </div>
  );
}
