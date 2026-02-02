import React, { useState } from 'react';
import { Globe, Menu, Plus, Trash2, Edit2, ExternalLink, FileText, ChevronRight, ChevronDown, Save, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface WebsiteNavigationProps {
  darkMode: boolean;
  onBack?: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  type: 'page' | 'external' | 'section';
  target: string;
  children?: MenuItem[];
  isExpanded?: boolean;
}

export const WebsiteNavigation: React.FC<WebsiteNavigationProps> = ({ darkMode, onBack }) => {
  const { currentClub } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([
    {
      id: '1',
      label: 'Home',
      type: 'page',
      target: 'home',
      isExpanded: false
    },
    {
      id: '2',
      label: 'About Us',
      type: 'page',
      target: 'about',
      isExpanded: true,
      children: [
        {
          id: '2-1',
          label: 'Our History',
          type: 'page',
          target: 'history'
        },
        {
          id: '2-2',
          label: 'Committee',
          type: 'page',
          target: 'committee'
        }
      ]
    },
    {
      id: '3',
      label: 'Events',
      type: 'page',
      target: 'events',
      isExpanded: false
    },
    {
      id: '4',
      label: 'Facebook',
      type: 'external',
      target: 'https://facebook.com'
    },
    {
      id: '5',
      label: 'Contact',
      type: 'page',
      target: 'contact',
      isExpanded: false
    }
  ]);
  
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState<Omit<MenuItem, 'id'>>({
    label: '',
    type: 'page',
    target: ''
  });
  const [parentId, setParentId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setMenuItems(items => 
      items.map(item => 
        item.id === id 
          ? { ...item, isExpanded: !item.isExpanded } 
          : item
      )
    );
  };

  const handleAddItem = () => {
    const newId = Date.now().toString();
    const newMenuItem: MenuItem = {
      id: newId,
      ...newItem
    };
    
    if (parentId) {
      // Add as child
      setMenuItems(items => 
        items.map(item => 
          item.id === parentId 
            ? { 
                ...item, 
                children: [...(item.children || []), newMenuItem],
                isExpanded: true
              } 
            : item
        )
      );
    } else {
      // Add at root level
      setMenuItems([...menuItems, newMenuItem]);
    }
    
    setShowAddModal(false);
    setNewItem({
      label: '',
      type: 'page',
      target: ''
    });
    setParentId(null);
  };

  const handleEditItem = (item: MenuItem) => {
    setEditingItem(item);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    
    setMenuItems(items => 
      updateItemInTree(items, editingItem)
    );
    
    setEditingItem(null);
  };

  const updateItemInTree = (items: MenuItem[], updatedItem: MenuItem): MenuItem[] => {
    return items.map(item => {
      if (item.id === updatedItem.id) {
        return updatedItem;
      }
      
      if (item.children) {
        return {
          ...item,
          children: updateItemInTree(item.children, updatedItem)
        };
      }
      
      return item;
    });
  };

  const handleDeleteItem = (id: string) => {
    // Recursive function to filter out the item with the given id
    const filterItems = (items: MenuItem[]): MenuItem[] => {
      return items
        .filter(item => item.id !== id)
        .map(item => {
          if (item.children) {
            return {
              ...item,
              children: filterItems(item.children)
            };
          }
          return item;
        });
    };
    
    setMenuItems(filterItems(menuItems));
  };

  const handleAddSubItem = (parentId: string) => {
    setParentId(parentId);
    setShowAddModal(true);
  };

  const renderMenuItems = (items: MenuItem[], level = 0) => {
    return items.map(item => (
      <React.Fragment key={item.id}>
        <div 
          className={`
            flex items-center gap-2 p-4 border-b
            ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            ${level > 0 ? 'pl-' + (level * 8 + 4) + 'px' : ''}
          `}
          style={{ paddingLeft: level > 0 ? `${level * 24 + 16}px` : undefined }}
        >
          <div className="flex-1 flex items-center gap-3">
            {item.children && item.children.length > 0 ? (
              <button
                onClick={() => toggleExpand(item.id)}
                className={`
                  p-1 rounded-lg transition-colors
                  ${darkMode 
                    ? 'hover:bg-slate-700 text-slate-400' 
                    : 'hover:bg-slate-200 text-slate-600'}
                `}
              >
                {item.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <div className="w-6"></div>
            )}
            
            <div className={`
              p-2 rounded-lg
              ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
            `}>
              {item.type === 'page' ? (
                <FileText size={16} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
              ) : item.type === 'external' ? (
                <ExternalLink size={16} className={darkMode ? 'text-green-400' : 'text-green-600'} />
              ) : (
                <Menu size={16} className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
              )}
            </div>
            
            <div>
              <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                {item.label}
              </p>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {item.type === 'external' ? (
                  <span className="flex items-center gap-1">
                    <ExternalLink size={12} />
                    {item.target}
                  </span>
                ) : (
                  <span>/{item.target}</span>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEditItem(item)}
              className={`
                p-2 rounded-lg transition-colors
                ${darkMode 
                  ? 'hover:bg-slate-700 text-slate-300' 
                  : 'hover:bg-slate-200 text-slate-600'}
              `}
              title="Edit"
            >
              <Edit2 size={16} />
            </button>
            
            <button
              onClick={() => handleAddSubItem(item.id)}
              className={`
                p-2 rounded-lg transition-colors
                ${darkMode 
                  ? 'hover:bg-slate-700 text-slate-300' 
                  : 'hover:bg-slate-200 text-slate-600'}
              `}
              title="Add Sub-item"
            >
              <Plus size={16} />
            </button>
            
            <button
              onClick={() => handleDeleteItem(item.id)}
              className={`
                p-2 rounded-lg transition-colors
                ${darkMode 
                  ? 'hover:bg-red-900/50 text-red-400' 
                  : 'hover:bg-red-100 text-red-600'}
              `}
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        
        {item.children && item.isExpanded && renderMenuItems(item.children, level + 1)}
      </React.Fragment>
    ));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <Globe className="text-blue-400" size={24} />
              <div>
                <h1 className="text-2xl font-bold text-white">Navigation Menu</h1>
                <p className="text-slate-400">
                  Manage your website's navigation structure
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setParentId(null);
                  setShowAddModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={18} />
                Add Menu Item
              </button>
              
              <button
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200"
              >
                <Save size={18} />
                Save Navigation
              </button>
            </div>
          </div>

          <div className={`
            rounded-xl border backdrop-blur-sm overflow-hidden
            ${darkMode 
              ? 'bg-slate-800/30 border-slate-700/50' 
              : 'bg-white/10 border-slate-200/20'}
          `}>
            <div className={`
              p-4 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <h2 className="text-lg font-semibold text-white">Main Navigation</h2>
              <p className="text-sm text-slate-400">
                Drag and drop items to reorder. Click the + button to add sub-items.
              </p>
            </div>

            <div>
              {menuItems.length === 0 ? (
                <div className="p-8 text-center">
                  <Menu size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
                  <p className="text-slate-400 mb-2">No menu items</p>
                  <p className="text-sm text-slate-500 mb-4">
                    Add your first menu item to get started
                  </p>
                  <button
                    onClick={() => {
                      setParentId(null);
                      setShowAddModal(true);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add Menu Item
                  </button>
                </div>
              ) : (
                <div>
                  {renderMenuItems(menuItems)}
                </div>
              )}
            </div>
          </div>
      </div>

      {/* Add Menu Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`
            w-full max-w-md rounded-xl shadow-xl overflow-hidden
            ${darkMode ? 'bg-slate-800' : 'bg-white'}
          `}>
            <div className={`
              flex items-center justify-between p-6 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                {parentId ? 'Add Sub-item' : 'Add Menu Item'}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className={`
                  rounded-full p-2 transition-colors
                  ${darkMode 
                    ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                `}
              >
                <Trash2 size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Menu Label
                </label>
                <input
                  type="text"
                  value={newItem.label}
                  onChange={(e) => setNewItem({...newItem, label: e.target.value})}
                  placeholder="e.g., About Us"
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode 
                      ? 'bg-slate-700 text-white border border-slate-600' 
                      : 'bg-white text-slate-800 border border-slate-200'}
                  `}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Link Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={newItem.type === 'page'}
                      onChange={() => setNewItem({...newItem, type: 'page'})}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>Page</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={newItem.type === 'external'}
                      onChange={() => setNewItem({...newItem, type: 'external'})}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>External Link</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={newItem.type === 'section'}
                      onChange={() => setNewItem({...newItem, type: 'section'})}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>Section</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {newItem.type === 'page' 
                    ? 'Select Page' 
                    : newItem.type === 'external' 
                      ? 'External URL' 
                      : 'Section ID'}
                </label>
                
                {newItem.type === 'page' ? (
                  <select
                    value={newItem.target}
                    onChange={(e) => setNewItem({...newItem, target: e.target.value})}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-white border border-slate-600' 
                        : 'bg-white text-slate-800 border border-slate-200'}
                    `}
                  >
                    <option value="">Select a page</option>
                    <option value="home">Home</option>
                    <option value="about">About Us</option>
                    <option value="contact">Contact</option>
                    <option value="events">Events</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newItem.target}
                    onChange={(e) => setNewItem({...newItem, target: e.target.value})}
                    placeholder={newItem.type === 'external' 
                      ? 'https://example.com' 
                      : 'section-id'}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-white border border-slate-600' 
                        : 'bg-white text-slate-800 border border-slate-200'}
                    `}
                  />
                )}
              </div>
            </div>

            <div className={`
              flex justify-end gap-3 p-6 border-t
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <button
                onClick={() => setShowAddModal(false)}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-colors
                  ${darkMode
                    ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                `}
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                disabled={!newItem.label || !newItem.target}
                className={`
                  px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
                  ${(!newItem.label || !newItem.target) ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Menu Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`
            w-full max-w-md rounded-xl shadow-xl overflow-hidden
            ${darkMode ? 'bg-slate-800' : 'bg-white'}
          `}>
            <div className={`
              flex items-center justify-between p-6 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Edit Menu Item
              </h2>
              <button
                onClick={() => setEditingItem(null)}
                className={`
                  rounded-full p-2 transition-colors
                  ${darkMode 
                    ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                `}
              >
                <Trash2 size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Menu Label
                </label>
                <input
                  type="text"
                  value={editingItem.label}
                  onChange={(e) => setEditingItem({...editingItem, label: e.target.value})}
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode 
                      ? 'bg-slate-700 text-white border border-slate-600' 
                      : 'bg-white text-slate-800 border border-slate-200'}
                  `}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Link Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={editingItem.type === 'page'}
                      onChange={() => setEditingItem({...editingItem, type: 'page'})}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>Page</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={editingItem.type === 'external'}
                      onChange={() => setEditingItem({...editingItem, type: 'external'})}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>External Link</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={editingItem.type === 'section'}
                      onChange={() => setEditingItem({...editingItem, type: 'section'})}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>Section</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {editingItem.type === 'page' 
                    ? 'Select Page' 
                    : editingItem.type === 'external' 
                      ? 'External URL' 
                      : 'Section ID'}
                </label>
                
                {editingItem.type === 'page' ? (
                  <select
                    value={editingItem.target}
                    onChange={(e) => setEditingItem({...editingItem, target: e.target.value})}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-white border border-slate-600' 
                        : 'bg-white text-slate-800 border border-slate-200'}
                    `}
                  >
                    <option value="">Select a page</option>
                    <option value="home">Home</option>
                    <option value="about">About Us</option>
                    <option value="contact">Contact</option>
                    <option value="events">Events</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editingItem.target}
                    onChange={(e) => setEditingItem({...editingItem, target: e.target.value})}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-white border border-slate-600' 
                        : 'bg-white text-slate-800 border border-slate-200'}
                    `}
                  />
                )}
              </div>
            </div>

            <div className={`
              flex justify-end gap-3 p-6 border-t
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <button
                onClick={() => setEditingItem(null)}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-colors
                  ${darkMode
                    ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                `}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editingItem.label || !editingItem.target}
                className={`
                  px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
                  ${(!editingItem.label || !editingItem.target) ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebsiteNavigation;