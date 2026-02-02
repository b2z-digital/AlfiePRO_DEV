import React, { useState } from 'react';
import { Globe, Plus, Trash2, MoveUp, MoveDown, Settings, Eye, Save, X, MapPin, Edit, Layout, Image, Columns as Columns2, Columns as Columns3, LayoutGrid, ExternalLink, ChevronRight, FileText, Calendar, Camera, Trophy, Users, MousePointer, Code as CodeIcon, ArrowLeft } from 'lucide-react';
import SectionSettingsPanel from './WebsitePageEditor/SectionSettingsPanel';
import BlockSettingsPanel from './WebsitePageEditor/BlockSettingsPanel';
import TextBlockEditor from './WebsitePageEditor/BlockEditors/TextBlockEditor';
import ImageBlockEditor from './WebsitePageEditor/BlockEditors/ImageBlockEditor';
import EventsBlockEditor from './WebsitePageEditor/BlockEditors/EventsBlockEditor';
import CodeBlockEditor from './WebsitePageEditor/BlockEditors/CodeBlockEditor';
import ButtonBlockEditor from './WebsitePageEditor/BlockEditors/ButtonBlockEditor';
import ArticlesBlockEditor from './WebsitePageEditor/BlockEditors/ArticlesBlockEditor';
import GalleryBlockEditor from './WebsitePageEditor/BlockEditors/GalleryBlockEditor';
import ResultsBlockEditor from './WebsitePageEditor/BlockEditors/ResultsBlockEditor';
import MembershipBlockEditor from './WebsitePageEditor/BlockEditors/MembershipBlockEditor';

interface ContentBlock {
  id: string;
  type: 'text' | 'image' | 'events' | 'code' | 'button' | 'articles' | 'gallery' | 'results' | 'membership';
  content: any;
  spacing?: {
    marginTop?: string;
    marginBottom?: string;
    paddingTop?: string;
    paddingBottom?: string;
  };
}

interface Column {
  id: string;
  width: string;
  blocks: ContentBlock[];
}

interface Section {
  id: string;
  type: 'regular' | 'full-width' | 'hero' | 'two-column' | 'three-column' | 'four-column';
  columns: Column[];
  settings: {
    backgroundColor?: string;
    backgroundImage?: string;
    marginTop?: string;
    marginBottom?: string;
    paddingTop?: string;
    paddingBottom?: string;
  };
}

interface Page {
  id: string;
  title: string;
  slug: string;
  sections: Section[];
}

interface WebsitePageEditorProps {
  onBack?: () => void;
}

const WebsitePageEditor: React.FC<WebsitePageEditorProps> = ({ onBack }) => {
  const [darkMode] = useState(false);
  const [page, setPage] = useState<Page>({
    id: '1',
    title: 'Sample Page',
    slug: 'sample-page',
    sections: [
      {
        id: 'hero-1',
        type: 'hero',
        columns: [{
          id: 'hero-col-1',
          width: 'full',
          blocks: []
        }],
        settings: {
          backgroundColor: '#1e40af',
          backgroundImage: 'https://images.pexels.com/photos/416978/pexels-photo-416978.jpeg?auto=compress&cs=tinysrgb&w=800',
          paddingTop: '4rem',
          paddingBottom: '4rem'
        }
      },
      {
        id: 'section-1',
        type: 'two-column',
        columns: [
          {
            id: 'col-1',
            width: '1/2',
            blocks: [
              {
                id: 'text-1',
                type: 'text',
                content: {
                  title: 'About Our Club',
                  text: 'This is a sample text block with rich text content. You can add more information about your club here.'
                }
              }
            ]
          },
          {
            id: 'col-2',
            width: '1/2',
            blocks: [
              {
                id: 'image-1',
                type: 'image',
                content: {
                  url: 'https://images.pexels.com/photos/416978/pexels-photo-416978.jpeg?auto=compress&cs=tinysrgb&w=800',
                  alt: 'Sample image',
                  caption: 'A beautiful day on the water'
                }
              }
            ]
          }
        ],
        settings: {}
      },
      {
        id: 'section-2',
        type: 'two-column',
        columns: [
          {
            id: 'col-3',
            width: '1/2',
            blocks: [
              {
                id: 'text-2',
                type: 'text',
                content: {
                  text: 'Enter your text here...'
                }
              }
            ]
          },
          {
            id: 'col-4',
            width: '1/2',
            blocks: []
          }
        ],
        settings: {}
      }
    ]
  });

  // New state for editing elements and sidebar
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingElementType, setEditingElementType] = useState<'section' | 'block' | null>(null);
  const [showSettingsSidebar, setShowSettingsSidebar] = useState<boolean>(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string>('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);

  const addSection = (type: Section['type']) => {
    const newSection: Section = {
      id: `section-${Date.now()}`,
      type,
      columns: getColumnsForSectionType(type),
      settings: {
        marginTop: '0',
        marginBottom: '0',
        marginLeft: '0',
        marginRight: '0',
        paddingTop: '2rem',
        paddingBottom: '2rem',
        paddingLeft: '0',
        paddingRight: '0'
      }
    };

    // Add background image for hero sections
    if (type === 'hero') {
      newSection.settings.backgroundImage = 'https://images.pexels.com/photos/163236/sailing-ship-vessel-boat-sea-163236.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1';
    }

    setPage(prev => ({
      ...prev,
      sections: [...prev.sections, newSection]
    }));
    
    setShowSectionModal(false);
  };

  const getColumnsForSectionType = (type: Section['type']): Column[] => {
    switch (type) {
      case 'regular':
      case 'full-width':
      case 'hero':
        return [{
          id: `col-${Date.now()}`,
          width: 'full',
          blocks: []
        }];
      case 'two-column':
        return [
          { id: `col-${Date.now()}-1`, width: '1/2', blocks: [] },
          { id: `col-${Date.now()}-2`, width: '1/2', blocks: [] }
        ];
      case 'three-column':
        return [
          { id: `col-${Date.now()}-1`, width: '1/3', blocks: [] },
          { id: `col-${Date.now()}-2`, width: '1/3', blocks: [] },
          { id: `col-${Date.now()}-3`, width: '1/3', blocks: [] }
        ];
      case 'four-column':
        return [
          { id: `col-${Date.now()}-1`, width: '1/4', blocks: [] },
          { id: `col-${Date.now()}-2`, width: '1/4', blocks: [] },
          { id: `col-${Date.now()}-3`, width: '1/4', blocks: [] },
          { id: `col-${Date.now()}-4`, width: '1/4', blocks: [] }
        ];
      default:
        return [];
    }
  };

  const addContentBlock = (columnId: string, blockType: ContentBlock['type']) => {
    const newBlock: ContentBlock = {
      id: `block-${Date.now()}`,
      type: blockType,
      content: getDefaultContentForBlockType(blockType),
      spacing: {
        marginTop: '0',
        marginBottom: '0',
        marginLeft: '0',
        marginRight: '0',
        paddingTop: '0',
        paddingBottom: '0',
        paddingLeft: '0',
        paddingRight: '0'
      }
    };

    setPage(prev => ({
      ...prev,
      sections: prev.sections.map(section => ({
        ...section,
        columns: section.columns.map(column =>
          column.id === columnId
            ? { ...column, blocks: [...column.blocks, newBlock] }
            : column
        )
      }))
    }));

    // Automatically open the editor for the new block
    setEditingElementId(newBlock.id);
    setEditingElementType('block');
    setShowSettingsSidebar(true);
  };

  const getDefaultContentForBlockType = (type: ContentBlock['type']) => {
    switch (type) {
      case 'text':
        return { title: '', text: '<p>Enter your text here...</p>' };
      case 'image':
        return { url: '', alt: '', caption: '' };
      case 'events':
        return { title: 'Upcoming Events', count: 3, format: 'list' };
      case 'code':
        return { html: '<div>Custom HTML content</div>' };
      case 'button':
        return { label: 'Click Me', url: '#', style: 'primary', size: 'medium', align: 'left' };
      case 'articles':
        return { title: 'Latest News', count: 3, category: '', displayImage: true };
      case 'gallery':
        return { title: 'Event Gallery', eventId: '', maxImages: 6, layout: 'grid' };
      case 'results':
        return { title: 'Race Results', eventId: '', showPodium: true };
      case 'membership':
        return { title: 'Join Our Club', description: 'Become a member today!', buttonLabel: 'Join Now', buttonUrl: '/membership' };
      default:
        return {};
    }
  };

  const editBlock = (block: ContentBlock) => {
    setEditingElementId(block.id);
    setEditingElementType('block');
    setShowSettingsSidebar(true);
  };

  const editSection = (section: Section) => {
    setEditingElementId(section.id);
    setEditingElementType('section');
    setShowSettingsSidebar(true);
  };

  const saveBlockEdit = (blockId: string, updatedContent: any) => {
    setPage(prev => ({
      ...prev,
      sections: prev.sections.map(section => ({
        ...section,
        columns: section.columns.map(column => ({
          ...column,
          blocks: column.blocks.map(block =>
            block.id === blockId
              ? { ...block, content: updatedContent }
              : block
          )
        }))
      }))
    }));

    // Close the sidebar
    setEditingElementId(null);
    setEditingElementType(null);
    setShowSettingsSidebar(false);
  };

  const saveSectionEdit = (sectionId: string, updatedSettings: any) => {
    setPage(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? { ...section, settings: updatedSettings }
          : section
      )
    }));

    // Close the sidebar
    setEditingElementId(null);
    setEditingElementType(null);
    setShowSettingsSidebar(false);
  };

  const deleteBlock = (blockId: string) => {
    setPage(prev => ({
      ...prev,
      sections: prev.sections.map(section => ({
        ...section,
        columns: section.columns.map(column => ({
          ...column,
          blocks: column.blocks.filter(block => block.id !== blockId)
        }))
      }))
    }));

    // If the deleted block was being edited, close the sidebar
    if (editingElementId === blockId) {
      setEditingElementId(null);
      setEditingElementType(null);
      setShowSettingsSidebar(false);
    }
  };

  const moveSection = (sectionId: string, direction: 'up' | 'down') => {
    setPage(prev => {
      const sections = [...prev.sections];
      const index = sections.findIndex(s => s.id === sectionId);
      
      if (direction === 'up' && index > 0) {
        [sections[index], sections[index - 1]] = [sections[index - 1], sections[index]];
      } else if (direction === 'down' && index < sections.length - 1) {
        [sections[index], sections[index + 1]] = [sections[index + 1], sections[index]];
      }
      
      return { ...prev, sections };
    });
  };

  const deleteSection = (sectionId: string) => {
    setPage(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== sectionId)
    }));

    // If the deleted section was being edited, close the sidebar
    if (editingElementId === sectionId) {
      setEditingElementId(null);
      setEditingElementType(null);
      setShowSettingsSidebar(false);
    }
  };

  const renderBlock = (block: ContentBlock) => {
    switch (block.type) {
      case 'text':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-50 text-slate-800'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} 1rem ${block.spacing?.paddingBottom || '1rem'} 1rem`
              }}
            >
              {block.content.title && (
                <h3 className="text-lg font-semibold mb-2">{block.content.title}</h3>
              )}
              <div dangerouslySetInnerHTML={{ __html: block.content.text }} />
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} ${block.spacing?.paddingRight || '1rem'} ${block.spacing?.paddingBottom || '1rem'} ${block.spacing?.paddingLeft || '1rem'}`
              }}
            >
              {block.content.url ? (
                <div>
                  <img
                    src={block.content.url}
                    alt={block.content.alt}
                    className="w-full h-auto rounded-lg"
                  />
                  {block.content.caption && (
                    <p className={`mt-2 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      {block.content.caption}
                    </p>
                  )}
                </div>
              ) : (
                <div className={`h-32 flex items-center justify-center border-2 border-dashed rounded-lg ${
                  darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-300 text-slate-500'
                }`}>
                  Click edit to add an image
                </div>
              )}
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );

      case 'events':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} ${block.spacing?.paddingRight || '1rem'} ${block.spacing?.paddingBottom || '1rem'} ${block.spacing?.paddingLeft || '1rem'}`
              }}
            >
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {block.content.title}
              </h3>
              <div className="space-y-3">
                {[0, 1, 2].slice(0, block.content.count).map((i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border transition-colors
                      ${darkMode
                        ? 'bg-slate-700 text-slate-200 border border-slate-600'
                        : 'bg-white text-slate-800 border border-slate-200'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium">Sample Event {i + 1}</h4>
                      <span className={`text-sm px-2 py-1 rounded ${
                        darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
                      }`}>
                        Dec {15 + i}
                      </span>
                    </div>
                    {i !== 2 && (
                      <div className="flex items-center gap-1 text-slate-400">
                        <MapPin size={14} />
                        <span className="text-sm">Sample Venue</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );

      case 'code':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} ${block.spacing?.paddingRight || '1rem'} ${block.spacing?.paddingBottom || '1rem'} ${block.spacing?.paddingLeft || '1rem'}`
              }}
            >
              <div dangerouslySetInnerHTML={{ __html: block.content.html }} />
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      
      case 'button':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} ${block.spacing?.paddingRight || '1rem'} ${block.spacing?.paddingBottom || '1rem'} ${block.spacing?.paddingLeft || '1rem'}`
              }}
            >
              <div className={`flex ${block.content.align === 'center' ? 'justify-center' : block.content.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                <a 
                  href={block.content.url || '#'} 
                  className={`
                    inline-block rounded-lg font-medium transition-colors
                    ${block.content.size === 'small' ? 'px-3 py-1.5 text-sm' : block.content.size === 'large' ? 'px-6 py-3 text-lg' : 'px-4 py-2 text-base'}
                    ${block.content.style === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700' : 
                      block.content.style === 'secondary' ? 'bg-slate-600 text-white hover:bg-slate-700' : 
                      block.content.style === 'outline' ? 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50' : 
                      'bg-transparent text-blue-600 hover:underline'}
                  `}
                >
                  {block.content.label || 'Button'}
                </a>
              </div>
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
        
      case 'articles':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} ${block.spacing?.paddingRight || '1rem'} ${block.spacing?.paddingBottom || '1rem'} ${block.spacing?.paddingLeft || '1rem'}`
              }}
            >
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {block.content.title || 'Latest Articles'}
              </h3>
              <div className="space-y-4">
                {[1, 2, 3].slice(0, block.content.count || 3).map((i) => (
                  <div 
                    key={i}
                    className={`
                      p-4 rounded-lg border flex gap-4
                      ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                    `}
                  >
                    {block.content.displayImage && (
                      <div className="w-20 h-20 bg-slate-300 rounded-lg flex-shrink-0"></div>
                    )}
                    <div>
                      <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                        Article Title {i}
                      </h4>
                      <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit...
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          July 14, 2025
                        </span>
                        <span className="text-blue-500 text-xs">Read More →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
        
      case 'gallery':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} ${block.spacing?.paddingRight || '1rem'} ${block.spacing?.paddingBottom || '1rem'} ${block.spacing?.paddingLeft || '1rem'}`
              }}
            >
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {block.content.title || 'Event Gallery'}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: block.content.maxImages || 6 }).map((_, i) => (
                  <div 
                    key={i}
                    className="aspect-square bg-slate-300 rounded-lg"
                  ></div>
                ))}
              </div>
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
        
      case 'results':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} ${block.spacing?.paddingRight || '1rem'} ${block.spacing?.paddingBottom || '1rem'} ${block.spacing?.paddingLeft || '1rem'}`
              }}
            >
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {block.content.title || 'Race Results'}
              </h3>
              
              {block.content.showPodium && (
                <div className="flex justify-center items-end mb-6 gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-slate-300 mb-2"></div>
                    <div className={`w-20 h-24 ${darkMode ? 'bg-slate-600' : 'bg-slate-200'} rounded-t-lg flex items-center justify-center`}>
                      <span className="text-2xl font-bold">2</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-slate-300 mb-2"></div>
                    <div className={`w-20 h-32 ${darkMode ? 'bg-slate-600' : 'bg-slate-200'} rounded-t-lg flex items-center justify-center`}>
                      <span className="text-2xl font-bold">1</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-slate-300 mb-2"></div>
                    <div className={`w-20 h-20 ${darkMode ? 'bg-slate-600' : 'bg-slate-200'} rounded-t-lg flex items-center justify-center`}>
                      <span className="text-2xl font-bold">3</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className={`rounded-lg overflow-hidden border ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
                <div className={`p-3 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'} border-b ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-1 font-medium text-center">Pos</div>
                    <div className="col-span-5 font-medium">Skipper</div>
                    <div className="col-span-2 font-medium text-center">Sail #</div>
                    <div className="col-span-2 font-medium text-center">Club</div>
                    <div className="col-span-2 font-medium text-center">Points</div>
                  </div>
                </div>
                
                {[1, 2, 3, 4, 5].map(i => (
                  <div 
                    key={i}
                    className={`p-3 border-b last:border-b-0 ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}
                  >
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-1 text-center">{i}</div>
                      <div className="col-span-5">Skipper Name {i}</div>
                      <div className="col-span-2 text-center">#{10 + i}</div>
                      <div className="col-span-2 text-center">LMRYC</div>
                      <div className="col-span-2 text-center">{i * 2}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
        
      case 'membership':
        return (
          <div className="group relative" style={{
            marginTop: block.spacing?.marginTop || '0',
            marginBottom: block.spacing?.marginBottom || '0',
            marginLeft: block.spacing?.marginLeft || '0',
            marginRight: block.spacing?.marginRight || '0'
          }}>
            <div className={`rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}
              style={{
                padding: `${block.spacing?.paddingTop || '1rem'} ${block.spacing?.paddingRight || '1rem'} ${block.spacing?.paddingBottom || '1rem'} ${block.spacing?.paddingLeft || '1rem'}`
              }}
            >
              <div className="text-center p-6">
                <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {block.content.title || 'Join Our Club'}
                </h3>
                <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  {block.content.description || 'Become a member today and enjoy all the benefits of our club.'}
                </p>
                <a 
                  href={block.content.buttonUrl || '/membership'} 
                  className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  {block.content.buttonLabel || 'Join Now'}
                </a>
              </div>
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => editBlock(block)}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Find the block or section being edited
  const findEditingBlock = (): ContentBlock | null => {
    if (editingElementType !== 'block' || !editingElementId) return null;
    
    for (const section of page.sections) {
      for (const column of section.columns) {
        const block = column.blocks.find(b => b.id === editingElementId);
        if (block) return block;
      }
    }
    
    return null;
  };

  const findEditingSection = (): Section | null => {
    if (editingElementType !== 'section' || !editingElementId) return null;
    return page.sections.find(s => s.id === editingElementId) || null;
  };

  const editingBlock = findEditingBlock();
  const editingSection = findEditingSection();

  return (
    <div className={`h-full overflow-y-auto ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`}>
      {/* Header */}
      <div className={`border-b ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
        <div className="px-16 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft size={20} />
                  Back
                </button>
              )}
              <Edit className="text-blue-500" size={24} />
              <h1 className="text-xl font-semibold">Edit: {page.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowPreviewModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600"
              >
                <Eye size={16} />
                Preview
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                <Save size={16} />
                Save Page
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Page Title */}
      <div className="px-16 py-6">
        <h2 className="text-2xl font-bold mb-6">{page.title}</h2>
      </div>

      {/* Page Content */}
      <div className="px-16 pb-8">
        <div className="space-y-6">
          {page.sections.map((section, sectionIndex) => (
            <div
              key={section.id}
              className="group relative border-2 border-dashed border-blue-300 rounded-lg p-4"
              style={{
                backgroundColor: section.settings.backgroundColor,
                backgroundImage: section.type === 'hero' && section.settings.backgroundImage ? 
                  `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(${section.settings.backgroundImage})` :
                  undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                marginTop: section.settings.marginTop,
                marginBottom: section.settings.marginBottom,
                marginLeft: section.settings.marginLeft,
                marginRight: section.settings.marginRight,
                paddingTop: section.settings.paddingTop,
                paddingBottom: section.settings.paddingBottom,
                paddingLeft: section.settings.paddingLeft,
                paddingRight: section.settings.paddingRight
              }}
            >
              {/* Section Controls */}
              <div className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-1">
                <button
                  onClick={() => editSection(section)}
                  className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 shadow-lg"
                  title="Edit Section"
                >
                  <Settings size={16} />
                </button>
                <button
                  onClick={() => moveSection(section.id, 'up')}
                  disabled={sectionIndex === 0}
                  className={`p-2 rounded-full shadow-lg ${
                    sectionIndex === 0
                      ? 'bg-slate-400 text-slate-200 cursor-not-allowed'
                      : 'bg-slate-600 text-white hover:bg-slate-700'
                  }`}
                  title="Move Up"
                >
                  <MoveUp size={16} />
                </button>
                <button
                  onClick={() => moveSection(section.id, 'down')}
                  disabled={sectionIndex === page.sections.length - 1}
                  className={`p-2 rounded-full shadow-lg ${
                    sectionIndex === page.sections.length - 1
                      ? 'bg-slate-400 text-slate-200 cursor-not-allowed'
                      : 'bg-slate-600 text-white hover:bg-slate-700'
                  }`}
                  title="Move Down"
                >
                  <MoveDown size={16} />
                </button>
                <button
                  onClick={() => deleteSection(section.id)}
                  className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                  title="Delete Section"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Section Header */}
              <div className="flex items-center justify-between mb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2">
                  <Settings size={16} className="text-blue-500" />
                  <span className="text-sm font-medium text-blue-600">
                    {section.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Section
                  </span>
                </div>
              </div>

              {/* Section Content */}
              {section.type === 'hero' && (
                <div className="text-center py-16">
                  <h1 className="text-4xl font-bold text-white mb-4">Welcome to Our Club</h1>
                  <p className="text-xl text-white/90">Join us for exciting events and races throughout the year</p>
                </div>
              )}

              <div className={`grid gap-4 ${
                section.type === 'two-column' ? 'grid-cols-2' :
                section.type === 'three-column' ? 'grid-cols-3' :
                section.type === 'four-column' ? 'grid-cols-4' :
                'grid-cols-1'
              }`}>
                {section.columns.map((column) => (
                  <div key={column.id} className="space-y-4">
                    {column.blocks.map((block) => (
                      <div key={block.id}>
                        {renderBlock(block)}
                      </div>
                    ))}
                    
                    {/* Add Content Block Button */}
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                      <button
                        onClick={() => {
                          setSelectedColumnId(column.id);
                          setShowBlockModal(true);
                        }}
                        className="flex items-center gap-2 mx-auto px-4 py-2 text-slate-500 hover:text-slate-700"
                      >
                        <Plus size={16} />
                        Add Content Block
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add Section Button */}
          <div className="text-center py-8 relative">
            <button 
              onClick={() => setShowSectionModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus size={16} />
              Add Section
            </button>
          </div>
        </div>
      </div>

      {/* Visual Section Selector Modal */}
      {showSectionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`
            w-full max-w-2xl rounded-lg shadow-xl overflow-hidden
            ${darkMode ? 'bg-slate-800' : 'bg-white'}
          `}>
            <div className={`
              bg-purple-600 text-white p-4 flex items-center justify-between
            `}>
              <h3 className="text-xl font-semibold">Insert Section</h3>
              <button
                onClick={() => setShowSectionModal(false)}
                className="text-white hover:text-white/80"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-3 gap-6">
                {/* Regular Section */}
                <button
                  onClick={() => addSection('regular')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-full h-20 bg-teal-500 rounded-lg flex items-center justify-center group-hover:bg-teal-400 transition-colors">
                    <div className="w-3/4 h-12 bg-white/30 rounded"></div>
                  </div>
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Regular Section
                  </span>
                </button>
                
                {/* Full Width Section */}
                <button
                  onClick={() => addSection('full-width')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-full h-20 bg-teal-500 rounded-lg flex items-center justify-center group-hover:bg-teal-400 transition-colors">
                    <div className="w-full h-12 bg-white/30 rounded mx-2"></div>
                  </div>
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Full Width Section
                  </span>
                </button>
                
                {/* Hero Section */}
                <button
                  onClick={() => addSection('hero')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-full h-20 bg-teal-500 rounded-lg flex items-center justify-center group-hover:bg-teal-400 transition-colors">
                    <div className="w-1/2 h-8 bg-white/30 rounded"></div>
                  </div>
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Hero Section
                  </span>
                </button>
                
                {/* Two Column Section */}
                <button
                  onClick={() => addSection('two-column')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-full h-20 bg-teal-500 rounded-lg flex items-center justify-center gap-1 px-2 group-hover:bg-teal-400 transition-colors">
                    <div className="w-1/2 h-16 bg-white/30 rounded"></div>
                    <div className="w-1/2 h-16 bg-white/30 rounded"></div>
                  </div>
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Two Column Section
                  </span>
                </button>
                
                {/* Three Column Section */}
                <button
                  onClick={() => addSection('three-column')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-full h-20 bg-teal-500 rounded-lg flex items-center justify-center gap-1 px-2 group-hover:bg-teal-400 transition-colors">
                    <div className="w-1/3 h-16 bg-white/30 rounded"></div>
                    <div className="w-1/3 h-16 bg-white/30 rounded"></div>
                    <div className="w-1/3 h-16 bg-white/30 rounded"></div>
                  </div>
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Three Column Section
                  </span>
                </button>
                
                {/* Four Column Section */}
                <button
                  onClick={() => addSection('four-column')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-full h-20 bg-teal-500 rounded-lg flex items-center justify-center gap-1 px-1 group-hover:bg-teal-400 transition-colors">
                    <div className="w-1/4 h-16 bg-white/30 rounded"></div>
                    <div className="w-1/4 h-16 bg-white/30 rounded"></div>
                    <div className="w-1/4 h-16 bg-white/30 rounded"></div>
                    <div className="w-1/4 h-16 bg-white/30 rounded"></div>
                  </div>
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Four Column Section
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block Type Selection Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`w-full max-w-3xl mx-4 rounded-lg overflow-hidden ${
            darkMode ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'
          }`}>
            <div className="p-4 bg-purple-600 text-white">
              <h3 className="text-xl font-semibold">Choose Content Block Type</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'text');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-blue-500/20">
                  <FileText size={24} className="text-blue-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Text Block</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Add text content with formatting</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'image');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-green-500/20">
                  <Image size={24} className="text-green-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Image Block</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Add images with captions</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'button');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-amber-500/20">
                  <MousePointer size={24} className="text-amber-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Button</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Add a call-to-action button</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'events');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-purple-500/20">
                  <Calendar size={24} className="text-purple-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Events Block</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Display upcoming events</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'articles');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-indigo-500/20">
                  <FileText size={24} className="text-indigo-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Articles Feed</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Display latest club news</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'gallery');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-rose-500/20">
                  <Camera size={24} className="text-rose-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Gallery</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Display event photos</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'results');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-cyan-500/20">
                  <Trophy size={24} className="text-cyan-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Results</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Display race results and leaderboards</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'membership');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-emerald-500/20">
                  <Users size={24} className="text-emerald-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Membership</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Add membership sign-up options</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  addContentBlock(selectedColumnId, 'code');
                  setShowBlockModal(false);
                }}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-transform hover:scale-[1.02] ${
                  darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="p-3 rounded-lg bg-gray-500/20">
                  <CodeIcon size={24} className="text-gray-500" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">Custom Code</div>
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Add custom HTML/CSS/JS</div>
                </div>
              </button>
            </div>
            <div className="p-4 border-t border-slate-200 text-center">
              <button
                onClick={() => setShowBlockModal(false)}
                className="px-6 py-2 rounded-lg text-slate-500 hover:text-slate-700 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Sidebar */}
      {showSettingsSidebar && (
        <div className={`
          fixed top-0 right-0 bottom-0 w-96 z-50 shadow-xl transition-transform
          ${darkMode ? 'bg-slate-800 border-l border-slate-700' : 'bg-white border-l border-slate-200'}
        `}>
          <div className="h-full flex flex-col overflow-hidden">
            <div className="p-6 overflow-y-auto flex-1">
              {editingElementType === 'block' && editingBlock && (
                <BlockSettingsPanel
                  block={editingBlock}
                  onSave={(blockId, content) => {
                    saveBlockEdit(blockId, content);
                  }}
                  onClose={() => {
                    setEditingElementId(null);
                    setEditingElementType(null);
                    setShowSettingsSidebar(false);
                  }}
                  darkMode={darkMode}
                />
              )}
              
              {editingElementType === 'section' && editingSection && (
                <SectionSettingsPanel
                  section={editingSection}
                  onSave={saveSectionEdit}
                  onClose={() => {
                    setEditingElementId(null);
                    setEditingElementType(null);
                    setShowSettingsSidebar(false);
                  }}
                  darkMode={darkMode}
                />
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`
            w-full max-w-6xl h-[90vh] rounded-xl shadow-xl overflow-hidden flex flex-col
            ${darkMode ? 'bg-slate-800' : 'bg-white'}
          `}>
            <div className={`
              flex items-center justify-between p-4 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <div className="flex items-center gap-2">
                <Eye size={20} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
                <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Page Preview: {page.title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`
                    p-2 rounded-lg transition-colors
                    ${darkMode 
                      ? 'hover:bg-slate-700 text-slate-300' 
                      : 'hover:bg-slate-200 text-slate-600'}
                  `}
                  title="Open in new tab"
                >
                  <ExternalLink size={18} />
                </button>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className={`
                    p-2 rounded-lg transition-colors
                    ${darkMode 
                      ? 'hover:bg-slate-700 text-slate-300' 
                      : 'hover:bg-slate-200 text-slate-600'}
                  `}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="min-h-full">
                {/* Preview Content */}
                {page.sections.map((section) => (
                  <div
                    key={section.id}
                    style={{
                      marginTop: section.settings.marginTop,
                      marginBottom: section.settings.marginBottom,
                      marginLeft: section.settings.marginLeft,
                      marginRight: section.settings.marginRight,
                      backgroundColor: section.settings.backgroundColor,
                      backgroundImage: section.type === 'hero' && section.settings.backgroundImage ? 
                        `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(${section.settings.backgroundImage})` : 
                        undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      paddingTop: section.settings.paddingTop,
                      paddingBottom: section.settings.paddingBottom,
                      paddingLeft: section.settings.paddingLeft,
                      paddingRight: section.settings.paddingRight
                    }}
                  >
                    {section.type === 'hero' && (
                      <div className="text-center py-16 max-w-5xl mx-auto px-4">
                        <h1 className="text-4xl font-bold text-white mb-4">Welcome to Our Club</h1>
                        <p className="text-xl text-white/90">Join us for exciting events and races throughout the year</p>
                      </div>
                    )}
                    
                    <div className={`
                      max-w-7xl mx-auto px-4 grid gap-4
                      ${section.type === 'two-column' ? 'grid-cols-2' :
                        section.type === 'three-column' ? 'grid-cols-3' :
                        section.type === 'four-column' ? 'grid-cols-4' :
                        'grid-cols-1'}
                    `}>
                      {section.columns.map((column) => (
                        <div key={column.id} className="space-y-4">
                          {column.blocks.map((block) => {
                            switch (block.type) {
                              case 'text':
                                return (
                                  <div 
                                    key={block.id} 
                                    className="py-2"
                                    style={{
                                      marginTop: block.spacing?.marginTop || '0',
                                      marginBottom: block.spacing?.marginBottom || '0',
                                      marginLeft: block.spacing?.marginLeft || '0',
                                      marginRight: block.spacing?.marginRight || '0',
                                      paddingTop: block.spacing?.paddingTop || '0',
                                      paddingBottom: block.spacing?.paddingBottom || '0',
                                      paddingLeft: block.spacing?.paddingLeft || '0',
                                      paddingRight: block.spacing?.paddingRight || '0'
                                    }}
                                  >
                                    {block.content.title && (
                                      <h3 className="text-lg font-semibold mb-2">{block.content.title}</h3>
                                    )}
                                    <div dangerouslySetInnerHTML={{ __html: block.content.text }} />
                                  </div>
                                );
                              case 'image':
                                return (
                                  <div 
                                    key={block.id} 
                                    className="py-2"
                                    style={{
                                      marginTop: block.spacing?.marginTop || '0',
                                      marginBottom: block.spacing?.marginBottom || '0',
                                      marginLeft: block.spacing?.marginLeft || '0',
                                      marginRight: block.spacing?.marginRight || '0',
                                      paddingTop: block.spacing?.paddingTop || '0',
                                      paddingBottom: block.spacing?.paddingBottom || '0',
                                      paddingLeft: block.spacing?.paddingLeft || '0',
                                      paddingRight: block.spacing?.paddingRight || '0'
                                    }}
                                  >
                                    {block.content.url && (
                                      <div>
                                        <img
                                          src={block.content.url}
                                          alt={block.content.alt}
                                          className="w-full h-auto rounded-lg"
                                        />
                                        {block.content.caption && (
                                          <p className="mt-2 text-sm text-slate-600">
                                            {block.content.caption}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              case 'events':
                                return (
                                  <div 
                                    key={block.id} 
                                    className="py-2"
                                    style={{
                                      marginTop: block.spacing?.marginTop || '0',
                                      marginBottom: block.spacing?.marginBottom || '0',
                                      marginLeft: block.spacing?.marginLeft || '0',
                                      marginRight: block.spacing?.marginRight || '0',
                                      paddingTop: block.spacing?.paddingTop || '0',
                                      paddingBottom: block.spacing?.paddingBottom || '0',
                                      paddingLeft: block.spacing?.paddingLeft || '0',
                                      paddingRight: block.spacing?.paddingRight || '0'
                                    }}
                                  >
                                    <h3 className="text-lg font-semibold mb-4">
                                      {block.content.title}
                                    </h3>
                                    <div className="space-y-3">
                                      {[0, 1, 2].slice(0, block.content.count).map((i) => (
                                        <div
                                          key={i}
                                          className="p-3 rounded-lg border border-slate-200 bg-white"
                                        >
                                          <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-medium">Sample Event {i + 1}</h4>
                                            <span className="text-sm px-2 py-1 rounded bg-blue-100 text-blue-800">
                                              Dec {15 + i}
                                            </span>
                                          </div>
                                          {i !== 2 && (
                                            <div className="flex items-center gap-1 text-slate-500">
                                              <MapPin size={14} />
                                              <span className="text-sm">Sample Venue</span>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              case 'code':
                                return (
                                  <div 
                                    key={block.id} 
                                    className="py-2"
                                    style={{
                                      marginTop: block.spacing?.marginTop || '0',
                                      marginBottom: block.spacing?.marginBottom || '0',
                                      marginLeft: block.spacing?.marginLeft || '0',
                                      marginRight: block.spacing?.marginRight || '0',
                                      paddingTop: block.spacing?.paddingTop || '0',
                                      paddingBottom: block.spacing?.paddingBottom || '0',
                                      paddingLeft: block.spacing?.paddingLeft || '0',
                                      paddingRight: block.spacing?.paddingRight || '0'
                                    }}
                                  >
                                    <div dangerouslySetInnerHTML={{ __html: block.content.html }} />
                                  </div>
                                );
                              case 'button':
                                return (
                                  <div 
                                    key={block.id} 
                                    className="py-2"
                                    style={{
                                      marginTop: block.spacing?.marginTop || '0',
                                      marginBottom: block.spacing?.marginBottom || '0',
                                      marginLeft: block.spacing?.marginLeft || '0',
                                      marginRight: block.spacing?.marginRight || '0',
                                      paddingTop: block.spacing?.paddingTop || '0',
                                      paddingBottom: block.spacing?.paddingBottom || '0',
                                      paddingLeft: block.spacing?.paddingLeft || '0',
                                      paddingRight: block.spacing?.paddingRight || '0'
                                    }}
                                  >
                                    <div className={`flex ${block.content.align === 'center' ? 'justify-center' : block.content.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                                      <a 
                                        href={block.content.url || '#'} 
                                        className={`
                                          inline-block rounded-lg font-medium transition-colors
                                          ${block.content.size === 'small' ? 'px-3 py-1.5 text-sm' : block.content.size === 'large' ? 'px-6 py-3 text-lg' : 'px-4 py-2 text-base'}
                                          ${block.content.style === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700' : 
                                            block.content.style === 'secondary' ? 'bg-slate-600 text-white hover:bg-slate-700' : 
                                            block.content.style === 'outline' ? 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50' : 
                                            'bg-transparent text-blue-600 hover:underline'}
                                        `}
                                      >
                                        {block.content.label || 'Button'}
                                      </a>
                                    </div>
                                  </div>
                                );
                              case 'articles':
                              case 'gallery':
                              case 'results':
                              case 'membership':
                                return (
                                  <div 
                                    key={block.id} 
                                    className="py-2 text-center p-4 border border-dashed border-slate-300 rounded-lg"
                                    style={{
                                      marginTop: block.spacing?.marginTop || '0',
                                      marginBottom: block.spacing?.marginBottom || '0',
                                      marginLeft: block.spacing?.marginLeft || '0',
                                      marginRight: block.spacing?.marginRight || '0',
                                      paddingTop: block.spacing?.paddingTop || '0',
                                      paddingBottom: block.spacing?.paddingBottom || '0',
                                      paddingLeft: block.spacing?.paddingLeft || '0',
                                      paddingRight: block.spacing?.paddingRight || '0'
                                    }}
                                  >
                                    <p className="text-slate-500">
                                      {block.type.charAt(0).toUpperCase() + block.type.slice(1)} Block: {block.content.title || 'No title'}
                                    </p>
                                    <p className="text-sm text-slate-400">
                                      This block will display dynamic content from your Alfie PRO data
                                    </p>
                                  </div>
                                );
                              default:
                                return null;
                            }
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebsitePageEditor;